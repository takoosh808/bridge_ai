# Acceptance Criteria (MVP)

## Core Functionality
- Receives GitHub PR merged webhook and validates signature
- Fetches PR diff and metadata successfully
- Generates short, PM, and exec summaries
- Posts summary as a PR comment
- Stores summary + metadata in database

## Quality
- Summaries avoid raw code and secrets
- At least one technical category and one business dimension per summary
- Output conforms to output schema v1

## Reliability
- Retries transient failures and logs them
- No duplicate PR comments for the same merge
- Handles empty or minimal diffs gracefully

## Performance
- End-to-end processing time under 5 minutes for 90% of PRs
- Queue backlog stays under threshold during typical load

## Search (Optional)
- Search filters return expected results for category + keyword
- Search results link back to PRs

## Observability
- Logs include repo, PR number, and job id
- Metrics available for success rate and failure rate

## Demo Readiness
- Demo shows at least 5 real PR examples
- PMs and Sales report summaries as useful in feedback