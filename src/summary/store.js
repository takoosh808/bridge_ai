const { query } = require('../db');

async function saveSummary(summary) {
  await query(
    `
      INSERT INTO summaries (summary_id, repo, pr_number, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (summary_id)
      DO UPDATE SET payload = EXCLUDED.payload
    `,
    [summary.summary_id, summary.repo, summary.pr_number, JSON.stringify(summary)]
  );

  return summary;
}

async function getSummary(summaryId) {
  const result = await query(
    'SELECT payload FROM summaries WHERE summary_id = $1 LIMIT 1',
    [summaryId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].payload;
}

async function getProcessedEvent(idempotencyKey) {
  const result = await query(
    `
      SELECT idempotency_key, summary_id, comment_url
      FROM webhook_events
      WHERE idempotency_key = $1
      LIMIT 1
    `,
    [idempotencyKey]
  );

  return result.rows[0] || null;
}

async function saveProcessedEvent(event) {
  await query(
    `
      INSERT INTO webhook_events (
        idempotency_key,
        delivery_id,
        repo,
        pr_number,
        merge_commit_sha,
        summary_id,
        comment_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (idempotency_key)
      DO NOTHING
    `,
    [
      event.idempotency_key,
      event.delivery_id || null,
      event.repo,
      event.pr_number,
      event.merge_commit_sha || null,
      event.summary_id || null,
      event.comment_url || null
    ]
  );
}

async function saveDeadLetterEvent(event) {
  await query(
    `
      INSERT INTO dead_letter_events (
        idempotency_key,
        delivery_id,
        event_name,
        repo,
        pr_number,
        error_code,
        error_message,
        retryable,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      event.idempotency_key || null,
      event.delivery_id || null,
      event.event_name,
      event.repo || null,
      event.pr_number || null,
      event.error_code,
      event.error_message,
      Boolean(event.retryable),
      JSON.stringify(event.payload || {})
    ]
  );
}

async function listDeadLetterEvents(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const result = await query(
    `
      SELECT id, idempotency_key, delivery_id, event_name, repo, pr_number,
             error_code, error_message, retryable, created_at
      FROM dead_letter_events
      ORDER BY id DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

module.exports = {
  saveSummary,
  getSummary,
  getProcessedEvent,
  saveProcessedEvent,
  saveDeadLetterEvent,
  listDeadLetterEvents
};
