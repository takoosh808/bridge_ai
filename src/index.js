const app = require('./app');
const { initDatabase } = require('./db');
const { startRetentionScheduler } = require('./retention/runner');

const port = Number(process.env.PORT || 8000);

async function start() {
  await initDatabase();
  startRetentionScheduler();

  app.listen(port, () => {
    process.stdout.write(`Bridge API running on port ${port}\n`);
  });
}

start().catch((error) => {
  process.stderr.write(`Failed to start Bridge API: ${error.message}\n`);
  process.exit(1);
});
