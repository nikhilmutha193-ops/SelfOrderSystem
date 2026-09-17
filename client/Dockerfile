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
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
# 127.0.0.1, not localhost: that resolves to ::1 in this image while nginx only
# listens on IPv4, so the check would fail against a container that serves fine.
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
