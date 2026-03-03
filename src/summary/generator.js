const crypto = require('crypto');
const { classifyTechnical, classifyBusiness } = require('./classifier');
const { validateSummary } = require('./schema');

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

function truncateToSentences(text, maxSentences) {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) {
    return sentences.join(' ');
  }

  return sentences.slice(0, maxSentences).join(' ');
}

function sanitizeSummaryText(text) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  return compact
    .replace(/```/g, '')
    .replace(/\b(guaranteed?|always|never fail|zero risk)\b/gi, 'likely');
}

function applyQualityGuardrails(raw) {
  return {
    short_summary: truncateToSentences(sanitizeSummaryText(raw.short_summary), 2),
    pm_summary: truncateToSentences(sanitizeSummaryText(raw.pm_summary), 2),
    exec_summary: truncateToSentences(sanitizeSummaryText(raw.exec_summary), 2)
  };
}

function pickSearchTags({ technicalCategory, files }) {
  const tags = new Set();
  tags.add(technicalCategory.toLowerCase());

  for (const file of files.slice(0, 3)) {
    const parts = file.filename.split('/').filter(Boolean);
    if (parts[0]) {
      tags.add(parts[0].toLowerCase());
    }
  }

  return [...tags].slice(0, 6);
}

function buildFallbackSummaries({ technicalCategory, normalizedPayload }) {
  const topFiles = normalizedPayload.diff_stats.top_files || [];
  const fileHint = topFiles.length > 0 ? ` across ${topFiles.slice(0, 2).join(' and ')}` : '';

  return applyQualityGuardrails({
    short_summary: `Merged PR #${normalizedPayload.pr_number} improves ${technicalCategory.toLowerCase()}${fileHint}.`,
    pm_summary: `This PR focuses on ${technicalCategory.toLowerCase()} improvements with changes in ${normalizedPayload.diff_stats.files_changed} files. PM impact: clearer product reliability and delivery outcomes for planning and communication.`,
    exec_summary: `This change indicates progress in ${technicalCategory.toLowerCase()} and supports operational stability and customer-facing quality signals for the business.`
  });
}

async function tryOpenAiSummaries({ normalizedPayload, technicalCategory, businessDimension, apiKey }) {
  if (!apiKey) {
    return null;
  }

  try {
    const prompt = {
      technical_category: technicalCategory,
      business_dimension: businessDimension,
      repo: normalizedPayload.repo,
      pr_number: normalizedPayload.pr_number,
      title: normalizedPayload.title,
      description: normalizedPayload.description,
      diff_stats: normalizedPayload.diff_stats,
      files: normalizedPayload.files.slice(0, 8).map((file) => file.filename)
    };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: 'You summarize merged pull requests for PM and Sales. Focus on user impact, reliability, and customer-facing value. Avoid overclaiming and do not include raw code. Output strict JSON only with keys: short_summary, pm_summary, exec_summary. Each field must be 1-2 sentences.'
          },
          {
            role: 'user',
            content: JSON.stringify(prompt)
          }
        ]
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text = data?.output?.[0]?.content?.[0]?.text;

    if (!text) {
      return null;
    }

    const parsed = JSON.parse(text);

    if (!parsed.short_summary || !parsed.pm_summary || !parsed.exec_summary) {
      return null;
    }

    return applyQualityGuardrails({
      short_summary: parsed.short_summary,
      pm_summary: parsed.pm_summary,
      exec_summary: parsed.exec_summary
    });
  } catch (error) {
    return null;
  }
}

async function generateSummaryFromNormalizedPayload(normalizedPayload, options = {}) {
  const technical = classifyTechnical({
    title: normalizedPayload.title,
    description: normalizedPayload.description,
    files: normalizedPayload.files
  });

  const business = classifyBusiness(technical.name);

  const aiSummaries = await tryOpenAiSummaries({
    normalizedPayload,
    technicalCategory: technical.name,
    businessDimension: business.dimension.name,
    apiKey: options.openAiApiKey || ''
  });

  const fallback = buildFallbackSummaries({
    technicalCategory: technical.name,
    normalizedPayload
  });

  const summary = {
    summary_id: crypto.randomUUID(),
    repo: normalizedPayload.repo,
    pr_number: normalizedPayload.pr_number,
    pr_url: normalizedPayload.pr_url,
    merged_at: normalizedPayload.merged_at,
    commit_range: normalizedPayload.commit_range,
    diff_stats: {
      files_changed: normalizedPayload.diff_stats.files_changed,
      additions: normalizedPayload.diff_stats.additions,
      deletions: normalizedPayload.diff_stats.deletions
    },
    technical_categories: [technical],
    business_dimensions: [business.dimension],
    business_dimension_sources: [business.source],
    impact_score: technical.name === 'Security' ? 72 : 64,
    short_summary: (aiSummaries || fallback).short_summary,
    pm_summary: (aiSummaries || fallback).pm_summary,
    exec_summary: (aiSummaries || fallback).exec_summary,
    customer_impact: `Primary impact is improved ${technical.name.toLowerCase()} for users and stakeholders.`,
    risks: [],
    evidence: normalizedPayload.diff_stats.top_files,
    search_tags: pickSearchTags({ technicalCategory: technical.name, files: normalizedPayload.files }),
    model: {
      provider: options.openAiApiKey ? 'openai' : 'bridge-fallback',
      name: options.openAiApiKey ? 'gpt-4.1-mini' : 'rules-v1',
      version: '2026-02-25'
    },
    created_at: new Date().toISOString()
  };

  const validation = validateSummary(summary);

  if (!validation.valid) {
    const error = new Error(`summary schema validation failed: ${validation.errors.join('; ')}`);
    error.validation = validation;
    throw error;
  }

  return summary;
}

module.exports = {
  generateSummaryFromNormalizedPayload
};
