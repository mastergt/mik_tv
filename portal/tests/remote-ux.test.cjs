/* mik_tv v0.8.4: virtualized MAG channel list and remote actions. */
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
class Element {
  constructor(tag){this.tagName=tag;this.className='hidden';this.children=[];this.attrs={};this.style={};this.scrollTop=0;this.clientHeight=400;this.offsetTop=0;this.offsetHeight=64;}
  appendChild(n){n.parentNode=this;n.offsetTop=this.children.length*64;this.children.push(n);return n;}
  removeChild(n){this.children.splice(this.children.indexOf(n),1);return n;}
  get firstChild(){return this.children[0]||null;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]===undefined?null:this.attrs[k];}
  querySelector(q){const m=/^\[([^=]+)="([^"]+)"\]$/.exec(q);return m?this.children.find(n=>n.attrs[m[1]]===m[2])||null:null;}
}
const elements={},doc={};function el(id){return elements[id]||(elements[id]=new Element('div'));}
const U={el,text(n,v){n.textContent=String(v);},show(n,v){n=typeof n==='string'?el(n):n;n.className=v?'':'hidden';},
  create(t,c,txt){const e=new Element(t);e.className=c||'';if(txt!==undefined)e.textContent=String(txt);return e;},
  clear(n){while(n.firstChild)n.removeChild(n.firstChild);},date(v){return new Date(v);},hm(){return '12:00';},safeURL(){return '';},
  store:{get(){return null;},set(){},remove(){}},on(){},errorText(e){return e&&e.message||'error'} };
const win={PortalUtil:U,IPTV_CONFIG:{PAGE_SIZE:150,THEME:'modern'},
  PortalPlatform:{current:{engine:'html5'},detect(){return this.current;},key(c){return c;}},
  PortalPlayer:function(){this.engine='mag250';this.stop=function(){};},PortalAPI:function(){this.token='x';}};
const ctx=vm.createContext({window:win,document:doc,Date,Math,Number,String,isFinite,encodeURIComponent,decodeURIComponent,
  setTimeout(){return 1;},clearTimeout(){}});
for(const name of ['epg-dvr','app'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+name+'.js'),'utf8'),ctx);
const app=new win.IPTVPortalApp();
app.player.engine='mag250';app.provider='demo';app.items=Array.from({length:300},(_,i)=>({id:String(i+1),number:i+1,name:'Канал '+(i+1)}));
app.selected=150;app.current=app.items[149];app.panelOpen=true;
app.renderChannels();
assert.equal(el('channel-list').children.length,19,'MAG250 must not render 300 rows');
assert(el('channel-list').querySelector('[data-idx="150"]'),'selected channel must be visible');
assert(el('channel-count').textContent.includes('из 300'),'channel range is visible');
app.moveSelected(1);
assert.equal(app.selected,151);
assert(el('channel-list').children.length<=19,'arrow navigation should not create hundreds of nodes');
let tuned=[];app.tune=function(s){tuned.push(s.number);this.previousStream=this.current;this.current=s;};
app.zap(1);assert.equal(tuned[0],151,'CH+ should advance from current channel without menu');
app.zap(-1);assert.equal(tuned[1],150,'CH- should reverse');
app.tunePrevious();assert.equal(tuned[2],151,'previous channel toggle');
app.panelOpen=false;el('setup-overlay').className='hidden';el('login-overlay').className='hidden';el('message-overlay').className='hidden';
app.keyDown({keyCode:33,preventDefault(){}});assert.equal(tuned[3],152,'PageUp quick zap when menu closed');
app.keyDown({keyCode:81,preventDefault(){}});assert.equal(tuned[4],151,'Q toggles previous');
app.keyDown({key:'ChannelDown',keyCode:0,preventDefault(){}});assert.equal(tuned[5],150,'Browser/Android ChannelDown');
// At the end of a partial catalogue, queue CH+ until another page arrives.
app.items=Array.from({length:3},(_,i)=>({id:String(i+1),number:i+1,name:'Канал '+(i+1)}));
app.current=app.items[2];app.selected=2;app.offset=3;app.hasMore=true;app.loading=false;
let onResponse;
app.api.get=function(path,cb){onResponse=cb;};
app.renderChannels=function(){};
app.zap(1);
assert.equal(app.pendingZap,1,'CH+ should queue at boundary');
assert.equal(tuned.length,6,'No wrapping while catalogue has more pages');
onResponse(null,{items:[{id:'4',number:4,name:'Канал 4'}],has_more:false});
assert.equal(tuned[6],4,'Queued CH+ continues after page loading');
assert.equal(app.pendingZap,0);
// Number keys should also find channels beyond the initially loaded page.
app.items=[{id:'1',number:1,name:'1'},{id:'2',number:2,name:'2'}];
app.offset=2;app.hasMore=true;app.loading=false;
let numberCallback;
app.api.get=function(path,cb){numberCallback=cb;};
app.numBuffer='725';app.commitNumber();
assert.equal(app.pendingNumber,725);
numberCallback(null,{items:[{id:'725',number:725,name:'725'}],has_more:false});
assert.equal(app.pendingNumber,null,'Number search should finish');
assert.equal(tuned[7],725,'Number must tune a channel on the next API page');
// Unknown channel must stop after the bounded scan instead of requesting indefinitely.
app.items=[{id:'1',number:1,name:'1'}];app.offset=1;app.loading=false;app.hasMore=true;
let loops=0;
app.api.get=function(path,cb){loops++;cb(null,{items:[{id:String(loops+1),number:loops+1,name:'next'}],has_more:true});};
let errors=[];app.toast=function(msg){errors.push(msg);};
app.numBuffer='99999';app.commitNumber();
assert.equal(loops,12,'Search must be bounded on very large catalogues');
assert.equal(app.pendingNumber,null);
assert(errors[0].includes('12'), 'Explain the scan limit');
console.log('OK: MAG 19-row virtualization, CH+/CH-, previous channel, numeric pages, bounded scans');
