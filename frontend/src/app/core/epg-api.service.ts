import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface EpgSource {
  id:number;provider_ids:number[];name:string;type:string;download_uri:string;enabled:boolean;visibility:'all'|'selected';refresh_interval_seconds:number;
  channel_count:number;running_jobs:number;last_download_at:string|null;last_success_at:string|null;last_error:string|null;comment:string|null;
}
export interface EpgChannel {id:string;external_channel_id:string;display_name:string|null;icon_url:string|null;future_count:number}
export interface EpgChannelSearch { id:string;external_channel_id:string;display_name:string|null;icon_url:string|null;source_id:number;source_name:string }
export interface EpgStreamAssignment {stream_id:string;provider_id:number|null;logo_key:string|null;mapping:null|{
  id:string;stream_id:string;epg_channel_id:string;provider_id:number|null;priority:number;
  external_channel_id:string;display_name:string|null;icon_url:string|null;source_id:number;source_name:string;
}}
export interface EpgJob {id:string;status:'running'|'queued'|'success'|'failed';started_at:string|null;completed_at:string|null;created_at:string;channels_count:number;programmes_count:number;error_message:string|null}
export interface EpgMapping {id:string;stream_id:string;provider_id:number|null;priority:number;enabled:boolean;stream_name:string;number:number;
  epg_channel_id:string;external_channel_id:string;epg_name:string|null;source_id:number;source_name:string}
export interface EpgProgramme {id:string;starts_at:string;ends_at:string|null;title:string|null;description:string|null;age_limit:number|null;language_code:string;epg_channel_id:string}
export interface EpgSourceForm {name:string;download_uri:string;enabled:boolean;visibility:'all'|'selected';provider_ids:number[];refresh_interval_seconds:number;comment:string|null}

@Injectable({providedIn:'root'})
export class EpgApi {
  private http=inject(HttpClient);private base='/api/v1/epg';
  private params(args:Record<string,unknown>){let p=new HttpParams();for(const [k,v] of Object.entries(args))if(v!==null&&v!==undefined&&v!=='')p=p.set(k,String(v));return p;}
  sources(providerId?:number){return this.http.get<EpgSource[]>(`${this.base}/sources`,{params:this.params({providerId})});}
  createSource(body:EpgSourceForm){return this.http.post<{id:number}>(`${this.base}/sources`,body);}
  updateSource(id:number,body:Partial<EpgSourceForm>){return this.http.patch(`${this.base}/sources/${id}`,body);}
  importSource(id:number){return this.http.post<{job_id:string;status:string}>(`${this.base}/sources/${id}/import`,{});}
  channels(id:number,search='',offset=0,providerId?:number){return this.http.get<EpgChannel[]>(`${this.base}/sources/${id}/channels`,{params:this.params({search,offset,providerId,limit:70})});}
  jobs(id:number,providerId?:number){return this.http.get<EpgJob[]>(`${this.base}/sources/${id}/jobs`,{params:this.params({providerId})});}
  searchChannels(query:string,providerId?:number){return this.http.get<EpgChannelSearch[]>(`${this.base}/channel-search`,{params:this.params({query,providerId})});}
  streamAssignment(streamId:string,providerId?:number){return this.http.get<EpgStreamAssignment>(`${this.base}/streams/${streamId}/assignment`,{params:this.params({providerId})});}
  importLogo(streamId:string,epg_channel_id:string,provider_id:number|null){return this.http.post<{logo_key:string;logo_url:string}>(`${this.base}/streams/${streamId}/logo-from-epg`,{epg_channel_id,provider_id});}
  streamOptions(providerId?:number,search=''){return this.http.get<{id:string;name:string;number:number}[]>(`${this.base}/stream-options`,{params:this.params({providerId,search})});}
  mappings(providerId?:number,search='',offset=0){return this.http.get<EpgMapping[]>(`${this.base}/mappings`,{params:this.params({providerId,search,offset,limit:50})});}
  setMapping(body:{stream_id:string;epg_channel_id:string;provider_id:number|null;priority:number}){return this.http.post<{id:string}>(`${this.base}/mappings`,body);}
  removeMapping(id:string){return this.http.delete(`${this.base}/mappings/${id}`);}
  programmes(streamId:string,providerId?:number,from?:string,to?:string){return this.http.get<EpgProgramme[]>(`${this.base}/programmes`,{params:this.params({streamId,providerId,from,to})});}
}
