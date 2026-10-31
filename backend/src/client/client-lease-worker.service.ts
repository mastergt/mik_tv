import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Db } from '../common/db';
import { LoggerService } from '../logger/logger.service';

// Small periodic cleanup. Expired leases are never counted toward limits,
// but without cleanup optional playback history would retain "playing" forever.
@Injectable()
export class ClientLeaseWorker implements OnModuleInit, OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  private running=false;
  constructor(@Inject(Db) private readonly db:Db,@Inject(LoggerService) private readonly log:LoggerService){}
  onModuleInit(){
    const seconds=Number(process.env.CLIENT_LEASE_CLEANUP_SECONDS??300);
    if(!Number.isInteger(seconds)||seconds<60||seconds>3600)
      throw new Error('Invalid CLIENT_LEASE_CLEANUP_SECONDS (60..3600)');
    this.timer=setInterval(()=>void this.cleanup(),seconds*1000);
    this.timer.unref();
    void this.cleanup();
  }
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  private async cleanup(){
    if(this.running)return;
    this.running=true;
    try{
      for(let i=0;i<10;i++){
        const res=await this.db.one<{deleted:string}>(`
          WITH expired AS (
            SELECT terminal_id FROM subscribers.playback_leases
            WHERE expires_at<now() ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
          ), removed AS (
            DELETE FROM subscribers.playback_leases p USING expired e
            WHERE p.terminal_id=e.terminal_id RETURNING p.playback_history_id
          ), closed AS (
            UPDATE subscribers.playback_sessions s SET ended_at=now(),status='stopped'
            WHERE s.id IN (SELECT playback_history_id FROM removed) AND s.ended_at IS NULL
            RETURNING s.id
          )
          SELECT count(*)::text deleted FROM removed`);
        if(Number(res?.deleted??0)<500)break;
      }
    }catch(e){this.log.error(e,'ClientLeaseWorker');}
    finally{this.running=false;}
  }
}
