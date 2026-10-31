import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { Db } from '../common/db';
import { LoggerService } from '../logger/logger.service';
import { Actor } from './authz';
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import * as argon2 from 'argon2';
import { Response, Request } from 'express';

const issuer = 'iptv-admin';
const audience = 'iptv-admin-ui';
function b64(b: Buffer | string) { return Buffer.from(b).toString('base64url'); }
function sha(s: string) { return createHash('sha256').update(s).digest('hex'); }
function requiredSecret() {
  const s = process.env.JWT_SECRET ?? '';
  if (s.length < 32) throw new Error('JWT_SECRET must be 32+ characters');
  return s;
}
function cookieSecure() { return process.env.COOKIE_SECURE === 'true'; }
function cookieSettings(path: string, maxAge: number, sameSite: 'strict'|'lax' = 'strict') {
  return { httpOnly:true, secure:cookieSecure(), sameSite, path, maxAge } as const;
}
function clearCookie(res: Response, name: string, path: string) {
  res.clearCookie(name, cookieSettings(path, 0));
}
const refreshPath = '/api/v1/auth';
const oidcPath = '/api/v1/auth/oidc';

type OidcProvider = { id:number; code:string; issuer:string; client_id:string; secret_env_name:string|null };
type Discovery = { issuer:string; authorization_endpoint:string; token_endpoint:string; jwks_uri:string };
@Injectable()
export class AuthService {
  private readonly key = new TextEncoder().encode(requiredSecret());
  constructor(@Inject(Db) private readonly db: Db, @Inject(LoggerService) private readonly logger: LoggerService) {}

  async actorFromToken(token: string): Promise<Actor> {
    let payload: JWTPayload;
    try { ({payload} = await jwtVerify(token,this.key,{issuer,audience,algorithms:['HS256']})); }
    catch { throw new UnauthorizedException('Invalid or expired access token'); }
    if (typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) throw new UnauthorizedException();
    const user = await this.db.one<Actor & {status:string}>('SELECT id::text, username, display_name, status FROM auth.users WHERE id=$1',[payload.sub]);
    if (!user || user.status!=='active') throw new UnauthorizedException('Account is not active');
    return {id:user.id,username:user.username,display_name:user.display_name};
  }
  private async accessToken(id:string) {
    return new SignJWT({}).setProtectedHeader({alg:'HS256'}).setIssuer(issuer).setAudience(audience).setSubject(id).setIssuedAt().setExpirationTime('15m').sign(this.key);
  }
  async issueSession(id:string, res:Response, req:Request) {
    const refresh = b64(randomBytes(48));
    const userAgent = req.headers['user-agent'] ?? null;
    await this.db.rows(`INSERT INTO auth.user_sessions(user_id,refresh_token_hash,ip,user_agent,expires_at)
       VALUES($1,$2,$3,$4,now()+interval '30 days')`, [id,sha(refresh),req.socket.remoteAddress ?? null,userAgent]);
    res.cookie('iptv_admin_refresh', refresh, cookieSettings(refreshPath,30*86400*1000));
    return {access_token: await this.accessToken(id),token_type:'Bearer',expires_in:900};
  }
  async login(username:string, password:string, res:Response,req:Request) {
    if (typeof username!=='string' || username.length<1 || username.length>150 || typeof password!=='string' || password.length>1024)
      throw new UnauthorizedException('Invalid credentials');
    const user=await this.db.one<{id:string,password_hash:string|null,status:string}>(
      'SELECT id::text,password_hash,status FROM auth.users WHERE lower(username)=lower($1)',[username]);
    // No detailed account status information is exposed before successful authentication.
    if (!user?.password_hash || !(await argon2.verify(user.password_hash,password).catch(()=>false)) || user.status!=='active') {
      // Do not log passwords or whether a username exists.
      this.logger.warn('Administrator login rejected', 'AuthService');
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.db.rows('UPDATE auth.users SET last_login_at=now() WHERE id=$1',[user.id]);
    this.logger.info(`Administrator login succeeded, user_id=${user.id}`, 'AuthService');
    return this.issueSession(user.id,res,req);
  }
  async refresh(raw:unknown,res:Response,req:Request) {
    if (typeof raw!=='string' || raw.length<20) throw new UnauthorizedException('Missing refresh token');
    const next=b64(randomBytes(48));
    const user = await this.db.tx(async c=>{
      const r=await c.query<{user_id:string}>(`SELECT s.user_id::text FROM auth.user_sessions s
        JOIN auth.users u ON u.id=s.user_id WHERE refresh_token_hash=$1 AND expires_at>now()
        AND revoked_at IS NULL AND u.status='active' FOR UPDATE OF s`,[sha(raw)]);
      if (!r.rows[0]) throw new UnauthorizedException('Refresh token expired or revoked');
      await c.query('UPDATE auth.user_sessions SET revoked_at=now() WHERE refresh_token_hash=$1',[sha(raw)]);
      await c.query(`INSERT INTO auth.user_sessions(user_id,refresh_token_hash,ip,user_agent,expires_at)
        VALUES($1,$2,$3,$4,now()+interval '30 days')`,[r.rows[0].user_id,sha(next),req.socket.remoteAddress ?? null,req.headers['user-agent'] ?? null]);
      return r.rows[0].user_id;
    });
    res.cookie('iptv_admin_refresh',next,cookieSettings(refreshPath,30*86400*1000));
    return {access_token:await this.accessToken(user),token_type:'Bearer',expires_in:900};
  }
  async logout(raw:unknown,res:Response) {
    if (typeof raw==='string') await this.db.rows('UPDATE auth.user_sessions SET revoked_at=now() WHERE refresh_token_hash=$1',[sha(raw)]);
    clearCookie(res,'iptv_admin_refresh',refreshPath);
    return {ok:true};
  }
  // All OIDC providers must be explicitly registered by a trusted DB administrator.
  private async oidcProvider(code:string):Promise<OidcProvider> {
    const p=await this.db.one<OidcProvider>('SELECT id,code,issuer,client_id,secret_env_name FROM auth.oauth_providers WHERE code=$1 AND enabled=true',[code]);
    if(!p) throw new BadRequestException('Unknown or disabled OIDC provider');
    if(!p.issuer.startsWith('https://')) throw new BadRequestException('OIDC issuer must use HTTPS');
    return p;
  }
  private async discovery(p:OidcProvider):Promise<Discovery> {
    const url=p.issuer.replace(/\/$/,'')+'/.well-known/openid-configuration';
    const response=await fetch(url,{signal:AbortSignal.timeout(7000)});
    if(!response.ok) throw new BadRequestException('OIDC discovery failed');
    const json=await response.json() as Discovery;
    if(json.issuer!==p.issuer || ![json.authorization_endpoint,json.token_endpoint,json.jwks_uri].every(x=>typeof x==='string' && x.startsWith('https://')))
      throw new BadRequestException('Invalid OIDC metadata');
    return json;
  }
  private signedFlow(v:object) {
    const s=b64(JSON.stringify(v));
    return s+'.'+b64(createHmac('sha256',this.key).update(s).digest());
  }
  private verifyFlow(raw:string) {
    const [data,sig,extra]=raw.split('.');
    if(!data||!sig||extra) throw new UnauthorizedException('Bad OIDC state');
    const calc=createHmac('sha256',this.key).update(data).digest();
    const given=Buffer.from(sig,'base64url');
    if(given.length!==calc.length||!timingSafeEqual(given,calc)) throw new UnauthorizedException('Bad OIDC state signature');
    const parsed=JSON.parse(Buffer.from(data,'base64url').toString('utf8')) as {state:string,nonce:string,verifier:string,provider:string,issued:number};
    if(Date.now()-parsed.issued>10*60*1000||parsed.issued>Date.now()+10000) throw new UnauthorizedException('OIDC state expired');
    return parsed;
  }
  async oidcStart(code:string,res:Response) {
    const p=await this.oidcProvider(code);
    const d=await this.discovery(p);
    const state=b64(randomBytes(24)); const nonce=b64(randomBytes(24)); const verifier=b64(randomBytes(32));
    const challenge=b64(createHash('sha256').update(verifier).digest());
    const redirectUri=(process.env.PUBLIC_API_URL??'').replace(/\/$/,'')+`/auth/oidc/${encodeURIComponent(p.code)}/callback`;
    if(!redirectUri.startsWith('https://') && process.env.NODE_ENV==='production') throw new Error('PUBLIC_API_URL must use HTTPS in PROD');
    res.cookie('iptv_oidc_state',this.signedFlow({state,nonce,verifier,provider:code,issued:Date.now()}),cookieSettings(oidcPath,600000,'lax'));
    const url=new URL(d.authorization_endpoint);
    for(const [k,v] of Object.entries({response_type:'code',client_id:p.client_id,redirect_uri:redirectUri,scope:'openid profile email',state,nonce,code_challenge:challenge,code_challenge_method:'S256'}))
      url.searchParams.set(k,v);
    return res.redirect(302,url.toString());
  }
  async oidcCallback(code:string,state:string,authCode:string|undefined,rawFlow:unknown,res:Response,req:Request) {
    if(typeof rawFlow!=='string'||typeof authCode!=='string'||!authCode) throw new UnauthorizedException('OIDC callback missing state/code');
    const flow=this.verifyFlow(rawFlow);
    if(flow.provider!==code||state!==flow.state) throw new UnauthorizedException('OIDC state mismatch');
    clearCookie(res,'iptv_oidc_state',oidcPath);
    const p=await this.oidcProvider(code);
    const d=await this.discovery(p);
    const redirectUri=(process.env.PUBLIC_API_URL??'').replace(/\/$/,'')+`/auth/oidc/${encodeURIComponent(p.code)}/callback`;
    const params=new URLSearchParams({grant_type:'authorization_code',code:authCode,redirect_uri:redirectUri,client_id:p.client_id,code_verifier:flow.verifier});
    if(p.secret_env_name) {
      if(!/^[A-Z][A-Z0-9_]*$/.test(p.secret_env_name)) throw new BadRequestException('Invalid secret environment reference');
      const secret=process.env[p.secret_env_name];
      if(!secret) throw new Error(`Missing secret env for OIDC provider ${p.code}`);
      params.set('client_secret',secret);
    }
    const tokenRes=await fetch(d.token_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(7000)});
    if(!tokenRes.ok) throw new UnauthorizedException('OIDC token exchange failed');
    const tokens=await tokenRes.json() as {id_token?:string};
    if(typeof tokens.id_token!=='string') throw new UnauthorizedException('OIDC id_token missing');
    const {payload}=await jwtVerify(tokens.id_token,createRemoteJWKSet(new URL(d.jwks_uri)),{
      issuer:p.issuer,audience:p.client_id,clockTolerance:5
    });
    if(payload.nonce!==flow.nonce||typeof payload.sub!=='string') throw new UnauthorizedException('OIDC nonce invalid');
    const id=await this.db.tx(async c=>{
      const known=await c.query<{id:string,status:string}>(`SELECT u.id::text,u.status FROM auth.external_identities x JOIN auth.users u ON u.id=x.user_id
        WHERE x.issuer=$1 AND x.subject=$2`,[p.issuer,payload.sub]);
      if(known.rows[0]) return known.rows[0];
      const display=String(payload.name??payload.preferred_username??'OIDC user').slice(0,200);
      const user=await c.query<{id:string}>(`INSERT INTO auth.users(display_name,email,status) VALUES($1,$2,'pending') RETURNING id::text`,
        [display,typeof payload.email==='string'?payload.email:null]);
      await c.query(`INSERT INTO auth.external_identities(user_id,oauth_provider_id,issuer,subject) VALUES($1,$2,$3,$4)`,[user.rows[0].id,p.id,p.issuer,payload.sub]);
      return {id:user.rows[0].id,status:'pending'};
    });
    if(id.status!=='active') return res.redirect(302,(process.env.ADMIN_WEB_URL??'/')+'?login=pending');
    // A refresh cookie is issued. Access token retrieved via /auth/refresh by the same-origin SPA.
    await this.issueSession(id.id,res,req);
    return res.redirect(302,(process.env.ADMIN_WEB_URL??'/')+'?login=ok');
  }
}
