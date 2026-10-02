# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Overrides .env.production (which targets the Vercel backend): in Compose the UI
# talks to the "server" container through nginx on same-origin relative paths.
ENV VITE_API_BASE_URL=/api
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine
# openssl generates the self-signed TLS cert (see docker-entrypoint-tls.sh) that lets the site
# be reached over HTTPS - a "secure context", which browsers require before exposing camera
# access for the in-page QR scanner.
RUN apk add --no-cache openssl
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-locations.conf /etc/nginx/nginx-locations.conf
# nginx:alpine runs every executable script here, in name order, before nginx itself starts.
COPY docker-entrypoint-tls.sh /docker-entrypoint.d/50-generate-self-signed-tls.sh
RUN chmod +x /docker-entrypoint.d/50-generate-self-signed-tls.sh

EXPOSE 80 443
# 127.0.0.1, not localhost: that resolves to ::1 in this image while nginx only
# listens on IPv4, so the check would fail against a container that serves fine.
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
