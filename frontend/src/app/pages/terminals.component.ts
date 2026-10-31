import {Component,inject,signal,effect,untracked,OnDestroy} from '@angular/core';
import {RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatPaginatorModule,PageEvent} from '@angular/material/paginator';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {SubscribersApi} from '../core/subscribers-api.service';
import {ProviderContext} from '../core/provider-context.service';
import {Feedback} from '../core/feedback.service';
import {Terminal} from '../core/models';
@Component({selector:'app-terminals',standalone:true,imports:[FormsModule,RouterLink,MatButtonModule,MatPaginatorModule,MatProgressBarModule],template:`
<div class="page"><div class="page-head"><div><div class="eyebrow">КЛИЕНТСКОЕ ОБОРУДОВАНИЕ</div><h1 class="page-title">Терминалы</h1>
  <p class="page-desc">Android-приставки, браузеры и другие устройства, включая анонимных зрителей. Идентификация по UUID.</p></div></div>
 <section class="surface panel"><div class="toolbar-row"><div class="search-custom">
  <span class="material-symbols-outlined">search</span><input [ngModel]="search()" (ngModelChange)="setSearch($event)" placeholder="UUID, абонент, модель, производитель, User-Agent" aria-label="Поиск терминалов"></div>
  <span class="pill blue">Всего: {{total()}}</span></div>
 @if(loading()){<mat-progress-bar mode="indeterminate"/>}
 <div class="table-wrap"><table class="ui-table"><thead><tr><th>УСТРОЙСТВО</th><th>АБОНЕНТ</th><th>ПРОВАЙДЕР</th><th>IP</th><th>ПОСЛЕДНЯЯ АКТИВНОСТЬ</th><th>СТАТУС</th><th></th></tr></thead>
 <tbody>@for(t of items();track t.id){<tr>
  <td><a [routerLink]="['/terminals',t.id]" class="title-cell"><span class="avatar"><span class="material-symbols-outlined">devices</span></span>
    <div><div class="title-name">{{t.device_name||t.model||'Устройство '+t.id}}</div><div class="subtext">{{t.manufacturer||t.platform||'Неизвестная платформа'}} · {{t.app_version||'Версия не указана'}}</div></div></a></td>
  <td>@if(t.abonent_id){<a [routerLink]="['/abonents',t.abonent_id]">{{t.abonent_name||t.abonent_username||'#'+t.abonent_id}}</a>}@else{<span class="pill">Гость</span>}</td>
  <td>{{t.provider_name||'—'}}</td><td>{{t.wan_addr||'—'}}</td><td>{{format(t.last_activity)}}</td>
  <td><span class="pill" [class.success]="t.enabled" [class.danger]="!t.enabled">{{t.enabled?'Включён':'Отключён'}}</span>
   @if(t.has_active_session){<div class="subtext" style="margin-top:6px">Есть активная сессия</div>}</td>
  <td><a mat-button [routerLink]="['/terminals',t.id]">Открыть</a></td>
 </tr>}@empty{<tr><td colspan="7"><div class="empty"><span class="material-symbols-outlined">devices_off</span><strong>Устройств пока нет</strong><span>Терминалы появятся после подключения клиентских приложений</span></div></td></tr>}</tbody></table></div>
 <mat-paginator [length]="total()" [pageIndex]="pageIndex()" [pageSize]="pageSize()" [pageSizeOptions]="[20,50,100]" (page)="changePage($event)" showFirstLastButtons/>
 </section></div>
`,styles:[`
 .search-custom{display:flex;gap:12px;align-items:center;border:1px solid var(--border);border-radius:12px;background:var(--muted-panel);padding:10px 15px;flex:1;max-width:670px}
 .search-custom input{border:0;background:transparent;color:var(--text);font-size:16px;outline:0;min-width:0;width:100%}
 .ui-table{border-collapse:collapse;width:100%;min-width:1030px}.ui-table th{text-align:left;padding:13px 12px;font-size:12px;color:var(--muted)}
 .ui-table td{padding:17px 12px;font-size:15px;border-top:1px solid var(--border)}.ui-table tr:hover td{background:var(--muted-panel)}
 `]})
export class TerminalsComponent implements OnDestroy {
 private api=inject(SubscribersApi);private feedback=inject(Feedback);readonly context=inject(ProviderContext);
 readonly items=signal<Terminal[]>([]);readonly loading=signal(false);readonly total=signal(0);
 readonly search=signal('');readonly pageSize=signal(50);readonly pageIndex=signal(0);
 private timer?:ReturnType<typeof setTimeout>;private seq=0;
 constructor(){effect(()=>{const pid=this.context.selectedId();untracked(()=>{this.pageIndex.set(0);this.load(pid);});});}
 ngOnDestroy(){clearTimeout(this.timer);this.seq++;}
 format(s:string){return new Date(s).toLocaleString('ru-RU');}
 setSearch(v:string){this.search.set(v);this.pageIndex.set(0);clearTimeout(this.timer);if(v.trim().length===1)return;
  this.timer=setTimeout(()=>this.load(),350);}
 changePage(e:PageEvent){this.pageIndex.set(e.pageIndex);this.pageSize.set(e.pageSize);this.load();}
 load(pid=this.context.selectedId()){const token=++this.seq;this.loading.set(true);
  this.api.terminals({providerId:pid??undefined,search:this.search().trim(),limit:this.pageSize(),offset:this.pageIndex()*this.pageSize()})
    .subscribe({next:r=>{if(token!==this.seq)return;this.loading.set(false);this.items.set(r.items);this.total.set(r.total);},
      error:e=>{if(token!==this.seq)return;this.loading.set(false);this.feedback.error(e);}});
 }
}
