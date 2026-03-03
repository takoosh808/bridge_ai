const { query } = require('../db');

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

async function writeAdminAuditLog({
  action,
  outcome,
  path,
  method,
  clientIp,
  details
}) {
  await query(
    `
      INSERT INTO admin_audit_logs (
        action,
        outcome,
        path,
        method,
        client_ip,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      action,
      outcome,
      path,
      method,
      clientIp,
      JSON.stringify(details || {})
    ]
  );
}

function logAdminAudit(req, { action, outcome, details = {} }) {
  const record = {
    ts: new Date().toISOString(),
    action,
    outcome,
    path: req.originalUrl,
    method: req.method,
    client_ip: getClientIp(req),
    details
  };

  process.stdout.write(`[audit] ${JSON.stringify(record)}\n`);

  writeAdminAuditLog({
    action,
    outcome,
    path: req.originalUrl,
    method: req.method,
    clientIp: getClientIp(req),
    details
  }).catch((error) => {
    process.stderr.write(`[audit] failed to persist admin audit log: ${error.message}\n`);
  });
}

async function listAdminAuditLogs(limit = 50, filters = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const values = [];
  const whereClauses = [];

  const action = (filters.action || '').trim();
  const outcome = (filters.outcome || '').trim();

  if (action) {
    values.push(action);
    whereClauses.push(`action = $${values.length}`);
  }

  if (outcome) {
    values.push(outcome);
    whereClauses.push(`outcome = $${values.length}`);
  }

  values.push(safeLimit);
  const limitParam = `$${values.length}`;
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const result = await query(
    `
      SELECT id, action, outcome, path, method, client_ip, details, created_at
      FROM admin_audit_logs
      ${whereSql}
      ORDER BY id DESC
      LIMIT ${limitParam}
    `,
    values
  );

  return result.rows;
}

module.exports = {
  logAdminAudit,
  listAdminAuditLogs
};
