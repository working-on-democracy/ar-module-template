// The module's manifest — the single object the host reads off the published
// bundle as `mod.manifest`. It bundles everything the host must wire up *before*
// mounting the component:
//
//   - assets       → injected into the scene's <a-assets> as <a-asset-item>
//   - camera       → attributes applied to the scene's <a-camera>
//   - components   → A-Frame components registered via AFRAME.registerComponent
//
// `assets` is derived automatically from `src/assets/` by the Vite plugin
// (virtual:ar-manifest). The other two are authored here by hand.
import { manifest as assetManifest } from "virtual:ar-manifest";

import noFrustumCull from "./a-frame-components/no-frustum-cull";
import forceShadowMap from "./a-frame-components/force-shadow-map";
import soundButtonManager from "./a-frame-components/sound-button-manager";
import soundButtonGroup from "./a-frame-components/sound-button-group";
import soundButton from "./a-frame-components/sound-button";
import type { Manifest } from "../lib/manifest.types";

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  components: {
    "no-frustum-cull": noFrustumCull,
    "force-shadow-map": forceShadowMap,
    "sound-button-manager": soundButtonManager,
    "sound-button-group": soundButtonGroup,
    "sound-button": soundButton
  }
};

export default manifest;
