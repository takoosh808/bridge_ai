# MVP Scope Lock

## Search
- **Decision**: Defer to Phase 2
- **Rationale**: Focus on core flow (webhook → summary → comment)

## Business Dimensions (MVP Coverage)
- Elastic Scalability & Availability
- Frictionless Time to Value
- Cyber-Resilience & Zero-Trust

**Note**: Labeler will map all other technical changes to closest match or `No Direct Impact`.

## Raw Diff Storage
- **Decision**: Store summaries only
- **Rationale**: Simplifies data privacy, faster iteration

## Retention Policy
- **Default**: 30 days
- **Override**: Configurable per repo

## MVP Features
- Webhook receiver validation
- Diff fetch and normalization
- AI prompt pipeline
- Schema validation
- PR comment post
- Database storage (summaries + metadata)
- Structured logging and metrics

## Phase 2+ Features
- Search + query API
- Slack notifier
- Digest scheduler
- Extended business dimension coverage
- Raw diff storage (optional)
- Analytics dashboard
