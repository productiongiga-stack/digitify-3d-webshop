const { getPlatformAssetMeta } = require('../lib/asset-storage');
const { getUploadPlatformLimits } = require('../lib/direct-upload-limit');

function registerPublicConfigRoutes(app, deps) {
  const { getConfig, resolveAppBaseUrl } = deps;

  app.get('/api/config', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    const cfg = await getConfig();
    const safe = { ...cfg };
    if (safe.smtp) safe.smtp = { ...safe.smtp, pass: undefined, user: undefined };
    const baseUrl = typeof resolveAppBaseUrl === 'function' ? await resolveAppBaseUrl() : '';
    const platform = getPlatformAssetMeta(baseUrl);
    safe.platform = {
      assetCdnBase: platform.assetCdnBase,
      assetStorage: platform.assetStorage,
      assetUrlMode: platform.assetUrlMode,
      ...getUploadPlatformLimits()
    };
    res.json(safe);
  });
}

module.exports = { registerPublicConfigRoutes };
