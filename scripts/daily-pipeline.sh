#!/bin/sh
set -e

echo "=== Job Hunt OS Daily Pipeline ==="
echo "$(date): Starting scan..."
node dist/src/cli.js scan

echo "$(date): Generating briefing..."
node dist/src/cli.js briefing --no-scan

echo "$(date): Pipeline complete."
