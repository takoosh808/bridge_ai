const crypto = require('crypto');

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidGithubSignature({ rawBody, signatureHeader, secret }) {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }

  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expected = `sha256=${digest}`;
  return timingSafeEqualString(expected, signatureHeader);
}

module.exports = {
  isValidGithubSignature
};
