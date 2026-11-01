/* mik_tv v0.9.0: A7-A9 remote search and finite recovery. Node, no network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Element {
  constructor(){this.className='hidden';this.children=[];this.attrs={};this.style={};this.value='';this.scrollTop=0;this.clientHeight=400;this.offsetTop=0;this.offsetHeight=50;}
  appendChild(child){child.parentNode=this;child.offsetTop=this.children.length*50;this.children.push(child);return child;}
  removeChild(child){this.children.splice(this.children.indexOf(child),1);return child;}
  get firstChild(){return this.children[0]||null;}
  setAttribute(key,value){this.attrs[key]=String(value);}
  getAttribute(key){return this.attrs[key]===undefined?null:this.attrs[key];}
  querySelector(q){const m=/^\[([^=]+)="([^"]+)"\]$/.exec(q);return m?this.children.find(c=>c.attrs[m[1]]===m[2])||null:null;}
  focus(){document.activeElement=this;}
}
const els={},store={},timerMap={};let tid=0;
const document={body:{className:''},activeElement:null};
function el(id){return els[id]||(els[id]=new Element());}
const U={el,on(){},create(tag,cls,txt){const e=new Element();e.className=cls||'';if(txt!==undefined)e.textContent=String(txt);return e;},
  text(e,txt){if(e)e.textContent=String(txt===undefined?'':txt);},show(id,visible){const e=typeof id==='string'?el(id):id;e.className=visible?'':'hidden';},
  clear(e){while(e.firstChild)e.removeChild(e.firstChild);},safeURL(){return '';},date(s){return new Date(s);},hm(){return '12:00';},errorText(err){return err&&err.message||'error';},
  store:{get(k){return store[k]||null;},set(k,v){store[k]=String(v);},remove(k){delete store[k];}}};
const E={renderDVR(){},archiveBounds(){return null;},renderDetails(){},renderTimeline(){}};
const win={PortalUtil:U,PortalEPG:E,IPTV_CONFIG:{PAGE_SIZE:10,THEME:'modern'},PortalPlatform:{current:{engine:'mag250'},detect(){return this.current;},key(x){return x;}},
  PortalPlayer:function(){this.engine='mag250';this.stop=function(){};this.play=function(s,cb){cb(null);};},PortalAPI:function(){this.token='secret';}};
function setTimeoutFake(fn,ms){const id=++tid;timerMap[id]={fn,ms};return id;}
function clearTimeoutFake(id){delete timerMap[id];}
function runTimer(id){const entry=timerMap[id];assert(entry,'expected timer');delete timerMap[id];entry.fn();}
const ctx=vm.createContext({window:win,document,Date,Math,Number,String,isFinite,encodeURIComponent,decodeURIComponent,
  setTimeout:setTimeoutFake,clearTimeout:clearTimeoutFake});
for(const name of ['tv-menu','app'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),ctx);
function channel(id,name,number,genres=[]){return {id:String(id),name,number,genres};}
const app=new win.IPTVPortalApp();app.provider='demo';app.api.token='secret';app.items=[
  channel(1,'Первый',1,[{id:'7',name:'Новости'}]),channel(2,'Спорт ТВ',2,[{id:'8',name:'Спорт'}]),channel(3,'Кино',3,[{id:'9',name:'Фильмы'}])];
app.hasMore=false;app.renderChannels();
assert(app.matchesSearch(app.items[0],'пЕРВ'),'case-insensitive Cyrillic');
assert(app.matchesSearch(app.items[1],'2'),'channel number');
assert(app.matchesSearch(app.items[0],'новост'),'genre match');
assert(!app.matchesSearch(app.items[0],'спорт'));
const menu=app.tvMenu;assert.equal(menu.homeEntries().length,9);
menu.open('home');menu.selected=2;menu.activate();assert.equal(app.searchOpen,true,'Home search command');
assert.equal(el('channel-search-overlay').className,'','Search dialog visible');
app.closeSearch();assert.equal(app.searchOpen,false);
app.panelOpen=true;app.cycleCategory(1);assert.equal(app.onlyFavorites,true);
app.cycleCategory(1);assert.equal(app.genreId,'7','Categories sorted by name');
app.cycleCategory(-1);assert.equal(app.onlyFavorites,true);
app.setChannelMode('all');
// Searches can fetch additional pages, but never scan indefinitely.
app.offset=3;app.hasMore=true;
let requests=0,pending;
app.api.get=function(uri,callback){requests++;pending=callback;};
el('channel-search-input').value='special';app.applySearch();
assert.equal(app.searchQuery,'special');assert.equal(requests,1);
pending(null,{items:[channel(4,'SPECIAL Sports',4)],has_more:false});
assert.equal(app.visibleIndices().length,1);assert.equal(app.items[app.visibleIndices()[0]].id,'4');
assert.equal(app.searchScanTerm,'','Stop loading after match');
app.clearSearch();assert.equal(app.visibleIndices().length,4);
app.items=[channel(1,'Альфа',1)];app.offset=1;app.hasMore=true;app.loading=false;
requests=0;
app.api.get=function(uri,cb){requests++;cb(null,{items:[channel(requests+10,'Канал',requests+10)],has_more:true});};
el('channel-search-input').value='неизвестный';let toasts=[];app.toast=(msg)=>toasts.push(msg);
app.applySearch();assert.equal(requests,12);assert.equal(app.searchScanTerm,'');assert.equal(app.searchPages,12);assert(toasts[0].includes('12'));
// Auth/access failures may not be retried; transient API failures may.
app.clearSearch();app.current=null;app.panelOpen=false;
app.loadEPG=function(){};app.renderChannels=function(){};app.showPanel=function(){};app.showEPG=function(){};
app.stopLease=function(){this.lease=null;};
let starts=[];app.api.post=function(url,data,callback){if(url==='/client/playback/start'){starts.push(callback);}else callback(null,{ok:true});};
const play=app.player;let played=[];play.play=function(source,callback){played.push(source.id);callback({message:'source unreachable'});};
const first=channel(20,'Bad stream',20);
app.tune(first);assert.equal(starts.length,1);
starts.shift()(null,{lease_token:'x',sources:[{id:'primary'},{id:'backup'}]});
assert.deepEqual(played,['primary','backup']);assert.equal(app.recoveryAttempts,1);
let retryId=app.retryTimer;assert.equal(timerMap[retryId].ms,1500);
runTimer(retryId);assert.equal(starts.length,1);
starts.shift()(null,{lease_token:'y',sources:[{id:'primary2'}]});assert.equal(app.recoveryAttempts,2);
retryId=app.retryTimer;assert.equal(timerMap[retryId].ms,3000);runTimer(retryId);
starts.shift()(null,{lease_token:'z',sources:[{id:'last'}]});assert.equal(app.recoveryAttempts,3);
retryId=app.retryTimer;assert.equal(timerMap[retryId].ms,6000);runTimer(retryId);
starts.shift()(null,{lease_token:'w',sources:[{id:'last'}]});
assert.equal(app.retryTimer,null,'Auto retry budget is exhausted');
assert(el('video-error').textContent.includes('остановлено'));
assert.equal(app.recoveryAttempts,3);
// A new manually tuned channel must cancel previous retries and reset budget.
app.retryNow();assert.equal(app.recoveryAttempts,0);assert.equal(starts.length,1);
starts.shift()({status:403,message:'Forbidden'});assert.equal(app.retryTimer,null,'Never retry forbidden access');
app.tune(channel(21,'New stream',21));starts.shift()({status:503,message:'Service Unavailable'});
assert.equal(app.recoveryAttempts,1);retryId=app.retryTimer;
app.tune(channel(22,'Other stream',22));assert.equal(app.retryTimer,null);
assert.equal(timerMap[retryId],undefined,'Manual zapping cancels queued retries');
starts.shift()({status:401,message:'Unauthorized'});assert.equal(app.retryTimer,null);
assert.equal(app.recoveryAttempts,0);
console.log('OK: TV menu search, genre cycling, bounded paging, source failover, 3 retries and cancellation');
