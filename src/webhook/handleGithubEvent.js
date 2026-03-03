const { fetchPullRequest, fetchPullRequestFiles, postPullRequestComment } = require('../github/client');
const { normalizePullRequest } = require('./normalizePullRequest');
const { generateSummaryFromNormalizedPayload } = require('../summary/generator');
const {
  saveSummary,
  getSummary,
  getProcessedEvent,
  saveProcessedEvent,
  saveDeadLetterEvent
} = require('../summary/store');
const { formatBridgeComment } = require('../summary/formatComment');

function makeIdempotencyKey({ repo, prNumber, mergeCommitSha }) {
  return `${repo}#${prNumber}#${mergeCommitSha || 'unknown'}`;
}

function buildErrorResponse({ statusCode, code, message, retryable = false, details = null }) {
  return {
    statusCode,
    body: {
      error: {
        code,
        message,
        retryable,
        ...(details ? { details } : {})
      }
    }
  };
}

async function handleGithubEvent({ eventName, deliveryId, payload, githubToken, openAiApiKey }) {
  const startedAt = Date.now();
  const reliability = {
    github_api_calls: 0,
    github_api_attempts: 0
  };

  function withReliability(response) {
    return {
      statusCode: response.statusCode,
      body: {
        ...response.body,
        processing_ms: Date.now() - startedAt,
        reliability
      }
    };
  }

  if (eventName === 'ping') {
    return withReliability({
      statusCode: 200,
      body: { received: true, event: 'ping' }
    });
  }

  if (eventName !== 'pull_request') {
    return withReliability({
      statusCode: 200,
      body: {
        received: true,
        ignored: true,
        reason: `unsupported event: ${eventName}`
      }
    });
  }

  const action = payload?.action;
  const pullRequest = payload?.pull_request;
  const repository = payload?.repository;

  if (!pullRequest || !repository) {
    return withReliability(buildErrorResponse({
      statusCode: 400,
      code: 'INVALID_PULL_REQUEST_PAYLOAD',
      message: 'Invalid pull_request payload',
      retryable: false
    }));
  }

  if (action !== 'closed') {
    return withReliability({
      statusCode: 200,
      body: {
        received: true,
        ignored: true,
        reason: `pull_request action ${action} is not target action closed`
      }
    });
  }

  if (!pullRequest.merged) {
    return withReliability({
      statusCode: 200,
      body: {
        received: true,
        ignored: true,
        reason: 'pull_request closed without merge'
      }
    });
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

  const idempotencyKey = makeIdempotencyKey({
    repo: mergeJob.repo,
    prNumber: mergeJob.pr_number,
    mergeCommitSha: mergeJob.merge_commit_sha
  });

  const existingEvent = await getProcessedEvent(idempotencyKey);

  if (existingEvent) {
    const existingSummary = existingEvent.summary_id
      ? await getSummary(existingEvent.summary_id)
      : null;

    return withReliability({
      statusCode: 200,
      body: {
        received: true,
        duplicate: true,
        reason: 'idempotent_replay',
        target: {
          repo: mergeJob.repo,
          pr_number: mergeJob.pr_number
        },
        publish: {
          comment_posted: Boolean(existingEvent.comment_url),
          comment_url: existingEvent.comment_url || null
        },
        summary: existingSummary
      }
    });
  }

  process.stdout.write(`[webhook] merged PR received ${mergeJob.repo}#${mergeJob.pr_number}\n`);

  if (!githubToken) {
    return withReliability({
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
    });
  }

  try {
    const pullRequest = await fetchPullRequest({
      repoFullName: mergeJob.repo,
      prNumber: mergeJob.pr_number,
      token: githubToken,
      metrics: reliability
    });

    const files = await fetchPullRequestFiles({
      repoFullName: mergeJob.repo,
      prNumber: mergeJob.pr_number,
      token: githubToken,
      metrics: reliability
    });

    const normalizedPayload = normalizePullRequest({
      deliveryId,
      repoFullName: mergeJob.repo,
      pullRequest,
      files
    });

    const generatedSummary = await generateSummaryFromNormalizedPayload(normalizedPayload, {
      openAiApiKey
    });

    await saveSummary(generatedSummary);

    let publish = {
      comment_posted: false
    };

    try {
      const commentBody = formatBridgeComment(generatedSummary);
      const comment = await postPullRequestComment({
        repoFullName: mergeJob.repo,
        prNumber: mergeJob.pr_number,
        token: githubToken,
        body: commentBody,
        metrics: reliability
      });

      publish = {
        comment_posted: true,
        comment_url: comment.html_url
      };
    } catch (error) {
      process.stdout.write(
        `[webhook] comment publish failed for ${mergeJob.repo}#${mergeJob.pr_number}: ${error.message}\n`
      );

      publish = {
        comment_posted: false,
        error: error.message
      };
    }

    await saveProcessedEvent({
      idempotency_key: idempotencyKey,
      delivery_id: deliveryId,
      repo: mergeJob.repo,
      pr_number: mergeJob.pr_number,
      merge_commit_sha: mergeJob.merge_commit_sha,
      summary_id: generatedSummary.summary_id,
      comment_url: publish.comment_url || null
    });

    return withReliability({
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
        publish,
        normalized_payload: normalizedPayload,
        summary: generatedSummary
      }
    });
  } catch (error) {
    const retryable = Boolean(error.retryable);
    await saveDeadLetterEvent({
      idempotency_key: idempotencyKey,
      delivery_id: deliveryId,
      event_name: eventName,
      repo: mergeJob.repo,
      pr_number: mergeJob.pr_number,
      error_code: 'GITHUB_DIFF_FETCH_FAILED',
      error_message: error.message,
      retryable,
      payload
    });

    process.stdout.write(
      `[webhook] github fetch failed for ${mergeJob.repo}#${mergeJob.pr_number}: ${error.message}\n`
    );

    return withReliability(buildErrorResponse({
      statusCode: 502,
      code: 'GITHUB_DIFF_FETCH_FAILED',
      message: 'Failed to fetch GitHub pull request diff data',
      retryable,
      details: error.message
    }));
  }
}

module.exports = {
  handleGithubEvent
};
