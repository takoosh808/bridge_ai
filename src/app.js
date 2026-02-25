const express = require('express');
const { isValidGithubSignature } = require('./webhook/verifySignature');
const { handleGithubEvent } = require('./webhook/handleGithubEvent');

const app = express();

app.use(express.json({
  verify: (req, res, buffer) => {
    req.rawBody = buffer;
  }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhook/github', async (req, res) => {
  const secret = process.env.WEBHOOK_SECRET || '';
  const githubToken = process.env.GITHUB_TOKEN || '';
  const signatureHeader = req.header('x-hub-signature-256') || '';
  const eventName = req.header('x-github-event') || 'unknown';
  const deliveryId = req.header('x-github-delivery') || '';

  if (!secret) {
    return res.status(500).json({ error: 'webhook secret not configured' });
  }

  const validSignature = isValidGithubSignature({
    rawBody: req.rawBody,
    signatureHeader,
    secret
  });

  if (!validSignature) {
    return res.status(401).json({ error: 'invalid webhook signature' });
  }

  try {
    const result = await handleGithubEvent({
      eventName,
      deliveryId,
      payload: req.body,
      githubToken
    });

    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return res.status(500).json({
      error: 'webhook_processing_failed',
      details: error.message
    });
  }
});

module.exports = app;
