import { Component, OnDestroy, inject, signal, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EpgApi, EpgSource, EpgChannel, EpgJob, EpgMapping, EpgProgramme } from '../core/epg-api.service';
import { AuthService } from '../core/auth.service';
import { ProviderContext } from '../core/provider-context.service';
import { Feedback } from '../core/feedback.service';
import { EpgSourceDialogComponent } from './epg-source-dialog.component';

@Component({standalone:true,imports:[CommonModule,DatePipe,FormsModule,MatButtonModule,MatIconModule,MatFormFieldModule,MatInputModule,MatSelectModule,MatTabsModule,MatProgressBarModule,MatTooltipModule],template:`
<div class="page epg-page">
  <div class="page-head">
    <div><div class="eyebrow">ТЕЛЕПРОГРАММА И АРХИВ</div><h1 class="page-title">Электронная программа передач</h1>
      <p class="page-desc">Загружайте XMLTV, связывайте программы с каналами и проверяйте расписание. Все данные хранятся на вашем сервере.</p></div>
    @if(canGlobalWrite()){<button mat-flat-button class="primary-btn" (click)="editSource()"><span class="material-symbols-outlined icon-inline">add</span>Добавить источник</button>}
  </div>
  <div class="metrics">
    <div class="metric surface"><span class="material-symbols-outlined">dns</span><div><b>{{sources().length}}</b><small>Источников EPG</small></div></div>
    <div class="metric surface"><span class="material-symbols-outlined">fact_check</span><div><b>{{healthyCount()}}</b><small>Успешно загружены</small></div></div>
    <div class="metric surface"><span class="material-symbols-outlined">tv</span><div><b>{{channelCount()}}</b><small>Каналов в источниках</small></div></div>
  </div>
  <section class="surface panel">
    <mat-tab-group animationDuration="150ms" [(selectedIndex)]="tab" (selectedIndexChange)="tabChanged($event)">
      <mat-tab label="Источники">
        <div class="tab-content">
          <div class="row-head"><div><h2 class="panel-title">Источники телепрограммы</h2><p class="muted">Загрузка по HTTPS и фоновое обновление по расписанию</p></div>
          <button mat-stroked-button (click)="loadSources()">Обновить список</button></div>
          @if(loadingSources()){<mat-progress-bar mode="indeterminate" />}
          <div class="source-grid">
            @for(s of sources();track s.id){
              <article class="epg-source">
                <div class="source-main">
                  <div class="source-badge"><span class="material-symbols-outlined">calendar_month</span></div>
                  <div class="source-text"><strong>{{s.name}}</strong><p class="source-url" [title]="s.download_uri">{{s.download_uri}}</p></div>
                  <span class="pill" [class.success]="s.enabled" [class.danger]="!s.enabled">{{s.enabled?'Активен':'Отключён'}}</span>
                </div>
                <div class="facts">
                  <div><span>Каналов</span><b>{{s.channel_count | number}}</b></div>
                  <div><span>Обновление</span><b>{{interval(s.refresh_interval_seconds)}}</b></div>
                  <div><span>Последний успех</span><b>{{s.last_success_at?(s.last_success_at|date:'dd.MM.yy HH:mm'):'Нет данных'}}</b></div>
                </div>
                @if(s.last_error){<div class="epg-error"><span class="material-symbols-outlined">error</span><span>{{s.last_error}}</span></div>}
                @if(s.running_jobs){<div class="epg-working"><span class="material-symbols-outlined">sync</span>Импорт выполняется…</div>}
                <div class="source-actions">
                  <button mat-stroked-button (click)="openChannels(s)"><span class="material-symbols-outlined icon-inline">list</span>Каналы</button>
                  <button mat-stroked-button (click)="openJobs(s)"><span class="material-symbols-outlined icon-inline">history</span>История</button>
                  @if(canGlobalWrite()){
                    <button mat-stroked-button (click)="editSource(s)"><span class="material-symbols-outlined icon-inline">edit</span>Изменить</button>
                    <button mat-flat-button [disabled]="!!s.running_jobs" (click)="importNow(s)"><span class="material-symbols-outlined icon-inline">sync</span>Загрузить</button>
                  }
                </div>
              </article>
            }@empty{<div class="empty"><span class="material-symbols-outlined">event_busy</span><strong>Источники отсутствуют</strong><span>Добавьте адрес XMLTV, чтобы загрузить телепрограмму.</span></div>}
          </div>
          @if(activeSource()){
            <div class="detail-area">
              <div class="row-head"><div><h2 class="panel-title">{{activeSource()?.name}}</h2><p class="muted">{{mode()==='channels'?'Каналы XMLTV':'История загрузок и ошибок'}}</p></div>
                <div class="detail-buttons"><button mat-stroked-button (click)="mode()==='jobs'?loadJobs():loadChannels()">Обновить</button><button mat-stroked-button (click)="activeSource.set(null)">Закрыть</button></div></div>
              @if(mode()==='channels'){
                <div class="filters"><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Название или XMLTV ID</mat-label>
                  <input matInput [(ngModel)]="channelSearch" (keyup.enter)="loadChannels()" /></mat-form-field>
                  <button mat-flat-button (click)="loadChannels()">Найти</button>
                </div>
                <div class="table-wrap"><table class="epg-table"><thead><tr><th>Канал XMLTV</th><th>ID</th><th>Будущих передач</th></tr></thead><tbody>
                @for(c of channels();track c.id){<tr><td><b>{{c.display_name}}</b></td><td class="mono">{{c.external_channel_id}}</td><td>{{c.future_count}}</td></tr>}
                </tbody></table></div>
                <div class="pagination"><button mat-stroked-button [disabled]="channelOffset===0" (click)="channelOffset=channelOffset-70;loadChannels()">Назад</button>
                  <span>Страница {{(channelOffset/70)+1}}</span><button mat-stroked-button [disabled]="channels().length<70" (click)="channelOffset=channelOffset+70;loadChannels()">Вперёд</button></div>
              }@else{
                <div class="table-wrap"><table class="epg-table"><thead><tr><th>Начало</th><th>Результат</th><th>Каналов</th><th>Передач</th><th>Ошибка</th></tr></thead>
                  <tbody>@for(j of jobs();track j.id){<tr><td>{{j.started_at||j.created_at|date:'dd.MM.yyyy HH:mm'}}</td><td><span class="pill" [class.success]="j.status==='success'" [class.danger]="j.status==='failed'">{{jobStatus(j.status)}}</span></td><td>{{j.channels_count|number}}</td><td>{{j.programmes_count|number}}</td><td class="error-text">{{j.error_message||'—'}}</td></tr>}
                  @empty{<tr><td colspan="5">Импортов пока не было.</td></tr>}</tbody></table></div>
              }
            </div>
          }
        </div>
      </mat-tab>
      <mat-tab label="Сопоставление каналов">
        <div class="tab-content">
          <div class="row-head"><div><h2 class="panel-title">Соответствия каналов</h2><p class="muted">Укажите, какому каналу IPTV соответствует канал из XMLTV.</p></div></div>
          @if(canWrite()){
          <p class="muted">Сопоставления задаются только вручную. Удобнее всего это делать в карточке каждого канала: поиск XMLTV с подсказками, выбор EPG и загрузка логотипа.</p>
          <div class="mapper">
            <div class="mapper-fields">
              <mat-form-field appearance="outline"><mat-label>Поиск вашего канала</mat-label><input matInput [(ngModel)]="streamSearch" (keyup.enter)="loadStreams()" /></mat-form-field>
              <button mat-stroked-button (click)="loadStreams()">Найти</button>
              <mat-form-field appearance="outline"><mat-label>Канал IPTV</mat-label><mat-select [(ngModel)]="mappingStreamId">
                @for(s of streamOptions();track s.id){<mat-option [value]="s.id">№{{s.number}} · {{s.name}}</mat-option>}
              </mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Источник EPG</mat-label><mat-select [(ngModel)]="mappingSourceId" (selectionChange)="loadMappingChannels()">
                @for(s of sources();track s.id){<mat-option [value]="s.id">{{s.name}}</mat-option>}
              </mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Поиск XMLTV-канала</mat-label><input matInput [(ngModel)]="mappingChannelSearch" (keyup.enter)="loadMappingChannels()" /></mat-form-field>
              <button mat-stroked-button (click)="loadMappingChannels()">Найти</button>
              <mat-form-field appearance="outline"><mat-label>Канал из EPG</mat-label><mat-select [(ngModel)]="mappingChannelId">
                @for(c of mappingChannels();track c.id){<mat-option [value]="c.id">{{c.display_name}} ({{c.external_channel_id}})</mat-option>}
              </mat-select></mat-form-field>
              <button mat-flat-button class="map-submit" [disabled]="!mappingStreamId||!mappingChannelId||savingMap()" (click)="saveMapping()">Связать каналы</button>
            </div>
          </div>
          }
          <div class="filters"><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Поиск соответствий</mat-label><input matInput [(ngModel)]="mappingSearch" (keyup.enter)="loadMappings()" /></mat-form-field>
            <button mat-stroked-button (click)="mappingOffset=0;loadMappings()">Найти</button></div>
          <div class="table-wrap"><table class="epg-table"><thead><tr><th>Наш канал</th><th>Канал EPG</th><th>Источник</th><th>Провайдер</th><th></th></tr></thead><tbody>
            @for(m of mappings();track m.id){<tr><td><b>№{{m.number}} · {{m.stream_name}}</b></td><td>{{m.epg_name}}<div class="subtext mono">{{m.external_channel_id}}</div></td><td>{{m.source_name}}</td><td>{{m.provider_id===null?'Все':m.provider_id}}</td>
              <td>@if(canRemove(m)){<button mat-icon-button aria-label="Удалить соответствие" (click)="removeMapping(m)"><span class="material-symbols-outlined">delete</span></button>}</td></tr>}
            @empty{<tr><td colspan="5">Сопоставления отсутствуют.</td></tr>}</tbody></table></div>
          <div class="pagination"><button mat-stroked-button [disabled]="mappingOffset===0" (click)="mappingOffset-=50;loadMappings()">Назад</button><span>Страница {{mappingOffset/50+1}}</span>
            <button mat-stroked-button [disabled]="mappings().length<50" (click)="mappingOffset+=50;loadMappings()">Вперёд</button></div>
        </div>
      </mat-tab>
      <mat-tab label="Просмотр телепрограммы">
        <div class="tab-content">
          <div class="row-head"><div><h2 class="panel-title">Программа передач</h2><p class="muted">Проверьте расписание канала перед использованием в приложении и DVR.</p></div></div>
          <div class="filters">
            <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Канал IPTV</mat-label><mat-select [(ngModel)]="previewStreamId">
              @for(s of streamOptions();track s.id){<mat-option [value]="s.id">№{{s.number}} · {{s.name}}</mat-option>}
            </mat-select></mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Поиск каналов</mat-label><input matInput [(ngModel)]="streamSearch" (keyup.enter)="loadStreams()" /></mat-form-field>
            <button mat-stroked-button (click)="loadStreams()">Найти</button>
            <label class="date-field">Дата <input type="date" [(ngModel)]="previewDate" /></label>
            <button mat-flat-button [disabled]="!previewStreamId" (click)="loadProgrammes()">Показать</button>
          </div>
          @if(previewLoading()){<mat-progress-bar mode="indeterminate" />}
          <div class="programme-grid">
            @for(p of programmes();track p.id){
              <div class="programme-row"><div class="programme-time"><b>{{p.starts_at|date:'HH:mm'}}</b><span>{{p.ends_at?(p.ends_at|date:'HH:mm'):'—'}}</span></div>
                <div><strong>{{p.title||'Без названия'}}</strong><p>{{p.description||'Описание не указано'}}</p></div>
                @if(p.age_limit!==null){<span class="pill">{{p.age_limit}}+</span>}
              </div>
            }@empty{<div class="empty"><span class="material-symbols-outlined">event_note</span><strong>Нет передач на выбранную дату</strong><span>Убедитесь, что источник импортирован, а канал сопоставлен.</span></div>}
          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  </section>
</div>
`,styles:[`
  .epg-page{font-size:16px}.icon-inline{font-size:20px;vertical-align:middle;margin-right:7px}
  .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}.metric{display:flex;gap:17px;align-items:center;padding:22px 25px}
  .metric>.material-symbols-outlined{font-size:29px;padding:13px;border-radius:14px;color:var(--accent);background:var(--accent-light)}
  .metric b{display:block;font-size:28px;font-weight:800;line-height:1.15}.metric small{font-size:14px;color:var(--muted);font-weight:600}
  .tab-content{padding-top:25px}.row-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:22px}.row-head .panel-title{margin-bottom:4px}
  .row-head p{font-size:15px;margin:0}.source-grid{display:grid;gap:15px}.epg-source{border:1px solid var(--border);border-radius:16px;padding:21px;background:var(--surface)}
  .source-main{display:flex;gap:15px;align-items:center;min-width:0}.source-badge{width:51px;height:51px;flex:none;display:grid;place-items:center;border-radius:13px;background:var(--accent-light);color:var(--accent)}.source-badge span{font-size:27px}
  .source-text{min-width:0;flex:1}.source-text strong{font-size:18px}.source-url{font-size:14px;color:var(--muted);overflow-wrap:anywhere;margin:3px 0 0}
  .facts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:20px 0;margin-top:10px}.facts div{display:flex;flex-direction:column;gap:4px}.facts span{font-size:13px;color:var(--muted)}.facts b{font-size:15px;font-weight:750}
  .source-actions{border-top:1px solid var(--border);padding-top:17px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .epg-error,.epg-working{display:flex;align-items:center;gap:8px;font-size:14px;border-radius:10px;padding:11px;margin-bottom:15px;overflow-wrap:anywhere}
  .epg-error{background:var(--danger-bg);color:var(--danger)}.epg-working{background:var(--accent-light);color:var(--accent)}
  .detail-buttons{display:flex;gap:9px}.detail-area{margin-top:27px;border-top:1px solid var(--border);padding-top:25px}
  .filters{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:19px}.filters mat-form-field{flex:1;min-width:190px;max-width:360px}
  .epg-table{border-collapse:collapse;width:100%;min-width:660px}.epg-table th{font-size:13px;color:var(--muted);text-align:left;border-bottom:1px solid var(--border);padding:12px;font-weight:800}.epg-table td{padding:14px 12px;border-bottom:1px solid var(--border);font-size:15px;vertical-align:middle}
  .epg-table tr:hover td{background:var(--muted-panel)}.mono{font-family:ui-monospace,monospace;font-size:13px;overflow-wrap:anywhere}.error-text{max-width:250px;overflow-wrap:anywhere;color:var(--danger)}
  .pagination{display:flex;justify-content:flex-end;align-items:center;gap:18px;padding:18px 0}.pagination span{color:var(--muted);font-size:14px}
  .automap-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:15px}.auto-list{padding:14px 18px;margin:0 0 15px;border:1px solid var(--border);border-radius:14px;font-size:15px}.auto-list div{display:flex;gap:10px;align-items:center;padding:6px 0}.auto-list .material-symbols-outlined{color:var(--accent)}.auto-list p{margin-bottom:0;color:var(--muted)}.mapper{padding:22px;border:1px solid var(--border);border-radius:16px;background:var(--muted-panel);margin-bottom:23px}
  .mapper-fields{display:grid;grid-template-columns:1fr auto 1fr 1fr;gap:12px;align-items:center}.mapper-fields mat-form-field{min-width:0}.mapper-fields button{min-height:44px}.map-submit{grid-column:4}
  .date-field{display:flex;align-items:center;gap:8px;font-size:15px;color:var(--muted)}.date-field input{border:1px solid var(--border);border-radius:9px;padding:12px;background:var(--surface);color:var(--text);font-size:16px}
  .programme-row{display:flex;align-items:flex-start;gap:22px;padding:18px 12px;border-bottom:1px solid var(--border)}.programme-row:hover{background:var(--muted-panel)}
  .programme-time{display:flex;flex-direction:column;gap:3px;min-width:70px}.programme-time b{font-size:19px}.programme-time span{font-size:14px;color:var(--muted)}
  .programme-row>div:nth-child(2){flex:1}.programme-row strong{font-size:16px}.programme-row p{font-size:14px;color:var(--muted);margin:4px 0 0;white-space:pre-wrap;max-height:72px;overflow:hidden}
  @media(max-width:1000px){.mapper-fields{grid-template-columns:1fr 1fr}.map-submit{grid-column:auto}.metrics{gap:10px}.metric{padding:17px}}
  @media(max-width:700px){.metrics{grid-template-columns:1fr}.facts{grid-template-columns:1fr 1fr}.epg-source{padding:15px}.source-main{flex-wrap:wrap}.mapper-fields{grid-template-columns:1fr}.filters mat-form-field{max-width:none}}
`]})
export class EpgComponent implements OnDestroy {
  private api=inject(EpgApi);private feedback=inject(Feedback);private dialog=inject(MatDialog);
  readonly auth=inject(AuthService);readonly context=inject(ProviderContext);
  readonly sources=signal<EpgSource[]>([]);readonly loadingSources=signal(false);
  readonly activeSource=signal<EpgSource|null>(null);readonly mode=signal<'channels'|'jobs'>('channels');
  readonly channels=signal<EpgChannel[]>([]);readonly jobs=signal<EpgJob[]>([]);
  readonly mappings=signal<EpgMapping[]>([]);readonly streamOptions=signal<{id:string;name:string;number:number}[]>([]);
  readonly mappingChannels=signal<EpgChannel[]>([]);readonly programmes=signal<EpgProgramme[]>([]);
  readonly savingMap=signal(false);readonly previewLoading=signal(false);
  private jobTimer?:ReturnType<typeof setTimeout>;
  tab=0;channelSearch='';channelOffset=0;mappingSearch='';mappingOffset=0;
  streamSearch='';mappingStreamId='';mappingSourceId:number|null=null;mappingChannelSearch='';mappingChannelId='';previewStreamId='';
  previewDate=[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-');
  constructor(){effect(()=>{this.context.selectedId();this.loadSources();this.loadMappings();this.loadStreams();});}
  ngOnDestroy(){if(this.jobTimer)clearTimeout(this.jobTimer);}
  canGlobalWrite(){return this.auth.can('epg.write');}
  canWrite(){return this.auth.can('epg.write',this.context.selectedId());}
  canRemove(m:EpgMapping){return this.auth.can('epg.write',m.provider_id);}
  healthyCount(){return this.sources().filter(s=>!!s.last_success_at).length;}
  channelCount(){return this.sources().reduce((sum,s)=>sum+Number(s.channel_count||0),0);}
  interval(seconds:number){return seconds>=86400?`${seconds/86400} сут.`:seconds>=3600?`${seconds/3600} ч.`:`${seconds/60} мин.`;}
  jobStatus(s:string){return ({success:'Успех',failed:'Ошибка',running:'Выполняется',queued:'В очереди'} as Record<string,string>)[s]??s;}
  tabChanged(idx:number){if(idx===1)this.loadMappings();if(idx===2&&this.previewStreamId)this.loadProgrammes();}
  loadSources(){if(!this.auth.can('epg.read',this.context.selectedId()))return;
    this.loadingSources.set(true);this.api.sources(this.context.selectedId()??undefined).subscribe({next:r=>{
      this.sources.set(r);this.loadingSources.set(false);if(!this.mappingSourceId&&r.length)this.mappingSourceId=r[0].id;
    },error:e=>{this.loadingSources.set(false);this.feedback.error(e);}});
  }
  editSource(source?:EpgSource){this.dialog.open(EpgSourceDialogComponent,{data:{source},width:'680px',maxWidth:'96vw'}).afterClosed().subscribe(ok=>{if(ok)this.loadSources();});}
  importNow(s:EpgSource){this.api.importSource(s.id).subscribe({next:()=>{this.feedback.ok('Запрос на импорт отправлен');this.openJobs(s);
    setTimeout(()=>this.loadSources(),1000);},error:e=>this.feedback.error(e)});}
  openChannels(s:EpgSource){this.activeSource.set(s);this.mode.set('channels');this.channelOffset=0;this.channelSearch='';this.loadChannels();}
  openJobs(s:EpgSource){this.activeSource.set(s);this.mode.set('jobs');this.loadJobs();}
  loadChannels(){const s=this.activeSource();if(!s)return;
    this.api.channels(s.id,this.channelSearch,this.channelOffset,this.context.selectedId()??undefined)
    .subscribe({next:r=>this.channels.set(r),error:e=>this.feedback.error(e)});
  }
  loadJobs(){const s=this.activeSource();if(!s)return;
    if(this.jobTimer)clearTimeout(this.jobTimer);
    this.api.jobs(s.id,this.context.selectedId()??undefined).subscribe({next:r=>{
      this.jobs.set(r);
      if(this.activeSource()?.id===s.id && r.some(j=>j.status==='running'||j.status==='queued')){
        this.jobTimer=setTimeout(()=>{this.loadJobs();this.loadSources();},6000);
      }
    },error:e=>this.feedback.error(e)});
  }
  loadStreams(){if(!this.auth.can('streams.read',this.context.selectedId()))return;
    this.api.streamOptions(this.context.selectedId()??undefined,this.streamSearch).subscribe({next:r=>this.streamOptions.set(r),error:e=>this.feedback.error(e)});
  }
  loadMappingChannels(){if(!this.mappingSourceId)return;
    this.api.channels(this.mappingSourceId,this.mappingChannelSearch,0,this.context.selectedId()??undefined)
    .subscribe({next:r=>{this.mappingChannels.set(r);if(!r.some(x=>x.id===this.mappingChannelId))this.mappingChannelId='';},error:e=>this.feedback.error(e)});
  }
  loadMappings(){if(!this.auth.can('epg.read',this.context.selectedId()))return;
    this.api.mappings(this.context.selectedId()??undefined,this.mappingSearch,this.mappingOffset)
    .subscribe({next:r=>this.mappings.set(r),error:e=>this.feedback.error(e)});
  }
  saveMapping(){if(!this.mappingStreamId||!this.mappingChannelId)return;this.savingMap.set(true);
    this.api.setMapping({stream_id:this.mappingStreamId,epg_channel_id:this.mappingChannelId,provider_id:this.context.selectedId(),priority:10})
      .subscribe({next:()=>{this.savingMap.set(false);this.feedback.ok('Соответствие сохранено');this.mappingOffset=0;this.loadMappings();},
        error:e=>{this.savingMap.set(false);this.feedback.error(e)}});
  }
  removeMapping(m:EpgMapping){if(!confirm(`Удалить связь канала «${m.stream_name}» с EPG?`))return;
    this.api.removeMapping(m.id).subscribe({next:()=>{this.feedback.ok('Связь удалена');this.loadMappings()},error:e=>this.feedback.error(e)});
  }
  loadProgrammes(){if(!this.previewStreamId)return;this.previewLoading.set(true);
    const start=new Date(this.previewDate+'T00:00:00');const end=new Date(start.getTime()+86400000);
    this.api.programmes(this.previewStreamId,this.context.selectedId()??undefined,start.toISOString(),end.toISOString())
      .subscribe({next:r=>{this.previewLoading.set(false);this.programmes.set(r)},error:e=>{this.previewLoading.set(false);this.feedback.error(e)}});
  }
}
