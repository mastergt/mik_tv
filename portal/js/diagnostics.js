/* Lightweight opt-in diagnostic overlay. Never logs tokens, passwords, UUID or URLs. */
(function(root){
  'use strict';
  var records=[],visible=false,overlay=null,content=null,max=28;
  function text(node,value){if(node)node.textContent=String(value);}
  function button(title,fn){var el=document.createElement('button');el.type='button';el.appendChild(document.createTextNode(title));el.onclick=fn;return el;}
  function baseUrl(){return String(root.location.pathname||'/portal/')+(root.location.search||'').replace(/([?&])(?:engine|diag)=[^&]*/g,'$1').replace(/[?&]+$/,'');}
  function changeEngine(engine){
    var path=String(root.location.pathname||'/portal/'),search=(root.location.search||'').replace(/([?&])(?:engine|diag)=[^&]*/g,'$1').replace(/[?&]+$/,'');
    var join=search.indexOf('?')<0?'?':'&';root.location.href=path+search+join+'engine='+encodeURIComponent(engine)+'&diag=1';
  }
  function init(){
    if(overlay)return;
    overlay=document.createElement('div');overlay.id='iptv-diagnostics';overlay.className='diagnostics hidden';
    var heading=document.createElement('div');heading.className='diag-title';text(heading,'ДИАГНОСТИКА IPTV PORTAL');overlay.appendChild(heading);
    var bar=document.createElement('div');bar.className='diag-actions';
    bar.appendChild(button('Auto',function(){changeEngine('auto');}));
    bar.appendChild(button('HTML5',function(){changeEngine('html5');}));
    bar.appendChild(button('MAG250',function(){changeEngine('mag250');}));
    bar.appendChild(button('Закрыть',function(){toggle(false);}));
    overlay.appendChild(bar);
    content=document.createElement('pre');content.id='iptv-diagnostic-text';overlay.appendChild(content);
    (document.getElementById('stage')||document.body).appendChild(overlay);
    if(root.PortalPlatform.query('diag')==='1')toggle(true);
  }
  function render(){
    if(!visible||!content)return;
    var p=root.PortalPlatform.current||root.PortalPlatform.detect();
    var res=(root.screen?root.screen.width+' x '+root.screen.height:'неизвестно');
    var ua=String(p.ua||'').replace(/[\x00-\x1f]/g,' ').slice(0,180);
    var lines=['Движок: '+p.engine+'    override: '+p.override,
      'Native API: '+(p.nativeApi?'есть':'нет')+'    SDK: '+p.sdk+'    MAG UA: '+(p.magUa?'да':'нет'),
      'Экран: '+res+'    viewport: '+(root.innerWidth||'?')+' x '+(root.innerHeight||'?'),
      'User-Agent: '+ua,'','События (последние '+max+'):'];
    var i;for(i=0;i<records.length;i++)lines.push(records[i]);
    text(content,lines.join('\n'));
  }
  function log(level,message){
    // Log only internally constructed short messages (no stream URL, credentials or tokens).
    var now=new Date(),t=('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2)+':'+('0'+now.getSeconds()).slice(-2);
    var clean=String(message||'').replace(/https?:\/\/\S+/ig,'[URL]').replace(/[\r\n]/g,' ').slice(0,170);
    records.push(t+' ['+String(level||'INFO').slice(0,8)+'] '+clean);
    if(records.length>max)records.shift();render();
  }
  function toggle(on){init();visible=typeof on==='boolean'?on:!visible;
    overlay.className='diagnostics'+(visible?'':' hidden');render();
  }
  root.PortalDiagnostics={init:init,log:log,toggle:toggle,isVisible:function(){return visible;},render:render};
}(window));
