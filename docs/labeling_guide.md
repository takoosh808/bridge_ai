# Labeling Guide

## Purpose
Provide consistent rules for mapping PR changes to technical categories and business dimensions.

## Labeling Principles
- Use evidence from the PR title, description, diff summary, and file paths.
- Prefer multi-labels when changes impact more than one area.
- Avoid overclaiming; use lower confidence if evidence is thin.
- If impact is unclear, use `No Direct Impact` and explain in summaries.

## Technical Categories (When to Use)
- Performance: latency, throughput, caching, query speed, load time
- Scalability: capacity, concurrency, autoscaling, queueing, sharding
- Security: auth, secrets, encryption, access control, audit logging
- Infrastructure: deployment, CI/CD, networking, cloud resources
- User Experience: UI clarity, error messages, onboarding flow
- Feature: new capability, endpoint, workflow, or UI element
- Bug Fix: fixes incorrect behavior, regression, or edge case
- Refactor: code reorg with no behavior change
- Cost Optimization: reduces compute/storage/API costs

## Business Dimensions (Mapping)
- High-Frequency Engagement: features that increase daily/weekly use
- Elastic Scalability & Availability: improvements to uptime, latency, capacity
- Frictionless Time to Value: faster onboarding, reduced setup steps
- Compounding Network Effects: sharing, collaboration, community growth
- Multi-Vector Monetization: pricing, billing, usage-based features
- Full-Stack Vertical Integration: platform control, internal infra tooling
- Proprietary Data Sovereignty: telemetry, data capture, data quality
- Cyber-Resilience & Zero-Trust: security, compliance, audit readiness
- Agentic AI Automation: automated ops, support, workflows
- Open Standards Leadership: APIs, SDKs, OSS, interoperability
- No Direct Impact: internal changes with no user or business impact

## Confidence Scoring
- 0.8-0.9: clear direct evidence in PR summary and files
- 0.6-0.7: likely impact but minor or indirect
- 0.3-0.5: weak evidence or speculative

## Common Patterns
- Cache + latency reductions -> Performance + Elastic Scalability & Availability
- Auth/rate limits -> Security + Cyber-Resilience & Zero-Trust
- Simplified onboarding -> User Experience + Frictionless Time to Value
- Pricing or metering -> Feature + Multi-Vector Monetization
- Refactor only -> Refactor + No Direct Impact

## Examples
### Example A
Input: "Added read-through cache to checkout"
Labels:
- Technical: Performance (0.86)
- Business: Elastic Scalability & Availability (0.72)

### Example B
Input: "Moved secrets to env vars"
Labels:
- Technical: Security (0.9)
- Business: Cyber-Resilience & Zero-Trust (0.83)

### Example C
Input: "Refactor billing modules"
Labels:
- Technical: Refactor (0.9)
- Business: No Direct Impact (0.66)
