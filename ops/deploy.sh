#!/usr/bin/env bash
#
# One-command deploy: provisions a fresh VPS, or updates one that's already
# deployed. Run this from your machine — it drives the target entirely over
# SSH (same pattern as the ad hoc `ssh ott-vm '...'` commands), so it works
# with any host alias already in ~/.ssh/config.
#
# First run against a host: full interactive setup (packages, Postgres role,
# .env, nginx, TLS, seed data). Every later run against the same host: just
# pulls, rebuilds, migrates and reloads — detected by whether .env already
# exists remotely, so the same command is safe to re-run for routine deploys.
#
# Usage:
#   ops/deploy.sh [ssh-target]                  first-time setup, or update
#   ops/deploy.sh [ssh-target] --to-http         begin migrating an existing
#                                                 https deploy to plain http
#   ops/deploy.sh [ssh-target] --to-http-finish  finish that migration
#
# The --to-http pair exists because downgrading a domain that already sent
# HSTS is not a one-shot flip: browsers that visited it over https have that
# pinned for up to a year and will keep silently rewriting http:// requests
# back to https:// (including the app's own background token-refresh calls)
# regardless of server config. --to-http keeps port 443 alive just long
# enough to actively un-pin those browsers (Strict-Transport-Security:
# max-age=0) while the app itself already serves plain http; --to-http-finish
# closes 443 for good once that's done. Leaving 443 answering (even just to
# redirect) for longer than necessary is its own bug: Chrome's HTTPS-First
# mode will keep trying it on every request, and the resulting https->http
# redirect is a scheme downgrade that browsers strip credentials on — so the
# app's refresh cookie silently stops being sent. Ask this script's history
# how long that one took to track down.
#
# If the git remote is private, the target VM needs its own credentials
# (deploy key / PAT) for the clone step — this script does not set that up.
#
# First-time setup also offers to load ops/data/catalog-seed.dump (a
# data-only pg_dump of Genre/Person/Title/TitleGenre/Season/Episode/Credit,
# gitignored — generate it with pg_dump, see the catalog migration writeup)
# in place of the small demo seed. Streaming platforms still need their own
# admin login either way, so that part of seed.ts always runs, just via
# seed-admin-only.ts instead when a real catalog is being loaded — running
# both would leave demo titles mixed into the real catalog and collide on
# shared genre slugs.
set -euo pipefail

REPO_URL="$(git remote get-url origin)"
BRANCH="$(git branch --show-current)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
INSTALL_DIR="/srv/ott"

MODE="deploy"
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --to-http) MODE="to-http" ;;
    --to-http-finish) MODE="to-http-finish" ;;
    *) TARGET="$arg" ;;
  esac
done
if [[ -z "$TARGET" ]]; then
  read -rp "SSH target (alias from ~/.ssh/config, or user@host): " TARGET
fi

current_web_origin() {
  ssh "$TARGET" "grep '^WEB_ORIGIN=' $INSTALL_DIR/.env | cut -d= -f2-"
}

strip_scheme() {
  local s="$1"
  s="${s#https://}"
  s="${s#http://}"
  echo "$s"
}

# Shared port-80 vhost — used for fresh http-mode installs, and as the
# steady state both phases of an https->http migration converge on. Written
# with placeholders + sed rather than variable interpolation inside the
# heredoc, deliberately: nginx's own $host/$request_uri/etc. must reach the
# file untouched, and mixing bash interpolation into the same heredoc as
# those is exactly how they ended up as literal "\$host" in a live config
# once already.
render_port80_conf() {
  local host="$1" install_dir="$2" out="$3"
  cat > "$out" <<'NGINX'
upstream ott_api { server 127.0.0.1:4000; keepalive 32; }
upstream ott_web { server 127.0.0.1:3000; keepalive 32; }

server {
    listen 80;
    listen [::]:80;
    server_name __HOST_NAME__;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    client_max_body_size 10M;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location /api/ {
        proxy_pass http://ott_api;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
        proxy_read_timeout 60s;
    }

    location = /healthz { proxy_pass http://ott_api/healthz; access_log off; }
    location = /readyz  { proxy_pass http://ott_api/readyz;  access_log off; }

    location /uploads/ {
        alias __INSTALL_DIR__/apps/api/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location /_next/static/ {
        proxy_pass http://ott_web;
        proxy_cache_valid 200 60m;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://ott_web;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
NGINX
  sed -i.bak "s|__HOST_NAME__|${host}|g; s|__INSTALL_DIR__|${install_dir}|g" "$out"
  rm -f "${out}.bak"
}

# Appended only during the transitional phase of an https->http migration —
# stays alive just long enough to un-pin browsers, then --to-http-finish
# removes it by re-rendering with render_port80_conf alone.
append_unpin_block() {
  local host="$1" out="$2"
  cat >> "$out" <<'NGINX'

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __HOST_NAME__;

    ssl_certificate     /etc/letsencrypt/live/__HOST_NAME__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__HOST_NAME__/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL:10m;

    # max-age=0 actively un-pins browsers that cached an old HSTS policy.
    # Run --to-http-finish once they've reloaded https:// at least once —
    # do not leave this listening indefinitely (see header comment above).
    add_header Strict-Transport-Security "max-age=0" always;

    location / {
        return 307 http://$host$request_uri;
    }
}
NGINX
  sed -i.bak "s|__HOST_NAME__|${host}|g" "$out"
  rm -f "${out}.bak"
}

# --- migration modes ---------------------------------------------------------

if [[ "$MODE" == "to-http" ]]; then
  CURRENT_ORIGIN="$(current_web_origin)"
  if [[ "$CURRENT_ORIGIN" != https://* ]]; then
    echo "WEB_ORIGIN is already '$CURRENT_ORIGIN' (not https) — nothing to migrate."
    exit 0
  fi
  HOST_NAME="$(strip_scheme "$CURRENT_ORIGIN")"
  echo "==> Migrating $TARGET ($HOST_NAME) from https to http — phase 1 of 2."

  render_port80_conf "$HOST_NAME" "$INSTALL_DIR" "$SCRATCH/nginx.conf"
  append_unpin_block "$HOST_NAME" "$SCRATCH/nginx.conf"
  scp "$SCRATCH/nginx.conf" "$TARGET:/tmp/ott-nginx.conf"

  ssh "$TARGET" bash -s <<EOF
set -euo pipefail
cd $INSTALL_DIR
sed -i \
  -e "s|^WEB_ORIGIN=.*|WEB_ORIGIN=http://${HOST_NAME}|" \
  -e "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://${HOST_NAME}/api|" \
  -e "s|^PUBLIC_ASSET_BASE_URL=.*|PUBLIC_ASSET_BASE_URL=http://${HOST_NAME}/uploads|" \
  .env
cp /tmp/ott-nginx.conf /etc/nginx/sites-available/ott
nginx -t && systemctl reload nginx
pnpm build
pm2 reload all
EOF

  echo
  echo "=================================================================="
  echo " Phase 1 done: http://${HOST_NAME} now serves the app directly."
  echo " Port 443 is still open ONLY to un-pin browsers with the old HSTS"
  echo " policy cached — it now sends max-age=0 and redirects to http."
  echo
  echo " Load https://${HOST_NAME} once in every browser/profile you test"
  echo " with (or clear it directly via chrome://net-internals/#hsts),"
  echo " then run:"
  echo "   ops/deploy.sh $TARGET --to-http-finish"
  echo "=================================================================="
  exit 0
fi

if [[ "$MODE" == "to-http-finish" ]]; then
  HOST_NAME="$(strip_scheme "$(current_web_origin)")"
  echo "==> Closing port 443 for $HOST_NAME — phase 2 of 2."

  render_port80_conf "$HOST_NAME" "$INSTALL_DIR" "$SCRATCH/nginx.conf"
  scp "$SCRATCH/nginx.conf" "$TARGET:/tmp/ott-nginx.conf"
  ssh "$TARGET" bash -s <<EOF
set -euo pipefail
cp /tmp/ott-nginx.conf /etc/nginx/sites-available/ott
nginx -t && systemctl reload nginx
EOF
  echo "==> Port 443 closed. $HOST_NAME is now plain HTTP only."
  exit 0
fi

# --- already deployed? just update ------------------------------------------

if ssh "$TARGET" "test -f $INSTALL_DIR/.env" 2>/dev/null; then
  echo "==> Existing deploy found at $TARGET:$INSTALL_DIR — updating."
  ssh "$TARGET" bash -s <<EOF
set -euo pipefail
cd $INSTALL_DIR
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH
pnpm install --frozen-lockfile
pnpm --filter @ott/api exec prisma migrate deploy
pnpm build
pm2 reload all
EOF
  echo "==> Update complete: $TARGET"
  exit 0
fi

echo "==> No existing deploy at $TARGET:$INSTALL_DIR — running first-time setup."
echo

# --- prompts -----------------------------------------------------------------

echo "Protocol — choose http if this box only has a private IP / no domain pointed at it:"
select proto in "http  (private IP, no TLS)" "https (public domain, TLS via certbot)"; do
  case $REPLY in
    1) PROTOCOL=http; break ;;
    2) PROTOCOL=https; break ;;
    *) echo "Pick 1 or 2." ;;
  esac
done

if [[ "$PROTOCOL" == https ]]; then
  read -rp "Domain name (must already point at this box' public IP): " HOST_NAME
  read -rp "Email for certbot renewal notices: " CERTBOT_EMAIL
else
  read -rp "IP address or hostname of this box: " HOST_NAME
fi

read -rp "Brand name (site title / login screen wordmark) [Streamly]: " BRAND_NAME
BRAND_NAME="${BRAND_NAME:-Streamly}"

read -rp "Admin login email [admin@ott.local]: " SEED_ADMIN_EMAIL
SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@ott.local}"

read -rp "Flussonic base URL (e.g. http://cdn.example.com:8082): " FLUSSONIC_BASE_URL
while [[ -z "$FLUSSONIC_BASE_URL" ]]; do
  read -rp "  required — Flussonic base URL: " FLUSSONIC_BASE_URL
done

read -rp "Flussonic securelink key (blank = unsigned, no auth): " FLUSSONIC_SECURELINK_KEY

CATALOG_DUMP="ops/data/catalog-seed.dump"
LOAD_CATALOG=false
if [[ -f "$CATALOG_DUMP" ]]; then
  read -rp "Load the migrated catalog dump (15k+ titles) instead of demo seed data? [Y/n]: " ans
  [[ "${ans:-Y}" =~ ^[Yy] ]] && LOAD_CATALOG=true
fi

# --- generate secrets ---------------------------------------------------------

SEED_ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | cut -c1-16)"
DB_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9')"
JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
JWT_REFRESH_SECRET="$(openssl rand -base64 48)"

ORIGIN="${PROTOCOL}://${HOST_NAME}"
if [[ "$PROTOCOL" == https ]]; then
  COOKIE_DOMAIN_LINE="COOKIE_DOMAIN=.${HOST_NAME}"
else
  # Cookies can't be Domain-scoped to a bare IP — host-only cookies (the
  # default when COOKIE_DOMAIN is unset) are what you want here anyway.
  COOKIE_DOMAIN_LINE="# COOKIE_DOMAIN unset — ${HOST_NAME} is not a domain"
fi

# --- render .env ---------------------------------------------------------------

cat > "$SCRATCH/.env" <<ENV
NODE_ENV=production
PORT=4000
API_PREFIX=api
WEB_ORIGIN=${ORIGIN}
${COOKIE_DOMAIN_LINE}

DATABASE_URL=postgresql://ott:${DB_PASSWORD}@localhost:5432/ott?schema=public
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
ACCESS_TOKEN_TTL_SEC=900
REFRESH_TOKEN_TTL_SEC=2592000

FLUSSONIC_BASE_URL=${FLUSSONIC_BASE_URL}
FLUSSONIC_SECURELINK_KEY=${FLUSSONIC_SECURELINK_KEY}
FLUSSONIC_TOKEN_SCOPE=live
FLUSSONIC_BIND_IP=true
PLAYBACK_TOKEN_TTL_SEC=14400
LIVE_TOKEN_TTL_SEC=28800
FLUSSONIC_AUTH_IP_ALLOWLIST=

GOOGLE_CLIENT_ID=
TMDB_API_KEY=
TMDB_LANGUAGE=en-US

STORAGE_DRIVER=local
LOCAL_UPLOAD_DIR=./uploads
PUBLIC_ASSET_BASE_URL=${ORIGIN}/uploads
S3_BUCKET=
S3_REGION=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

THROTTLE_TTL_SEC=60
THROTTLE_LIMIT=300

SEED_ADMIN_EMAIL=${SEED_ADMIN_EMAIL}
SEED_ADMIN_PASSWORD=${SEED_ADMIN_PASSWORD}
SEED_VOD_STREAM=vod/sample.mp4

NEXT_PUBLIC_API_URL=${ORIGIN}/api
NEXT_PUBLIC_BRAND_NAME=${BRAND_NAME}
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV

# --- render nginx config -------------------------------------------------------

if [[ "$PROTOCOL" == https ]]; then
  sed "s/example\.com/${HOST_NAME}/g" ops/nginx.conf > "$SCRATCH/nginx.conf"
else
  # No TLS, no HSTS, no http->https redirect, no port 443 at all — plain
  # port-80 proxy. Nothing here to un-pin later either, since a box that
  # never spoke https never sent HSTS in the first place.
  render_port80_conf "$HOST_NAME" "$INSTALL_DIR" "$SCRATCH/nginx.conf"
fi

# --- push config and provision -------------------------------------------------

echo "==> Copying config to $TARGET..."
scp "$SCRATCH/.env" "$TARGET:/tmp/ott.env"
scp "$SCRATCH/nginx.conf" "$TARGET:/tmp/ott-nginx.conf"
if [[ "$LOAD_CATALOG" == true ]]; then
  echo "==> Copying catalog dump ($(du -h "$CATALOG_DUMP" | cut -f1)) to $TARGET..."
  scp "$CATALOG_DUMP" "$TARGET:/tmp/catalog-seed.dump"
fi

ssh "$TARGET" bash -s <<EOF
set -euo pipefail

apt update -qq
apt install -y -qq nginx postgresql redis git curl
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt install -y -qq nodejs; }
command -v pnpm >/dev/null || npm i -g pnpm >/dev/null
command -v pm2  >/dev/null || npm i -g pm2  >/dev/null

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='ott'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ott WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='ott'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ott OWNER ott;"

mkdir -p $INSTALL_DIR
cd $INSTALL_DIR
if [ -d .git ]; then
  git fetch origin && git checkout $BRANCH && git pull origin $BRANCH
else
  git clone --branch $BRANCH $REPO_URL .
fi

mv /tmp/ott.env .env
ln -sf ../../.env apps/api/.env
ln -sf ../../.env apps/web/.env

pnpm install --frozen-lockfile
pnpm --filter @ott/api exec prisma generate
pnpm --filter @ott/api exec prisma migrate deploy
pnpm build

if [[ "${LOAD_CATALOG}" == true ]]; then
  pnpm --filter @ott/api exec tsx prisma/seed-admin-only.ts
  sudo -u postgres pg_restore --disable-triggers -d ott /tmp/catalog-seed.dump
  rm -f /tmp/catalog-seed.dump
else
  pnpm --filter @ott/api seed
fi

cp /tmp/ott-nginx.conf /etc/nginx/sites-available/ott
ln -sf /etc/nginx/sites-available/ott /etc/nginx/sites-enabled/ott
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

pm2 start ops/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

if [[ "${PROTOCOL}" == https ]]; then
  apt install -y -qq certbot python3-certbot-nginx
  certbot --nginx -d ${HOST_NAME} -m ${CERTBOT_EMAIL} --agree-tos --non-interactive --redirect
fi
EOF

CATALOG_NOTE="demo seed data"
[[ "$LOAD_CATALOG" == true ]] && CATALOG_NOTE="migrated catalog dump (${CATALOG_DUMP})"

echo
echo "=================================================================="
echo " Deploy complete: ${ORIGIN}"
echo " Catalog:         ${CATALOG_NOTE}"
echo "------------------------------------------------------------------"
echo " Admin login:    ${SEED_ADMIN_EMAIL}"
echo " Admin password: ${SEED_ADMIN_PASSWORD}"
echo " DB password:    ${DB_PASSWORD}   (only needed for direct psql access)"
echo "------------------------------------------------------------------"
echo " Full .env lives at ${TARGET}:${INSTALL_DIR}/.env — save the above,"
echo " it is not printed again."
echo "=================================================================="
