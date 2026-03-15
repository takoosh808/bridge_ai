const fs = require('fs');

function readSecretFile(filePath) {
  if (!filePath) {
    return '';
  }

  try {
    if (!fs.existsSync(filePath)) {
      return '';
    }

    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    return '';
  }
}

function getSecret(secretName) {
  const inlineValue = (process.env[secretName] || '').trim();
  if (inlineValue) {
    return inlineValue;
  }

  const fileVarName = `${secretName}_FILE`;
  const filePath = (process.env[fileVarName] || '').trim();
  return readSecretFile(filePath);
}

module.exports = {
  getSecret
};
