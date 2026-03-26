#!/bin/sh
set -e

DB_PATH="/app/data/job_hunt.db"
LITESTREAM_CONFIG="/app/litestream.yml"

# Generate litestream config from env var
if [ -n "$LITESTREAM_REPLICA_URL" ]; then
  {
    cat <<EOF
levels:
  - interval: 12h
  - interval: 24h
  - interval: 168h
dbs:
  - path: $DB_PATH
    replicas:
      - type: s3
        url: $LITESTREAM_REPLICA_URL
EOF
    if [ -n "$LITESTREAM_S3_ENDPOINT" ]; then
      printf '        endpoint: %s\n' "$LITESTREAM_S3_ENDPOINT"
    fi
  } > "$LITESTREAM_CONFIG"

  echo "$(date): Restoring SQLite database from replica..."
  litestream restore -if-replica-exists -config "$LITESTREAM_CONFIG" "$DB_PATH" || true

  echo "$(date): Starting daily pipeline with litestream replication..."
  exec litestream replicate -config "$LITESTREAM_CONFIG" -exec "scripts/daily-pipeline.sh"
else
  echo "$(date): LITESTREAM_REPLICA_URL not set — running without replication"
  exec scripts/daily-pipeline.sh
fi
