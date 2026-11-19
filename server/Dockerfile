# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:20-alpine
ARG APP_VERSION=dev
LABEL org.opencontainers.image.version=$APP_VERSION
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Stop the build here, with a clear message, if the compiled app is not in the image.
RUN test -f dist/index.js || (echo 'dist/index.js is missing: the build step did not produce the app' >&2; exit 1)
# Folders the API writes to; docker-compose mounts volumes on them so they survive a redeploy.
RUN mkdir -p uploads backups invoices proofs

EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "dist/index.js"]
