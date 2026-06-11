#!/bin/sh
set -e

echo "🍀 Clover Book - Starting..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until bun -e "
const pg = require('postgres');
const sql = pg(process.env.DATABASE_URL);
sql\`SELECT 1\`.then(() => { sql.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  sleep 1
done
echo "✅ Database connected"

# Run database migrations (push schema)
echo "📦 Pushing database schema..."
cd /app/packages/server
bunx drizzle-kit push --force
cd /app

echo "🚀 Starting server on port ${PORT:-3000}..."
exec bun run /app/server/index.js
