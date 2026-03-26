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

ARG LITESTREAM_VERSION=0.5.2

# Install litestream and native build deps required by better-sqlite3 on Alpine
RUN apk add --no-cache \
    wget \
    ca-certificates \
    tar \
    python3 \
    make \
    g++ \
    libstdc++

# Install litestream for SQLite replication
RUN wget -qO- "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz" \
    | tar xz -C /usr/local/bin

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

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
# Default: restore/replicate SQLite and run the daily pipeline
CMD ["scripts/start-with-litestream.sh"]
