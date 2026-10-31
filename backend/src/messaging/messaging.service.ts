import {BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Db, DbClient} from '../common/db';
import {Actor, Authz} from '../auth/authz';
import {Audit} from '../common/audit';
import {dbError, intId, page, providerId} from '../common/http';

type Audience = {
  provider_ids?: number[];
  all_providers?: boolean;
  abonent_ids?: string[];
  balance_lt_kopecks?: number;
};
const displays=new Set(['popup','ticker','banner','system']);
const statuses=new Set(['draft','active','archived']);
function object(v:unknown):Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw new BadRequestException('JSON object required');
  return v as Record<string,unknown>;
}
function keys(value:Record<string,unknown>,allowed:string[]){
  const extra=Object.keys(value).filter(k=>!allowed.includes(k));
  if(extra.length)throw new BadRequestException(`Unknown fields: ${extra.join(', ')}`);
}
function num(v:unknown,min:number,max:number,name:string){
  if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw new BadRequestException(`Invalid ${name}`);
  return v;
}
function str(v:unknown,max:number,name:string,allowEmpty=false){
  if(typeof v!=='string'||v.length>max||(!allowEmpty&&!v.trim()))throw new BadRequestException(`Invalid ${name}`);
  return v.trim();
}
function iso(v:unknown,name:string){
  if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT/.test(v)||Number.isNaN(Date.parse(v)))throw new BadRequestException(`Invalid ${name}`);
  return new Date(v).toISOString();
}
function audience(raw:unknown,owner:number|null):Audience{
  const v=object(raw);
  keys(v,['provider_ids','all_providers','abonent_ids','balance_lt_kopecks']);
  const a:Audience={};
  if(v.provider_ids!==undefined){
    if(!Array.isArray(v.provider_ids)||v.provider_ids.length>200)throw new BadRequestException('Invalid provider_ids');
    a.provider_ids=[...new Set(v.provider_ids.map(x=>providerId(x)))];
  }
  if(v.all_providers!==undefined){if(typeof v.all_providers!=='boolean')throw new BadRequestException('Invalid all_providers');a.all_providers=v.all_providers;}
  if(v.abonent_ids!==undefined){
    if(!Array.isArray(v.abonent_ids)||v.abonent_ids.length>10000)throw new BadRequestException('Invalid abonent_ids');
    a.abonent_ids=[...new Set(v.abonent_ids.map(x=>intId(x,'abonent_id')))];
    if(!a.abonent_ids.length)throw new BadRequestException('abonent_ids must not be empty');
  }
  if(v.balance_lt_kopecks!==undefined){a.balance_lt_kopecks=num(v.balance_lt_kopecks,-9007199254740991,9007199254740991,'balance_lt_kopecks');}
  if(owner!==null){
    if(a.all_providers||a.provider_ids?.some(x=>x!==owner))throw new BadRequestException('Audience cannot target another provider');
    a.provider_ids=[owner];a.all_providers=false;
  }else if(!a.all_providers && !a.provider_ids?.length){
    throw new BadRequestException('Global message requires explicit provider_ids or all_providers=true');
  }
  return a;
}
function messageData(raw:unknown,partial:boolean){
  const v=object(raw);
  keys(v,['provider_id','title','body','display_type','priority','duration_seconds','ticker_speed','requires_ack','enabled','status','audience','image_key']);
  if(partial&&!Object.keys(v).length)throw new BadRequestException('Empty update');
  const out:Record<string,unknown>={};
  if(v.provider_id!==undefined){out.provider_id=v.provider_id===null?null:providerId(v.provider_id);}
  if(v.title!==undefined){out.title=v.title===null?null:str(v.title,200,'title');}
  if(v.image_key!==undefined){
    if(v.image_key!==null&&(typeof v.image_key!=='string'||!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(v.image_key)))throw new BadRequestException('Invalid image_key');
    out.image_key=v.image_key;
  }
  if(v.body!==undefined){out.body=str(v.body,4000,'body');}
  if(v.display_type!==undefined){if(!displays.has(String(v.display_type)))throw new BadRequestException('Invalid display_type');out.display_type=v.display_type;}
  if(v.priority!==undefined)out.priority=num(v.priority,1,10,'priority');
  if(v.duration_seconds!==undefined)out.duration_seconds=v.duration_seconds===null?null:num(v.duration_seconds,1,3600,'duration_seconds');
  if(v.ticker_speed!==undefined)out.ticker_speed=v.ticker_speed===null?null:num(v.ticker_speed,1,10,'ticker_speed');
  for(const field of ['requires_ack','enabled'])if(v[field]!==undefined){if(typeof v[field]!=='boolean')throw new BadRequestException(`Invalid ${field}`);out[field]=v[field];}
  if(v.status!==undefined){if(!statuses.has(String(v.status)))throw new BadRequestException('Invalid status');out.status=v.status;}
  if(!partial&&(!out.body||!out.display_type))throw new BadRequestException('body and display_type are required');
  return {columns:out,audience:v.audience};
}

// Only the daily five-field cron form "minute hour * * *" is supported in this stage.
// Search UTC minutes through 72h and compare local clock time, including DST.
export function nextDaily(minute:number,hour:number,timezone:string,after:Date,skipSameLocalDate=false):Date{
  let formatter:Intl.DateTimeFormat;
  try{formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatter.format(after);}
  catch{throw new BadRequestException('Invalid timezone');}
  const localDate=(date:Date)=>formatter.formatToParts(date).filter(x=>['day','month','year'].includes(x.type)).map(x=>x.value).join('-');
  const previousDate=skipSameLocalDate?localDate(after):null;
  const start=Math.floor(after.getTime()/60000)*60000+60000;
  for(let i=0;i<72*60;i++){
    const t=new Date(start+i*60000);
    const parts=formatter.formatToParts(t);
    const h=Number(parts.find(x=>x.type==='hour')?.value),m=Number(parts.find(x=>x.type==='minute')?.value);
    if(h===hour&&m===minute&&(!previousDate||localDate(t)!==previousDate))return t;
  }
  throw new BadRequestException('Unable to calculate next run');
}

@Injectable()
export class MessagingService {
  constructor(@Inject(Db) private readonly db:Db,@Inject(Authz) private readonly authz:Authz,@Inject(Audit) private readonly audit:Audit){}

  private async owned(actor:Actor,id:string,permission:'messages.read'|'messages.write'|'messages.send',c?:DbClient){
    const row=await this.db.one<any>(`SELECT m.*,a.rules AS audience FROM messaging.messages m
      LEFT JOIN LATERAL (SELECT rules FROM messaging.audiences WHERE message_id=m.id ORDER BY id DESC LIMIT 1) a ON true
      WHERE m.id=$1`,[intId(id)],c);
    if(!row)throw new NotFoundException('Message not found');
    if(row.provider_id===null)await this.authz.global(actor,permission,c);
    else await this.authz.provider(actor,permission,row.provider_id,c);
    return row;
  }
  async list(actor:Actor,q:{providerId?:string;limit?:string;offset?:string;search?:string}){
    const s=await this.authz.scope(actor,'messages.read');
    if(!s.global&&!s.providers.length)throw new ForbiddenException('messages.read permission required');
    const pid=q.providerId?providerId(q.providerId):null;
    if(pid!==null&&!s.global&&!s.providers.includes(pid))throw new ForbiddenException('Provider scope denied');
    const pg=page(q),search=(q.search??'').trim().slice(0,100);
    const where=`WHERE ($1::integer IS NULL OR m.provider_id=$1) AND ($2::boolean OR m.provider_id=ANY($3::integer[]))
      AND ($4='' OR m.title ILIKE '%'||$4||'%' OR m.body ILIKE '%'||$4||'%')`;
    const params=[pid,s.global,s.providers,search];
    const [rows,count]=await Promise.all([
      this.db.rows(`SELECT m.*,p.name AS provider_name,
        (SELECT count(*)::int FROM messaging.dispatches d WHERE d.message_id=m.id) AS dispatch_count
        FROM messaging.messages m LEFT JOIN core.providers p ON p.id=m.provider_id ${where}
        ORDER BY m.created_at DESC,m.id DESC LIMIT $5 OFFSET $6`,[...params,pg.limit,pg.offset]),
      this.db.one<{total:number}>(`SELECT count(*)::int AS total FROM messaging.messages m ${where}`,params)
    ]);
    return {items:rows,total:count?.total??0,...pg};
  }
  async get(actor:Actor,id:string){
    const m=await this.owned(actor,id,'messages.read');
    const [schedules,dispatches]=await Promise.all([
      this.db.rows(`SELECT * FROM messaging.schedules WHERE message_id=$1 ORDER BY id DESC LIMIT 50`,[id]),
      this.db.rows(`SELECT d.*,(SELECT count(*)::int FROM messaging.deliveries x WHERE x.dispatch_id=d.id) AS delivery_count,
        (SELECT count(*)::int FROM messaging.deliveries x WHERE x.dispatch_id=d.id AND x.status='shown') AS shown_count,
        (SELECT count(*)::int FROM messaging.deliveries x WHERE x.dispatch_id=d.id AND x.status='acknowledged') AS acknowledged_count
        FROM messaging.dispatches d WHERE d.message_id=$1 ORDER BY d.id DESC LIMIT 50`,[id])
    ]);
    return {...m,schedules,dispatches};
  }
  async create(actor:Actor,raw:unknown){
    const v=messageData(raw,false);const owner=(v.columns.provider_id??null) as number|null;
    if(owner===null)await this.authz.global(actor,'messages.write');else await this.authz.provider(actor,'messages.write',owner);
    if(v.audience===undefined)throw new BadRequestException('Audience is required');
    const rules=audience(v.audience,owner);
    return this.db.tx(async c=>{try{
      const params=[owner,v.columns.title??null,v.columns.body,v.columns.display_type,v.columns.priority??5,
        v.columns.duration_seconds??null,v.columns.ticker_speed??null,v.columns.requires_ack??false,
        v.columns.enabled??true,v.columns.status??'draft',actor.id,v.columns.image_key??null];
      const m=(await c.query(`INSERT INTO messaging.messages(provider_id,title,body,display_type,priority,duration_seconds,
        ticker_speed,requires_ack,enabled,status,created_by,updated_by,image_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12) RETURNING *`,params)).rows[0];
      await c.query(`INSERT INTO messaging.audiences(message_id,rules) VALUES($1,$2::jsonb)`,[m.id,JSON.stringify(rules)]);
      await this.audit.write(c,actor.id,'messages.create','messaging.messages',String(m.id),owner,['message','audience']);
      return {...m,audience:rules};
    }catch(e){dbError(e)}});
  }
  async update(actor:Actor,id:string,raw:unknown){
    const v=messageData(raw,true);
    if(v.columns.provider_id!==undefined)throw new BadRequestException('Message owner cannot be changed');
    return this.db.tx(async c=>{try{
      const m=await this.owned(actor,id,'messages.write',c);
      if(m.status==='archived')throw new ConflictException('Archived message cannot be edited');
      const data={...v.columns,updated_by:actor.id};
      const names=Object.keys(data),values=Object.values(data);
      await c.query(`UPDATE messaging.messages SET ${names.map((n,i)=>`${n}=$${i+1}`).join(', ')} WHERE id=$${names.length+1}`,[...values,id]);
      if(v.audience!==undefined){
        const rules=audience(v.audience,m.provider_id);
        // Existing dispatched recipient snapshots stay unchanged.
        await c.query(`DELETE FROM messaging.audiences WHERE message_id=$1`,[id]);
        await c.query(`INSERT INTO messaging.audiences(message_id,rules) VALUES($1,$2::jsonb)`,[id,JSON.stringify(rules)]);
      }
      await this.audit.write(c,actor.id,'messages.update','messaging.messages',id,m.provider_id,[...Object.keys(v.columns),...(v.audience!==undefined?['audience']:[])]);
      return this.owned(actor,id,'messages.write',c);
    }catch(e){dbError(e)}});
  }
  private async countRecipients(m:any,c?:DbClient){
    const a=m.audience as Audience|null;
    if(!a)throw new BadRequestException('Message has no audience');
    return this.db.one<{count:string}>(`SELECT count(*)::text AS count FROM subscribers.abonents s JOIN core.providers p ON p.id=s.provider_id
      WHERE s.enabled AND p.enabled AND ($1::integer IS NULL OR s.provider_id=$1)
      AND ($2::boolean OR s.provider_id=ANY($3::integer[]))
      AND ($4::bigint[] IS NULL OR s.id=ANY($4::bigint[]))
      AND ($5::bigint IS NULL OR (s.balance_kopecks IS NOT NULL AND s.balance_kopecks<$5))`,
      [m.provider_id,a.all_providers===true,a.provider_ids??[],a.abonent_ids??null,a.balance_lt_kopecks??null],c);
  }
  async preview(actor:Actor,id:string){
    const m=await this.owned(actor,id,'messages.read');
    const result=await this.countRecipients(m);
    return {recipients:Number(result?.count??0),balance_at:'time_of_preview',note:'Actual audience is recalculated when dispatch is processed'};
  }
  async send(actor:Actor,id:string){
    return this.db.tx(async c=>{
      const m=await this.owned(actor,id,'messages.send',c);
      if(m.status!=='active'||!m.enabled)throw new ConflictException('Activate message before sending');
      const d=(await c.query(`INSERT INTO messaging.dispatches(message_id,scheduled_for,status)
        VALUES($1,now(),'queued') RETURNING id,status,scheduled_for`,[id])).rows[0];
      await this.audit.write(c,actor.id,'messages.send','messaging.dispatches',String(d.id),m.provider_id,['message_id']);
      return d;
    });
  }
  async schedule(actor:Actor,id:string,raw:unknown){
    const v=object(raw);keys(v,['kind','run_at','hour','minute','timezone']);
    const kind=v.kind;
    if(kind!=='once'&&kind!=='daily')throw new BadRequestException('kind must be once or daily');
    let runAt:string|null=null,cron:string|null=null,next:string,timezone='UTC';
    if(kind==='once'){
      runAt=iso(v.run_at,'run_at');
      if(Date.parse(runAt)<Date.now()+30000)throw new BadRequestException('run_at must be at least 30 seconds in the future');
      next=runAt;
    }else{
      const hour=num(v.hour,0,23,'hour'),minute=num(v.minute,0,59,'minute');
      timezone=str(v.timezone??'Europe/Moscow',80,'timezone');
      cron=`${minute} ${hour} * * *`;
      next=nextDaily(minute,hour,timezone,new Date()).toISOString();
    }
    return this.db.tx(async c=>{
      const m=await this.owned(actor,id,'messages.write',c);
      if(m.status!=='active'||!m.enabled)throw new ConflictException('Activate message before scheduling');
      const r=(await c.query(`INSERT INTO messaging.schedules(message_id,run_at,cron_expression,timezone,next_run_at)
        VALUES($1,$2,$3,$4,$5) RETURNING *`,[id,runAt,cron,timezone,next])).rows[0];
      await this.audit.write(c,actor.id,'messages.schedule','messaging.schedules',String(r.id),m.provider_id,['schedule']);
      return r;
    });
  }
  async disableSchedule(actor:Actor,id:string,sid:string){
    return this.db.tx(async c=>{
      const m=await this.owned(actor,id,'messages.write',c);
      const r=(await c.query(`UPDATE messaging.schedules SET enabled=false,next_run_at=NULL
        WHERE id=$1 AND message_id=$2 RETURNING id`,[intId(sid),id])).rows[0];
      if(!r)throw new NotFoundException('Schedule not found');
      await this.audit.write(c,actor.id,'messages.schedule.disable','messaging.schedules',sid,m.provider_id,['enabled']);
      return {disabled:true};
    });
  }
}
