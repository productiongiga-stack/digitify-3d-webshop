/** Shared product 3D wizard helpers (loaded before admin.js). */
(function () {
  const GENERIC_MOCKUP = /tshirt_mockup/i;

  function normalizeHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    return m ? `#${m[1].toLowerCase()}` : '';
  }

  function collectPm3dWarnings(modal, draftProduct) {
    const warnings = [];
    const name = (modal.querySelector('#pmName')?.value || draftProduct?.name || '').trim();
    const id = (modal.querySelector('#pmId')?.value || draftProduct?.id || '').trim().toLowerCase();
    const mockupPath = (modal.querySelector('#pmMockupPath')?.value || draftProduct?.mockupPath || '').trim().toLowerCase();
    const enabled = !!modal.querySelector('#pmModel3dEnabled')?.checked;
    const modelPath = (modal.querySelector('#pmModel3dPath')?.value || '').trim();
    const posterPath = (modal.querySelector('#pmModel3dPoster')?.value || '').trim();

    if (!name) warnings.push('Productnaam is verplicht.');
    if (enabled && !modelPath) warnings.push('3D is ingeschakeld maar er is geen model geüpload.');
    if (enabled && modelPath && !posterPath) {
      warnings.push('Upload een poster of maak een snapshot uit de 3D-preview — verplicht voor 3D in de shop.');
    }
    const fmt = (() => {
      const p = modelPath.toLowerCase();
      if (p.endsWith('.obj')) return 'obj';
      if (p.endsWith('.glb') || p.endsWith('.gltf')) return 'glb';
      return '';
    })();
    const materialPath = (modal.querySelector('#pmModel3dMaterial')?.value || '').trim();
    if (enabled && fmt === 'obj' && modelPath && !materialPath) {
      warnings.push('OBJ zonder .mtl: upload het .mtl-bestand (zelfde map als het model) of gebruik GLB met ingebakken textures.');
    }
    return warnings;
  }

  function posterStatusLabel(modal) {
    const enabled = !!modal.querySelector('#pmModel3dEnabled')?.checked;
    const modelPath = (modal.querySelector('#pmModel3dPath')?.value || '').trim();
    const posterPath = (modal.querySelector('#pmModel3dPoster')?.value || '').trim();
    if (!enabled || !modelPath) return null;
    if (!posterPath) return { ok: false, label: 'Poster ontbreekt — aanbevolen voor shopkaarten' };
    return { ok: true, label: `Poster: ${posterPath.split('/').pop()}` };
  }

  window.AdminProduct3d = {
    collectPm3dWarnings,
    posterStatusLabel,
    normalizeHex
  };
})();
