// The module's manifest — the single object the host reads off the published
// bundle as `mod.manifest`. It bundles everything the host must wire up *before*
// mounting the component:
//
//   - assets       → injected into the scene's <a-assets> as <a-asset-item>
//   - camera       → attributes applied to the scene's <a-camera>
//   - components   → A-Frame components registered via AFRAME.registerComponent
//   - imageTargets → XR8 image-target data fed to XR8.XrController.configure
//
// `assets` is derived automatically from `src/assets/` by the Vite plugin
// (virtual:ar-manifest). The other three are authored here by hand.
import { manifest as assetManifest } from "virtual:ar-manifest";
import type { ComponentDefinition } from "aframe";

import noFrustumCull from "./a-frame-components/no-frustum-cull";
import { getDmsComponents } from "./a-frame-components/dms-mirror-shards";

export interface ManifestAsset {
  id: string;
  src: string;
}
/** Attribute → value pairs applied to the scene's <a-camera> before mount. */
export type CameraSettings = Record<string, string>;
export interface Manifest {
  assets: ManifestAsset[];
  camera: CameraSettings;
  /** A-Frame component name → definition, registered before the module mounts. */
  components: Record<string, ComponentDefinition>;
  /** XR8 image-target descriptors (the JSON exported by the 8th Wall target tool). */
  imageTargets: unknown[];
}

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  camera: {
    raycaster: "objects: .cantap",
    cursor: "fuse: false; rayOrigin: mouse;",
    position: "0 8 8"
  },

  components: {
    "no-frustum-cull": noFrustumCull,
    // The DMS "mirror shards" A-Frame components used by ArModule.vue
    // (dms-mirror-shards, dms-world-room-anchor, + inert diagnostic helpers),
    // captured from their registration wrappers. See getDmsComponents().
    ...getDmsComponents()
  },

  // No image targets on this branch — the DMS scene uses 8th Wall world tracking.
  // The image-target machinery (this field, host-runtime's configureImageTargets,
  // and the vite plumbing) is kept intact for future use: drop a target's JSON +
  // images into src/image-targets/, import the JSON here, and add it to this array.
  imageTargets: []
};

export default manifest;
