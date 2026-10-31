/* Development-only preview of TV portal, no DB, no video streams. */
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const channels=[
  {id:'1',number:1,name:'Первый канал HD',logo_url:null,app_type:'tv'},
  {id:'2',number:2,name:'Россия 1',logo_url:null,app_type:'tv'},
  {id:'3',number:3,name:'Матч ТВ',logo_url:null,app_type:'tv'},
  {id:'4',number:4,name:'НТВ',logo_url:null,app_type:'tv'},
  {id:'5',number:5,name:'РЕН ТВ',logo_url:null,app_type:'tv'},
  {id:'6',number:6,name:'Пятый канал',logo_url:null,app_type:'tv'},
  {id:'7',number:7,name:'Культура',logo_url:null,app_type:'tv'}
];
const port=Number(process.env.PORT||4411);
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj));}
http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/v1/client/bootstrap')return send(res,200,{api_version:1,installation_id:'test',server_name:'IPTV Demo',providers:[{slug:'demo',name:'Тестовый провайдер'}],features:{epg:true,messages:true}});
  if(pathname==='/api/v1/client/register')return send(res,201,{terminal_id:'1',device_uuid:'demo',device_secret:'1234',client_token:'x'.repeat(64),expires_in:2592000,authenticated:false});
  if(pathname==='/api/v1/client/me')return send(res,200,{authenticated:false,provider_id:1});
  if(pathname==='/api/v1/client/favorites')return send(res,200,[]);
  if(pathname==='/api/v1/client/streams')return send(res,200,{items:channels,has_more:false,offset:0,limit:150});
  if(pathname.endsWith('/epg')){
    const now=Date.now(),hours=3600000,base=Math.floor(now/hours)*hours;
    const guide=[];
    for(let i=-48;i<24;i++)guide.push({id:String(i+49),
      starts_at:new Date(base+i*hours).toISOString(),ends_at:new Date(base+(i+1)*hours).toISOString(),
      title:['Новости','Художественный фильм','Познавательная передача','Спортивный обзор'][((i%4)+4)%4],
      description:'Демонстрационные данные EPG для испытания управления пультом'});
    return send(res,200,guide);
  }
  if(pathname.endsWith('/dvr'))return send(res,200,{sources:[]});
  if(pathname==='/api/v1/client/messages')return send(res,200,{items:[]});
  if(pathname==='/api/v1/client/heartbeat')return send(res,200,{ok:true});
  if(pathname==='/api/v1/client/playback/start')return send(res,200,{lease_token:'t'.repeat(43),expires_in:150,heartbeat_after_seconds:75,sources:[]});
  if(pathname.startsWith('/api/v1/'))return send(res,404,{message:'Mock endpoint not implemented'});
  if(pathname==='/')pathname='/portal/';
  if(pathname==='/portal/')pathname='/portal/index.html';
  const full=path.resolve(root,'.'+pathname);
  if(!full.startsWith(path.resolve(root,'portal')+path.sep))return send(res,403,{message:'forbidden'});
  fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream'});res.end(data);});
}).listen(port,'127.0.0.1',()=>console.log('Mock portal at http://127.0.0.1:'+port+'/portal/'));
