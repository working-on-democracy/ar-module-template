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
//
// This module ("Liquid Civic Mirror" / DMS) bundles its own JSON data and poster
// textures inside the dms-mirror-shards component, so it declares no <a-assets>
// entries and no image targets — it uses 8th Wall world tracking.
import { manifest as assetManifest } from "virtual:ar-manifest";
import type { ComponentDefinition } from "aframe";

import { getDmsComponents } from "./a-frame-components/dms-mirror-shards";
import noFrustrumCull from "./a-frame-components/no-frustrum-cull";

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
  // Auto-scanned from src/assets/ (empty for this module — the DMS component
  // imports its own data/textures directly).
  assets: assetManifest.assets,

  // Matches the old standalone scene's <a-camera> (src/index.html): eye-height,
  // a raycaster for .cantap interaction, and a mouse-driven cursor.
  camera: {
    raycaster: "objects: .cantap; far: 12",
    cursor: "fuse: false; rayOrigin: mouse;",
    position: "0 1.58 0"
  },

  // dms-mirror-shards + dms-world-room-anchor (plus inert diagnostic helpers),
  // captured from the ported component module, plus no-frustrum-cull.
  components: {
    ...getDmsComponents(),
    "no-frustrum-cull": noFrustrumCull
  },

  // World tracking — no image targets.
  imageTargets: []
};

export default manifest;
