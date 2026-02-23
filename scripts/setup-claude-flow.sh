#!/usr/bin/env bash
# setup-claude-flow.sh
# Run this once in your project root to initialize Claude Flow
# and merge your custom commands/hooks into the generated structure.
set -euo pipefail

echo "==> Installing Claude Flow alpha..."
npm install -g claude-flow@alpha

echo "==> Initializing Claude Flow in project..."
npx claude-flow@alpha init --verify

echo "==> Adding Claude Flow as MCP server to Claude Code..."
claude mcp add claude-flow npx claude-flow@alpha mcp start

echo "==> Making hook scripts executable..."
chmod +x .claude/hooks/*.sh

echo ""
echo "==> IMPORTANT: Merge your custom hooks manually."
echo "    Claude Flow generated .claude/settings.json with its own hooks."
echo "    Open .claude/settings.local.json and merge the PreToolUse/PostToolUse"
echo "    entries into the generated .claude/settings.json."
echo ""
echo "    Your custom additions:"
echo "    - .claude/hooks/block-prod-direct.sh  (blocks direct prod kubectl)"
echo "    - .claude/hooks/format-on-write.sh    (auto-formats JS/TS on write)"
echo "    - .claude/commands/deploy-lifecycle.md"
echo "    - .claude/commands/rollback-flow.md"
echo "    - .claude/commands/triage.md"
echo "    - .claude/commands/security-scan.md"
echo ""
echo "==> Verify MCP tools:"
claude mcp list
echo ""
echo "==> Done. Open Claude Code and try: /deploy-lifecycle staging"
