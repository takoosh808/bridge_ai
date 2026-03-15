# Bridge Deployment Runbook

## Scope
- Deploy Bridge API with Docker Compose using file-backed secrets.
- Cover staging and production baseline rollout, verification, and rollback.

## Prerequisites
- Docker Engine + Docker Compose available on target host.
- Network access from target host to Postgres, Redis, and GitHub APIs.
- Secret files available on host and mounted to `/run/secrets`.
- Environment file prepared from:
  - `.env.staging.example` for staging
  - `.env.production.example` for production

## Required Secret Files
- `/run/secrets/webhook_secret`
- `/run/secrets/github_token`
- `/run/secrets/openai_api_key` (optional)
- `/run/secrets/admin_api_token_hash`
- `/run/secrets/admin_api_token_pepper` (recommended)

## Staging Rollout
Quick helper option:
- `./scripts/deploy_staging.ps1 -UseStagingTemplate -AdminToken "<admin-token>"`

1. Copy template:
   - `cp .env.staging.example .env`
2. Fill non-secret values in `.env`:
   - `DATABASE_URL`, `REDIS_URL`, rate limits, retention values.
3. Ensure secret files are present and mounted read-only.
4. Deploy:
   - `docker compose up -d --build`
5. Verify:
   - `curl -i http://localhost:8000/health`
   - `curl -i http://localhost:8000/admin/`
   - `curl -i http://localhost:8000/admin/overview` (expect `401`)
   - `curl -i -H "x-admin-token: <token>" http://localhost:8000/admin/overview` (expect `200`)

## Production Rollout
1. Copy template:
   - `cp .env.production.example .env`
2. Fill infra values:
   - Managed Postgres/Redis endpoints and credentials.
3. Confirm secrets are mounted from secure host path.
4. Deploy:
   - `docker compose pull`
   - `docker compose up -d --build`
5. Post-deploy checks:
   - Health endpoint returns `200`.
   - Admin overview returns `401` without token and `200` with token.
   - Verify recent entries in `admin_audit_logs`.

## Rollback Procedure
1. Identify last known good image/tag or commit.
2. Re-deploy previous version:
   - `docker compose up -d --build`
3. Re-run post-deploy checks.
4. If issue is secret/config driven, restore previous `.env` and secret files.

## Ops Checklist
- Rotate admin token periodically:
  - `./scripts/setup_secrets.ps1 -Force`
  - redeploy services
- Rotate GitHub token on schedule and update `/run/secrets/github_token`.
- Run manual retention if needed:
  - `POST /admin/retention/run` with admin token header.
