# Bridge AI (Docker Workflow)
### Description of project and reflection in project_reflection.md
## Project Overview
Bridge AI is a webhook-driven backend service that turns merged GitHub pull requests into business-friendly summaries for non-engineering stakeholders.

### What It Does
- Receives and verifies GitHub webhook events.
- Processes merged PR data and normalizes technical changes.
- Generates structured summaries and stores them in Postgres.
- Exposes admin APIs and a dashboard for operations, observability, and retention.

### Core Stack
- API: Node.js + Express
- Data: PostgreSQL
- Runtime support: Redis
- Delivery: Docker Compose + GitHub Actions CI

### Current Status
- Local end-to-end workflow is running and testable.
- Security controls include admin token auth, rate limiting, and audit logs.
- Admin dashboard includes overview metrics, observability, and audit log filters.

## Installation

### Prerequisites
- **Node.js**: v20+ (required for scripts; Docker image uses Node 20 Alpine)
- **Docker & Docker Compose**: Latest stable versions
- **Available Ports**: `8000` (API), `5432` (PostgreSQL), `6379` (Redis), `5555` (adminer, optional)
- **GitHub Token** (optional): For webhook processing; set `GITHUB_TOKEN` to enable upstream PR data enrichment

### Environment Setup
Before launching, configure your `.env` file:

1. **Copy the example template**:
   ```powershell
   Copy-Item .env.example .env
   ```

2. **Edit `.env` for your environment**:
   - `ADMIN_TOKEN`: Set a secure random string (e.g., 32+ chars); used to authenticate dashboard and admin APIs
   - `GITHUB_WEBHOOK_SECRET`: Set to match your GitHub webhook secret (press "Regenerate" in GitHub repo settings → Webhooks)
   - `DATA_RETENTION_DAYS`: Default `30`; adjust for your retention policy
   - `RETENTION_CLEANUP_INTERVAL_MINUTES`: Default `360` (6 hours); cleanup frequency
   - `GITHUB_TOKEN` (optional): If set, enriches summaries with PR author and approver data

3. **Generate initial secrets** (populates derived values):
   ```powershell
   ./scripts/setup_secrets.ps1 -Force
   ```
   This creates a `.secrets` file with bootstrapped values; **save the printed admin token** for dashboard access.

## Launch

### Start the Stack
From the repo root:
```powershell
docker compose up --build
```

**Expected output** (watch for these confirmations):
```
bridge-api-1        | Server running on port 8000
bridge-postgres-1   | database system is ready to accept connections
bridge-redis-1      | Ready to accept connections
```

Once all three services show ready status, the API is running.

### Health Check
Verify the API is responding:
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/health
```
Expected: `200 OK` with JSON body.

### Access the Dashboard
1. Open `http://localhost:8000/admin/` in your browser
2. Paste the admin token from `setup_secrets.ps1` output
3. Click `Check Auth` → `Refresh` to load metrics

### Stop the Stack
```powershell
docker compose down        # Keeps data
docker compose down -v     # Removes data & volumes
```

## Run (from repo root)
- Start: `docker compose up --build`
- Stop and remove data: `docker compose down -v`

## Services
- API: `http://localhost:8000`
- Health: `http://localhost:8000/health`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Useful Endpoints
- `GET /health`
- `GET /summary/:summaryId`
- `GET /webhook/events?idempotencyKey=<repo#pr#merge_sha>`
- `GET /webhook/dead-letters?limit=20`
- `GET /admin/` (dashboard page)
- `GET /admin/overview` (requires `x-admin-token`)
- `GET /admin/recent-webhooks?limit=10` (requires `x-admin-token`)
- `GET /admin/observability` (requires `x-admin-token`)
- `GET /admin/auth/check` (requires `x-admin-token`)
- `GET /admin/audit-logs?limit=50` (requires `x-admin-token`)
	- Supports optional filters: `action` and `outcome`
- `POST /admin/retention/run`

## Notes
- Docker Compose file is at repo root: `docker-compose.yml`
- API Dockerfile is at `docker/Dockerfile`
- Environment values are read from `.env` and optional file-backed `*_FILE` variables

## Observability
- In-memory request telemetry tracks:
	- total requests and error count
	- error rate, avg latency, p95 latency
	- recent request list (method, path, status, duration)
- Data is exposed to admins at `GET /admin/observability` and rendered in the admin dashboard.

## CI
- GitHub Actions workflow: `.github/workflows/ci.yml`
- On push and pull request, CI:
	- bootstraps local `.secrets` values for the runner
	- runs `docker compose up -d --build`
	- smoke-checks `/health`, `/admin/`, and admin auth behavior (`401` without token, `200` with token)
	- validates `/admin/auth/check`, `/admin/observability`, and `/admin/audit-logs` (including filter query)
	- tears down containers with `docker compose down -v`

## Retention
- Default retention: `30` days
- Scheduler interval: every `360` minutes (6 hours)
- Configure with:
	- `DATA_RETENTION_DAYS`
	- `RETENTION_CLEANUP_INTERVAL_MINUTES`

## Day-1 Handoff
- 1) Bootstrap local secrets:
	- `./scripts/setup_secrets.ps1 -Force`
	- Save the printed admin token for dashboard/API auth
- 2) Start stack:
	- `docker compose up -d --build`
- 3) Quick health check:
	- `Invoke-WebRequest -UseBasicParsing http://localhost:8000/health`
- 4) Open dashboard:
	- `http://localhost:8000/admin/`
	- Enter the printed admin token, click `Check Auth`, then `Refresh`
- 5) API auth check:
	- `$headers = @{ "x-admin-token" = "<admin-token>" }`
	- `Invoke-WebRequest -UseBasicParsing http://localhost:8000/admin/overview -Headers $headers`
- 6) Stop stack:
	- `docker compose down`

## Sprint Summary
- Sprint recap and status are tracked in `docs/sprint_summary.md`.

## Deployment
- Environment templates:
	- `.env.staging.example`
	- `.env.production.example`
- Deployment and rollback runbook:
	- `docs/deployment_runbook.md`
- Staging helper script:
	- `./scripts/deploy_staging.ps1 -UseStagingTemplate -AdminToken "<admin-token>"`
