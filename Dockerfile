# ── Build stage ──────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci --ignore-scripts

COPY src/ ./src/
COPY config/ ./config/
RUN npm run build

# ── Production stage ─────────────────────────
FROM node:20-alpine AS production

# Install litestream for SQLite replication
RUN wget -qO- https://github.com/benbjohnson/litestream/releases/latest/download/litestream-v0.3.13-linux-amd64-static.tar.gz \
    | tar xz -C /usr/local/bin

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist
COPY config/ ./config/
COPY data/profile.json ./data/profile.json
COPY data/prospect-companies.json ./data/prospect-companies.json
COPY scripts/daily-pipeline.sh ./scripts/daily-pipeline.sh
COPY scripts/start-with-litestream.sh ./scripts/start-with-litestream.sh

RUN chmod +x scripts/*.sh

# Create writable data directory for SQLite
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

# No HTTP port — this is a cron worker
# Default: run the daily briefing pipeline
CMD ["node", "dist/src/cli.js", "briefing"]
