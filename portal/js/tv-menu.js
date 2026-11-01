/* mik_tv v0.8.6: remote-friendly home menu and channel genres (ES5 only). */
(function(root){
  'use strict';
  var U=root.PortalUtil;
  function TVMenu(app){
    this.app=app;this.view='home';this.opened=false;this.selected=0;this.windowStart=0;this.entries=[];
  }
  TVMenu.prototype.homeEntries=function(){
    return [
      {id:'channels',title:'Телеканалы',detail:'Все доступные каналы'},
      {id:'continue',title:'Продолжить просмотр',detail:'Последний выбранный телеканал'},
      {id:'search',title:'Поиск',detail:'По названию, номеру и жанру'},
      {id:'genres',title:'Категории',detail:'Жанры из загруженного каталога'},
      {id:'favorites',title:'Избранное',detail:'Сохранённые каналы'},
      {id:'epg',title:'Телепрограмма',detail:'Программа текущего канала'},
      {id:'theme',title:'Оформление',detail:'Modern / Classic'},
      {id:'account',title:this.app.authenticated?'Выйти из аккаунта':'Войти как абонент',detail:'Управление доступом'},
      {id:'diagnostics',title:'Диагностика',detail:'Сведения об устройстве'}
    ];
  };
  TVMenu.prototype.genreEntries=function(){
    var groups={},i,j,g,stream,genres,entry,keys=[],rows=[{id:'all',title:'Все категории',detail:'Показать полный список'}];
    for(i=0;i<this.app.items.length;i++){
      stream=this.app.items[i];genres=stream.genres||[];
      for(j=0;j<genres.length;j++){
        g=genres[j];if(!g || g.id===null || g.id===undefined)continue;
        var key=String(g.id);
        if(!groups[key]){groups[key]={id:'genre:'+key,genreId:key,title:String(g.name||'Без названия'),count:0};keys.push(key);}
        groups[key].count++;
      }
    }
    keys.sort(function(a,b){var x=groups[a].title.toLowerCase(),y=groups[b].title.toLowerCase();return x<y?-1:x>y?1:0;});
    for(i=0;i<keys.length;i++){entry=groups[keys[i]];entry.detail=entry.count+' каналов (загружено)';rows.push(entry);}
    if(this.app.hasMore)rows.push({id:'more',title:'Загрузить ещё категории',detail:'Догрузить следующую страницу каналов'});
    return rows;
  };
  TVMenu.prototype.open=function(view){
    this.view=view==='genres'?'genres':'home';this.opened=true;this.selected=0;this.windowStart=0;
    U.show('tv-home-menu',true);this.refresh();
  };
  TVMenu.prototype.close=function(){this.opened=false;U.show('tv-home-menu',false);};
  TVMenu.prototype.refresh=function(){
    if(!this.opened)return;
    this.entries=this.view==='genres'?this.genreEntries():this.homeEntries();
    if(this.selected>=this.entries.length)this.selected=Math.max(0,this.entries.length-1);
    var start=Math.max(0,Math.min(this.selected-4,Math.max(0,this.entries.length-11)));
    this.windowStart=start;
    var list=U.el('tv-menu-list'),i,entry,row,title,detail;U.clear(list);
    for(i=start;i<Math.min(start+11,this.entries.length);i++){
      entry=this.entries[i];row=U.create('div','tv-menu-row'+(i===this.selected?' selected':''));
      row.setAttribute('data-menu-index',String(i));
      title=U.create('span','tv-menu-row-title',entry.title);row.appendChild(title);
      detail=U.create('span','tv-menu-row-detail',entry.detail||'');row.appendChild(detail);list.appendChild(row);
    }
    U.text(U.el('tv-menu-title'),this.view==='genres'?'КАТЕГОРИИ ТЕЛЕКАНАЛОВ':'ГЛАВНОЕ МЕНЮ');
    U.text(U.el('tv-menu-page'),this.entries.length?(this.selected+1)+' / '+this.entries.length:'');
    U.text(U.el('tv-menu-notice'),this.view==='genres'?'Категории строятся по загруженным каналам':'▲▼ — выбор · OK — открыть · BACK — закрыть');
  };
  TVMenu.prototype.move=function(delta){
    if(!this.opened || !this.entries.length)return;
    this.selected=Math.max(0,Math.min(this.entries.length-1,this.selected+delta));this.refresh();
  };
  TVMenu.prototype.activate=function(index){
    if(index!==undefined && !isNaN(index) && index>=0 && index<this.entries.length)this.selected=index;
    var entry=this.entries[this.selected],app=this.app;if(!entry)return;
    if(entry.id==='genres'){this.open('genres');return;}
    if(entry.id==='more'){
      if(!app.loading && app.hasMore)app.loadChannels();
      else app.toast('Загрузка каналов уже выполняется');
      return;
    }
    if(entry.id==='all'){app.setChannelMode('all');this.close();return;}
    if(entry.genreId){app.setChannelMode('genre',entry.genreId,entry.title);this.close();return;}
    this.close();
    if(entry.id==='channels')app.setChannelMode('all');
    else if(entry.id==='favorites')app.setChannelMode('favorites');
    else if(entry.id==='search')app.openSearch();
    else if(entry.id==='continue')app.resumeLast();
    else if(entry.id==='epg'){if(app.current)app.showEPG(true);else app.toast('Сначала выберите канал');}
    else if(entry.id==='theme')app.setTheme(U.el('app').className.indexOf('theme-modern')>=0?'classic':'modern');
    else if(entry.id==='account'){if(app.authenticated)app.logout();else app.openLogin();}
    else if(entry.id==='diagnostics' && root.PortalDiagnostics)root.PortalDiagnostics.toggle();
  };
  TVMenu.prototype.back=function(){if(this.view==='genres')this.open('home');else this.close();};
  TVMenu.prototype.keyDown=function(code){
    if(!this.opened)return false;
    if(code===38){this.move(-1);return true;}
    if(code===40){this.move(1);return true;}
    if(code===33){this.move(-7);return true;}
    if(code===34){this.move(7);return true;}
    if(code===13){this.activate();return true;}
    if(code===27||code===8||code===461||code===10009){this.back();return true;}
    return true; // Do not send channel keys to player behind the menu.
  };
  TVMenu.prototype.attach=function(){
    var self=this;
    U.on(U.el('tv-menu-list'),'click',function(ev){
      var n=ev.target||ev.srcElement,container=U.el('tv-menu-list');
      while(n && n!==container && (!n.getAttribute||n.getAttribute('data-menu-index')===null))n=n.parentNode;
      if(n && n!==container)self.activate(Number(n.getAttribute('data-menu-index')));
    });
    U.on(U.el('tv-menu-close'),'click',function(){self.back();});
  };
  root.PortalTVMenu=TVMenu;
}(window));
