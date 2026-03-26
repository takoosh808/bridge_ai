# Sprint 4 Plan: Production Readiness

**Sprint Dates**: March 23 – April 6, 2026  
**Focus**: Deploy with confidence; add preflight validation, health monitoring, stricter CI gates, and rollback procedures.

---

## Context: Sprint 3 Completion

Sprint 3 delivered:
- ✅ Rate limiting on `/admin/*` and `/webhook/*` routes
- ✅ Persisted admin audit logging (Postgres + stdout)
- ✅ GitHub Actions CI with smoke tests
- ✅ Deployment environment templates (staging/production)
- ✅ In-memory observability metrics and dashboard
- ✅ Admin UX: auth check, session storage, audit log filters
- ✅ Full workflow validation (12/12 tests passing locally)

**Current State**: Feature-complete; ready for production hardening.

---

## Sprint 4 Objectives

1. **Preflight Validation** — Catch configuration/dependency errors before deployment
2. **Health Monitoring Baseline** — Dashboard indicators for system status (green/yellow/red)
3. **CI Reliability Gates** — Stricter CI checks to prevent bad deployments
4. **Rollback Procedures** — Safe recovery from failed deployments with verification

---

## Workstream 1: Preflight Validation Script

**Goal**: Create a PowerShell script that validates the environment before production deployment.

### Requirements
- Check Node.js and Docker installation + versions
- Validate `.env` file completeness (no missing required vars)
- Test database connectivity (Postgres, Redis)
- Verify required ports are available (8000, 5432, 6379)
- Health check after startup
- Token rotation readiness (deriving tokens from secrets)

### Acceptance Criteria
- [ ] `./scripts/preflight_check.ps1` exists and is executable
- [ ] Script validates prerequisites (Docker v23+, Node v20+)
- [ ] Script reports missing or invalid config variables
- [ ] Script performs connectivity tests to all 3 services
- [ ] Script exits with non-zero code on validation failure
- [ ] Script provides clear, actionable error messages
- [ ] Used by CI before production deploy and `deploy_staging.ps1`

### Implementation Details
```powershell
# scripts/preflight_check.ps1

[CmdletBinding()]
param(
    [switch]$Verbose
)

function Write-Status {
    param([string]$message, [string]$status = "INFO")
    $colors = @{ "PASS" = "Green"; "FAIL" = "Red"; "INFO" = "White"; "WARN" = "Yellow" }
    Write-Host "[$status] $message" -ForegroundColor $colors[$status]
}

# 1. Check Docker
# 2. Check Node.js (if scripts directory used)
# 3. Validate .env exists and has required vars
# 4. Verify ports available
# 5. Report findings, exit with status code
```

---

## Workstream 2: Health Monitoring Baseline

**Goal**: Add dashboard status indicators showing system health (green/yellow/red).

### Requirements
- `/admin/health` endpoint returning dependency status
- Dashboard panel showing service states: API, Postgres, Redis, webhooks
- Color coding: green (healthy), yellow (degraded), red (down)
- Alert if any dependency is unavailable for > 5 minutes
- Metrics include: response time, error rate, last webhook processed time

### Acceptance Criteria
- [ ] `GET /admin/health` returns JSON with dependency statuses
- [ ] Dashboard displays visual health indicators with last-check timestamp
- [ ] Health check runs every 30 seconds in-memory
- [ ] Service degradation tracked per dependency (yellow = slow/partial, red = unavailable)
- [ ] Admin audit logs record dependency state changes
- [ ] Preflight script uses `/admin/health` for post-deploy verification

### Implementation Details
```javascript
// src/observability/health.js

module.exports.getHealthStatus = async () => {
  const health = {
    api: { status: "healthy", responseTime: 50, lastCheck: Date.now() },
    postgres: { status: "healthy", poolSize: activeConnections, lag: queryLatency },
    redis: { status: "healthy", memory: usedMemory, operations: opsPerSec },
    webhooks: { lastProcessed: timestamp, backlog: count, errorRate: pct }
  };
  return health;
};
```

---

## Workstream 3: CI Reliability Gates

**Goal**: Strengthen CI to prevent broken deployments.

### Requirements
- Require preflight validation in CI before staging deploy
- Enforce audit log verification (deny events logged)
- Add integration test: webhook → summary → storage flow
- Require observability metrics available to CI runner
- Fail CI if rate limiting not responding correctly
- Fail CI if health check fails post-startup

### Acceptance Criteria
- [ ] Updated `.github/workflows/ci.yml` includes preflight check step
- [ ] CI validates all 3 rate-limit windows work (admin, webhook, global)
- [ ] CI confirms observability metrics collected for post-startup
- [ ] CI runs integration test: POST webhook → GET summary → verify Postgres
- [ ] CI performs `/admin/health` check; fails if any dependency red
- [ ] CI audit log assertions expanded (denial + allowed actions)
- [ ] CI exit code reflects actual pass/fail (not masked errors)

### Implementation Details
```yaml
# .github/workflows/ci.yml

- name: Preflight Validation
  run: ./scripts/preflight_check.ps1

- name: Integration Test
  run: |
    # POST webhook event
    # Wait 2 seconds for processing
    # GET summary endpoint
    # Assert summary exists in Postgres

- name: Health Check
  run: |
    curl -H "x-admin-token: ${{ secrets.ADMIN_TOKEN }}" \
      http://localhost:8000/admin/health | jq .
    # Assert all dependencies are "healthy"
```

---

## Workstream 4: Rollback Procedures & Verification

**Goal**: Define and automate safe rollback with post-rollback validation.

### Requirements
- Document rollback steps (docker compose down, restore `.env`, restart)
- Automated rollback script that validates before reverting
- Post-rollback health verification
- Audit log record of rollback action with reason
- Version tagging strategy to identify deployments
- Safe recovery if admin token leaked or corrupted

### Acceptance Criteria
- [ ] `./scripts/rollback.ps1` exists with clear options
- [ ] Rollback validates current `.env` before reverting (prevents bad state loop)
- [ ] Rollback script includes pre-rollback snapshot of admins/tokens
- [ ] Post-rollback, runs `./scripts/preflight_check.ps1` to confirm health
- [ ] Audit log contains `ADMIN_ACTION: ROLLBACK` with timestamp + reason
- [ ] Docker Compose images tagged with date/commit hash
- [ ] `docs/deployment_runbook.md` updated with rollback decision tree

### Implementation Details
```powershell
# scripts/rollback.ps1

[CmdletBinding()]
param(
    [string]$ToVersion,
    [string]$Reason = "Manual rollback"
)

# 1. Get current deployment tag
# 2. Validate previous version available
# 3. Stop current services
# 4. Restore previous .env from backup
# 5. Start services with previous image tag
# 6. Run preflight_check.ps1
# 7. Log to audit table: "ADMIN_ACTION: ROLLBACK"
```

---

## Workstream 5: Deployment Runbook Updates

**Goal**: Document the complete deployment flow with preflight, health checks, and rollback.

### Requirements
- Step-by-step deployment to staging with preflight validation
- Promotion checklist from staging → production
- Rollback decision tree (when to rollback vs. patch)
- Health monitoring during and after deployment
- Alert escalation (who to notify if health degrades)

### Acceptance Criteria
- [ ] `docs/deployment_runbook.md` includes preflight validation steps
- [ ] Runbook documents the 3 health checks: preflight, post-startup, post-deploy
- [ ] Runbook includes rollback decision tree (availability, error rate, audit logs)
- [ ] Runbook documents staging soak period (24 hours minimum before prod promote)
- [ ] Runbook includes post-rollback verification checklist
- [ ] CI/CD logs automatically exported to `deployment_log_<timestamp>.txt`

---

## Implementation Sequence

### Phase 1: Preflight + Health (Days 1–3)
1. Implement `./scripts/preflight_check.ps1` with full validation
2. Add `/admin/health` endpoint with dependency checking
3. Add health monitoring panel to dashboard
4. Test locally: run preflight, start stack, verify health colors

### Phase 2: CI Hardening (Days 4–5)
1. Update `.github/workflows/ci.yml` to call `preflight_check.ps1`
2. Add integration test (webhook → summary → Postgres)
3. Add health check assertion post-startup
4. Validate CI passes with all new gates

### Phase 3: Rollback + Runbook (Days 6–7)
1. Implement `./scripts/rollback.ps1` with audit logging
2. Add version tagging to Docker images
3. Update `docs/deployment_runbook.md` with decision tree + checklist
4. Document emergency contacts and escalation

### Phase 4: Validation & Deploy (Days 8–10)
1. Dry-run full deployment workflow locally
2. Validate all scripts: preflight, health, rollback, CI
3. Tag release (v1.0.0 or equivalent)
4. Deploy to staging with runbook
5. 24-hour soak period with monitoring
6. Production promotion (if staging stable)

---

## Success Criteria

- [ ] All 4 scripts operational: `preflight_check.ps1`, `deploy_staging.ps1`, `rollback.ps1`, run CI
- [ ] Dashboard shows green/yellow/red status for all dependencies
- [ ] CI pipeline stable with 0 false negatives (no missed failures)
- [ ] Rollback procedure tested and documented
- [ ] `docs/deployment_runbook.md` complete and reviewed
- [ ] Production deployment completed with zero downtime
- [ ] Audit logs record all deployment + rollback actions
- [ ] Post-deploy validation shows all health indicators green

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Preflight script misses validation | Test on fresh VMs; add comprehensive error messages |
| Health check false positives | Define health thresholds carefully (e.g., > 5sec = yellow) |
| Rollback doesn't restore .env correctly | Test rollback on staging first; keep versioned .env backups |
| CI gates too strict, blocking valid deploys | Implement with warnings first; escalate to errors after 1 week |
| Token leakage undetected | Audit log all token operations; implement token rotation strategy |

---

## Sprint 4 Backlog (Post-MVP)

If time permits after completing above:
- [ ] Implement automated token rotation (new token generated daily, old ones deprecated)
- [ ] Add custom alerting integration (Slack/PagerDuty webhook for health degradation)
- [ ] Implement canary deployment (route 10% traffic to new version before full promotion)
- [ ] Build dashboard live-update WebSocket (real-time health, metrics, audit log tail)

---

## Notes for Team

- **Target Environment**: Production deployment to Linux VM with Docker Compose
- **Testing**: All scripts tested locally on Windows PowerShell 5.1 and in CI (bash-compatible)
- **Deployment Window**: Monday–Wednesday, off-peak hours (2 PM–4 PM PST)
- **Monitoring**: First week post-deploy requires daily health review + audit log audit
- **Rollback Trigger**: Availability < 99.5% for > 15 min, or error rate > 5% sustained for > 5 min
