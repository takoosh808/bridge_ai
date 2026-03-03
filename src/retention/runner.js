const { cleanupExpiredData } = require('../summary/store');

function getRetentionDays() {
  return Math.max(1, Number(process.env.DATA_RETENTION_DAYS || 30));
}

function getCleanupIntervalMs() {
  const minutes = Math.max(5, Number(process.env.RETENTION_CLEANUP_INTERVAL_MINUTES || 360));
  return minutes * 60 * 1000;
}

async function runRetentionCleanup() {
  const retentionDays = getRetentionDays();
  return cleanupExpiredData(retentionDays);
}

function startRetentionScheduler() {
  const intervalMs = getCleanupIntervalMs();

  const timer = setInterval(async () => {
    try {
      const result = await runRetentionCleanup();
      process.stdout.write(
        `[retention] cleanup completed: summaries=${result.deleted.summaries}, webhook_events=${result.deleted.webhook_events}, dead_letter_events=${result.deleted.dead_letter_events}\n`
      );
    } catch (error) {
      process.stderr.write(`[retention] cleanup failed: ${error.message}\n`);
    }
  }, intervalMs);

  timer.unref();
  return timer;
}

module.exports = {
  runRetentionCleanup,
  startRetentionScheduler
};
