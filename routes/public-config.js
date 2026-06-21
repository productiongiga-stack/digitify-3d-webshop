const { buildPublicConfigPayload } = require('../lib/public-config');

function registerPublicConfigRoutes(app, deps) {
  const { getPublicConfigPayload, resolveAppBaseUrl, configCacheTtlMs = 300000 } = deps;

  app.get('/api/config', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Vary', 'Accept-Encoding');
    try {
      const payload = typeof getPublicConfigPayload === 'function'
        ? await getPublicConfigPayload()
        : buildPublicConfigPayload(await deps.getConfig(), typeof resolveAppBaseUrl === 'function' ? await resolveAppBaseUrl() : '');
      res.json(payload);
    } catch (err) {
      res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30');
      res.status(503).json({ error: 'Catalogus tijdelijk niet beschikbaar' });
    }
  });
}

module.exports = { registerPublicConfigRoutes, buildPublicConfigPayload };
