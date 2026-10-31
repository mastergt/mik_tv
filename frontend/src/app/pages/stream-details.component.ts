import { Component, inject, signal, effect } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CatalogApi } from '../core/catalog-api.service';
import { ProviderContext } from '../core/provider-context.service';
import { AuthService } from '../core/auth.service';
import { Feedback } from '../core/feedback.service';
import { Source, Stream } from '../core/models';
import { SourceDialog } from '../dialogs/source-dialog.component';
import { ConfirmDialog } from '../dialogs/confirm-dialog.component';
import { StreamEpgComponent } from './stream-epg.component';
@Component({selector:'app-stream-details',standalone:true,imports:[RouterLink,MatButtonModule,MatProgressBarModule,StreamEpgComponent],template:`
<div class="page">
  <a routerLink="/streams" class="back-link"><span class="material-symbols-outlined">arrow_back</span> Все каналы</a>
  <div class="page-head"><div><div class="eyebrow">НАСТРОЙКА ВЕЩАНИЯ</div><h1 class="page-title">{{stream()?.name||'Канал'}}</h1><p class="page-desc">LIVE и DVR-адреса, приоритеты вещания и резервные источники.</p></div>
    @if(canWrite()){<button mat-flat-button class="primary-btn" (click)="add('live')"><span class="material-symbols-outlined" style="font-size:20px;margin-right:8px">add</span>Добавить источник</button>}
  </div>
  @if(loading()){<mat-progress-bar mode="indeterminate" />}
  @if(stream();as s){
    <div class="info-strip surface"><div class="summary-icon"><span class="material-symbols-outlined">{{s.is_radio?'radio':'live_tv'}}</span></div><div><b>Канал №{{s.number}}</b><span>ID {{s.id}}</span></div><div class="strip-sep"></div><div><b>{{s.visibility==='all'?'Все провайдеры':'Выбранные провайдеры'}}</b><span>Область доступности</span></div><div class="strip-sep"></div><div><b>{{sources().length}} источников</b><span>LIVE и DVR</span></div><span class="pill" [class.success]="s.enabled" [class.danger]="!s.enabled">{{s.enabled?'Активен':'Выключен'}}</span></div>
  }
  <div class="two-columns">
    <section class="surface panel">
      <div class="section-head"><div><div class="section-icon live"><span class="material-symbols-outlined">sensors</span></div><h2>Прямой эфир <small>LIVE</small></h2></div>@if(canWrite()){<button mat-stroked-button (click)="add('live')">+ Источник</button>}</div>
      <p class="desc">Адреса вещания в реальном времени. Меньший приоритет означает предпочтительный источник.</p>
      @for(source of live();track source.id){<div class="source-item">
        <div class="item-top"><span class="priority-tag">{{source.priority===10?'Основной':source.priority===20?'Резервный':'Приоритет '+source.priority}}</span>
        <span class="pill" [class.success]="source.enabled" [class.danger]="!source.enabled"><span class="pill-dot"></span>{{source.enabled?'Включён':'Выключен'}}</span></div>
        <div class="url-title"><span class="material-symbols-outlined">link</span><span>{{source.protocol.toUpperCase()}}</span></div>
        <div class="url-text" [title]="source.url">{{source.url}}</div>
        <div class="item-foot"><span>{{providerName(source.provider_id)}}</span><div>@if(canWriteSource(source)){<button mat-icon-button aria-label="Изменить источник" (click)="edit(source)"><span class="material-symbols-outlined">edit</span></button><button mat-icon-button aria-label="Удалить источник" (click)="remove(source)"><span class="material-symbols-outlined">delete</span></button>}</div></div>
      </div>}@empty{<div class="empty small-empty"><span class="material-symbols-outlined">wifi_off</span><strong>LIVE-источники не добавлены</strong><span>Добавьте основной адрес вещания</span></div>}
    </section>
    <section class="surface panel">
      <div class="section-head"><div><div class="section-icon dvr"><span class="material-symbols-outlined">history</span></div><h2>ТВ-архив <small>DVR</small></h2></div>@if(canWrite()){<button mat-stroked-button (click)="add('dvr')">+ Источник</button>}</div>
      <p class="desc">Шаблоны URL для воспроизведения прошедших передач по данным EPG.</p>
      @for(source of dvr();track source.id){<div class="source-item">
        <div class="item-top"><span class="priority-tag">{{source.priority===10?'Основной':source.priority===20?'Резервный':'Приоритет '+source.priority}}</span>
        <span class="pill" [class.success]="source.enabled" [class.danger]="!source.enabled"><span class="pill-dot"></span>{{source.enabled?'Включён':'Выключен'}}</span></div>
        <div class="url-title"><span class="material-symbols-outlined">video_library</span><span>{{source.protocol.toUpperCase()}} · {{source.dvr_url_mode}}</span></div>
        <div class="url-text" [title]="source.url">{{source.url}}</div>
        <div class="item-foot"><span>{{providerName(source.provider_id)}}</span><div>@if(canWriteSource(source)){<button mat-icon-button aria-label="Изменить DVR" (click)="edit(source)"><span class="material-symbols-outlined">edit</span></button><button mat-icon-button aria-label="Удалить DVR" (click)="remove(source)"><span class="material-symbols-outlined">delete</span></button>}</div></div>
      </div>}@empty{<div class="empty small-empty"><span class="material-symbols-outlined">history_toggle_off</span><strong>Архив пока не настроен</strong><span>Добавьте DVR URL и резервный источник</span></div>}
    </section>
  </div>
  <app-stream-epg [streamId]="id" />
  <div class="notice bottom-note"><span class="material-symbols-outlined">info</span>Проверка доступности URL будет выполняться отдельным worker. Настройка адресов не запускает проверку видеовоспроизведения.</div>
</div>
`,styles:[`
  .back-link{display:inline-flex;align-items:center;gap:9px;color:var(--muted);font-size:13px;font-weight:800;margin-bottom:26px}.back-link span{font-size:20px}
  .info-strip{display:flex;align-items:center;gap:19px;padding:17px 22px;margin-bottom:24px;flex-wrap:wrap}.summary-icon{height:46px;width:46px;border-radius:13px;display:grid;place-items:center;color:var(--accent);background:var(--accent-light)}
  .info-strip b,.info-strip span:not(.pill):not(.material-symbols-outlined){display:block}.info-strip b{font-size:13.5px}.info-strip div>span:not(.material-symbols-outlined){font-size:12px;color:var(--muted);margin-top:3px}.info-strip>.pill{margin-left:auto}
  .strip-sep{width:1px;height:35px;background:var(--border)}.two-columns{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
  .section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.section-head>div{display:flex;gap:12px;align-items:center}.section-head h2{font-size:19px;letter-spacing:-.035em;margin:0;font-weight:800}.section-head h2 small{font-size:10px;letter-spacing:.09em;color:var(--muted);margin-left:6px}
  .section-icon{height:43px;width:43px;display:grid;place-items:center;border-radius:13px}.section-icon.live{background:#e7f5ef;color:#23986f}.section-icon.dvr{background:#edf0ff;color:#626ee4}
  .desc{color:var(--muted);font-size:13.5px;line-height:1.75;margin:13px 0 22px}.source-item{padding:16px;border:1px solid var(--border);border-radius:15px;margin-bottom:12px}
  .item-top{display:flex;align-items:center;justify-content:space-between;gap:7px}.priority-tag{background:var(--accent-light);color:var(--accent);font-size:11px;font-weight:800;padding:6px 10px;border-radius:7px}
  .url-title{display:flex;gap:6px;align-items:center;font-size:12px;font-weight:800;color:var(--muted);margin-top:16px}.url-title span:first-child{font-size:18px}
  .url-text{font-family:'DM Sans',monospace;font-size:13px;font-weight:600;margin-top:6px;line-height:1.6;word-break:break-all;max-height:80px;overflow:auto;color:var(--text)}
  .item-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--border);margin-top:14px;padding-top:9px;color:var(--muted);font-size:12px}.item-foot>div{display:flex}.item-foot button{color:var(--muted)}
  .small-empty{padding:38px 10px}.small-empty .material-symbols-outlined{font-size:35px}.small-empty strong{font-size:15px}.bottom-note{margin-top:23px;display:flex;gap:8px;align-items:center}
  @media(max-width:1150px){.two-columns{grid-template-columns:1fr}}
`]
})
export class StreamDetailsComponent {
  private route=inject(ActivatedRoute);private api=inject(CatalogApi);private feedback=inject(Feedback);private dialog=inject(MatDialog);
  readonly context=inject(ProviderContext);readonly auth=inject(AuthService);
  readonly id=this.route.snapshot.paramMap.get('id')!;
  readonly stream=signal<Stream|null>(null);readonly sources=signal<Source[]>([]);readonly loading=signal(false);
  readonly live=signal<Source[]>([]);readonly dvr=signal<Source[]>([]);
  constructor(){effect(()=>{const p=this.context.selectedId();this.load(p);});}
  canWrite(){return this.auth.can('sources.write',this.context.selectedId());}
  canWriteSource(s:Source){return this.auth.can('sources.write',s.provider_id);}
  providerName(id:number|null){return id===null?'Общий источник':this.context.providers().find(p=>p.id===id)?.name??`Провайдер #${id}`;}
  load(pid:number|null=this.context.selectedId()){
    this.loading.set(true);
    this.api.stream(this.id,pid??undefined).subscribe({next:s=>{this.stream.set(s);this.loading.set(false);},error:e=>{this.loading.set(false);this.feedback.error(e);}});
    if(this.auth.can('sources.read',pid))this.api.sources(this.id,pid??undefined).subscribe({next:rows=>{
      this.sources.set(rows);this.live.set(rows.filter(s=>s.source_kind==='live'));this.dvr.set(rows.filter(s=>s.source_kind==='dvr'));
    },error:e=>this.feedback.error(e)});
  }
  add(kind:'live'|'dvr') {this.openDialog(undefined,kind);}
  edit(s:Source){this.openDialog(s,s.source_kind);}
  private openDialog(source?:Source,kind:'live'|'dvr'='live'){
    this.dialog.open(SourceDialog,{data:{streamId:this.id,source,kind,providers:this.context.providers(),selectedProvider:this.context.selectedId(),globalWrite:this.auth.can('sources.write')},width:'770px',maxWidth:'97vw'})
      .afterClosed().subscribe(saved=>{if(saved)this.load();});
  }
  remove(s:Source){this.dialog.open(ConfirmDialog,{data:{title:'Удалить источник?',text:'URL источника будет удалён из каталога. Действие нельзя отменить.'}}).afterClosed().subscribe(ok=>{
    if(ok)this.api.deleteSource(s.id).subscribe({next:()=>{this.feedback.ok('Источник удалён');this.load();},error:e=>this.feedback.error(e)});
  });}
}
