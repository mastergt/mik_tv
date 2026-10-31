import {BadRequestException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Db,DbClient} from '../common/db';
import {Actor,Authz} from '../auth/authz';
import {Audit} from '../common/audit';
import {dbError,intId,page,providerId} from '../common/http';
import {dto} from '../common/validate';
import {only,sqlInsert,sqlUpdate} from '../common/sql';
import {TerminalDto,TerminalUpdateDto} from './subscribers.dto';
const editable=['provider_id','abonent_id','device_name','manufacturer','model','enabled'];
@Injectable()
export class TerminalsService {
 constructor(@Inject(Db) private db:Db,@Inject(Authz) private authz:Authz,@Inject(Audit) private audit:Audit){}
 async list(actor:Actor,q:{providerId?:string;abonentId?:string;search?:string;limit?:string;offset?:string}){
  const {limit,offset}=page(q),scope=await this.authz.scope(actor,'terminals.read');
  if(!scope.global&&!scope.providers.length)throw new ForbiddenException('terminals.read required');
  const pid=q.providerId?providerId(q.providerId):null;
  if(pid!==null&&!scope.global&&!scope.providers.includes(pid))throw new ForbiddenException('Provider scope denied');
  const aid=q.abonentId?intId(q.abonentId,'abonentId'):null;
  const search=(q.search??'').trim().slice(0,120);
  const where=`WHERE ($1::integer IS NULL OR t.provider_id=$1)
   AND ($2::boolean OR t.provider_id=ANY($3::integer[]))
   AND ($4::bigint IS NULL OR t.abonent_id=$4)
   AND ($5='' OR t.device_uuid::text ILIKE '%'||$5||'%' OR t.device_name ILIKE '%'||$5||'%'
    OR t.model ILIKE '%'||$5||'%' OR t.manufacturer ILIKE '%'||$5||'%'
    OR t.useragent ILIKE '%'||$5||'%' OR a.username ILIKE '%'||$5||'%')`;
  const args=[pid,scope.global,scope.providers,aid,search];
  const [items,count]=await Promise.all([
   this.db.rows(`SELECT t.*,a.username AS abonent_username,a.display_name AS abonent_name,p.name AS provider_name,
    EXISTS(SELECT 1 FROM subscribers.terminal_sessions s WHERE s.terminal_id=t.id AND s.ended_at IS NULL
      AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now())) AS has_active_session
    FROM subscribers.terminals t LEFT JOIN subscribers.abonents a ON a.id=t.abonent_id
    LEFT JOIN core.providers p ON p.id=t.provider_id ${where} ORDER BY t.last_activity DESC,t.id DESC
    LIMIT $6 OFFSET $7`,[...args,limit,offset]),
   this.db.one<{total:number}>(`SELECT count(*)::int total FROM subscribers.terminals t
    LEFT JOIN subscribers.abonents a ON a.id=t.abonent_id ${where}`,args)
  ]);return {items,total:count?.total??0,limit,offset};
 }
 async owned(actor:Actor,id:string,perm='terminals.read',c?:DbClient){
  const t=await this.db.one(`SELECT t.*,a.username AS abonent_username,a.display_name AS abonent_name,
    p.name AS provider_name FROM subscribers.terminals t
    LEFT JOIN subscribers.abonents a ON a.id=t.abonent_id
    LEFT JOIN core.providers p ON p.id=t.provider_id WHERE t.id=$1`,[intId(id)],c);
  if(!t)throw new NotFoundException('Terminal not found');
  if(t.provider_id===null)await this.authz.global(actor,perm,c);
  else await this.authz.provider(actor,perm,t.provider_id,c);
  return t;
 }
 get(actor:Actor,id:string){return this.owned(actor,id);}
 private async validateBinding(actor:Actor,abonentId:string|null|undefined,provider:number|null|undefined,c:DbClient){
  if(!abonentId)return provider??null;
  const id=intId(abonentId,'abonent_id');
  const a=await this.db.one<{provider_id:number}>('SELECT provider_id FROM subscribers.abonents WHERE id=$1',[id],c);
  if(!a)throw new NotFoundException('Subscriber not found');
  if(provider!==undefined&&provider!==null&&provider!==a.provider_id)
   throw new BadRequestException('Subscriber and terminal providers differ');
  await this.authz.provider(actor,'terminals.write',a.provider_id,c);
  return a.provider_id;
 }
 async create(actor:Actor,raw:unknown){
  const v=dto(TerminalDto,raw);
  return this.db.tx(async c=>{try{
   const pid=await this.validateBinding(actor,v.abonent_id,v.provider_id,c);
   if(pid===null)await this.authz.global(actor,'terminals.write',c);
   else await this.authz.provider(actor,'terminals.write',pid,c);
   const data={...only(v,['device_uuid','abonent_id','device_name','manufacturer','model','platform','os_version','app_version','useragent','enabled']),provider_id:pid};
   const q=sqlInsert('subscribers.terminals',data),row=(await c.query(q.sql,q.values)).rows[0];
   await this.audit.write(c,actor.id,'terminals.create','subscribers.terminals',String(row.id),pid,['device_uuid']);
   return this.owned(actor,String(row.id),'terminals.write',c);
  }catch(e){dbError(e)}});
 }
 async update(actor:Actor,id:string,raw:unknown){
  const v=dto(TerminalUpdateDto,raw,true);
  return this.db.tx(async c=>{try{
   const original=await this.owned(actor,id,'terminals.write',c);
   await c.query('SELECT id FROM subscribers.terminals WHERE id=$1 FOR UPDATE',[id]);
   const abonent=v.abonent_id===undefined?original.abonent_id:v.abonent_id;
   const requestedPid=v.provider_id===undefined?original.provider_id:v.provider_id;
   const resolved=await this.validateBinding(actor,abonent,requestedPid,c);
   if(resolved===null)await this.authz.global(actor,'terminals.write',c);
   else await this.authz.provider(actor,'terminals.write',resolved,c);
   const data=only(v,editable);
   if(v.abonent_id!==undefined || v.provider_id!==undefined)data['provider_id']=resolved;
   const q=sqlUpdate('subscribers.terminals',data,intId(id));await c.query(q.sql,q.values);
   await this.audit.write(c,actor.id,'terminals.update','subscribers.terminals',id,resolved,Object.keys(v));
   return this.owned(actor,id,'terminals.write',c);
  }catch(e){dbError(e)}});
 }
 async sessions(actor:Actor,id:string){
  await this.owned(actor,id);
  return this.db.rows(`SELECT id,abonent_id,auth_type,ip,user_agent,started_at,last_seen_at,ended_at,expires_at,revoked_at
   FROM subscribers.terminal_sessions WHERE terminal_id=$1 ORDER BY started_at DESC LIMIT 100`,[id]);
 }
 async playback(actor:Actor,id:string){
  const t=await this.owned(actor,id);
  if(t.provider_id===null)await this.authz.global(actor,'playback.read');
  else await this.authz.provider(actor,'playback.read',t.provider_id);
  return this.db.rows(`SELECT ps.id,ps.stream_id,s.name AS stream_name,ps.started_at,ps.last_heartbeat_at,
   ps.ended_at,ps.status,ps.error_code FROM subscribers.playback_sessions ps
   JOIN catalog.streams s ON s.id=ps.stream_id WHERE ps.terminal_id=$1 ORDER BY ps.started_at DESC LIMIT 100`,[id]);
 }
 async revokeSession(actor:Actor,id:string,sid:string){
  return this.db.tx(async c=>{
   const t=await this.owned(actor,id,'terminals.write',c);
   const r=(await c.query(`UPDATE subscribers.terminal_sessions SET revoked_at=COALESCE(revoked_at,now()),
     ended_at=COALESCE(ended_at,now()) WHERE id=$1 AND terminal_id=$2 RETURNING id`,[intId(sid),id])).rows[0];
   if(!r)throw new NotFoundException('Session not found');
   await this.audit.write(c,actor.id,'terminals.sessions.revoke','subscribers.terminal_sessions',sid,t.provider_id,['revoked_at','ended_at']);
   return {revoked:true};
  });
 }
 async settings(actor:Actor,id:string){
  await this.owned(actor,id);
  return (await this.db.one('SELECT settings,last_stream_id,updated_at FROM subscribers.terminal_settings WHERE terminal_id=$1',[id]))??{settings:{},last_stream_id:null};
 }
 async favorites(actor:Actor,id:string){
  await this.owned(actor,id);
  return this.db.rows(`SELECT f.stream_id,f.position,s.name,s.number FROM subscribers.terminal_favorites f
    JOIN catalog.streams s ON s.id=f.stream_id WHERE f.terminal_id=$1 ORDER BY f.position NULLS LAST,s.number`,[id]);
 }
}
