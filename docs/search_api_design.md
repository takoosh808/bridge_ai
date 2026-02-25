# Search API Design

## Purpose
Enable PMs and Sales to find PR summaries by impact type, business dimension, product area, and time range.

## PM Search UX (Target Flow)
- PM selects a category from a dropdown (e.g., Performance).
- PM types a keyword such as latency or time.
- Results show PRs that match the category filter and keyword.

## Query Model
- Query syntax uses simple field filters with AND/OR
- Fields support exact match, range, and tag searches

### Supported Fields
- `category`: technical category (e.g., Performance, Security)
- `dimension`: business dimension (e.g., Elastic Scalability & Availability)
- `tag`: search tags (e.g., checkout, mobile)
- `impact_score`: numeric range filter
- `merged_at`: date range
- `repo`: org/name
- `text`: free-text over summaries
- `keywords`: synonyms and common terms derived from summaries and evidence (e.g., latency, time)

## Endpoints
### GET /search
Query params:
- `q`: query string using the syntax below
- `limit`: max results (default 20)
- `offset`: pagination offset

Example:
```
GET /search?q=category:Performance AND tag:checkout AND impact_score:>=60
```

Example (PM keyword search):
```
GET /search?q=category:Performance AND text:"latency" AND keywords:(latency OR time)
```

### GET /search/suggestions
Query params:
- `q`: partial text
- `limit`: max suggestions

Example:
```
GET /search/suggestions?q=chec
```

## Query Syntax
- Exact match: `category:Performance`
- Tag match: `tag:checkout`
- Free text: `text:"faster checkout"`
- Keyword match: `keywords:(latency OR time)`
- Numeric range: `impact_score:>=80`
- Date range: `merged_at:[2026-01-01 TO 2026-03-31]`
- Combine: `category:Security AND dimension:"Cyber-Resilience & Zero-Trust"`

## Response Shape
```json
{
  "total": 2,
  "items": [
    {
      "summary_id": "0df5a0ab-79ff-4b4b-9d45-7b5f7d3c1b2a",
      "repo": "acme/payments",
      "pr_number": 482,
      "pr_url": "https://github.com/acme/payments/pull/482",
      "merged_at": "2026-02-14T18:22:41Z",
      "technical_categories": [{"name": "Performance", "confidence": 0.87}],
      "business_dimensions": [{"name": "Elastic Scalability & Availability", "confidence": 0.72}],
      "impact_score": 72,
      "short_summary": "Reduced checkout latency by optimizing cache reads.",
      "search_tags": ["performance", "checkout", "cache"]
    }
  ]
}
```

## Notes
- Responses return a subset of the full schema for speed.
- Use `summary_id` to retrieve full details via the summary endpoint.
