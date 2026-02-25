# Bridge Architecture

## Architecture Flow

```mermaid
flowchart TD
  A[GitHub PR Merged] --> B[Webhook Receiver (Node/Express)]
  B --> C[Queue/Buffer (Redis)]
  C --> D[Worker]
  D --> E[Diff Processor]
  E --> F[AI Impact Engine]
  F --> G[Classification Layer]
  G --> H[Business Translation Engine]
  H --> I[(PostgreSQL)]
  H --> J[PR Comment Publisher]
  I --> P[Search Index]

  B -.-> K[Idempotency Store]
  D -.-> L[Rate Limit + Retry]
  H -.-> M[Slack Notifier]
  I -.-> N[Analytics Service]
  I -.-> Q[Search API]
  O[Digest Scheduler] -.-> M
  P -.-> Q
```

## One-Page System Spec

### Purpose
Bridge converts merged PR diffs into business-readable summaries for non-technical stakeholders (PMs and Sales). It translates technical changes into impact categories and standardized narrative formats, then posts summaries back to the PR and stores them for analytics and search.

### Scope (MVP)
- Trigger: GitHub PR merged webhook
- Inputs: PR metadata + diff
- Outputs: short summary, PM summary, executive summary
- Actions: post PR comment, persist summary + metadata

### Primary Users
- Product Managers, Sales
- Secondary: Executives, CTOs, Engineering Managers

### Core Components (Responsibilities)
- Webhook Receiver: validates signature, parses event, enqueues job
- Queue/Buffer: smooths bursts, decouples ingestion from processing
- Worker: executes jobs asynchronously and isolates processing from the public edge
- Diff Processor: fetches and normalizes diff, trims noise, controls size limits
- AI Impact Engine: calls LLM, extracts findings and impact cues
- Classification Layer: maps findings to technical and business dimensions
- Business Translation Engine: formats summaries by audience and tone
- Database: stores outputs + metadata for retrieval and analytics
- PR Comment Publisher: posts summaries to GitHub as PR comments

### Optional Components
- Idempotency Store: prevents duplicate processing and double comments
- Rate Limit + Retry: protects GitHub and LLM calls with backoff
- Slack Notifier: posts summaries to Slack channels
- Digest Scheduler: produces weekly executive summaries
- Analytics Service: aggregates trends, impact scores, and usage
- Search Index + API: enables queries by category, product area, or impact

### Data Flow
1) GitHub posts webhook on PR merge
2) Receiver validates, enqueues job
3) Processor fetches diff, normalizes and reduces size
4) AI engine analyzes changes
5) Classification layer standardizes categories
6) Translation engine produces three summary formats
7) Database stores results
8) Search index updates
9) Publisher posts comment to PR

### Output Schema (Proposed)
- `summary_id`: stable id for the summary (UUID)
- `repo`: full repo name (org/name)
- `pr_number`: numeric PR id
- `pr_url`: PR link
- `merged_at`: merge timestamp (ISO 8601)
- `commit_range`: from/to commit sha
- `diff_stats`: files changed, additions, deletions
- `technical_categories`: list of technical categories with confidence
- `business_dimensions`: list of business dimensions with confidence
- `business_dimension_sources`: optional tags mapped from the business framework
- `impact_score`: optional numeric score (0-100)
- `short_summary`: 1-2 sentences
- `pm_summary`: short paragraph for PMs
- `exec_summary`: short paragraph for execs
- `risks`: list of notable risks or caveats
- `customer_impact`: short statement of customer-facing effect
- `evidence`: brief citations like file paths or module names (no raw code)
- `search_tags`: list of tags used by the search API
- `model`: model id and version used
- `created_at`: summary timestamp (ISO 8601)

### Output Schema (Example)
```json
{
  "summary_id": "0df5a0ab-79ff-4b4b-9d45-7b5f7d3c1b2a",
  "repo": "acme/payments",
  "pr_number": 482,
  "pr_url": "https://github.com/acme/payments/pull/482",
  "merged_at": "2026-02-14T18:22:41Z",
  "commit_range": {
    "from": "9b2c1a4",
    "to": "f7d0e11"
  },
  "diff_stats": {
    "files_changed": 6,
    "additions": 142,
    "deletions": 88
  },
  "technical_categories": [
    {"name": "Performance", "confidence": 0.87},
    {"name": "Infrastructure", "confidence": 0.64}
  ],
  "business_dimensions": [
    {"name": "Cost Efficiency", "confidence": 0.78},
    {"name": "Customer Retention", "confidence": 0.52}
  ],
  "business_dimension_sources": ["Elastic Scalability & Availability"],
  "impact_score": 72,
  "short_summary": "Reduced API latency by optimizing cache reads in the payments service.",
  "pm_summary": "This change streamlines cache access paths in the payments API, improving response time during peak checkout traffic.",
  "exec_summary": "Performance gains reduce infrastructure strain and improve conversion reliability during high-traffic periods.",
  "risks": ["Cache invalidation logic updated; monitor error rate post-deploy."],
  "customer_impact": "Faster checkout responses for high-volume users.",
  "evidence": ["services/payments/cache", "api/handlers/checkout"],
  "search_tags": ["performance", "checkout", "cache"],
  "model": {
    "provider": "openai",
    "name": "gpt-4.1",
    "version": "2026-02-01"
  },
  "created_at": "2026-02-14T18:23:10Z"
}
```

### Data & Privacy
- Store summaries + metadata by default
- Store raw diffs by default, except for excluded files and paths
- Exclusion list configured by path patterns (e.g., secrets, keys, credentials)
- Retention policy configurable
- See Business Dimensions framework in ../Business_Dimensions.md

### Search Queries (Examples)
- Find all performance-related improvements in checkout: `category:Performance AND tag:checkout`
- Show PRs tied to cost efficiency in Q1: `dimension:Cost%20Efficiency AND merged_at:[2026-01-01 TO 2026-03-31]`
- List user-impacting changes in mobile apps: `dimension:Customer%20Retention AND tag:mobile`
- Security-related PRs with high impact score: `category:Security AND impact_score:>=80`

### Exclusion List Format (Raw Diff Storage)
Store raw diffs by default and skip paths that match exclusion rules. Example format:

```yaml
diff_storage:
  enabled: true
  exclude_paths:
    - "**/secrets/**"
    - "**/*.pem"
    - "**/*.key"
    - "**/credentials/**"
    - "**/.env"
    - "**/private/**"
    - "**/id_rsa*"
```

### Business Dimensions Taxonomy (Classifier Targets)
Map summaries to this taxonomy and attach a confidence score.

| Dimension | Definition | Example Signals | Typical Stakeholder Angle |
| :--- | :--- | :--- | :--- |
| High-Frequency Engagement | Increases daily/weekly product use | onboarding nudges, notification tuning | retention and habit formation |
| Elastic Scalability & Availability | Improves uptime, latency, or capacity | caching, autoscaling, load balancing | reliability and enterprise readiness |
| Frictionless Time to Value | Reduces time to first success | setup simplification, guided flows | faster adoption and conversion |
| Compounding Network Effects | More users increase overall value | sharing, collaboration features | growth and defensibility |
| Multi-Vector Monetization | Enables new revenue streams | billing tiers, usage metering | revenue expansion |
| Full-Stack Vertical Integration | Controls infra stack or platform | custom infra, platform tooling | cost and performance control |
| Proprietary Data Sovereignty | Builds unique first-party data | telemetry, usage analytics | model quality and moat |
| Cyber-Resilience & Zero-Trust | Security hardening and compliance | auth, encryption, auditing | risk reduction and trust |
| Agentic AI Automation | Automates ops or workflows | AI agents, auto-remediation | scaling without headcount |
| Open Standards Leadership | Drives ecosystem adoption | SDKs, open APIs, OSS tooling | ecosystem growth |

### Taxonomy Mapping Example (Output Fields)
Input signals: technical category `Performance`, mentions cache optimization and reduced latency in checkout.

Mapped output fields:
```json
{
  "technical_categories": [
    {"name": "Performance", "confidence": 0.86}
  ],
  "business_dimensions": [
    {"name": "Elastic Scalability & Availability", "confidence": 0.72},
    {"name": "Customer Retention", "confidence": 0.48}
  ],
  "business_dimension_sources": [
    "Elastic Scalability & Availability",
    "High-Frequency Engagement"
  ],
  "customer_impact": "Faster checkout responses during peak usage.",
  "search_tags": ["performance", "checkout", "cache"]
}
```

### Failure Handling
- Validate webhook signature and drop invalid events
- Retry transient GitHub/LLM errors with backoff and jitter
- Circuit breaker for repeated model failures
- Dead-letter queue for repeated failures with replay tooling
- Idempotency on PR events to prevent duplicate comments
- Fallback summary when diff fetch fails (PR title + description)
- Alerting on sustained failure rates or queue backlogs

### Observability
- Structured logs with PR id and job id
- Metrics: processing time, summary success rate, retry rate, queue lag
- Traces across ingestion, worker, and publisher

### Success Criteria
- PM and Sales rate summaries as useful in quick feedback surveys
- Summary posted within target SLA (e.g., < 5 minutes)
- Low manual edits needed by teams
- Search adoption: queries per week and repeat usage
- Coverage: % of merged PRs summarized successfully
