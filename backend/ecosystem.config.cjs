module.exports = {
  apps: [{
    name: 'iptv-admin-api',
    cwd: __dirname,
    script: 'node',
    args: '--env-file=.env dist/src/main.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '500M',
    env: { NODE_ENV: 'production', COOKIE_SECURE: 'true' }
  }]
};
