import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../common/db';
import { Audit } from '../common/audit';
import { Authz, Actor } from '../auth/authz';
import { StreamDto, SourceDto, PlaylistDto, PlaylistItemsDto, GenreDto, AppTypeDto } from '../common/dto';
import { dto } from '../common/validate';
import { dbError, intId, page, providerId, requireProviders } from '../common/http';
import { only, sqlInsert, sqlUpdate } from '../common/sql';
import type { PoolClient } from 'pg';

const streamCols=['number','name','description','app_type_id','logo_key','visibility','is_public','is_adult','age_rating','is_radio','enabled'];
const playlistCols=['name','description','visibility','is_public','is_hidden','enabled','expires_at','price_kopecks','currency'];
const sourceCols=['source_kind','protocol','url','priority','provider_id','enabled','dvr_url_mode','dvr_window_seconds','comment'];
type Visible = {visibility:'all'|'selected',provider_ids:number[]};
@Injectable()
export class CatalogService {
  constructor(@Inject(Db) private readonly db:Db, @Inject(Audit) private readonly audit:Audit, @Inject(Authz) private readonly authz:Authz){}
  async appTypes(actor:Actor) {
    const s=await this.authz.scope(actor,'streams.read');
    if(!s.global&&!s.providers.length)throw new ForbiddenException('streams.read required');
    return this.db.rows('SELECT * FROM catalog.app_types WHERE enabled=true ORDER BY id');
  }
  async genres(actor:Actor,providerIdRaw?:string) {
    const pid=providerIdRaw===undefined?undefined:providerId(providerIdRaw);
    await this.authz.listScope(actor,'genres.read',pid);
    return this.db.rows(`SELECT g.* FROM catalog.genres g WHERE ($1::integer IS NULL OR g.visibility='all'
      OR EXISTS (SELECT 1 FROM catalog.genre_providers gp WHERE gp.genre_id=g.id AND gp.provider_id=$1)) ORDER BY g.name`,[pid??null]);
  }
  async createGenre(actor:Actor,raw:unknown) {
    const v=dto(GenreDto,raw),target:Visible={visibility:v.visibility??'all',provider_ids:v.provider_ids??[]};
    await this.canWrite(actor,'genres.write',target);
    return this.db.tx(async c=>{
      try {
        await this.validateVisibility(c,target);
        const q=sqlInsert('catalog.genres',{...only(v,['name','visibility','is_adult']),created_by:actor.id,updated_by:actor.id});
        const item=(await c.query(q.sql,q.values)).rows[0];
        if(target.provider_ids.length)await c.query('INSERT INTO catalog.genre_providers(genre_id,provider_id) SELECT $1,unnest($2::integer[])',[item.id,target.provider_ids]);
        await this.audit.write(c,actor.id,'genres.create','catalog.genres',String(item.id),null,Object.keys(v));
        return {...item,provider_ids:target.provider_ids};
      }catch(e){dbError(e)}
    });
  }
  async updateGenre(actor:Actor,idRaw:string,raw:unknown) {
    const id=intId(idRaw),v=dto(GenreDto,raw,true);
    return this.db.tx(async c=>{
      try {
        const row=(await c.query<{visibility:'all'|'selected'}>('SELECT visibility FROM catalog.genres WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!row)throw new NotFoundException();
        const rel=await c.query<{provider_id:number}>('SELECT provider_id FROM catalog.genre_providers WHERE genre_id=$1',[id]);
        const old:Visible={visibility:row.visibility,provider_ids:rel.rows.map(x=>x.provider_id)};
        await this.canWrite(actor,'genres.write',old,c);
        const target:Visible={visibility:v.visibility??old.visibility,provider_ids:v.provider_ids??(v.visibility&&v.visibility!==old.visibility?[]:old.provider_ids)};
        await this.validateVisibility(c,target);await this.canWrite(actor,'genres.write',target,c);
        const fields=only(v,['name','visibility','is_adult']);let result;
        if(Object.keys(fields).length){const q=sqlUpdate('catalog.genres',{...fields,updated_by:actor.id},id);result=(await c.query(q.sql,q.values)).rows[0];}
        else result=(await c.query('SELECT * FROM catalog.genres WHERE id=$1',[id])).rows[0];
        if(v.visibility!==undefined||v.provider_ids!==undefined){
          await c.query('DELETE FROM catalog.genre_providers WHERE genre_id=$1',[id]);
          if(target.provider_ids.length)await c.query('INSERT INTO catalog.genre_providers(genre_id,provider_id) SELECT $1,unnest($2::integer[])',[id,target.provider_ids]);
        }
        await this.audit.write(c,actor.id,'genres.update','catalog.genres',id,null,Object.keys(v));return result;
      }catch(e){dbError(e)}
    });
  }
  async createAppType(actor:Actor,raw:unknown) {
    await this.authz.global(actor,'streams.write');const v=dto(AppTypeDto,raw);
    return this.db.tx(async c=>{
      try {
        const q=sqlInsert('catalog.app_types',only(v,['code','name','enabled']));const item=(await c.query(q.sql,q.values)).rows[0];
        await this.audit.write(c,actor.id,'app_types.create','catalog.app_types',String(item.id),null,Object.keys(v));return item;
      }catch(e){dbError(e)}
    });
  }
  async updateAppType(actor:Actor,idRaw:string,raw:unknown) {
    await this.authz.global(actor,'streams.write');const id=intId(idRaw),v=dto(AppTypeDto,raw,true);
    return this.db.tx(async c=>{
      try {
        const q=sqlUpdate('catalog.app_types',only(v,['code','name','enabled']),id);const item=(await c.query(q.sql,q.values)).rows[0];
        if(!item)throw new NotFoundException();
        await this.audit.write(c,actor.id,'app_types.update','catalog.app_types',id,null,Object.keys(v));return item;
      }catch(e){dbError(e)}
    });
  }
  private async linked(c:PoolClient,kind:'stream'|'playlist',id:string):Promise<Visible> {
    const table=kind==='stream'?'streams':'playlists';
    const join=kind==='stream'?'stream_providers':'playlist_providers';
    const fk=kind+'_id';
    const obj=(await c.query<{visibility:'all'|'selected'}>(`SELECT visibility FROM catalog.${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!obj)throw new NotFoundException();
    const rel=await c.query<{provider_id:number}>(`SELECT provider_id FROM catalog.${join} WHERE ${fk}=$1 ORDER BY provider_id`,[id]);
    return {visibility:obj.visibility,provider_ids:rel.rows.map(x=>x.provider_id)};
  }
  private async canWrite(actor:Actor,perm:string,v:Visible,c?:PoolClient) {
    if(v.visibility==='all') return this.authz.global(actor,perm,c);
    if(!v.provider_ids.length)throw new BadRequestException('Selected visibility requires providers');
    for(const pid of v.provider_ids)await this.authz.provider(actor,perm,pid,c);
  }
  private async validateVisibility(c:PoolClient,v:Visible) {
    if(v.visibility==='selected'&&!v.provider_ids.length)throw new BadRequestException('Select at least one provider');
    if(v.visibility==='all'&&v.provider_ids.length)throw new BadRequestException('Global resource cannot have provider_ids');
    if(new Set(v.provider_ids).size!==v.provider_ids.length)throw new BadRequestException('Duplicate providers');
    await requireProviders(this.db,v.provider_ids,c);
  }
  private async syncProviders(c:PoolClient,kind:'stream'|'playlist',id:string,providerIds:number[]) {
    const table=kind==='stream'?'stream_providers':'playlist_providers'; const fk=kind+'_id';
    await c.query(`DELETE FROM catalog.${table} WHERE ${fk}=$1`,[id]);
    if(providerIds.length) await c.query(`INSERT INTO catalog.${table}(${fk},provider_id) SELECT $1,unnest($2::integer[])`,[id,providerIds]);
  }
  private async syncGenres(c:PoolClient,id:string,ids:number[]) {
    await c.query('DELETE FROM catalog.stream_genres WHERE stream_id=$1',[id]);
    if(ids.length) {
      const rows=await c.query('SELECT id FROM catalog.genres WHERE id=ANY($1::integer[])',[ids]);
      if(rows.rows.length!==ids.length)throw new BadRequestException('Unknown genre');
      await c.query('INSERT INTO catalog.stream_genres(stream_id,genre_id) SELECT $1,unnest($2::integer[])',[id,ids]);
    }
  }
  private async streamDetails(id:string,pid?:number) {
    const r=await this.db.one<any>(`SELECT s.*,
       COALESCE((SELECT array_agg(provider_id ORDER BY provider_id) FROM catalog.stream_providers WHERE stream_id=s.id),'{}'::integer[]) AS provider_ids,
       COALESCE((SELECT array_agg(genre_id ORDER BY genre_id) FROM catalog.stream_genres WHERE stream_id=s.id),'{}'::integer[]) AS genre_ids
       FROM catalog.streams s WHERE s.id=$1 AND ($2::integer IS NULL OR catalog.stream_visible_to_provider(s.id,$2))`,[id,pid??null]);
    if(!r)throw new NotFoundException();return r;
  }
  async streams(actor:Actor,q:{providerId?:string;search?:string;appTypeId?:string;limit?:string;offset?:string}) {
    const pid=q.providerId===undefined?undefined:providerId(q.providerId);
    await this.authz.listScope(actor,'streams.read',pid);
    const {limit,offset}=page(q);
    if(q.search && q.search.length>200)throw new BadRequestException('Search too long');
    const app=q.appTypeId===undefined?null:providerId(q.appTypeId);
    return this.db.rows(`SELECT s.*, a.code app_type,
      (SELECT count(*)::integer FROM catalog.stream_sources so WHERE so.stream_id=s.id) source_count
      FROM catalog.streams s JOIN catalog.app_types a ON a.id=s.app_type_id
      WHERE ($1::integer IS NULL OR catalog.stream_visible_to_provider(s.id,$1))
        AND ($2::text IS NULL OR s.name ILIKE '%'||$2||'%')
        AND ($3::integer IS NULL OR s.app_type_id=$3)
      ORDER BY s.number,s.id LIMIT $4 OFFSET $5`,[pid??null,q.search??null,app,limit,offset]);
  }
  async stream(actor:Actor,idRaw:string,pidRaw?:string) {
    const id=intId(idRaw);const pid=pidRaw===undefined?undefined:providerId(pidRaw);
    await this.authz.listScope(actor,'streams.read',pid);return this.streamDetails(id,pid);
  }
  async createStream(actor:Actor,raw:unknown) {
    const v=dto(StreamDto,raw), target:Visible={visibility:v.visibility??'all',provider_ids:v.provider_ids??[]};
    await this.canWrite(actor,'streams.write',target);
    return this.db.tx(async c=>{
      try {
        await this.validateVisibility(c,target);
        const data={...only(v,streamCols),created_by:actor.id,updated_by:actor.id};const q=sqlInsert('catalog.streams',data);
        const s=(await c.query(q.sql,q.values)).rows[0];const id=String(s.id);
        await this.syncProviders(c,'stream',id,target.provider_ids);
        if(v.genre_ids)await this.syncGenres(c,id,v.genre_ids);
        await this.audit.write(c,actor.id,'streams.create','catalog.streams',id,null,Object.keys(v));return {...s,provider_ids:target.provider_ids,genre_ids:v.genre_ids??[]};
      }catch(e){dbError(e)}
    });
  }
  async updateStream(actor:Actor,idRaw:string,raw:unknown) {
    const id=intId(idRaw);const v=dto(StreamDto,raw,true);
    return this.db.tx(async c=>{
      try {
        const old=await this.linked(c,'stream',id);await this.canWrite(actor,'streams.write',old,c);
        const target:Visible={visibility:v.visibility??old.visibility,provider_ids:v.provider_ids??(v.visibility&&v.visibility!==old.visibility?[]:old.provider_ids)};
        await this.validateVisibility(c,target);await this.canWrite(actor,'streams.write',target,c);
        const fields=only(v,streamCols);let s;
        if(Object.keys(fields).length){const q=sqlUpdate('catalog.streams',{...fields,updated_by:actor.id},id);s=(await c.query(q.sql,q.values)).rows[0];}
        else s=(await c.query('SELECT * FROM catalog.streams WHERE id=$1',[id])).rows[0];
        if(v.provider_ids!==undefined||v.visibility!==undefined)await this.syncProviders(c,'stream',id,target.provider_ids);
        if(v.genre_ids!==undefined)await this.syncGenres(c,id,v.genre_ids);
        await this.audit.write(c,actor.id,'streams.update','catalog.streams',id,null,Object.keys(v));return s;
      }catch(e){dbError(e)}
    });
  }
  async deleteStream(actor:Actor,idRaw:string) {
    const id=intId(idRaw);
    return this.db.tx(async c=>{
      try {
        const old=await this.linked(c,'stream',id);await this.canWrite(actor,'streams.write',old,c);
        await c.query('DELETE FROM catalog.streams WHERE id=$1',[id]);
        await this.audit.write(c,actor.id,'streams.delete','catalog.streams',id,null);return {deleted:true};
      }catch(e){dbError(e)}
    });
  }
  async sources(actor:Actor,streamRaw:string,pidRaw?:string) {
    const id=intId(streamRaw),pid=pidRaw===undefined?undefined:providerId(pidRaw);
    await this.authz.listScope(actor,'sources.read',pid);
    await this.streamDetails(id,pid);
    return this.db.rows(`SELECT so.* FROM catalog.stream_sources so WHERE so.stream_id=$1
     AND ($2::integer IS NULL OR so.provider_id=$2 OR so.provider_id IS NULL)
     ORDER BY so.source_kind, so.provider_id NULLS LAST,so.priority`,[id,pid??null]);
  }
  private checkSource(v:SourceDto | Record<string,any>, original?:any) {
    const src={...original,...v};
    if(src.source_kind==='dvr'&&!src.dvr_url_mode)throw new BadRequestException('DVR source requires dvr_url_mode');
    if(src.source_kind==='live'&&(src.dvr_url_mode!=null||src.dvr_window_seconds!=null))throw new BadRequestException('LIVE cannot have DVR options');
    if(src.url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(src.url))throw new BadRequestException('Source URL needs explicit protocol');
  }
  async createSource(actor:Actor,streamRaw:string,raw:unknown) {
    const id=intId(streamRaw),v=dto(SourceDto,raw);
    const pid=v.provider_id??null;
    if(pid===null)await this.authz.global(actor,'sources.write');
    else {await this.authz.provider(actor,'sources.write',pid);await this.authz.ensureStreamVisible(id,pid);}
    this.checkSource(v);
    return this.db.tx(async c=>{
      try {
        const stream=await c.query('SELECT id FROM catalog.streams WHERE id=$1 FOR SHARE',[id]);if(!stream.rows[0])throw new NotFoundException();
        const data={...only(v,sourceCols),stream_id:id,created_by:actor.id,updated_by:actor.id};const q=sqlInsert('catalog.stream_sources',data);
        const result=(await c.query(q.sql,q.values)).rows[0];
        await this.audit.write(c,actor.id,'sources.create','catalog.stream_sources',String(result.id),pid,Object.keys(v));return result;
      }catch(e){dbError(e)}
    });
  }
  async updateSource(actor:Actor,idRaw:string,raw:unknown) {
    const id=intId(idRaw);const v=dto(SourceDto,raw,true);
    if(Object.prototype.hasOwnProperty.call(v,'provider_id'))throw new BadRequestException('provider_id cannot be changed');
    return this.db.tx(async c=>{
      try {
        const old=(await c.query('SELECT * FROM catalog.stream_sources WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw new NotFoundException();
        if(old.provider_id===null)await this.authz.global(actor,'sources.write',c);
        else {await this.authz.provider(actor,'sources.write',old.provider_id,c);await this.authz.ensureStreamVisible(String(old.stream_id),old.provider_id,c);}
        this.checkSource(v,old);
        const q=sqlUpdate('catalog.stream_sources',{...only(v,sourceCols),updated_by:actor.id},id);
        const result=(await c.query(q.sql,q.values)).rows[0];
        await this.audit.write(c,actor.id,'sources.update','catalog.stream_sources',id,old.provider_id,Object.keys(v));return result;
      }catch(e){dbError(e)}
    });
  }
  async deleteSource(actor:Actor,idRaw:string) {
    const id=intId(idRaw);
    return this.db.tx(async c=>{
      try {
        const old=(await c.query('SELECT stream_id::text,provider_id FROM catalog.stream_sources WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw new NotFoundException();
        if(old.provider_id===null)await this.authz.global(actor,'sources.write',c);
        else await this.authz.provider(actor,'sources.write',old.provider_id,c);
        await c.query('DELETE FROM catalog.stream_sources WHERE id=$1',[id]);
        await this.audit.write(c,actor.id,'sources.delete','catalog.stream_sources',id,old.provider_id);return {deleted:true};
      }catch(e){dbError(e)}
    });
  }
  async playlists(actor:Actor,q:{providerId?:string;search?:string;limit?:string;offset?:string}) {
    const pid=q.providerId===undefined?undefined:providerId(q.providerId);
    await this.authz.listScope(actor,'playlists.read',pid);
    const {limit,offset}=page(q);if(q.search&&q.search.length>200)throw new BadRequestException('Search too long');
    return this.db.rows(`SELECT p.*,(SELECT count(*)::integer FROM catalog.playlist_streams ps WHERE ps.playlist_id=p.id) streams_count
      FROM catalog.playlists p WHERE ($1::integer IS NULL OR catalog.playlist_visible_to_provider(p.id,$1))
      AND ($2::text IS NULL OR p.name ILIKE '%'||$2||'%') ORDER BY p.id DESC LIMIT $3 OFFSET $4`,[pid??null,q.search??null,limit,offset]);
  }
  async playlist(actor:Actor,idRaw:string,pidRaw?:string) {
    const id=intId(idRaw),pid=pidRaw===undefined?undefined:providerId(pidRaw);
    await this.authz.listScope(actor,'playlists.read',pid);
    const r=await this.db.one<any>(`SELECT p.*,COALESCE((SELECT array_agg(provider_id ORDER BY provider_id) FROM catalog.playlist_providers WHERE playlist_id=p.id),'{}'::integer[]) provider_ids
      FROM catalog.playlists p WHERE p.id=$1 AND ($2::integer IS NULL OR catalog.playlist_visible_to_provider(p.id,$2))`,[id,pid??null]);
    if(!r)throw new NotFoundException();
    r.items=await this.db.rows(`SELECT ps.id,ps.stream_id::text,ps.position,s.name,s.enabled FROM catalog.playlist_streams ps
      JOIN catalog.streams s ON s.id=ps.stream_id WHERE ps.playlist_id=$1 AND ($2::integer IS NULL OR catalog.stream_visible_to_provider(s.id,$2))
      ORDER BY ps.position`,[id,pid??null]);return r;
  }
  async createPlaylist(actor:Actor,raw:unknown) {
    const v=dto(PlaylistDto,raw),target:Visible={visibility:v.visibility??'all',provider_ids:v.provider_ids??[]};
    await this.canWrite(actor,'playlists.write',target);
    return this.db.tx(async c=>{
      try {
        await this.validateVisibility(c,target);
        const data={...only(v,playlistCols),created_by:actor.id,updated_by:actor.id};const q=sqlInsert('catalog.playlists',data);
        const p=(await c.query(q.sql,q.values)).rows[0],id=String(p.id);
        await this.syncProviders(c,'playlist',id,target.provider_ids);
        await this.audit.write(c,actor.id,'playlists.create','catalog.playlists',id,null,Object.keys(v));return {...p,provider_ids:target.provider_ids};
      }catch(e){dbError(e)}
    });
  }
  private async checkPlaylistItems(c:PoolClient,id:string,target:Visible,streamIds:string[]) {
    for(const sid of streamIds)intId(sid,'stream_id');
    if(!streamIds.length)return;
    const r=await c.query<{id:string,visibility:string}>(`SELECT id::text,visibility FROM catalog.streams WHERE id=ANY($1::bigint[])`,[streamIds]);
    if(r.rows.length!==streamIds.length)throw new BadRequestException('Unknown stream in playlist');
    if(target.visibility==='all'&&r.rows.some(x=>x.visibility!=='all'))
      throw new BadRequestException('Global playlist may contain only globally visible streams');
    for(const pid of target.provider_ids) {
      const check=await c.query<{count:string}>(`SELECT count(*) FROM catalog.streams s WHERE s.id=ANY($1::bigint[])
        AND catalog.stream_visible_to_provider(s.id,$2)`,[streamIds,pid]);
      if(Number(check.rows[0].count)!==streamIds.length)throw new BadRequestException(`Some streams unavailable to provider ${pid}`);
    }
  }
  async updatePlaylist(actor:Actor,idRaw:string,raw:unknown) {
    const id=intId(idRaw),v=dto(PlaylistDto,raw,true);
    return this.db.tx(async c=>{
      try {
        const old=await this.linked(c,'playlist',id);await this.canWrite(actor,'playlists.write',old,c);
        const target:Visible={visibility:v.visibility??old.visibility,provider_ids:v.provider_ids??(v.visibility&&v.visibility!==old.visibility?[]:old.provider_ids)};
        await this.validateVisibility(c,target);await this.canWrite(actor,'playlists.write',target,c);
        const existing=await c.query<{stream_id:string}>('SELECT stream_id::text FROM catalog.playlist_streams WHERE playlist_id=$1 ORDER BY position',[id]);
        await this.checkPlaylistItems(c,id,target,existing.rows.map(x=>x.stream_id));
        const fields=only(v,playlistCols);let p;
        if(Object.keys(fields).length){const q=sqlUpdate('catalog.playlists',{...fields,updated_by:actor.id},id);p=(await c.query(q.sql,q.values)).rows[0];}
        else p=(await c.query('SELECT * FROM catalog.playlists WHERE id=$1',[id])).rows[0];
        if(v.visibility!==undefined||v.provider_ids!==undefined)await this.syncProviders(c,'playlist',id,target.provider_ids);
        await this.audit.write(c,actor.id,'playlists.update','catalog.playlists',id,null,Object.keys(v));return p;
      }catch(e){dbError(e)}
    });
  }
  async replacePlaylistItems(actor:Actor,idRaw:string,raw:unknown) {
    const id=intId(idRaw),v=dto(PlaylistItemsDto,raw);
    if(v.stream_ids.length>10000)throw new BadRequestException('Playlist too large');
    return this.db.tx(async c=>{
      try {
        const old=await this.linked(c,'playlist',id);await this.canWrite(actor,'playlists.write',old,c);
        await this.checkPlaylistItems(c,id,old,v.stream_ids);
        await c.query('DELETE FROM catalog.playlist_streams WHERE playlist_id=$1',[id]);
        if(v.stream_ids.length)await c.query(`INSERT INTO catalog.playlist_streams(playlist_id,stream_id,position,updated_by)
          SELECT $1,ids.id::bigint,ids.ord::integer,$3 FROM unnest($2::text[]) WITH ORDINALITY AS ids(id,ord)`,[id,v.stream_ids,actor.id]);
        await this.audit.write(c,actor.id,'playlists.replace_items','catalog.playlists',id,null,['items']);
        return {playlist_id:id,streams_count:v.stream_ids.length};
      }catch(e){dbError(e)}
    });
  }
  async deletePlaylist(actor:Actor,idRaw:string) {
    const id=intId(idRaw);
    return this.db.tx(async c=>{
      try {
        const old=await this.linked(c,'playlist',id);await this.canWrite(actor,'playlists.write',old,c);
        await c.query('DELETE FROM catalog.playlists WHERE id=$1',[id]);
        await this.audit.write(c,actor.id,'playlists.delete','catalog.playlists',id,null);return {deleted:true};
      }catch(e){dbError(e)}
    });
  }
}
