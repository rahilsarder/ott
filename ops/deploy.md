# Deployment & scaling runbook

Target: one VPS running Node under PM2 behind nginx, with PostgreSQL and Redis on the same box. No containers.

---

## 1. Provision the box

```bash
sudo apt update && sudo apt install -y nginx postgresql redis git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pnpm pm2
```

Create the database role and database:

```bash
sudo -u postgres psql -c "CREATE USER ott WITH PASSWORD 'choose-a-strong-password';"
sudo -u postgres psql -c "CREATE DATABASE ott OWNER ott;"
```

## 2. Deploy the code

```bash
sudo mkdir -p /srv/ott && sudo chown "$USER" /srv/ott
git clone <your-repo> /srv/ott && cd /srv/ott
cp .env.example .env   # then edit — see section 3
pnpm install --frozen-lockfile
pnpm --filter @ott/api exec prisma generate
pnpm --filter @ott/api exec prisma migrate deploy   # deploy step, never on boot
pnpm build
pnpm --filter @ott/api seed                          # first deploy only
pm2 start ops/ecosystem.config.js && pm2 save && pm2 startup
```

## 3. Fill in `.env`

Every value is documented in `.env.example`. The ones that must change from the defaults:

| Variable | Why |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Generate with `openssl rand -base64 48`. Different values. |
| `DATABASE_URL` | The role and password created above. |
| `FLUSSONIC_BASE_URL` | Origin of your Flussonic server, no trailing slash. |
| `FLUSSONIC_SECURELINK_KEY` | Must equal the "Securelink auth key" in Flussonic (section 4), including any `?no_check_ip=true` suffix. **Empty means live URLs go out unsigned and Flussonic rejects them.** |
| `FLUSSONIC_AUTH_IP_ALLOWLIST` | Your Flussonic server's IP, so nothing else can call the auth callback. |
| `WEB_ORIGIN`, `PUBLIC_ASSET_BASE_URL`, `COOKIE_DOMAIN` | Your real domain. |
| `NODE_ENV=production` | Makes the refresh cookie `Secure`. |

## 4. Configure Flussonic

**Securelink** — Flussonic verifies the token itself. Per stream, in the Flussonic UI: **stream → Auth tab → Authentication type: `securelink`**, then set a "Securelink auth key". Copy that field verbatim into `FLUSSONIC_SECURELINK_KEY`, including any `?no_check_ip=true` suffix.

The API mints tokens as:

```
hash  = sha1(stream + ip + starttime + endtime + key + salt)
token = <hash>-<salt>-<endtime>-<starttime>
```

This is pinned by a reference vector in `apps/api/test/flussonic.service.spec.ts` taken from a real server response. **If that test ever fails, tokens will be rejected in production** — treat it as a release blocker, not a flaky test.

Enable securelink only on the streams that need it and set `FLUSSONIC_TOKEN_SCOPE` to match (`live` when VOD is served openly). A token sent to a stream with `Authentication type: none` is rejected.

**Auth callback** (optional) — point Flussonic's `on_play` at `http://<api-host>:4000/api/playback/flussonic-auth` to have this API approve each session. That is the hook for concurrent-stream caps or paid entitlements later, with no client change. Lock it down with `FLUSSONIC_AUTH_IP_ALLOWLIST`.

Also set CORS on Flussonic so browsers may fetch manifests from your web origin.

If your audience is on mobile networks that rotate IPs mid-session, either keep `?no_check_ip=true` on the key or set `FLUSSONIC_BIND_IP=false` — otherwise viewers get a mid-programme 403 when their IP changes.

**Serve Flussonic over HTTPS** before going live. A `http://` manifest is blocked as mixed content once the web app is on `https://`, and the failure surfaces to viewers as a dead player with nothing useful in the UI.

## 5. nginx + TLS

```bash
sudo cp ops/nginx.conf /etc/nginx/sites-available/ott
sudo ln -s /etc/nginx/sites-available/ott /etc/nginx/sites-enabled/ott
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

## 6. Deploying an update

```bash
cd /srv/ott && git pull
pnpm install --frozen-lockfile
pnpm --filter @ott/api exec prisma migrate deploy
pnpm build
pm2 reload all          # zero-downtime; workers restart one at a time
```

---

## Scaling

### Vertical (today)

`instances: 'max'` in `ops/ecosystem.config.js` already forks one API worker per core. Resizing the VPS and running `pm2 reload all` is the whole procedure. Tune `max_memory_restart` if workers grow.

Beyond that: raise Postgres `shared_buffers`/`max_connections`, and put PgBouncer in front of Postgres once worker count × pool size approaches `max_connections`.

### Horizontal (when one box is not enough)

The code is already written for this — the work is configuration, not refactoring:

1. **Move Postgres and Redis onto their own hosts.** Change `DATABASE_URL` and `REDIS_URL`. Nothing else references them.
2. **Move artwork off local disk.** Set `STORAGE_DRIVER=s3` plus the `S3_*` variables and point `PUBLIC_ASSET_BASE_URL` at the bucket or CDN. `StorageService` is the only code that touches files, and the S3 driver goes behind the same interface. *(The S3 driver is stubbed — implementing it is the one code change this step needs.)*
3. **Add app servers.** Deploy the same tree to box #2, pointed at the shared Postgres and Redis.
4. **Put a load balancer in front.** Health checks: `/healthz` for liveness, `/readyz` for readiness. No sticky sessions are needed — access tokens are stateless JWTs and refresh tokens live in Postgres.
5. **Run migrations once per deploy**, from one machine, before reloading the others.

What makes the above sufficient, and must stay true:

- No in-process state. Sessions, caches and rate-limit counters are in Redis.
- No local filesystem as a source of truth (after step 2).
- Video never transits the API — clients pull segments straight from Flussonic, so app servers scale on API traffic alone, not on bandwidth.
- All configuration comes from the environment.

### Verifying you have not broken it

```bash
pm2 start ops/ecosystem.config.js -i 4
npx autocannon -c 50 -d 20 http://localhost:4000/api/home
```

Responses must be identical across workers. A field that differs between requests means state leaked into process memory, and horizontal scaling will break in a way that is hard to diagnose in production.
