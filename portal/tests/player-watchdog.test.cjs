/* HTML5 playback: waiting/stalled watchdog must not reconnect an idle/paused player. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const timers={};let serial=0;
function schedule(fn,ms){const id=++serial;timers[id]={fn,ms};return id;}
function cancel(id){delete timers[id];}
const video={paused:false,readyState:2,volume:0.5,src:'',onerror:null,onstalled:null,onwaiting:null,onplaying:null,oncanplay:null,
  canPlayType(){return '';},pause(){this.paused=true;},play(){this.paused=false;},load(){},removeAttribute(){this.src='';}};
const win={PortalPlatform:{current:{engine:'html5'}},IPTV_CONFIG:{HLS_LIBRARY:'player/hls.js'}};
const ctx=vm.createContext({window:win,document:{getElementById(){return null;}},setTimeout:schedule,clearTimeout:cancel,
  setInterval:schedule,clearInterval:cancel,Math,Number,String,Date});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/player.js'),'utf8'),ctx);
const player=new win.PortalPlayer(video);const results=[];
player.play({url:'http://example.test/live.mp4',protocol:'http'},err=>results.push(err?err.message:'ok'));
assert.deepEqual(results,['ok']);
video.onwaiting();let entries=Object.entries(timers);assert.equal(entries.length,1);assert.equal(entries[0][1].ms,18000);
video.onplaying();assert.equal(Object.keys(timers).length,0,'Playing event must cancel the stall alarm');
video.onstalled();entries=Object.entries(timers);assert.equal(entries.length,1);
delete timers[entries[0][0]];entries[0][1].fn();assert.equal(results.length,2);assert(results[1].includes('18'));
player.stop();assert.equal(Object.keys(timers).length,0);
video.paused=true;video.onstalled();assert.equal(Object.keys(timers).length,0,'Pause is not a stalled stream');
player.play({url:'http://example.test/live.mp4',protocol:'http'},err=>results.push(err?err.message:'ok'));
video.readyState=4;video.onwaiting();entries=Object.entries(timers);assert.equal(entries.length,1);entries[0][1].fn();
assert.equal(results.length,3,'Already-buffered video must not emit fatal recovery');
console.log('OK: HTML5 stall watchdog, cancellation on playing/stop, paused and ready-state guards');
