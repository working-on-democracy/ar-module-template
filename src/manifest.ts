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

import noFrustumCull from "./a-frame-components/no-frustum-cull";
import proximityFade from "./a-frame-components/proximity-fade";
import proximityFadeDither from "./a-frame-components/proximity-fade-dither";
import proximityCutout from "./a-frame-components/proximity-cutout";
import videoTarget from "./image-targets/video-target.json";
import type { Manifest } from "../lib/manifest.types";
import { patchGLTFLoaderWithMeshoptDecoder } from "../lib/gltf-meshopt-setup";

// Runs as soon as this module is imported — by the local previews AND by the
// production host, since both must import `manifest` to do anything with this
// module. Lets glb assets compressed with `gltfpack -c` actually load; see
// gltf-meshopt-setup.ts for why this is necessary.
patchGLTFLoaderWithMeshoptDecoder();

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  components: {
    "no-frustum-cull": noFrustumCull,
    "proximity-fade": proximityFade,
    "proximity-fade-dither": proximityFadeDither,
    "proximity-cutout": proximityCutout
  },

  imageTargets: [videoTarget]
};

export default manifest;
