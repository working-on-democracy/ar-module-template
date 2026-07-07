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
import unlitMaterial from "./a-frame-components/unlit-material";
import renderOrder from "./a-frame-components/render-order";
import billboard from "./a-frame-components/billboard";
import groundDecal from "./a-frame-components/ground-decal";
import lodObject from "./a-frame-components/lod-object";
import lodManager from "./a-frame-components/lod-manager";
import attachTo from "./a-frame-components/attach-to";
import glowstickField from "./a-frame-components/glowstick-field";
import glowstickMotion from "./a-frame-components/glowstick-motion";
import videoTarget from "./image-targets/video-target.json";
import type { Manifest } from "../lib/manifest.types";

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  // NOTE: the host now assigns the <a-camera> its id ("camera") itself
  // (see lib/preview.ts / lib/preview-ar.ts), so ArModule.vue's
  // `attach-to="target: #camera"` still resolves without a manifest `camera`
  // entry. `id` is now forbidden in camera settings (lib/manifest.types.ts).
  components: {
    "no-frustum-cull": noFrustumCull,
    "unlit-material": unlitMaterial,
    "render-order": renderOrder,
    billboard: billboard,
    "ground-decal": groundDecal,
    "lod-object": lodObject,
    // Drives every lod-object; place it on the module root (see ArModule.vue).
    "lod-manager": lodManager,
    // Makes an entity follow another's world position (our xrextras-attach stand-in).
    "attach-to": attachTo,
    // Auto-places the whole glowstick field (see the component for parameters).
    "glowstick-field": glowstickField,
    // Per-stick wave (on approach) + idle float; authored by glowstick-field.
    "glowstick-motion": glowstickMotion
  },

  imageTargets: [videoTarget]
};

export default manifest;
