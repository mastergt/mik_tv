const test=require('node:test');
const assert=require('node:assert/strict');

const {requestClientIp,ProviderDiscoveryService}=require('../dist/src/client/provider-discovery.service.js');
const {validateNetworks}=require('../dist/src/providers/providers.service.js');

test('untrusted X-Forwarded-For never chooses provider IP',()=>{
  const external={socket:{remoteAddress:'198.51.100.40'},headers:{'x-forwarded-for':'203.0.113.25','x-real-ip':'192.0.2.10'}};
  assert.equal(requestClientIp(external),'198.51.100.40');
  const proxy={socket:{remoteAddress:'127.0.0.1'},headers:{'x-real-ip':'2001:db8::5','x-forwarded-for':'1.2.3.4'}};
  assert.equal(requestClientIp(proxy),'2001:db8::5');
  assert.equal(requestClientIp({socket:{remoteAddress:'::ffff:198.51.100.10'},headers:{}}),'198.51.100.10');
  assert.equal(requestClientIp({socket:{remoteAddress:'127.0.0.1'},headers:{'x-real-ip':'not-an-ip'}}),'127.0.0.1');
});

test('admin accepts IPv4 and IPv6 CIDRs, rejects invalid prefixes',()=>{
  assert.deepEqual(validateNetworks(['198.51.100.1','2001:db8::/48','198.51.100.0/24']),[
    '198.51.100.1/32','2001:db8::/48','198.51.100.0/24'
  ]);
  for(const bad of [['192.0.2.0/33'],['2001:db8::/129'],['host.example/24'],['192.0.2.0/-1']]){
    assert.throws(()=>validateNetworks(bad));
  }
});

test('discover chooses matched provider, then default, otherwise 404',async()=>{
  const req={socket:{remoteAddress:'198.51.100.9'},headers:{}};
  let called=[];
  const service=new ProviderDiscoveryService({one:async(sql,args)=>{
    called.push({sql,args});
    if(sql.includes('FROM core.provider_ip_ranges'))return {id:9,slug:'alpha',name:'Alpha',source:'network'};
    return null;
  }});
  const first=await service.discover(req);
  assert.equal(first.provider.slug,'alpha');
  assert.equal(first.match,'network');
  assert.equal(first.api_base_url,'https://start.iptv.artelmik.ru/api/v1');
  assert.match(called[0].sql,/ORDER BY masklen\(n\.network\) DESC/);
  assert.equal(called[0].args[0],'198.51.100.9');
  const fallback=new ProviderDiscoveryService({one:async(sql)=>sql.includes('is_default')?
    {id:1,slug:'fallback',name:'Fallback',source:'default'}:null});
  assert.equal((await fallback.discover(req)).match,'default');
  const missing=new ProviderDiscoveryService({one:async()=>null});
  await assert.rejects(missing.discover(req),e=>e.getStatus()===404 &&
    e.getResponse().code==='PROVIDER_NOT_FOUND');
});
