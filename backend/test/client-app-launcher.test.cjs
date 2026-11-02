const test=require('node:test');
const assert=require('node:assert/strict');
const {ClientCatalogService}=require('../dist/src/client/client-catalog.service.js');

test('application launcher filters by enabled type and counts accessible streams only',async()=>{
  const calls=[];
  const db={rows:async(sql,args)=>{
    calls.push({sql,args});
    return [{id:1,code:'tv',name:'ТВ',icon:null,sort_order:100,stream_count:2},
      {id:2,code:'cctv',name:'Видеонаблюдение',icon:'📹',sort_order:150,stream_count:0}];
  }};
  const service=new ClientCatalogService(db);
  const data=await service.appTypes({provider_id:17,abonent_id:null,terminal_id:'101'});
  assert.deepEqual(data.map(x=>x.code),['tv','cctv']);
  assert.deepEqual(calls[0].args,[17,null]);
  assert.match(calls[0].sql,/WHERE t.enabled/);
  assert.match(calls[0].sql,/CASE WHEN t.code='tv' THEN 0 ELSE 1 END/);
  assert.match(calls[0].sql,/catalog.stream_visible_to_provider/);
  assert.match(calls[0].sql,/s.is_public/);
});
