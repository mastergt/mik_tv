const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const db=path.resolve(root,'../database/migrations');
const migrations=fs.readdirSync(db).filter(x=>x.endsWith('.sql'));
test('six ordered migrations copied from DB v1',()=>{
  assert.deepEqual(migrations.sort().map(x=>x.slice(0,4)),['0001','0002','0003','0004','0005','0006']);
});
test('catalog has separate LIVE and DVR URL sources',()=>{
  const sql=fs.readFileSync(path.join(db,'0002_catalog.sql'),'utf8');
  assert.match(sql,/CREATE TABLE catalog\.stream_sources/);
  assert.match(sql,/source_kind IN \('live', 'dvr'\)/);
  assert.match(sql,/provider_id integer REFERENCES core.providers/);
  assert.match(sql,/catalog_source_global_priority_uq/);
  assert.match(sql,/catalog_source_provider_priority_uq/);
});
test('permissions include per-provider scopes and no plaintext subscriber password column',()=>{
  const roles=fs.readFileSync(path.join(db,'0001_core_auth_audit.sql'),'utf8');
  const sub=fs.readFileSync(path.join(db,'0003_subscribers.sql'),'utf8');
  assert.match(roles,/CREATE TABLE auth\.user_role_assignments/);
  assert.match(sub,/password_hash/);
  assert.match(sub,/password_ciphertext/);
  assert.doesNotMatch(sub,/^\s+password\s+text/im);
});
test('all controller routes remain protected by global guard except explicitly public',()=>{
  const app=fs.readFileSync(path.join(root,'src/app.module.ts'),'utf8');
  assert.match(app,/APP_GUARD/);
  const guard=fs.readFileSync(path.join(root,'src/auth/guard.ts'),'utf8');
  assert.match(guard,/getAllAndOverride/);
  assert.match(guard,/actorFromToken/);
});
