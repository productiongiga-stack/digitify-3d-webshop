const { getPlatformAssetMeta } = require('./asset-storage');
const { getUploadPlatformLimits } = require('./direct-upload-limit');

function buildPublicConfigPayload(cfg = {}, baseUrl = '') {
  const safe = { ...cfg };
  if (safe.smtp) safe.smtp = { ...safe.smtp, pass: undefined, user: undefined };
  const platform = getPlatformAssetMeta(baseUrl);
  safe.platform = {
    assetCdnBase: platform.assetCdnBase,
    assetStorage: platform.assetStorage,
    assetUrlMode: platform.assetUrlMode,
    ...getUploadPlatformLimits()
  };
  return safe;
}

module.exports = { buildPublicConfigPayload };
