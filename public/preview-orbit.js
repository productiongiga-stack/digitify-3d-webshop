/**
 * Shared pointer drag + zoom for Three.js preview canvases.
 */
export const PREVIEW_DRAG_YAW = 0.0085;
export const PREVIEW_DRAG_PITCH = 0.0065;
export const PREVIEW_DRAG_PITCH_LIMIT = 0.55;
export const PREVIEW_ZOOM_STEP = 1.14;
export const PREVIEW_ZOOM_MIN = 0.4;
export const PREVIEW_ZOOM_MAX = 3.2;

export function createPreviewOrbit({
  canvas,
  getModelGroup,
  getCanInteract = () => true,
  onRender = () => {},
  onDragStart = () => {},
  onDragEnd = () => {},
  zoomButtons = {},
  enableZoom = true,
  viewState = { zoom: 1, target: null, baseDistance: 5 },
  camera,
  THREE,
  fitCamera,
  resetView
}) {
  if (!canvas) return { dispose: () => {} };

  const abort = new AbortController();
  const { signal } = abort;
  canvas.style.touchAction = 'none';

  const drag = {
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0
  };

  const endDrag = () => {
    if (!drag.active) return;
    drag.active = false;
    drag.pointerId = null;
    canvas.classList.remove('is-dragging');
    onDragEnd();
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (!getCanInteract() || !getModelGroup()) return;
    drag.active = true;
    drag.pointerId = event.pointerId;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture(event.pointerId);
    onDragStart();
    event.preventDefault();
  }, { signal });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    const group = getModelGroup();
    if (!group) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    group.rotation.y += dx * PREVIEW_DRAG_YAW;
    group.rotation.x = THREE.MathUtils.clamp(
      group.rotation.x + dy * PREVIEW_DRAG_PITCH,
      -PREVIEW_DRAG_PITCH_LIMIT,
      PREVIEW_DRAG_PITCH_LIMIT
    );
    onRender();
    event.preventDefault();
  }, { signal });

  canvas.addEventListener('pointerup', endDrag, { signal });
  canvas.addEventListener('pointercancel', endDrag, { signal });
  canvas.addEventListener('lostpointercapture', endDrag, { signal });

  const adjustZoom = (factor) => {
    if (!getCanInteract() || !camera || !viewState.target) return;
    viewState.zoom = THREE.MathUtils.clamp(viewState.zoom * factor, PREVIEW_ZOOM_MIN, PREVIEW_ZOOM_MAX);
    const offset = camera.position.clone().sub(viewState.target);
    if (offset.lengthSq() < 1e-8) offset.set(0, 0, 1);
    offset.normalize().multiplyScalar(viewState.baseDistance / viewState.zoom);
    camera.position.copy(viewState.target).add(offset);
    camera.lookAt(viewState.target);
    camera.updateProjectionMatrix();
    onRender();
  };

  if (enableZoom) {
    canvas.addEventListener('dblclick', (event) => {
      if (!getCanInteract()) return;
      resetView?.();
      event.preventDefault();
    }, { signal });

    canvas.addEventListener('wheel', (event) => {
      if (!getCanInteract()) return;
      event.preventDefault();
      adjustZoom(event.deltaY < 0 ? PREVIEW_ZOOM_STEP : 1 / PREVIEW_ZOOM_STEP);
    }, { signal, passive: false });

    zoomButtons.in?.addEventListener('click', () => adjustZoom(PREVIEW_ZOOM_STEP), { signal });
    zoomButtons.out?.addEventListener('click', () => adjustZoom(1 / PREVIEW_ZOOM_STEP), { signal });
    zoomButtons.reset?.addEventListener('click', () => resetView?.(), { signal });
  }

  return {
    dispose: () => abort.abort(),
    adjustZoom,
    isDragging: () => drag.active
  };
}
