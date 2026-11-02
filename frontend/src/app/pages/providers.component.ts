import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../core/catalog-api.service';
import { AuthService } from '../core/auth.service';
import { Feedback } from '../core/feedback.service';
import { ProviderContext } from '../core/provider-context.service';
import { Provider } from '../core/models';
import { ProviderDialog } from '../dialogs/provider-dialog.component';
@Component({selector:'app-providers',standalone:true,imports:[MatButtonModule,MatProgressBarModule,FormsModule],template:`
<div class="page">
  <div class="page-head"><div><div class="eyebrow">УПРАВЛЕНИЕ ДОСТУПОМ</div><h1 class="page-title">Провайдеры</h1><p class="page-desc">Организации, доступ к каналам и персональные лимиты.</p></div>
    @if(auth.can('providers.write')){<button mat-flat-button class="primary-btn" (click)="edit(null)"><span class="material-symbols-outlined" style="margin-right:8px;font-size:20px">add</span>Добавить провайдера</button>}
  </div>
  <section class="surface panel">
    <div class="toolbar-row"><div class="search-custom"><span class="material-symbols-outlined">search</span><input aria-label="Поиск провайдера" placeholder="Поиск по названию или коду…" [(ngModel)]="search"></div><span class="pill">Найдено: {{filtered().length}}</span></div>
    @if(loading()){<mat-progress-bar mode="indeterminate" />}
    <div class="table-wrap"><table class="ui-table"><thead><tr><th>ПРОВАЙДЕР</th><th>КОД</th><th>УСТРОЙСТВ</th><th>ПРОСМОТРОВ</th><th>СЕТИ</th><th>ПО УМОЛЧАНИЮ</th><th>СТАТУС</th><th></th></tr></thead>
      <tbody>@for(p of filtered();track p.id){<tr>
        <td><div class="title-cell"><span class="avatar"><span class="material-symbols-outlined">apartment</span></span><div><div class="title-name">{{p.name}}</div><div class="subtext">ID: {{p.id}}</div></div></div></td>
        <td><code>{{p.slug}}</code></td><td>{{p.default_terminal_limit===0?'Без лимита':p.default_terminal_limit}}</td>
        <td>{{p.default_concurrent_stream_limit===0?'Без лимита':p.default_concurrent_stream_limit}}</td>
        <td>{{p.networks?.length??0}} подсетей</td>
        <td>{{p.is_default?'Да':'—'}}</td>
        <td><span class="pill" [class.success]="p.enabled" [class.danger]="!p.enabled"><span class="pill-dot"></span>{{p.enabled?'Активен':'Выключен'}}</span></td>
        <td><div class="row-actions">@if(auth.can('providers.write')){<button mat-icon-button aria-label="Редактировать провайдера" (click)="edit(p)"><span class="material-symbols-outlined">edit_square</span></button>}</div></td>
      </tr>}@empty {<tr><td colspan="8"><div class="empty"><span class="material-symbols-outlined">domain_disabled</span><strong>Провайдеров не найдено</strong><span>Попробуйте изменить запрос или добавьте первого провайдера</span></div></td></tr>}</tbody></table></div>
  </section>
</div>
`,styles:[`
  .search-custom{display:flex;gap:12px;align-items:center;padding:0 15px;width:min(100%,400px);height:46px;border:1px solid var(--border);border-radius:11px;background:var(--muted-panel);color:var(--muted)}
  .search-custom input{border:0;outline:0;background:none;color:var(--text);font-size:14px;min-width:0;flex:1}
  .ui-table{border-collapse:collapse;width:100%;text-align:left}.ui-table th{font-size:12px;letter-spacing:.07em;color:var(--muted);font-weight:800;border-bottom:1px solid var(--border);padding:15px 12px}.ui-table td{border-bottom:1px solid var(--border);padding:13px 12px;font-size:15px}.ui-table tr:last-child td{border-bottom:none}.ui-table tbody tr:hover{background:var(--muted-panel)}.ui-table code{font-family:'DM Sans',monospace;font-size:13px;color:var(--accent);font-weight:800}
`]
})
export class ProvidersComponent implements OnInit {
  private api=inject(CatalogApi);private dialog=inject(MatDialog);private feedback=inject(Feedback);
  readonly auth=inject(AuthService);readonly context=inject(ProviderContext);
  readonly rows=signal<Provider[]>([]);readonly loading=signal(false);readonly search=signal('');
  readonly filtered=computed(()=>this.rows().filter(x=>[x.name,x.slug,String(x.id)].some(v=>v.toLowerCase().includes(this.search().toLowerCase()))));
  ngOnInit(){this.load();}
  load(){this.loading.set(true);this.api.providers().subscribe({next:x=>{this.rows.set(x);this.loading.set(false);},error:e=>{this.loading.set(false);this.feedback.error(e);}});}
  edit(provider:Provider|null){const ref=this.dialog.open(ProviderDialog,{data:provider,width:'710px',maxWidth:'96vw'});ref.afterClosed().subscribe(v=>{if(v){this.load();this.context.load();}});}
}
