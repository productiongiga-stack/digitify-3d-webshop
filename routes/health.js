const { getStorageMode } = require('../lib/asset-storage');
const {
  checkStorageReachable,
  checkSample3dAsset,
  checkStripeConfigured,
  checkSmtpConfigured
} = require('../lib/health-checks');

function resolveDatabaseHost() {
  const raw = String(process.env.DATABASE_URL || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname || '';
  } catch {
    return '';
  }
}

function registerHealthRoutes(app, deps) {
  const {
    db,
    APP_VERSION,
    APP_STARTED_AT,
    processInvoiceRemindersSafe,
    getConfig,
    getStripeClient,
    readStoredUpload,
    uploadDir,
    getDbDegraded,
    usePg
  } = deps;

  app.get('/api/health', async (_req, res) => {
    const now = new Date();
    const checks = {
      database: 'error',
      storage: 'unknown',
      sample3d: 'unknown',
      stripe: 'unknown',
      smtp: 'unknown'
    };
    const details = {};

    try {
      const isDegraded = typeof getDbDegraded === 'function' ? !!getDbDegraded() : false;
      const dbRow = await db.prepare('SELECT 1 AS ok').get();
      if (!dbRow?.ok) throw new Error('DB check failed');
      checks.database = isDegraded ? 'degraded' : 'ok';

      let ownerConfigured = false;
      try {
        const owner = await db.prepare("SELECT id FROM users WHERE role = 'OWNER' LIMIT 1").get();
        ownerConfigured = !!owner?.id;
      } catch {
        ownerConfigured = false;
      }

      details.database = {
        status: isDegraded ? 'degraded' : 'ok',
        mode: isDegraded ? 'memory-fallback' : (usePg ? 'postgresql' : 'sqlite'),
        host: resolveDatabaseHost() || null,
        ownerConfigured,
        detail: isDegraded
          ? 'PostgreSQL niet bereikbaar — catalogus-only modus (orders, login en admin-wijzigingen worden niet opgeslagen)'
          : (ownerConfigured
            ? 'PostgreSQL bereikbaar'
            : 'PostgreSQL bereikbaar maar geen owner-account — run npm run setup:production-db')
      };

      const cfg = await getConfig();
      const storage = await checkStorageReachable(readStoredUpload, uploadDir);
      checks.storage = storage.diskWritable || storage.mode !== 'local' ? 'ok' : 'warn';
      details.storage = { ...storage, mode: getStorageMode() };

      const sample3d = await checkSample3dAsset(cfg?.products, readStoredUpload);
      checks.sample3d = sample3d.status === 'ok' ? 'ok' : (sample3d.status === 'skip' ? 'skip' : 'warn');
      details.sample3d = sample3d;

      const smtp = checkSmtpConfigured(cfg);
      checks.smtp = smtp.status;
      details.smtp = smtp;

      const stripe = await checkStripeConfigured(getStripeClient);
      checks.stripe = stripe.status;
      details.stripe = stripe;

      let reminderJob = { skipped: 'idle' };
      try {
        reminderJob = await processInvoiceRemindersSafe(false);
      } catch (reminderErr) {
        reminderJob = { skipped: 'unavailable', detail: reminderErr?.message || 'reminder check failed' };
      }
      const allCriticalOk = (checks.database === 'ok' || checks.database === 'degraded') && checks.sample3d !== 'warn';

      res.json({
        ok: allCriticalOk,
        status: checks.database === 'degraded' ? 'degraded' : (allCriticalOk ? 'healthy' : 'degraded'),
        service: 'digitify-shop',
        version: APP_VERSION,
        now: now.toISOString(),
        uptimeSec: Math.floor((Date.now() - APP_STARTED_AT) / 1000),
        checks,
        details,
        jobs: {
          invoiceReminders: reminderJob?.ok ? `sent:${reminderJob.sent || 0}` : (reminderJob?.skipped || 'idle')
        }
      });
    } catch (err) {
      res.status(503).json({
        ok: false,
        status: 'unhealthy',
        service: 'digitify-shop',
        version: APP_VERSION,
        now: now.toISOString(),
        uptimeSec: Math.floor((Date.now() - APP_STARTED_AT) / 1000),
        checks,
        details,
        error: err.message || 'Health check failed'
      });
    }
  });
}

module.exports = { registerHealthRoutes };
