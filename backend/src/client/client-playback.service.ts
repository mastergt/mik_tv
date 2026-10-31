import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Db } from '../common/db';
import { ClientCatalogService } from './client-catalog.service';
import { ClientSession, issueSecret, jsonObject, numId, onlyKeys, tokenHash } from './client-auth';

function leaseSeconds():number {
  const n=Number(process.env.CLIENT_PLAYBACK_LEASE_SECONDS??150);
  if(!Number.isInteger(n)||n<90||n>900)throw new Error('CLIENT_PLAYBACK_LEASE_SECONDS must be 90..900');
  return n;
}
@Injectable()
export class ClientPlaybackService {
  private readonly ttl=leaseSeconds();
  constructor(@Inject(Db) private readonly db:Db,@Inject(ClientCatalogService) private readonly catalog:ClientCatalogService){}
  async start(ctx:ClientSession,raw:unknown){
    const d=jsonObject(raw);onlyKeys(d,['stream_id']);
    const sid=numId(d.stream_id,'stream_id');
    const sources=await this.catalog.sources(ctx,sid,'live');
    if(!sources.length)throw new NotFoundException('No available LIVE sources');
    const token=issueSecret();
    const result=await this.db.tx(async c=>{
      const session=(await c.query(`SELECT t.id FROM subscribers.terminals t
        JOIN subscribers.terminal_sessions ts ON ts.terminal_id=t.id
        WHERE t.id=$1 AND ts.id=$2 AND ts.revoked_at IS NULL AND ts.ended_at IS NULL
          AND ts.expires_at>now() AND t.enabled FOR UPDATE OF t`,[ctx.terminal_id,ctx.session_id])).rowCount;
      if(!session)throw new UnauthorizedException('Client session revoked');
      // Serialise concurrent starts for the same subscriber: no overbooking with two devices.
      let maxStreams=0,saveHistory=false;
      if(ctx.abonent_id){
        const a=(await c.query<{limit:number;playback_history_enabled:boolean}>(`
          SELECT COALESCE(a.concurrent_stream_limit_override,p.default_concurrent_stream_limit) AS limit,
            p.playback_history_enabled FROM subscribers.abonents a
          JOIN core.providers p ON p.id=a.provider_id
          WHERE a.id=$1 AND a.enabled AND p.enabled FOR UPDATE OF a`,[ctx.abonent_id])).rows[0];
        if(!a)throw new ForbiddenException('Subscriber is disabled');
        maxStreams=a.limit;saveHistory=a.playback_history_enabled;
      }
      await this.catalog.assertAllowed(ctx,sid,c);
      const previous=(await c.query<{playback_history_id:string|null}>(`
        SELECT playback_history_id::text FROM subscribers.playback_leases
        WHERE terminal_id=$1 FOR UPDATE`,[ctx.terminal_id])).rows[0];
      if(ctx.abonent_id&&maxStreams>0){
        const other=(await c.query<{count:string}>(`
          SELECT count(*)::text count FROM subscribers.playback_leases
          WHERE abonent_id=$1 AND terminal_id<>$2 AND expires_at>now()`,
          [ctx.abonent_id,ctx.terminal_id])).rows[0];
        if(Number(other?.count??0)>=maxStreams)
          throw new ConflictException('Concurrent playback limit reached');
      }
      if(previous?.playback_history_id){
        await c.query(`UPDATE subscribers.playback_sessions SET ended_at=now(),status='stopped'
          WHERE id=$1 AND ended_at IS NULL`,[previous.playback_history_id]);
      }
      let playbackId:string|null=null;
      if(saveHistory){
        const r=(await c.query<{id:string}>(`INSERT INTO subscribers.playback_sessions
          (terminal_id,abonent_id,stream_id,provider_id,status,last_heartbeat_at)
          VALUES($1,$2,$3,$4,'playing',now()) RETURNING id::text id`,
          [ctx.terminal_id,ctx.abonent_id,sid,ctx.provider_id])).rows[0];
        playbackId=r.id;
      }
      await c.query(`INSERT INTO subscribers.playback_leases
        (terminal_id,abonent_id,provider_id,stream_id,lease_key_hash,expires_at,playback_history_id)
        VALUES($1,$2,$3,$4,$5,now()+($6::integer * interval '1 second'),$7)
        ON CONFLICT (terminal_id) DO UPDATE SET abonent_id=excluded.abonent_id,
          provider_id=excluded.provider_id,stream_id=excluded.stream_id,
          lease_key_hash=excluded.lease_key_hash,expires_at=excluded.expires_at,
          playback_history_id=excluded.playback_history_id,started_at=now(),updated_at=now()`,
        [ctx.terminal_id,ctx.abonent_id,ctx.provider_id,sid,tokenHash(token),this.ttl,playbackId]);
      return {stream_id:sid,lease_token:token,expires_in:this.ttl,heartbeat_after_seconds:Math.floor(this.ttl/2)};
    });
    return {...result,sources};
  }
  async heartbeat(ctx:ClientSession,raw:unknown){
    const d=jsonObject(raw);onlyKeys(d,['lease_token']);
    if(typeof d.lease_token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(d.lease_token))
      throw new BadRequestException('Invalid lease_token');
    const result=await this.db.tx(async c=>{
      const lease=(await c.query<{stream_id:string;playback_history_id:string|null}>(`
        SELECT stream_id::text,playback_history_id::text FROM subscribers.playback_leases
        WHERE terminal_id=$1 AND lease_key_hash=$2 AND expires_at>now() FOR UPDATE`,
        [ctx.terminal_id,tokenHash(d.lease_token as string)])).rows[0];
      if(!lease)throw new NotFoundException('Playback lease expired');
      await this.catalog.assertAllowed(ctx,lease.stream_id,c);
      await c.query(`UPDATE subscribers.playback_leases
        SET expires_at=now()+($2::integer * interval '1 second'),updated_at=now()
        WHERE terminal_id=$1`,[ctx.terminal_id,this.ttl]);
      await c.query(`UPDATE subscribers.terminals SET last_activity=now()
        WHERE id=$1 AND last_activity<now()-interval '3 minutes'`,[ctx.terminal_id]);
      if(lease.playback_history_id){
        await c.query(`UPDATE subscribers.playback_sessions SET last_heartbeat_at=now(),status='playing'
          WHERE id=$1 AND ended_at IS NULL`,[lease.playback_history_id]);
      }
      return {ok:true,expires_in:this.ttl};
    });
    return result;
  }
  async stop(ctx:ClientSession,raw:unknown){
    const d=jsonObject(raw);onlyKeys(d,['lease_token']);
    if(typeof d.lease_token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(d.lease_token))
      throw new BadRequestException('Invalid lease_token');
    await this.db.tx(async c=>{
      const r=(await c.query<{playback_history_id:string|null}>(`
        DELETE FROM subscribers.playback_leases WHERE terminal_id=$1 AND lease_key_hash=$2
        RETURNING playback_history_id::text`,[ctx.terminal_id,tokenHash(d.lease_token as string)])).rows[0];
      if(r?.playback_history_id){
        await c.query(`UPDATE subscribers.playback_sessions SET ended_at=now(),status='stopped'
          WHERE id=$1 AND ended_at IS NULL`,[r.playback_history_id]);
      }
    });
    return {ok:true};
  }
}
