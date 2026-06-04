const { getStorageMode } = require('../lib/asset-storage');
const {
  checkStorageReachable,
  checkSample3dAsset,
  checkStripeConfigured,
  checkSmtpConfigured
} = require('../lib/health-checks');

function registerHealthRoutes(app, deps) {
  const {
    db,
    APP_VERSION,
    APP_STARTED_AT,
    processInvoiceRemindersSafe,
    getConfig,
    getStripeClient,
    readStoredUpload,
    uploadDir
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
      const dbRow = await db.prepare('SELECT 1 AS ok').get();
      if (!dbRow?.ok) throw new Error('DB check failed');
      checks.database = 'ok';

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

      const reminderJob = await processInvoiceRemindersSafe(false);
      const allCriticalOk = checks.database === 'ok' && checks.sample3d !== 'warn';

      res.json({
        ok: allCriticalOk,
        status: allCriticalOk ? 'healthy' : 'degraded',
        service: 'nebulous-api',
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
        service: 'nebulous-api',
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
