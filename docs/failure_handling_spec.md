# Failure Handling Spec

## Goals
- Prevent duplicate comments and missed summaries
- Recover from transient failures without manual intervention
- Surface persistent failures quickly

## Failure Types
- Webhook validation failure
- Diff fetch failure (GitHub API)
- Model failure (timeout, rate limit, invalid output)
- Database write failure
- Publisher failure (comment post)

## Retry Policy
- Use exponential backoff with jitter
- Max attempts: 5 for external services
- Retryable: 429, 5xx, timeouts
- Non-retryable: 401/403, invalid payloads

## Idempotency
- Use `repo + pr_number + merged_sha` as the idempotency key
- Store key on successful publish to prevent duplicate comments

## Dead-Letter Queue (DLQ)
- Send jobs to DLQ after max retries
- Include failure reason, timestamps, and payload summary
- Provide a replay tool for operators

## Fallbacks
- If diff fetch fails, use PR title + description only
- If model output invalid, re-prompt with schema errors
- If publisher fails, store summary and retry publish

## Alerts
- Trigger alert on:
  - DLQ size > threshold
  - Publish failure rate > 5% in 1 hour
  - Average processing time exceeds SLA

## Observability
- Log correlation id per PR
- Track retry counts and final status
- Emit metrics for each failure type
