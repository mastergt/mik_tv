/* mik_tv A.6: category menu, focus, persistence and resume in an ES5 DOM stub. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=path.join(__dirname,'../js');
class Elem {
  constructor(tag){this.tagName=tag;this.className='hidden';this.children=[];this.attrs={};this.style={};this.scrollTop=0;this.clientHeight=400;this.offsetTop=0;this.offsetHeight=54;this.value='';}
  appendChild(e){e.parentNode=this;e.offsetTop=this.children.length*54;this.children.push(e);return e;}
  removeChild(e){this.children.splice(this.children.indexOf(e),1);return e;}
  get firstChild(){return this.children[0]||null;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return Object.prototype.hasOwnProperty.call(this.attrs,k)?this.attrs[k]:null;}
  querySelector(q){const m=/^\[([^=]+)="([^"]+)"\]$/.exec(q);return m?this.children.find(x=>x.attrs[m[1]]===m[2])||null:null;}
}
const els={};function el(id){return els[id]||(els[id]=new Elem('div'));}
const memory={};const U={el,store:{get(k){return memory[k]||null;},set(k,v){memory[k]=String(v);},remove(k){delete memory[k];}},
  on(){},create(tag,cls,txt){const x=new Elem(tag);x.className=cls||'';if(txt!==undefined)x.textContent=String(txt);return x;},
  text(e,v){if(e)e.textContent=v===undefined?'':String(v);},show(id,show){const e=typeof id==='string'?el(id):id;e.className=show?'':'hidden';},
  clear(e){while(e.firstChild)e.removeChild(e.firstChild);},date(v){return new Date(v);},hm(){return '12:00';},safeURL(){return '';},errorText(){return '';}}
const win={PortalUtil:U,IPTV_CONFIG:{PAGE_SIZE:10},PortalPlatform:{current:{engine:'mag250'},detect(){return this.current},key(x){return x}},
  PortalPlayer:function(){this.engine='mag250';this.stop=function(){};},PortalAPI:function(){this.token='test';}};
const ctx=vm.createContext({window:win,document:{body:{className:''}},Number,Date,Math,String,isFinite,encodeURIComponent,decodeURIComponent,setTimeout(){return 1},clearTimeout(){}});
for(const script of ['epg-dvr','tv-menu','app'])vm.runInContext(fs.readFileSync(path.join(source,script+'.js'),'utf8'),ctx);
const app=new win.IPTVPortalApp();app.provider='demo';app.panelOpen=true;
const make=(i,genres)=>({id:String(i),number:i,name:'Канал '+i,genres:genres.map(g=>({id:g,name:'Группа '+g}))});
app.items=[make(1,[1]),make(2,[1,2]),make(3,[2]),make(4,[3])];
app.offset=4;app.hasMore=true;app.renderChannels();
const menu=app.tvMenu;menu.open('home');assert.equal(menu.opened,true);assert.equal(menu.entries.length,9);
assert.equal(el('tv-menu-list').children.length,9);
menu.selected=3;menu.activate();assert.equal(menu.view,'genres');
assert.equal(menu.entries.length,5,'All+three categories+load more');
assert.equal(menu.entries[1].detail,'2 каналов (загружено)');
menu.selected=2;menu.activate();assert.equal(app.genreId,'2');assert.equal(app.genreName,'Группа 2');
assert.equal(app.visibleIndices().join(','),'1,2');
assert.equal(memory['iptv:channel-mode:demo'],undefined,'stub uses literal keys');
assert.equal(memory['channel-mode:demo'],'genre:2');
assert.equal(el('tv-home-menu').className,'hidden');
assert.equal(el('channel-filter-name').textContent,'ГРУППА 2');
app.setChannelMode('favorites');app.favorites=['1','4'];assert.equal(app.genreId,'');
assert.equal(app.visibleIndices().join(','),'0,3');
assert.equal(memory['channel-mode:demo'],'favorites');
app.savedChannelMode='genre:1';app.genreId='';app.onlyFavorites=false;app.restoreChannelMode();
assert.equal(app.genreId,'1');assert.equal(app.visibleIndices().join(','),'0,1');
app.savedChannelMode='genre:999';app.genreId='';app.restoreChannelMode();assert.equal(app.genreId,'','Unknown restored genre ignored');
// Menu never creates 100 DOM elements for >100 known categories.
app.items=Array.from({length:120},(_,i)=>make(i+1,[i+1]));app.hasMore=false;menu.open('genres');
assert.equal(menu.entries.length,121);assert(el('tv-menu-list').children.length<=11);
menu.move(100);assert(el('tv-menu-list').children.length<=11);
const selected=menu.selected;menu.keyDown(40);assert.equal(menu.selected,selected+1);
menu.keyDown(27);assert.equal(menu.view,'home','Back in categories returns to main menu');
menu.keyDown(27);assert.equal(menu.opened,false,'Back closes main menu');
// Menu intercepts remote button presses before channel selection.
menu.open('home');let tuned=0;app.tuneSelected=function(){tuned++};
app.keyDown({keyCode:40,preventDefault(){}});assert.equal(menu.selected,1);assert.equal(tuned,0);
app.keyDown({keyCode:13,preventDefault(){}});assert.equal(menu.opened,false);
// Resume loads next page only after explicit selection from the menu.
app.items=[make(1,[1])];app.offset=1;app.loading=false;app.hasMore=true;app.current=null;
memory['last-stream:demo']='27';let requested=[];app.api.get=(url,cb)=>requested.push({url,cb});
let played=null;app.tune=function(stream){played=stream.id;this.pendingResume=null;};
app.tuneSelected=function(){if(this.items[this.selected])this.tune(this.items[this.selected]);};
app.resumeLast();assert.equal(requested.length,1);assert.equal(played,null);
requested[0].cb(null,{items:[make(27,[1])],has_more:false});assert.equal(played,'27');
assert.equal(app.pendingResume,null);
// A missing previous stream triggers a bounded scan, not infinite fetching.
app.items=[make(1,[1])];app.offset=1;app.hasMore=true;app.loading=false;memory['last-stream:demo']='9999';
let pages=0;app.api.get=(url,cb)=>{pages++;cb(null,{items:[make(pages+1,[1])],has_more:true});};
let notice='';app.toast=txt=>{notice=txt};app.resumeLast();assert.equal(pages,12);assert.equal(app.pendingResume,null);assert(notice.includes('недоступен'));
console.log('OK: menu, genres, persisted selection, 11-row virtualization, focus, last-channel resume, bounded scan');
