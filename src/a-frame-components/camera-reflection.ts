import { ComponentDefinition } from "aframe";

// Turns the entity's mesh into a real mirror by reflecting the live camera feed.
//
// 8th Wall renders the camera passthrough into a THREE.Texture each frame and
// hands it to us via `XR8.Threejs.xrScene().cameraTexture` (this is on by
// default — `renderCameraTexture: true`). We use that texture as the material's
// environment map, so a metallic/zero-roughness surface reflects the real world
// instead of an empty AR scene (where plain `metalness` just looks black).
//
// The reflection is screen-aligned, not a physically exact cubemap — but for a
// chrome/mirror placeholder it reads convincingly as "reflecting the camera".
//
// Registered via the module manifest and applied in ArModule.vue:
//   <a-octahedron camera-reflection material="metalness: 1; roughness: 0">
export default {
  init(this: any) {
    this.applied = false;
  },

  // Apply on tick because both the mesh (after geometry init) and the 8th Wall
  // scene/cameraTexture (after the engine boots) appear asynchronously. Once
  // wired up the reflection updates every frame on its own — so we stop.
  tick(this: any) {
    if (this.applied) return;

    const THREE = (window as any).THREE;
    const XR8 = (window as any).XR8;
    const mesh = this.el.getObject3D("mesh");
    if (!THREE || !XR8?.Threejs?.xrScene || !mesh) return;

    const xrScene = XR8.Threejs.xrScene();
    const cameraTexture = xrScene && xrScene.cameraTexture;
    if (!cameraTexture) return;

    // Sample the (flat) camera texture as an equirectangular reflection.
    cameraTexture.mapping = THREE.EquirectangularReflectionMapping;

    const applyTo = (material: any) => {
      if (!material) return;
      material.envMap = cameraTexture;
      material.metalness = 1;
      material.roughness = 0;
      // Recompile the shader to include the envMap; the engine keeps uploading
      // the texture's pixels itself, so we must NOT set cameraTexture.needsUpdate.
      material.needsUpdate = true;
    };

    const mat = (mesh as any).material;
    if (Array.isArray(mat)) mat.forEach(applyTo);
    else applyTo(mat);

    this.applied = true;
  }
} as ComponentDefinition;