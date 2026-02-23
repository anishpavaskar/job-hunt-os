Run security review across: $ARGUMENTS

**Read before editing. Check these files:**
- `.github/workflows/*.yml` — CI/CD pipeline security
- `ops/k8s/**/*.yaml` — Kubernetes manifest security
- `Dockerfile` + `.dockerignore` — container security

**Checklist (output findings with severity: critical/high/medium/low):**

CI/CD:
- Workflow permissions use least privilege?
- OIDC for cloud auth (no static keys)?
- Secrets not echoed to logs?
- Third-party actions pinned to SHA?
- Production deploy uses environment protection rules?

Kubernetes:
- `automountServiceAccountToken: false`?
- No cluster-admin bindings for app workloads?
- Resource limits set?
- No hardcoded secrets in manifests?

Container:
- Non-root USER?
- Multi-stage build?
- .dockerignore excludes .env, .git, node_modules?
- No secrets in build args or layers?

**If swarm active**, use mesh topology + 3 specialist agents in parallel.
