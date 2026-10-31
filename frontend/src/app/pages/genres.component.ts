import { Component, inject, signal, effect } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { CatalogApi } from '../core/catalog-api.service';
import { Feedback } from '../core/feedback.service';
import { ProviderContext } from '../core/provider-context.service';
import { AuthService } from '../core/auth.service';
import { Genre } from '../core/models';
import { GenreDialog } from '../dialogs/genre-dialog.component';
@Component({standalone:true,imports:[MatButtonModule],template:`
<div class="page"><div class="page-head"><div><div class="eyebrow">КАТАЛОГ КАТЕГОРИЙ</div><h1 class="page-title">Жанры</h1><p class="page-desc">Тематические категории: эфирные, кино, новости, приключения, спорт и другие.</p></div>
@if(canWrite()){<button mat-flat-button class="primary-btn" (click)="open()"><span class="material-symbols-outlined" style="margin-right:7px">add</span>Новый жанр</button>}</div>
<div class="surface panel"><div class="genre-grid">@for(g of genres();track g.id){<div class="genre-card">
<div class="genre-icon"><span class="material-symbols-outlined">category</span></div><div class="genre-info"><b>{{g.name}}</b><small>{{g.visibility==='all'?'Все провайдеры':'Выбранные провайдеры'}}</small></div>
@if(g.is_adult){<span class="pill danger">18+</span>}
@if(canWrite()){<button mat-icon-button aria-label="Редактировать жанр" (click)="open(g)"><span class="material-symbols-outlined">edit</span></button>}
</div>}@empty{<div class="empty" style="grid-column:1/-1"><span class="material-symbols-outlined">category</span><strong>Жанров пока нет</strong></div>}</div></div>
</div>
`,styles:[`
.genre-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.genre-card{display:flex;align-items:center;gap:13px;padding:15px;border-radius:14px;border:1px solid var(--border)}.genre-icon{display:grid;place-items:center;width:42px;height:42px;flex:none;background:var(--accent-light);border-radius:12px;color:var(--accent)}.genre-info{min-width:0;flex:1}.genre-info b,.genre-info small{display:block}.genre-info b{font-size:15px}.genre-info small{font-size:12px;color:var(--muted);margin-top:3px}.genre-card button{color:var(--muted)}
@media(max-width:1150px){.genre-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.genre-grid{grid-template-columns:1fr}}
`]
})
export class GenresComponent {
  private api=inject(CatalogApi);private dialog=inject(MatDialog);private feedback=inject(Feedback);
  readonly auth=inject(AuthService);readonly context=inject(ProviderContext);readonly genres=signal<Genre[]>([]);
  constructor(){effect(()=>{this.load(this.context.selectedId());});}
  canWrite(){return this.auth.can('genres.write',this.context.selectedId());}
  load(pid:number|null){
    if(!this.auth.can('genres.read',pid))return;
    this.api.genres(pid??undefined).subscribe({next:r=>this.genres.set(r),error:e=>this.feedback.error(e)});
  }
  open(genre?:Genre){
    const pid=this.context.selectedId();
    this.dialog.open(GenreDialog,{data:{genre,providers:this.context.providers(),selectedProvider:pid,globalWrite:this.auth.can('genres.write')},width:'680px',maxWidth:'96vw'})
      .afterClosed().subscribe(v=>{if(v)this.load(pid);});
  }
}
