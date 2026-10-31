import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { map } from 'rxjs';
import { AuthService } from './core/auth.service';
import { LoginComponent } from './pages/login.component';
import { ShellComponent } from './layout/shell.component';
import { DashboardComponent } from './pages/dashboard.component';
import { ProvidersComponent } from './pages/providers.component';
import { StreamsComponent } from './pages/streams.component';
import { StreamDetailsComponent } from './pages/stream-details.component';
import { PlaylistsComponent } from './pages/playlists.component';
import { PlaylistDetailsComponent } from './pages/playlist-details.component';
import { GenresComponent } from './pages/genres.component';
import { AppTypesComponent } from './pages/app-types.component';
import { SubscribersComponent } from './pages/subscribers.component';
import { SubscriberDetailsComponent } from './pages/subscriber-details.component';
import { TerminalsComponent } from './pages/terminals.component';
import { TerminalDetailsComponent } from './pages/terminal-details.component';
import { EpgComponent } from './pages/epg.component';
import { MessagesComponent } from './pages/messages.component';
import { MessageDetailsComponent } from './pages/message-details.component';

const adminGuard:CanActivateFn=()=>{
  const auth=inject(AuthService),router=inject(Router);
  return auth.restore().pipe(map(ok=>ok?true:router.createUrlTree(['/login'])));
};
const loginGuard:CanActivateFn=()=>{
  const auth=inject(AuthService),router=inject(Router);
  return auth.restore().pipe(map(ok=>ok?router.createUrlTree(['/']):true));
};
export const routes:Routes=[
  {path:'login',component:LoginComponent,canActivate:[loginGuard]},
  {path:'',component:ShellComponent,canActivate:[adminGuard],children:[
    {path:'',component:DashboardComponent,title:'Обзор · IPTV Control'},
    {path:'providers',component:ProvidersComponent,title:'Провайдеры · IPTV Control'},
    {path:'streams',component:StreamsComponent,title:'Каналы · IPTV Control'},
    {path:'streams/:id',component:StreamDetailsComponent,title:'Источники · IPTV Control'},
    {path:'playlists',component:PlaylistsComponent,title:'Плейлисты · IPTV Control'},
    {path:'playlists/:id',component:PlaylistDetailsComponent,title:'Редактор плейлиста · IPTV Control'},
    {path:'abonents',component:SubscribersComponent,title:'Абоненты · IPTV Control'},
    {path:'abonents/:id',component:SubscriberDetailsComponent,title:'Карточка абонента · IPTV Control'},
    {path:'terminals',component:TerminalsComponent,title:'Терминалы · IPTV Control'},
    {path:'terminals/:id',component:TerminalDetailsComponent,title:'Карточка терминала · IPTV Control'},
    {path:'epg',component:EpgComponent,title:'EPG · IPTV Control'},
    {path:'messages',component:MessagesComponent,title:'Сообщения · IPTV Control'},
    {path:'messages/:id',component:MessageDetailsComponent,title:'Рассылка · IPTV Control'},
    {path:'genres',component:GenresComponent,title:'Жанры · IPTV Control'},
    {path:'app-types',component:AppTypesComponent,title:'Приложения · IPTV Control'},
  ]},
  {path:'**',redirectTo:''}
];
