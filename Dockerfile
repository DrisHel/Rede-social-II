# syntax=docker/dockerfile:1

ARG NODE_VERSION=24-bookworm-slim

FROM node:${NODE_VERSION} AS base

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=development

FROM base AS deps

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

COPY prisma.config.ts ./
COPY prisma ./prisma

ENV DATABASE_URL=file:/app/dev.db

RUN npm ci

FROM base AS dev

COPY --from=deps /app/node_modules ./node_modules

COPY . .

RUN chmod +x docker/entrypoint.sh

ENV PORT=3003
EXPOSE 3003

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["npm", "run", "dev:watch"]
