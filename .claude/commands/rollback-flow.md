Execute rollback for environment: $ARGUMENTS

**Steps (Claude Code executes all):**
1. `kubectl rollout status deployment/myapp -n $ARGUMENTS`
2. `kubectl rollout history deployment/myapp -n $ARGUMENTS`
3. `kubectl rollout undo deployment/myapp -n $ARGUMENTS`
4. `kubectl rollout status deployment/myapp -n $ARGUMENTS --timeout=120s`
5. `kubectl get pods -n $ARGUMENTS -l app=myapp`
6. Verify health endpoint

**If swarm active**, spawn monitor + analyst agents and store rollback context in swarm memory:
```
mcp__claude-flow__memory_usage { action: "store", key: "rollback/$ARGUMENTS", value: "<result json>" }
```

**Output:** What version we rolled back to, pod status, health check result.
