const MAX_RECENT_REQUESTS = 200;

const state = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  totalErrors: 0,
  statusCounts: {},
  totalLatencyMs: 0,
  recentRequests: []
};

function clampPath(pathname) {
  if (!pathname) {
    return '/';
  }

  return pathname.length > 200 ? pathname.slice(0, 200) : pathname;
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function recordRequest({ method, path, statusCode, durationMs }) {
  const safeStatus = Number(statusCode) || 0;
  const safeDuration = Math.max(0, Number(durationMs) || 0);

  state.totalRequests += 1;
  state.totalLatencyMs += safeDuration;

  const key = String(safeStatus);
  state.statusCounts[key] = (state.statusCounts[key] || 0) + 1;

  if (safeStatus >= 400) {
    state.totalErrors += 1;
  }

  state.recentRequests.push({
    ts: new Date().toISOString(),
    method: method || 'GET',
    path: clampPath(path),
    status_code: safeStatus,
    duration_ms: safeDuration
  });

  if (state.recentRequests.length > MAX_RECENT_REQUESTS) {
    state.recentRequests.shift();
  }
}

function getObservabilitySnapshot() {
  const totalRequests = state.totalRequests;
  const avgLatencyMs = totalRequests ? Math.round(state.totalLatencyMs / totalRequests) : 0;
  const errorRatePercent = totalRequests
    ? Number(((state.totalErrors / totalRequests) * 100).toFixed(2))
    : 0;

  const recent = state.recentRequests.slice(-50);
  const recentLatencies = recent.map((item) => item.duration_ms);

  return {
    started_at: state.startedAt,
    totals: {
      requests: totalRequests,
      errors: state.totalErrors,
      error_rate_percent: errorRatePercent,
      avg_latency_ms: avgLatencyMs,
      p95_latency_ms: Math.round(percentile(recentLatencies, 95))
    },
    status_counts: state.statusCounts,
    recent_requests: recent
  };
}

module.exports = {
  recordRequest,
  getObservabilitySnapshot
};
