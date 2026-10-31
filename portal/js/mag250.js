/* Infomir MAG250 native playback adapter, ES5. Never called on HTML5 by default.
   Supports legacy gSTB / stb and newer stbPlayerManager where available.
   No experimental commands to firmware, only player controls. */
(function (root) {
  'use strict';
  function notify(level,message) {
    if(root.PortalDiagnostics && root.PortalDiagnostics.log)root.PortalDiagnostics.log(level,message);
  }
  function NativeMAG() {
    this.active=false;this.serial=0;this.timer=null;this.callback=null;this.onFatal=null;
    this.legacy=(root.gSTB&&(root.gSTB.PlaySolution||root.gSTB.Play)?root.gSTB:null)||
      (root.stb&&(root.stb.PlaySolution||root.stb.Play)?root.stb:null);
    this.manager=root.stbPlayerManager && root.stbPlayerManager.list && root.stbPlayerManager.list[0]||null;
    this.playerType=(this.legacy && (this.legacy.PlaySolution||this.legacy.Play))?'legacy':(this.manager&&this.manager.play?'manager':'none');
    this.volume=50;this.muted=false;this.initialized=false;this.initialEventHandler=null;
  }
  NativeMAG.prototype.available=function(){return this.playerType!=='none';};
  NativeMAG.prototype.init=function(){
    if(this.initialized)return;this.initialized=true;
    var p=this.legacy;
    if(p){
      // On MAG200/250 SetTopWin(0) keeps HTML GUI on top of native video.
      try{if(typeof p.InitPlayer==='function')p.InitPlayer();}catch(e){notify('WARN','InitPlayer: '+e.message);}
      try{if(typeof p.SetTopWin==='function')p.SetTopWin(0);}catch(e){}
      try{if(typeof p.SetPIG==='function')p.SetPIG(1,256,0,0);}catch(e){}
      // Chromakey 0x000008 is the background visible as a video window.
      // Explicitly enable for older MAG renderers. May require firmware adjustment.
      try{if(typeof p.SetChromaKey==='function' && typeof p.SetMode==='function'){
        p.SetChromaKey(8,16777215);p.SetMode(1);
        if(root.document && root.document.body)root.document.body.style.backgroundColor='#000008';
      }}catch(e){notify('WARN','ChromaKey: '+e.message);}
    }
    var self=this;
    if(!root.stbEvent)root.stbEvent={event:0,onEvent:function(){}};
    this.initialEventHandler=root.stbEvent.onEvent;
    root.stbEvent.onEvent=function(code,info){
      try{if(typeof self.initialEventHandler==='function')self.initialEventHandler(code,info);}catch(e){}
      self.event(code);
    };
    if(this.manager){
      this.manager.onPlayStart=function(){self.event(4);};
      this.manager.onPlayError=function(){self.event(5);};
      this.manager.onContentInfo=function(){notify('INFO','Получены сведения о видеопотоке');};
    }
    notify('INFO','MAG adapter ready, player='+this.playerType);
  };
  NativeMAG.prototype.event=function(code){
    if(!this.active)return;
    code=Number(code);
    notify('EVENT','MAG player event='+code);
    if(code===4){this.finish(null);}
    else if(code===5||code===1){
      var err={message:code===5?'MAG: ошибка открытия видеопотока (event 5)':'MAG: конец потока (event 1)'};
      if(this.callback)this.finish(err);
      else {this.active=false;if(this.onFatal)this.onFatal(err);}
    }
  };
  NativeMAG.prototype.finish=function(err){
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    var cb=this.callback;this.callback=null;
    if(err)this.active=false;
    if(cb)cb(err);
  };
  NativeMAG.prototype.solution=function(src){
    var proto=String(src.protocol||'').toLowerCase(),url=String(src.url||'');
    if(proto==='udp'||proto==='rtp'||/^udp:\/\//i.test(url)||/^rtp:\/\//i.test(url))return 'rtp';
    if(proto==='rtsp'||/^rtsp:\/\//i.test(url))return 'rtsp';
    if(proto==='hls'||/\.m3u8(?:[?#]|$)/i.test(url))return 'ffmpeg';
    if(proto==='http_ts'||proto==='mpegts')return 'ffrt';
    return 'auto';
  };
  NativeMAG.prototype.play=function(src,cb,onFatal){
    this.stop();this.init();this.onFatal=onFatal||null;
    if(!this.available()){cb({message:'Native MAG API недоступен: проверьте прошивку/движок'});return;}
    var url=String(src&&src.url||''),sol=this.solution(src||{}),self=this,seq=this.serial;
    // Never pass unaudited arbitrary firmware URLs to the native player.
    if(!/^(https?:\/\/|udp:\/\/|rtp:\/\/|rtsp:\/\/)/i.test(url)||/[\x00-\x1f]/.test(url)){
      cb({message:'MAG: недопустимый URL источника'});return;
    }
    this.active=true;this.callback=cb;
    notify('PLAY','Native MAG '+sol+'; protocol='+String(src.protocol||'auto'));
    this.timer=setTimeout(function(){
      if(seq===self.serial && self.callback)self.finish({message:'MAG: нет события начала воспроизведения (30 с)'});
    },30000);
    try{
      if(this.playerType==='legacy'){
        if(typeof this.legacy.PlaySolution==='function')this.legacy.PlaySolution(sol,url);
        else this.legacy.Play(sol+' '+url);
      }else this.manager.play({uri:url,solution:sol});
    }catch(e){this.finish({message:'MAG: ошибка Native API: '+(e.message||String(e))});}
  };
  NativeMAG.prototype.stop=function(){
    this.serial++;this.active=false;this.onFatal=null;
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    this.callback=null;
    try{if(this.playerType==='legacy'&&this.legacy&&this.legacy.Stop)this.legacy.Stop();
      else if(this.manager&&this.manager.stop)this.manager.stop();}catch(e){notify('ERROR','Native stop: '+e.message);}
  };
  NativeMAG.prototype.pause=function(){try{if(this.playerType==='legacy'&&this.legacy&&this.legacy.Pause)this.legacy.Pause();
    else if(this.manager&&this.manager.pause)this.manager.pause();}catch(e){}
  };
  NativeMAG.prototype.resume=function(){try{if(this.playerType==='legacy'&&this.legacy&&this.legacy.Continue)this.legacy.Continue();
    else if(this.manager&&this.manager.resume)this.manager.resume();}catch(e){}
  };
  NativeMAG.prototype.volumeChange=function(step){
    this.volume=Math.max(0,Math.min(100,this.volume+step));
    try{if(this.playerType==='legacy'&&this.legacy&&this.legacy.SetVolume)this.legacy.SetVolume(this.volume);
      else if(this.manager&&typeof this.manager.volume!=='undefined')this.manager.volume=this.volume;}catch(e){}
    return this.volume;
  };
  NativeMAG.prototype.toggleMute=function(){this.muted=!this.muted;
    try{if(this.playerType==='legacy'&&this.legacy&&this.legacy.SetMute)this.legacy.SetMute(this.muted?1:0);
      else if(this.manager&&typeof this.manager.mute!=='undefined')this.manager.mute=this.muted;}catch(e){}
    return this.muted;
  };
  root.PortalMAG250=NativeMAG;
}(window));
