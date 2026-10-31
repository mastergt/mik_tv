import {Component,inject,signal,effect,untracked,OnDestroy} from '@angular/core';
import {RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatPaginatorModule,PageEvent} from '@angular/material/paginator';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {SubscribersApi} from '../core/subscribers-api.service';
import {ProviderContext} from '../core/provider-context.service';
import {Feedback} from '../core/feedback.service';
import {AuthService} from '../core/auth.service';
import {Subscriber} from '../core/models';
import {SubscriberDialog} from '../dialogs/subscriber-dialog.component';
@Component({selector:'app-subscribers',standalone:true,
 imports:[RouterLink,FormsModule,MatButtonModule,MatPaginatorModule,MatProgressBarModule],template:`
<div class="page">
 <div class="page-head"><div><div class="eyebrow">АБОНЕНТСКАЯ БАЗА</div><h1 class="page-title">Абоненты</h1>
  <p class="page-desc">Договоры, доступ к пакетам и видеопотокам, баланс из биллинга и ограничения терминалов.</p></div>
  @if(canWrite()){<button mat-flat-button class="primary-btn" (click)="edit()"><span class="material-symbols-outlined">person_add</span> Создать абонента</button>}
 </div>
 <section class="surface panel">
  <div class="toolbar-row"><div class="search-custom"><span class="material-symbols-outlined">search</span>
    <input [ngModel]="search()" (ngModelChange)="setSearch($event)" placeholder="Логин, договор, ФИО, адрес или телефон" aria-label="Поиск абонентов"></div>
    <span class="pill blue">Найдено: {{total()}}</span></div>
  @if(loading()){<mat-progress-bar mode="indeterminate"/>}
  <div class="table-wrap"><table class="ui-table"><thead><tr><th>АБОНЕНТ</th><th>ДОГОВОР</th><th>ПРОВАЙДЕР</th><th>БАЛАНС</th><th>ТЕРМИНАЛЫ</th><th>СТАТУС</th><th></th></tr></thead>
  <tbody>@for(a of items();track a.id){<tr>
    <td><a [routerLink]="['/abonents',a.id]" class="title-cell"><span class="avatar"><span class="material-symbols-outlined">person</span></span>
      <div><div class="title-name">{{a.display_name||a.username}}</div><div class="subtext">{{a.username}} · ID {{a.id}}</div></div></a></td>
    <td>{{a.contract_number||'—'}}<div class="subtext">{{a.service_name||''}}</div></td>
    <td>{{a.provider_name||'#'+a.provider_id}}</td>
    <td>{{a.balance_kopecks===null?'—':balance(a.balance_kopecks)}} <span class="subtext">{{a.balance_synced_at?'':'нет синхронизации'}}</span></td>
    <td><span class="pill">{{a.terminal_count}} / {{a.terminal_limit_override===null?'по провайдеру':a.terminal_limit_override===0?'∞':a.terminal_limit_override}}</span></td>
    <td><span class="pill" [class.success]="a.enabled" [class.danger]="!a.enabled">{{a.enabled?'Активен':'Отключён'}}</span></td>
    <td><a mat-button [routerLink]="['/abonents',a.id]">Открыть</a></td>
   </tr>}@empty{<tr><td colspan="7"><div class="empty"><span class="material-symbols-outlined">person_search</span><strong>Абоненты не найдены</strong><span>Проверьте фильтр или создайте запись</span></div></td></tr>}</tbody></table></div>
  <mat-paginator [length]="total()" [pageIndex]="pageIndex()" [pageSize]="pageSize()" [pageSizeOptions]="[20,50,100]" (page)="changePage($event)" showFirstLastButtons/>
 </section>
</div>`,styles:[`
 .search-custom{display:flex;gap:12px;align-items:center;border:1px solid var(--border);border-radius:12px;background:var(--muted-panel);padding:10px 15px;flex:1;max-width:600px}
 .search-custom input{border:0;background:transparent;color:var(--text);font-size:16px;outline:0;min-width:0;width:100%}
 .ui-table{width:100%;border-collapse:collapse;min-width:990px}.ui-table th{text-align:left;font-size:12px;color:var(--muted);padding:13px 12px;letter-spacing:.06em}
 .ui-table td{padding:17px 12px;border-top:1px solid var(--border);font-size:15px}.ui-table tr:hover td{background:var(--muted-panel)}
 .page-head button{display:flex;align-items:center;gap:8px}
 `]})
export class SubscribersComponent implements OnDestroy {
 private api=inject(SubscribersApi);private dialog=inject(MatDialog);private feedback=inject(Feedback);
 readonly auth=inject(AuthService);readonly context=inject(ProviderContext);
 readonly items=signal<Subscriber[]>([]);readonly total=signal(0);readonly loading=signal(false);
 readonly search=signal('');readonly pageIndex=signal(0);readonly pageSize=signal(50);
 private timer?:ReturnType<typeof setTimeout>;private seq=0;
 constructor(){effect(()=>{const pid=this.context.selectedId();untracked(()=>{this.pageIndex.set(0);this.load(pid);});});}
 ngOnDestroy(){clearTimeout(this.timer);this.seq++;}
 canWrite(){const pid=this.context.selectedId();return this.auth.can('abonents.write',pid) && this.context.providers().length>0;}
 balance(v:string){return (Number(v)/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';}
 setSearch(value:string){this.search.set(value);this.pageIndex.set(0);clearTimeout(this.timer);
  if(value.trim().length===1)return;
  this.timer=setTimeout(()=>this.load(),350);
 }
 load(pid=this.context.selectedId()){const request=++this.seq;this.loading.set(true);
  this.api.abonents({providerId:pid??undefined,search:this.search().trim(),limit:this.pageSize(),offset:this.pageIndex()*this.pageSize()})
    .subscribe({next:result=>{if(request!==this.seq)return;this.items.set(result.items);this.total.set(result.total);this.loading.set(false);},
     error:e=>{if(request!==this.seq)return;this.loading.set(false);this.feedback.error(e);}});
 }
 changePage(e:PageEvent){this.pageIndex.set(e.pageIndex);this.pageSize.set(e.pageSize);this.load();}
 edit(){this.dialog.open(SubscriberDialog,{data:{providers:this.context.providers().filter(p=>this.auth.can('abonents.write',p.id)),
   providerId:this.context.selectedId()},width:'820px',maxWidth:'97vw'}).afterClosed().subscribe(result=>{if(result)this.load();});}
}
