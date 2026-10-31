import {Inject, Injectable, OnModuleInit, OnModuleDestroy} from '@nestjs/common';
import {Db} from '../common/db';
import {LoggerService} from '../logger/logger.service';
import {nextDaily} from './messaging.service';

@Injectable()
export class MessagingWorker implements OnModuleInit,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>;
 private busy=false;
 constructor(@Inject(Db) private readonly db:Db,@Inject(LoggerService) private readonly log:LoggerService){}
 onModuleInit(){
  if(process.env.MESSAGING_SCHEDULER_ENABLED==='false')return;
  const seconds=Number(process.env.MESSAGING_SCHEDULER_SECONDS??20);
  if(!Number.isSafeInteger(seconds)||seconds<5||seconds>3600)throw new Error('Invalid MESSAGING_SCHEDULER_SECONDS');
  // Allow API initialization to finish, then run. A failure never crashes HTTP handlers.
  this.timer=setInterval(()=>void this.tick(),seconds*1000);
  this.timer.unref();
  void this.tick();
 }
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 private async tick(){
  if(this.busy)return;
  this.busy=true;
  try{
   // Recover only stale jobs; insertion is idempotent by dispatch+subscriber.
   await this.db.pool.query(`UPDATE messaging.dispatches SET status='queued',started_at=NULL
    WHERE status='running' AND started_at<now()-interval '10 minutes'`);
   for(let i=0;i<25;i++){
    const scheduled=await this.claimSchedule();if(!scheduled)break;
   }
   for(let i=0;i<5;i++){
    const claimed=await this.claimDispatch();if(!claimed)break;
    try{await this.materialize(claimed);}catch(e){
     await this.db.pool.query(`UPDATE messaging.dispatches SET status='failed',error_message=$2,
       finished_at=now() WHERE id=$1`,[claimed,String(e instanceof Error?e.message:e).slice(0,1500)]).catch(()=>{});
     this.log.error(`Dispatch ${claimed} failed: ${e instanceof Error?e.stack:e}`,'Messaging');
    }
   }
  }catch(e){this.log.error(e,'Messaging');}
  finally{this.busy=false;}
 }
 private async claimSchedule():Promise<boolean>{
  return this.db.tx(async c=>{
   const r=(await c.query(`SELECT s.id,s.message_id,s.next_run_at,s.run_at,s.cron_expression,s.timezone
    FROM messaging.schedules s JOIN messaging.messages m ON m.id=s.message_id
    WHERE s.enabled AND s.next_run_at<=now() AND m.status='active' AND m.enabled
    ORDER BY s.next_run_at,s.id FOR UPDATE OF s SKIP LOCKED LIMIT 1`)).rows[0];
   if(!r)return false;
   // Store the original run timestamp, not now(), for the unique schedule idempotency key.
   await c.query(`INSERT INTO messaging.dispatches(message_id,schedule_id,scheduled_for,status)
     VALUES($1,$2,$3,'queued') ON CONFLICT DO NOTHING`,[r.message_id,r.id,r.next_run_at]);
   if(r.run_at){await c.query(`UPDATE messaging.schedules SET enabled=false,next_run_at=NULL WHERE id=$1`,[r.id]);}
   else{
    const m=/^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(r.cron_expression??'');
    if(!m)throw new Error(`Unsupported cron in schedule ${r.id}`);
    const next=nextDaily(Number(m[1]),Number(m[2]),r.timezone,new Date(r.next_run_at),true);
    // An overdue schedule triggers once, then skips elapsed instances. No burst after downtime.
    const upcoming=next.getTime()<Date.now()?nextDaily(Number(m[1]),Number(m[2]),r.timezone,new Date()):next;
    await c.query(`UPDATE messaging.schedules SET next_run_at=$2 WHERE id=$1`,[r.id,upcoming.toISOString()]);
   }
   return true;
  });
 }
 private async claimDispatch():Promise<string|null>{
  return this.db.tx(async c=>{
   const r=(await c.query(`SELECT id FROM messaging.dispatches WHERE status='queued'
     ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
   if(!r)return null;
   await c.query(`UPDATE messaging.dispatches SET status='running',started_at=now(),error_message=NULL WHERE id=$1`,[r.id]);
   return String(r.id);
  });
 }
 private async materialize(id:string){
  await this.db.tx(async c=>{
   const r=(await c.query(`SELECT d.id,m.provider_id,m.enabled,m.status,a.rules FROM messaging.dispatches d
     JOIN messaging.messages m ON m.id=d.message_id
     LEFT JOIN LATERAL (SELECT rules FROM messaging.audiences WHERE message_id=m.id ORDER BY id DESC LIMIT 1) a ON true
     WHERE d.id=$1 AND d.status='running' FOR UPDATE OF d`,[id])).rows[0];
   if(!r)return;
   if(!r.enabled||r.status!=='active'||!r.rules)throw new Error('Message inactive or audience missing');
   const rules=r.rules;
   // PostgreSQL executes a single set-based INSERT. No 60k row loop in Node.js.
   await c.query(`INSERT INTO messaging.deliveries(dispatch_id,abonent_id,status)
    SELECT $1,s.id,'pending' FROM subscribers.abonents s JOIN core.providers p ON p.id=s.provider_id
    WHERE s.enabled AND p.enabled AND ($2::integer IS NULL OR s.provider_id=$2)
      AND ($3::boolean OR s.provider_id=ANY($4::integer[]))
      AND ($5::bigint[] IS NULL OR s.id=ANY($5::bigint[]))
      AND ($6::bigint IS NULL OR (s.balance_kopecks IS NOT NULL AND s.balance_kopecks<$6))
    ON CONFLICT DO NOTHING`,[id,r.provider_id,rules.all_providers===true,rules.provider_ids??[],rules.abonent_ids??null,rules.balance_lt_kopecks??null]);
   const count=(await c.query(`SELECT count(*)::int AS n FROM messaging.deliveries WHERE dispatch_id=$1`,[id])).rows[0].n;
   await c.query(`UPDATE messaging.dispatches SET status='completed',matched_recipients=$2,finished_at=now() WHERE id=$1`,[id,count]);
   this.log.info(`Dispatch ${id}: prepared ${count} subscriber deliveries`,'Messaging');
  });
 }
}
