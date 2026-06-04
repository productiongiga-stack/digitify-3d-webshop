const { getPlatformAssetMeta } = require('../lib/asset-storage');

function registerPublicConfigRoutes(app, deps) {
  const { getConfig, resolveAppBaseUrl } = deps;

  app.get('/api/config', async (_req, res) => {
    const cfg = await getConfig();
    const safe = { ...cfg };
    if (safe.smtp) safe.smtp = { ...safe.smtp, pass: undefined, user: undefined };
    const baseUrl = typeof resolveAppBaseUrl === 'function' ? await resolveAppBaseUrl() : '';
    const platform = getPlatformAssetMeta(baseUrl);
    safe.platform = {
      assetCdnBase: platform.assetCdnBase,
      assetStorage: platform.assetStorage,
      assetUrlMode: platform.assetUrlMode
    };
    res.json(safe);
  });
}

module.exports = { registerPublicConfigRoutes };
