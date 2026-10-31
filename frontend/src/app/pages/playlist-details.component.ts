import { Component, inject, signal, effect } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../core/catalog-api.service';
import { ProviderContext } from '../core/provider-context.service';
import { AuthService } from '../core/auth.service';
import { Feedback } from '../core/feedback.service';
import { Playlist, PlaylistItem, Stream } from '../core/models';
import { PlaylistDialog } from '../dialogs/playlist-dialog.component';
@Component({selector:'app-playlist-details',standalone:true,imports:[RouterLink,MatButtonModule,MatProgressBarModule,DragDropModule,FormsModule],template:`
<div class="page"><a routerLink="/playlists" class="back-link"><span class="material-symbols-outlined">arrow_back</span> Все плейлисты</a>
<div class="page-head"><div><div class="eyebrow">КОНСТРУКТОР ПЛЕЙЛИСТА</div><h1 class="page-title">{{playlist()?.name||'Плейлист'}}</h1><p class="page-desc">Добавляйте каналы и перетаскивайте их для изменения порядка.</p></div>
<div class="head-actions">@if(canWrite()){<button mat-stroked-button class="outline-btn" (click)="editMeta()"><span class="material-symbols-outlined" style="font-size:18px;margin-right:6px">tune</span>Настройки</button>
<button mat-flat-button class="primary-btn" [disabled]="!dirty()||saving()" (click)="save()"><span class="material-symbols-outlined" style="font-size:19px;margin-right:6px">save</span>{{saving()?'Сохраняем…':'Сохранить порядок'}}</button>}</div></div>
@if(loading()){<mat-progress-bar mode="indeterminate" />}
@if(dirty()){<div class="unsaved"><span class="material-symbols-outlined">edit_note</span> Есть несохранённые изменения в составе плейлиста.</div>}
<div class="builder-grid">
<section class="surface panel"><div class="builder-head"><div><h2>Каталог каналов</h2><p>Доступные для добавления</p></div><span class="pill">{{candidates().length}} найдено</span></div>
<div class="search-custom"><span class="material-symbols-outlined">search</span><input aria-label="Поиск каналов" placeholder="Найти канал по названию…" [(ngModel)]="search" (ngModelChange)="searchChanged()"></div>
<div class="candidate-list">@for(s of candidates();track s.id){<div class="candidate"><div class="channel-square"><span class="material-symbols-outlined">{{s.is_radio?'radio':'tv'}}</span></div><div class="grow"><b>{{s.name}}</b><small>№{{s.number}} · {{s.enabled?'Активен':'Выключен'}}</small></div>
<button mat-icon-button [disabled]="!canWrite()||contains(s.id)" [attr.aria-label]="contains(s.id)?'Уже добавлен':'Добавить канал'" (click)="add(s)"><span class="material-symbols-outlined">{{contains(s.id)?'check_circle':'add_circle'}}</span></button></div>}@empty{<div class="empty"><span class="material-symbols-outlined">search_off</span><strong>Каналы не найдены</strong><span>Попробуйте другой запрос</span></div>}</div>
<div class="list-foot">Показаны первые 200 результатов. Для большого каталога уточните поиск.</div>
</section>
<section class="surface panel"><div class="builder-head"><div><h2>Состав плейлиста</h2><p>Порядок отображения у абонента</p></div><span class="pill blue">{{items().length}} каналов</span></div>
<div class="notice hint"><span class="material-symbols-outlined">drag_indicator</span> Для сортировки потяните канал за маркер слева.</div>
<div cdkDropList [cdkDropListDisabled]="!canWrite()" (cdkDropListDropped)="drop($event)" class="chosen-list">
@for(item of items();track item.stream_id){<div cdkDrag class="chosen" [cdkDragDisabled]="!canWrite()"><span cdkDragHandle class="material-symbols-outlined grip">drag_indicator</span><span class="chosen-number">{{$index+1}}</span>
<div class="channel-square"><span class="material-symbols-outlined">tv</span></div><div class="grow"><b>{{item.name}}</b><small>ID {{item.stream_id}}</small></div>
@if(canWrite()){<button mat-icon-button aria-label="Убрать из плейлиста" (click)="remove(item.stream_id)"><span class="material-symbols-outlined">close</span></button>}
</div>}@empty{<div class="empty"><span class="material-symbols-outlined">playlist_add</span><strong>Плейлист пустой</strong><span>Добавьте каналы из каталога слева</span></div>}
</div>
</section>
</div>
<div class="notice bottom-info"><span class="material-symbols-outlined">info</span>Для плейлиста, доступного всем провайдерам, разрешены только глобальные каналы. Для выбранных провайдеров каждый канал должен быть доступен всем указанным провайдерам.</div>
</div>
`,styles:[`
.back-link{display:inline-flex;align-items:center;gap:9px;color:var(--muted);font-size:13px;font-weight:800;margin-bottom:26px}.back-link span{font-size:20px}
.head-actions{display:flex;gap:10px;flex-wrap:wrap}.builder-grid{display:grid;grid-template-columns:1fr 1.05fr;align-items:start;gap:22px}.builder-head{display:flex;align-items:start;justify-content:space-between;gap:15px;margin-bottom:18px}.builder-head h2{font-size:19px;letter-spacing:-.03em;margin:0;font-weight:800}.builder-head p{font-size:13px;color:var(--muted);margin:3px 0 0}
.search-custom{display:flex;gap:10px;align-items:center;background:var(--muted-panel);border:1px solid var(--border);border-radius:11px;padding:0 13px;height:46px;color:var(--muted);margin-bottom:14px}
.search-custom input{border:0;outline:0;background:none;flex:1;min-width:0;color:var(--text);font-size:14px}
.candidate-list,.chosen-list{max-height:620px;min-height:180px;overflow:auto}.candidate,.chosen{display:flex;align-items:center;gap:11px;border:1px solid var(--border);border-radius:12px;padding:9px 10px;margin-bottom:8px;background:var(--surface)}.candidate:hover,.chosen:hover{background:var(--muted-panel)}
.channel-square{display:grid;place-items:center;background:var(--accent-light);color:var(--accent);width:38px;height:38px;flex:none;border-radius:10px}.channel-square span{font-size:21px}
.grow{min-width:0;flex:1}.grow b{font-size:14px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.grow small{font-size:12px;color:var(--muted);margin-top:2px;display:block}.candidate button,.chosen button{color:var(--accent)}.list-foot{font-size:11px;color:var(--muted);margin-top:15px;line-height:1.7}
.hint{display:flex;align-items:center;gap:7px;margin-bottom:16px;color:var(--muted);background:var(--muted-panel)}.hint span{font-size:20px}.grip{cursor:grab;color:var(--muted)}.chosen-number{font-family:'DM Sans',sans-serif;font-size:12px;color:var(--muted);font-weight:800;width:16px;text-align:center}.cdk-drag-preview{box-shadow:0 12px 32px rgba(18,45,80,.15);border-radius:12px}.cdk-drag-placeholder{opacity:.2}.cdk-drag-animating{transition:transform 180ms}.bottom-info{display:flex;align-items:center;gap:9px;margin-top:21px}.unsaved{display:flex;align-items:center;gap:8px;margin-bottom:16px;border-radius:12px;padding:12px 16px;background:var(--accent-light);color:var(--accent);font-weight:700;font-size:12px}
@media(max-width:1120px){.builder-grid{grid-template-columns:1fr}}
`]
})
export class PlaylistDetailsComponent {
  private route=inject(ActivatedRoute);private api=inject(CatalogApi);private feedback=inject(Feedback);private dialog=inject(MatDialog);
  readonly auth=inject(AuthService);readonly context=inject(ProviderContext);
  readonly id=this.route.snapshot.paramMap.get('id')!;
  readonly playlist=signal<Playlist|null>(null);readonly items=signal<PlaylistItem[]>([]);readonly candidates=signal<Stream[]>([]);
  readonly loading=signal(false);readonly saving=signal(false);readonly dirty=signal(false);readonly search=signal('');
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(){effect(()=>{const pid=this.context.selectedId();this.load(pid);this.searchStreams(pid);});}
  canWrite(){return this.auth.can('playlists.write',this.context.selectedId());}
  load(pid:number|null=this.context.selectedId()){
    this.loading.set(true);this.api.playlist(this.id,pid??undefined).subscribe({next:p=>{this.playlist.set(p);this.items.set(p.items??[]);this.dirty.set(false);this.loading.set(false);},error:e=>{this.loading.set(false);this.feedback.error(e);}});
  }
  searchStreams(pid:number|null=this.context.selectedId()){
    if(!this.auth.can('streams.read',pid))return;
    this.api.streams({providerId:pid??undefined,search:this.search(),limit:200}).subscribe({next:r=>this.candidates.set(r),error:e=>this.feedback.error(e)});
  }
  searchChanged(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.searchStreams(),320);}
  contains(id:string){return this.items().some(x=>x.stream_id===id);}
  add(stream:Stream){if(this.contains(stream.id)||!this.canWrite())return;
    this.items.update(items=>[...items,{id:'new-'+stream.id,stream_id:stream.id,name:stream.name,enabled:stream.enabled,position:items.length+1}]);this.dirty.set(true);
  }
  remove(id:string){this.items.update(items=>items.filter(x=>x.stream_id!==id));this.dirty.set(true);}
  drop(e:CdkDragDrop<PlaylistItem[]>){if(!this.canWrite())return;
    const rows=[...this.items()];moveItemInArray(rows,e.previousIndex,e.currentIndex);this.items.set(rows);this.dirty.set(true);
  }
  save(){if(this.saving()||!this.dirty())return;this.saving.set(true);
    this.api.replacePlaylistItems(this.id,this.items().map(x=>x.stream_id)).subscribe({next:()=>{this.saving.set(false);this.feedback.ok('Состав плейлиста сохранён');this.load();},error:e=>{this.saving.set(false);this.feedback.error(e);}});
  }
  editMeta(){const p=this.playlist();if(!p)return;
    this.dialog.open(PlaylistDialog,{data:{playlist:p,providers:this.context.providers(),selectedProvider:this.context.selectedId(),globalWrite:this.auth.can('playlists.write')},width:'770px',maxWidth:'97vw'}).afterClosed().subscribe(v=>{if(v)this.load();});
  }
}
