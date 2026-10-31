(function (root) {
  'use strict';
  var U=root.PortalUtil, cfg=root.IPTV_CONFIG;
  function App(){
    root.PortalPlatform.current=root.PortalPlatform.detect();
    this.api=new root.PortalAPI();this.player=new root.PortalPlayer(U.el('video'));
    if(root.PortalPlatform.current.engine==='mag250')document.body.className+=' platform-mag250';
    this.bootstrap=null;this.provider='';this.authenticated=false;
    this.items=[];this.offset=0;this.hasMore=false;this.loading=false;
    this.selected=0;this.current=null;this.epg=[];this.epgSelected=0;this.favorites=[];
    this.onlyFavorites=false;this.panelOpen=true;this.epgOpen=false;
    this.lease=null;this.playGen=0;this.clockTimer=null;this.toastTimer=null;
    this.numBuffer='';this.numTimer=null;this.msgQueue=[];this.activeMessage=null;
    this.busy=false;this.epgRequest=0;
  }
  App.prototype.toast=function(message){U.text(U.el('toast'),message);U.show('toast',true);if(this.toastTimer)clearTimeout(this.toastTimer);this.toastTimer=setTimeout(function(){U.show('toast',false);},4000);};
  App.prototype.loadingState=function(active,text){this.busy=active;U.text(U.el('busy'),text||'Подключение...');U.show('busy',active);};
  App.prototype.setError=function(id,message){U.text(U.el(id),message);U.show(id,!!message);};
  App.prototype.setTheme=function(value){value=value==='classic'?'classic':'modern';U.el('app').className='theme-'+value;U.store.set('theme',value);};
  App.prototype.bind=function(){
    var self=this;
    U.on(U.el('connect-button'),'click',function(){self.chooseProvider();});
    U.on(U.el('login-form'),'submit',function(e){if(e.preventDefault)e.preventDefault();self.login();return false;});
    U.on(U.el('login-cancel'),'click',function(){self.closeLogin();});
    U.on(U.el('account-button'),'click',function(){if(self.authenticated)self.logout();else self.openLogin();});
    U.on(U.el('theme-button'),'click',function(){self.setTheme(U.el('app').className==='theme-modern'?'classic':'modern');});
    U.on(U.el('video-screen'),'click',function(){self.player.tryPlay();});
    U.on(U.el('tab-all'),'click',function(){self.onlyFavorites=false;self.renderChannels();});
    U.on(U.el('tab-fav'),'click',function(){self.onlyFavorites=true;self.renderChannels();});
    U.on(U.el('btn-more'),'click',function(){self.loadChannels();});
    U.on(U.el('message-close'),'click',function(){self.dismissMessage();});
    U.on(U.el('channel-list'),'click',function(e){var n=e.target||e.srcElement;while(n && n!==U.el('channel-list') && !n.getAttribute('data-idx'))n=n.parentNode;
      if(n&&n.getAttribute&&n.getAttribute('data-idx')){self.selected=Number(n.getAttribute('data-idx'));self.tuneSelected();}});
    U.on(U.el('epg-list'),'click',function(e){var n=e.target||e.srcElement;while(n&&n!==U.el('epg-list')&&n.getAttribute('data-epg')===null)n=n.parentNode;
      if(n&&n.getAttribute&&n.getAttribute('data-epg')!==null){self.epgSelected=Number(n.getAttribute('data-epg'));self.openSelectedArchive();}});
    U.on(document,'keydown',function(e){self.keyDown(e||root.event);});
    U.on(root,'beforeunload',function(){self.stopLease();});
  };
  App.prototype.start=function(){
    var self=this;this.bind();this.setTheme(U.store.get('theme')||cfg.THEME);
    if(root.PortalDiagnostics){root.PortalDiagnostics.init();root.PortalDiagnostics.log('INFO','Portal v0.8.1, player='+this.player.engine);}
    this.clock();this.clockTimer=setInterval(function(){self.clock();},30000);
    this.loadingState(true,'Загрузка конфигурации...');
    this.api.get('/client/bootstrap',function(err,data){
      self.loadingState(false);
      if(err){self.toast('Не удалось подключиться к IPTV API: '+U.errorText(err));self.showSetup('Сервер недоступен. Проверьте настройки сети.');return;}
      self.bootstrap=data;
      var chosen=U.param('provider')||cfg.DEFAULT_PROVIDER||U.store.get('provider')||'';
      var providers=data.providers||[],i,valid=false;
      for(i=0;i<providers.length;i++)if(providers[i].slug===chosen)valid=true;
      if(!valid && providers.length===1){chosen=providers[0].slug;valid=true;}
      if(valid){self.provider=chosen;self.connect();}else self.showSetup(providers.length?'Выберите провайдера':'В системе нет активных провайдеров');
    });
  };
  App.prototype.showSetup=function(description){
    var list=U.el('provider-select'),arr=this.bootstrap&&this.bootstrap.providers||[],i,opt;
    U.clear(list);for(i=0;i<arr.length;i++){opt=U.create('option','',arr[i].name);opt.value=arr[i].slug;list.appendChild(opt);}
    U.text(U.el('setup-description'),description||'Выберите провайдера');U.show('setup-overlay',true);
  };
  App.prototype.chooseProvider=function(){var slug=U.el('provider-select').value;if(!slug){this.setError('setup-error','Нет доступных провайдеров');return;}
    this.provider=slug;this.connect();};
  App.prototype.connect=function(){
    var self=this,slug=this.provider,cacheKey='client-token:'+slug,saved=U.store.get(cacheKey);
    U.store.set('provider',slug);
    this.updateProviderName();U.show('setup-overlay',false);this.loadingState(true,'Регистрация терминала...');
    if(saved){this.api.token=saved;this.api.get('/client/me',function(err,data){
      if(!err){self.authenticated=!!data.authenticated;self.connected();}
      else {self.api.token='';U.store.remove(cacheKey);self.register();}
    });}else this.register();
  };
  App.prototype.updateProviderName=function(){var list=this.bootstrap&&this.bootstrap.providers||[],i;for(i=0;i<list.length;i++)if(list[i].slug===this.provider){U.text(U.el('provider-name'),list[i].name);return;}};
  App.prototype.register=function(){
    var self=this, slug=this.provider, uuidKey='uuid:'+slug,secretKey='secret:'+slug;
    var uuid=U.store.get(uuidKey);
    if(!uuid){uuid=U.uuid();U.store.set(uuidKey,uuid);}
    var secret=U.store.get(secretKey),data={device_uuid:uuid,provider_slug:slug,platform:'portal',device_name:'IPTV Portal',app_version:'0.8.0'};
    if(secret)data.device_secret=secret;
    this.api.token='';
    this.api.post('/client/register',data,function(err,reply){
      if(err){self.loadingState(false);self.showSetup('Не удалось зарегистрировать терминал');self.setError('setup-error',U.errorText(err)+' (проверьте UUID/секрет устройства)');return;}
      if(reply.device_secret)U.store.set(secretKey,reply.device_secret);
      self.api.token=reply.client_token||'';U.store.set('client-token:'+slug,self.api.token);
      self.authenticated=false;self.connected();
    });
  };
  App.prototype.connected=function(){
    var self=this;this.loadingState(false);this.updateAccountButton();
    this.items=[];this.offset=0;this.hasMore=false;this.onlyFavorites=false;
    this.loadFavorites();this.loadChannels();
    if(cfg.SHOW_LOGIN_ON_START&&!this.authenticated)this.openLogin();
    if(!this._intervals){this._intervals=true;
      setInterval(function(){if(self.api.token)self.api.post('/client/heartbeat',{},function(){});},cfg.SESSION_HEARTBEAT_MS);
      setInterval(function(){self.heartbeatLease();},60000);
      setInterval(function(){self.checkMessages();},cfg.MESSAGES_POLL_MS);
    }
    this.checkMessages();
  };
  App.prototype.updateAccountButton=function(){U.text(U.el('account-button'),this.authenticated?'Выйти':'Войти');};
  App.prototype.loadChannels=function(){
    if(this.loading || !this.api.token || (this.offset>0 && !this.hasMore))return;
    var self=this,limit=Math.min(500,Math.max(10,Number(cfg.PAGE_SIZE)||150));this.loading=true;
    if(!this.items.length)U.text(U.el('channel-count'),'Загрузка каналов...');
    this.api.get('/client/streams?app_type=tv&limit='+limit+'&offset='+this.offset,function(err,data){
      self.loading=false;
      if(err){self.toast('Каталог: '+U.errorText(err));U.text(U.el('channel-count'),'Ошибка загрузки');return;}
      var rows=data.items||[],i;for(i=0;i<rows.length;i++)self.items.push(rows[i]);
      self.offset+=rows.length;self.hasMore=!!data.has_more;self.renderChannels();
      if(!self.current && self.items.length){
        var remembered=U.store.get('last-stream:'+self.provider),ix=-1;
        for(i=0;i<self.items.length;i++)if(self.items[i].id===remembered)ix=i;
        self.selected=ix>=0?ix:0;
        self.renderChannels();
      }
    });
  };
  App.prototype.loadFavorites=function(){var self=this;this.api.get('/client/favorites',function(err,data){
    if(err)return;self.favorites=[];var a=data||[],i;for(i=0;i<a.length;i++)self.favorites.push(String(a[i].stream_id));self.renderChannels();
  });};
  App.prototype.isFavorite=function(id){var i;for(i=0;i<this.favorites.length;i++)if(this.favorites[i]===String(id))return true;return false;};
  App.prototype.visibleIndices=function(){var a=[],i;for(i=0;i<this.items.length;i++)if(!this.onlyFavorites||this.isFavorite(this.items[i].id))a.push(i);return a;};
  App.prototype.renderChannels=function(){
    var list=U.el('channel-list'),vis=this.visibleIndices(),i,idx,s,row,num,logo,title,mark,src,self=this;
    U.clear(list);
    if(!vis.length){list.appendChild(U.create('div','empty-list',this.onlyFavorites?'Нет избранных каналов':'Нет доступных телеканалов. При необходимости войдите под абонентом.'));}
    for(i=0;i<vis.length;i++){
      idx=vis[i];s=this.items[idx];row=U.create('div','channel-row'+(idx===this.selected?' selected':'')+(this.current&&String(this.current.id)===String(s.id)?' playing':''));
      row.setAttribute('data-idx',String(idx));
      num=U.create('span','row-number',s.number||idx+1);row.appendChild(num);
      logo=U.create('span','row-logo');src=U.safeURL(s.logo_url);if(src){var img=U.create('img');img.src=src;img.alt='';logo.appendChild(img);}else logo.appendChild(U.create('span','logo-placeholder','▣'));row.appendChild(logo);
      title=U.create('span','row-name',s.name);row.appendChild(title);
      if(this.isFavorite(s.id)){mark=U.create('span','favorite-mark','★');row.appendChild(mark);}
      list.appendChild(row);
    }
    U.text(U.el('channel-count'),this.items.length+' каналов'+(this.hasMore?' · список неполный':''));
    U.show('btn-more',this.hasMore && !this.onlyFavorites);
    U.el('tab-all').className='tab'+(!this.onlyFavorites?' active':'');
    U.el('tab-fav').className='tab'+(this.onlyFavorites?' active':'');
    if(this.panelOpen)this.ensureSelected();
  };
  App.prototype.ensureSelected=function(){var list=U.el('channel-list'),node=list.querySelector ? list.querySelector('[data-idx="'+this.selected+'"]'):null;
    if(node){var top=node.offsetTop,bot=top+node.offsetHeight;if(top<list.scrollTop)list.scrollTop=top;else if(bot>list.scrollTop+list.clientHeight)list.scrollTop=bot-list.clientHeight;}
  };
  App.prototype.markSelected=function(oldIdx,newIdx,listId,attribute){
    var list=U.el(listId),oldEl=list.querySelector ? list.querySelector('['+attribute+'="'+oldIdx+'"]') : null;
    var newEl=list.querySelector ? list.querySelector('['+attribute+'="'+newIdx+'"]') : null;
    if(oldEl)oldEl.className=oldEl.className.replace(/\s+selected\b/g,'');
    if(newEl){newEl.className+=' selected';var top=newEl.offsetTop,bottom=top+newEl.offsetHeight;
      if(top<list.scrollTop)list.scrollTop=top;else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;
    }
  };
  App.prototype.moveSelected=function(delta){var indices=this.visibleIndices(),pos=-1,i;
    for(i=0;i<indices.length;i++)if(indices[i]===this.selected)pos=i;
    if(!indices.length)return;
    if(pos<0)pos=0;else pos=(pos+delta+indices.length)%indices.length;
    var old=this.selected;this.selected=indices[pos];this.markSelected(old,this.selected,'channel-list','data-idx');
  };
  App.prototype.tuneSelected=function(){if(this.items[this.selected])this.tune(this.items[this.selected]);};
  App.prototype.tune=function(stream){
    if(!stream)return;
    var self=this,generation=++this.playGen;
    this.stopLease();this.player.stop();this.archiving=false;this.current=stream;
    U.store.set('last-stream:'+this.provider,String(stream.id));
    this.updateNow();this.showPanel(false);this.showEPG(false);this.loadingState(true,'Открытие канала...');
    this.api.post('/client/playback/start',{stream_id:String(stream.id)},function(err,data){
      if(generation!==self.playGen)return;
      self.loadingState(false);
      if(err){self.toast('Канал недоступен: '+U.errorText(err));U.text(U.el('video-error'),U.errorText(err));U.show('video-error',true);return;}
      self.lease={token:data.lease_token,streamId:String(stream.id),period:data.heartbeat_after_seconds||60};
      self.playSources(data.sources||[],0,generation);
      self.loadEPG(stream.id);
    });
    this.renderChannels();
  };
  App.prototype.playSources=function(sources,idx,generation){
    var self=this;if(generation!==this.playGen)return;
    if(idx>=sources.length){U.show('video-error',true);U.text(U.el('video-error'),'Ни один источник не воспроизводится на этом устройстве');return;}
    U.show('video-error',false);
    this.player.play(sources[idx],function(err){
      if(generation!==self.playGen)return;
      if(err){self.playSources(sources,idx+1,generation);}
      else {U.show('video-placeholder',false);self.updateNow();}
    });
  };
  App.prototype.stopLease=function(){var lease=this.lease;this.lease=null;if(lease&&this.api.token)this.api.post('/client/playback/stop',{lease_token:lease.token},function(){});};
  App.prototype.heartbeatLease=function(){var self=this,lease=this.lease;if(!lease||!this.api.token)return;
    this.api.post('/client/playback/heartbeat',{lease_token:lease.token},function(err){
      if(err && self.lease===lease){self.toast('Сессия просмотра истекла. Перезапустите канал.');self.stopLease();self.player.stop();}
    });
  };
  App.prototype.updateNow=function(){
    var s=this.current;U.text(U.el('now-num'),s?s.number:'--');U.text(U.el('now-name'),s?s.name:'Выберите канал');
    var parent=U.el('now-logo-wrap');U.clear(parent);if(s&&U.safeURL(s.logo_url)){var img=U.create('img');img.src=s.logo_url;parent.appendChild(img);}
    U.text(U.el('playback-badge'),this.archiving?'АРХИВ':'LIVE');
    this.updateNowProgram();
  };
  App.prototype.loadEPG=function(streamId){
    var self=this,epoch=++this.epgRequest,now=new Date(),start=new Date(now.getTime()-6*3600000),end=new Date(now.getTime()+24*3600000);
    this.epg=[];this.updateNowProgram();
    this.api.get('/client/streams/'+encodeURIComponent(String(streamId))+'/epg?from='+encodeURIComponent(start.toISOString())+'&to='+encodeURIComponent(end.toISOString()),function(err,data){
      if(epoch!==self.epgRequest || !self.current || String(self.current.id)!==String(streamId))return;
      self.epg=err?[]:(data||[]);self.epgSelected=0;self.updateNowProgram();self.renderEPG();
    });
  };
  App.prototype.updateNowProgram=function(){var now=Date.now(),p=null,i,item,epg=this.epg;
    for(i=0;i<epg.length;i++){item=epg[i];if(U.date(item.starts_at)&&U.date(item.starts_at).getTime()<=now && (!item.ends_at||U.date(item.ends_at).getTime()>now)){p=item;break;}}
    U.text(U.el('now-program'),p?p.title+'   ·   '+U.hm(p.starts_at)+'–'+U.hm(p.ends_at):'Программа передач отсутствует');
  };
  App.prototype.renderEPG=function(){var list=U.el('epg-list'),p,i,row,time,name,now=Date.now();U.clear(list);
    for(i=0;i<this.epg.length;i++){p=this.epg[i];row=U.create('div','epg-row'+(i===this.epgSelected?' selected':'')+(U.date(p.starts_at)&&U.date(p.starts_at).getTime()<=now && (!p.ends_at||U.date(p.ends_at).getTime()>now)?' current':'') );row.setAttribute('data-epg',String(i));
      time=U.create('span','epg-time',U.hm(p.starts_at));row.appendChild(time);name=U.create('span','epg-name',p.title||'Без названия');row.appendChild(name);list.appendChild(row);
    }
    if(!this.epg.length)list.appendChild(U.create('div','empty-list','Для этого канала пока нет EPG'));
    U.text(U.el('epg-day'),new Date().toLocaleDateString?new Date().toLocaleDateString('ru-RU'):'Сегодня');
  };
  App.prototype.showPanel=function(on){this.panelOpen=!!on;U.show('channel-panel',on);U.show('dim-layer',on||this.epgOpen);if(on)this.renderChannels();};
  App.prototype.showEPG=function(on){this.epgOpen=!!on;U.show('epg-panel',on);U.show('dim-layer',on||this.panelOpen);if(on){this.showPanel(false);this.renderEPG();}};
  App.prototype.openSelectedArchive=function(){
    var p=this.epg[this.epgSelected],self=this,now=Date.now();if(!p||!this.current)return;
    var start=U.date(p.starts_at),end=U.date(p.ends_at);
    if(!start||!end||start.getTime()>now){this.toast('Запись передачи пока недоступна');return;}
    this.loadingState(true,'Поиск записи в архиве...');
    var query='?start='+encodeURIComponent(start.toISOString())+'&end='+encodeURIComponent(end.toISOString());
    this.api.get('/client/streams/'+encodeURIComponent(String(this.current.id))+'/dvr'+query,function(err,data){
      self.loadingState(false);if(err||!data||!data.sources||!data.sources.length){self.toast('Архив не найден для выбранной передачи');return;}
      self.archiving=true;self.playSources(data.sources,0,self.playGen);self.updateNow();self.showEPG(false);
    });
  };
  App.prototype.returnLive=function(){if(this.current){this.archiving=false;this.tune(this.current);}};
  App.prototype.toggleFavorite=function(){var self=this;if(!this.current){this.toast('Сначала выберите канал');return;}
    var id=String(this.current.id),fav=this.isFavorite(id),path='/client/favorites/'+encodeURIComponent(id);
    if(fav)this.api.del(path,done);else this.api.post(path,{},done);
    function done(err){if(err){self.toast(U.errorText(err));return;}self.loadFavorites();self.toast(fav?'Удалено из избранного':'Добавлено в избранное');}
  };
  App.prototype.openLogin=function(){if(!this.api.token){this.toast('Терминал не подключён');return;}U.show('login-overlay',true);U.el('login-name').focus();};
  App.prototype.closeLogin=function(){U.show('login-overlay',false);this.setError('login-error','');};
  App.prototype.login=function(){var self=this,username=U.el('login-name').value,password=U.el('login-password').value;
    if(!username||!password){this.setError('login-error','Введите логин и пароль');return;}
    this.api.post('/client/auth/login',{username:username,password:password},function(err,data){
      if(err){self.setError('login-error',U.errorText(err));return;}
      self.api.token=data.client_token;U.store.set('client-token:'+self.provider,self.api.token);
      self.authenticated=true;self.updateAccountButton();self.closeLogin();U.el('login-password').value='';
      self.playGen++;self.stopLease();self.player.stop();self.current=null;self.items=[];self.offset=0;self.hasMore=false;
      self.toast('Добро пожаловать!');self.loadFavorites();self.loadChannels();self.checkMessages();
    });
  };
  App.prototype.logout=function(){var self=this;this.api.post('/client/auth/logout',{},function(){
    U.store.remove('client-token:'+self.provider);self.api.token='';self.authenticated=false;
    self.playGen++;self.stopLease();self.player.stop();self.current=null;self.items=[];self.offset=0;self.hasMore=false;
    self.toast('Выход выполнен. Регистрация гостевого терминала...');self.register();
  });};
  App.prototype.checkMessages=function(){var self=this;if(!this.authenticated||!this.api.token)return;
    this.api.get('/client/messages',function(err,data){if(err||!data||!data.items)return;
      var items=data.items,i,m,seen={};
      if(self.activeMessage)seen[self.activeMessage.delivery_id]=true;
      for(i=0;i<self.msgQueue.length;i++)seen[self.msgQueue[i].delivery_id]=true;
      for(i=0;i<items.length;i++){m=items[i];if(seen[m.delivery_id]||(m.delivery_status==='shown' && !m.requires_ack))continue;self.msgQueue.push(m);}
      self.nextMessage();
    });
  };
  App.prototype.nextMessage=function(){if(this.activeMessage||!this.msgQueue.length)return;
    var self=this,m=this.msgQueue.shift();this.activeMessage=m;
    this.api.patch('/client/messages/'+encodeURIComponent(m.delivery_id)+'/receipt',{status:'shown'},function(){});
    if(m.display_type==='ticker'){
      U.text(U.el('ticker-text'),m.body||m.title||'');U.show('ticker',true);
      setTimeout(function(){if(self.activeMessage===m)self.dismissMessage();},Math.min(60000,Math.max(5000,(m.duration_seconds||12)*1000)));
    }else{
      U.text(U.el('message-title'),m.title||'Сообщение');U.text(U.el('message-body'),m.body||'');
      var img=U.el('message-image'),src=U.safeURL(m.image_url);if(src){img.src=src;U.show(img,true);}else{img.removeAttribute('src');U.show(img,false);}
      U.show('message-overlay',true);
      if(!m.requires_ack)setTimeout(function(){if(self.activeMessage===m)self.dismissMessage();},Math.min(60000,Math.max(5000,(m.duration_seconds||15)*1000)));
    }
  };
  App.prototype.dismissMessage=function(){var m=this.activeMessage;U.show('message-overlay',false);U.show('ticker',false);
    if(!m)return;this.activeMessage=null;
    if(m.requires_ack)this.api.patch('/client/messages/'+encodeURIComponent(m.delivery_id)+'/receipt',{status:'acknowledged'},function(){});
    this.nextMessage();
  };
  App.prototype.clock=function(){var d=new Date();U.text(U.el('clock'),('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2));};
  App.prototype.numberKey=function(n){var self=this;this.numBuffer+=n;U.text(U.el('number-popup'),this.numBuffer);U.show('number-popup',true);
    if(this.numTimer)clearTimeout(this.numTimer);this.numTimer=setTimeout(function(){self.commitNumber();},1600);};
  App.prototype.commitNumber=function(){var n=Number(this.numBuffer),i;this.numBuffer='';U.show('number-popup',false);
    for(i=0;i<this.items.length;i++)if(Number(this.items[i].number)===n){this.selected=i;this.tuneSelected();return;}
    this.toast('Канал '+n+' не найден в загруженном списке');};
  App.prototype.keyDown=function(ev){
    var code=ev.keyCode||ev.which||0, key=ev.key||'',target=ev.target||ev.srcElement;
    if(code===120||code===406){if(root.PortalDiagnostics)root.PortalDiagnostics.toggle();if(ev.preventDefault)ev.preventDefault();return;}
    if(root.PortalDiagnostics&&root.PortalDiagnostics.isVisible()){if(code===27||code===8){root.PortalDiagnostics.toggle(false);if(ev.preventDefault)ev.preventDefault();}return;}
    code=root.PortalPlatform.key(code);
    // Keep editable controls accessible to keyboards and on-screen input.
    var inInput=target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName||'');
    if(!U.el('setup-overlay').className.match(/hidden/) || !U.el('login-overlay').className.match(/hidden/))return;
    if(!U.el('message-overlay').className.match(/hidden/)){
      if(code===13||code===27||code===8||code===461){this.dismissMessage();if(ev.preventDefault)ev.preventDefault();}return;
    }
    if(inInput)return;
    var handled=true;
    if((code>=48&&code<=57)||(code>=96&&code<=105))this.numberKey(String(code>=96?code-96:code-48));
    else if(code===38){if(this.epgOpen){var previous=this.epgSelected;this.epgSelected=Math.max(0,this.epgSelected-1);this.markSelected(previous,this.epgSelected,'epg-list','data-epg');}else{if(!this.panelOpen)this.showPanel(true);this.moveSelected(-1);}}
    else if(code===40){if(this.epgOpen){var previous=this.epgSelected;this.epgSelected=Math.min(Math.max(0,this.epg.length-1),this.epgSelected+1);this.markSelected(previous,this.epgSelected,'epg-list','data-epg');}else{if(!this.panelOpen)this.showPanel(true);this.moveSelected(1);}}
    else if(code===13){if(this.epgOpen)this.openSelectedArchive();else if(this.panelOpen)this.tuneSelected();else this.showPanel(true);}
    else if(code===27||code===8||code===461||code===10009){if(this.epgOpen)this.showEPG(false);else if(this.panelOpen)this.showPanel(false);else if(this.archiving)this.returnLive();else this.showPanel(true);}
    else if(code===37){if(this.epgOpen)this.showEPG(false);else this.showPanel(true);}
    else if(code===39){if(this.panelOpen)this.showPanel(false);else this.showEPG(true);}
    else if(code===457||code===73||code===69){this.showEPG(!this.epgOpen);}
    else if(code===70||code===404){this.toggleFavorite();}
    else if(code===76){this.openLogin();}
    else if(code===415||code===179){if(this.archiving)this.returnLive();else this.player.resume();}
    else if(code===413){this.player.pause();}
    else if(code===447||code===107||code===187){this.toast('Громкость '+this.player.volumeChange(10)+'%');}
    else if(code===448||code===109||code===189){this.toast('Громкость '+this.player.volumeChange(-10)+'%');}
    else if(code===77){this.player.toggleMute();}
    else handled=false;
    if(handled){if(ev.preventDefault)ev.preventDefault();ev.returnValue=false;}
  };
  root.IPTVPortalApp=App;
  U.on(root,'load',function(){var app=new App();root.iptvPortal=app;app.start();});
}(window));
