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

// Side-effect import: attaches a meshopt decoder to A-Frame's GLTF loader so
// meshopt-compressed .glb files load (A-Frame doesn't wire one up). Runs once
// when the bundle is evaluated — in the host and both previews. See src/meshopt.ts.
import "./meshopt";

import noFrustumCull from "./a-frame-components/no-frustum-cull";
import ditherTransparency from "./a-frame-components/dither-transparency";
import trimLoopClip from "./a-frame-components/trim-loop-clip";
import wanderInBand from "./a-frame-components/wander-in-band";
import followNode from "./a-frame-components/follow-node";
import videoTarget from "./image-targets/video-target.json";
import type { Manifest } from "../lib/manifest.types";

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  components: {
    "no-frustum-cull": noFrustumCull,
    "dither-transparency": ditherTransparency,
    "trim-loop-clip": trimLoopClip,
    "wander-in-band": wanderInBand,
    "follow-node": followNode
  },

  imageTargets: [videoTarget]
};

export default manifest;
