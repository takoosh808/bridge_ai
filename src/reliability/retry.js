function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

function withJitter(ms) {
  const jitter = Math.floor(Math.random() * 200);
  return ms + jitter;
}

async function retryAsync(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 4;
  const baseDelayMs = options.baseDelayMs || 400;
  const shouldRetry = options.shouldRetry || (() => false);

  let attempt = 1;
  let lastError;

  while (attempt <= maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts && shouldRetry(error);

      if (!canRetry) {
        throw error;
      }

      const delay = withJitter(baseDelayMs * (2 ** (attempt - 1)));
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}

async function retryAsyncWithMeta(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 4;
  const baseDelayMs = options.baseDelayMs || 400;
  const shouldRetry = options.shouldRetry || (() => false);

  let attempt = 1;
  let lastError;

  while (attempt <= maxAttempts) {
    try {
      const value = await fn();
      return {
        value,
        attempts: attempt
      };
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts && shouldRetry(error);

      if (!canRetry) {
        error.attempts = attempt;
        throw error;
      }

      const delay = withJitter(baseDelayMs * (2 ** (attempt - 1)));
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}

module.exports = {
  retryAsync,
  retryAsyncWithMeta,
  isRetryableStatus
};
