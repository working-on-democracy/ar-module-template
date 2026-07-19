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
// Naming convention for src/a-frame-components/ and src/assets/, so files
// from different features can share these two flat folders (both are
// scanned/imported by plain file name — src/assets/ in particular is
// scanned non-recursively by the Vite plugin above, so subfolders there
// silently don't work) without needing to be sorted into subfolders or
// moved when copied into another project:
//   - a feature's own files are prefixed with its name, e.g. sound-*.ts /
//     sound-*.webp for everything specific to the sound-button feature —
//     this also groups them together under plain alphabetical sort.
//   - genuinely generic, feature-agnostic building blocks that any feature
//     may depend on keep an unprefixed or `ar-`-prefixed name instead (e.g.
//     ar-button.ts, ar-button-manager.ts, no-frustum-cull.ts) — don't give
//     these a feature prefix even if only one feature currently uses them.
import { manifest as assetManifest } from "virtual:ar-manifest";

import noFrustumCull from "./a-frame-components/no-frustum-cull";
import arButtonManager from "./a-frame-components/ar-button-manager";
import arButton from "./a-frame-components/ar-button";
import soundController from "./a-frame-components/sound-controller";
import soundButton from "./a-frame-components/sound-button";
import videoTarget from "./image-targets/video-target.json";
import type { Manifest } from "../lib/manifest.types";

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  components: {
    "no-frustum-cull": noFrustumCull,
    // Generic 3D button/trigger-zone system — see ar-button.ts /
    // ar-button-manager.ts and examples/ar-button-usage.html.
    "ar-button-manager": arButtonManager,
    "ar-button": arButton,
    // Sound playback built on top of ar-button — see sound-controller.ts /
    // sound-button.ts and examples/sound-gui-panel.html.
    "sound-controller": soundController,
    "sound-button": soundButton
  },

  imageTargets: [videoTarget]
};

export default manifest;
