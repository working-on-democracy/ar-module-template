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

import type { Manifest } from "../lib/manifest.types";
import { patchGLTFLoaderWithMeshoptDecoder } from "../lib/gltf-meshopt-setup";

// Runs as soon as this module is imported — by the local previews AND by the
// production host, since both must import `manifest` to do anything with this
// module. Lets glb assets compressed with `scripts/glb-compression.ts`
// (gltfpack -c under the hood) actually load; see gltf-meshopt-setup.ts and
// cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md for why this is
// necessary. Safe to call even if a project never compresses any assets —
// idempotent, and a no-op cost otherwise.
patchGLTFLoaderWithMeshoptDecoder();

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  // No A-Frame components yet: the plant's AR test registers its own here.
  components: {}

  // No image targets registered by default — add an
  // `imageTargets: [yourTarget]` entry here, importing your own
  // src/image-targets/*.json.
};

export default manifest;
