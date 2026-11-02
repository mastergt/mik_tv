import { isIP } from 'node:net';
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
const selection=`p.*, ARRAY(SELECT n.network::text FROM core.provider_ip_ranges n
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
