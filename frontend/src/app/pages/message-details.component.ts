import {Component,inject,signal} from '@angular/core';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MessagingApi,MessageDetail} from '../core/messaging-api.service';
import {ProviderContext} from '../core/provider-context.service';
import {AuthService} from '../core/auth.service';
import {Feedback} from '../core/feedback.service';
import {MessageDialog} from '../dialogs/message-dialog.component';
import {MessageScheduleDialog} from '../dialogs/message-schedule-dialog.component';
import {ConfirmDialog} from '../dialogs/confirm-dialog.component';
@Component({selector:'app-message-details',standalone:true,imports:[RouterLink,MatButtonModule,MatProgressBarModule],template:`
<div class="page">
 <a routerLink="/messages" class="back-link"><span class="material-symbols-outlined">arrow_back</span> Все сообщения</a>
 <div class="page-head"><div><div class="eyebrow">РАССЫЛКА АБОНЕНТАМ</div><h1 class="page-title">{{message()?.title||'Сообщение'}}</h1>
  <p class="page-desc">Управление содержимым, аудитория, расписание и история запусков.</p></div>
  @if(canWrite()&&message()?.status!=='archived'){<button mat-stroked-button (click)="edit()"><span class="material-symbols-outlined">edit</span> Изменить</button>}
 </div>
 @if(loading()){<mat-progress-bar mode="indeterminate"/>}
 @if(message();as m){
 <div class="info-cards">
  <div class="surface info-card"><span class="material-symbols-outlined">campaign</span><small>ФОРМАТ</small><strong>{{typeName(m.display_type)}}</strong></div>
  <div class="surface info-card"><span class="material-symbols-outlined">supervisor_account</span><small>ПОЛУЧАТЕЛИ ПО ФИЛЬТРУ</small><strong>{{recipientCount()===null?'—':recipientCount()}}</strong></div>
  <div class="surface info-card"><span class="material-symbols-outlined">send</span><small>ЗАПУСКОВ</small><strong>{{m.dispatches.length}}</strong></div>
  <div class="surface info-card"><span class="material-symbols-outlined">toggle_on</span><small>СТАТУС</small><strong>{{m.status==='active'&&m.enabled?'Активно':m.status==='draft'?'Черновик':'Отключено / архив'}}</strong></div>
 </div>
 <div class="details-grid">
 <section class="surface panel">
  <div class="section-head"><h2>Содержимое</h2><span class="pill">Приоритет {{m.priority}}</span></div>
  <div class="preview-message" [class.ticker]="m.display_type==='ticker'">
   <div class="preview-label">{{m.display_type==='ticker'?'БЕГУЩАЯ СТРОКА':'ПРЕДПРОСМОТР СООБЩЕНИЯ'}}</div>
   <h3>{{m.title||'Сообщение'}}</h3><p>{{m.body}}</p>
   @if(m.image_key){<img class="message-image" [src]="'/api/v1/messages/images/'+m.image_key" alt="Изображение сообщения">}
  </div>
  <div class="settings"><span>Длительность: <b>{{m.duration_seconds||'по умолчанию'}} сек.</b></span>
   <span>Подтверждение: <b>{{m.requires_ack?'Да':'Нет'}}</b></span>
   <span>Провайдер: <b>{{providerName(m.provider_id)}}</b></span></div>
  <h2 style="margin-top:29px">Аудитория</h2>
  <div class="audience"><span class="material-symbols-outlined">groups</span>
   <div><strong>{{audienceTitle(m)}}</strong><p>{{audienceDetail(m)}}</p></div>
  </div>
  <div class="actions">
   <button mat-stroked-button (click)="preview()" [disabled]="counting()">Обновить количество получателей</button>
   @if(canSend()&&m.enabled&&m.status==='active'){<button mat-flat-button class="primary-btn" (click)="send()"><span class="material-symbols-outlined">send</span> Отправить сейчас</button>}
  </div>
  <p class="hint">Количество получателей — оценка по текущему состоянию базы. При отправке фильтр применяется повторно.</p>
 </section>
 <section class="surface panel">
  <div class="section-head"><h2>Расписание</h2>@if(canWrite()&&m.status==='active'&&m.enabled){<button mat-stroked-button (click)="schedule()">+ Добавить</button>}</div>
  @for(s of m.schedules;track s.id){<div class="schedule-item">
   <div class="schedule-icon"><span class="material-symbols-outlined">event</span></div>
   <div class="schedule-text"><strong>{{s.cron_expression?'Ежедневно':'Однократно'}}</strong>
    <div>{{s.cron_expression?(s.cron_expression.split(' ')[1]+':'+s.cron_expression.split(' ')[0].padStart(2,'0')+' · '+s.timezone):(s.run_at?date(s.run_at):'—')}}</div>
    <small>{{s.enabled?(s.next_run_at?'Следующий запуск: '+date(s.next_run_at):'Ожидает'):'Отключено'}}</small></div>
   @if(s.enabled&&canWrite()){<button mat-button (click)="disable(s.id)">Отключить</button>}
  </div>}@empty{<div class="empty short"><span class="material-symbols-outlined">event_busy</span><strong>Расписание не настроено</strong><span>Отправьте сообщение разово или добавьте ежедневный запуск</span></div>}
  <h2 style="margin-top:30px">История запусков</h2>
  <div class="dispatch-wrap"><table class="dispatch-table"><thead><tr><th>ВРЕМЯ</th><th>СТАТУС</th><th>ПОЛУЧАТЕЛЕЙ</th><th>ПОКАЗАНО</th></tr></thead>
  <tbody>@for(d of m.dispatches;track d.id){<tr><td>{{date(d.scheduled_for)}}<div class="muted">#{{d.id}}</div></td>
   <td><span class="pill" [class.success]="d.status==='completed'" [class.danger]="d.status==='failed'">{{dispatchName(d.status)}}</span>
   @if(d.error_message){<div class="error-text">{{d.error_message}}</div>}</td>
   <td>{{d.matched_recipients===null?'—':d.matched_recipients}}</td><td>{{d.shown_count||0}}</td></tr>}
  @empty{<tr><td colspan="4" class="muted">Запусков ещё не было</td></tr>}</tbody></table></div>
  <p class="hint">«Подготовлено» означает, что записи доставки созданы. Показ на устройстве будет подтверждаться Android/Web-клиентом позднее.</p>
 </section></div>
 }
</div>
`,styles:[`
.back-link{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:15px;font-weight:750;margin-bottom:24px}
.page-head button{display:flex;gap:8px;align-items:center}.info-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:22px}
.info-card{border:1px solid var(--border);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:6px}
.info-card>span{font-size:30px;color:var(--accent);margin-bottom:8px}.info-card small{font-size:11px;color:var(--muted);font-weight:850;letter-spacing:.08em}
.info-card strong{font-size:22px;font-weight:850}.details-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;align-items:start}
h2{font-size:22px;font-weight:800;margin:0 0 18px}.section-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.preview-message{background:var(--muted-panel);border:1px solid var(--border);border-radius:16px;padding:25px;margin:12px 0 20px}
.preview-message.ticker{border-left:5px solid var(--accent)}.preview-label{color:var(--accent);font-size:12px;font-weight:850;letter-spacing:.1em}
.message-image{max-width:100%;max-height:260px;object-fit:contain;margin-top:18px;border-radius:12px;display:block}
.preview-message h3{font-size:21px;margin:12px 0 7px}.preview-message p{font-size:17px;line-height:1.7;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.settings{display:flex;gap:12px 20px;flex-wrap:wrap;font-size:14px;color:var(--muted)}.settings b{color:var(--text)}
.audience{display:flex;gap:14px;align-items:flex-start;background:var(--muted-panel);padding:20px;border-radius:14px}
.audience>span{font-size:28px;color:var(--accent)}.audience strong{font-size:17px}.audience p{font-size:14px;color:var(--muted);line-height:1.5;margin:6px 0}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.actions button{font-size:15px}.hint{font-size:13px;color:var(--muted);line-height:1.7;margin:15px 0 0}
.schedule-item{display:flex;gap:13px;align-items:center;border-top:1px solid var(--border);padding:15px 0}.schedule-icon{width:44px;height:44px;border-radius:12px;background:var(--accent-light);color:var(--accent);display:grid;place-items:center;flex:none}
.schedule-text{flex:1;min-width:0}.schedule-text strong{font-size:15px}.schedule-text div{font-size:14px;margin-top:4px}.schedule-text small{font-size:12px;color:var(--muted);display:block;margin-top:5px}
.dispatch-wrap{overflow-x:auto}.dispatch-table{width:100%;border-collapse:collapse;min-width:460px}.dispatch-table th{font-size:11px;color:var(--muted);text-align:left;padding:10px;letter-spacing:.07em}
.dispatch-table td{font-size:14px;padding:13px 10px;border-top:1px solid var(--border)}.muted{color:var(--muted);font-size:12px}.error-text{color:var(--danger);max-width:260px;word-break:break-word;font-size:12px;margin-top:5px}
.short{padding:30px 8px}
@media(max-width:1250px){.details-grid{grid-template-columns:1fr}}@media(max-width:800px){.info-cards{grid-template-columns:repeat(2,1fr)}}
`]})
export class MessageDetailsComponent {
 private route=inject(ActivatedRoute);private api=inject(MessagingApi);private dialog=inject(MatDialog);private feedback=inject(Feedback);
 readonly auth=inject(AuthService);readonly context=inject(ProviderContext);
 readonly id=this.route.snapshot.paramMap.get('id')!;
 readonly message=signal<MessageDetail|null>(null);readonly loading=signal(false);readonly counting=signal(false);readonly recipientCount=signal<number|null>(null);
 constructor(){this.load();}
 date(v:string){return new Date(v).toLocaleString('ru-RU');}
 typeName(v:string){return ({popup:'Всплывающее окно',ticker:'Бегущая строка',banner:'Баннер',system:'Системное сообщение'} as Record<string,string>)[v]??v;}
 dispatchName(v:string){return ({queued:'В очереди',running:'Обрабатывается',completed:'Подготовлено',failed:'Ошибка'} as Record<string,string>)[v]??v;}
 providerName(id:number|null){return id===null?'Все провайдеры':this.context.providers().find(p=>p.id===id)?.name||`#${id}`;}
 canWrite(){return this.auth.can('messages.write',this.message()?.provider_id);}
 canSend(){return this.auth.can('messages.send',this.message()?.provider_id);}
 audienceTitle(m:MessageDetail){const a=m.audience??{};return a.abonent_ids?.length?'Конкретные абоненты':a.balance_lt_kopecks!==undefined?'По балансу':'Все активные абоненты';}
 audienceDetail(m:MessageDetail){const a=m.audience??{};
  const base=m.provider_id===null?(a.all_providers?'Все провайдеры':`Провайдеры: ${(a.provider_ids??[]).join(', ')}`):this.providerName(m.provider_id);
  return base+(a.abonent_ids?.length?` · Абоненты: ${a.abonent_ids.join(', ')}`:'')+(a.balance_lt_kopecks!==undefined?` · Баланс < ${a.balance_lt_kopecks/100} ₽`: '');
 }
 load(){this.loading.set(true);this.api.get(this.id).subscribe({next:r=>{this.message.set(r);this.loading.set(false);this.preview();},error:e=>{this.loading.set(false);this.feedback.error(e);}});}
 preview(){if(this.counting())return;this.counting.set(true);this.api.preview(this.id).subscribe({next:r=>{this.recipientCount.set(r.recipients);this.counting.set(false);},error:e=>{this.counting.set(false);this.feedback.error(e);}});}
 edit(){const m=this.message();if(!m)return;
  this.dialog.open(MessageDialog,{data:{message:m,providerId:m.provider_id,providers:this.context.providers().filter(p=>this.auth.can('messages.write',p.id)),globalWrite:this.auth.can('messages.write')},width:'850px',maxWidth:'98vw'})
    .afterClosed().subscribe(r=>{if(r)this.load();});}
 schedule(){this.dialog.open(MessageScheduleDialog,{data:{id:this.id},width:'550px',maxWidth:'98vw'}).afterClosed().subscribe(r=>{if(r)this.load();});}
 disable(sid:string){this.dialog.open(ConfirmDialog,{data:{title:'Отключить расписание?',text:'Будущие запуски этого расписания будут отменены.',action:'Отключить'}})
  .afterClosed().subscribe(ok=>{if(ok)this.api.disableSchedule(this.id,sid).subscribe({next:()=>{this.feedback.ok('Расписание отключено');this.load();},error:e=>this.feedback.error(e)});});}
 send(){const m=this.message();if(!m)return;
  this.dialog.open(ConfirmDialog,{data:{title:'Запустить рассылку?',text:`Будет создана рассылка «${m.title||m.body.slice(0,40)}» для примерно ${this.recipientCount()??'?'} абонентов. Список получателей пересчитается при обработке.`,action:'Запустить'}})
    .afterClosed().subscribe(ok=>{if(ok)this.api.send(this.id).subscribe({next:()=>{this.feedback.ok('Рассылка добавлена в очередь');this.load();},error:e=>this.feedback.error(e)});});}
}
