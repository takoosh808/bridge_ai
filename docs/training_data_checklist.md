# Training Data Checklist

Use this checklist to ensure training samples are consistent, balanced, and useful.

## Coverage
- Include all technical categories at least 20-30 times each
- Include all business dimensions at least 20-30 times each
- Include multi-label cases (2-3 categories per example)
- Include low-impact and no-impact changes
- Include ambiguous or mixed-impact cases

## Input Quality
- Use realistic PR titles and descriptions
- Include concise diff summaries or sanitized snippets
- Provide file paths for evidence and indexing
- Keep inputs within target size limits

## Output Quality
- Use the same schema for every sample
- Keep summaries consistent in tone and length
- Include risks when changes could backfire
- Avoid overclaiming impact without evidence
- Keep confidence scores calibrated (0.3-0.9 range is typical)

## Balance
- Avoid only positive outcomes; include neutral and negative impacts
- Ensure business dimensions do not always map from the same technical category
- Mix product areas and user segments

## Review
- Spot check 10% of samples for accuracy
- Ensure no secrets or raw sensitive data are included
- Validate JSONL format (one JSON object per line)
