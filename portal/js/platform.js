/* MAG250/HTML5 engine selection. Plain ES5, no framework. */
(function (root) {
  'use strict';
  function query(name) {
    var s=(root.location && root.location.search||'').replace(/^\?/,''),pairs=s.split('&'),i,p;
    for(i=0;i<pairs.length;i++) {p=pairs[i].split('=');if(p[0]===name)return decodeURIComponent(p.slice(1).join('=')||'');}
    return '';
  }
  function detect() {
    var ua=String(root.navigator && root.navigator.userAgent||'');
    var legacy=root.gSTB || root.stb, manager=root.stbPlayerManager;
    var nativeApi=!!((legacy && (typeof legacy.PlaySolution==='function'||typeof legacy.Play==='function')) ||
      (manager && manager.list && manager.list[0] && typeof manager.list[0].play==='function'));
    var magUa=/\b(MAG\s?2\d\d|MAG\s?250|MAG\s?270|MAG\s?254|STB\s?Linux)\b/i.test(ua);
    var configured=String(root.IPTV_CONFIG && root.IPTV_CONFIG.PLAYER_ENGINE||'auto').toLowerCase();
    var override=String(query('engine')||configured).toLowerCase();
    var engine=override==='mag250'?'mag250':override==='html5'?'html5':(nativeApi?'mag250':'html5');
    return {engine:engine, override:override, nativeApi:nativeApi, magUa:magUa,
      sdk:root.gSTB?'gSTB':root.stb?'stb':root.stbPlayerManager?'stbPlayerManager':'none',ua:ua};
  }
  function key(code) {
    // Common MAG / Infomir: hardware and F-key mappings differ by firmware.
    // Fixed common actions only; do not remap OK, arrows or the number keys.
    if(!root.PortalPlatform.current || root.PortalPlatform.current.engine!=='mag250')return code;
    if(code===112 || code===403) return 37;  // RED or F1: channels
    if(code===113 || code===404) return 457; // GREEN or F2: EPG
    if(code===114 || code===405) return 70;  // YELLOW or F3: favorite
    return code;
  }
  root.PortalPlatform={detect:detect,key:key,query:query};
}(window));
