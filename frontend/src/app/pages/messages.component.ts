import {Component,inject,signal,effect,untracked,OnDestroy} from '@angular/core';
import {Router,RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatPaginatorModule,PageEvent} from '@angular/material/paginator';
import {MessagingApi,MessageItem} from '../core/messaging-api.service';
import {AuthService} from '../core/auth.service';
import {Feedback} from '../core/feedback.service';
import {ProviderContext} from '../core/provider-context.service';
import {MessageDialog} from '../dialogs/message-dialog.component';
@Component({selector:'app-messages',standalone:true,imports:[RouterLink,FormsModule,MatButtonModule,MatPaginatorModule,MatProgressBarModule],template:`
<div class="page">
 <div class="page-head"><div><div class="eyebrow">КОММУНИКАЦИЯ С АБОНЕНТАМИ</div><h1 class="page-title">Сообщения и рассылки</h1>
 <p class="page-desc">Бегущая строка, важные уведомления, адресные сообщения и отправка по расписанию.</p></div>
 @if(canWrite()){<button mat-flat-button class="primary-btn" (click)="create()"><span class="material-symbols-outlined">add</span> Новое сообщение</button>}
 </div>
 <section class="surface panel">
  <div class="toolbar-row"><div class="search-custom"><span class="material-symbols-outlined">search</span>
   <input aria-label="Поиск сообщений" [ngModel]="search()" (ngModelChange)="setSearch($event)" placeholder="Название или текст сообщения"></div>
   <span class="pill blue">Найдено: {{total()}}</span></div>
  @if(loading()){<mat-progress-bar mode="indeterminate"/>}
  <div class="table-wrap"><table class="ui-table"><thead><tr><th>СООБЩЕНИЕ</th><th>ТИП</th><th>ПРОВАЙДЕР</th><th>СТАТУС</th><th>РАССЫЛОК</th><th></th></tr></thead><tbody>
   @for(m of rows();track m.id){<tr>
    <td><a class="message-name" [routerLink]="['/messages',m.id]">{{m.title||'Без заголовка'}}</a><div class="excerpt">{{m.body}}</div></td>
    <td><span class="type-pill">{{typeName(m.display_type)}}</span></td>
    <td>{{m.provider_name||'Глобальное'}}</td>
    <td><span class="pill" [class.success]="m.status==='active'&&m.enabled" [class.danger]="!m.enabled">{{statusName(m)}}</span></td>
    <td>{{m.dispatch_count||0}}</td><td><a mat-button [routerLink]="['/messages',m.id]">Открыть</a></td>
   </tr>}@empty{<tr><td colspan="6"><div class="empty"><span class="material-symbols-outlined">campaign</span><strong>Сообщений пока нет</strong><span>Создайте рассылку или измените фильтр поиска</span></div></td></tr>}
  </tbody></table></div>
  <mat-paginator [length]="total()" [pageIndex]="pageIndex()" [pageSize]="pageSize()" [pageSizeOptions]="[20,50,100]" (page)="changePage($event)" showFirstLastButtons/>
 </section>
 <div class="notice" style="margin-top:22px">История «Подготовлено» означает, что получатели созданы в очереди. Фактическое отображение будет подтверждаться клиентским приложением.</div>
</div>
`,styles:[`
.search-custom{display:flex;gap:12px;align-items:center;border:1px solid var(--border);border-radius:12px;background:var(--muted-panel);padding:10px 15px;flex:1;max-width:570px}
.search-custom input{border:0;outline:0;background:transparent;color:var(--text);font-size:16px;min-width:0;width:100%}
.ui-table{width:100%;border-collapse:collapse;min-width:850px}.ui-table th{text-align:left;font-size:12px;letter-spacing:.08em;color:var(--muted);padding:15px 12px}
.ui-table td{padding:19px 12px;border-top:1px solid var(--border);font-size:15px}.ui-table tr:hover td{background:var(--muted-panel)}
.message-name{font-weight:800;font-size:17px;color:var(--text)}.message-name:hover{color:var(--accent)}
.excerpt{max-width:380px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;color:var(--muted);margin-top:5px}
.type-pill{font-size:14px;font-weight:700;background:var(--accent-light);color:var(--accent);border-radius:8px;padding:7px 11px}
`]})
export class MessagesComponent implements OnDestroy {
 private api=inject(MessagingApi);private dialog=inject(MatDialog);private feedback=inject(Feedback);private router=inject(Router);
 readonly context=inject(ProviderContext);readonly auth=inject(AuthService);
 readonly rows=signal<MessageItem[]>([]);readonly total=signal(0);readonly loading=signal(false);
 readonly search=signal('');readonly pageIndex=signal(0);readonly pageSize=signal(50);
 private timer?:ReturnType<typeof setTimeout>;private seq=0;
 constructor(){effect(()=>{const pid=this.context.selectedId();untracked(()=>{this.pageIndex.set(0);this.load(pid);});});}
 ngOnDestroy(){clearTimeout(this.timer);this.seq++;}
 canWrite(){const pid=this.context.selectedId();return this.auth.can('messages.write',pid)&&(pid===null||this.context.providers().length>0);}
 typeName(v:string){return ({popup:'Окно',ticker:'Бегущая строка',banner:'Баннер',system:'Системное'} as Record<string,string>)[v]??v;}
 statusName(m:MessageItem){return !m.enabled?'Выключено':({active:'Активно',draft:'Черновик',archived:'Архив'} as Record<string,string>)[m.status]??m.status;}
 setSearch(s:string){this.search.set(s);this.pageIndex.set(0);clearTimeout(this.timer);this.timer=setTimeout(()=>this.load(),350);}
 load(pid=this.context.selectedId()){
  if(!this.auth.can('messages.read',pid))return;
  const seq=++this.seq;this.loading.set(true);
  this.api.list({providerId:pid??undefined,search:this.search(),limit:this.pageSize(),offset:this.pageIndex()*this.pageSize()})
   .subscribe({next:r=>{if(seq!==this.seq)return;this.rows.set(r.items);this.total.set(r.total);this.loading.set(false);},
     error:e=>{if(seq!==this.seq)return;this.loading.set(false);this.feedback.error(e);}});
 }
 changePage(e:PageEvent){this.pageIndex.set(e.pageIndex);this.pageSize.set(e.pageSize);this.load();}
 create(){this.dialog.open(MessageDialog,{data:{providerId:this.context.selectedId(),providers:this.context.providers().filter(p=>this.auth.can('messages.write',p.id)),globalWrite:this.auth.can('messages.write')},width:'850px',maxWidth:'98vw'})
  .afterClosed().subscribe(m=>{if(m){this.load();this.router.navigate(['/messages',m.id]);}});}
}
