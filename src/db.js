const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString
});

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDatabase(maxAttempts = 20, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      process.stdout.write(
        `[db] waiting for postgres (attempt ${attempt}/${maxAttempts})\n`
      );
      await sleep(delayMs);
    }
  }
}

async function initDatabase() {
  await waitForDatabase();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS summaries (
      summary_id TEXT PRIMARY KEY,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id SERIAL PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      delivery_id TEXT,
      repo TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      merge_commit_sha TEXT,
      summary_id TEXT,
      comment_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_delivery_id_unique
    ON webhook_events (delivery_id)
    WHERE delivery_id IS NOT NULL AND delivery_id <> ''
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dead_letter_events (
      id SERIAL PRIMARY KEY,
      idempotency_key TEXT,
      delivery_id TEXT,
      event_name TEXT NOT NULL,
      repo TEXT,
      pr_number INTEGER,
      error_code TEXT NOT NULL,
      error_message TEXT NOT NULL,
      retryable BOOLEAN NOT NULL DEFAULT FALSE,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      path TEXT NOT NULL,
      method TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = {
  initDatabase,
  query,
  pool
};
