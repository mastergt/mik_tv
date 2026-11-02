import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../common/db';
import { Audit } from '../common/audit';
import { Authz, Actor } from '../auth/authz';
import { ProviderDto } from '../common/dto';
import { dto } from '../common/validate';
import { dbError, intId, page } from '../common/http';
import { only, sqlInsert, sqlUpdate } from '../common/sql';

const columns=['name','slug','enabled','timezone','default_terminal_limit','default_concurrent_stream_limit',
  'playback_history_enabled','stream_monitoring_enabled'];
const selection=`p.*, CASE WHEN p.logo_sha IS NULL THEN NULL ELSE '/api/v1/providers/logos/'||p.logo_sha||'.png' END AS logo_url, ARRAY(SELECT n.network::text FROM core.provider_ip_ranges n
  WHERE n.provider_id=p.id ORDER BY family(n.network), masklen(n.network) DESC, n.network::text) AS networks`;

/** Validates IPv4/IPv6 host/CIDR notation before passing inet conversion to PostgreSQL. */
export function validateNetworks(networks:string[]|undefined):string[]|undefined {
  if(networks===undefined)return undefined;
  if(!Array.isArray(networks) || networks.length>256)throw new BadRequestException('Invalid provider networks');
  return networks.map(value=>{
    if(typeof value!=='string' || value.length>100)throw new BadRequestException('Invalid CIDR');
    const raw=value.trim();
    const match=/^([^/]+)(?:\/([0-9]{1,3}))?$/.exec(raw);
    const kind=match?isIP(match[1]):0;
    const prefix=match?.[2]===undefined?(kind===4?32:128):Number(match[2]);
    if(!kind || !Number.isInteger(prefix) || prefix<0 || prefix>(kind===4?32:128))
      throw new BadRequestException('Invalid IPv4/IPv6 CIDR: '+raw);
    return match![1]+'/'+prefix;
  });
}

@Injectable()
export class ProvidersService {
  constructor(@Inject(Db) private readonly db:Db, @Inject(Audit) private readonly audit:Audit, @Inject(Authz) private readonly authz:Authz){}

  private readonly logoDir=resolve(process.env.PROVIDER_LOGO_DIR||'./storage/provider-logos');
  async uploadLogo(actor:Actor,id:string,raw:unknown) {
    const pid=Number(intId(id)); await this.authz.global(actor,'providers.write');
    const source=(raw as Record<string,unknown>|null)?.image_base64;
    if(typeof source!=='string'||source.length>700000||!/^[A-Za-z0-9+/]+={0,2}$/.test(source))throw new BadRequestException('Invalid PNG payload');
    const file=Buffer.from(source,'base64');
    if(file.length<33||file.length>500*1024||file.toString('hex',0,8)!=='89504e470d0a1a0a'||file.toString('ascii',12,16)!=='IHDR') throw new BadRequestException('PNG only, max 500 KB');
    const w=file.readUInt32BE(16),h=file.readUInt32BE(20);
    if(w<128||h<128||w>1024||h>1024||file.readUInt8(28)!==0)throw new BadRequestException('PNG dimensions must be 128-1024 px');
    const sha=createHash('sha256').update(file).digest('hex');
    await mkdir(this.logoDir,{recursive:true}); await writeFile(resolve(this.logoDir,sha+'.png'),file,{flag:'w'});
    const updated=await this.db.one('UPDATE core.providers SET logo_sha=$1,updated_by=$2 WHERE id=$3 RETURNING id',[sha,actor.id,pid]);
    if(!updated)throw new NotFoundException();
    return {logo_url:'/api/v1/providers/logos/'+sha+'.png'};
  }
  async removeLogo(actor:Actor,id:string) {
    const pid=Number(intId(id)); await this.authz.global(actor,'providers.write');
    const row=await this.db.one('UPDATE core.providers SET logo_sha=NULL,updated_by=$1 WHERE id=$2 RETURNING id',[actor.id,pid]);
    if(!row)throw new NotFoundException(); return {logo_url:null};
  }
  async logoFile(filename:string) {
    if(!/^[a-f0-9]{64}\\.png$/.test(filename))throw new NotFoundException();
    const found=await this.db.one('SELECT 1 FROM core.providers WHERE logo_sha=$1 LIMIT 1',[filename.slice(0,64)]);
    if(!found)throw new NotFoundException();
    try {return await readFile(resolve(this.logoDir,filename));}catch{throw new NotFoundException();}
  }
  async branding(providerId:number) {
    const row=await this.db.one<{name:string;logo_url:string|null}>(`SELECT name,CASE WHEN logo_sha IS NULL THEN NULL ELSE '/api/v1/providers/logos/'||logo_sha||'.png' END AS logo_url FROM core.providers WHERE id=$1 AND enabled`,[providerId]);
    if(!row)throw new NotFoundException(); return row;
  }

  async list(actor:Actor,query:{limit?:string;offset?:string}) {
    const {limit,offset}=page(query); const s=await this.authz.scope(actor,'providers.read');
    if (!s.global && !s.providers.length) return [];
    return this.db.rows(`SELECT ${selection} FROM core.providers p WHERE ($1::boolean OR p.id=ANY($2::integer[]))
      ORDER BY p.id LIMIT $3 OFFSET $4`,[s.global,s.providers,limit,offset]);
  }
  async get(actor:Actor,id:string) {
    const pid=Number(intId(id)); await this.authz.provider(actor,'providers.read',pid);
    const row=await this.db.one(`SELECT ${selection} FROM core.providers p WHERE p.id=$1`,[pid]);
    if(!row) throw new NotFoundException();return row;
  }

  private async replaceNetworks(c:any,pid:number,networks:string[]|undefined) {
    if(networks===undefined)return;
    await c.query('DELETE FROM core.provider_ip_ranges WHERE provider_id=$1',[pid]);
    for(const network of networks) {
      await c.query(`INSERT INTO core.provider_ip_ranges(provider_id,network)
        VALUES($1,network($2::inet)::cidr)`,[pid,network]);
    }
  }

  async create(actor:Actor,raw:unknown) {
    await this.authz.global(actor,'providers.write');const v=dto(ProviderDto,raw);
    const networks=validateNetworks(v.networks);
    return this.db.tx(async c=>{
      try {
        // Serialize default-provider mutations across concurrent admin requests.
        await c.query('SELECT pg_advisory_xact_lock(763192, 1)');
        const data={...only(v,columns),created_by:actor.id,updated_by:actor.id};
        const query=sqlInsert('core.providers',data);
        const r=(await c.query(query.sql,query.values)).rows[0];
        if(v.is_default===true) {
          await c.query('UPDATE core.providers SET is_default=false WHERE is_default');
          await c.query('UPDATE core.providers SET is_default=true WHERE id=$1',[r.id]);
        }
        await this.replaceNetworks(c,r.id,networks);
        await this.audit.write(c,actor.id,'providers.create','core.providers',String(r.id),r.id,
          [...columns.filter(x=>x in v),...(networks===undefined?[]:['networks']),...(v.is_default===undefined?[]:['is_default'])]);
        return (await c.query(`SELECT ${selection} FROM core.providers p WHERE p.id=$1`,[r.id])).rows[0];
      } catch(e){dbError(e)}
    });
  }

  async update(actor:Actor,id:string,raw:unknown) {
    await this.authz.global(actor,'providers.write');const v=dto(ProviderDto,raw,true);
    const networks=validateNetworks(v.networks);
    const pid=intId(id);
    return this.db.tx(async c=>{
      try {
        await c.query('SELECT pg_advisory_xact_lock(763192, 1)');
        const data={...only(v,columns),updated_by:actor.id};
        const query=sqlUpdate('core.providers',data,pid);
        const r=(await c.query(query.sql,query.values)).rows[0];if(!r)throw new NotFoundException();
        if(v.is_default===true) {
          await c.query('UPDATE core.providers SET is_default=false WHERE is_default');
          await c.query('UPDATE core.providers SET is_default=true WHERE id=$1',[pid]);
        } else if(v.is_default===false) {
          await c.query('UPDATE core.providers SET is_default=false WHERE id=$1',[pid]);
        }
        await this.replaceNetworks(c,r.id,networks);
        await this.audit.write(c,actor.id,'providers.update','core.providers',pid,r.id,Object.keys(v));
        return (await c.query(`SELECT ${selection} FROM core.providers p WHERE p.id=$1`,[pid])).rows[0];
      }catch(e){dbError(e)}
    });
  }
}
