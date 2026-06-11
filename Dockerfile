# ========================================
# Clover Book - Production Dockerfile
# Multi-stage: deps → build → production
# ========================================

# --- Stage 1: Install dependencies ---
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy workspace config and lock file
COPY package.json bun.lock ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# --- Stage 2: Build ---
FROM oven/bun:1-alpine AS build

WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules

# Copy source code
COPY package.json bun.lock tsconfig.json ./
COPY packages/core ./packages/core
COPY packages/server ./packages/server
COPY packages/web ./packages/web

# Build frontend (Vite)
RUN cd packages/web && bun run build

# Build server (Bun bundler)
RUN cd packages/server && bun build src/index.ts --outdir dist --target bun --external postgres

# --- Stage 3: Production ---
FROM oven/bun:1-alpine AS production

WORKDIR /app

# Install only production dependencies for server
COPY package.json bun.lock ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/

# We need postgres driver at runtime (not bundled)
RUN bun install --production --frozen-lockfile

# Copy built artifacts
COPY --from=build /app/packages/server/dist ./server
COPY --from=build /app/packages/web/dist ./web

# Copy drizzle config and schema for migrations
COPY packages/server/drizzle.config.ts ./packages/server/
COPY packages/server/src/db ./packages/server/src/db

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Create data directories
RUN mkdir -p /app/data/ledgers /app/data/uploads

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV UPLOAD_DIR=/app/data/uploads

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
