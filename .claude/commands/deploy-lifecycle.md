Execute the deployment lifecycle for: $ARGUMENTS

Follow the AI Workflow rule: plan first, then execute.

**Plan:**
1. Run quality gates (lint + test)
2. Build container image tagged with git SHA
3. Security-scan manifests + pipeline (if swarm active, use security-manager agent)
4. Deploy to target environment
5. Verify rollout + health
6. Output rollback command

**Execute (Claude Code does all actual work):**
- `npm run lint`
- `npm test`
- `docker build -t myapp:$(git rev-parse --short HEAD) .`
- `docker run --rm -p 8080:3000 myapp:$(git rev-parse --short HEAD)` then `curl -f http://localhost:8080/healthz`
- Show: `kubectl apply -f ops/k8s/$ARGUMENTS/`
- Show: `kubectl rollout status deployment/myapp -n $ARGUMENTS --timeout=120s`
- Show: `kubectl rollout undo deployment/myapp -n $ARGUMENTS` (rollback)
- `git diff main...HEAD --stat` (what changed)

**If swarm mode is active**, use BatchTool pattern:
```
mcp__claude-flow__swarm_init { topology: "hierarchical", maxAgents: 5, strategy: "cicd_pipeline" }
mcp__claude-flow__agent_spawn { type: "tester", name: "QA" }
mcp__claude-flow__agent_spawn { type: "specialist", name: "Security" }
mcp__claude-flow__agent_spawn { type: "monitor", name: "SRE" }
```
Then batch ALL todos + tasks in one message. MCP coordinates, Claude Code executes.
