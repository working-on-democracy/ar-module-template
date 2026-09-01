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
import proximityOpacity from "./a-frame-components/proximity-opacity";
import proximityCutout from "./a-frame-components/proximity-cutout";
import materialProperties from "./a-frame-components/material-properties";
import reflectionProbe from "./a-frame-components/reflection-probe";
import spin from "./a-frame-components/spin";
import type { Manifest } from "../lib/manifest.types";
import { patchGLTFLoaderWithMeshoptDecoder } from "../lib/gltf-meshopt-setup";
// AN ALLE! final printed image target (archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md), replacing the placeholder
// "video-target" used throughout the design/testing phase — same shared
// target across all three Themenfeld branches (01.09.2026, author's
// decision). Compiled via `npx @8thwall/image-target-cli@latest`
// (PLANAR, full-image crop — the interactive CLI only offers a forced
// 4:3/3:4 default crop, but the underlying compiler itself has no such
// restriction, so this used a small standalone script calling its
// `applyCrop` directly with the full square instead).
import anAlleTarget from "./image-targets/an-alle-target.json";

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
    // Drives a sibling material-properties component's own `opacity` field
    // from this entity's own live camera distance — see proximity-opacity.ts.
    "proximity-opacity": proximityOpacity,
    // Camera-proximity cutout sphere — see proximity-cutout.ts and
    // examples/proximity-cutout-usage.html.
    "proximity-cutout": proximityCutout,
    // Manual PBR material tuning (roughness/metalness/opacity/emissive) —
    // see material-properties.ts and examples/material-properties-usage.html.
    "material-properties": materialProperties,
    // Real-time environment reflections for metallic materials via a
    // shared THREE.CubeCamera — see reflection-probe.ts (generalized from
    // this scene's own first build of this idea).
    "reflection-probe": reflectionProbe,
    // Generic continuously-spinning-entity component whose speed reacts
    // live to camera proximity and/or an externally-fed hold-boost — see
    // spin.ts.
    spin: spin
  },

  // AN ALLE! final shared image target (s. o.).
  imageTargets: [anAlleTarget]
};

export default manifest;
