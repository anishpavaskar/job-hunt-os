#!/usr/bin/env bash
# Block dangerous production commands and secret exposure.
# Claude Flow hooks merge with this — don't overwrite their hooks.
set -uo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Block direct kubectl apply to prod (should go through CI)
if echo "$CMD" | grep -q "kubectl apply.*-n prod"; then
  echo "Production deploys go through the CI/CD pipeline. Use git push to trigger GitHub Actions." >&2
  exit 2
fi

# Block destructive prod commands
if echo "$CMD" | grep -qE "kubectl delete (namespace|ns|deployment|svc).*-n prod"; then
  echo "Blocked: destructive production command. Use rollback: kubectl rollout undo" >&2
  exit 2
fi

# Block secret exposure
if echo "$CMD" | grep -qE "(printenv|echo.*SECRET|echo.*TOKEN|echo.*PASSWORD|cat.*\.env)"; then
  echo "Blocked: potential secret exposure." >&2
  exit 2
fi

exit 0
