function clampPatch(patch) {
  if (!patch) {
    return null;
  }

  const maxChars = 500;
  return patch.length > maxChars ? `${patch.slice(0, maxChars)}...` : patch;
}

function normalizePullRequest({ deliveryId, repoFullName, pullRequest, files }) {
  const safeFiles = files.map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch_excerpt: clampPatch(file.patch)
  }));

  const topFiles = [...safeFiles]
    .sort((left, right) => right.changes - left.changes)
    .slice(0, 5)
    .map((file) => file.filename);

  const summary = {
    files_changed: pullRequest.changed_files,
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    top_files: topFiles
  };

  return {
    delivery_id: deliveryId || null,
    repo: repoFullName,
    pr_number: pullRequest.number,
    pr_url: pullRequest.html_url,
    merged_at: pullRequest.merged_at,
    commit_range: {
      from: pullRequest.base?.sha || null,
      to: pullRequest.merge_commit_sha || pullRequest.head?.sha || null
    },
    title: pullRequest.title,
    description: pullRequest.body || '',
    diff_stats: summary,
    files: safeFiles
  };
}

module.exports = {
  normalizePullRequest
};
