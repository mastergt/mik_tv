/* Run with node portal/tests/mag-adapter.test.cjs. No device or external network required. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.join(__dirname,'../js');
const code=n=>fs.readFileSync(path.join(base,n+'.js'),'utf8');
function boot(sdk,search){
  let sent=[],stops=0,events=[];
  const window={navigator:{userAgent:'MAG250 Linux WebKit'},location:{search:search||'',pathname:'/portal/'},
    screen:{width:1280,height:720},IPTV_CONFIG:{PLAYER_ENGINE:'auto'},
    document:{body:{style:{}}},
    stbEvent:{onEvent:function(x){events.push(x);}},
    gSTB:sdk?{InitPlayer(){sent.push(['init']);},Stop(){stops++;},SetTopWin(v){sent.push(['top',v]);},
      SetPIG(...v){sent.push(['pig',...v]);},SetChromaKey(...v){sent.push(['chroma',...v]);},SetMode(v){sent.push(['mode',v]);},
      PlaySolution(...args){sent.push(args);},SetVolume(v){sent.push(['volume',v]);},Pause(){sent.push(['pause']);},Continue(){sent.push(['resume']);}}:undefined};
  const ctx=vm.createContext({window,document:window.document,Date,Math,Number,String,Array,Object,RegExp,
    encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout});
  vm.runInContext(code('platform'),ctx);vm.runInContext(code('mag250'),ctx);
  return {window,ctx,sent,events,getStops:()=>stops};
}
{
  const {window,sent,events}=boot(true);
  assert.equal(window.PortalPlatform.detect().engine,'mag250');
  let cb=[];const native=new window.PortalMAG250();
  native.play({protocol:'hls',url:'https://cdn.example/channel.m3u8'},e=>cb.push(e||'ok'));
  assert.deepEqual(sent.find(x=>x[0]==='ffmpeg'),['ffmpeg','https://cdn.example/channel.m3u8']);
  assert(sent.some(x=>x[0]==='chroma'));
  window.stbEvent.onEvent(4);assert.equal(cb[0],'ok');assert.deepEqual(events,[4]);
  let fatal=[];native.onFatal=e=>fatal.push(e.message);
  window.stbEvent.onEvent(5);assert.equal(fatal.length,1);assert.match(fatal[0],/ошибка открытия/);
  native.stop();
  native.play({protocol:'udp',url:'udp://239.1.2.3:1234'},e=>cb.push(e||'ok'));
  assert.deepEqual(sent.find(x=>x[0]==='rtp'),['rtp','udp://239.1.2.3:1234']);
  window.stbEvent.onEvent(4);assert.equal(cb[1],'ok');
  native.volumeChange(10);assert(sent.some(x=>x[0]==='volume'));
  native.stop();
}
{
  const {window}=boot(false);
  assert.equal(window.PortalPlatform.detect().engine,'html5');
  window.location.search='?engine=mag250&diag=1';
  assert.equal(window.PortalPlatform.detect().engine,'mag250');
  assert.equal(new window.PortalMAG250().available(),false);
}
{
  const {window}=boot(true);
  window.PortalPlatform.current=window.PortalPlatform.detect();
  assert.equal(window.PortalPlatform.key(403),37);
  assert.equal(window.PortalPlatform.key(404),457);
  assert.equal(window.PortalPlatform.key(405),70);
  assert.equal(window.PortalPlatform.key(38),38);
}
for(const name of ['config','util','api','platform','diagnostics','mag250','player','app']){
  const source=code(name);new vm.Script(source,{filename:name+'.js'});
  assert(!/\b(?:async\s+function|await\s|class\s|const\s|let\s|=>)\b/.test(source),`Modern syntax in ${name}`);
}
console.log('OK: MAG legacy API, HLS/UDP solutions, events, errors, remote keys, ES5 syntax');
