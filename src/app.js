const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { isValidGithubSignature } = require('./webhook/verifySignature');
const { handleGithubEvent } = require('./webhook/handleGithubEvent');
const { getSecret } = require('./config/secrets');
const { createRateLimiter } = require('./security/rateLimit');
const { logAdminAudit, listAdminAuditLogs } = require('./security/audit');
const { recordRequest, getObservabilitySnapshot } = require('./observability/metrics');
const { getHealthStatus } = require('./observability/health');
const {
  getSummary,
  getProcessedEvent,
  listDeadLetterEvents,
  listRecentWebhookEvents,
  getAdminOverview
} = require('./summary/store');
const { runRetentionCleanup } = require('./retention/runner');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

const adminRateLimiter = createRateLimiter({
  scope: 'admin',
  windowMs: Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  maxRequests: Number(process.env.ADMIN_RATE_LIMIT_MAX || 120)
});

const webhookRateLimiter = createRateLimiter({
  scope: 'webhook',
  windowMs: Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  maxRequests: Number(process.env.WEBHOOK_RATE_LIMIT_MAX || 300)
});

app.use(express.json({
  verify: (req, res, buffer) => {
    req.rawBody = buffer;
  }
}));

app.use((req, res, next) => {
  const started = Date.now();

  res.on('finish', () => {
    recordRequest({
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - started
    });
  });

  next();
});

app.use('/admin', adminRateLimiter);
app.use('/webhook', webhookRateLimiter);
app.use('/admin', express.static(path.join(publicDir, 'admin')));

function tokenDigestHex(value) {
  const pepper = getSecret('ADMIN_API_TOKEN_PEPPER');

  if (pepper) {
    return crypto.createHmac('sha256', pepper).update(value, 'utf8').digest('hex');
  }

  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function timingSafeHexEqual(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch (error) {
    return false;
  }
}

function requireAdminToken(req, res, next) {
  const configuredHash = getSecret('ADMIN_API_TOKEN_HASH').toLowerCase();

  if (!configuredHash) {
    logAdminAudit(req, {
      action: 'admin_auth',
      outcome: 'misconfigured',
      details: { reason: 'missing_admin_api_token_hash' }
    });

    return res.status(500).json({
      error: {
        code: 'ADMIN_AUTH_NOT_CONFIGURED',
        message: 'Admin token hash not configured',
        retryable: false
      }
    });
  }

  if (!/^[a-f0-9]{64}$/.test(configuredHash)) {
    logAdminAudit(req, {
      action: 'admin_auth',
      outcome: 'misconfigured',
      details: { reason: 'invalid_admin_api_token_hash_format' }
    });

    return res.status(500).json({
      error: {
        code: 'ADMIN_AUTH_MISCONFIGURED',
        message: 'Admin token hash must be a 64-char lowercase hex string',
        retryable: false
      }
    });
  }

  const providedToken = req.header('x-admin-token') || '';

  if (!providedToken) {
    logAdminAudit(req, {
      action: 'admin_auth',
      outcome: 'denied',
      details: { reason: 'missing_token' }
    });

    return res.status(401).json({
      error: {
        code: 'ADMIN_UNAUTHORIZED',
        message: 'Invalid admin token',
        retryable: false
      }
    });
  }

  const providedHash = tokenDigestHex(providedToken);
  const valid = timingSafeHexEqual(providedHash, configuredHash);

  if (!valid) {
    logAdminAudit(req, {
      action: 'admin_auth',
      outcome: 'denied',
      details: { reason: 'invalid_token' }
    });

    return res.status(401).json({
      error: {
        code: 'ADMIN_UNAUTHORIZED',
        message: 'Invalid admin token',
        retryable: false
      }
    });
  }

  logAdminAudit(req, {
    action: 'admin_auth',
    outcome: 'allowed'
  });

  return next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/summary/:summaryId', async (req, res) => {
  const summary = await getSummary(req.params.summaryId);

  if (!summary) {
    return res.status(404).json({ error: 'summary not found' });
  }

  return res.json(summary);
});

app.get('/webhook/events', async (req, res) => {
  const idempotencyKey = req.query.idempotencyKey;

  if (!idempotencyKey) {
    return res.status(400).json({ error: 'idempotencyKey query param is required' });
  }

  const event = await getProcessedEvent(idempotencyKey);

  if (!event) {
    return res.status(404).json({ error: 'event not found' });
  }

  const summary = event.summary_id ? await getSummary(event.summary_id) : null;

  return res.json({
    event,
    summary
  });
});

app.get('/webhook/dead-letters', async (req, res) => {
  const events = await listDeadLetterEvents(req.query.limit || 20);
  return res.json({
    count: events.length,
    items: events
  });
});

app.post('/admin/retention/run', requireAdminToken, async (req, res) => {
  logAdminAudit(req, {
    action: 'admin_retention_run',
    outcome: 'attempt'
  });

  try {
    const result = await runRetentionCleanup();

    logAdminAudit(req, {
      action: 'admin_retention_run',
      outcome: 'success',
      details: {
        deleted: result.deleted || {}
      }
    });

    return res.json(result);
  } catch (error) {
    logAdminAudit(req, {
      action: 'admin_retention_run',
      outcome: 'failure',
      details: {
        message: error.message
      }
    });

    return res.status(500).json({
      error: {
        code: 'RETENTION_CLEANUP_FAILED',
        message: 'Retention cleanup failed',
        retryable: true,
        details: error.message
      }
    });
  }
});

app.get('/admin/overview', requireAdminToken, async (req, res) => {
  try {
    const overview = await getAdminOverview();
    return res.json(overview);
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'ADMIN_OVERVIEW_FAILED',
        message: 'Failed to load admin overview',
        retryable: true,
        details: error.message
      }
    });
  }
});

app.get('/admin/recent-webhooks', requireAdminToken, async (req, res) => {
  try {
    const items = await listRecentWebhookEvents(req.query.limit || 20);
    return res.json({
      count: items.length,
      items
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'ADMIN_RECENT_WEBHOOKS_FAILED',
        message: 'Failed to load recent webhook events',
        retryable: true,
        details: error.message
      }
    });
  }
});

app.get('/admin/observability', requireAdminToken, async (req, res) => {
  try {
    const metrics = getObservabilitySnapshot();
    return res.json(metrics);
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'ADMIN_OBSERVABILITY_FAILED',
        message: 'Failed to load observability metrics',
        retryable: true,
        details: error.message
      }
    });
  }
});

app.get('/admin/health', requireAdminToken, async (req, res) => {
  try {
    const health = await getHealthStatus();
    
    logAdminAudit(req, {
      action: 'admin_health_check',
      outcome: 'success',
      details: {
        status: health.status
      }
    });
    
    return res.json(health);
  } catch (error) {
    logAdminAudit(req, {
      action: 'admin_health_check',
      outcome: 'failure',
      details: {
        message: error.message
      }
    });
    
    return res.status(500).json({
      error: {
        code: 'ADMIN_HEALTH_CHECK_FAILED',
        message: 'Failed to check system health',
        retryable: true,
        details: error.message
      }
    });
  }
});

app.get('/admin/auth/check', requireAdminToken, async (req, res) => {
  logAdminAudit(req, {
    action: 'admin_auth_check',
    outcome: 'success'
  });

  return res.json({
    ok: true,
    checked_at: new Date().toISOString()
  });
});

app.get('/admin/audit-logs', requireAdminToken, async (req, res) => {
  try {
    const items = await listAdminAuditLogs(req.query.limit || 50, {
      action: req.query.action,
      outcome: req.query.outcome
    });
    return res.json({
      count: items.length,
      items
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'ADMIN_AUDIT_LOGS_FAILED',
        message: 'Failed to load admin audit logs',
        retryable: true,
        details: error.message
      }
    });
  }
});

app.post('/webhook/github', async (req, res) => {
  const secret = getSecret('WEBHOOK_SECRET');
  const githubToken = getSecret('GITHUB_TOKEN');
  const openAiApiKey = getSecret('OPENAI_API_KEY');
  const signatureHeader = req.header('x-hub-signature-256') || '';
  const eventName = req.header('x-github-event') || 'unknown';
  const deliveryId = req.header('x-github-delivery') || '';

  if (!secret) {
    return res.status(500).json({
      error: {
        code: 'WEBHOOK_SECRET_MISSING',
        message: 'Webhook secret not configured',
        retryable: false
      }
    });
  }

  const validSignature = isValidGithubSignature({
    rawBody: req.rawBody,
    signatureHeader,
    secret
  });

  if (!validSignature) {
    return res.status(401).json({
      error: {
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Invalid webhook signature',
        retryable: false
      }
    });
  }

  try {
    const result = await handleGithubEvent({
      eventName,
      deliveryId,
      payload: req.body,
      githubToken,
      openAiApiKey
    });

    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'WEBHOOK_PROCESSING_FAILED',
        message: 'Unexpected webhook processing failure',
        retryable: true,
        details: error.message
      }
    });
  }
});

module.exports = app;
