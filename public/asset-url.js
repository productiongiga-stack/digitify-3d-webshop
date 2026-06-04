/** Shared asset URL helper (storefront + admin). */
export function createAssetUrlResolver(config = {}) {
  const cdn = String(config?.platform?.assetCdnBase || '').trim().replace(/\/+$/, '');
  return (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    const rel = value.replace(/^\/+/, '');
    if (cdn && (rel.startsWith('assets/') || rel.startsWith('uploads/'))) {
      return `${cdn}/${rel}`;
    }
    return `/${rel}`;
  };
}
