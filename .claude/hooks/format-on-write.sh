#!/usr/bin/env bash
# Auto-format JS/TS files after Claude writes them.
# Keeps code reviewable (your CLAUDE.md rule: "basic lint/format passes").
set -uo pipefail

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ -z "$FILE" ]] && exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx)
    npx prettier --write "$FILE" 2>/dev/null || true
    ;;
esac

exit 0
