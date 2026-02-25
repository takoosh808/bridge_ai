async function githubRequest(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'bridge-ai-mvp'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`GitHub API request failed: ${response.status}`);
    error.status = response.status;
    error.body = errorText;
    throw error;
  }

  return response.json();
}

function parseRepoFullName(fullName) {
  const [owner, repo] = String(fullName || '').split('/');
  if (!owner || !repo) {
    throw new Error(`invalid repo full name: ${fullName}`);
  }

  return { owner, repo };
}

async function fetchPullRequest({ repoFullName, prNumber, token }) {
  const { owner, repo } = parseRepoFullName(repoFullName);
  return githubRequest(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
}

async function fetchPullRequestFiles({ repoFullName, prNumber, token }) {
  const { owner, repo } = parseRepoFullName(repoFullName);

  const files = [];
  let page = 1;

  while (true) {
    const batch = await githubRequest(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      token
    );

    files.push(...batch);

    if (batch.length < 100) {
      break;
    }

    page += 1;
  }

  return files;
}

module.exports = {
  fetchPullRequest,
  fetchPullRequestFiles
};
