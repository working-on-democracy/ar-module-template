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
//
// Trimmed 01.09.2026 (production prep, archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md) to only the components this
// branch's own ArModule.vue actually places on an entity — this manifest
// started as the full shared template registry (every a-frame-components/*
// file the whole ar-module-template ships with), which was useful while the
// scene's own design was still in flux, but now just bundles dead code into
// the production ar-module.js. The full registry still lives on
// zwischen-basis/feature_template for whichever NEXT branch needs to pick
// components from it again.
import { manifest as assetManifest } from "virtual:ar-manifest";

import noFrustumCull from "./a-frame-components/no-frustum-cull";
import arButtonManager from "./a-frame-components/ar-button-manager";
import arButton from "./a-frame-components/ar-button";
import wanderInBand from "./a-frame-components/wander-in-band";
import wanderSound from "./a-frame-components/wander-sound";
import type { Manifest } from "../lib/manifest.types";
import { patchGLTFLoaderWithMeshoptDecoder } from "../lib/gltf-meshopt-setup";
// AN ALLE! Zwischen-Basis: placeholder target until the real printed image
// (background structure + emoji + title, per archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md) is designed and compiled.
// Every downstream Themenfeld branch swaps this import for its own target.
import videoTarget from "./image-targets/video-target.json";

// Runs as soon as this module is imported — by the local previews AND by the
// production host, since both must import `manifest` to do anything with this
// module. Lets glb assets compressed with `scripts/compress-assets.ts`
// (gltfpack -c under the hood) actually load; see gltf-meshopt-setup.ts and
// cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md for why this is
// necessary. Safe to call even if a project never compresses any assets —
// idempotent, and a no-op cost otherwise.
patchGLTFLoaderWithMeshoptDecoder();

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  components: {
    "no-frustum-cull": noFrustumCull,
    // Generic 3D button/trigger-zone system — see ar-button.ts /
    // ar-button-manager.ts and examples/ar-button-usage.html. Used here for
    // the wanderers' own tap targets (playback itself is wander-sound.ts's,
    // not sound-controller.ts's single-active mutex).
    "ar-button-manager": arButtonManager,
    "ar-button": arButton,
    // Generic transform-driving utility — see wander-in-band.ts and
    // examples/wander-in-band-usage.html.
    "wander-in-band": wanderInBand,
    // Per-entity tap-to-play/pause sound with a colour/pulse reaction on its
    // own child segments while playing — see wander-sound.ts (AN ALLE!
    // Animationssystem Wanderer, not a single-active mutex like
    // sound-controller.ts: any number of instances may play at once).
    "wander-sound": wanderSound
  },

  // AN ALLE! Zwischen-Basis baseline (s. o.) — placeholder target, real one
  // pending asset design.
  imageTargets: [videoTarget]
};

export default manifest;
