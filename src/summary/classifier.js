function containsAny(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function classifyTechnical({ title, description, files }) {
  const text = `${title || ''} ${description || ''} ${(files || []).map((file) => file.filename).join(' ')}`;

  if (containsAny(text, ['latency', 'cache', 'performance', 'query', 'load time', 'throughput'])) {
    return { name: 'Performance', confidence: 0.82 };
  }

  if (containsAny(text, ['auth', 'security', 'secret', 'encryption', 'token', 'rate limit'])) {
    return { name: 'Security', confidence: 0.86 };
  }

  if (containsAny(text, ['onboarding', 'error message', 'ux', 'ui', 'copy', 'clarity'])) {
    return { name: 'User Experience', confidence: 0.72 };
  }

  if (containsAny(text, ['scale', 'autoscale', 'queue', 'concurrency', 'hosting'])) {
    return { name: 'Scalability', confidence: 0.78 };
  }

  if (containsAny(text, ['refactor', 'cleanup', 'restructure'])) {
    return { name: 'Refactor', confidence: 0.8 };
  }

  return { name: 'Feature', confidence: 0.55 };
}

function classifyBusiness(technicalCategory) {
  if (technicalCategory === 'Performance' || technicalCategory === 'Scalability') {
    return {
      dimension: { name: 'Elastic Scalability & Availability', confidence: 0.74 },
      source: 'Elastic Scalability & Availability'
    };
  }

  if (technicalCategory === 'Security') {
    return {
      dimension: { name: 'Cyber-Resilience & Zero-Trust', confidence: 0.82 },
      source: 'Cyber-Resilience & Zero-Trust'
    };
  }

  if (technicalCategory === 'User Experience') {
    return {
      dimension: { name: 'Frictionless Time to Value', confidence: 0.68 },
      source: 'Frictionless Time to Value'
    };
  }

  return {
    dimension: { name: 'Frictionless Time to Value', confidence: 0.44 },
    source: 'Frictionless Time to Value'
  };
}

module.exports = {
  classifyTechnical,
  classifyBusiness
};
