import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { ProviderContext } from '../core/provider-context.service';

interface Nav {link:string;name:string;icon:string;permission?:string;section?:string}
@Component({selector:'app-shell',standalone:true,
  imports:[RouterOutlet,RouterLink,RouterLinkActive,MatSidenavModule,MatToolbarModule,MatButtonModule,MatIconModule,MatSelectModule,MatFormFieldModule,MatMenuModule,FormsModule],
  template:`
  <mat-sidenav-container class="shell">
    <mat-sidenav class="sidebar" [mode]="mobile()?'over':'side'" [opened]="!mobile() || navOpen()" (closedStart)="navOpen.set(false)">
      <div class="brand">
        <div class="brand-mark"><span class="material-symbols-outlined">live_tv</span></div>
        <div><div class="brand-name">IPTV Control</div><div class="brand-sub">МЕДИАПЛАТФОРМА</div></div>
      </div>
      <div class="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav class="nav-items">
        @for (n of primary;track n.link) {
          @if(!n.permission || canAny(n.permission)){
            <a [routerLink]="n.link" routerLinkActive="active" [routerLinkActiveOptions]="{exact:n.link==='/'}" (click)="closeMobile()">
              <span class="material-symbols-outlined">{{n.icon}}</span><span>{{n.name}}</span>
              @if(n.link==='/streams'){<span class="nav-indicator"></span>}
            </a>
          }
        }
      </nav>
      <div class="nav-caption second">КОНФИГУРАЦИЯ</div>
      <nav class="nav-items">
        @for (n of secondary;track n.link) {
          @if(!n.permission || canAny(n.permission)){
            <a [routerLink]="n.link" routerLinkActive="active" (click)="closeMobile()">
              <span class="material-symbols-outlined">{{n.icon}}</span><span>{{n.name}}</span>
            </a>
          }
        }
      </nav>
      <div class="sidebar-bottom">
        <div class="server-dot" [class.bad]="serverHealthy()===false" [class.unknown]="serverHealthy()===null"></div>
        <div><b>{{serverHealthy()===true?'API доступен':serverHealthy()===false?'API недоступен':'Проверка API…'}}</b><small>Backend · порт 4012</small></div>
      </div>
    </mat-sidenav>
    <mat-sidenav-content>
      <header class="topbar">
        <div class="top-left">
          <button mat-icon-button class="mobile-menu" aria-label="Меню" (click)="navOpen.set(!navOpen())"><span class="material-symbols-outlined">menu</span></button>
          <div class="breadcrumb">Панель управления <span class="crumb-chevron">/</span> <b>{{pageName()}}</b></div>
        </div>
        <div class="top-right">
          <div class="provider-select">
            <span class="material-symbols-outlined provider-icon">corporate_fare</span>
            <mat-select aria-label="Текущий провайдер" [value]="context.selectedId()===null?'all':context.selectedId()" (selectionChange)="changeProvider($event.value)">
              @if(context.canGlobal()) {<mat-option value="all">Все провайдеры</mat-option>}
              @for (p of context.providers();track p.id) {<mat-option [value]="p.id">{{p.name}}</mat-option>}
            </mat-select>
          </div>
          <button mat-icon-button class="theme-button" [attr.aria-label]="theme.dark()?'Светлая тема':'Тёмная тема'" (click)="theme.toggle()"><span class="material-symbols-outlined">{{theme.dark()?'light_mode':'dark_mode'}}</span></button>
          <button mat-button [matMenuTriggerFor]="account" class="account-btn">
            <span class="account-avatar">{{initials()}}</span><span class="account-name">{{auth.me()?.user?.display_name||'Администратор'}}</span>
            <span class="material-symbols-outlined arrow">expand_more</span>
          </button>
          <mat-menu #account="matMenu">
            <div class="menu-account"><b>{{auth.me()?.user?.display_name}}</b><small>{{auth.me()?.user?.username}}</small></div>
            <button mat-menu-item (click)="logout()"><span class="material-symbols-outlined">logout</span> Выйти</button>
          </mat-menu>
        </div>
      </header>
      <main><router-outlet /></main>
    </mat-sidenav-content>
  </mat-sidenav-container>
  `,
  styles:[`
    .shell{height:100vh;background:var(--page)}
    .sidebar{width:266px;background:var(--surface);border-right:1px solid var(--border);border-radius:0}
    .brand{display:flex;align-items:center;gap:11px;padding:33px 25px 35px}
    .brand-mark{height:44px;width:44px;display:grid;place-items:center;border-radius:14px;background:#236ef0;color:#fff;box-shadow:0 9px 22px rgba(35,110,240,.25)}
    .brand-mark span{font-size:26px}.brand-name{font-size:21px;font-weight:800;letter-spacing:-.06em;line-height:1.2}.brand-sub{font-size:9px;letter-spacing:.19em;font-weight:800;color:var(--muted);margin-top:5px}
    .nav-caption{font-size:10px;font-weight:800;letter-spacing:.17em;color:var(--muted);padding:0 25px 12px}
    .nav-caption.second{padding-top:27px}
    .nav-items{display:flex;flex-direction:column;gap:3px;padding:0 13px}
    .nav-items a{height:48px;display:flex;align-items:center;gap:15px;padding:0 13px;border-radius:12px;color:var(--muted);font-weight:750;font-size:15.5px;position:relative;transition:background .17s,color .17s}
    .nav-items a .material-symbols-outlined{font-size:22px}
    .nav-items a:hover{background:var(--muted-panel);color:var(--text)}
    .nav-items a.active{background:var(--accent-light);color:var(--accent)}
    .nav-indicator{margin-left:auto;width:6px;height:6px;border-radius:100%;background:var(--accent);opacity:.75}
    .sidebar-bottom{position:absolute;bottom:20px;left:18px;right:18px;display:flex;align-items:center;gap:12px;border:1px solid var(--border);background:var(--muted-panel);padding:14px;border-radius:14px}
    .server-dot{background:#36b586;box-shadow:0 0 0 4px rgba(54,181,134,.14);width:9px;height:9px;border-radius:50%;flex:none}
    .server-dot.bad{background:#ec5666;box-shadow:0 0 0 4px rgba(236,86,102,.14)}.server-dot.unknown{background:#abb9c9;box-shadow:none}
    .sidebar-bottom b{display:block;font-size:12px}.sidebar-bottom small{display:block;font-size:11px;color:var(--muted);margin-top:1px}
    mat-sidenav-content{background:var(--page);min-height:100vh}
    .topbar{height:80px;padding:0 37px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:18px}
    .top-left,.top-right{display:flex;align-items:center;gap:16px}
    .breadcrumb{font-size:14px;font-weight:650;color:var(--muted);white-space:nowrap}.breadcrumb b{color:var(--text)}.crumb-chevron{padding:0 13px;color:#b8c2d2}
    .provider-select{height:43px;min-width:205px;max-width:245px;display:flex;align-items:center;gap:9px;border:1px solid var(--border);border-radius:11px;padding:0 12px;background:var(--muted-panel)}
    .provider-select .provider-icon{font-size:21px;color:var(--accent)}
    .provider-select mat-select{font-size:14.5px;font-weight:750;color:var(--text)}
    .theme-button{color:var(--muted)}.account-btn{height:44px;border-radius:12px;padding:0 7px 0 3px}
    .account-avatar{display:grid;place-items:center;width:36px;height:36px;flex:none;border-radius:11px;background:#dceafb;color:#2367c6;font-weight:800;font-size:13px}
    .account-name{font-size:13px;font-weight:800;margin:0 4px 0 7px}.arrow{font-size:19px;color:var(--muted)}
    .menu-account{display:flex;flex-direction:column;gap:1px;padding:14px 18px;border-bottom:1px solid var(--border);min-width:200px}.menu-account small{color:var(--muted)}
    .mobile-menu{display:none}
    @media(max-width:1000px){.sidebar{width:268px}.account-name,.breadcrumb{display:none}.topbar{padding:0 18px}.mobile-menu{display:inline-flex}}
    @media(max-width:620px){.topbar{height:70px}.provider-select{min-width:132px;max-width:165px}.top-right{gap:5px}.account-btn .arrow{display:none}.account-btn{padding:0}.theme-button{display:none}}
  `]
})
export class ShellComponent implements OnInit {
  readonly auth=inject(AuthService);readonly theme=inject(ThemeService);readonly context=inject(ProviderContext);
  private router=inject(Router);
  readonly navOpen=signal(false);readonly serverHealthy=signal<boolean|null>(null);private http=inject(HttpClient);
  readonly mobile=signal(typeof window!=='undefined'&&window.innerWidth<1000);
  readonly primary:Nav[]=[{link:'/',name:'Обзор',icon:'dashboard'},{link:'/providers',name:'Провайдеры',icon:'apartment',permission:'providers.read'},
    {link:'/streams',name:'Каналы и потоки',icon:'live_tv',permission:'streams.read'},
    {link:'/playlists',name:'Плейлисты',icon:'playlist_play',permission:'playlists.read'},
    {link:'/abonents',name:'Абоненты',icon:'group',permission:'abonents.read'},
    {link:'/terminals',name:'Терминалы',icon:'devices',permission:'terminals.read'},
    {link:'/epg',name:'Телепрограмма EPG',icon:'event_note',permission:'epg.read'},
    {link:'/messages',name:'Сообщения',icon:'campaign',permission:'messages.read'}];
  readonly secondary:Nav[]=[{link:'/genres',name:'Жанры',icon:'category',permission:'genres.read'},
    {link:'/app-types',name:'Типы приложений',icon:'apps',permission:'streams.read'}];
  readonly pageName=signal('Обзор');
  constructor(){
    window.addEventListener('resize',()=>this.mobile.set(window.innerWidth<1000));
    this.router.events.subscribe(e=>{if(e instanceof NavigationEnd){this.pageName.set(this.displayName(e.urlAfterRedirects));this.navOpen.set(false);}});
    this.pageName.set(this.displayName(this.router.url));
  }
  ngOnInit(){
    this.context.load();
    this.http.get<{status:string}>('/api/v1/health').subscribe({
      next:r=>this.serverHealthy.set(r.status==='ok'),error:()=>this.serverHealthy.set(false)
    });
  }
  displayName(url:string){
    const path=url.split('?')[0];
    return path.startsWith('/streams/')?'Карточка канала':path.startsWith('/playlists/')?'Редактор плейлиста':
      path.startsWith('/messages/')?'Карточка сообщения':path.startsWith('/abonents/')?'Карточка абонента':path.startsWith('/terminals/')?'Карточка терминала':
      [...this.primary,...this.secondary].find(x=>x.link===path)?.name??'Обзор';
  }
  changeProvider(v:number|'all'){this.context.selectedId.set(v==='all'?null:v);}
  closeMobile(){if(this.mobile())this.navOpen.set(false);}
  canAny(permission:string){const scope=this.auth.me()?.permissions[permission];return !!scope&&(scope.global||scope.providers.length>0);}
  initials(){return (this.auth.me()?.user.display_name||'A').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();}
  logout(){this.auth.signout().subscribe(()=>this.router.navigateByUrl('/login'));}
}
