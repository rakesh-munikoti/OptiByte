#!/bin/sh
# startup.sh — Run DB migrations then start the server
set -e

echo "[startup] Running Prisma migrate deploy..."
npx prisma migrate deploy

echo "[startup] Starting OptiByte server..."
exec node server.js
