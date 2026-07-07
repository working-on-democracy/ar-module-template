// Animated skinned meshes get frustum-culled by three.js: their bind-pose
// bounding sphere doesn't cover where the skeleton moves the geometry, so the
// model silently disappears once animation-mixer runs. Disabling culling on the
// loaded model's meshes fixes it. Shared by the `no-frustum-cull` A-Frame
// component and both dev previews so the logic lives in exactly one place.
//
// Call on a `model-loaded` event's target (the glTF's meshes only exist once the
// model has loaded).
export function disableFrustumCulling(el: any): void {
  el?.object3D?.traverse?.((o: any) => {
    if (o.isMesh) o.frustumCulled = false;
  });
}