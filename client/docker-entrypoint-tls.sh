#!/bin/sh
# Runs automatically on container start (nginx:alpine executes every executable script under
# /docker-entrypoint.d/ before nginx itself starts - no custom ENTRYPOINT/CMD needed).
#
# Generates a self-signed TLS certificate so the site can be served over HTTPS, which browsers
# require ("secure context") before they'll expose camera access (getUserMedia/enumerateDevices)
# for the in-page QR scanner. A LAN IP can't get a real, publicly-trusted certificate (Let's
# Encrypt can't reach a private address to validate it), so self-signed is the practical option
# for local/LAN testing; a real deployment with a real domain (e.g. Vercel) gets valid HTTPS
# automatically and needs none of this.
set -e

CERT_DIR=/etc/nginx/tls
CERT="$CERT_DIR/cert.pem"
KEY="$CERT_DIR/key.pem"
mkdir -p "$CERT_DIR"

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
  echo "[tls] Using existing self-signed certificate at $CERT_DIR (persisted across restarts)."
  exit 0
fi

# Always valid for localhost/127.0.0.1; add your LAN IP (or hostname) via TLS_EXTRA_SAN so the
# same cert also covers "https://<that-address>:<port>" - e.g. TLS_EXTRA_SAN=IP:192.168.1.20
SAN="DNS:localhost,IP:127.0.0.1"
if [ -n "$TLS_EXTRA_SAN" ]; then
  SAN="$SAN,$TLS_EXTRA_SAN"
fi

echo "[tls] Generating a self-signed certificate (SAN: $SAN)..."
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "$KEY" -out "$CERT" \
  -subj "/CN=selforder-local" \
  -addext "subjectAltName=$SAN"
echo "[tls] Done. Browsers will show a certificate warning on first visit - that's expected for a self-signed cert; accept it once per device to continue."
