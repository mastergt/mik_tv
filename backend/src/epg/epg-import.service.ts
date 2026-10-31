import { ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Db, DbClient } from '../common/db';
import { LoggerService } from '../logger/logger.service';
import { XmltvParser, XmlChannel, XmlProgramme } from './xmltv';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { createGunzip } from 'node:zlib';
import { Transform } from 'node:stream';
import { TextDecoder } from 'node:util';

const deny = new BlockList();
for(const [address,bits] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],
  ['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],
  ['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
] as Array<[string,number]>)deny.addSubnet(address,bits,'ipv4');
for(const [address,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]] as Array<[string,number]>)deny.addSubnet(address,bits,'ipv6');
function publicAddress(ip:string){
  if(ip.startsWith('::ffff:')){const tail=ip.substring(7);return isIP(tail)===4&&!deny.check(tail,'ipv4');}
  const family=isIP(ip);return !!family&&!deny.check(ip,family===4?'ipv4':'ipv6');
}
function limitInt(name:string,defaultValue:number,min:number,max:number){const x=Number(process.env[name]??defaultValue);return Number.isInteger(x)&&x>=min&&x<=max?x:defaultValue;}

/** Refuse unsafe redirect targets, loopback, LAN and cloud metadata endpoints. HTTPS only. */
async function openRemote(address:string,redirects=0):Promise<{response:IncomingMessage;url:URL}>{
  if(redirects>3)throw new Error('Too many EPG redirects');
  const url=new URL(address);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new Error('EPG download requires public HTTPS URL on port 443');
  const ips=await lookup(url.hostname,{all:true});
  if(!ips.length||ips.some(x=>!publicAddress(x.address)))throw new Error('EPG host resolves to a restricted IP address');
  const resolved=ips[0];
  const response=await new Promise<IncomingMessage>((resolve,reject)=>{
    const req=request(url,{method:'GET',timeout:25000,headers:{'User-Agent':'IPTV-Control-EPG/0.4','Accept':'application/xml, text/xml, application/gzip, */*'},
      lookup:(_host,options,cb)=>{
        if(options.all){
          cb(null,ips);
        }else{
          cb(null,resolved.address,resolved.family);
        }
      }},res=>resolve(res));
    req.on('timeout',()=>req.destroy(new Error('EPG download timeout')));
    req.on('error',reject);req.end();
  });
  if(response.statusCode && [301,302,303,307,308].includes(response.statusCode)){
    const location=response.headers.location;response.resume();
    if(!location)throw new Error('EPG redirect missing Location');
    return openRemote(new URL(location,url).toString(),redirects+1);
  }
  if(response.statusCode!==200){response.resume();throw new Error(`EPG HTTP ${response.statusCode}`);}
  return {response,url};
}

@Injectable()
export class EpgImportService implements OnModuleInit,OnModuleDestroy {
  private timer?:NodeJS.Timeout;
  private scanning=false;
  constructor(@Inject(Db) private readonly db:Db,@Inject(LoggerService) private readonly log:LoggerService){}
  onModuleInit(){
    // Recovery is serialized by the same PostgreSQL advisory lock used by the importer.
    void this.recoverOrphans().then(()=>{
      if(process.env.EPG_AUTO_IMPORT==='false')return;
      this.timer=setInterval(()=>void this.schedule().catch(e=>this.log.error(e,'EPG')),
        limitInt('EPG_SCHEDULER_SECONDS',60,30,3600)*1000);
      this.timer.unref();
      setTimeout(()=>void this.schedule().catch(e=>this.log.error(e,'EPG')),12000).unref();
    }).catch(e=>this.log.error(e,'EPG'));
  }
  private async recoverOrphans(){
    const sources=await this.db.rows<{source_id:number}>(`SELECT DISTINCT source_id FROM epg.import_jobs
      WHERE status IN ('running','queued') AND created_at < now() - interval '1 minute'`);
    for(const s of sources){
      const c=await this.db.pool.connect();let locked=false;
      try{
        const result=await c.query<{locked:boolean}>('SELECT pg_try_advisory_lock(1200400,$1) locked',[s.source_id]);
        locked=result.rows[0]?.locked??false;
        if(!locked)continue; // Another backend instance is actively importing.
        await c.query(`UPDATE epg.import_jobs SET status='failed',completed_at=now(),
          started_at=coalesce(started_at,created_at),error_message='Прервано перезапуском backend'
          WHERE source_id=$1 AND status IN ('running','queued') AND created_at < now()-interval '1 minute'`,[s.source_id]);
        await c.query(`UPDATE epg.sources SET last_error='Импорт прерван перезапуском backend',
          last_download_at=NULL WHERE id=$1`,[s.source_id]);
      }finally{if(locked)await c.query('SELECT pg_advisory_unlock(1200400,$1)',[s.source_id]);c.release();}
    }
  }
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  private async schedule(){
    if(this.scanning)return;
    this.scanning=true;
    try{
      await this.recoverOrphans();
      const due=await this.db.rows<{id:number}>(`SELECT s.id FROM epg.sources s
        WHERE s.enabled AND s.type='xmltv' AND s.download_uri IS NOT NULL
        AND (s.last_download_at IS NULL OR s.last_download_at + s.refresh_interval_seconds * interval '1 second' <= now())
        AND NOT EXISTS(SELECT 1 FROM epg.import_jobs j WHERE j.source_id=s.id AND j.status IN ('running','queued'))
        ORDER BY s.last_download_at NULLS FIRST LIMIT 2`);
      for(const x of due)void this.requestImport(x.id).catch(e=>this.log.warn(`EPG source=${x.id}: ${String(e)}`,'EPG'));
    }finally{this.scanning=false;}
  }
  async requestImport(sourceId:number):Promise<{job_id:string;status:string}>{
    const source=await this.db.one<{enabled:boolean;download_uri:string|null;type:string}>(
      'SELECT enabled,download_uri,type FROM epg.sources WHERE id=$1',[sourceId]);
    if(!source)throw new NotFoundException('EPG source not found');
    if(!source.enabled||source.type!=='xmltv'||!source.download_uri)throw new ConflictException('Source is disabled or cannot be downloaded');
    let job:{id:string};
    try{
      job=(await this.db.one<{id:string}>(`INSERT INTO epg.import_jobs(source_id,status)
        VALUES($1,'queued') RETURNING id::text id`,[sourceId]))!;
    }catch(e){if((e as {code?:string}).code==='23505')throw new ConflictException('EPG source is already importing');throw e;}
    void this.importSource(sourceId,job.id).catch(e=>this.log.error(e,'EPG'));
    return {job_id:job.id,status:'queued'};
  }
  private async importSource(sourceId:number,queuedJobId:string):Promise<void>{
    // Dedicated session lock held for entire import. Prevent duplicate across backend instances.
    const conn=await this.db.pool.connect();
    let gotLock=false,jobId:string=queuedJobId;
    try{
      const lock=await conn.query<{locked:boolean}>('SELECT pg_try_advisory_lock(1200400,$1) locked',[sourceId]);
      gotLock=lock.rows[0]?.locked??false;
      if(!gotLock)throw new ConflictException('Этот источник EPG уже обновляется');
      const source=(await conn.query<{id:number;download_uri:string|null;type:string;enabled:boolean}>(
        'SELECT id,download_uri,type,enabled FROM epg.sources WHERE id=$1',[sourceId])).rows[0];
      if(!source||!source.enabled||source.type!=='xmltv'||!source.download_uri)throw new Error('EPG source unavailable or not a downloadable XMLTV source');
      await conn.query(`UPDATE epg.import_jobs SET status='running',started_at=now()
        WHERE id=$1 AND source_id=$2 AND status='queued'`,[jobId,sourceId]);
      await conn.query('UPDATE epg.sources SET last_download_at=now(),last_error=NULL WHERE id=$1',[sourceId]);
      this.log.info(`Import started source=${sourceId} job=${jobId}`,'EPG');
      let channelCount=0,programmeCount=0;
      try{
        const {response,url}=await openRemote(source.download_uri);
        const limitBytes=limitInt('EPG_MAX_DOWNLOAD_MB',250,10,2000)*1024*1024;
        const expansionLimit=limitInt('EPG_MAX_XML_MB',1200,20,8000)*1024*1024;
        let compressed=0,expanded=0;
        const meter=new Transform({transform(chunk:Buffer,_encoding,cb){compressed+=chunk.length;
          if(compressed>limitBytes){cb(new Error('Compressed EPG file exceeds EPG_MAX_DOWNLOAD_MB'));return;}
          cb(null,chunk);
        }});
        const compressedInput=response.pipe(meter);
        const gzip=url.pathname.endsWith('.gz')||String(response.headers['content-encoding']??'').includes('gzip');
        const xmlStream=gzip?compressedInput.pipe(createGunzip()):compressedInput;
        const parser=new XmltvParser(); const decoder=new TextDecoder('utf-8',{fatal:false});
        let channels:XmlChannel[]=[],programmes:XmlProgramme[]=[];
        const flush=async()=>{
          if(!channels.length&&!programmes.length)return;
          const result=await this.saveBatch(sourceId,jobId!,channels,programmes);
          channelCount+=result.channels;programmeCount+=result.programmes;
          channels=[];programmes=[];
        };
        for await(const chunk of xmlStream){
          expanded+=(chunk as Buffer).length;
          if(expanded>expansionLimit)throw new Error('Uncompressed XML exceeds EPG_MAX_XML_MB');
          parser.write(decoder.decode(chunk as Buffer,{stream:true}));
          const part=parser.take();channels.push(...part.channels);programmes.push(...part.programmes);
          if(channels.length+programmes.length>=400)await flush();
        }
        parser.write(decoder.decode());parser.finish();
        const last=parser.take();channels.push(...last.channels);programmes.push(...last.programmes);await flush();
        if(!channelCount||!programmeCount)throw new Error('Empty or invalid XMLTV file: no channels or programmes');
        // Keep the recent past for DVR even if the upstream XMLTV no longer includes it.
        // Clean up vanished FUTURE programmes, and expire old past data separately.
        const pastDays=limitInt('EPG_KEEP_PAST_DAYS',7,1,365);
        await this.db.pool.query(`DELETE FROM epg.programmes p USING epg.channels ch
          WHERE p.epg_channel_id=ch.id AND ch.source_id=$1
          AND p.last_import_job_id IS DISTINCT FROM $2 AND p.starts_at>now()`,[sourceId,jobId]);
        await this.db.pool.query(`DELETE FROM epg.programmes p USING epg.channels ch
          WHERE p.epg_channel_id=ch.id AND ch.source_id=$1
          AND coalesce(p.ends_at,p.starts_at)<now()-$2::integer*interval '1 day'`,[sourceId,pastDays]);
        await this.db.pool.query(`UPDATE epg.import_jobs SET status='success',completed_at=now(),
          channels_count=$2,programmes_count=$3 WHERE id=$1`,[jobId,channelCount,programmeCount]);
        await this.db.pool.query('UPDATE epg.sources SET last_success_at=now(),last_error=NULL WHERE id=$1',[sourceId]);
        this.log.info(`Import completed source=${sourceId} channels=${channelCount} programmes=${programmeCount}`,'EPG');
      }catch(e){
        const message=e instanceof Error?e.message:String(e);
        await this.db.pool.query(`UPDATE epg.import_jobs SET status='failed',completed_at=now(),error_message=$2
          WHERE id=$1`,[jobId,message.slice(0,2000)]).catch(()=>{});
        await this.db.pool.query(`UPDATE epg.sources SET last_error=$2,
          last_download_at=now()-greatest(refresh_interval_seconds-600,0)*interval '1 second' WHERE id=$1`,[sourceId,message.slice(0,2000)]).catch(()=>{});
        this.log.error(`EPG import failed source=${sourceId}: ${message}`,'EPG');
      }
    }catch(e){
      await this.db.pool.query(`UPDATE epg.import_jobs SET status='failed',started_at=coalesce(started_at,now()),
        completed_at=now(),error_message=$2 WHERE id=$1 AND status IN ('queued','running')`,
        [jobId,e instanceof Error?e.message:String(e)]).catch(()=>{});
      throw e;
    }finally{
      if(gotLock)await conn.query('SELECT pg_advisory_unlock(1200400,$1)',[sourceId]).catch(()=>{});
      conn.release();
    }
  }
  private async saveBatch(sourceId:number,jobId:string,channels:XmlChannel[],programmes:XmlProgramme[]){
    const toUpsert=new Map<string,XmlChannel>();
    for(const ch of channels)toUpsert.set(ch.external_channel_id,ch);
    for(const p of programmes)if(!toUpsert.has(p.external_channel_id))toUpsert.set(p.external_channel_id,{external_channel_id:p.external_channel_id,display_name:null,icon_url:null});
    return this.db.tx(async (c:DbClient)=>{
      const items=Array.from(toUpsert.values());
      if(items.length){
        await c.query(`INSERT INTO epg.channels(source_id,external_channel_id,display_name,icon_url)
          SELECT $1,x.external_channel_id,x.display_name,x.icon_url FROM
          jsonb_to_recordset($2::jsonb) AS x(external_channel_id text,display_name text,icon_url text)
          ON CONFLICT(source_id,external_channel_id) DO UPDATE SET
          display_name=coalesce(EXCLUDED.display_name,epg.channels.display_name),
          icon_url=coalesce(EXCLUDED.icon_url,epg.channels.icon_url)`,[sourceId,JSON.stringify(items)]);
      }
      if(programmes.length){
        const unique=new Map<string,XmlProgramme>();for(const p of programmes)unique.set(`${p.external_channel_id}|${p.starts_at}|${p.language_code}`,p);
        await c.query(`INSERT INTO epg.programmes(epg_channel_id,starts_at,ends_at,language_code,title,description,age_limit,last_import_job_id)
          SELECT ch.id,x.starts_at::timestamptz,x.ends_at::timestamptz,x.language_code,
            x.title,x.description,x.age_limit,$3::bigint
          FROM jsonb_to_recordset($2::jsonb) AS x(
            external_channel_id text,starts_at text,ends_at text,language_code text,title text,description text,age_limit integer)
          JOIN epg.channels ch ON ch.source_id=$1 AND ch.external_channel_id=x.external_channel_id
          ON CONFLICT(epg_channel_id,starts_at,language_code) DO UPDATE SET
            ends_at=EXCLUDED.ends_at,title=EXCLUDED.title,description=EXCLUDED.description,
            age_limit=EXCLUDED.age_limit,last_import_job_id=EXCLUDED.last_import_job_id`,
          [sourceId,JSON.stringify([...unique.values()]),jobId]);
      }
      return {channels:channels.length,programmes:programmes.length};
    });
  }
}
