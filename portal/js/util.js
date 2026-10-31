(function (root) {
  'use strict';
  var U = {};
  U.el = function (id) { return document.getElementById(id); };
  U.text = function (node, value) { if(node) node.textContent = value == null ? '' : String(value); };
  U.show = function (id, yes) { var n = typeof id === 'string' ? U.el(id) : id; if(n) n.className = n.className.replace(/\s*hidden\b/g, '') + (yes ? '' : ' hidden'); };
  U.create = function (tag, cls, text) { var n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)U.text(n,text); return n; };
  U.clear = function (node) { while(node && node.firstChild)node.removeChild(node.firstChild); };
  U.on = function (node,event,fn) { if(node.addEventListener)node.addEventListener(event,fn,false); else if(node.attachEvent)node.attachEvent('on'+event,fn); };
  U.store = {
    get: function (k) { try {return window.localStorage.getItem('iptv:'+k);}catch(e){return null;} },
    set: function (k,v) { try {window.localStorage.setItem('iptv:'+k,String(v));}catch(e){} },
    remove: function (k) { try {window.localStorage.removeItem('iptv:'+k);}catch(e){} }
  };
  U.uuid = function () {
    var bytes=[], i, n, h='';
    if(window.crypto && window.crypto.getRandomValues){ var raw=new Uint8Array(16); window.crypto.getRandomValues(raw); for(i=0;i<16;i++)bytes.push(raw[i]); }
    else { for(i=0;i<16;i++)bytes.push(Math.floor(Math.random()*256)); }
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    for(i=0;i<16;i++){n=bytes[i];h+=('0'+n.toString(16)).slice(-2);if(i===3||i===5||i===7||i===9)h+='-';}
    return h;
  };
  U.date = function (v) { var t=new Date(v); return isNaN(t.getTime()) ? null : t; };
  U.hm = function (v) { var d=U.date(v);return d ? ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2) : '--:--'; };
  U.safeURL = function (url) { if(typeof url!=='string')return ''; if(/^(https?:\/\/|\/[^\/])/i.test(url) && !/[\u0000-\u001f]/.test(url))return url; return ''; };
  U.delay = function (fn,ms) { return setTimeout(fn,ms); };
  U.errorText = function (err) {return err && (err.message||err.error) || 'Ошибка подключения';};
  U.param = function (name) { var q=location.search.replace(/^\?/,'').split('&'),i,p;for(i=0;i<q.length;i++){p=q[i].split('=');if(decodeURIComponent(p[0])===name)return decodeURIComponent((p[1]||'').replace(/\+/g,' '));}return '';};
  root.PortalUtil=U;
}(window));
