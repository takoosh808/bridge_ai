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

async function listRecentWebhookEvents(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const result = await query(
    `
      SELECT idempotency_key, delivery_id, repo, pr_number, merge_commit_sha,
             summary_id, comment_url, created_at
      FROM webhook_events
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

async function getAdminOverview() {
  const summariesCountResult = await query('SELECT COUNT(*)::int AS count FROM summaries');
  const webhookEventsCountResult = await query('SELECT COUNT(*)::int AS count FROM webhook_events');
  const deadLettersCountResult = await query('SELECT COUNT(*)::int AS count FROM dead_letter_events');

  const lastSummaryResult = await query(
    'SELECT created_at FROM summaries ORDER BY created_at DESC LIMIT 1'
  );

  const lastWebhookResult = await query(
    'SELECT created_at FROM webhook_events ORDER BY created_at DESC LIMIT 1'
  );

  const lastDeadLetterResult = await query(
    'SELECT created_at FROM dead_letter_events ORDER BY created_at DESC LIMIT 1'
  );

  const recentDeadLettersResult = await query(
    `
      SELECT id, error_code, error_message, retryable, repo, pr_number, created_at
      FROM dead_letter_events
      ORDER BY created_at DESC
      LIMIT 5
    `
  );

  return {
    totals: {
      summaries: summariesCountResult.rows[0].count,
      processed_webhooks: webhookEventsCountResult.rows[0].count,
      dead_letters: deadLettersCountResult.rows[0].count
    },
    last_activity: {
      summary_at: lastSummaryResult.rows[0]?.created_at || null,
      webhook_at: lastWebhookResult.rows[0]?.created_at || null,
      dead_letter_at: lastDeadLetterResult.rows[0]?.created_at || null
    },
    recent_dead_letters: recentDeadLettersResult.rows
  };
}

async function cleanupExpiredData(retentionDays) {
  const safeDays = Math.max(1, Number(retentionDays) || 30);

  const summariesDeleted = await query(
    `
      DELETE FROM summaries
      WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [safeDays]
  );

  const webhookEventsDeleted = await query(
    `
      DELETE FROM webhook_events
      WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [safeDays]
  );

  const deadLettersDeleted = await query(
    `
      DELETE FROM dead_letter_events
      WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [safeDays]
  );

  return {
    retention_days: safeDays,
    deleted: {
      summaries: summariesDeleted.rowCount,
      webhook_events: webhookEventsDeleted.rowCount,
      dead_letter_events: deadLettersDeleted.rowCount
    },
    ran_at: new Date().toISOString()
  };
}

module.exports = {
  saveSummary,
  getSummary,
  getProcessedEvent,
  saveProcessedEvent,
  saveDeadLetterEvent,
  listDeadLetterEvents,
  listRecentWebhookEvents,
  getAdminOverview,
  cleanupExpiredData
};
