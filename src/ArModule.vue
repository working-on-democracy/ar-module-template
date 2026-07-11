<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';

interface ArModuleData {
  id: string;
  text: string;
  url: string;
  author: string;
  location: { lat: number; lng: number };
  assets?: { id: string; src: string }[];
  components?: { name: string; url: string }[];
  createdAt: string;
}

const props = defineProps<{ arModule: ArModuleData }>();

const label = computed(
    () => `${props.arModule.author}: ${props.arModule.text}`
);

// ── Glowstick per-stick tuning ────────────────────────────────────────────────
// Everything you can tune per idol's glowstick, in one place, keyed by prefix
// (e.g. "BTS"). Each block:
//
//   order          Draw order *within* that stick, keyed by each part's full
//                   mesh id (e.g. "BTS_01", "BTS_LICHT" — the numbered body
//                   meshes plus the glow part). Higher = drawn later, i.e. on
//                   top of lower numbers; only matters relative to the other
//                   parts of the SAME stick. Omit an id to fall back to the
//                   default sequential order (body meshes in file order, then
//                   the light). HaloSphere and <PREFIX>_PNG are deliberately
//                   NOT listed here — they're always forced first/last (see
//                   glowstick-field.ts) so an entry for them has no effect.
//                   This is real distance-based draw sequencing (depthWrite
//                   stays on, matching each mesh's glTF-authored default), so
//                   it composes correctly with occlusion between different
//                   sticks and against anything else in the scene.
//
//                   For a mesh that's genuinely translucent in the source
//                   .glb (alphaMode: BLEND — e.g. tinted glass enclosing
//                   LICHT), its own true opacity is now preserved through the
//                   LOD fade instead of being forced fully opaque (see
//                   lod-object.ts / lod-manager.ts), so LICHT shows through
//                   it correctly by ordinary alpha blending — AS LONG AS
//                   LICHT is drawn BEFORE that translucent mesh (lower order
//                   number), so it's already in the frame for the glass to
//                   blend over. Order relative to genuinely opaque parts
//                   doesn't matter — real depth resolves those correctly
//                   regardless of draw sequence.
//   haloColor      Tint for the shared HaloSphere glow aura. "" = untinted
//                   (white). Every copy of this stick gets its own HaloSphere
//                   material clone, so all copies share this colour
//                   automatically.
//   lichtColor     Tint for this stick's own LICHT mesh (the light part built
//                   into that idol's model, not the shared HaloSphere). "" =
//                   untinted (LICHT's own authored colour).
//   lichtIntensity Brightness multiplier for LICHT, on top of its glTF-authored
//                   emissiveIntensity/emissiveStrength (see
//                   emissive-material.ts). 1 = as-authored.
//   opacity        Manual opacity ceiling per full mesh id (e.g. "BOA_01"),
//                   keyed only for meshes you want to override — replaces
//                   whatever the glTF itself authored rather than dimming on
//                   top of it. For a mesh that's technically alphaMode: BLEND
//                   but barely translucent as modelled (its own authored
//                   alpha close to 1), this is how to make it actually
//                   see-through enough to show something behind it (like
//                   LICHT) without re-exporting the source .glb. {} = every
//                   mesh keeps its own authored opacity.
//
// Passed to <glowstick-field> as one JSON blob via :data-glowstick-overrides
// below; glowstick-field.ts distributes each field to the component that
// actually owns that visual (render-order, unlit-material, emissive-material,
// lod-object's opacity handling).
const glowstickOverrides: Record<string, {
  order: Record<string, number>;
  haloColor: string;
  lichtColor: string;
  lichtIntensity: number;
  opacity: Record<string, number>;
}> = {
  AESPA1: {
    order: { "AESPA1_01": 4, "AESPA1_02": 2, "AESPA1_03": 1, "AESPA1_LICHT": 3 },
    haloColor: "#ffbaf7",
    lichtColor: "#ffbaf7",
    lichtIntensity: 2,
    opacity: {}
  },
  // AESPA2 has a single un-numbered body mesh, named just the prefix itself.
  AESPA2: {
    order: { "AESPA2": 1, "AESPA2_LICHT": 2 },
    haloColor: "#baefff",
    lichtColor: "#baefff",
    lichtIntensity: 2,
    opacity: {}
  },
  // BAP_01 and BAP_03 are alphaMode: BLEND (genuinely translucent — the rods
  // and outer body); BAP_02 is opaque-authored. LICHT is ordered first (0) so
  // it draws before the translucent parts and shows through their real alpha.
  // opacity overrides both to 0.2 as a starting guess — trim/tune per part.
  BAP: {
    order: { "BAP_02": 1, "BAP_03": 3, "BAP_01": 4, "BAP_LICHT": 0 },
    haloColor: "#95ff6b",
    lichtColor: "#95ff6b",
    lichtIntensity: 1,
    opacity: { "BAP_02": 0.5, "BAP_01": 1 }
  },
  BILLIE: {
    order: { "BILLIE_01": 1, "BILLIE_02": 2, "BILLIE_03": 3, "BILLIE_04": 4, "BILLIE_05": 5, "BILLIE_06": 6, "BILLIE_LICHT": 7 },
    haloColor: "",
    lichtColor: "",
    lichtIntensity: 2,
    opacity: {}
  },
  BLACKPINK: {
    order: { "BLACKPINK_01": 1, "BLACKPINK_02": 2, "BLACKPINK_LICHT": 3 },
    haloColor: "#fa93d4",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: {}
  },
  // BOA_01 ("GLAS_KUGEL", glass sphere) and BOA_04 are alphaMode: BLEND
  // (genuinely translucent); BOA_02/03 are opaque-authored. LICHT ordered
  // first (0) so it draws before the translucent glass parts and shows
  // through their real alpha instead of being forced fully opaque.
  // BOA_01's own authored alpha is 0.9 (barely translucent) — overridden to
  // 0.2 as a starting guess so LICHT actually shows through; tune to taste.
  BOA: {
    order: { "BOA_01": 1, "BOA_02": 2, "BOA_03": 3, "BOA_04": 4, "BOA_LICHT": 0 },
    haloColor: "#f8fcc2",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: { "BOA_01": 0.2 }
  },
  BTS: {
    order: { "BTS_01": 1, "BTS_02": 2, "BTS_03": 3, "BTS_04": 4, "BTS_05": 5, "BTS_LICHT": 6 },
    haloColor: "",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: {}
  },
  EVNNE: {
    order: { "EVNNE_01": 1, "EVNNE_02": 2, "EVNNE_LICHT": 3 },
    haloColor: "",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: {}
  },
  EXO: {
    order: { "EXO_01": 1, "EXO_02": 2, "EXO_03": 3, "EXO_04": 4, "EXO_LICHT": 5 },
    haloColor: "",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: {}
  },
  GFRIEND: {
    order: { "GFRIEND_01": 1, "GFRIEND_02": 2, "GFRIEND_03": 3, "GFRIEND_04": 4, "GFRIEND_05": 5, "GFRIEND_06": 6, "GFRIEND_LICHT": 7 },
    haloColor: "",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: {}
  },
  GIRLSGENERATION: {
    order: { "GIRLSGENERATION_01": 1, "GIRLSGENERATION_02": 2, "GIRLSGENERATION_03": 3, "GIRLSGENERATION_04": 4, "GIRLSGENERATION_LICHT": 5 },
    haloColor: "#f77ee7",
    lichtColor: "#f77ee7",
    lichtIntensity: 3,
    opacity: {}
  },
  GOT7: {
    order: { "GOT7_01": 1, "GOT7_02": 2, "GOT7_03": 3, "GOT7_LICHT": 4 },
    haloColor: "#d6ffc4",
    lichtColor: "#d6ffc4",
    lichtIntensity: 3,
    opacity: {}
  },
  "I-DLE": {
    order: { "I-DLE_01": 1, "I-DLE_02": 2, "I-DLE_LICHT": 3 },
    haloColor: "",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: {}
  },
  IU: {
    order: { "IU_01": 1, "IU_02": 2, "IU_03": 3, "IU_04": 4, "IU_05": 5, "IU_LICHT": 6 },
    haloColor: "#d6ffc4",
    lichtColor: "#d6ffc4",
    lichtIntensity: 3,
    opacity: {}
  },
  KISSOFLIFE: {
    order: { "KISSOFLIFE_01": 1, "KISSOFLIFE_02": 2, "KISSOFLIFE_03": 3, "KISSOFLIFE_LICHT": 4 },
    haloColor: "#ff6171",
    lichtColor: "#ff6171",
    lichtIntensity: 3,
    opacity: {}
  },
  LESSERAFIM: {
    order: { "LESSERAFIM_01": 1, "LESSERAFIM_LICHT": 2 },
    haloColor: "#7dadff",
    lichtColor: "#7dadff",
    lichtIntensity: 3,
    opacity: {}
  },
  MAMAMOO: {
    order: { "MAMAMOO_01": 1, "MAMAMOO_02": 2, "MAMAMOO_LICHT": 3 },
    haloColor: "#e7ffe3",
    lichtColor: "#e7ffe3",
    lichtIntensity: 3,
    opacity: {}
  },
  NEWJEANS: {
    order: { "NEWJEANS_01": 1, "NEWJEANS_02": 2, "NEWJEANS_03": 3, "NEWJEANS_LICHT": 4 },
    haloColor: "",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: {}
  },
  NTX: {
    order: { "NTX_01": 1, "NTX_02": 2, "NTX_03": 3, "NTX_04": 4, "NTX_LICHT": 5 },
    haloColor: "#ffc2e5",
    lichtColor: "#ffc2e5",
    lichtIntensity: 3,
    opacity: {}
  },
  POW: {
    order: { "POW_01": 1, "POW_02": 2, "POW_03": 3, "POW_04": 4, "POW_05": 5, "POW_06": 6, "POW_LICHT": 7 },
    haloColor: "#c4c2ff",
    lichtColor: "#c4c2ff",
    lichtIntensity: 3,
    opacity: {}
  },
  SEVENTEEN: {
    order: { "SEVENTEEN_01": 1, "SEVENTEEN_02": 2, "SEVENTEEN_03": 3, "SEVENTEEN_04": 4, "SEVENTEEN_LICHT": 5 },
    haloColor: "#c4c2ff",
    lichtColor: "#c4c2ff",
    lichtIntensity: 3,
    opacity: {}
  },
  STRAYKIDS: {
    order: { "STRAYKIDS_01": 1, "STRAYKIDS_02": 2, "STRAYKIDS_03": 3, "STRAYKIDS_04": 4, "STRAYKIDS_05": 5, "STRAYKIDS_06": 6, "STRAYKIDS_LICHT": 7 },
    haloColor: "#ff7a88",
    lichtColor: "#ff7a88",
    lichtIntensity: 3,
    opacity: {}
  },
  SUPERM: {
    order: { "SUPERM_01": 1, "SUPERM_02": 2, "SUPERM_03": 3, "SUPERM_LICHT": 4 },
    haloColor: "",
    lichtColor: "",
    lichtIntensity: 3,
    opacity: {}
  },
  TVXQ: {
    order: { "TVXQ_01": 1, "TVXQ_02": 2, "TVXQ_03": 3, "TVXQ_LICHT": 4 },
    haloColor: "#f23a4d",
    lichtColor: "#f23a4d",
    lichtIntensity: 3,
    opacity: {}
  },
  VERIVERY: {
    order: { "VERIVERY_01": 1, "VERIVERY_02": 2, "VERIVERY_03": 3, "VERIVERY_04": 4, "VERIVERY_LICHT": 5 },
    haloColor: "#f3b5ff",
    lichtColor: "#f3b5ff",
    lichtIntensity: 3,
    opacity: {}
  }
};
const glowstickOverridesJson = JSON.stringify(glowstickOverrides);

// Thin top-of-screen progress bar for the manifest's own assets (the glbs) —
// see asset-loading-overlay.ts. This is the phase that's actually visible to
// users: the host's dynamic import() of this module's own JS happens before
// any of this code runs, so it can't be tracked from here; this covers the
// (usually much larger) asset payload that streams in after the module has
// already mounted. Inline styles only — a <style> block never ships to the
// host (see README "Caveats").
const loadProgress = ref(0);
const assetsLoaded = ref(false);
let stopAssetTracking: (() => void) | null = null;

const loadBarTrackStyle = computed(() => ({
  position: 'fixed' as const,
  top: '0',
  left: '0',
  width: '100%',
  height: '3px',
  background: 'rgba(255,255,255,0.15)',
  zIndex: '9999',
  pointerEvents: 'none' as const,
  opacity: assetsLoaded.value ? '0' : '1',
  transition: 'opacity 0.4s ease-out'
}));

const loadBarFillStyle = computed(() => ({
  height: '100%',
  width: `${Math.round(loadProgress.value * 100)}%`,
  background: 'rgba(255,255,255,0.9)',
  transition: 'width 0.2s ease-out'
}));

onMounted(() => {
  stopAssetTracking = trackAssetLoading(
    manifest.assets ?? [],
    (loaded, total) => { loadProgress.value = loaded / total; },
    () => { assetsLoaded.value = true; }
  );
});

onUnmounted(() => {
  stopAssetTracking?.();
});
</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `jellyfish-video.mp4` → id
       "jellyfish-video". Do NOT declare your own <a-assets> here.

       The custom components used below (lod-manager, lod-object, render-order,
       unlit-material, billboard, ground-decal, no-frustum-cull) are registered
       from the manifest (src/a-frame-components/*) before this template mounts. -->
  <!-- position is a compensating offset: this branch doesn't set
       manifest.camera, so the host's real default camera ("0 0.35 0.8") and
       module-root ("0 1.6 -3", confirmed from the deployed
       oplooi.uber.space/an-alle/ bundle) apply as-is in production — not the
       "0 0.5 0" camera / "0 0 -2" module-root this module's own
       lib/preview-ar.ts mocked. Only glowstick-field itself needs this: the
       #group anchor and both lights are deliberately camera-relative via
       attach-to (see their own comments) and already self-correct for any
       parent offset, since attach-to converts its target's world position
       into *this* entity's parent space every frame regardless of what that
       parent's own transform is. Untested on-device — nudge if the framing
       looks off. -->
  <a-entity position="0 -1.75 1.8" no-frustum-cull lod-manager="chunksPerCycle: 6">

    <!-- Key light, attached to the #group anchor and aimed at it. Dynamic shadows
         are disabled (castShadow: false) — we rely on the ground decals instead. -->
    <a-entity
        light="
                    type: directional;
                    intensity: 1;
                    castShadow: false;
                    target: #group;
                    color: #88c9f7"
        attach-to="target: #group; offset: 5 10 -5">
    </a-entity>

    <a-entity
        light="
                    type: ambient;
                    intensity: 0.2;
                    castShadow: false;
                    color: #cecdfa">
    </a-entity>


    <!-- Fill light that follows the camera (in the original this was a child of
         the <a-camera>; here it tracks the camera via our attach-to component,
         since the camera is provided by the host, not this module). -->
    <a-entity
        light="type: point; distance: 2; intensity: 2; color: #facdd1;"
        attach-to="target: #camera; offset: -0.2 0.5 -0.5">
    </a-entity>


    <!-- The whole glowstick field. glowstick-field auto-discovers every glowstick
         from <a-assets> (by the PREFIX_01 / PREFIX_LICHT / PREFIX_PNG convention)
         and builds one lod-object instance per stick — the same structure the two
         hand-written AESPA examples used, so all existing LOD/billboard/decal
         behaviour is reused unchanged. Parameters:
           areaWidth                  FIXED width (X), centred on the viewer (equal left/right)
           elevation / elevationVariation   base Y height + random ± offset
           minDistance / maxDistance  spacing between sticks, both honoured exactly
           yawMax                     max random Y-axis spin in degrees (± each direction; 180 = fully random, 0 = all face forward)
           tiltMin / tiltMax          random X/Z tilt magnitude range in degrees (± each)
           copies                     1 = 25 sticks, 2 = 50, 3 = 75, …
           minCopyDistance            min ground gap between two copies of the SAME type (0 = off; only matters when copies > 1)
           scale                      per-stick scale
           billboardBrightness        dims the unlit far-LOD PNG billboard (1 = full, <1 darker, 0 = black)
           lodNear / lodFar           global LOD group fade thresholds
           lichtNear / lichtFar       global custom near/far for the LICHT glow parts
           waveNear / waveFar         distance band over which the approach wave fades in (≤near full, ≥far off)
           waveIntensity              peak wave swing each way, in degrees
           waveSpeed                  wave swing rate (higher = faster)
           wavePivotY                 Y offset of the wave pivot along the stick (0 = origin, negative = lower toward the base)
           idleRadius                 amplitude of the subtle always-on idle float (0 = off)
         There is no depth setting — depth grows automatically in front of the viewer to fit every stick. -->
    <a-entity glowstick-field="
        areaWidth: 5;
        elevation: 0.8;
        elevationVariation: 0.2;
        minDistance: 1.8;
        maxDistance: 2.3;
        yawMax: 2;
        tiltMin: 0;
        tiltMax: 12;
        copies: 2;
        minCopyDistance: 3.5;
        scale: 1.1;
        billboardBrightness: 0.4;
        lodNear: 6;
        lodFar: 8;
        lichtNear: 3.8;
        lichtFar: 3.9;
        waveNear: 2;
        waveFar: 5;
        waveIntensity: 25;
        waveSpeed: 4;
        wavePivotY: -0.5;
        idleRadius: 0.03"
        :data-glowstick-overrides="glowstickOverridesJson"></a-entity>


    <!-- Anchor the key light aims at / attaches to. -->
    <a-entity id="group" position="3 12 -10" attach-to="target: #camera; offset: 0 1 -4"></a-entity>


  </a-entity>

  <!-- 2D loading-progress overlay — screen-space, not part of the 3D scene.
       Fades out once every manifest asset has loaded. -->
  <div :style="loadBarTrackStyle">
    <div :style="loadBarFillStyle"></div>
  </div>
</template>