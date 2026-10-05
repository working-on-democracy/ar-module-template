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
import europaplatzIiDistancePlaceInterval from "./a-frame-components/europaplatz-ii-distance-place-interval";
import arButtonManager from "./a-frame-components/ar-button-manager";
import arButton from "./a-frame-components/ar-button";
import soundController from "./a-frame-components/sound-controller";
import soundButton from "./a-frame-components/sound-button";
import proximityFade from "./a-frame-components/proximity-fade";
import proximityFadeDither from "./a-frame-components/proximity-fade-dither";
import proximityCutout from "./a-frame-components/proximity-cutout";
import mirrorShard from "./a-frame-components/mirror-shard";
import liquidTexture from "./a-frame-components/liquid-texture";
import followNode from "./a-frame-components/follow-node";
import wanderInBand from "./a-frame-components/wander-in-band";
import randomField from "./a-frame-components/random-field";
import proximityWave from "./a-frame-components/proximity-wave";
import proximityWaveGroup from "./a-frame-components/proximity-wave-group";
import lodObject from "./a-frame-components/lod-object";
import lodManager from "./a-frame-components/lod-manager";
import billboard from "./a-frame-components/billboard";
import unlitMaterial from "./a-frame-components/unlit-material";
import renderOrder from "./a-frame-components/render-order";
import meshRenderOrder from "./a-frame-components/mesh-render-order";
import materialProperties from "./a-frame-components/material-properties";
import ditherMaterial from "./a-frame-components/dither-material";
import trimLoopClip from "./a-frame-components/trim-loop-clip";
import attachTo from "./a-frame-components/attach-to";
import groundDecal from "./a-frame-components/ground-decal";
import xrLight from "./a-frame-components/xr-light";
import cubemapStatic from "./a-frame-components/cubemap-static";
import cubemapRealtime from "./a-frame-components/cubemap-realtime";
import legacySpace from "./a-frame-components/legacy-space";
import holdDrag from "./a-frame-components/hold-drag";
import crossfadeLoopClip from "./a-frame-components/crossfade-loop-clip";
import legacyAttach from "./a-frame-components/legacy-attach";
import legacyPortal from "./a-frame-components/legacy-portal";
import type { Manifest } from "../lib/manifest.types";
import { usedComponents } from "virtual:abv-used-components";
import { patchGLTFLoaderWithMeshoptDecoder } from "../lib/gltf-meshopt-setup";

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
    // #4 Europaplatz II: places the slat models one by one in front of the
    // camera after Start — see europaplatz-ii-distance-place-interval.ts.
    "europaplatz-ii-distance-place-interval": europaplatzIiDistancePlaceInterval,
    // Generic 3D button/trigger-zone system — see ar-button.ts /
    // ar-button-manager.ts and examples/ar-button-usage.html.
    "ar-button-manager": arButtonManager,
    "ar-button": arButton,
    // Sound playback built on top of ar-button — see sound-controller.ts /
    // sound-button.ts and examples/sound-gui-panel.html.
    "sound-controller": soundController,
    "sound-button": soundButton,
    // Camera-proximity opacity fade — see proximity-fade-shared.ts and
    // examples/proximity-fade-usage.html. (proximity-fade-shared.ts itself
    // isn't a component, so it's not registered here — it's the factory
    // proximity-fade.ts/proximity-fade-dither.ts are built from.)
    "proximity-fade": proximityFade,
    "proximity-fade-dither": proximityFadeDither,
    // Camera-proximity cutout sphere — see proximity-cutout.ts and
    // examples/proximity-cutout-usage.html.
    "proximity-cutout": proximityCutout,
    // Glass "mirror shard" field — see mirror-shard.ts and
    // examples/mirror-shard-usage.html. Its optional inner illustration
    // layer samples liquid-texture, a separate generic effect (not
    // mirror-shard-specific — no feature prefix, see the naming-convention
    // comment above) usable standalone on any entity.
    "mirror-shard": mirrorShard,
    "liquid-texture": liquidTexture,
    // Generic transform-driving utilities — see follow-node.ts /
    // wander-in-band.ts, examples/follow-node-usage.html and
    // examples/wander-in-band-usage.html. Neither touches any shared state
    // (no document listeners, no camera, no materials), so they're free to
    // combine with any other feature or with each other.
    "follow-node": followNode,
    "wander-in-band": wanderInBand,
    // Random placement field — see random-field.ts and
    // examples/random-field-usage.html. Clones entities you reference by
    // id; knows nothing about LOD, render order, or motion.
    "random-field": randomField,
    // Proximity-triggered wave/idle motion — see proximity-wave.ts /
    // proximity-wave-group.ts and examples/proximity-wave-usage.html.
    "proximity-wave": proximityWave,
    "proximity-wave-group": proximityWaveGroup,
    // LOD + billboard cross-fade system — see lod-object.ts / lod-manager.ts,
    // examples/lod-billboard-usage.html, and
    // cross-feature-reference-docs/RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md for how this composes with
    // render-order below. unlit-material is the flat/shadeless material
    // technique the billboard side typically wants (generic, not
    // LOD-specific — see unlit-material.ts).
    "lod-object": lodObject,
    "lod-manager": lodManager,
    billboard: billboard,
    "unlit-material": unlitMaterial,
    // Per-mesh draw order for overlapping transparent surfaces — see
    // render-order.ts, examples/render-order-usage.html, and
    // cross-feature-reference-docs/RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md.
    "render-order": renderOrder,
    // Per-NAMED-mesh draw order within a single glTF asset — a finer
    // granularity than render-order above (whole-model vs. named-submesh).
    // See mesh-render-order.ts, examples/mesh-render-order-usage.html, and
    // guides/MESH-RENDER-ORDER-FEATURE-GUIDE.md (incompatible with lod-object —
    // see that guide's incompatibilities section).
    "mesh-render-order": meshRenderOrder,
    // Manual PBR material tuning (roughness/metalness/opacity/emissive) for
    // any loaded model — see material-properties.ts,
    // examples/material-properties-usage.html, and
    // guides/MATERIAL-PROPERTIES-FEATURE-GUIDE.md. Tunes the existing material in
    // place (unlike unlit-material, which replaces it outright) — don't
    // combine the two on the same entity, see that guide's incompatibilities
    // section.
    "material-properties": materialProperties,
    // Manual (non-distance-driven) dithered transparency — see
    // dither-material.ts, examples/dither-material-usage.html, and
    // guides/DITHER-MATERIAL-FEATURE-GUIDE.md. A fourth material.onBeforeCompile
    // writer alongside proximity-fade-dither/proximity-cutout/lod-object's
    // internal dithering — see cross-feature-reference-docs/RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md §4.4
    // before combining any two of them on the same material.
    "dither-material": ditherMaterial,
    // Trims a glTF animation's dead lead-in (from a Blender export whose
    // preview range didn't start at frame 0) and loops it, keeping multiple
    // clips on one model in sync — see trim-loop-clip.ts,
    // examples/trim-loop-clip-usage.html, and
    // guides/TRIM-LOOP-CLIP-FEATURE-GUIDE.md. Use INSTEAD of animation-mixer on
    // the same entity.
    "trim-loop-clip": trimLoopClip,
    // Makes an entity follow another entity's world position (+ offset)
    // every frame, even if it isn't that entity's DOM child — see
    // attach-to.ts, examples/attach-to-usage.html, and
    // guides/ATTACH-TO-FEATURE-GUIDE.md (writes position every tick — don't
    // combine with wander-in-band/proximity-wave on the same entity).
    "attach-to": attachTo,
    // Pins a decal plane flat on the ground under its parent's pivot and
    // excludes it from scene fog — see ground-decal.ts,
    // examples/ground-decal-usage.html, and guides/GROUND-DECAL-FEATURE-GUIDE.md.
    "ground-decal": groundDecal,
    // Augmented Bahnhofsviertel shared building blocks, ported from the
    // original 8th Wall projects under their original names so old scene
    // markup carries over — see augmented-bahnhofsviertel/PORTING-GUIDE.md.
    // xr-light drives a light from XR8 light estimation; cubemap-static /
    // cubemap-realtime set a static / camera-feed environment map (both
    // clone materials before writing envMap, see env-map-shared.ts).
    "xr-light": xrLight,
    "cubemap-static": cubemapStatic,
    "cubemap-realtime": cubemapRealtime,
    // Hosts an unchanged old 8th Wall scene and places it module-locally in
    // front of the camera (replaces the old global recenter); hold-drag is
    // xrextras-hold-drag made to work inside such transformed parents — see
    // legacy-space.ts / hold-drag.ts and augmented-bahnhofsviertel/PORTING-GUIDE.md §6.
    "legacy-space": legacySpace,
    "hold-drag": holdDrag,
    // Seamless loop for animations that weren't authored to loop: cross-fades
    // the clip's end into its start — see crossfade-loop-clip.ts. Use instead
    // of animation-mixer on the same entity.
    "crossfade-loop-clip": crossfadeLoopClip,
    // xrextras-attach for targets outside the hull (e.g. a light following
    // the host camera): offset stays in old scene units/axes — see
    // legacy-attach.ts.
    "legacy-attach": legacyAttach,
    // Walk-through portal of the old portal works (#22, #7): the camera's
    // position, converted into the hull, switches contents/hider walls —
    // see legacy-portal.ts.
    "legacy-portal": legacyPortal
  },

  // Augmented Bahnhofsviertel: the old scenes bring their complete lighting,
  // so the host's two always-on lights are dimmed to 30 % while a work is
  // shown (chosen 2026-10-05 after a phone comparison on #1; applied by the
  // template's module root, lib/main.ts → lib/host-lights.ts).
  hostLightScale: 0.3

  // No image targets registered by default — see guides/IMAGE-TRACKING-FEATURE-GUIDE.md
  // for how to add one (an `imageTargets: [yourTarget]` entry here, importing
  // your own src/image-targets/*.json).
};

// Augmented Bahnhofsviertel: register only the components this module
// actually uses (found by scanning the module's files at build time — see
// scripts/abv-used-components.ts). Every extra name would compete with other
// modules in the shared host scene, where the first registration wins.
manifest.components = Object.fromEntries(
  Object.entries(manifest.components ?? {}).filter(([name]) => usedComponents.includes(name))
);

export default manifest;
