import { Component, inject, signal, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { CatalogApi } from '../core/catalog-api.service';
import { AuthService } from '../core/auth.service';
import { Feedback } from '../core/feedback.service';
import { AppType } from '../core/models';
import { AppTypeDialog } from '../dialogs/app-type-dialog.component';
@Component({standalone:true,imports:[MatButtonModule],template:`
<div class="page"><div class="page-head"><div><div class="eyebrow">ИНТЕРФЕЙСЫ КОНТЕНТА</div><h1 class="page-title">Типы приложений</h1><p class="page-desc">ТВ, видеонаблюдение, домофония и радио. У каждого типа может быть собственный режим интерфейса клиента.</p></div>
@if(auth.can('streams.write')){<button mat-flat-button class="primary-btn" (click)="edit()"><span class="material-symbols-outlined" style="margin-right:7px">add</span>Добавить тип</button>}</div>
<div class="app-grid">@for(a of apps();track a.id){<div class="app-card surface"><div class="app-icon"><span class="material-symbols-outlined">{{icon(a.code)}}</span></div><div class="app-data"><b>{{a.name}}</b><span class="app-code">{{a.code}}</span><p>Режим отображения {{a.name.toLowerCase()}} в приложениях.</p><span class="pill" [class.success]="a.enabled" [class.danger]="!a.enabled">{{a.enabled?'Активен':'Выключен'}}</span></div>
@if(auth.can('streams.write')){<button mat-icon-button (click)="edit(a)" aria-label="Изменить приложение"><span class="material-symbols-outlined">edit</span></button>}
</div>}@empty{<div class="empty" style="grid-column:1/-1"><span class="material-symbols-outlined">apps</span><strong>Нет типов приложений</strong></div>}</div>
</div>
`,styles:[`
.app-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.app-card{padding:25px;display:flex;align-items:start;gap:17px}.app-icon{background:var(--accent-light);color:var(--accent);display:grid;place-items:center;width:54px;height:54px;border-radius:17px;flex:none}.app-icon span{font-size:29px}.app-data{flex:1;min-width:0}.app-data b{display:block;font-size:20px;font-weight:800;letter-spacing:-.035em}.app-data p{font-size:13px;line-height:1.65;color:var(--muted);margin:10px 0 15px}.app-code{font-size:11px;font-weight:800;color:var(--accent);letter-spacing:.08em;text-transform:uppercase}.app-card button{color:var(--muted)}
@media(max-width:1350px){.app-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.app-grid{grid-template-columns:1fr}}
`]
})
export class AppTypesComponent implements OnInit {
  private api=inject(CatalogApi);private feedback=inject(Feedback);private dialog=inject(MatDialog);
  readonly auth=inject(AuthService);readonly apps=signal<AppType[]>([]);
  ngOnInit(){this.load();}
  icon(code:string){return ({tv:'live_tv',cctv:'videocam',intercom:'doorbell',radio:'radio'} as Record<string,string>)[code]??'apps';}
  load(){this.api.appTypes().subscribe({next:r=>this.apps.set(r),error:e=>this.feedback.error(e)});}
  edit(data?:AppType){this.dialog.open(AppTypeDialog,{data:data??null,width:'640px',maxWidth:'95vw'}).afterClosed().subscribe(v=>{if(v)this.load();});}
}
