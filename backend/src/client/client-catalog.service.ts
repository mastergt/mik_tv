import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Db,DbClient } from '../common/db';
import { ClientSession, numId } from './client-auth';

// One consistent access rule, reused by listings, EPG and playback.
// Public streams are available to guests; assigned paid streams require a valid subscriber session.
export const STREAM_ACCESS_SQL=`
  FROM catalog.streams s
  LEFT JOIN catalog.stream_provider_overrides o ON o.stream_id=s.id AND o.provider_id=$1
  LEFT JOIN subscribers.parental_settings ps ON ps.abonent_id=$2
  JOIN catalog.app_types at ON at.id=s.app_type_id AND at.enabled
  WHERE s.enabled AND COALESCE(o.enabled_override,true)
    AND catalog.stream_visible_to_provider(s.id,$1)
    AND (NOT s.is_adult OR ($2::bigint IS NOT NULL AND COALESCE(ps.block_adult,true)=false))
    AND (ps.max_age_rating IS NULL OR s.age_rating<=ps.max_age_rating)
    AND (
      s.is_public
      OR ($2::bigint IS NOT NULL AND (
        EXISTS (SELECT 1 FROM subscribers.abonent_streams e
          WHERE e.abonent_id=$2 AND e.stream_id=s.id AND e.enabled
            AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now()))
        OR EXISTS (SELECT 1 FROM subscribers.abonent_playlists ap
          JOIN catalog.playlists pl ON pl.id=ap.playlist_id
          JOIN catalog.playlist_streams ps2 ON ps2.playlist_id=pl.id
          WHERE ap.abonent_id=$2 AND ap.enabled
            AND ap.valid_from<=now() AND (ap.valid_until IS NULL OR ap.valid_until>now())
            AND pl.enabled AND (pl.expires_at IS NULL OR pl.expires_at>now())
            AND catalog.playlist_visible_to_provider(pl.id,$1)
            AND ps2.stream_id=s.id AND ps2.enabled)
      ))
    )`;

function logoURL(key:string|null):string|null {
  if(!key)return null;
  const m=/^epg-logos\/([a-f0-9]{64}\.(?:png|jpg|gif|webp))$/.exec(key);
  return m?`/api/v1/epg/logos/${m[1]}`:null;
}
function limitOffset(limit?:string,offset?:string){
  const l=limit===undefined?100:Number(limit),o=offset===undefined?0:Number(offset);
  if(!Number.isInteger(l)||l<1||l>500||!Number.isSafeInteger(o)||o<0||o>5000000)
    throw new BadRequestException('Invalid pagination');
  return {limit:l,offset:o};
}
function dates(from?:string,to?:string){
  const start=from?new Date(from):new Date();
  const end=to?new Date(to):new Date(start.getTime()+86400000);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end.getTime()-start.getTime()>14*86400000)
    throw new BadRequestException('Invalid EPG interval (max 14 days)');
  return {start:start.toISOString(),end:end.toISOString()};
}
@Injectable()
export class ClientCatalogService {
  constructor(@Inject(Db) private readonly db:Db){}
  async streamAllowed(ctx:ClientSession,streamId:string,c?:DbClient):Promise<boolean>{
    return !!(await this.db.one(`SELECT 1 ${STREAM_ACCESS_SQL} AND s.id=$3`,
      [ctx.provider_id,ctx.abonent_id,streamId],c));
  }
  async assertAllowed(ctx:ClientSession,streamId:string,c?:DbClient){
    if(!await this.streamAllowed(ctx,streamId,c))throw new NotFoundException('Channel not available');
  }
  async streams(ctx:ClientSession,q:{limit?:string;offset?:string;app_type?:string}){
    const {limit,offset}=limitOffset(q.limit,q.offset);
    const type=q.app_type?.trim()||null;
    if(type && !/^[a-z][a-z0-9_]{0,40}$/.test(type))throw new BadRequestException('Invalid app_type');
    const rows=await this.db.rows<{logo_key:string|null;[key:string]:unknown}>(`
      SELECT s.id::text id,COALESCE(o.number_override,s.number) number,
        COALESCE(o.name_override,s.name) name,s.description,s.is_public,s.is_radio,
        s.is_adult,s.age_rating,at.code app_type,COALESCE(o.logo_key_override,s.logo_key) logo_key,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) ORDER BY g.name),'[]'::jsonb)
         FROM catalog.stream_genres sg JOIN catalog.genres g ON g.id=sg.genre_id
         WHERE sg.stream_id=s.id AND (g.visibility='all' OR EXISTS(
           SELECT 1 FROM catalog.genre_providers gp WHERE gp.genre_id=g.id AND gp.provider_id=$1))) genres
      ${STREAM_ACCESS_SQL}
      AND ($3::text IS NULL OR at.code=$3)
      ORDER BY COALESCE(o.number_override,s.number),s.id LIMIT $4 OFFSET $5`,
      [ctx.provider_id,ctx.abonent_id,type,limit+1,offset]);
    const has_more=rows.length>limit;
    return {items:rows.slice(0,limit).map(({logo_key,...s})=>({...s,logo_url:logoURL(logo_key)})),
      limit,offset,has_more};
  }
  async sources(ctx:ClientSession,idRaw:string,kind:'live'|'dvr',c?:DbClient){
    const id=numId(idRaw,'stream_id');
    await this.assertAllowed(ctx,id,c);
    return this.db.rows(`SELECT ss.id::text id,ss.protocol,ss.url,ss.priority,
       ss.provider_id,ss.dvr_url_mode,ss.dvr_window_seconds
       FROM catalog.stream_sources ss
       WHERE ss.stream_id=$1 AND ss.enabled AND ss.source_kind=$2
         AND (ss.provider_id IS NULL OR ss.provider_id=$3)
       ORDER BY CASE WHEN ss.provider_id=$3 THEN 0 ELSE 1 END,ss.priority,ss.id LIMIT 20`,
      [id,kind,ctx.provider_id],c);
  }
  async epg(ctx:ClientSession,streamRaw:string,from?:string,to?:string){
    const id=numId(streamRaw,'stream_id');
    await this.assertAllowed(ctx,id);
    const t=dates(from,to);
    return this.db.rows(`SELECT p.id::text id,p.starts_at,p.ends_at,p.title,p.description,
        p.age_limit,p.language_code
      FROM LATERAL (
        SELECT m.epg_channel_id FROM epg.stream_mappings m
        JOIN epg.channels ch ON ch.id=m.epg_channel_id
        JOIN epg.sources src ON src.id=ch.source_id
        WHERE m.stream_id=$1 AND m.enabled AND src.enabled
          AND (m.provider_id=$2 OR m.provider_id IS NULL)
          AND (src.visibility='all' OR EXISTS (SELECT 1 FROM epg.source_providers sp
            WHERE sp.source_id=src.id AND sp.provider_id=$2))
        ORDER BY CASE WHEN m.provider_id=$2 THEN 0 ELSE 1 END,m.priority,m.id LIMIT 1
      ) m JOIN epg.programmes p ON p.epg_channel_id=m.epg_channel_id
      WHERE p.starts_at<$4::timestamptz AND (p.ends_at IS NULL OR p.ends_at>$3::timestamptz)
      ORDER BY p.starts_at LIMIT 1000`,[id,ctx.provider_id,t.start,t.end]);
  }
  async dvr(ctx:ClientSession,streamRaw:string,startRaw?:string,endRaw?:string){
    const streamId=numId(streamRaw,'stream_id');
    if(!startRaw||!endRaw)throw new BadRequestException('start and end are required');
    const start=new Date(startRaw),end=new Date(endRaw),now=Date.now();
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||
      end<=start||end.getTime()-start.getTime()>12*3600000||end.getTime()>now+300000)
      throw new BadRequestException('Invalid archive interval');
    const all=await this.sources(ctx,streamId,'dvr');
    const params={start_unix:String(Math.floor(start.getTime()/1000)),
      end_unix:String(Math.floor(end.getTime()/1000)),
      duration_sec:String(Math.ceil((end.getTime()-start.getTime())/1000)),
      start_iso:encodeURIComponent(start.toISOString()),end_iso:encodeURIComponent(end.toISOString())};
    const result=[];
    for(const s of all){
      if(s.dvr_url_mode!=='template')continue; // API-mode DVR needs a separate provider adapter.
      if(s.dvr_window_seconds!==null && start.getTime()<now-Number(s.dvr_window_seconds)*1000)continue;
      const url=String(s.url).replace(/\{(start_unix|end_unix|duration_sec|start_iso|end_iso)\}/g,
        (_,key:keyof typeof params)=>params[key]);
      result.push({id:s.id,protocol:s.protocol,priority:s.priority,url});
    }
    return {stream_id:streamId,start:start.toISOString(),end:end.toISOString(),sources:result};
  }
  async settings(ctx:ClientSession){
    const row=await this.db.one<{settings:object;last_stream_id:string|null}>(`
      SELECT settings,last_stream_id::text FROM subscribers.terminal_settings
      WHERE terminal_id=$1`,[ctx.terminal_id]);
    return row??{settings:{},last_stream_id:null};
  }
  async saveSettings(ctx:ClientSession,raw:unknown){
    const d=raw;
    if(!d||typeof d!=='object'||Array.isArray(d))throw new BadRequestException('Expected settings object');
    const v=d as Record<string,unknown>;
    const allowed=['theme','language','autoplay','player_mode','epg_locale'];
    if(Object.keys(v).some(key=>!allowed.includes(key))||JSON.stringify(v).length>2048)
      throw new BadRequestException('Invalid settings fields');
    for(const [key,value] of Object.entries(v)){
      if(key==='autoplay'){
        if(typeof value!=='boolean')throw new BadRequestException('Invalid autoplay');
      }else if(typeof value!=='string'||value.length>50)
        throw new BadRequestException(`Invalid ${key}`);
    }
    await this.db.rows(`INSERT INTO subscribers.terminal_settings(terminal_id,settings)
      VALUES($1,$2::jsonb) ON CONFLICT(terminal_id) DO UPDATE SET settings=excluded.settings`,
      [ctx.terminal_id,JSON.stringify(v)]);
    return {settings:v};
  }
  async favorites(ctx:ClientSession){
    return this.db.rows(`SELECT f.stream_id::text stream_id,f.position
      FROM subscribers.terminal_favorites f
      JOIN (SELECT s.id ${STREAM_ACCESS_SQL}) permitted ON permitted.id=f.stream_id
      WHERE f.terminal_id=$3 ORDER BY f.position NULLS LAST,f.added_at`,
      [ctx.provider_id,ctx.abonent_id,ctx.terminal_id]);
  }
  async setFavorite(ctx:ClientSession,streamRaw:string,enable:boolean){
    const streamId=numId(streamRaw,'stream_id');
    if(enable){
      await this.assertAllowed(ctx,streamId);
      await this.db.rows(`INSERT INTO subscribers.terminal_favorites(terminal_id,stream_id)
        VALUES($1,$2) ON CONFLICT DO NOTHING`,[ctx.terminal_id,streamId]);
    }else await this.db.rows('DELETE FROM subscribers.terminal_favorites WHERE terminal_id=$1 AND stream_id=$2',
      [ctx.terminal_id,streamId]);
    return {ok:true};
  }
}
