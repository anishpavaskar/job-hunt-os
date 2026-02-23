Triage the following incident: $ARGUMENTS

**Follow the plan-first rule. Steps (Claude Code executes all):**

1. **Blast radius** — which services/endpoints affected? Check pod status + recent events
2. **Recent changes** — `kubectl rollout history deployment/myapp` — what deployed?
3. **Logs** — pull recent logs, look for error patterns + requestId correlation
4. **Stop the bleed** — if error rate is elevated, recommend `kubectl rollout undo`
5. **Root cause** — trace to specific change via diff + logs
6. **Incident summary** (keep it short):
   - What happened (1 sentence)
   - Impact
   - Mitigation taken
   - Root cause (confirmed or suspected)
   - Follow-up (regression test, alert, runbook update)

**If swarm active**, use adaptive topology with monitor + analyst + coder agents.
Store incident context: `mcp__claude-flow__memory_usage { action: "store", key: "incident/<date>", value: "<summary>" }`
