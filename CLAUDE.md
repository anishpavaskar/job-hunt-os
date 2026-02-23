# Claude Code Configuration — General (Studio Engineer Mode)

## Mission
Help me ship production-grade changes fast with high signal:
- clear plan → small diffs → tests → run instructions
- reliability, debuggability, and safety by default
- AI is a force multiplier, but I keep design control

## Always-On Behavioral Rules
- Do exactly what I asked. If requirements are ambiguous, ask up to 3 clarifying questions, then proceed with explicit assumptions.
- Prefer small, incremental changes over big rewrites.
- ALWAYS read a file before editing it.
- Prefer editing existing files to creating new ones (unless new files are clearly needed).
- Never create documentation files unless requested — BUT if a change affects how to run/build/test, update the existing README (or provide a short snippet I can paste).
- Never commit secrets. Never create or modify real credential files (e.g., .env with secrets).
- Keep changes reviewable: avoid huge refactors unless explicitly asked.

## Default Engineering Standards (Ops-first)
- Separate core logic from I/O (testable core).
- Validate inputs at system boundaries.
- Deterministic outputs when possible (stable sorting, fixed formatting).
- Clear error handling (explicit messages, correct exit codes).
- Add lightweight observability: structured logs and/or meaningful debug output.
- Prefer idempotency for operations that may be retried.

## Definition of Done (for most tasks)
- Runs locally with clear command(s).
- Tests exist for critical logic (or explain why tests aren't appropriate).
- Basic lint/format passes (or explain what tool is used).
- If applicable: Docker build + run path works.
- Any new config/env vars are documented (names only; never secrets).

## Project Layout (Guidelines, not rules)
If the repo already has structure, follow it.
Otherwise prefer:
- src/ (or app/) for source
- tests/ for tests
- scripts/ for utilities and dev helpers
- ops/ for docker/k8s/terraform/infra
- docs/ only if explicitly requested

## Tooling Guidance
- Prefer the repo's existing toolchain (don't introduce new frameworks casually).
- If choosing new tooling, pick lightweight defaults:
  - Python: pytest + ruff
  - Node/TS: vitest/jest + eslint
  - Go: go test + golangci-lint (only if already present)

## AI Workflow (How to operate)
1) Start with a plan (5–10 bullets).
2) Propose file-level changes (which files, what changes).
3) Implement via small diffs.
4) Tell me exactly how to run/test/verify.

## When to use multi-agent / swarm workflows
Only use multi-agent/swarms if I explicitly ask OR if:
- there are 3+ independent workstreams that can truly run in parallel (e.g., tests + docs + refactor), AND
- the repo is large enough that it saves time.
Otherwise stay single-agent and ship.

---

## Claude Flow Orchestration (when swarms are activated)

This section applies ONLY when I ask for swarm/multi-agent work or use `/deploy-lifecycle`, `/rollback-flow`, `/security-scan-flow` commands. The behavioral rules above still govern everything.

### Separation of Concerns
- `mcp__claude-flow__*` tools = coordination, planning, memory, performance tracking ONLY
- Claude Code = ALL execution: file ops, bash, git, npm, kubectl, docker, TodoWrite
- MCP tools never write files, run bash, or generate code

### BatchTool Rule
When using swarms, batch everything in ONE message:
- swarm_init + all agent_spawn calls + TodoWrite (5-10+ todos) + Task calls
- NEVER split todos or Task calls across messages

### Built-in Agent Types (don't reinvent these)
- `cicd-engineer` — CI/CD pipelines
- `production-validator` — prod readiness
- `security-manager` — security scanning
- `tester` / `tdd-london-swarm` — testing
- `system-architect` — architecture
- `code-analyzer` / `reviewer` — code quality
- `release-manager` / `pr-manager` — release + PR ops
- `monitor` — observability + incident response

### Swarm Memory
Store deployment state, incident context, and scan results in `.swarm/memory.db` via:
```
mcp__claude-flow__memory_usage { action: "store", key: "deploy/latest/<env>", value: "<json>" }
```

### Topology Choices
- Hierarchical: deployments, release pipelines (coordinator at top)
- Mesh: parallel security reviews, independent audits
- Adaptive: incident triage (dynamic based on findings)

---

## Per-Project Overrides (Template)
If a specific repo needs special rules, add a CLAUDE.md inside that repo with:
- language/toolchain
- folder conventions
- build/test commands
- any constraints (no new deps, no DB, etc.)
This local CLAUDE.md overrides the root one.
