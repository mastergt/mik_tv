import { isIP } from 'node:net';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type {Request} from 'express';
import * as argon2 from 'argon2';
import { Db } from '../common/db';
import { LoggerService } from '../logger/logger.service';
import { ClientSession, issueSecret, issueToken, jsonObject, numId, onlyKeys, textValue, tokenHash } from './client-auth';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_RE=/^[A-Za-z0-9_-]{43}$/;
const fieldLimits:Record<string,number>={device_name:120,manufacturer:100,model:100,platform:50,os_version:80,app_version:80,lan_addr:45};

@Injectable()
export class ClientIdentityService {
  constructor(@Inject(Db) private readonly db:Db,@Inject(LoggerService) private readonly log:LoggerService){}
  private async session(c:any,terminalId:string,abonentId:string|null,req:Request):Promise<string> {
    const token=issueToken();
    await c.query(`INSERT INTO subscribers.terminal_sessions
      (terminal_id,abonent_id,auth_type,refresh_token_hash,expires_at,ip,user_agent)
      VALUES($1,$2,$3,$4,now()+interval '30 days',$5,$6)`,
      [terminalId,abonentId,abonentId===null?'guest':'local',tokenHash(token),req.socket.remoteAddress??null,
        (req.headers['user-agent']??'').slice(0,2000)]);
    return token;
  }
  async bootstrap(){
    const installation=await this.db.one<{installation_id:string;name:string}>(
      'SELECT installation_id::text,name FROM core.installation WHERE singleton=true');
    const providers=await this.db.rows(`SELECT slug,name FROM core.providers WHERE enabled ORDER BY name LIMIT 1000`);
    return {api_version:1,installation_id:installation?.installation_id,server_name:installation?.name,
      providers,features:{epg:true,messages:true,playback_leases:true,stream_protection:false}};
  }
  async register(raw:unknown,req:Request){
    const d=jsonObject(raw);
    onlyKeys(d,['device_uuid','provider_slug','device_secret','device_name','manufacturer','model','platform','os_version','app_version','lan_addr']);
    const uuid=textValue(d.device_uuid,'device_uuid',36)!;
    if(!UUID_RE.test(uuid))throw new BadRequestException('Invalid device_uuid');
    const slug=textValue(d.provider_slug,'provider_slug',100)!;
    const secret=d.device_secret===undefined?null:textValue(d.device_secret,'device_secret',100);
    if(secret&&!SECRET_RE.test(secret))throw new BadRequestException('Invalid device_secret');
    const metadata:Record<string,string|null>={};
    for(const [name,max] of Object.entries(fieldLimits)){
      metadata[name]=textValue(d[name],name,max,true);
    }
    if(metadata.lan_addr && !isIP(metadata.lan_addr))throw new BadRequestException('Invalid lan_addr');
    const ua=(req.headers['user-agent']??'').slice(0,2000);
    const result=await this.db.tx(async c=>{
      const p=(await c.query<{id:number}>(`SELECT id FROM core.providers WHERE slug=$1 AND enabled`,[slug])).rows[0];
      if(!p)throw new NotFoundException('Provider not available');
      const existing=(await c.query<{id:string;provider_id:number|null;enabled:boolean;secret_hash:string|null}>(`
        SELECT t.id::text,t.provider_id,t.enabled,tc.secret_hash
        FROM subscribers.terminals t LEFT JOIN subscribers.terminal_credentials tc ON tc.terminal_id=t.id
        WHERE t.device_uuid=$1 FOR UPDATE OF t`,[uuid])).rows[0];
      let terminalId:string;
      let firstSecret:string|null=null;
      if(existing){
        if(!existing.enabled)throw new ForbiddenException('Device disabled');
        if(existing.provider_id!==p.id)throw new ConflictException('Device belongs to another provider');
        if(!existing.secret_hash)throw new ConflictException('Existing device must be enrolled by administrator');
        if(!secret||tokenHash(secret)!==existing.secret_hash)throw new UnauthorizedException('Invalid device credentials');
        terminalId=existing.id;
        await c.query(`UPDATE subscribers.terminal_credentials SET last_used_at=now() WHERE terminal_id=$1`,[terminalId]);
        await c.query(`UPDATE subscribers.terminals SET
          device_name=COALESCE($2,device_name),manufacturer=COALESCE($3,manufacturer),
          model=COALESCE($4,model),platform=COALESCE($5,platform),
          os_version=COALESCE($6,os_version),app_version=COALESCE($7,app_version),
          lan_addr=COALESCE($8,lan_addr),wan_addr=$9,last_activity=now(),useragent=$10 WHERE id=$1`,
          [terminalId,metadata.device_name,metadata.manufacturer,metadata.model,metadata.platform,
            metadata.os_version,metadata.app_version,metadata.lan_addr,req.socket.remoteAddress??null,ua]);
      }else{
        firstSecret=issueSecret();
        const inserted=(await c.query<{id:string}>(`INSERT INTO subscribers.terminals
          (device_uuid,provider_id,device_name,manufacturer,model,platform,os_version,app_version,lan_addr,wan_addr,useragent)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text id`,
          [uuid,p.id,metadata.device_name,metadata.manufacturer,metadata.model,metadata.platform,
            metadata.os_version,metadata.app_version,metadata.lan_addr,req.socket.remoteAddress??null,ua])).rows[0];
        terminalId=inserted.id;
        await c.query(`INSERT INTO subscribers.terminal_credentials(terminal_id,secret_hash) VALUES($1,$2)`,
          [terminalId,tokenHash(firstSecret)]);
      }
      // Only one valid API session per terminal. A guest session cannot inherit abonent access.
      await c.query(`UPDATE subscribers.terminal_sessions SET revoked_at=now(),ended_at=now()
        WHERE terminal_id=$1 AND revoked_at IS NULL AND ended_at IS NULL`,[terminalId]);
      await c.query(`UPDATE subscribers.playback_sessions SET ended_at=now(),status='stopped'
        WHERE id IN (SELECT playback_history_id FROM subscribers.playback_leases WHERE terminal_id=$1)
          AND ended_at IS NULL`,[terminalId]);
      await c.query('DELETE FROM subscribers.playback_leases WHERE terminal_id=$1',[terminalId]);
      const token=await this.session(c,terminalId,null,req);
      return {terminal_id:terminalId,device_uuid:uuid,device_secret:firstSecret,
        client_token:token,expires_in:30*86400,authenticated:false};
    });
    this.log.info(`Client registered terminal=${result.terminal_id} provider=${slug}`,'ClientAPI');
    return result;
  }
  async login(ctx:ClientSession,raw:unknown,req:Request){
    const d=jsonObject(raw);onlyKeys(d,['username','password']);
    const username=textValue(d.username,'username',150)!;
    const password=textValue(d.password,'password',1024)!;
    const abonent=await this.db.one<{id:string;password_hash:string|null}>(`
      SELECT a.id::text,a.password_hash FROM subscribers.abonents a
      WHERE a.provider_id=$1 AND lower(a.username)=lower($2) AND a.enabled`,[ctx.provider_id,username]);
    if(!abonent?.password_hash||!(await argon2.verify(abonent.password_hash,password).catch(()=>false))) {
      this.log.warn(`Subscriber login rejected terminal=${ctx.terminal_id}`,'ClientAPI');
      throw new UnauthorizedException('Invalid credentials');
    }
    try{
      return await this.db.tx(async c=>{
        await c.query('SELECT id FROM subscribers.terminals WHERE id=$1 FOR UPDATE',[ctx.terminal_id]);
        const session=(await c.query(`SELECT 1 FROM subscribers.terminal_sessions
          WHERE id=$1 AND revoked_at IS NULL AND ended_at IS NULL AND expires_at>now()`,[ctx.session_id])).rowCount;
        if(!session)throw new UnauthorizedException('Session revoked');
        const bound=(await c.query<{abonent_id:string|null}>(`SELECT abonent_id::text FROM subscribers.terminals WHERE id=$1`,[ctx.terminal_id])).rows[0];
        if(bound?.abonent_id&&bound.abonent_id!==abonent.id)
          throw new ConflictException('Device bound to another subscriber; log out first');
        await c.query('UPDATE subscribers.terminals SET abonent_id=$1,provider_id=$2,last_activity=now() WHERE id=$3',
          [abonent.id,ctx.provider_id,ctx.terminal_id]);
        // Stop earlier guest sessions before issuing authenticated credentials.
        await c.query(`UPDATE subscribers.terminal_sessions SET revoked_at=now(),ended_at=now()
          WHERE terminal_id=$1 AND revoked_at IS NULL AND ended_at IS NULL`,[ctx.terminal_id]);
        const token=await this.session(c,ctx.terminal_id,abonent.id,req);
        await c.query('UPDATE subscribers.abonents SET last_login_at=now() WHERE id=$1',[abonent.id]);
        return {client_token:token,authenticated:true,abonent_id:abonent.id,expires_in:30*86400};
      });
    }catch(e){
      if((e as {code?:string}).code==='23514')throw new ConflictException('Subscriber terminal limit reached');
      throw e;
    }
  }
  async renew(ctx:ClientSession,req:Request){
    return this.db.tx(async c=>{
      const r=(await c.query(`SELECT id FROM subscribers.terminal_sessions
        WHERE id=$1 AND terminal_id=$2 AND revoked_at IS NULL AND ended_at IS NULL
          AND expires_at>now() FOR UPDATE`,[ctx.session_id,ctx.terminal_id])).rows[0];
      if(!r)throw new UnauthorizedException('Session revoked');
      await c.query(`UPDATE subscribers.terminal_sessions SET revoked_at=now(),ended_at=now()
        WHERE id=$1`,[ctx.session_id]);
      const token=await this.session(c,ctx.terminal_id,ctx.abonent_id,req);
      return {client_token:token,authenticated:ctx.abonent_id!==null,expires_in:30*86400};
    });
  }
  async me(ctx:ClientSession){
    if(!ctx.abonent_id)return {authenticated:false,device_uuid:ctx.device_uuid,provider_id:ctx.provider_id};
    const a=await this.db.one(`SELECT id::text id,username,display_name,contract_number,
      balance_kopecks,balance_synced_at,
      terminal_limit_override,concurrent_stream_limit_override FROM subscribers.abonents WHERE id=$1`,[ctx.abonent_id]);
    return {authenticated:true,device_uuid:ctx.device_uuid,provider_id:ctx.provider_id,abonent:a};
  }
  async logout(ctx:ClientSession){
    await this.db.tx(async c=>{
      await c.query('SELECT id FROM subscribers.terminals WHERE id=$1 FOR UPDATE',[ctx.terminal_id]);
      await c.query(`UPDATE subscribers.playback_sessions SET ended_at=now(),status='stopped'
        WHERE id IN (SELECT playback_history_id FROM subscribers.playback_leases WHERE terminal_id=$1)
          AND ended_at IS NULL`,[ctx.terminal_id]);
      await c.query('DELETE FROM subscribers.playback_leases WHERE terminal_id=$1',[ctx.terminal_id]);
      await c.query(`UPDATE subscribers.terminal_sessions SET revoked_at=now(),ended_at=now()
        WHERE terminal_id=$1 AND revoked_at IS NULL AND ended_at IS NULL`,[ctx.terminal_id]);
      if(ctx.abonent_id){
        await c.query('UPDATE subscribers.terminals SET abonent_id=NULL WHERE id=$1',[ctx.terminal_id]);
      }
    });
    return {ok:true,need_reregister:true};
  }
  async heartbeat(ctx:ClientSession){
    await this.db.rows(`UPDATE subscribers.terminals SET last_activity=now()
      WHERE id=$1 AND last_activity<now()-interval '3 minutes'`,[ctx.terminal_id]);
    await this.db.rows(`UPDATE subscribers.terminal_sessions SET last_seen_at=now()
      WHERE id=$1 AND last_seen_at<now()-interval '3 minutes'`,[ctx.session_id]);
    return {ok:true};
  }
}
