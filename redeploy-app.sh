#!/bin/sh
# Puts the latest code live on the VPS WITHOUT touching MongoDB. Only the server and client containers are rebuilt
# and recreated; the mongo container is never stopped, recreated or removed, and no volume is touched.
#
#   ./redeploy-app.sh            pull, rebuild server + client (+ caddy with HTTPS), recreate them, wait until healthy
#   ./redeploy-app.sh nopull     same, without git pull (use the files already on the server)
#   ./redeploy-app.sh server     only the API (skip the client and caddy)
#   ./redeploy-app.sh logs       show the latest API log lines (to read an error behind a 500)
#
# HTTPS: when .env has DOMAIN=your.domain.com the script uses docker-compose.https.yml too (Caddy with a Let's Encrypt
# certificate), i.e. the same stack as
#   docker compose -f docker-compose.prod.yml -f docker-compose.https.yml up -d --build
# but without ever recreating MongoDB. HTTPS=0 ./redeploy-app.sh forces the plain stack; HTTPS=1 makes DOMAIN required.
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env file in $(pwd). Copy .env.production.example to .env and fill it in first." >&2
  exit 1
fi

FILES="-f docker-compose.prod.yml"
HAS_DOMAIN=0
if grep -Eq '^DOMAIN=[^[:space:]#]+' .env; then HAS_DOMAIN=1; fi
USE_HTTPS=0
case "${HTTPS:-auto}" in
  1)
    # Caddy needs a real domain to get a certificate; a bare IP can't have one.
    if [ "$HAS_DOMAIN" != "1" ]; then
      echo "HTTPS=1 needs DOMAIN=your.domain.com in .env (and CLIENT_ORIGIN=https://your.domain.com, TRUST_PROXY_HOPS=2)." >&2
      echo "With only an IP address, run without HTTPS and set TLS_EXTRA_SAN=IP:<your-ip> for the self-signed certificate on port 8443." >&2
      exit 1
    fi
    USE_HTTPS=1
    ;;
  0) USE_HTTPS=0 ;;
  *) USE_HTTPS="$HAS_DOMAIN" ;;
esac
if [ "$USE_HTTPS" = "1" ]; then
  FILES="$FILES -f docker-compose.https.yml"
fi
# Name the images after the project version unless .env already pins a tag.
if ! grep -q '^IMAGE_TAG=' .env && [ -f VERSION ]; then
  IMAGE_TAG="$(tr -d ' \r\n' < VERSION)"
  export IMAGE_TAG
fi
compose() { docker compose $FILES "$@"; }

mode="${1:-}"

if [ "$mode" = "logs" ]; then
  compose logs --no-color --tail=60 server
  exit 0
fi

SERVICES="server client"
if [ "$mode" = "server" ]; then SERVICES="server"; fi
# Caddy (HTTPS) sits in front of the client; it has nothing to build and is recreated after the client (see below).
WITH_CADDY=0
if [ "$USE_HTTPS" = "1" ] && [ "$mode" != "server" ]; then WITH_CADDY=1; fi

if [ "$mode" != "nopull" ] && command -v git >/dev/null 2>&1 && [ -d .git ]; then
  echo "== Pulling the latest code"
  if ! git pull --ff-only; then
    echo "git pull failed (local edits in the way?). Check 'git status'. Nothing was changed on the running containers." >&2
    exit 1
  fi
fi

echo "== Making sure MongoDB is running (it is left exactly as it is)"
# --no-recreate: start it only if it is stopped; never recreate or restart a running one.
compose up -d --no-recreate mongo

echo "== Building: $SERVICES"
compose build $SERVICES

echo "== Recreating only: $SERVICES (mongo is not touched)"
# --no-deps: do not look at or recreate the services these depend on (mongo).
compose up -d --no-deps --force-recreate $SERVICES
if [ "$WITH_CADDY" = "1" ]; then
  # After the client, so the client lets go of ports 80 and 443 (when switching from the plain stack) before Caddy takes them.
  # Caddy already running is fine (it is recreated); anything else on 80/443 (apache2, nginx, a stray container) is not.
  if [ -z "$(compose ps -q caddy 2>/dev/null)" ] && command -v ss >/dev/null 2>&1; then
    busy=$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -E '(^|[:.])(80|443)$' || true)
    if [ -n "$busy" ]; then
      echo "Port 80 or 443 is already in use, so Caddy cannot start and get the certificate:" >&2
      ss -tlnp 2>/dev/null | grep -E ':(80|443)\s' >&2 || true
      echo "Stop what holds it (e.g. 'sudo systemctl disable --now apache2 nginx', or 'docker ps' for another container), then run this again." >&2
      exit 1
    fi
  fi
  echo "== Starting Caddy (HTTPS for $(sed -n 's/^DOMAIN=//p' .env | head -1))"
  compose up -d --no-deps --force-recreate caddy
fi

echo "== Waiting for the API to be healthy"
i=0
state=starting
while [ "$i" -lt 40 ]; do
  state=$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q server)" 2>/dev/null || echo starting)
  [ "$state" = "healthy" ] && break
  i=$((i + 1))
  sleep 3
done

if [ "$state" != "healthy" ]; then
  echo "The API did not become healthy. Last log lines:" >&2
  compose logs --no-color --tail=40 server >&2
  exit 1
fi

version=$(compose exec -T server wget -qO- http://localhost:5000/health 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
echo "== Done. API is healthy, running version ${version:-unknown}. MongoDB was not restarted."
compose ps
