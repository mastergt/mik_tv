import { Component, inject, signal, effect } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';
import { CatalogApi } from '../core/catalog-api.service';
import { AuthService } from '../core/auth.service';
import { ProviderContext } from '../core/provider-context.service';
import { Feedback } from '../core/feedback.service';
import { Playlist } from '../core/models';
import { PlaylistDialog } from '../dialogs/playlist-dialog.component';
import { ConfirmDialog } from '../dialogs/confirm-dialog.component';
@Component({selector:'app-playlists',standalone:true,imports:[RouterLink,MatButtonModule,MatProgressBarModule,MatMenuModule,FormsModule],template:`
<div class="page"><div class="page-head"><div><div class="eyebrow">ПАКЕТЫ КОНТЕНТА</div><h1 class="page-title">Плейлисты</h1><p class="page-desc">Создавайте подборки каналов, управляйте составом и доступностью для провайдеров.</p></div>
@if(canWrite()){<button mat-flat-button class="primary-btn" (click)="create()"><span class="material-symbols-outlined" style="font-size:20px;margin-right:8px">playlist_add</span>Новый плейлист</button>}
</div>
<section class="surface panel"><div class="toolbar-row"><div class="search-custom"><span class="material-symbols-outlined">search</span><input aria-label="Поиск плейлистов" placeholder="Название плейлиста…" [(ngModel)]="search" (ngModelChange)="filterChanged()"></div><span class="pill">На странице: {{rows().length}}</span></div>
@if(loading()){<mat-progress-bar mode="indeterminate" />}
<div class="playlist-grid">
@for(p of rows();track p.id){<article class="playlist-card">
  <a [routerLink]="['/playlists',p.id]" class="card-icon"><span class="material-symbols-outlined">playlist_play</span></a>
  <div class="card-main"><div class="card-top"><span class="pill" [class.success]="p.enabled" [class.danger]="!p.enabled">{{p.enabled?'Активен':'Выключен'}}</span>@if(p.is_hidden){<span class="pill">Скрытый</span>}</div>
    <a [routerLink]="['/playlists',p.id]" class="card-title">{{p.name}}</a><p>{{p.description||'Подборка телеканалов и видеопотоков'}}</p>
  </div>
  <div class="card-details"><span><span class="material-symbols-outlined">live_tv</span>{{p.streams_count??0}} каналов</span><span><span class="material-symbols-outlined">corporate_fare</span>{{p.visibility==='all'?'Все провайдеры':'Выбранные'}}</span></div>
  <div class="card-bottom"><a mat-stroked-button [routerLink]="['/playlists',p.id]">Открыть редактор <span class="material-symbols-outlined" style="font-size:18px;margin-left:7px">arrow_forward</span></a>
    @if(canWrite()){<button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Действия плейлиста"><span class="material-symbols-outlined">more_horiz</span></button>
    <mat-menu #menu="matMenu"><button mat-menu-item (click)="edit(p)"><span class="material-symbols-outlined">edit</span>Настройки</button><button mat-menu-item (click)="remove(p)"><span class="material-symbols-outlined">delete</span>Удалить</button></mat-menu>}
  </div>
</article>}@empty{<div class="empty grid-empty"><span class="material-symbols-outlined">playlist_remove</span><strong>Плейлистов пока нет</strong><span>Создайте первую подборку каналов</span></div>}
</div>
<div class="pager"><span>Страница {{page()+1}}</span><div><button mat-stroked-button (click)="move(-1)" [disabled]="page()===0||loading()">Назад</button><button mat-stroked-button (click)="move(1)" [disabled]="rows().length<24||loading()">Вперёд</button></div></div>
</section>
</div>
`,styles:[`
.search-custom{display:flex;gap:12px;align-items:center;padding:0 15px;width:min(100%,390px);height:46px;border:1px solid var(--border);border-radius:11px;background:var(--muted-panel);color:var(--muted)}
.search-custom input{border:0;outline:0;background:none;color:var(--text);font-size:14px;min-width:0;flex:1}
.playlist-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px}.playlist-card{border:1px solid var(--border);border-radius:17px;padding:22px 22px 18px;transition:box-shadow .2s,transform .2s;background:var(--surface);display:flex;flex-direction:column;min-height:265px}.playlist-card:hover{box-shadow:0 16px 30px rgba(20,55,100,.07);transform:translateY(-2px)}
.card-icon{height:48px;width:48px;background:var(--accent-light);color:var(--accent);border-radius:14px;display:grid;place-items:center;margin-bottom:17px}.card-icon .material-symbols-outlined{font-size:28px}.card-top{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.card-title{font-size:19px;font-weight:800;letter-spacing:-.025em;display:block;line-height:1.35}.card-main p{font-size:13px;line-height:1.7;color:var(--muted);margin:6px 0 18px;min-height:24px}
.card-details{display:flex;flex-wrap:wrap;gap:11px 15px;margin:auto 0 15px}.card-details span{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);font-weight:750}.card-details .material-symbols-outlined{font-size:18px}
.card-bottom{border-top:1px solid var(--border);padding-top:15px;display:flex;align-items:center;justify-content:space-between;gap:8px}.card-bottom a{border-radius:10px;font-size:12px;font-weight:800}.grid-empty{grid-column:1/-1}.pager{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;color:var(--muted);font-size:12px}.pager div{display:flex;gap:9px}
@media(max-width:1330px){.playlist-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.playlist-grid{grid-template-columns:1fr}}
`]
})
export class PlaylistsComponent {
  private api=inject(CatalogApi);private dialog=inject(MatDialog);private feedback=inject(Feedback);private router=inject(Router);
  readonly auth=inject(AuthService);readonly context=inject(ProviderContext);
  readonly rows=signal<Playlist[]>([]);readonly loading=signal(false);readonly search=signal('');readonly page=signal(0);
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(){effect(()=>{const pid=this.context.selectedId();this.page.set(0);this.load(pid);});}
  canWrite(){return this.auth.can('playlists.write',this.context.selectedId());}
  load(pid:number|null=this.context.selectedId()){
    if(!this.auth.can('playlists.read',pid))return;this.loading.set(true);
    this.api.playlists({providerId:pid??undefined,limit:24,offset:this.page()*24,search:this.search()}).subscribe({next:r=>{this.rows.set(r);this.loading.set(false);},error:e=>{this.loading.set(false);this.feedback.error(e);}});
  }
  filterChanged(){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.page.set(0);this.load();},300);}
  move(delta:number){this.page.update(n=>Math.max(0,n+delta));this.load();}
  private openEditor(playlist?:Playlist){
    const show=(full?:Playlist)=>{
      this.dialog.open(PlaylistDialog,{data:{playlist:full,providers:this.context.providers(),selectedProvider:this.context.selectedId(),globalWrite:this.auth.can('playlists.write')},width:'770px',maxWidth:'97vw'}).afterClosed().subscribe(saved=>{
        if(saved){this.load();if(!playlist)this.router.navigate(['/playlists',saved.id]);}
      });
    };
    if(playlist)this.api.playlist(playlist.id,this.context.selectedId()??undefined).subscribe({next:show,error:e=>this.feedback.error(e)});
    else show();
  }
  create(){this.openEditor();}edit(p:Playlist){this.openEditor(p);}
  remove(p:Playlist){this.dialog.open(ConfirmDialog,{data:{title:'Удалить плейлист?',text:`Плейлист «${p.name}» будет удалён вместе со связями его каналов.`}}).afterClosed().subscribe(ok=>{
    if(ok)this.api.deletePlaylist(p.id).subscribe({next:()=>{this.feedback.ok('Плейлист удалён');this.load();},error:e=>this.feedback.error(e)});
  });}
}
