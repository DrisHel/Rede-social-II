#!/bin/sh
set -e

echo "[entrypoint] DATABASE_URL=${DATABASE_URL}"

echo "[entrypoint] aplicando migrations..."
npx --no prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] SEED_ON_START=true — recriando os dados de exemplo..."
  npm run prisma:seed
fi

exec "$@"
