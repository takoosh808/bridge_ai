const { fetchPullRequest, fetchPullRequestFiles } = require('../github/client');
const { normalizePullRequest } = require('./normalizePullRequest');

async function handleGithubEvent({ eventName, deliveryId, payload, githubToken }) {
  if (eventName === 'ping') {
    return {
      statusCode: 200,
      body: { received: true, event: 'ping' }
    };
  }

  if (eventName !== 'pull_request') {
    return {
      statusCode: 200,
      body: {
        received: true,
        ignored: true,
        reason: `unsupported event: ${eventName}`
      }
    };
  }

  const action = payload?.action;
  const pullRequest = payload?.pull_request;
  const repository = payload?.repository;

  if (!pullRequest || !repository) {
    return {
      statusCode: 400,
      body: { error: 'invalid pull_request payload' }
    };
  }

  if (action !== 'closed') {
    return {
      statusCode: 200,
      body: {
        received: true,
        ignored: true,
        reason: `pull_request action ${action} is not target action closed`
      }
    };
  }

  if (!pullRequest.merged) {
    return {
      statusCode: 200,
      body: {
        received: true,
        ignored: true,
        reason: 'pull_request closed without merge'
      }
    };
  }

  const mergeJob = {
    delivery_id: deliveryId || null,
    repo: repository.full_name,
    pr_number: pullRequest.number,
    pr_url: pullRequest.html_url,
    merged_at: pullRequest.merged_at,
    merge_commit_sha: pullRequest.merge_commit_sha,
    base_ref: pullRequest.base?.ref || null,
    head_ref: pullRequest.head?.ref || null
  };

  process.stdout.write(`[webhook] merged PR received ${mergeJob.repo}#${mergeJob.pr_number}\n`);

  if (!githubToken) {
    return {
      statusCode: 202,
      body: {
        received: true,
        queued: true,
        event: eventName,
        target: {
          repo: mergeJob.repo,
          pr_number: mergeJob.pr_number
        },
        integration: {
          github_api_ready: false,
          reason: 'GITHUB_TOKEN not configured'
        }
      }
    };
  }

  try {
    const pullRequest = await fetchPullRequest({
      repoFullName: mergeJob.repo,
      prNumber: mergeJob.pr_number,
      token: githubToken
    });

    const files = await fetchPullRequestFiles({
      repoFullName: mergeJob.repo,
      prNumber: mergeJob.pr_number,
      token: githubToken
    });

    const normalizedPayload = normalizePullRequest({
      deliveryId,
      repoFullName: mergeJob.repo,
      pullRequest,
      files
    });

    return {
      statusCode: 202,
      body: {
        received: true,
        queued: true,
        event: eventName,
        target: {
          repo: mergeJob.repo,
          pr_number: mergeJob.pr_number
        },
        integration: {
          github_api_ready: true
        },
        normalized_payload: normalizedPayload
      }
    };
  } catch (error) {
    process.stdout.write(
      `[webhook] github fetch failed for ${mergeJob.repo}#${mergeJob.pr_number}: ${error.message}\n`
    );

    return {
      statusCode: 502,
      body: {
        error: 'github_diff_fetch_failed',
        details: error.message
      }
    };
  }
}

module.exports = {
  handleGithubEvent
};
