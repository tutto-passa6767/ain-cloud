# API AIN Cloud (NestJS). Перед стартом применяет миграции БД.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/prisma packages/db/prisma
RUN npm ci --workspace @ain/db --workspace @ain/api --include-workspace-root=false --no-audit --no-fund
COPY packages/db packages/db
COPY apps/api apps/api
RUN npx prisma generate --schema packages/db/prisma/schema.prisma && npm run build -w @ain/api

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma && node packages/db/prisma/seed.js && node apps/api/dist/main.js"]
