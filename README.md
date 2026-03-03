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

## Notes
- Docker Compose file is at repo root: `docker-compose.yml`
- API Dockerfile is at `docker/Dockerfile`
- Environment values are read from `.env`
