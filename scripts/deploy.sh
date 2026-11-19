#!/bin/sh
# Helper for running SelfOrder on a Docker server. Run it from the repository folder on the server.
#
#   ./scripts/deploy.sh first     first install: build, start, create the sample restaurant
#   ./scripts/deploy.sh update    pull the new code, rebuild and restart (data is kept)
#   ./scripts/deploy.sh status    show the containers, their health and the running version
#   ./scripts/deploy.sh version  compare the code's version with the one that is running
#   ./scripts/deploy.sh logs      follow the logs (Ctrl+C to stop)
#   ./scripts/deploy.sh backup    save the database and uploaded files into ./backup-<date>/
#   ./scripts/deploy.sh stop      stop everything (data is kept)
#
# Set HTTPS=1 to include docker-compose.https.yml (Caddy with a real certificate):  HTTPS=1 ./scripts/deploy.sh update
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env file. Copy .env.production.example to .env and fill it in first." >&2
  exit 1
fi

FILES="-f docker-compose.prod.yml"
if [ "${HTTPS:-0}" = "1" ]; then
  FILES="$FILES -f docker-compose.https.yml"
fi
# Name the images after the project version (VERSION file) unless .env already pins a tag (the GitHub deploy does).
if ! grep -q '^IMAGE_TAG=' .env && [ -f VERSION ]; then
  IMAGE_TAG="$(tr -d ' \r\n' < VERSION)"
  export IMAGE_TAG
fi
compose() { docker compose $FILES "$@"; }

# The version the API reports about itself.
running_version() {
  compose exec -T server wget -qO- http://localhost:5000/health 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

wait_healthy() {
  echo "Waiting for the API to be healthy..."
  i=0
  while [ "$i" -lt 60 ]; do
    state=$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q server)" 2>/dev/null || echo starting)
    if [ "$state" = "healthy" ]; then echo "API is healthy."; return 0; fi
    i=$((i + 1))
    sleep 3
  done
  echo "The API did not become healthy. Check: ./scripts/deploy.sh logs" >&2
  return 1
}

case "${1:-}" in
  first)
    compose up -d --build
    wait_healthy
    echo "Creating the restaurant, sample logins and sample menu (first install only)..."
    compose run --rm seed
    echo "Done. Sign in at your site address with admin / Admin@123 and change the passwords at once."
    ;;
  update)
    if command -v git >/dev/null 2>&1 && [ -d .git ]; then git pull --ff-only; fi
    compose up -d --build
    wait_healthy
    docker image prune -f >/dev/null
    echo "Updated. Now running version $(running_version)."
    ;;
  status)
    compose ps
    echo "Running version: $(running_version)"
    ;;
  version)
    echo "Code on this server (VERSION file): $(cat VERSION 2>/dev/null || echo unknown)"
    echo "Running API:                        $(running_version)"
    ;;
  logs)
    compose logs -f --tail=100
    ;;
  backup)
    dir="backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$dir"
    echo "Saving the database to $dir/mongo.archive.gz ..."
    compose exec -T mongo mongodump --archive --gzip --db selforder > "$dir/mongo.archive.gz"
    for vol in uploads backups invoices proofs; do
      echo "Saving $vol ..."
      compose exec -T server tar -C /app -cz "$vol" > "$dir/$vol.tar.gz"
    done
    # Keep the last KEEP_DAYS days of backups here (default 14); older backup-* folders are removed.
    find . -maxdepth 1 -type d -name 'backup-*' -mtime "+${KEEP_DAYS:-14}" -exec rm -rf {} +
    echo "Backup written to $dir/. Copy it off this server."
    ;;
  stop)
    compose down
    ;;
  *)
    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
