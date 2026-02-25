# PR-to-JSONL Conversion Spec

## Purpose
Define a small utility that converts real PR data into the JSONL training format used by Bridge.

## Inputs
- GitHub repo (single)
- Time window or PR list
- GitHub API token
- Optional exclusion rules for files and paths

## Outputs
- JSONL file matching the training schema used in `docs/training_template.jsonl`
- Optional metadata report (counts by category/dimension)

## Required Fields (Per Line)
- `input.pr_title`
- `input.pr_description`
- `input.diff_summary`
- `input.diff_stats` (files_changed, additions, deletions)
- `input.file_paths`
- `output.technical_categories`
- `output.business_dimensions`
- `output.business_dimension_sources`
- `output.short_summary`
- `output.pm_summary`
- `output.exec_summary`
- `output.risks`
- `output.customer_impact`
- `output.evidence`
- `output.search_tags`

## Processing Steps
1) Fetch PR list for the single repo by date range or explicit IDs.
2) For each PR, pull title, description, files, and diff stats.
3) Build a concise `diff_summary` using filenames + a short changed-lines summary (no raw secrets).
4) Apply exclusion rules to remove sensitive files from `file_paths` and `diff_summary`.
5) Create a draft `output` using a consistent prompt or labeling guideline.
6) Validate JSONL format: one JSON object per line, no trailing commas.
7) Emit a summary report: total PRs, excluded PRs, average diff size.

## Exclusion Rules
- File path patterns (globs): `**/secrets/**`, `**/*.pem`, `**/*.key`, `**/.env`, `**/private/**`
- Optional: skip entire PR if a blocked file is present

## Labeling Guidelines
- Use multi-labels when multiple categories apply.
- Use `No Direct Impact` for refactors or documentation-only changes.
- Avoid overclaiming; use lower confidence for uncertain mappings.

## Validation Checklist
- All required fields present
- No secrets or credentials in summaries
- Confidence scores in 0.3-0.9 range
- JSONL passes a strict parse

## Example Line (Abbreviated)
```json
{"input":{"pr_title":"Add cache for checkout reads","pr_description":"Introduce read-through cache to reduce checkout latency.","diff_summary":"Added cache layer for checkout reads.","diff_stats":{"files_changed":3,"additions":72,"deletions":18},"file_paths":["services/payments/cache.js"]},"output":{"technical_categories":[{"name":"Performance","confidence":0.86}],"business_dimensions":[{"name":"Elastic Scalability & Availability","confidence":0.72}],"business_dimension_sources":["Elastic Scalability & Availability"],"short_summary":"Reduced checkout latency by optimizing cache reads.","pm_summary":"This update introduces a read-through cache for checkout requests.","exec_summary":"Performance gains improve checkout reliability.","risks":[],"customer_impact":"Faster checkout responses.","evidence":["services/payments/cache.js"],"search_tags":["performance","checkout","cache"]}}
```
