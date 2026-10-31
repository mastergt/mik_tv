import {Injectable,inject} from '@angular/core';
import {HttpClient,HttpParams} from '@angular/common/http';
import {Entitlements,Page,Subscriber,Terminal,TerminalSession,PlaybackSession} from './models';
@Injectable({providedIn:'root'})
export class SubscribersApi {
 private http=inject(HttpClient);private base='/api/v1';
 private params(q:Record<string,string|number|undefined|null>){let p=new HttpParams();for(const [k,v] of Object.entries(q))if(v!==null&&v!==undefined&&v!=='')p=p.set(k,String(v));return p;}
 abonents(q:{providerId?:number;search?:string;limit?:number;offset?:number}={}){
  return this.http.get<Page<Subscriber>>(`${this.base}/abonents`,{params:this.params(q)});
 }
 abonent(id:string){return this.http.get<Subscriber>(`${this.base}/abonents/${id}`);}
 createAbonent(v:Record<string,unknown>){return this.http.post<Subscriber>(`${this.base}/abonents`,v);}
 updateAbonent(id:string,v:Record<string,unknown>){return this.http.patch<Subscriber>(`${this.base}/abonents/${id}`,v);}
 revealPassword(id:string){return this.http.post<{password:string}>(`${this.base}/abonents/${id}/reveal-password`,{});}
 entitlements(id:string){return this.http.get<Entitlements>(`${this.base}/abonents/${id}/entitlements`);}
 grant(id:string,kind:'playlists'|'streams',v:Record<string,unknown>){return this.http.post(`${this.base}/abonents/${id}/${kind}`,v);}
 revoke(id:string,kind:'playlists'|'streams',itemId:string){return this.http.delete(`${this.base}/abonents/${id}/${kind}/${itemId}`);}
 terminals(q:{providerId?:number;abonentId?:string;search?:string;limit?:number;offset?:number}={}){
  return this.http.get<Page<Terminal>>(`${this.base}/terminals`,{params:this.params(q)});
 }
 terminal(id:string){return this.http.get<Terminal>(`${this.base}/terminals/${id}`);}
 updateTerminal(id:string,v:Record<string,unknown>){return this.http.patch<Terminal>(`${this.base}/terminals/${id}`,v);}
 sessions(id:string){return this.http.get<TerminalSession[]>(`${this.base}/terminals/${id}/sessions`);}
 revokeSession(id:string,sid:string){return this.http.post(`${this.base}/terminals/${id}/sessions/${sid}/revoke`,{});}
 playback(id:string){return this.http.get<PlaybackSession[]>(`${this.base}/terminals/${id}/playback`);}
 settings(id:string){return this.http.get<{settings:Record<string,unknown>;last_stream_id:string|null}>(`${this.base}/terminals/${id}/settings`);}
 favorites(id:string){return this.http.get<{stream_id:string;name:string;position:number|null}[]>(`${this.base}/terminals/${id}/favorites`);}
}
