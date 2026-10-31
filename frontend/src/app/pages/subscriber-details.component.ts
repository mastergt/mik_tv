import {Component,inject,signal,effect} from '@angular/core';
import {RouterLink,ActivatedRoute} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTabsModule} from '@angular/material/tabs';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {SubscribersApi} from '../core/subscribers-api.service';
import {CatalogApi} from '../core/catalog-api.service';
import {Feedback} from '../core/feedback.service';
import {AuthService} from '../core/auth.service';
import {ProviderContext} from '../core/provider-context.service';
import {Assignment,Entitlements,Playlist,Stream,Subscriber,Terminal} from '../core/models';
import {SubscriberDialog} from '../dialogs/subscriber-dialog.component';
import {ConfirmDialog} from '../dialogs/confirm-dialog.component';
@Component({selector:'app-subscriber-details',standalone:true,imports:[RouterLink,FormsModule,MatButtonModule,MatSelectModule,MatFormFieldModule,MatInputModule,MatTabsModule,MatProgressBarModule],template:`
<div class="page">
 <a routerLink="/abonents" class="backlink"><span class="material-symbols-outlined">arrow_back</span> Все абоненты</a>
 @if(abonent();as a){
 <div class="page-head"><div><div class="eyebrow">КАРТОЧКА АБОНЕНТА · ID {{a.id}}</div><h1 class="page-title">{{a.display_name||a.username}}</h1>
  <p class="page-desc">{{a.username}} · {{a.provider_name}} · Договор {{a.contract_number||'не указан'}}</p></div>
  <div class="actions">@if(canWrite()){<button mat-stroked-button (click)="edit()"><span class="material-symbols-outlined">edit</span> Изменить</button>}
   @if(canReveal()){<button mat-stroked-button (click)="reveal()"><span class="material-symbols-outlined">visibility</span> Показать пароль</button>}</div></div>
 <div class="facts">
  <div class="surface fact"><div>Баланс</div><strong>{{a.balance_kopecks===null?'Нет данных':balance(a.balance_kopecks)}}</strong><small>{{a.balance_synced_at?'Обновлён '+format(a.balance_synced_at):'Ожидаем данные биллинга'}}</small></div>
  <div class="surface fact"><div>Терминалов</div><strong>{{a.terminal_count}} / {{limit(a.terminal_limit_override,a.default_terminal_limit)}}</strong><small>Максимум активных устройств</small></div>
  <div class="surface fact"><div>Одновременных просмотров</div><strong>{{limit(a.concurrent_stream_limit_override,a.default_concurrent_stream_limit)}}</strong><small>Лимит сессий просмотра</small></div>
  <div class="surface fact"><div>Состояние</div><strong [class.positive]="a.enabled">{{a.enabled?'Активен':'Отключён'}}</strong><small>{{a.phone||a.email||'Контакт не указан'}}</small></div>
 </div>
 <mat-tab-group animationDuration="180ms">
 <mat-tab label="Плейлисты">
  <section class="surface panel tabpanel">
   <div class="section-head"><h2>Назначенные плейлисты</h2><span class="pill blue">{{entitlements().playlists.length}}</span></div>
   @for(x of entitlements().playlists;track x.id){<div class="list-item"><span class="material-symbols-outlined accent">playlist_play</span>
    <div class="grow"><b>{{x.name}}</b><div class="subtext">{{period(x)}} · {{x.enabled?'Назначен':'Выключен'}}</div></div>
    @if(canWrite()){<button mat-button (click)="remove('playlists',x)">Убрать</button>}</div>}
   @empty{<div class="empty"><strong>Плейлисты не назначены</strong><span>Выберите пакет из каталога</span></div>}
   @if(canWrite()){<div class="assign"><mat-form-field appearance="outline"><mat-label>Добавить плейлист</mat-label>
     <mat-select [(ngModel)]="playlistId">@for(p of availablePlaylists();track p.id){<mat-option [value]="p.id">{{p.name}}</mat-option>}</mat-select></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Доступ до (необязательно)</mat-label><input matInput type="datetime-local" [(ngModel)]="playlistUntil"></mat-form-field>
    <button mat-flat-button [disabled]="!playlistId||busy()" (click)="grant('playlists')">Назначить</button></div>}
  </section>
 </mat-tab>
 <mat-tab label="Отдельные потоки">
  <section class="surface panel tabpanel"><div class="section-head"><h2>Персональные потоки</h2><span class="pill blue">{{entitlements().streams.length}}</span></div>
   @for(x of entitlements().streams;track x.id){<div class="list-item"><span class="material-symbols-outlined accent">live_tv</span>
     <div class="grow"><b>{{x.number}}. {{x.name}}</b><div class="subtext">{{period(x)}}</div></div>
     @if(canWrite()){<button mat-button (click)="remove('streams',x)">Убрать</button>}</div>}
   @empty{<div class="empty"><strong>Нет отдельных потоков</strong><span>Их можно назначать независимо от плейлистов</span></div>}
   @if(canWrite()){<div class="assign"><mat-form-field appearance="outline"><mat-label>Поиск канала</mat-label>
     <input matInput [(ngModel)]="streamSearch" placeholder="Название или часть названия" (keyup.enter)="searchStreams()"></mat-form-field>
    <button mat-stroked-button (click)="searchStreams()">Найти</button>
    <mat-form-field appearance="outline"><mat-label>Выбрать поток</mat-label><mat-select [(ngModel)]="streamId">
      @for(s of streamCandidates();track s.id){<mat-option [value]="s.id">{{s.number}} · {{s.name}}</mat-option>}</mat-select></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Доступ до</mat-label><input matInput type="datetime-local" [(ngModel)]="streamUntil"></mat-form-field>
    <button mat-flat-button [disabled]="!streamId||busy()" (click)="grant('streams')">Назначить</button></div>}
  </section>
 </mat-tab>
 <mat-tab label="Устройства ({{terminals().length}})">
  <section class="surface panel tabpanel"><h2>Привязанные терминалы</h2>
   @for(t of terminals();track t.id){<a class="list-item" [routerLink]="['/terminals',t.id]">
     <span class="material-symbols-outlined accent">tv</span><div class="grow"><b>{{t.device_name||t.model||'Устройство '+t.id}}</b>
     <div class="subtext">{{t.platform||'Платформа неизвестна'}} · последний контакт {{format(t.last_activity)}}</div></div>
     <span class="pill" [class.success]="t.enabled">{{t.enabled?'Включён':'Отключён'}}</span></a>}
   @empty{<div class="empty"><strong>Терминалы не найдены</strong><span>Устройства появятся после первого подключения приложения</span></div>}
  </section>
 </mat-tab>
 <mat-tab label="Контакты">
  <section class="surface panel tabpanel"><h2>Информация об абоненте</h2>
   <div class="contact-grid"><div><small>Адрес</small><b>{{a.address||'—'}}</b></div><div><small>Телефон</small><b>{{a.phone||'—'}}</b></div>
     <div><small>Email</small><b>{{a.email||'—'}}</b></div><div><small>Внешняя система</small><b>{{a.external_system||'—'}}</b></div>
     <div><small>Внешний ID</small><b>{{a.external_abonent_id||'—'}}</b></div><div><small>Последний вход</small><b>{{format(a.last_login_at)}}</b></div></div>
   <h3>Комментарий</h3><p>{{a.comment||'Нет комментария'}}</p>
  </section>
 </mat-tab>
 </mat-tab-group>
 }@else{<mat-progress-bar mode="indeterminate"/>}
</div>`,styles:[`
 .backlink{display:inline-flex;align-items:center;gap:8px;color:var(--accent);font-weight:800;margin-bottom:24px;font-size:15px}
 .actions{display:flex;gap:10px;flex-wrap:wrap}.actions button{display:flex;gap:7px;align-items:center}
 .facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:17px;margin-bottom:28px}
 .fact{padding:21px;display:flex;flex-direction:column;gap:8px}.fact>div{font-size:13px;color:var(--muted);font-weight:700}.fact strong{font-size:22px;line-height:1.2}.fact strong.positive{color:var(--success)}.fact small{font-size:12px;color:var(--muted)}
 .tabpanel{margin-top:21px;min-height:300px}.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.section-head h2{margin:0}
 .assign{border-top:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:center;gap:13px;padding-top:21px;margin-top:21px}
 .assign mat-form-field{flex:1;min-width:200px}.assign button{height:46px}.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
 .contact-grid div{display:flex;flex-direction:column;gap:7px}.contact-grid small{color:var(--muted);font-size:13px}.contact-grid b{font-size:16px;word-break:break-word}
 @media(max-width:1100px){.facts{grid-template-columns:1fr 1fr}}@media(max-width:620px){.facts,.contact-grid{grid-template-columns:1fr}}
 `]})
export class SubscriberDetailsComponent {
 private api=inject(SubscribersApi);private catalog=inject(CatalogApi);private feedback=inject(Feedback);private dialog=inject(MatDialog);
 private id=inject(ActivatedRoute).snapshot.paramMap.get('id')!;
 readonly context=inject(ProviderContext);readonly auth=inject(AuthService);
 readonly abonent=signal<Subscriber|null>(null);readonly entitlements=signal<Entitlements>({playlists:[],streams:[]});
 readonly terminals=signal<Terminal[]>([]);readonly availablePlaylists=signal<Playlist[]>([]);readonly streamCandidates=signal<Stream[]>([]);
 readonly busy=signal(false);
 playlistId:string|null=null;streamId:string|null=null;playlistUntil='';streamUntil='';streamSearch='';
 constructor(){this.reload();}
 canWrite(){const a=this.abonent();return !!a&&this.auth.can('abonents.write',a.provider_id);}
 canReveal(){const a=this.abonent();return !!a&&this.auth.can('abonents.credentials.read',a.provider_id);}
 limit(local:number|null,provider:number|undefined){const val=local??provider;return val===0?'∞':val??'—';}
 format(s:string|null){return s?new Date(s).toLocaleString('ru-RU'):'—';}
 balance(v:string){return (Number(v)/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';}
 period(x:Assignment){return x.valid_until?'До '+this.format(x.valid_until):'Без даты окончания';}
 reload(){this.api.abonent(this.id).subscribe({next:a=>{this.abonent.set(a);this.loadRelations(a);},error:e=>this.feedback.error(e)});}
 loadRelations(a:Subscriber){
  this.api.entitlements(this.id).subscribe({next:r=>this.entitlements.set(r),error:e=>this.feedback.error(e)});
  this.api.terminals({abonentId:this.id,providerId:a.provider_id,limit:100}).subscribe({next:r=>this.terminals.set(r.items),error:e=>this.feedback.error(e)});
  this.catalog.playlists({providerId:a.provider_id,limit:200}).subscribe({next:r=>this.availablePlaylists.set(r),error:e=>this.feedback.error(e)});
 }
 searchStreams(){const a=this.abonent();if(!a)return;
  this.catalog.streams({providerId:a.provider_id,search:this.streamSearch,limit:100}).subscribe({next:r=>this.streamCandidates.set(r),error:e=>this.feedback.error(e)});
 }
 edit(){const a=this.abonent();if(!a)return;
  this.dialog.open(SubscriberDialog,{data:{subscriber:a,providers:this.context.providers(),providerId:a.provider_id},width:'820px',maxWidth:'97vw'})
    .afterClosed().subscribe(v=>{if(v)this.reload();});
 }
 grant(kind:'playlists'|'streams'){const value=kind==='playlists'?this.playlistId:this.streamId;
  if(!value||this.busy())return;this.busy.set(true);
  const until=kind==='playlists'?this.playlistUntil:this.streamUntil;
  const payload:Record<string,unknown>={item_id:value};if(until)payload['valid_until']=new Date(until).toISOString();
  this.api.grant(this.id,kind,payload).subscribe({next:()=>{this.busy.set(false);this.feedback.ok('Доступ назначен');
     this.api.entitlements(this.id).subscribe(r=>this.entitlements.set(r));},error:e=>{this.busy.set(false);this.feedback.error(e);}});
 }
 remove(kind:'playlists'|'streams',x:Assignment){
  this.dialog.open(ConfirmDialog,{data:{title:'Снять назначение?',text:`Доступ к «${x.name}» будет удалён у абонента.`}})
    .afterClosed().subscribe(ok=>{if(!ok)return;
     this.api.revoke(this.id,kind,kind==='playlists'?x.playlist_id!:x.stream_id!).subscribe({next:()=>{
      this.feedback.ok('Назначение снято');this.api.entitlements(this.id).subscribe(r=>this.entitlements.set(r));
     },error:e=>this.feedback.error(e)});
    });
 }
 reveal(){this.dialog.open(ConfirmDialog,{data:{title:'Показать пароль абонента?',text:'Операция будет записана в журнал аудита. Не пересылайте пароль посторонним.'}})
  .afterClosed().subscribe(ok=>{if(!ok)return;
   this.api.revealPassword(this.id).subscribe({next:r=>{
    this.dialog.open(PasswordViewDialog,{data:{password:r.password},width:'480px',maxWidth:'95vw'});
   },error:e=>this.feedback.error(e)});
  });
 }
}
import {MAT_DIALOG_DATA,MatDialogModule,MatDialogRef} from '@angular/material/dialog';
@Component({standalone:true,imports:[MatDialogModule,MatButtonModule],template:`
<h2 mat-dialog-title>Пароль абонента</h2><mat-dialog-content>
<p>Не записывайте пароль в открытые журналы и не пересылайте его в чат.</p><div class="password">{{data.password}}</div>
</mat-dialog-content><mat-dialog-actions align="end"><button mat-flat-button (click)="close()">Закрыть</button></mat-dialog-actions>
`,styles:[`.password{font-size:23px;font-weight:800;word-break:break-all;padding:20px;border-radius:14px;background:var(--muted-panel);color:var(--text);text-align:center}`]})
export class PasswordViewDialog {
 readonly data=inject<{password:string}>(MAT_DIALOG_DATA);private ref=inject(MatDialogRef<PasswordViewDialog>);
 close(){this.ref.close();}
}
