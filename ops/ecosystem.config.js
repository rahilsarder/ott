/**
 * PM2 process definitions.
 *
 * Both apps run in cluster mode: PM2 forks one worker per CPU core and load
 * balances across them, which is how a single VPS scales vertically. Because
 * neither app keeps state in process memory (sessions, caches and rate-limit
 * counters all live in Redis), the worker count can change freely and a second
 * machine can be added later without touching application code.
 *
 *   pm2 start ops/ecosystem.config.js
 *   pm2 logs
 *   pm2 reload all        # zero-downtime restart after a deploy
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'ott-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '600M',
      // Migrations run as a deploy step, never on boot — otherwise N workers
      // would race to apply the same migration.
      env: {
        NODE_ENV: 'production',
      },
      error_file: '../../logs/api-error.log',
      out_file: '../../logs/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'ott-web',
      cwd: './apps/web',
      // Not node_modules/.bin/next — under pnpm that's a POSIX shell shim, not
      // JS, and PM2 tries to load it through Node's module loader regardless,
      // which fails with a SyntaxError on the shell syntax before the app ever
      // starts. The real JS entry point one level down works fine in cluster mode.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '../../logs/web-error.log',
      out_file: '../../logs/web-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
