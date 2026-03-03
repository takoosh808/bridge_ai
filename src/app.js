const express = require('express');
const { isValidGithubSignature } = require('./webhook/verifySignature');
const { handleGithubEvent } = require('./webhook/handleGithubEvent');
const { getSummary, getProcessedEvent, listDeadLetterEvents } = require('./summary/store');

const app = express();

app.use(express.json({
  verify: (req, res, buffer) => {
    req.rawBody = buffer;
  }
}));

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

app.post('/webhook/github', async (req, res) => {
  const secret = process.env.WEBHOOK_SECRET || '';
  const githubToken = process.env.GITHUB_TOKEN || '';
  const openAiApiKey = process.env.OPENAI_API_KEY || '';
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
