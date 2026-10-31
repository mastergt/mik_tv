const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
for(const name of ['config','util','api','player','epg-dvr','app']){
  const p=path.join(root,'js',name+'.js'),code=fs.readFileSync(p,'utf8');
  new vm.Script(code,{filename:name+'.js'});
  assert(!/\b(?:async\s+function|await\s|class\s|const\s|let\s|=>)\b/.test(code),`Unexpected modern JS construct in ${name}.js`);
}
const storage={};const win={localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}},crypto:require('node:crypto').webcrypto};
const ctx=vm.createContext({window:win,document:{getElementById:()=>null},Uint8Array,Date,Math,Number,String,encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(path.join(root,'js/util.js'),'utf8'),ctx);
const u=win.PortalUtil;
assert.match(u.uuid(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(u.safeURL('javascript:alert(1)'),'');
assert.equal(u.safeURL('//bad.host/logo.png'),'');
assert.equal(u.safeURL('/api/v1/epg/logos/x.png'),'/api/v1/epg/logos/x.png');
assert.equal(u.safeURL('https://video.example/stream.m3u8'),'https://video.example/stream.m3u8');
u.store.set('device','abc');assert.equal(u.store.get('device'),'abc');
console.log('OK: JS syntax, legacy JS patterns, UUID, safe URLs, storage');
