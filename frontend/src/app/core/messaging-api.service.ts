import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
export interface MessageAudience {
 provider_ids?:number[]; all_providers?:boolean; abonent_ids?:string[]; balance_lt_kopecks?:number;
}
export interface MessageItem {
 id:string; provider_id:number|null; provider_name?:string|null; title:string|null; body:string;image_key:string|null;
 display_type:'popup'|'ticker'|'banner'|'system';priority:number;duration_seconds:number|null;
 ticker_speed:number|null;requires_ack:boolean;status:'draft'|'active'|'archived';enabled:boolean;
 created_at:string;updated_at:string;dispatch_count?:number;audience?:MessageAudience;
}
export interface MessageSchedule {
 id:string; run_at:string|null;cron_expression:string|null;timezone:string;next_run_at:string|null;enabled:boolean;
}
export interface MessageDispatch {
 id:string;scheduled_for:string;status:string;matched_recipients:number|null;
 created_at:string;finished_at:string|null;error_message:string|null;
 delivery_count:number;shown_count:number;acknowledged_count:number;
}
export interface MessageDetail extends MessageItem {audience:MessageAudience;schedules:MessageSchedule[];dispatches:MessageDispatch[];}
export interface MessagePage {items:MessageItem[];total:number;limit:number;offset:number;}
@Injectable({providedIn:'root'})
export class MessagingApi {
 private http=inject(HttpClient);
 private base='/api/v1/messages';
 list(q:{providerId?:number;search?:string;limit?:number;offset?:number}){
  let params=new HttpParams();
  for(const [k,v] of Object.entries(q))if(v!==undefined&&v!==null&&v!=='')params=params.set(k,String(v));
  return this.http.get<MessagePage>(this.base,{params});
 }
 get(id:string){return this.http.get<MessageDetail>(`${this.base}/${id}`);}
 create(v:Record<string,unknown>){return this.http.post<MessageItem>(this.base,v);}
 uploadImage(file:File,owner:number|null){const data=new FormData();data.append('image',file);return this.http.post<{image_key:string;url:string}>(`${this.base}/images`,data,{params:owner===null?undefined:{providerId:String(owner)}});}
 update(id:string,v:Record<string,unknown>){return this.http.patch<MessageItem>(`${this.base}/${id}`,v);}
 preview(id:string){return this.http.get<{recipients:number}>(`${this.base}/${id}/preview`);}
 send(id:string){return this.http.post<{id:string;status:string}>(`${this.base}/${id}/send`,{});}
 schedule(id:string,v:Record<string,unknown>){return this.http.post<MessageSchedule>(`${this.base}/${id}/schedules`,v);}
 disableSchedule(id:string,sid:string){return this.http.delete(`${this.base}/${id}/schedules/${sid}`);}
}
