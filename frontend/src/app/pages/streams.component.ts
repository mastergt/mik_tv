import { Component, inject, signal, effect, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../core/catalog-api.service';
import { ProviderContext } from '../core/provider-context.service';
import { AuthService } from '../core/auth.service';
import { Feedback } from '../core/feedback.service';
import { AppType, Genre, Stream } from '../core/models';
import { StreamDialog } from '../dialogs/stream-dialog.component';
import { ConfirmDialog } from '../dialogs/confirm-dialog.component';
@Component({selector:'app-streams',standalone:true,imports:[RouterLink,MatButtonModule,MatMenuModule,MatProgressBarModule,MatSelectModule,FormsModule],template:`
<div class="page">
  <div class="page-head"><div><div class="eyebrow">КАТАЛОГ КОНТЕНТА</div><h1 class="page-title">Каналы и потоки</h1><p class="page-desc">Управляйте эфирными каналами, видео, радио и DVR-архивами в одном месте.</p></div>
  @if(canWrite()){<button mat-flat-button class="primary-btn" (click)="create()"><span class="material-symbols-outlined" style="font-size:20px;margin-right:8px">add</span>Добавить канал</button>}
  </div>
  <section class="surface panel">
    <div class="toolbar-row"><div class="search-custom"><span class="material-symbols-outlined">search</span><input placeholder="Поиск по названию канала…" aria-label="Поиск каналов" [(ngModel)]="search" (ngModelChange)="filterChanged()"></div>
      <mat-select class="app-filter" aria-label="Тип приложения" [(ngModel)]="appTypeId" (selectionChange)="filterChanged()"><mat-option [value]="null">Все приложения</mat-option>@for(a of apps();track a.id){<mat-option [value]="a.id">{{a.name}}</mat-option>}</mat-select>
      <span class="pill count-pill">На странице: {{rows().length}}</span></div>
    @if(loading()){<mat-progress-bar mode="indeterminate" />}
    <div class="table-wrap"><table class="ui-table"><thead><tr><th>№</th><th>КАНАЛ</th><th>ТИП</th><th>ИСТОЧНИКИ</th><th>ДОСТУП</th><th>СТАТУС</th><th></th></tr></thead>
    <tbody>@for(s of rows();track s.id){<tr>
      <td class="number">{{s.number}}</td>
      <td><a [routerLink]="['/streams',s.id]" class="title-cell"><span class="avatar"><span class="material-symbols-outlined">{{s.is_radio?'radio':'live_tv'}}</span></span><div><div class="title-name">{{s.name}}</div><div class="subtext">ID {{s.id}} · {{s.visibility==='all'?'Все провайдеры':'Выбранные'}}</div></div></a></td>
      <td><span class="pill">{{appName(s.app_type_id)}}</span></td>
      <td><div class="source-count"><span class="material-symbols-outlined">dns</span> {{s.source_count??0}}</div></td>
      <td><span class="pill" [class.blue]="s.is_public">{{s.is_public?'Публичный':'По подписке'}}</span></td>
      <td><span class="pill" [class.success]="s.enabled" [class.danger]="!s.enabled"><span class="pill-dot"></span>{{s.enabled?'Включён':'Выключен'}}</span></td>
      <td><button mat-icon-button [matMenuTriggerFor]="rowMenu" aria-label="Действия"><span class="material-symbols-outlined">more_horiz</span></button>
        <mat-menu #rowMenu="matMenu"><a mat-menu-item [routerLink]="['/streams',s.id]"><span class="material-symbols-outlined">tune</span> Источники LIVE/DVR</a>
        @if(canEditStream(s)){<button mat-menu-item (click)="edit(s)"><span class="material-symbols-outlined">edit</span> Редактировать</button><button mat-menu-item (click)="remove(s)"><span class="material-symbols-outlined">delete</span> Удалить</button>}</mat-menu></td>
    </tr>}@empty{<tr><td colspan="7"><div class="empty"><span class="material-symbols-outlined">search_off</span><strong>Нет каналов</strong><span>Попробуйте изменить фильтр или создайте новый канал</span></div></td></tr>}</tbody></table></div>
    <div class="pager"><div>Страница {{page()+1}} · до 25 записей</div><div><button mat-stroked-button [disabled]="page()===0||loading()" (click)="changePage(-1)">Назад</button><button mat-stroked-button [disabled]="rows().length<25||loading()" (click)="changePage(1)">Вперёд</button></div></div>
  </section>
</div>
`,styles:[`
  .search-custom{display:flex;gap:12px;align-items:center;padding:0 15px;width:min(100%,390px);height:46px;border:1px solid var(--border);border-radius:11px;background:var(--muted-panel);color:var(--muted)}
  .search-custom input{border:0;outline:0;background:none;color:var(--text);font-size:14px;min-width:0;flex:1}
  .app-filter{height:46px;display:flex;align-items:center;padding:0 14px;width:215px;border:1px solid var(--border);border-radius:11px;font-weight:700;font-size:13px}
  .count-pill{margin-left:auto}.ui-table{border-collapse:collapse;width:100%;text-align:left}.ui-table th{font-size:11.5px;letter-spacing:.055em;color:var(--muted);font-weight:800;border-bottom:1px solid var(--border);padding:14px 11px;white-space:nowrap}.ui-table td{border-bottom:1px solid var(--border);padding:11px;font-size:15px}.ui-table tbody tr:hover{background:var(--muted-panel)}.ui-table tr:last-child td{border-bottom:none}.number{font-weight:800;color:var(--muted);font-family:'DM Sans',sans-serif}
  .source-count{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:800}.source-count span{color:var(--muted);font-size:20px}
  .pager{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--muted);padding-top:20px}.pager div:last-child{display:flex;gap:8px}
  @media(max-width:800px){.count-pill{display:none}}
`]
})
export class StreamsComponent implements OnInit {
  private api=inject(CatalogApi);private feedback=inject(Feedback);private dialog=inject(MatDialog);
  readonly context=inject(ProviderContext);readonly auth=inject(AuthService);private router=inject(Router);
  readonly rows=signal<Stream[]>([]);readonly apps=signal<AppType[]>([]);readonly genres=signal<Genre[]>([]);
  readonly loading=signal(false);readonly page=signal(0);readonly search=signal('');readonly appTypeId=signal<number|null>(null);
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(){effect(()=>{const p=this.context.selectedId();this.page.set(0);this.load(p);});}
  ngOnInit(){
    this.api.appTypes().subscribe({next:r=>this.apps.set(r),error:e=>this.feedback.error(e)});
  }
  canWrite(){return this.auth.can('streams.write',this.context.selectedId());}
  canEditStream(s:Stream){return s.visibility==='all'?this.auth.can('streams.write'):this.auth.can('streams.write',this.context.selectedId());}
  appName(id:number){return this.apps().find(x=>x.id===id)?.name??`Приложение #${id}`;}
  load(providerId:number|null=this.context.selectedId()){
    if(!this.auth.can('streams.read',providerId))return;
    this.loading.set(true);
    this.api.streams({providerId:providerId??undefined,search:this.search(),appTypeId:this.appTypeId()??undefined,limit:25,offset:this.page()*25}).subscribe({
      next:rows=>{this.rows.set(rows);this.loading.set(false);},error:e=>{this.loading.set(false);this.feedback.error(e);}
    });
  }
  filterChanged(){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.page.set(0);this.load();},300);}
  changePage(delta:number){this.page.update(v=>Math.max(0,v+delta));this.load();}
  private openEditor(stream?:Stream){
    if(!this.apps().length){this.feedback.error(new Error('Нет доступных типов приложений'));return;}
    const pid=this.context.selectedId();
    const show=(genres:Genre[],detail?:Stream)=>{
      const ref=this.dialog.open(StreamDialog,{data:{stream:detail,apps:this.apps(),genres,providers:this.context.providers(),selectedProvider:pid,globalWrite:this.auth.can('streams.write')},width:'790px',maxWidth:'97vw'});
      ref.afterClosed().subscribe((saved?:Stream)=>{if(saved){this.load();if(!stream)this.router.navigate(['/streams',saved.id]);}});
    };
    const proceed=(genres:Genre[])=>{
      if(stream)this.api.stream(stream.id,pid??undefined).subscribe({next:detail=>show(genres,detail),error:e=>this.feedback.error(e)});
      else show(genres);
    };
    this.api.genres(pid??undefined).subscribe({next:proceed,error:()=>proceed([])});
  }
  create(){this.openEditor();}edit(stream:Stream){this.openEditor(stream);}
  remove(stream:Stream){
    this.dialog.open(ConfirmDialog,{data:{title:'Удалить канал?',text:`«${stream.name}» будет удалён вместе с LIVE/DVR-источниками. Это действие нельзя отменить.`},width:'440px'}).afterClosed().subscribe(ok=>{
      if(ok)this.api.deleteStream(stream.id).subscribe({next:()=>{this.feedback.ok('Канал удалён');this.load();},error:e=>this.feedback.error(e)});
    });
  }
}
