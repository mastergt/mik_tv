import { BadRequestException, ForbiddenException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Db } from '../common/db';
import { Authz, Actor } from '../auth/authz';
import { Audit } from '../common/audit';

function integer(value:unknown,name:string,min=1,max=2147483647):number {
  const n=Number(value);if(value===null||value===undefined||String(value)===''||!Number.isInteger(n)||n<min||n>max)throw new BadRequestException(`Invalid ${name}`);return n;
}
function optionalId(raw:unknown){return raw===undefined||raw===null||raw===''?null:integer(raw,'providerId');}
function text(raw:unknown,name:string,max=500,required=true):string|null {
  if(raw===null||raw===undefined||raw===''){if(required)throw new BadRequestException(`${name} required`);return null;}
  if(typeof raw!=='string'||!raw.trim()||raw.length>max)throw new BadRequestException(`Invalid ${name}`);
  return raw.trim();
}
function validateObj(raw:unknown):Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Expected JSON object');return raw as Record<string,unknown>;}
function pick(raw:Record<string,unknown>,allowed:string[]){for(const key of Object.keys(raw))if(!allowed.includes(key))throw new BadRequestException(`Unknown field ${key}`);}

@Injectable()
export class EpgService {
  constructor(@Inject(Db) private readonly db:Db,@Inject(Authz) private readonly authz:Authz,@Inject(Audit) private readonly audit:Audit){}
  private async readScope(actor:Actor,pid:unknown,permission='epg.read'){
    const scope=await this.authz.scope(actor,permission);const requested=optionalId(pid);
    if(requested!==null&&!scope.global&&!scope.providers.includes(requested))throw new ForbiddenException('Provider scope denied');
    if(requested===null&&!scope.global){
      if(scope.providers.length===1)return {pid:scope.providers[0],global:false};
      throw new ForbiddenException('Specify providerId for provider-scoped EPG access');
    }
    return {pid:requested,global:scope.global};
  }
  async sources(actor:Actor,pid?:string){
    const scope=await this.readScope(actor,pid);
    return this.db.rows(`SELECT s.*, (SELECT count(*)::int FROM epg.channels ch WHERE ch.source_id=s.id) channel_count,
      (SELECT count(*)::int FROM epg.import_jobs j WHERE j.source_id=s.id AND j.status IN ('running','queued')) running_jobs,
      coalesce((SELECT json_agg(sp.provider_id ORDER BY sp.provider_id) FROM epg.source_providers sp WHERE sp.source_id=s.id),'[]'::json) provider_ids
      FROM epg.sources s WHERE ($1::integer IS NULL OR s.visibility='all' OR EXISTS(
        SELECT 1 FROM epg.source_providers sp WHERE sp.source_id=s.id AND sp.provider_id=$1))
      ORDER BY s.name,s.id`,[scope.pid]);
  }
  async source(actor:Actor,id:string,pid?:string){
    const list=await this.sources(actor,pid);const found=list.find((r:any)=>String(r.id)===id);
    if(!found)throw new NotFoundException('Source not found');return found;
  }
  async createSource(actor:Actor,raw:unknown){
    await this.authz.global(actor,'epg.write');
    const d=validateObj(raw);pick(d,['name','download_uri','enabled','refresh_interval_seconds','visibility','provider_ids','comment']);
    const name=text(d.name,'name',200)!,url=text(d.download_uri,'download_uri',2000)!;
    let uri:URL;try{uri=new URL(url);}catch{throw new BadRequestException('Invalid URL');}
    if(uri.protocol!=='https:'||uri.port&&uri.port!=='443')throw new BadRequestException('EPG source requires HTTPS on port 443');
    if(d.visibility!==undefined&&!['all','selected'].includes(String(d.visibility)))throw new BadRequestException('Invalid visibility');
    if(d.enabled!==undefined&&typeof d.enabled!=='boolean')throw new BadRequestException('enabled must be boolean');
    const visibility=d.visibility==='selected'?'selected':'all';
    const providers=Array.isArray(d.provider_ids)?[...new Set(d.provider_ids.map(x=>integer(x,'provider_ids')))] : [];
    if(visibility==='selected'&&!providers.length)throw new BadRequestException('provider_ids required for selected visibility');
    const interval=d.refresh_interval_seconds===undefined?21600:integer(d.refresh_interval_seconds,'refresh_interval_seconds',300,2592000);
    return this.db.tx(async c=>{
      const r=(await c.query<{id:number}>(`INSERT INTO epg.sources(name,type,download_uri,visibility,enabled,refresh_interval_seconds,comment,created_by,updated_by)
        VALUES($1,'xmltv',$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
        [name,url,visibility,d.enabled!==false,interval,text(d.comment,'comment',2000,false),actor.id])).rows[0];
      for(const id of providers)await c.query('INSERT INTO epg.source_providers(source_id,provider_id) VALUES($1,$2)',[r.id,id]);
      await this.audit.write(c,actor.id,'create','epg.sources',String(r.id),null,Object.keys(d));
      return {id:r.id};
    });
  }
  async updateSource(actor:Actor,id:string,raw:unknown){
    await this.authz.global(actor,'epg.write');
    const sid=integer(id,'sourceId');const d=validateObj(raw);pick(d,['name','download_uri','enabled','refresh_interval_seconds','visibility','provider_ids','comment']);
    if(!Object.keys(d).length)throw new BadRequestException('Empty update');
    const values:unknown[]=[];const setters:string[]=[];
    const add=(column:string,v:unknown)=>{values.push(v);setters.push(`${column}=$${values.length}`);};
    if('name'in d)add('name',text(d.name,'name',200));
    if('download_uri'in d){const val=text(d.download_uri,'download_uri',2000)!;let uri:URL;try{uri=new URL(val);}catch{throw new BadRequestException('Invalid URL');}
      if(uri.protocol!=='https:'||uri.port&&uri.port!=='443')throw new BadRequestException('EPG requires HTTPS on port 443');add('download_uri',val);}
    if('enabled'in d){if(typeof d.enabled!=='boolean')throw new BadRequestException('enabled must be boolean');add('enabled',d.enabled);}
    if('refresh_interval_seconds'in d)add('refresh_interval_seconds',integer(d.refresh_interval_seconds,'refresh_interval_seconds',300,2592000));
    if('visibility'in d){if(!['all','selected'].includes(String(d.visibility)))throw new BadRequestException('Invalid visibility');add('visibility',d.visibility);}
    if('comment'in d)add('comment',text(d.comment,'comment',2000,false));
    const pids=d.provider_ids!==undefined?(Array.isArray(d.provider_ids)?[...new Set(d.provider_ids.map(x=>integer(x,'provider_ids')))]:null):undefined;
    if(pids===null)throw new BadRequestException('provider_ids must be an array');
    return this.db.tx(async c=>{
      const before=(await c.query<{visibility:string}>(`SELECT visibility FROM epg.sources WHERE id=$1 FOR UPDATE`,[sid])).rows[0];
      if(!before)throw new NotFoundException('Source not found');
      const finalVisibility=('visibility'in d?d.visibility:before.visibility);
      if(finalVisibility==='selected'){
        const count=pids!==undefined?pids.length:Number((await c.query('SELECT count(*)::int n FROM epg.source_providers WHERE source_id=$1',[sid])).rows[0].n);
        if(!count)throw new BadRequestException('Selected source needs provider_ids');
      }
      add('updated_by',actor.id);values.push(sid);
      await c.query(`UPDATE epg.sources SET ${setters.join(',')} WHERE id=$${values.length}`,values);
      if(pids!==undefined){await c.query('DELETE FROM epg.source_providers WHERE source_id=$1',[sid]);
        for(const pid of pids)await c.query('INSERT INTO epg.source_providers(source_id,provider_id) VALUES($1,$2)',[sid,pid]);}
      await this.audit.write(c,actor.id,'update','epg.sources',id,null,Object.keys(d));
      return {id:sid};
    });
  }
  async channels(actor:Actor,sourceId:string,search?:string,limit?:string,offset?:string,pid?:string){
    const src=await this.source(actor,sourceId,pid);
    const n=limit===undefined?50:integer(limit,'limit',1,200);const o=offset===undefined?0:integer(offset,'offset',0,10000000);
    return this.db.rows(`SELECT ch.id::text id,ch.external_channel_id,ch.display_name,ch.icon_url,
      (SELECT count(*)::int FROM epg.programmes p WHERE p.epg_channel_id=ch.id AND p.ends_at>=now()) future_count
      FROM epg.channels ch WHERE ch.source_id=$1 AND ($2::text IS NULL OR ch.display_name ILIKE '%'||$2||'%' OR ch.external_channel_id ILIKE '%'||$2||'%')
      ORDER BY ch.display_name NULLS LAST,ch.id LIMIT $3 OFFSET $4`,[src.id,search?.trim()||null,n,o]);
  }
  async jobs(actor:Actor,sourceId:string,pid?:string){
    await this.source(actor,sourceId,pid);
    return this.db.rows(`SELECT id::text id,status,started_at,completed_at,channels_count,programmes_count,error_message,created_at
      FROM epg.import_jobs WHERE source_id=$1 ORDER BY id DESC LIMIT 30`,[integer(sourceId,'sourceId')]);
  }
  async streamOptions(actor:Actor,pid?:string,search?:string){
    const sc=await this.readScope(actor,pid);
    return this.db.rows(`SELECT s.id::text id,s.number,s.name FROM catalog.streams s
      WHERE ($1::integer IS NULL OR catalog.stream_visible_to_provider(s.id,$1))
      AND ($2::text IS NULL OR s.name ILIKE '%'||$2||'%')
      ORDER BY s.number,s.name LIMIT 100`,[sc.pid,search?.trim()||null]);
  }
  async mappings(actor:Actor,pid?:string,search?:string,limit?:string,offset?:string){
    const sc=await this.readScope(actor,pid);
    const n=limit===undefined?50:integer(limit,'limit',1,100);const o=offset===undefined?0:integer(offset,'offset',0,10000000);
    return this.db.rows(`SELECT m.id::text id,m.stream_id::text stream_id,m.provider_id,m.priority,m.enabled,
      s.name stream_name,s.number, ch.id::text epg_channel_id,ch.external_channel_id,ch.display_name epg_name,
      src.id source_id,src.name source_name FROM epg.stream_mappings m
      JOIN catalog.streams s ON s.id=m.stream_id
      JOIN epg.channels ch ON ch.id=m.epg_channel_id JOIN epg.sources src ON src.id=ch.source_id
      WHERE ($1::integer IS NULL OR (m.provider_id=$1 OR m.provider_id IS NULL))
        AND ($1::integer IS NULL OR catalog.stream_visible_to_provider(s.id,$1))
        AND ($1::integer IS NULL OR src.visibility='all' OR EXISTS(SELECT 1 FROM epg.source_providers sp WHERE sp.source_id=src.id AND sp.provider_id=$1))
        AND ($2::text IS NULL OR s.name ILIKE '%'||$2||'%' OR ch.display_name ILIKE '%'||$2||'%')
      ORDER BY s.number,s.id,m.provider_id NULLS LAST,m.priority LIMIT $3 OFFSET $4`,
      [sc.pid,search?.trim()||null,n,o]);
  }
  /** Manual EPG picker for the channel editor: partial match over name and XMLTV ID. */
  async searchChannels(actor:Actor,pid?:string,query?:string){
    const sc=await this.readScope(actor,pid);
    const input=(query??'').trim();
    if(input.length<2)return [];
    if(input.length>120)throw new BadRequestException('Search is too long');
    // Treat %, _ and backslash literally instead of SQL LIKE wildcards.
    const pattern='%'+input.replace(/[\\%_]/g,'\\$&')+'%';
    return this.db.rows(`SELECT ch.id::text id,ch.external_channel_id,ch.display_name,ch.icon_url,
      src.id source_id,src.name source_name
      FROM epg.channels ch JOIN epg.sources src ON src.id=ch.source_id
      WHERE src.enabled AND ($1::integer IS NULL OR src.visibility='all' OR EXISTS(
        SELECT 1 FROM epg.source_providers sp WHERE sp.source_id=src.id AND sp.provider_id=$1))
      AND (ch.display_name ILIKE $2 OR ch.external_channel_id ILIKE $2)
      ORDER BY (lower(ch.display_name)=lower($3)) DESC,
        (lower(ch.external_channel_id)=lower($3)) DESC,
        (lower(ch.display_name) LIKE lower($3)||'%') DESC,
        ch.display_name NULLS LAST,src.name,ch.id LIMIT 40`,[sc.pid,pattern,input]);
  }

  /** Get the single EPG mapping actually used for playback by this provider. */
  async streamAssignment(actor:Actor,idRaw:string,pid?:string){
    const sc=await this.readScope(actor,pid);
    const id=integer(idRaw,'streamId',1,Number.MAX_SAFE_INTEGER);
    if(sc.pid!==null)await this.authz.ensureStreamVisible(String(id),sc.pid);
    const stream=await this.db.one<{id:string;logo_key:string|null}>(`
      SELECT s.id::text id,COALESCE(o.logo_key_override,s.logo_key) logo_key
      FROM catalog.streams s
      LEFT JOIN catalog.stream_provider_overrides o ON o.stream_id=s.id AND o.provider_id=$2
      WHERE s.id=$1 AND ($2::integer IS NULL OR catalog.stream_visible_to_provider(s.id,$2))`,[id,sc.pid]);
    if(!stream)throw new NotFoundException('Stream not found');
    const mapping=await this.db.one(`SELECT m.id::text id,m.stream_id::text stream_id,m.epg_channel_id::text epg_channel_id,
        m.provider_id,m.priority,ch.external_channel_id,ch.display_name,ch.icon_url,
        src.id source_id,src.name source_name
      FROM epg.stream_mappings m
      JOIN epg.channels ch ON ch.id=m.epg_channel_id
      JOIN epg.sources src ON src.id=ch.source_id
      WHERE m.stream_id=$1 AND m.enabled AND (m.provider_id=$2 OR m.provider_id IS NULL)
        AND ($2::integer IS NULL OR src.visibility='all' OR EXISTS(
          SELECT 1 FROM epg.source_providers sp WHERE sp.source_id=src.id AND sp.provider_id=$2))
      ORDER BY CASE WHEN m.provider_id=$2 THEN 0 ELSE 1 END,m.priority,m.id LIMIT 1`,[id,sc.pid]);
    return {stream_id:String(id),provider_id:sc.pid,logo_key:stream.logo_key,mapping};
  }

  async setMapping(actor:Actor,raw:unknown){
    const d=validateObj(raw);pick(d,['stream_id','epg_channel_id','provider_id','priority']);
    const streamId=integer(d.stream_id,'stream_id',1,Number.MAX_SAFE_INTEGER);
    const channelId=integer(d.epg_channel_id,'epg_channel_id',1,Number.MAX_SAFE_INTEGER);
    const pid=optionalId(d.provider_id);
    if(pid===null)await this.authz.global(actor,'epg.write');else{
      await this.authz.provider(actor,'epg.write',pid);await this.authz.ensureStreamVisible(String(streamId),pid);
    }
    const priority=d.priority===undefined?10:integer(d.priority,'priority',1,100000);
    return this.db.tx(async c=>{
      const channel=(await c.query<{visibility:string;source_id:number}>(`SELECT src.visibility,src.id source_id
        FROM epg.channels ch JOIN epg.sources src ON src.id=ch.source_id WHERE ch.id=$1`,[channelId])).rows[0];
      if(!channel)throw new NotFoundException('EPG channel not found');
      if(pid!==null && channel.visibility==='selected'){
        const allowed=(await c.query('SELECT 1 FROM epg.source_providers WHERE source_id=$1 AND provider_id=$2',[channel.source_id,pid])).rowCount;
        if(!allowed)throw new ForbiddenException('EPG source unavailable to provider');
      }
      // Replace mapping at the requested priority, supporting one active default per provider/stream.
      await c.query(`DELETE FROM epg.stream_mappings WHERE stream_id=$1 AND provider_id IS NOT DISTINCT FROM $2 AND priority=$3`,[streamId,pid,priority]);
      const result=(await c.query<{id:string}>(`INSERT INTO epg.stream_mappings(stream_id,epg_channel_id,provider_id,priority)
        VALUES($1,$2,$3,$4) RETURNING id::text id`,[streamId,channelId,pid,priority])).rows[0];
      await this.audit.write(c,actor.id,'assign','epg.stream_mappings',result.id,pid,['stream_id','epg_channel_id','priority']);
      return result;
    });
  }
  async removeMapping(actor:Actor,id:string){
    const row=await this.db.one<{provider_id:number|null}>(`SELECT provider_id FROM epg.stream_mappings WHERE id=$1`,[integer(id,'id',1,Number.MAX_SAFE_INTEGER)]);
    if(!row)throw new NotFoundException('Mapping not found');
    if(row.provider_id===null)await this.authz.global(actor,'epg.write');else await this.authz.provider(actor,'epg.write',row.provider_id);
    return this.db.tx(async c=>{
      const result=await c.query('DELETE FROM epg.stream_mappings WHERE id=$1 RETURNING id',[id]);
      if(!result.rowCount)throw new NotFoundException('Mapping not found');
      await this.audit.write(c,actor.id,'delete','epg.stream_mappings',id,row.provider_id,[]);
      return {deleted:true};
    });
  }
  async programmes(actor:Actor,streamId:string,pid?:string,from?:string,to?:string){
    const sc=await this.readScope(actor,pid);
    const sid=integer(streamId,'streamId',1,Number.MAX_SAFE_INTEGER);
    if(sc.pid!==null)await this.authz.ensureStreamVisible(String(sid),sc.pid);
    const start=from?new Date(from):new Date();const stop=to?new Date(to):new Date(start.getTime()+86400000);
    if(!Number.isFinite(start.getTime())||!Number.isFinite(stop.getTime())||stop<=start||stop.getTime()-start.getTime()>14*86400000)throw new BadRequestException('Invalid time range (max 14 days)');
    return this.db.rows(`SELECT p.id::text id,p.starts_at,p.ends_at,p.title,p.description,p.age_limit,p.language_code,
      m.epg_channel_id::text epg_channel_id
      FROM LATERAL (SELECT m.epg_channel_id FROM epg.stream_mappings m
        JOIN epg.channels ch ON ch.id=m.epg_channel_id JOIN epg.sources src ON src.id=ch.source_id
        WHERE m.stream_id=$1 AND m.enabled AND (m.provider_id=$2 OR m.provider_id IS NULL)
        AND ($2::integer IS NULL OR src.visibility='all' OR EXISTS(SELECT 1 FROM epg.source_providers sp WHERE sp.source_id=src.id AND sp.provider_id=$2))
        ORDER BY CASE WHEN m.provider_id=$2 THEN 0 ELSE 1 END,m.priority LIMIT 1) m
      JOIN epg.programmes p ON p.epg_channel_id=m.epg_channel_id
      WHERE p.starts_at<$4 AND (p.ends_at IS NULL OR p.ends_at>$3)
      ORDER BY p.starts_at LIMIT 1000`,[sid,sc.pid,start.toISOString(),stop.toISOString()]);
  }
}
