/** Tiny shared helpers (no imports) — safe for runtime ↔ presentation modules. */
export function modelQuality(manifest) {
  return String(manifest?.quality || '').toLowerCase() === 'standard' ? 'standard' : 'high';
}
