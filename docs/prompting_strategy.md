# Prompting Strategy

## Background
### What a PR Is
A pull request (PR) is a proposed set of code changes in a repository. When merged, the PR becomes part of the product. Bridge summarizes the merged PR so non-technical stakeholders understand what changed and why it matters.

### What PMs and Sales Look For
- PMs care about user impact, product value, and roadmap relevance (e.g., faster load time, fewer errors, new capability).
- Sales cares about customer-facing improvements, reliability, and differentiators they can communicate (e.g., reduced latency, better security, new export options).
- Both want clarity on risks, scope, and whether the change is meaningful or minor.

## Goals
- Produce consistent short/PM/exec summaries
- Enforce schema fields and output shape
- Reduce hallucinations and overclaiming
- Keep outputs safe (no secrets or raw code)

## Prompt Structure
Use a two-layer prompt setup:
- System prompt: global rules and safety constraints
- Task prompt: per-PR details and output schema

## System Prompt (Template)
```text
You are Bridge, an assistant that summarizes merged PRs for PMs and Sales.

Rules:
- Never include raw code, credentials, or secrets.
- Do not invent facts not supported by the input.
- If impact is unclear, say so and keep confidence low.
- Use concise, professional tone.
- Output must follow the required JSON schema exactly.
```

## Task Prompt (Template)
```text
Input:
- PR title: {{pr_title}}
- PR description: {{pr_description}}
- Diff summary: {{diff_summary}}
- Diff stats: {{diff_stats}}
- File paths: {{file_paths}}

Output JSON schema:
- summary_id, repo, pr_number, pr_url, merged_at, commit_range
- diff_stats, evidence
- technical_categories, business_dimensions, business_dimension_sources
- impact_score, short_summary, pm_summary, exec_summary
- risks, customer_impact, search_tags, model, created_at

Generate a valid JSON object that follows the schema. Use the taxonomy labels for business_dimension_sources.
```

## Guardrails
- Require at least one technical category and one business dimension.
- Confidence range: 0.3 to 0.9 unless certain.
- If data is thin, reduce `impact_score` or omit it.
- `evidence` must reference file paths or modules only.
- Summaries must align with PM and Sales priorities (user impact, reliability, differentiation).

## Output Enforcement
- Use JSON-only responses (no prose).
- Validate with a JSON schema check before storing.
- If invalid, re-prompt with the validation errors.

## Example (Abbreviated)
```json
{
  "technical_categories": [{"name": "Performance", "confidence": 0.86}],
  "business_dimensions": [{"name": "Elastic Scalability & Availability", "confidence": 0.72}],
  "short_summary": "Reduced checkout latency by optimizing cache reads.",
  "pm_summary": "This update introduces a read-through cache for checkout requests.",
  "exec_summary": "Performance gains improve checkout reliability."
}
```
