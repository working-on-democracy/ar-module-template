import { ComponentDefinition } from "aframe";

// Turns the entity's mesh into a live mirror that reflects the real camera feed.
//
// Why this is fiddly: 8th Wall renders the camera passthrough into a THREE
// texture (`XR8.Threejs.xrScene().cameraTexture`), but that texture is owned by
// 8th Wall's OWN renderer, not A-Frame's — so binding it directly leaves
// A-Frame's renderer with no pixels for it (black). However, in the `xrweb`
// path 8th Wall draws into A-Frame's canvas, i.e. the SAME WebGL context, so the
// underlying GL texture *handle* is valid in A-Frame's renderer too. We create
// our own A-Frame-side THREE texture and, every frame, point its GL handle at
// 8th Wall's camera texture, then reflect it.
//
// We reflect with a MeshBasicMaterial (not PBR): MeshStandardMaterial.envMap is
// run through three.js PMREM, which snapshots the environment once (before the
// feed exists) and caches it — hence the earlier "black with light flashes". A
// MeshBasicMaterial samples its envMap directly every frame, staying live.
//
// The feed is a flat 2D texture sampled as an equirectangular reflection, so
// it's a stylised mirror, not a physically exact cubemap — fine for a chrome
// placeholder that visibly reflects the real world. Falls back silently (keeps
// the entity's existing material) when there's no engine/feed, e.g. the VR
// preview.
//
// Registered via the module manifest and applied in ArModule.vue:
//   <a-octahedron camera-reflection ...>
export default {
  init(this: any) {
    this.feedTex = null;
  },

  tick(this: any) {
    const THREE = (window as any).THREE;
    const XR8 = (window as any).XR8;
    const renderer = this.el.sceneEl?.renderer;
    const mesh = this.el.getObject3D("mesh");
    if (!THREE || !XR8?.Threejs?.xrScene || !renderer || !mesh) return;

    const xrScene = XR8.Threejs.xrScene();
    const cameraTexture = xrScene && xrScene.cameraTexture;
    const srcProps = xrScene?.renderer?.properties?.get?.(cameraTexture);
    const glHandle = srcProps && srcProps.__webglTexture;
    if (!glHandle) return; // engine hasn't produced the feed texture yet

    // One-time: build an A-Frame-side texture + live mirror material.
    if (!this.feedTex) {
      const feedTex = new THREE.Texture();
      feedTex.mapping = THREE.EquirectangularReflectionMapping;
      feedTex.flipY = false; // GL textures are already bottom-up
      this.feedTex = feedTex;

      const mirror = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        envMap: feedTex,
        reflectivity: 1,
        combine: THREE.MixOperation
      });
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(() => mirror);
      else mesh.material = mirror;
    }

    // Every frame: alias our texture's GL handle to 8th Wall's camera texture.
    // version 0 + __webglInit true makes three bind the existing handle instead
    // of trying to (re)upload pixels it doesn't own.
    const dstProps = renderer.properties.get(this.feedTex);
    dstProps.__webglTexture = glHandle;
    dstProps.__webglInit = true;
  }
} as ComponentDefinition;