import {BadRequestException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {Db,DbClient} from '../common/db';
import {Actor,Authz} from '../auth/authz';
import {Audit} from '../common/audit';
import {dbError,intId,page,providerId} from '../common/http';
import {dto} from '../common/validate';
import {only,sqlInsert,sqlUpdate} from '../common/sql';
import {SubscriberDto,GrantDto} from './subscribers.dto';
import {encryptPassword,decryptPassword} from './credentials';
const columns=['contract_number','service_name','external_system','external_abonent_id','username','enabled',
 'display_name','address','phone','email','comment','terminal_limit_override','concurrent_stream_limit_override'];
const safe=`a.id,a.provider_id,a.contract_number,a.service_name,a.external_system,a.external_abonent_id,a.username,
 a.enabled,a.display_name,a.address,a.phone,a.email,a.comment,a.balance_kopecks,a.balance_synced_at,
 a.terminal_limit_override,a.concurrent_stream_limit_override,a.last_login_at,a.created_at,a.updated_at`;
@Injectable()
export class SubscribersService {
 constructor(@Inject(Db) private db:Db,@Inject(Authz) private authz:Authz,@Inject(Audit) private audit:Audit){}
 async list(actor:Actor,q:{providerId?:string;search?:string;limit?:string;offset?:string}){
  const {limit,offset}=page(q),scope=await this.authz.scope(actor,'abonents.read');
  if(!scope.global&&!scope.providers.length)throw new ForbiddenException('abonents.read required');
  const pid=q.providerId?providerId(q.providerId):null;
  if(pid!==null&&!scope.global&&!scope.providers.includes(pid))throw new ForbiddenException('Provider scope denied');
  const search=(q.search??'').trim().slice(0,160);
  const where=`WHERE ($1::integer IS NULL OR a.provider_id=$1) AND ($2::boolean OR a.provider_id=ANY($3::integer[]))
    AND ($4='' OR a.username ILIKE '%'||$4||'%' OR a.contract_number ILIKE '%'||$4||'%'
         OR a.display_name ILIKE '%'||$4||'%' OR a.address ILIKE '%'||$4||'%' OR a.phone ILIKE '%'||$4||'%')`;
  const params=[pid,scope.global,scope.providers,search];
  const [items,count]=await Promise.all([
   this.db.rows(`SELECT ${safe},p.name AS provider_name,
    (SELECT count(*)::int FROM subscribers.terminals t WHERE t.abonent_id=a.id AND t.enabled) AS terminal_count
    FROM subscribers.abonents a JOIN core.providers p ON p.id=a.provider_id ${where}
    ORDER BY a.id DESC LIMIT $5 OFFSET $6`,[...params,limit,offset]),
   this.db.one<{total:number}>(`SELECT count(*)::int AS total FROM subscribers.abonents a ${where}`,params)
  ]);
  return {items,total:count?.total??0,limit,offset};
 }
 async owned(actor:Actor,id:string,permission='abonents.read',c?:DbClient){
  const a=await this.db.one(`SELECT ${safe},p.name AS provider_name,p.default_terminal_limit,p.default_concurrent_stream_limit,
   (SELECT count(*)::int FROM subscribers.terminals t WHERE t.abonent_id=a.id AND t.enabled) AS terminal_count
   FROM subscribers.abonents a JOIN core.providers p ON p.id=a.provider_id WHERE a.id=$1`,[intId(id)],c);
  if(!a)throw new NotFoundException('Subscriber not found');
  await this.authz.provider(actor,permission,a.provider_id,c);return a;
 }
 get(actor:Actor,id:string){return this.owned(actor,id);}
 async create(actor:Actor,raw:unknown){
  const v=dto(SubscriberDto,raw);await this.authz.provider(actor,'abonents.write',v.provider_id);
  if(v.password===null)throw new BadRequestException('Password cannot be null');
  const credentials=v.password!==undefined?await encryptPassword(v.password):{};
  return this.db.tx(async c=>{try{
   const data={provider_id:v.provider_id,...only(v,columns),...credentials,created_by:actor.id,updated_by:actor.id};
   const query=sqlInsert('subscribers.abonents',data),r=(await c.query(query.sql,query.values)).rows[0];
   await this.audit.write(c,actor.id,'abonents.create','subscribers.abonents',String(r.id),v.provider_id,Object.keys(v).filter(k=>k!=='password'));
   return this.owned(actor,String(r.id),'abonents.write',c);
  }catch(e){dbError(e)}});
 }
 async update(actor:Actor,id:string,raw:unknown){
  const v=dto(SubscriberDto,raw,true);
  if(v.provider_id!==undefined)throw new BadRequestException('Subscriber provider cannot be changed');
  if(v.password===null)throw new BadRequestException('Password cannot be null');
  const credentials=v.password!==undefined?await encryptPassword(v.password):{};
  return this.db.tx(async c=>{try{
   const a=await this.owned(actor,id,'abonents.write',c);
   await c.query('SELECT id FROM subscribers.abonents WHERE id=$1 FOR UPDATE',[id]);
   const data={...only(v,columns),...credentials,updated_by:actor.id};
   if(Object.keys(data).length===1)throw new BadRequestException('Empty update');
   const query=sqlUpdate('subscribers.abonents',data,intId(id));await c.query(query.sql,query.values);
   await this.audit.write(c,actor.id,'abonents.update','subscribers.abonents',id,a.provider_id,Object.keys(v).map(k=>k==='password'?'password_changed':k));
   return this.owned(actor,id,'abonents.write',c);
  }catch(e){dbError(e)}});
 }
 async reveal(actor:Actor,id:string){
  return this.db.tx(async c=>{
   const a=await this.owned(actor,id,'abonents.credentials.read',c);
   const row=await this.db.one<{password_ciphertext:Buffer|null;password_key_id:string|null}>(
    'SELECT password_ciphertext,password_key_id FROM subscribers.abonents WHERE id=$1',[id],c);
   if(!row?.password_ciphertext||!row.password_key_id)throw new NotFoundException('Password is not recoverable');
   const password=decryptPassword(row.password_ciphertext,row.password_key_id);
   await this.audit.write(c,actor.id,'abonents.password.reveal','subscribers.abonents',id,a.provider_id,['password_revealed']);
   return {password};
  });
 }
 async entitlements(actor:Actor,id:string){
  await this.owned(actor,id);
  const [playlists,streams]=await Promise.all([
   this.db.rows(`SELECT x.id,x.playlist_id,x.enabled,x.valid_from,x.valid_until,p.name,p.enabled AS resource_enabled
    FROM subscribers.abonent_playlists x JOIN catalog.playlists p ON p.id=x.playlist_id
    WHERE x.abonent_id=$1 ORDER BY p.name`,[id]),
   this.db.rows(`SELECT x.id,x.stream_id,x.enabled,x.valid_from,x.valid_until,s.name,s.number,s.enabled AS resource_enabled
    FROM subscribers.abonent_streams x JOIN catalog.streams s ON s.id=x.stream_id
    WHERE x.abonent_id=$1 ORDER BY s.number,s.name`,[id])
  ]);return {playlists,streams};
 }
 async grant(actor:Actor,id:string,kind:'playlists'|'streams',raw:unknown){
  const v=dto(GrantDto,raw);intId(v.item_id,'item_id');
  const from=v.valid_from?new Date(v.valid_from):new Date(),until=v.valid_until?new Date(v.valid_until):null;
  if(Number.isNaN(+from)||(until&&(Number.isNaN(+until)||until<=from)))throw new BadRequestException('Invalid validity period');
  const table=kind==='playlists'?'subscribers.abonent_playlists':'subscribers.abonent_streams';
  const col=kind==='playlists'?'playlist_id':'stream_id';
  return this.db.tx(async c=>{try{
   const a=await this.owned(actor,id,'abonents.write',c);
   const visible=await this.db.one<{ok:boolean}>(kind==='playlists'?
     'SELECT catalog.playlist_visible_to_provider($1,$2) ok':'SELECT catalog.stream_visible_to_provider($1,$2) ok',[v.item_id,a.provider_id],c);
   if(!visible?.ok)throw new ForbiddenException('Resource is not available to provider');
   const row=(await c.query(`INSERT INTO ${table}(abonent_id,${col},enabled,valid_from,valid_until,assigned_by)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (abonent_id,${col}) DO UPDATE SET
     enabled=EXCLUDED.enabled,valid_from=EXCLUDED.valid_from,valid_until=EXCLUDED.valid_until,assigned_by=EXCLUDED.assigned_by
     RETURNING *`,[id,v.item_id,v.enabled??true,from.toISOString(),until?.toISOString()??null,actor.id])).rows[0];
   await this.audit.write(c,actor.id,`abonents.${kind}.grant`,table,String(row.id),a.provider_id,[col,'valid_from','valid_until']);
   return row;
  }catch(e){dbError(e)}});
 }
 async revoke(actor:Actor,id:string,kind:'playlists'|'streams',itemId:string){
  intId(itemId,'item_id');const table=kind==='playlists'?'subscribers.abonent_playlists':'subscribers.abonent_streams';
  const col=kind==='playlists'?'playlist_id':'stream_id';
  return this.db.tx(async c=>{
   const a=await this.owned(actor,id,'abonents.write',c);
   const row=(await c.query(`DELETE FROM ${table} WHERE abonent_id=$1 AND ${col}=$2 RETURNING id`,[id,itemId])).rows[0];
   if(!row)throw new NotFoundException('Assignment not found');
   await this.audit.write(c,actor.id,`abonents.${kind}.revoke`,table,String(row.id),a.provider_id,[col]);
   return {deleted:true};
  });
 }
}
