# Output Schema v1

## Goals
- Stable fields for storage, search, and PR comments
- Consistent structure for PM and Sales summaries
- Extensible for scoring and analytics

## Field Definitions
### Identity
- `summary_id` (string, required): UUID for the summary
- `repo` (string, required): org/name
- `pr_number` (number, required)
- `pr_url` (string, required)
- `merged_at` (string, required): ISO 8601 timestamp
- `commit_range` (object, optional)
  - `from` (string)
  - `to` (string)

### Diff Metadata
- `diff_stats` (object, required)
  - `files_changed` (number)
  - `additions` (number)
  - `deletions` (number)
- `evidence` (array[string], optional): file paths or modules (no raw code)

### Classification
- `technical_categories` (array[object], required)
  - `name` (string)
  - `confidence` (number, 0-1)
- `business_dimensions` (array[object], required)
  - `name` (string)
  - `confidence` (number, 0-1)
- `business_dimension_sources` (array[string], optional): taxonomy labels
- `impact_score` (number, optional): 0-100

### Summaries
- `short_summary` (string, required): 1-2 sentences
- `pm_summary` (string, required): 1-2 sentences
- `exec_summary` (string, required): 1-2 sentences
- `customer_impact` (string, optional)
- `risks` (array[string], optional)

### Search + Audit
- `search_tags` (array[string], optional)
- `model` (object, optional)
  - `provider` (string)
  - `name` (string)
  - `version` (string)
- `created_at` (string, required): ISO 8601 timestamp

## Required vs Optional
- Required: `summary_id`, `repo`, `pr_number`, `pr_url`, `merged_at`, `diff_stats`, `technical_categories`, `business_dimensions`, `short_summary`, `pm_summary`, `exec_summary`, `created_at`
- Optional: everything else

## Validation Rules
- At least one technical category and one business dimension
- Confidence values in 0-1
- Summaries must not include raw code or secrets
- `impact_score` only when confidence is adequate (>= 0.6)

## Example (Abbreviated)
```json
{
  "summary_id": "0df5a0ab-79ff-4b4b-9d45-7b5f7d3c1b2a",
  "repo": "acme/payments",
  "pr_number": 482,
  "pr_url": "https://github.com/acme/payments/pull/482",
  "merged_at": "2026-02-14T18:22:41Z",
  "diff_stats": {"files_changed": 6, "additions": 142, "deletions": 88},
  "technical_categories": [{"name": "Performance", "confidence": 0.87}],
  "business_dimensions": [{"name": "Elastic Scalability & Availability", "confidence": 0.72}],
  "short_summary": "Reduced checkout latency by optimizing cache reads.",
  "pm_summary": "This update introduces a read-through cache for checkout requests.",
  "exec_summary": "Performance gains improve checkout reliability.",
  "created_at": "2026-02-14T18:23:10Z"
}
```
