# Backend service. Build context: the repository root (Railway Root Directory "/").
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN npm run build -w @re/backend

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @re/backend

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/backend/dist ./dist
COPY apps/backend/package.json ./
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.js"]
