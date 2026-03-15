const { retryAsyncWithMeta, isRetryableStatus } = require('../reliability/retry');

function isRetryableNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timed out')
  );
}

function bumpMetrics(metrics, attempts = 1) {
  if (!metrics) {
    return;
  }

  metrics.github_api_calls = (metrics.github_api_calls || 0) + 1;
  metrics.github_api_attempts = (metrics.github_api_attempts || 0) + attempts;
}

async function githubRequest(path, token, options = {}) {
  const result = await retryAsyncWithMeta(
    async () => {
      const response = await fetch(`https://api.github.com${path}`, {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'bridge-ai-mvp',
          ...(options.body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`GitHub API request failed: ${response.status}`);
        error.status = response.status;
        error.body = errorText;
        error.retryable = isRetryableStatus(response.status);
        throw error;
      }

      return response.json();
    },
    {
      maxAttempts: 4,
      baseDelayMs: 350,
      shouldRetry: (error) => Boolean(error.retryable || isRetryableNetworkError(error))
    }
  );

  bumpMetrics(options.metrics, result.attempts);
  return result.value;
}

function parseRepoFullName(fullName) {
  const [owner, repo] = String(fullName || '').split('/');
  if (!owner || !repo) {
    throw new Error(`invalid repo full name: ${fullName}`);
  }

  return { owner, repo };
}

async function fetchPullRequest({ repoFullName, prNumber, token, metrics }) {
  const { owner, repo } = parseRepoFullName(repoFullName);
  return githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`, token, { metrics });
}

async function fetchPullRequestFiles({ repoFullName, prNumber, token, metrics }) {
  const { owner, repo } = parseRepoFullName(repoFullName);

  const files = [];
  let page = 1;

  while (true) {
    const batch = await githubRequest(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      token,
      { metrics }
    );

    files.push(...batch);

    if (batch.length < 100) {
      break;
    }

    page += 1;
  }

  return files;
}

async function postPullRequestComment({ repoFullName, prNumber, token, body, metrics }) {
  const { owner, repo } = parseRepoFullName(repoFullName);

  return githubRequest(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, token, {
    method: 'POST',
    body: { body },
    metrics
  });
}

module.exports = {
  fetchPullRequest,
  fetchPullRequestFiles,
  postPullRequestComment
};
