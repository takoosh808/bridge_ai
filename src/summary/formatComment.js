function formatCategoryList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '- none';
  }

  return items
    .map((item) => {
      const confidence = typeof item.confidence === 'number'
        ? ` (${Math.round(item.confidence * 100)}%)`
        : '';
      return `- ${item.name}${confidence}`;
    })
    .join('\n');
}

function formatBridgeComment(summary) {
  return [
    '## Bridge Impact Summary',
    '',
    `**Short:** ${summary.short_summary}`,
    '',
    `**PM:** ${summary.pm_summary}`,
    '',
    `**Executive:** ${summary.exec_summary}`,
    '',
    '**Technical Categories**',
    formatCategoryList(summary.technical_categories),
    '',
    '**Business Dimensions**',
    formatCategoryList(summary.business_dimensions),
    '',
    `**Impact Score:** ${summary.impact_score ?? 'n/a'}`,
    '',
    `**Summary ID:** ${summary.summary_id}`
  ].join('\n');
}

module.exports = {
  formatBridgeComment
};
