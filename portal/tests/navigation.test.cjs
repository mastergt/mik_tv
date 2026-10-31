/* Simulated remote navigation and API races: no browser or network needed. */
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const map={};
function el(id){if(!map[id])map[id]={id,className:'hidden',value:'',focus(){document.activeElement=this;}};return map[id];}
const document={activeElement:null};
const store={get:()=>null,set(){},remove(){}};
const util={el,store,on(){},text(n,v){n.textContent=String(v);},show(id,yes){const x=typeof id==='string'?el(id):id;x.className=yes?'':'hidden';},date(v){return new Date(v);},hm:()=>'',errorText:()=>'',safeURL:()=>'',clear(){},create(){return {};}};
const win={IPTV_CONFIG:{PAGE_SIZE:3,THEME:'modern'},PortalUtil:util,
  PortalPlatform:{current:{engine:'html5'},detect(){return this.current;},key(x){return x;}},
  PortalPlayer:function(){this.stop=function(){};this.play=function(){};},
  PortalAPI:function(){this.token='';this.get=function(){};}};
const ctx=vm.createContext({window:win,document,Date,Math,Number,String,encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/epg-dvr.js'),'utf8'),ctx);
vm.runInContext(source,ctx);
const app=new win.IPTVPortalApp();
app.provider='test';app.api.token='token';app.items=[{id:1},{id:2},{id:3}];app.offset=3;app.hasMore=true;app.selected=2;
app.renderChannels=function(){};app.markSelected=function(){};
let requests=0;
app.api.get=function(url,cb){requests++;cb(null,{items:[{id:4},{id:5}],has_more:false});};
app.moveSelected(1);
assert.equal(app.selected,2,'Do not wrap to beginning before loading the next page');
assert.equal(requests,1);
assert.equal(app.items.length,5);
assert.equal(app.offset,5);
app.moveSelected(1);
assert.equal(app.selected,3,'Continue from selected channel after pagination');
// A pending old response must not overwrite a fresh subscriber catalogue.
let oldCallback;
app.api.get=function(url,cb){oldCallback=cb;};
app.hasMore=true;app.loadChannels();
app.catalogEpoch++;app.loading=false;app.items=[{id:10}];app.selected=0;app.offset=1;
oldCallback(null,{items:[{id:99}],has_more:false});
assert.equal(app.items.length,1);
assert.equal(app.items[0].id,10);
// EPG chooses the running event, then updates the date of selected transmission.
const now=Date.now(),hour=3600000;
app.epg=[{starts_at:new Date(now-2*hour).toISOString(),ends_at:new Date(now-hour).toISOString()},
  {starts_at:new Date(now-10*60000).toISOString(),ends_at:new Date(now+10*60000).toISOString()},
  {starts_at:new Date(now+hour).toISOString(),ends_at:new Date(now+2*hour).toISOString()}];
assert.equal(app.currentEPGIndex(),1);
app.epgSelected=1;app.moveEPG(1);assert.equal(app.epgSelected,2);
assert.ok(el('epg-day').textContent.length>0);
// Outdated archive response must never interrupt the next tuned channel.
let archiveCallback,played=0;
app.current={id:42};app.epgSelected=0;app.playGen=5;
app.api.get=function(url,cb){archiveCallback=cb;};
app.loadingState=function(){};app.playSources=function(){played++;};
app.openSelectedArchive();app.playGen=6;app.current={id:43};
archiveCallback(null,{sources:[{url:'https://cdn.example/live.m3u8'}]});
assert.equal(played,0);
// Remote ENTER connects provider even without mouse.
el('setup-overlay').className='';el('login-overlay').className='hidden';
let connected=false;app.chooseProvider=function(){connected=true;};
app.keyDown({keyCode:13,preventDefault(){}});assert.equal(connected,true);
// Login overlay: DOWN changes focused field; BACK closes dialog.
el('setup-overlay').className='hidden';el('login-overlay').className='';
el('login-name').focus();app.keyDown({keyCode:40,preventDefault(){}});
assert.equal(document.activeElement,el('login-password'));
app.closeLogin=function(){el('login-overlay').className='hidden';};
app.keyDown({keyCode:27,preventDefault(){}});assert.equal(el('login-overlay').className,'hidden');
console.log('OK: pagination without mouse, stale catalogue/EPG response, EPG focus, remote setup/login');
