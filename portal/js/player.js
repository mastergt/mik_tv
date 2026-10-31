(function(root){
  'use strict';
  function Player(video){
    this.video=video;this.hls=null;this.src='';this.onError=null;this.hlsLoading=false;this.serial=0;
    this.engine=(root.PortalPlatform.current||root.PortalPlatform.detect()).engine;
    this.native=this.engine==='mag250'?new root.PortalMAG250():null;
    var self=this;
    video.onerror=function(){self.emitError('Ошибка видеоплеера');};
    video.onstalled=function(){};
  }
  Player.prototype.emitError=function(message){if(this.onError){var cb=this.onError;this.onError=null;cb(message);}};
  Player.prototype.stop=function(){
    this.serial++;
    if(this.hls){try{this.hls.destroy();}catch(e){}this.hls=null;}
    try{this.video.pause();this.video.removeAttribute('src');this.video.load();}catch(e){}
    if(this.native)this.native.stop();
    this.onError=null;
  };
  Player.prototype.play=function(source,callback){
    var url=source && source.url, protocol=String(source && source.protocol||'').toLowerCase();
    this.stop();var runId=this.serial,self=this;
    this.onError=function(reason){callback({message:reason});};
    if(this.native){
      if(!this.native.available())return this.emitError('MAG Native API недоступен: проверьте прошивку или переключите движок');
      this.native.play(source,function(err){if(runId!==self.serial)return;if(err)self.emitError(err.message||'Ошибка MAG');else callback(null);},
        function(err){if(runId===self.serial)callback(err);});
      return;
    }
    if(!url || typeof url!=='string' || !/^(https?:\/\/|\/[^\/])/i.test(url))return this.emitError('Неподдерживаемый адрес источника');
    if(protocol==='udp' || /^udp:\/\//i.test(url))return this.emitError('UDP требует нативного адаптера приставки');
    if(protocol==='dash')return this.emitError('DASH в первой версии не поддерживается');
    this.src=url;
    var isHls=protocol==='hls' || /\.m3u8(?:[?#]|$)/i.test(url);
    var nativeHls=false;
    try{nativeHls=!!this.video.canPlayType('application/vnd.apple.mpegurl')||!!this.video.canPlayType('application/x-mpegURL');}catch(e){}
    if(isHls && !nativeHls){
      this.loadHls(function(err){
        if(runId!==self.serial)return;
        if(err)return self.emitError(err);
        try{
          if(!root.Hls || !root.Hls.isSupported())return self.emitError('На устройстве нет поддержки HLS/MSE');
          self.hls=new root.Hls({enableWorker:false,backBufferLength:20,maxBufferLength:15,lowLatencyMode:false});
          self.hls.on(root.Hls.Events.ERROR,function(_,data){if(data && data.fatal)self.emitError('Ошибка HLS: '+(data.details||data.type||'неизвестная'));});
          self.hls.on(root.Hls.Events.MANIFEST_PARSED,function(){self.tryPlay();});
          self.hls.attachMedia(self.video);self.hls.loadSource(url);
          self.onError=null;
          // HLS errors are still reported through a fresh callback.
          self.onError=function(reason){callback({message:reason});};
          callback(null);
        }catch(e){self.emitError('Не удалось создать HLS-плеер');}
      });
      return;
    }
    try{this.video.src=url;this.video.load();this.tryPlay();callback(null);}catch(e){this.emitError('Не удалось открыть поток');}
  };
  Player.prototype.pause=function(){if(this.native)this.native.pause();else try{this.video.pause();}catch(e){}};
  Player.prototype.resume=function(){if(this.native)this.native.resume();else this.tryPlay();};
  Player.prototype.volumeChange=function(delta){if(this.native)return this.native.volumeChange(delta);try{this.video.volume=Math.max(0,Math.min(1,this.video.volume+delta/100));return Math.round(this.video.volume*100);}catch(e){return 0;}};
  Player.prototype.toggleMute=function(){if(this.native)return this.native.toggleMute();try{this.video.muted=!this.video.muted;return this.video.muted;}catch(e){return false;}};
  Player.prototype.tryPlay=function(){
    if(this.native){this.native.resume();return;}
    try{var p=this.video.play();if(p && typeof p.catch==='function')p.catch(function(){});}catch(e){}
  };
  Player.prototype.loadHls=function(cb){
    if(root.Hls){cb(null);return;}
    var existing=document.getElementById('hls-library');
    if(existing){
      if(existing.getAttribute('data-ready')==='yes'){cb(null);return;}
      if(existing.getAttribute('data-ready')==='error'){cb('Ошибка загрузки HLS');return;}
      var poll=0,id=setInterval(function(){
        poll++;if(root.Hls){clearInterval(id);cb(null);}else if(poll>60){clearInterval(id);cb('HLS библиотека не загрузилась');}
      },100);return;
    }
    var script=document.createElement('script');script.id='hls-library';script.src=root.IPTV_CONFIG.HLS_LIBRARY;
    script.onload=function(){script.setAttribute('data-ready','yes');cb(root.Hls?null:'HLS библиотека отсутствует');};
    script.onerror=function(){script.setAttribute('data-ready','error');cb('Ошибка загрузки HLS');};
    document.getElementsByTagName('head')[0].appendChild(script);
  };
  root.PortalPlayer=Player;
}(window));
