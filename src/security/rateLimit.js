const buckets = new Map();

function parseNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function cleanupOldBuckets(now) {
  if (buckets.size < 2000) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function createRateLimiter(options = {}) {
  const scope = options.scope || 'global';
  const windowMs = parseNumber(options.windowMs, 60 * 1000);
  const maxRequests = parseNumber(options.maxRequests, 60);

  return (req, res, next) => {
    const now = Date.now();
    cleanupOldBuckets(now);

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${scope}:${ip}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });

      return next();
    }

    if (existing.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));

      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests for ${scope}`,
          retryable: true,
          details: {
            scope,
            window_ms: windowMs,
            max_requests: maxRequests,
            retry_after_seconds: retryAfterSeconds
          }
        }
      });
    }

    existing.count += 1;
    buckets.set(key, existing);
    return next();
  };
}

module.exports = {
  createRateLimiter
};
