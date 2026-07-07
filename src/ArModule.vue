<script setup lang="ts">
import {computed} from 'vue';

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

// ── Glowstick internal render order ──────────────────────────────────────────
// Per-mesh draw order *within* each glowstick. Higher number = drawn later, i.e.
// on top of lower numbers. The values only matter relative to the other parts of
// the SAME stick (each stick is sorted independently).
//
// Listed here are the meshes you control: each stick's numbered body meshes
// (e.g. BTS_01…BTS_05) and its glow part (BTS_LICHT). Two parts are handled
// automatically and intentionally NOT listed:
//   • HaloSphere      → always drawn FIRST in the stick, so its transparent glow
//                        aura never obscures the body (fixed to lowest − 1).
//   • <PREFIX>_PNG    → always drawn LAST in the stick, so the billboard fully
//                        covers the stick as the LOD system fades it in (fixed to
//                        highest + 1).
//
// Edit any number to reorder that mesh. The defaults below reproduce the original
// order (body meshes in file order, then the light). Passed to <glowstick-field>
// via :data-render-order below.
const glowstickRenderOrder: Record<string, number> = {
  // AESPA1
  "AESPA1_01": 4, "AESPA1_02": 2, "AESPA1_03": 1, "AESPA1_LICHT": 3,
  // AESPA2 (single un-numbered body mesh)
  "AESPA2": 1, "AESPA2_LICHT": 2,
  // BAP
  "BAP_01": 1, "BAP_02": 2, "BAP_03": 3, "BAP_LICHT": 4,
  // BILLIE
  "BILLIE_01": 1, "BILLIE_02": 2, "BILLIE_03": 3, "BILLIE_04": 4, "BILLIE_05": 5, "BILLIE_06": 6, "BILLIE_LICHT": 7,
  // BLACKPINK
  "BLACKPINK_01": 1, "BLACKPINK_02": 2, "BLACKPINK_LICHT": 3,
  // BOA
  "BOA_01": 1, "BOA_02": 2, "BOA_03": 3, "BOA_04": 4, "BOA_LICHT": 5,
  // BTS
  "BTS_01": 1, "BTS_02": 2, "BTS_03": 3, "BTS_04": 4, "BTS_05": 5, "BTS_LICHT": 6,
  // EVNNE
  "EVNNE_01": 1, "EVNNE_02": 2, "EVNNE_LICHT": 3,
  // EXO
  "EXO_01": 1, "EXO_02": 2, "EXO_03": 3, "EXO_04": 4, "EXO_LICHT": 5,
  // GFRIEND
  "GFRIEND_01": 1, "GFRIEND_02": 2, "GFRIEND_03": 3, "GFRIEND_04": 4, "GFRIEND_05": 5, "GFRIEND_06": 6, "GFRIEND_LICHT": 7,
  // GIRLSGENERATION
  "GIRLSGENERATION_01": 1, "GIRLSGENERATION_02": 2, "GIRLSGENERATION_03": 3, "GIRLSGENERATION_04": 4, "GIRLSGENERATION_LICHT": 5,
  // GOT7
  "GOT7_01": 1, "GOT7_02": 2, "GOT7_03": 3, "GOT7_LICHT": 4,
  // I-DLE
  "I-DLE_01": 1, "I-DLE_02": 2, "I-DLE_LICHT": 3,
  // IU
  "IU_01": 1, "IU_02": 2, "IU_03": 3, "IU_04": 4, "IU_05": 5, "IU_LICHT": 6,
  // KISSOFLIFE
  "KISSOFLIFE_01": 1, "KISSOFLIFE_02": 2, "KISSOFLIFE_03": 3, "KISSOFLIFE_LICHT": 4,
  // LESSERAFIM
  "LESSERAFIM_01": 1, "LESSERAFIM_LICHT": 2,
  // MAMAMOO
  "MAMAMOO_01": 1, "MAMAMOO_02": 2, "MAMAMOO_LICHT": 3,
  // NEWJEANS
  "NEWJEANS_01": 1, "NEWJEANS_02": 2, "NEWJEANS_03": 3, "NEWJEANS_LICHT": 4,
  // NTX
  "NTX_01": 1, "NTX_02": 2, "NTX_03": 3, "NTX_04": 4, "NTX_LICHT": 5,
  // POW
  "POW_01": 1, "POW_02": 2, "POW_03": 3, "POW_04": 4, "POW_05": 5, "POW_06": 6, "POW_LICHT": 7,
  // SEVENTEEN
  "SEVENTEEN_01": 1, "SEVENTEEN_02": 2, "SEVENTEEN_03": 3, "SEVENTEEN_04": 4, "SEVENTEEN_LICHT": 5,
  // STRAYKIDS
  "STRAYKIDS_01": 1, "STRAYKIDS_02": 2, "STRAYKIDS_03": 3, "STRAYKIDS_04": 4, "STRAYKIDS_05": 5, "STRAYKIDS_06": 6, "STRAYKIDS_LICHT": 7,
  // SUPERM
  "SUPERM_01": 1, "SUPERM_02": 2, "SUPERM_03": 3, "SUPERM_LICHT": 4,
  // TVXQ
  "TVXQ_01": 1, "TVXQ_02": 2, "TVXQ_03": 3, "TVXQ_LICHT": 4,
  // VERIVERY
  "VERIVERY_01": 1, "VERIVERY_02": 2, "VERIVERY_03": 3, "VERIVERY_04": 4, "VERIVERY_LICHT": 5
};
const glowstickRenderOrderJson = JSON.stringify(glowstickRenderOrder);

</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `jellyfish-video.mp4` → id
       "jellyfish-video". Do NOT declare your own <a-assets> here.

       The custom components used below (lod-manager, lod-object, render-order,
       unlit-material, billboard, ground-decal, no-frustum-cull) are registered
       from the manifest (src/a-frame-components/*) before this template mounts. -->
  <a-entity no-frustum-cull lod-manager="chunksPerCycle: 6">

    <!-- Key light, attached to the #group anchor and aimed at it. Dynamic shadows
         are disabled (castShadow: false) — we rely on the ground decals instead. -->
    <a-entity
        light="
                    type: directional;
                    intensity: 1;
                    castShadow: false;
                    target: #group;
                    color: #ffe3f8"
        attach-to="target: #group; offset: 5 10 -5">
    </a-entity>

    <a-entity
        light="
                    type: ambient;
                    intensity: 0.2;
                    castShadow: false;
                    color: #e8f1ff">
    </a-entity>


    <!-- Fill light that follows the camera (in the original this was a child of
         the <a-camera>; here it tracks the camera via our attach-to component,
         since the camera is provided by the host, not this module). -->
    <a-entity
        light="type: point; distance: 2; intensity: 1.5; color: white;"
        attach-to="target: #camera; offset: 0 0.5 0">
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
        elevation: -1.6;
        elevationVariation: 0.15;
        minDistance: 1;
        maxDistance: 3;
        yawMax: 2;
        tiltMin: 0;
        tiltMax: 15;
        copies: 2;
        minCopyDistance: 5;
        scale: 1;
        billboardBrightness: 0.4;
        lodNear: 4;
        lodFar: 5;
        lichtNear: 1;
        lichtFar: 3;
        waveNear: 2;
        waveFar: 4;
        waveIntensity: 25;
        waveSpeed: 4;
        wavePivotY: -0.5;
        idleRadius: 0.03"
        :data-render-order="glowstickRenderOrderJson"></a-entity>


    <!-- Anchor the key light aims at / attaches to. -->
    <a-entity id="group" position="3 12 -10" attach-to="target: #camera; offset: 0 1 -4"></a-entity>


  </a-entity>
</template>
