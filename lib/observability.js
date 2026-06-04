const crypto = require('crypto');

function parseSentryDsn(dsn) {
  const raw = String(dsn || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const projectId = url.pathname.replace(/^\//, '').split('/')[0];
    const key = url.username;
    if (!key || !projectId) return null;
    const host = url.host;
    return { key, projectId, host, scheme: url.protocol.replace(':', '') };
  } catch {
    return null;
  }
}

async function sendSentryEvent(event) {
  const dsn = parseSentryDsn(process.env.SENTRY_DSN);
  if (!dsn) return false;
  const body = JSON.stringify(event);
  const auth = `Sentry sentry_version=7, sentry_client=nebulous-node/1.0, sentry_key=${dsn.key}`;
  const url = `${dsn.scheme}://${dsn.host}/api/${dsn.projectId}/store/`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': auth
      },
      body
    });
    return res.ok;
  } catch (err) {
    console.warn('Sentry store mislukt:', err?.message || err);
    return false;
  }
}

function captureClientError(payload = {}) {
  const stage = String(payload.stage || 'unknown').slice(0, 40);
  const productId = String(payload.productId || '').slice(0, 80);
  const message = String(payload.message || payload.error || '').slice(0, 500);
  if (!message && !productId) return;

  const event = {
    event_id: crypto.randomBytes(16).toString('hex'),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    message,
    tags: {
      stage,
      productId: productId || undefined
    },
    extra: {
      url: payload.url || null,
      userAgent: payload.userAgent || null
    }
  };

  sendSentryEvent(event).catch(() => {});
}

function captureServerError(err, context = {}) {
  const message = String(err?.message || err || 'Server error').slice(0, 500);
  const event = {
    event_id: crypto.randomBytes(16).toString('hex'),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    message,
    tags: context.tags || {},
    extra: context.extra || {}
  };
  sendSentryEvent(event).catch(() => {});
}

module.exports = {
  parseSentryDsn,
  captureClientError,
  captureServerError
};
