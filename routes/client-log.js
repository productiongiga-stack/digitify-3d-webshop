const rateLimit = require('express-rate-limit');
const { captureClientError } = require('../lib/observability');

const clientLogLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

const recentClientLogs = [];
const CLIENT_LOG_RETENTION_MS = 24 * 60 * 60 * 1000;

function pruneClientLogs() {
  const cutoff = Date.now() - CLIENT_LOG_RETENTION_MS;
  while (recentClientLogs.length && recentClientLogs[0].at < cutoff) {
    recentClientLogs.shift();
  }
}

function recordClientLog(entry) {
  pruneClientLogs();
  recentClientLogs.push(entry);
  if (recentClientLogs.length > 500) recentClientLogs.shift();
}

function getRecentClientLogStats() {
  pruneClientLogs();
  const blobErrors = recentClientLogs.filter((e) => /blob:|Kon 3D-resource niet laden/i.test(e.message || ''));
  return {
    total24h: recentClientLogs.length,
    blobErrors24h: blobErrors.length,
    lastBlobError: blobErrors.length ? blobErrors[blobErrors.length - 1] : null
  };
}

function registerClientLogRoutes(app, deps = {}) {
  const { requireAuth, requireRole } = deps;
  app.post('/api/client-log', clientLogLimiter, (req, res) => {
    const body = req.body || {};
    const stage = String(body.stage || 'unknown').slice(0, 40);
    const productId = String(body.productId || '').slice(0, 80);
    const message = String(body.message || body.error || '').slice(0, 500);
    if (message || productId) {
      console.warn('[client-log]', { stage, productId, message });
      recordClientLog({
        at: Date.now(),
        stage,
        productId,
        message
      });
      captureClientError({
        stage,
        productId,
        message,
        url: body.url || null,
        userAgent: req.headers['user-agent'] || null
      });
    }
    res.json({ ok: true });
  });

  if (requireAuth && requireRole) {
    app.get('/api/admin/ops/client-log-stats', requireAuth, requireRole('ADMIN', 'OWNER'), (_req, res) => {
      res.json({ ok: true, stats: getRecentClientLogStats() });
    });
  }
}

module.exports = {
  registerClientLogRoutes,
  getRecentClientLogStats
};
