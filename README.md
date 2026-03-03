# Bridge AI (Docker Workflow)

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

## Local Secret Manager Pattern
- Recommended: keep real secrets in local `.secrets/*` files (gitignored), not in `.env`
- The API supports `*_FILE` variables for secrets:
	- `WEBHOOK_SECRET_FILE`
	- `GITHUB_TOKEN_FILE`
	- `OPENAI_API_KEY_FILE`
	- `ADMIN_API_TOKEN_HASH_FILE`
	- `ADMIN_API_TOKEN_PEPPER_FILE`
- Compose mounts `.secrets` into container as `/run/secrets`
- See setup guide: `secrets.example/README.md`
- One-command local setup:
	- `./scripts/setup_secrets.ps1`
	- Optional overwrite and custom inputs:
		- `./scripts/setup_secrets.ps1 -Force -WebhookSecret "..." -GithubToken "..." -OpenAiApiKey "..." -AdminToken "..." -AdminPepper "..."`
	- Script prints generated admin token; use it in dashboard token field / `x-admin-token` header

## Admin Auth
- Admin APIs use header auth: `x-admin-token` (never query params)
- Dashboard supports optional token remember in current browser tab (`sessionStorage`) and `Sign Out` token clearing
- Server stores only `ADMIN_API_TOKEN_HASH` (digest hex of token)
- Modes:
	- SHA-256 mode (default): set `ADMIN_API_TOKEN_HASH` only
	- HMAC-SHA256 mode (recommended): set `ADMIN_API_TOKEN_HASH` and `ADMIN_API_TOKEN_PEPPER`
- Example digest generation (PowerShell):
	- `$token = "change-me-to-long-random"`
	- `$pepper = "change-me-to-server-only-secret"`
	- `$h = New-Object System.Security.Cryptography.HMACSHA256([System.Text.Encoding]::UTF8.GetBytes($pepper))`
	- `$hash = [System.BitConverter]::ToString($h.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token))).Replace("-", "").ToLower()`
	- Set `.env` values: `ADMIN_API_TOKEN_HASH=$hash` and `ADMIN_API_TOKEN_PEPPER=$pepper`

## Security Controls
- Route-level rate limiting is enabled:
	- `/admin/*` via `ADMIN_RATE_LIMIT_WINDOW_MS` and `ADMIN_RATE_LIMIT_MAX`
	- `/webhook/*` via `WEBHOOK_RATE_LIMIT_WINDOW_MS` and `WEBHOOK_RATE_LIMIT_MAX`
- Admin security events are audit-logged to stdout and persisted in Postgres table `admin_audit_logs`

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
