#!/bin/sh
set -e

echo "=== Job Hunt OS Daily Pipeline ==="
echo "$(date): Starting scan..."
node dist/src/cli.js scan

echo "$(date): Generating briefing..."
node dist/src/cli.js briefing --no-scan

if [ -n "${DASHBOARD_HEALTHCHECK_URL:-}" ]; then
  echo "$(date): Smoke testing dashboard health..."
  if [ -n "${DASHBOARD_API_KEY:-}" ]; then
    if ! wget -q -O /dev/null --header="x-dashboard-api-key: ${DASHBOARD_API_KEY}" "${DASHBOARD_HEALTHCHECK_URL}"; then
      echo "$(date): Dashboard health smoke test failed (non-blocking)."
    fi
  else
    if ! wget -q -O /dev/null "${DASHBOARD_HEALTHCHECK_URL}"; then
      echo "$(date): Dashboard health smoke test failed (non-blocking)."
    fi
  fi
fi

if [ -z "${DASHBOARD_HEALTHCHECK_URL:-}" ] && [ -n "${DASHBOARD_URL:-}" ]; then
  DASHBOARD_HEALTHCHECK_URL="${DASHBOARD_URL%/}/api/health"
  echo "$(date): Smoke testing dashboard health..."
  if [ -n "${DASHBOARD_API_KEY:-}" ]; then
    if ! wget -q -O /dev/null --header="x-dashboard-api-key: ${DASHBOARD_API_KEY}" "${DASHBOARD_HEALTHCHECK_URL}"; then
      echo "$(date): Dashboard health smoke test failed (non-blocking)."
    fi
  else
    if ! wget -q -O /dev/null "${DASHBOARD_HEALTHCHECK_URL}"; then
      echo "$(date): Dashboard health smoke test failed (non-blocking)."
    fi
  fi
fi

echo "$(date): Pipeline complete."
