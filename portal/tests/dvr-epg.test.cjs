/* mik_tv A.3: mock DOM/API checks. Run with node, no network or real STB. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../js');
class Element {
  constructor(tag){this.tagName=tag;this.className='hidden';this.children=[];this.attrs={};this.style={};this.scrollTop=0;this.clientHeight=500;this.offsetTop=0;this.offsetHeight=45;}
  appendChild(c){c.parentNode=this;c.offsetTop=this.children.length*45;this.children.push(c);return c;}
  removeChild(c){this.children.splice(this.children.indexOf(c),1);return c;}
  get firstChild(){return this.children[0]||null;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]===undefined?null:this.attrs[k];}
  querySelector(q){const m=/^\[([^=]+)="([^"]+)"\]$/.exec(q);return m?this.children.find(c=>c.attrs[m[1]]===m[2])||null:null;}
  focus() {doc.activeElement=this;}
}
const elements={};function el(id){return elements[id]||(elements[id]=new Element('div'));}
const doc={activeElement:null};
const U={el,text(n,v){n.textContent=String(v===undefined?'':v);},show(n,v){const e=typeof n==='string'?el(n):n;e.className=v?'':'hidden';},
  clear(n){while(n.firstChild)n.removeChild(n.firstChild);},create(t,c,text){const n=new Element(t);n.className=c||'';if(text!==undefined)n.textContent=String(text);return n;},
  date(v){const d=new Date(v);return isNaN(d.getTime())?null:d;},hm(v){const d=new Date(v);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);},
  errorText(e){return e&&e.message||'error';},store:{get(){return null;},set(){},remove(){}},on(){},safeURL(){return ''}};
const win={PortalAPI:function(){this.token='test';},PortalUtil:U,IPTV_CONFIG:{PAGE_SIZE:150,THEME:'modern'},PortalPlatform:{current:{engine:'html5'},detect(){return this.current;},key(x){return x;}},PortalPlayer:function(){this.stop=function(){};}};
const ctx=vm.createContext({window:win,document:doc,Math,Date,Number,String,isFinite,encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout});
for(const name of ['epg-dvr','app'])vm.runInContext(fs.readFileSync(path.join(root,name+'.js'),'utf8'),ctx);
const E=win.PortalEPG,app=new win.IPTVPortalApp();
const now=Date.now(),hour=3600000,min=60000;
function program(start,end,title){return {starts_at:new Date(start).toISOString(),ends_at:end===null?null:new Date(end).toISOString(),title:title||'Передача',description:'Описание'};}
assert.equal(E.archiveBounds(program(now+hour,now+2*hour),now),null,'No future programme');
assert.equal(E.archiveBounds(program(now-10000,now+hour),now),null,'Too little recorded');
assert.equal(E.archiveBounds(program(now-hour,null),now),null,'Null end');
let b=E.archiveBounds(program(now-hour,now+hour),now);assert.equal(b.start,now-hour);assert.equal(b.end,now-5000);
b=E.archiveBounds(program(now-20*hour,now-hour),now);assert.equal(b.end-b.start,12*hour,'Backend DVR max 12 hours');
let session={start:now-hour,end:now,cursor:now-30*min};
assert.equal(E.seekCursor(session,-10000),session.start,'Clamp at archive start');
assert.equal(E.seekCursor(session,10000),session.end-15000,'Keep 15 sec on the end');
session.cursor=session.start;assert.equal(E.seekCursor(session,-60),null,'No movement outside range');
// 1000 EPG programmes must not translate to 1000 DOM rows, including on a MAG250.
app.epg=[];for(let i=0;i<1000;i++)app.epg.push(program(now-500*min+i*min,now-499*min+i*min,'Передача '+i));
app.epgSelected=500;app.epgOpen=true;app.renderEPG();
assert.equal(el('epg-list').children.length,13,'Virtualized EPG rows');
assert.equal(el('epg-ticks').children.length,7,'6-hour timeline');
assert(el('epg-timeline').children.length<=41,'Limited timeline blocks');
app.selectEPG(970);assert.equal(app.epgSelected,970);assert.equal(el('epg-list').children.length,13);
assert(el('epg-range').textContent.includes('1000'));
// Archive request with a current broadcast must be bounded by the current time.
app.current={id:'42',name:'Тест',number:1};app.playGen=4;app.epg=[program(now-hour,now+hour,'Сейчас')];app.epgSelected=0;
let requests=[],played=0,stopped=0;
app.loadingState=function(){};app.showEPG=function(){};app.updateNow=function(){};app.stopLease=function(){stopped++;};
app.playSources=function(){played++;};app.api.get=function(url,cb){requests.push({url,cb});};app.toast=function(s){this.lastToast=s;};
app.openSelectedArchive();assert.equal(requests.length,1);assert(requests[0].url.includes('/dvr?'));
let q=new URL('http://test'+requests[0].url).searchParams;
assert(Math.abs(new Date(q.get('end')).getTime()-(Date.now()-5000))<5000,'Initial bounded end');
assert.equal(app.archiving,undefined,'Do not change player until successful response');
requests[0].cb(null,{sources:[{url:'http://test/stream.m3u8'}]});
assert.equal(app.archiving,true);assert.equal(played,1);assert.equal(stopped,0,'DVR reuses active lease');
assert(el('dvr-time').textContent.includes('Начало фрагмента'));
const cursor=app.dvrSession.cursor;
app.seekDVR(60);assert.equal(requests.length,2);
let seekURL=new URL('http://test'+requests[1].url);assert.equal(new Date(seekURL.searchParams.get('start')).getTime(),cursor+60000);
// A second seek overtakes the first; stale response must not change playback.
app.seekDVR(120);assert.equal(requests.length,3);
requests[1].cb(null,{sources:[{url:'http://test/stale.m3u8'}]});assert.equal(played,1);
requests[2].cb(null,{sources:[{url:'http://test/new.m3u8'}]});assert.equal(played,2);
assert.equal(app.dvrSession.cursor,cursor+120000);
let paused=0,resumed=0,retuned=0;app.player.pause=function(){paused++;};app.player.resume=function(){resumed++;};
app.toggleDVRPause();assert.equal(paused,1);assert.equal(app.dvrPaused,true);
app.toggleDVRPause();assert.equal(resumed,1);assert.equal(app.dvrPaused,false);
app.tune=function(){retuned++;};app.returnLive();assert.equal(retuned,1);assert.equal(app.dvrSession,null);assert.equal(el('dvr-controls').className,'hidden');
// Only latest response may show DVR; switching to another channel invalidates earlier requests.
app.current={id:'42'};app.playGen=10;app.openSelectedArchive();
let pending=requests[3];app.current={id:'77'};app.playGen++;
pending.cb(null,{sources:[{url:'http://test/no.m3u8'}]});assert.equal(played,2);
console.log('OK: EPG 1000-entry virtualization, timeline, DVR bounds, seek, races, pause and LIVE');
