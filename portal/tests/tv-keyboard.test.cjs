/* mik_tv A.5: legacy TV keyboard, mouse/remote and login integration. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.join(__dirname,'../js');
class Elem {
  constructor(tag){this.tagName=tag;this.type='text';this.value='';this.maxLength=-1;this.className='hidden';this.children=[];this.attrs={};this.style={};}
  appendChild(c){this.children.push(c);c.parentNode=this;return c;}
  removeChild(c){this.children.splice(this.children.indexOf(c),1);return c;}
  get firstChild(){return this.children[0]||null;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]===undefined?null:this.attrs[k];}
  focus(){doc.activeElement=this;}
}
const map={};const doc={activeElement:null,body:{className:''}};
const el=id=>map[id]||(map[id]=new Elem('DIV'));
const U={el,on(){},create(t,c,txt){const e=new Elem(t.toUpperCase());e.className=c||'';if(txt!==undefined)e.textContent=String(txt);return e;},
  clear(n){while(n.firstChild)n.removeChild(n.firstChild);},text(n,v){if(n)n.textContent=v==null?'':String(v);},
  show(id,v){const e=typeof id==='string'?el(id):id;e.className=e.className.replace(/\s*hidden\b/g,'')+(v?'':' hidden');},
  store:{get(){return null;},set(){},remove(){}},date(v){return new Date(v)},hm(){return '12:00'},safeURL(){return ''},errorText(){return ''}};
const root={PortalUtil:U,IPTV_CONFIG:{THEME:'modern'},PortalKeyboard:null,
  PortalPlatform:{current:{engine:'mag250'},detect(){return this.current},key(v){return v}},
  PortalPlayer:function(){this.engine='mag250';this.stop=function(){};},PortalAPI:function(){this.token='test';}};
const ctx=vm.createContext({window:root,document:doc,Date,Math,Number,String,isFinite,setTimeout(){return 1;},clearTimeout(){},encodeURIComponent,decodeURIComponent});
for(const name of ['epg-dvr','tv-keyboard','app'])vm.runInContext(fs.readFileSync(path.join(base,name+'.js'),'utf8'),ctx);
const K=root.PortalKeyboard,k=new K();const login=el('login-name'),pass=el('login-password');login.maxLength=3;pass.maxLength=1024;pass.type='password';
assert.equal(k.open(login),true);assert(k.active);assert.equal(el('tv-keyboard-rows').children.length,5);
assert.equal(k.rows[0].length,12);assert.equal(k.rows[4].length,8);
assert.equal(k.language,'ru');
k.keyDown(13);assert.equal(login.value,k.rows[0][0]);
k.keyDown(39);k.keyDown(13);assert.equal(login.value.length,2);
k.keyDown(13);assert.equal(login.value.length,3);
k.keyDown(13);assert.equal(login.value.length,3,'maxLength must not be bypassed');
k.keyDown(8);assert.equal(login.value.length,2);
k.select(4,0);k.activate();assert.equal(k.language,'en');
k.select(0,0);k.activate();assert.equal(login.value.length,3);
k.select(4,4);k.activate();assert.equal(login.value,'','clear action');
k.select(0,0);k.activate();assert.equal(login.value,'q');
k.keyDown(27);assert(!k.active);assert.equal(el('tv-keyboard').className.includes('hidden'),true);
// Password must only show masked text in the auxiliary UI.
k.open(pass);k.select(0,0);k.activate();assert.equal(pass.value,'q');
assert.equal(el('tv-keyboard-field').textContent.includes('q'),false,'No plain password outside password input');
assert(el('tv-keyboard-field').textContent.includes('•'),'Mask password chars');
// Application uses keyboard before interpreting remote navigation as login focus controls.
const app=new root.IPTVPortalApp();app.keyboard=k;app.api.token='valid';
app.openLogin();assert(k.active,'MAG250 automatically opens keyboard');
assert.equal(k.target,login);
let entered=0;app.login=function(){entered++};
k.onNext=function(){app.openKeyboard('login-password')};
k.onSubmit=function(){app.login()};
k.select(4,5);k.activate();assert.equal(k.target,pass,'Next from username to password');
app.keyDown({keyCode:37,preventDefault(){}});assert(k.active,'Remote left stays in keyboard');
k.select(4,6);k.activate();assert.equal(entered,1,'OK action submits through app');
app.closeLogin();assert.equal(pass.value,'','Password cleared after closing form');
console.log('OK: ES5 keyboard, RU/EN, focus, remote, maxlength, password masking, MAG auto-open');
