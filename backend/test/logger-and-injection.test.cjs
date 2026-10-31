const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('every Nest injectable with class constructor dependencies declares explicit @Inject tokens', () => {
  const files = [
    'src/auth/auth.controller.ts', 'src/auth/auth.service.ts', 'src/auth/authz.ts',
    'src/auth/guard.ts', 'src/auth/users.controller.ts',
    'src/catalog/catalog.controller.ts', 'src/catalog/catalog.service.ts',
    'src/providers/providers.controller.ts', 'src/providers/providers.service.ts',
  ];
  for (const file of files) {
    const source = read(file);
    const constructor = source.match(/constructor\(([^)]*(?:\)[^)]*)*)\)/);
    assert.ok(constructor, `${file} must declare a constructor`);
    assert.ok(constructor[1].includes('@Inject('), `${file} must use explicit tokens`);
    assert.ok(!/constructor\(private readonly/.test(source), `${file} must not depend only on emitted metadata`);
  }
});

test('auth guard imports Reflector from Nest core, and routes remain protected', () => {
  const guard = read('src/auth/guard.ts');
  assert.match(guard, /import \{ Reflector \} from '@nestjs\/core'/);
  assert.match(guard, /@Inject\(Reflector\)/);
  assert.match(read('src/app.module.ts'), /APP_GUARD/);
});

test('bootstrap validates password length and exits with failure status', () => {
  const script = read('scripts/bootstrap-admin.ts');
  assert.match(script, /MIN_PASSWORD_LENGTH = 12/);
  assert.match(script, /No user was created/);
  assert.match(script, /process\.exitCode = 1/);
  assert.doesNotMatch(script, /console\.(log|error)\(password\)/);
});

test('log4js uses files with rotation and optional console and safe access logging', () => {
  const logger = read('src/logger/logger.service.ts');
  assert.match(logger, /type: 'file'/);
  assert.match(logger, /maxLogSize/);
  assert.match(logger, /backups/);
  assert.match(logger, /LOG_TO_CONSOLE/);
  assert.match(logger, /LOG_HTTP_REQUESTS/);
  assert.match(logger, /req\.path/);
  assert.doesNotMatch(logger, /req\.originalUrl/);
  assert.match(read('src/main.ts'), /configureLogging\(\)/);
  assert.match(read('src/main.ts'), /logger: new LoggerService\(\)/);
});
