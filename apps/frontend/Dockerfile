# Frontend service. Build context: the repository root (Railway Root Directory "/").
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend
# Optional: call a backend on another origin directly instead of through the proxy.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build -w @re/frontend

FROM caddy:2-alpine
COPY apps/frontend/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/frontend/dist /srv
# Railway injects PORT; BACKEND_URL is set on the service (see railway.toml)
ENV PORT=8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
