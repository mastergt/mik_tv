import { Component, inject, signal, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin } from 'rxjs';
import { CatalogApi } from '../core/catalog-api.service';
import { ProviderContext } from '../core/provider-context.service';
import { AuthService } from '../core/auth.service';
import { Stream, Playlist } from '../core/models';

@Component({selector:'app-dashboard',standalone:true,imports:[RouterLink,MatButtonModule],template:`
<div class="page">
  <div class="page-head">
    <div><div class="eyebrow">РАБОЧАЯ ПАНЕЛЬ</div><h1 class="page-title">Добрый день! 👋</h1><p class="page-desc">Всё, что происходит с вашей медиаплатформой, — в одном месте.</p></div>
    <a routerLink="/streams" mat-flat-button class="primary-btn"><span class="material-symbols-outlined" style="font-size:20px;margin-right:9px">add_circle</span> Новый канал</a>
  </div>
  <div class="welcome-banner">
    <div class="welcome-content"><div class="banner-kicker"><span class="material-symbols-outlined">bolt</span> IPTV CONTROL CENTER</div>
      <h2>Ваш контент под контролем</h2><p>Управляйте вещанием, собирайте плейлисты и настраивайте доступ провайдеров без лишних сложностей.</p>
      <a routerLink="/playlists" class="banner-link">Открыть плейлисты <span class="material-symbols-outlined">arrow_forward</span></a>
    </div>
    <div class="banner-deco"><div class="deco-screen"><span class="material-symbols-outlined">play_arrow</span></div><div class="deco-orbit"></div></div>
  </div>
  <div class="metrics">
    <div class="metric surface"><div class="metric-top"><span>Каналы и потоки</span><div class="metric-icon blue"><span class="material-symbols-outlined">live_tv</span></div></div>
      <div class="metric-val">{{stats().streams}}</div><div class="metric-bottom">В текущей области доступа</div></div>
    <div class="metric surface"><div class="metric-top"><span>Плейлисты</span><div class="metric-icon violet"><span class="material-symbols-outlined">playlist_play</span></div></div>
      <div class="metric-val">{{stats().playlists}}</div><div class="metric-bottom">Настроенных подборок</div></div>
    <div class="metric surface"><div class="metric-top"><span>Активные каналы</span><div class="metric-icon green"><span class="material-symbols-outlined">check_circle</span></div></div>
      <div class="metric-val">{{stats().active}}</div><div class="metric-bottom">Сейчас включены</div></div>
    <div class="metric surface"><div class="metric-top"><span>Провайдеры</span><div class="metric-icon amber"><span class="material-symbols-outlined">corporate_fare</span></div></div>
      <div class="metric-val">{{context.providers().length}}</div><div class="metric-bottom">В вашей области доступа</div></div>
  </div>
  <div class="dashboard-grid">
    <div class="surface panel">
      <div class="card-head"><div><h3>Последние каналы</h3><p>Быстрый доступ к каталогу потоков</p></div><a routerLink="/streams" class="link">Все каналы <span class="material-symbols-outlined">arrow_forward</span></a></div>
      @for(s of recent();track s.id){
        <a class="recent-row" [routerLink]="['/streams',s.id]"><div class="recent-icon"><span class="material-symbols-outlined">{{s.is_radio?'radio':'tv'}}</span></div>
          <div class="recent-name"><b>{{s.name}}</b><small>Канал №{{s.number}} · {{s.app_type||'ТВ'}}</small></div>
          <span class="pill" [class.success]="s.enabled" [class.danger]="!s.enabled"><span class="pill-dot"></span>{{s.enabled?'Активен':'Выключен'}}</span>
          <span class="material-symbols-outlined recent-arrow">chevron_right</span></a>
      } @empty {<div class="empty compact"><span class="material-symbols-outlined">tv_off</span><strong>Каналов пока нет</strong><span>Добавьте первый канал в каталог</span></div>}
    </div>
    <div class="surface panel quick-panel"><div class="card-head"><div><h3>Быстрые действия</h3><p>Частые операции с каталогом</p></div></div>
      <a routerLink="/streams" class="quick-action"><div class="quick-icon blue"><span class="material-symbols-outlined">add_to_queue</span></div><div><b>Добавить канал</b><small>Новый LIVE или DVR-поток</small></div><span class="material-symbols-outlined">arrow_forward</span></a>
      <a routerLink="/playlists" class="quick-action"><div class="quick-icon violet"><span class="material-symbols-outlined">playlist_add</span></div><div><b>Собрать плейлист</b><small>Создание подборки каналов</small></div><span class="material-symbols-outlined">arrow_forward</span></a>
      <a routerLink="/providers" class="quick-action"><div class="quick-icon green"><span class="material-symbols-outlined">domain_add</span></div><div><b>Управление провайдерами</b><small>Доступы, лимиты, настройки</small></div><span class="material-symbols-outlined">arrow_forward</span></a>
      <div class="dashboard-note"><span class="material-symbols-outlined">info</span><span>Показатели отражают до 200 записей на раздел. Точная сводная аналитика появится с API статистики.</span></div>
    </div>
  </div>
</div>
`,styles:[`
  .welcome-banner{position:relative;overflow:hidden;border-radius:22px;background:linear-gradient(115deg,#18449b,#2b6ce2 75%,#4c88ef);color:white;min-height:215px;margin-bottom:25px;display:flex;padding:32px 42px}
  .welcome-content{position:relative;z-index:2;max-width:590px}.banner-kicker{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.12em;font-weight:800;color:#bbd4ff}.banner-kicker span{font-size:17px}
  .welcome-banner h2{font-size:27px;letter-spacing:-.05em;line-height:1.3;margin:11px 0 10px;font-weight:800}.welcome-banner p{font-size:14.5px;line-height:1.7;color:#d7e5ff;max-width:560px;margin:0}
  .banner-link{display:inline-flex;gap:8px;align-items:center;font-size:13px;font-weight:800;margin-top:18px}.banner-link span{font-size:20px}
  .banner-deco{position:absolute;right:8%;top:-16px;width:300px;height:290px;display:grid;place-items:center}.deco-screen{height:144px;width:208px;border:12px solid rgba(255,255,255,.18);border-radius:28px;display:grid;place-items:center;transform:rotate(-11deg);background:rgba(255,255,255,.1)}.deco-screen span{font-size:70px;color:#aaccff}.deco-orbit{position:absolute;width:315px;height:315px;border-radius:50%;border:1px solid rgba(255,255,255,.2)}
  .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-bottom:24px}.metric{padding:22px 23px}.metric-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;font-size:13px;color:var(--muted);font-weight:750}.metric-icon{display:grid;place-items:center;height:43px;width:43px;border-radius:13px}.metric-icon.blue,.quick-icon.blue{background:#e9f1ff;color:#357ef5}.metric-icon.violet,.quick-icon.violet{background:#f0eaff;color:#9360dc}.metric-icon.green,.quick-icon.green{background:#e5f6ee;color:#29a676}.metric-icon.amber{background:#fff4e5;color:#e2a23e}
  .metric-val{font-family:'DM Sans',sans-serif;font-size:38px;letter-spacing:-.06em;font-weight:800;margin-top:14px;line-height:1.1}.metric-bottom{color:var(--muted);font-size:12px;margin-top:7px}
  .dashboard-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:22px}.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px}.card-head h3{font-weight:800;font-size:18px;letter-spacing:-.03em;margin:0 0 4px}.card-head p{color:var(--muted);font-size:13px;margin:0}.link{display:flex;align-items:center;gap:3px;font-weight:800;color:var(--accent);font-size:12px;white-space:nowrap}.link span{font-size:19px}
  .recent-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--border)}.recent-icon{width:42px;height:42px;border-radius:12px;background:var(--accent-light);color:var(--accent);display:grid;place-items:center}.recent-name{flex:1;min-width:0}.recent-name b,.recent-name small{display:block}.recent-name b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.recent-name small{font-size:12px;color:var(--muted);margin-top:2px}.recent-arrow{color:var(--muted);font-size:18px}.empty.compact{padding:28px 0}
  .quick-action{display:flex;align-items:center;gap:14px;padding:12px 0;border-top:1px solid var(--border)}.quick-icon{width:45px;height:45px;display:grid;place-items:center;border-radius:12px}.quick-action div:nth-child(2){flex:1}.quick-action b,.quick-action small{display:block}.quick-action b{font-size:14px}.quick-action small{font-size:12px;margin-top:3px;color:var(--muted)}.quick-action>.material-symbols-outlined{color:var(--muted);font-size:20px}.dashboard-note{display:flex;gap:9px;padding:13px 14px;margin-top:18px;background:var(--muted-panel);border-radius:12px;color:var(--muted);font-size:11.5px;line-height:1.6}.dashboard-note .material-symbols-outlined{font-size:19px;flex:none}
  @media(max-width:1250px){.metrics{grid-template-columns:repeat(2,1fr)}.dashboard-grid{grid-template-columns:1fr}.banner-deco{right:-3%}}
  @media(max-width:650px){.metrics{gap:10px}.metric{padding:17px}.metric-val{font-size:31px}.banner-deco{display:none}.welcome-banner{padding:27px 22px}.welcome-banner h2{font-size:23px}}
`]
})
export class DashboardComponent {
  private api=inject(CatalogApi);readonly context=inject(ProviderContext);private auth=inject(AuthService);
  readonly recent=signal<Stream[]>([]);
  readonly stats=signal({streams:'—',playlists:'—',active:'—'});
  constructor(){effect(()=>{const pid=this.context.selectedId();this.load(pid);});}
  private load(providerId:number|null){
    const jobs:any={};
    if(this.auth.can('streams.read',providerId))jobs.streams=this.api.streams({providerId:providerId??undefined,limit:200});
    if(this.auth.can('playlists.read',providerId))jobs.playlists=this.api.playlists({providerId:providerId??undefined,limit:200});
    if(!Object.keys(jobs).length)return;
    forkJoin(jobs).subscribe({next:(r:any)=>{
      const streams:Stream[]=r.streams??[];const lists:Playlist[]=r.playlists??[];
      this.recent.set(streams.slice(0,5));this.stats.set({streams:r.streams?String(streams.length):'—',playlists:r.playlists?String(lists.length):'—',active:r.streams?String(streams.filter(s=>s.enabled).length):'—'});
    }});
  }
}
