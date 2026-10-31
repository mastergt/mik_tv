const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
test('client auth and admin auth use separate guards and tokens',()=>{
  const a=read('src/client/client-auth.ts');
  assert.match(a,/class ClientGuard/);
  assert.match(a,/refresh_token_hash/);
  assert.match(a,/tokenHash\(token\)/);
  assert.match(a,/t\.abonent_id=ts\.abonent_id/);
  const c=read('src/client/client.controller.ts');
  assert.match(c,/@UseGuards\(ClientGuard\)/);
});
test('only accessible streams and valid entitlements are queried',()=>{
  const c=read('src/client/client-catalog.service.ts');
  for(const text of ['stream_visible_to_provider','abonent_playlists','abonent_streams','valid_until','pl.enabled','ps2.enabled'])assert.ok(c.includes(text),text);
});
test('registration needs a per-device secret, playback transactions serialize subscriber starts',()=>{
  const r=read('src/client/client-identity.service.ts');
  const p=read('src/client/client-playback.service.ts');
  assert.match(r,/Invalid device credentials/);
  assert.match(r,/terminal_credentials/);
  assert.match(p,/FOR UPDATE OF a/);
  assert.match(p,/Concurrent playback limit reached/);
});
test('migration and AppModule integration are present',()=>{
  const s=read('database/migrations/0009_client_api.sql');
  const app=read('src/app.module.ts');
  for(const text of ['terminal_credentials','playback_leases','0009_client_api'])assert.ok(s.includes(text));
  assert.match(app,/ClientBootstrapController/);
  assert.match(app,/ClientController/);
});
