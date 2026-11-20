#!/bin/sh
# Puts the latest code live on the VPS WITHOUT touching MongoDB. Only the server and client containers are rebuilt
# and recreated; the mongo container is never stopped, recreated or removed, and no volume is touched.
#
#   ./redeploy-app.sh            pull, rebuild server + client, recreate them, wait until healthy
#   ./redeploy-app.sh nopull     same, without git pull (use the files already on the server)
#   ./redeploy-app.sh server     only the API (skip the client)
#   ./redeploy-app.sh logs       show the latest API log lines (to read an error behind a 500)
#
# Set HTTPS=1 to include docker-compose.https.yml:  HTTPS=1 ./redeploy-app.sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env file in $(pwd). Copy .env.production.example to .env and fill it in first." >&2
  exit 1
fi

FILES="-f docker-compose.prod.yml"
if [ "${HTTPS:-0}" = "1" ]; then
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
