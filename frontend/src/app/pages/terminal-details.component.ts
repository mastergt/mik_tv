import {Component,inject,signal} from '@angular/core';
import {RouterLink,ActivatedRoute} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatTabsModule} from '@angular/material/tabs';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {SubscribersApi} from '../core/subscribers-api.service';
import {Feedback} from '../core/feedback.service';
import {ProviderContext} from '../core/provider-context.service';
import {AuthService} from '../core/auth.service';
import {PlaybackSession,Terminal,TerminalSession} from '../core/models';
import {TerminalDialog} from '../dialogs/terminal-dialog.component';
import {ConfirmDialog} from '../dialogs/confirm-dialog.component';
@Component({selector:'app-terminal-details',standalone:true,imports:[RouterLink,MatButtonModule,MatTabsModule,MatProgressBarModule],template:`
<div class="page">
 <a routerLink="/terminals" class="backlink"><span class="material-symbols-outlined">arrow_back</span> Все терминалы</a>
 @if(terminal();as t){
 <div class="page-head"><div><div class="eyebrow">ТЕРМИНАЛ · ID {{t.id}}</div><h1 class="page-title">{{t.device_name||t.model||'Устройство '+t.id}}</h1>
  <p class="page-desc">{{t.platform||'Платформа неизвестна'}} · {{t.manufacturer||'Производитель не указан'}} · {{t.app_version||'Версия приложения не указана'}}</p></div>
  @if(canWrite()){<button mat-flat-button class="primary-btn" (click)="edit()">Изменить терминал</button>}</div>
 <div class="facts">
  <div class="surface fact"><span>Состояние</span><strong [class.positive]="t.enabled">{{t.enabled?'Включён':'Отключён'}}</strong></div>
  <div class="surface fact"><span>Абонент</span>@if(t.abonent_id){<a [routerLink]="['/abonents',t.abonent_id]">{{t.abonent_username||'#'+t.abonent_id}}</a>}@else{<strong>Гость</strong>}</div>
  <div class="surface fact"><span>WAN IP</span><strong>{{t.wan_addr||'—'}}</strong></div>
  <div class="surface fact"><span>Последний контакт</span><strong>{{format(t.last_activity)}}</strong></div>
 </div>
 <mat-tab-group animationDuration="180ms">
 <mat-tab label="Информация"><section class="surface panel tabpanel"><h2>Параметры устройства</h2>
  <div class="info-grid"><div><small>UUID</small><b class="mono">{{t.device_uuid}}</b></div>
   <div><small>Локальный IP</small><b>{{t.lan_addr||'—'}}</b></div>
   <div><small>Публичный IP</small><b>{{t.wan_addr||'—'}}</b></div>
   <div><small>MAC-адрес</small><b>{{t.mac_addr||'Не передан'}}</b></div>
   <div><small>Производитель / модель</small><b>{{t.manufacturer||'—'}} / {{t.model||'—'}}</b></div>
   <div><small>Android / ОС</small><b>{{t.os_version||'—'}}</b></div>
   <div><small>Первый визит</small><b>{{format(t.registration_time)}}</b></div>
   <div><small>Провайдер</small><b>{{t.provider_name||'—'}}</b></div></div>
  <div class="ua"><small>User-Agent</small><p>{{t.useragent||'Не передан клиентом'}}</p></div>
 </section></mat-tab>
 <mat-tab label="Авторизации ({{sessions().length}})"><section class="surface panel tabpanel"><h2>Последние подключения</h2>
  @for(s of sessions();track s.id){<div class="list-item"><span class="material-symbols-outlined accent">login</span>
    <div class="grow"><b>{{s.auth_type}} · {{s.ip||'IP неизвестен'}}</b>
     <div class="subtext">{{format(s.started_at)}} · последний контакт {{format(s.last_seen_at)}}</div></div>
    <span class="pill" [class.success]="!s.ended_at&&!s.revoked_at">{{s.revoked_at?'Отозвана':s.ended_at?'Закрыта':'Активна'}}</span>
    @if(canWrite()&&!s.ended_at&&!s.revoked_at){<button mat-button (click)="revoke(s)">Завершить</button>}</div>}
  @empty{<div class="empty"><strong>Истории авторизаций пока нет</strong><span>Она будет заполняться клиентскими приложениями</span></div>}
 </section></mat-tab>
 @if(canViewPlayback()){<mat-tab label="Просмотры"><section class="surface panel tabpanel"><h2>Последние просмотры</h2>
  @for(p of playback();track p.id){<div class="list-item"><span class="material-symbols-outlined accent">live_tv</span>
   <div class="grow"><b>{{p.stream_name}}</b><div class="subtext">{{format(p.started_at)}} — {{format(p.ended_at)}} · {{p.status}}</div></div>
   @if(p.error_code){<span class="pill danger">{{p.error_code}}</span>}</div>}
  @empty{<div class="empty"><strong>История просмотров отсутствует</strong><span>У провайдера она может быть выключена для снижения нагрузки</span></div>}
 </section></mat-tab>}
 </mat-tab-group>
 }@else{<mat-progress-bar mode="indeterminate"/>}
</div>`,styles:[`
 .backlink{display:inline-flex;align-items:center;gap:7px;color:var(--accent);font-weight:800;margin-bottom:23px}
 .facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:28px}
 .fact{padding:23px;display:flex;flex-direction:column;gap:9px}.fact span{font-size:13px;color:var(--muted)}
 .fact strong,.fact a{font-size:18px;font-weight:800;word-break:break-word}.fact .positive{color:var(--success)}.fact a{color:var(--accent)}
 .tabpanel{margin-top:20px;min-height:260px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}
 .info-grid>div{display:flex;flex-direction:column;gap:6px}.info-grid small,.ua small{font-size:13px;color:var(--muted)}
 .info-grid b{font-size:16px;word-break:break-word}.mono{font-family:monospace}.ua{margin-top:29px;border-top:1px solid var(--border);padding-top:20px}.ua p{word-break:break-all;line-height:1.8}
 @media(max-width:1080px){.facts{grid-template-columns:1fr 1fr}}@media(max-width:650px){.facts,.info-grid{grid-template-columns:1fr}}
 `]})
export class TerminalDetailsComponent {
 private id=inject(ActivatedRoute).snapshot.paramMap.get('id')!;
 private api=inject(SubscribersApi);private feedback=inject(Feedback);private dialog=inject(MatDialog);
 readonly auth=inject(AuthService);readonly context=inject(ProviderContext);
 readonly terminal=signal<Terminal|null>(null);readonly sessions=signal<TerminalSession[]>([]);readonly playback=signal<PlaybackSession[]>([]);
 constructor(){this.reload();}
 canWrite(){const t=this.terminal();return !!t&&this.auth.can('terminals.write',t.provider_id);}
 canViewPlayback(){const t=this.terminal();return !!t&&this.auth.can('playback.read',t.provider_id);}
 format(s:string|null){return s?new Date(s).toLocaleString('ru-RU'):'—';}
 reload(){this.api.terminal(this.id).subscribe({next:t=>{
   this.terminal.set(t);this.api.sessions(this.id).subscribe({next:r=>this.sessions.set(r),error:e=>this.feedback.error(e)});
   if(this.canViewPlayback())this.api.playback(this.id).subscribe({next:r=>this.playback.set(r),error:e=>this.feedback.error(e)});
  },error:e=>this.feedback.error(e)});}
 edit(){const t=this.terminal();if(!t)return;
  this.dialog.open(TerminalDialog,{data:{terminal:t,providers:this.context.providers().filter(p=>this.auth.can('terminals.write',p.id)),
    globalWrite:this.auth.can('terminals.write')},width:'740px',maxWidth:'95vw'}).afterClosed().subscribe(v=>{if(v)this.reload();});
 }
 revoke(s:TerminalSession){this.dialog.open(ConfirmDialog,{data:{title:'Завершить сессию?',text:'Авторизация устройства будет отозвана.'}})
  .afterClosed().subscribe(ok=>{if(!ok)return;this.api.revokeSession(this.id,s.id).subscribe({next:()=>{this.feedback.ok('Сессия отозвана');this.reload();},error:e=>this.feedback.error(e)});});
 }
}
