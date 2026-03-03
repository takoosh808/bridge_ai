function validateSummary(summary) {
  const requiredFields = [
    'summary_id',
    'repo',
    'pr_number',
    'pr_url',
    'merged_at',
    'diff_stats',
    'technical_categories',
    'business_dimensions',
    'short_summary',
    'pm_summary',
    'exec_summary',
    'created_at'
  ];

  const errors = [];

  for (const field of requiredFields) {
    if (summary[field] === undefined || summary[field] === null || summary[field] === '') {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (!Array.isArray(summary.technical_categories) || summary.technical_categories.length === 0) {
    errors.push('technical_categories must contain at least one item');
  }

  if (!Array.isArray(summary.business_dimensions) || summary.business_dimensions.length === 0) {
    errors.push('business_dimensions must contain at least one item');
  }

  const summaryFields = ['short_summary', 'pm_summary', 'exec_summary'];

  for (const field of summaryFields) {
    const text = String(summary[field] || '');
    const sentenceCount = text
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean).length;

    if (sentenceCount < 1 || sentenceCount > 2) {
      errors.push(`${field} must be 1-2 sentences`);
    }

    if (text.includes('```')) {
      errors.push(`${field} must not include code fences`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateSummary
};
