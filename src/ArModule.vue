<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import GuiPanel from './GuiPanel.vue';
import InfoOverlay from './InfoOverlay.vue';
import type { GuiControl } from './gui-controls';

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

// arModule isn't read by this placeholder scene, but the prop must stay
// declared — it's the real shape the host passes to every module.
defineProps<{ arModule: ArModuleData }>();

// Template-baseline loading UI: a thin top-of-screen progress bar plus a
// centre-screen spinner, shown while this module's own manifest assets
// (glbs, images, sounds, ...) are still streaming in, so the visitor sees
// feedback instead of an empty/popping-in scene. Two parts:
//
//   1. Progress tracking (this block) — trackAssetLoading (see
//      asset-loading-overlay.ts) watches the DOM asset elements the host
//      injects into <a-assets> before this module mounts, and reports
//      loaded/total as each one settles.
//   2. Hiding the 3D content until ready (see the template below) — the
//      root <a-entity> is bound :visible="assetsLoaded", so nothing pops in
//      piecemeal; it keeps loading in the background the whole time
//      (visible:false doesn't pause loading) and only appears once
//      everything's ready, all at once.
//
// This is deliberately NOT an A-Frame component: it's screen-space 2D UI
// that has to exist and be visible *before* any 3D entity is ready, driven
// by this Vue wrapper's own onMounted/onUnmounted lifecycle rather than
// any entity's — there's no 3D content for a component to attach to until
// the very thing this UI is covering for has already finished. See
// QUICK_START_GUIDE.md for the short version of why this lives here rather
// than in src/a-frame-components/.
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

// Centre-screen spinner + backdrop, shown/hidden by the same assetsLoaded
// state as the top bar. The spin animation is SMIL (<animateTransform>)
// rather than a CSS @keyframes rule, since a <style> block never ships to
// the host (see README "Caveats") — this needs to work from inline
// markup/styles alone.
const loadSpinnerBackdropStyle = computed(() => ({
  position: 'fixed' as const,
  inset: '0',
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  background: 'rgba(0,0,0,0.55)',
  zIndex: '9998',
  pointerEvents: 'none' as const,
  opacity: assetsLoaded.value ? '0' : '1',
  transition: 'opacity 0.4s ease-out'
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

// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md) — Version 2
// (30.08.2026, s. archive-of-practice projects/an-alle/fragen.md, Frage 10):
// a bounded square field (random-field's new `areaDepth`, s.
// random-field.ts/RANDOM-FIELD-FEATURE-GUIDE.md) sized as a % of the
// target image's own footprint, filled to a % density instead of exposing
// areaWidth/copies/minDistance/maxDistance directly (replaces this
// project's own earlier Version 1 "kein Algorithmus-Umbau" simplification).
//
// Footprint convention (s. sound-player's own ArModule.vue and
// guides/IMAGE-TRACKING-FEATURE-GUIDE.md) — the tracked image is the
// scene's ground plane. `random-field`/`proximity-rise` (like
// `wander-in-band`) assume the older three.js/A-Frame default (X/Z ground,
// Y height) rather than the convention's X/Y ground, Z height, so the
// field/prop group below sits inside ONE compensating `rotation: 90 0 0`
// wrapper (same technique as proximity-effekte/animationssystem-wanderer):
// authored X/Z-ground/Y-height inside maps onto the real footprint's
// X/Y-ground/Z-height outside. FOOTPRINT_MIN_SIDE (not the raw
// FOOTPRINT_WIDTH/FOOTPRINT_DEPTH) bounds the field so a 100%-size square
// field fits inside the image on BOTH axes, whichever is narrower.
const targetProps = (manifest.imageTargets?.[0] as { properties?: { width: number; height: number } } | undefined)?.properties;
const FOOTPRINT_DEPTH = 1; // the engine always normalizes the target's local Y extent to 1
const FOOTPRINT_WIDTH = targetProps ? targetProps.width / targetProps.height : 0.75; // local X extent, from the target's own aspect ratio
const FOOTPRINT_MIN_SIDE = Math.min(FOOTPRINT_WIDTH, FOOTPRINT_DEPTH);

// Every prop dimension below is the old room-scale value (tuned for a 6m
// reference field) times PROP_SCALE — a direct proportional shrink to the
// image target's own much smaller physical size, preserving every ratio
// (stem width:height, bud radius, billboard size) exactly.
const PROP_SCALE = FOOTPRINT_MIN_SIDE / 6;
const PROP_STEM_WIDTH = 0.08 * PROP_SCALE;
const PROP_STEM_HEIGHT = 0.5 * PROP_SCALE;
const PROP_BUD_RADIUS = 0.14 * PROP_SCALE;
const PROP_BILLBOARD_WIDTH = 0.28 * PROP_SCALE;
const PROP_BILLBOARD_HEIGHT = 0.7 * PROP_SCALE;
// Ground-plane radius of a placed prop (== PROP_BILLBOARD_WIDTH / 2, both
// tuned to the same footprint) — random-field's `boundingBoxRadius`
// attribute below, and the spacing-at-max-density calc, both need this.
const PROP_FOOTPRINT_RADIUS = PROP_BUD_RADIUS;
// Grid nodes per side, hard-capped regardless of density (rendering
// budget — the jittered-grid algorithm itself is cheap regardless of `n`,
// unlike the old Poisson-disk's per-point candidate search). 7 → 49 props.
const MAX_GRID_NODES_PER_SIDE = 7;

// riseStart/riseEnd are real camera-to-target distances (like
// proximity-fade/-cutout elsewhere in this template) — rescaled to the
// target's own small physical size, not the prop's linear scale.
// riseHeight is a spatial rise amount, scaled with the props themselves.
const RISE_START = FOOTPRINT_DEPTH * 3;
const RISE_END = FOOTPRINT_DEPTH * 1.2;
const RISE_HEIGHT = PROP_STEM_HEIGHT * 0.8;
const riseAttr = `riseStart: ${RISE_START.toFixed(3)}; riseEnd: ${RISE_END.toFixed(3)}; riseHeight: ${RISE_HEIGHT.toFixed(4)}`;

const fieldSizePercent = ref(70); // 20–100, % of FOOTPRINT_MIN_SIDE
const DENSITY_MIN = 10;
const DENSITY_MAX = 90;
const density = ref(40); // 10–90 — s. gridSpacing below for what the extremes now guarantee
const randomness = ref(0.4); // 0–1, random-field's `randomness` (Version 3, 31.08.2026)
// LOD near/far are also real camera-to-target distances — rescaled the
// same way as riseStart/riseEnd above (was 4/7m, tuned for a 6m room-scale
// field; the required camera-to-target closeness for stable image tracking
// makes these much smaller values likely, s. zufallsverteilung-lod.md).
const lodNear = ref(FOOTPRINT_DEPTH * 1.5);
const lodFar = ref(FOOTPRINT_DEPTH * 3);

const areaSide = computed(() => FOOTPRINT_MIN_SIDE * (fieldSizePercent.value / 100));

// Density now drives the GRID SPACING directly rather than an area/prop-
// footprint-area ratio (archive-of-practice projects/an-alle/concepts/
// zufallsverteilung-lod.md, "Platzierungsalgorithmus — Version 3",
// 31.08.2026 — the old ratio saturated the copy-count cap well before the
// slider's high end, so most of its range did nothing visible). Highest density
// (DENSITY_MAX) → spacing = one prop diameter (props almost touching);
// lowest density (DENSITY_MIN) → spacing = the full field side, i.e. a 2×2
// lattice with exactly one prop in each of the field's four corners.
// Linear interpolation between those two spacings by where `density` sits
// in [DENSITY_MIN, DENSITY_MAX].
const gridSpacing = computed(() => {
  const t = (density.value - DENSITY_MIN) / (DENSITY_MAX - DENSITY_MIN);
  const spacingAtMaxDensity = PROP_FOOTPRINT_RADIUS * 2;
  const spacingAtMinDensity = areaSide.value;
  return spacingAtMinDensity + t * (spacingAtMaxDensity - spacingAtMinDensity);
});

// Grid nodes per side implied by that spacing (>= 2 so the low-density
// four-corner case always holds), capped at MAX_GRID_NODES_PER_SIDE — above
// the cap, actual spacing ends up looser than the density slider alone
// would imply rather than exceeding the rendering budget.
const gridNodesPerSide = computed(() =>
  Math.min(MAX_GRID_NODES_PER_SIDE, Math.max(2, Math.round(areaSide.value / gridSpacing.value) + 1))
);
const targetCopies = computed(() => gridNodesPerSide.value * gridNodesPerSide.value);

const randomFieldAttr = computed(
  () => `items: #prop; areaWidth: ${areaSide.value.toFixed(3)}; areaDepth: ${areaSide.value.toFixed(3)}; ` +
        `randomness: ${randomness.value.toFixed(3)}; boundingBoxRadius: ${PROP_FOOTPRINT_RADIUS.toFixed(4)}; ` +
        `copies: ${targetCopies.value}`
);
const lodObjectAttr = computed(() => `nearDistance: ${lodNear.value.toFixed(3)}; farDistance: ${lodFar.value.toFixed(3)}`);

const lightPosition = `${(FOOTPRINT_WIDTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 1.5).toFixed(3)}`;
const lightConfig = `type: directional; intensity: 1; target: #lightTarget; castShadow: true; shadowMapHeight: 2048; shadowMapWidth: 2048; shadowCameraTop: ${FOOTPRINT_DEPTH}; shadowCameraBottom: ${-FOOTPRINT_DEPTH}; shadowCameraRight: ${FOOTPRINT_DEPTH}; shadowCameraLeft: ${-FOOTPRINT_DEPTH}; shadowRadius: 4`;
const groundMaterial = 'color: #3b82f6; opacity: 0.35; side: double';

// random-field places its clones once in init() (a one-shot procedural
// generation, not a per-frame effect) and lod-object likewise only reads
// nearDistance/farDistance in its own init() — neither component defines an
// update() handler, so changing their DOM attribute reactively (the pattern
// proximity-effekte/animationssystem-wanderer use for their own, genuinely
// per-tick components) would update the GUI's displayed number without
// touching the actual scene. A Vue `:key` tied to every GUI-affecting value
// forces a full unmount/remount of the field on any change instead — the
// standard Vue technique for "re-run a one-shot child from scratch" — so
// adjusting a slider genuinely re-scatters the field with the new
// parameters (arguably the point of this Themenfeld's demo, too).
const fieldKey = computed(
  () => `${fieldSizePercent.value}-${density.value}-${randomness.value}-${lodNear.value}-${lodFar.value}`
);

const guiControls = computed<GuiControl[]>(() => [
  {
    type: 'slider',
    id: 'field-size',
    label: 'Feldgröße',
    min: 20,
    max: 100,
    step: 5,
    value: fieldSizePercent.value,
    unit: '%',
    onInput: (value) => { fieldSizePercent.value = value; }
  },
  {
    type: 'slider',
    id: 'density',
    label: 'Dichte',
    min: DENSITY_MIN,
    max: DENSITY_MAX,
    step: 5,
    value: density.value,
    unit: '%',
    onInput: (value) => { density.value = value; }
  },
  {
    type: 'slider',
    id: 'randomness',
    label: 'Zufall',
    min: 0,
    max: 100,
    step: 5,
    value: Math.round(randomness.value * 100),
    unit: '%',
    onInput: (value) => { randomness.value = value / 100; }
  },
  {
    type: 'range-slider',
    id: 'lod-distance',
    label: 'LOD-Umschaltdistanz',
    min: Math.round(FOOTPRINT_DEPTH * 0.5 * 1000) / 1000,
    max: Math.round(FOOTPRINT_DEPTH * 4 * 1000) / 1000,
    step: Math.round(FOOTPRINT_DEPTH * 0.1 * 1000) / 1000,
    valueLow: lodNear.value,
    valueHigh: lodFar.value,
    unit: 'm',
    onInput: (low, high) => { lodNear.value = low; lodFar.value = high; }
  }
]);
</script>

<template>

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `jellyfish-video.mp4` → id
       "jellyfish-video". Do NOT declare your own <a-assets> here. -->
  <!-- AN ALLE! Zwischen-Basis: all five Themenfeld modules anchor to a printed
       image target (archive-of-practice
       projects/an-alle/concepts/zwischen-basis.md, Entscheidung 1) — "video-target"
       is still the template's placeholder descriptor (s. manifest.ts) until the
       real AN ALLE! target image is designed and compiled. Only works in the real
       AR preview (npm run dev:ar) or the host, per
       guides/IMAGE-TRACKING-FEATURE-GUIDE.md. -->
  <xrextras-named-image-target name="video-target">
    <a-entity
        no-frustum-cull
        :visible="assetsLoaded"
    >
      <!-- What the directional light below aims at — the footprint's own
           centre/ground (s. sound-player's ArModule.vue). -->
      <a-entity id="lightTarget" position="0 0 0"></a-entity>

      <!-- Directional light that casts shadows onto the ground plane below.
           Positioned above the scene (elevated in Z — the footprint
           convention's height axis), aimed at #lightTarget. Shadow camera
           bounds sized to the image's own footprint, not a room-scale
           guess. -->
      <a-entity :position="lightPosition" :light="lightConfig" shadow></a-entity>

      <a-light type="ambient" intensity="0.7"></a-light>

      <!-- Zufallsverteilung & LOD (archive-of-practice
           projects/an-alle/concepts/zufallsverteilung-lod.md) — structure
           and attribute conventions ported from
           examples/random-field-lod-billboard-proximity-wave-scene.html
           (lod-manager wrapper, .lod-mesh-group/.lod-mesh/.lod-billboard
           classes, per-part render-order). No custom detail-model/billboard
           texture from the author yet (Entscheidung 2), so — same reasoning
           as that reference example — this uses plain primitives as a
           stand-in: a "sprout" (stem + bud) for the detail mesh, a
           matching-coloured plane for the billboard. Swap for a real
           gltf-model once the author's assets exist; nothing else about
           the structure changes. `:key="fieldKey"` forces a full field
           regeneration when a GUI slider changes (s. Skript-Kommentar).
           `rotation="90 0 0"` is the compensating rotation from the script
           block above — random-field/proximity-rise's native X/Z-ground,
           Y-height authoring maps onto the real footprint's X/Y-ground,
           Z-height outside this wrapper. -->
      <a-entity lod-manager="chunksPerCycle: 6" rotation="90 0 0" :key="fieldKey">

        <!-- Prop template — hidden by random-field once cloned. Rises on
             approach via [proximity-rise] (own Entscheidung 1, fixed
             parameters, not a GUI target, rescaled to the footprint's own
             size — s. Skript); LOD-swaps to the billboard via [lod-object]
             (nearDistance/farDistance GUI-bound). Both components live on
             this same entity and get cloned onto every placed copy along
             with it (s. proximity-rise.ts). -->
        <a-entity id="prop" :lod-object="lodObjectAttr" :proximity-rise="riseAttr">
          <a-entity class="lod-mesh-group">
            <a-entity
                class="lod-mesh"
                :geometry="`primitive: box; width: ${PROP_STEM_WIDTH}; height: ${PROP_STEM_HEIGHT}; depth: ${PROP_STEM_WIDTH}`"
                material="color: #6b4a2f"
                :position="`0 ${PROP_STEM_HEIGHT / 2} 0`"
                render-order="1">
            </a-entity>
            <a-entity
                class="lod-mesh"
                :geometry="`primitive: sphere; radius: ${PROP_BUD_RADIUS}`"
                material="color: #e8c34a"
                :position="`0 ${PROP_STEM_HEIGHT + PROP_BUD_RADIUS * 0.4} 0`"
                render-order="2">
            </a-entity>
          </a-entity>
          <a-entity
              class="lod-billboard"
              :geometry="`primitive: plane; width: ${PROP_BILLBOARD_WIDTH}; height: ${PROP_BILLBOARD_HEIGHT}`"
              material="color: #b89a3a; side: double"
              :position="`0 ${PROP_BILLBOARD_HEIGHT / 2} 0`"
              render-order="3"
              billboard
              unlit-material="brightness: 0.4">
          </a-entity>
        </a-entity>

        <a-entity :random-field="randomFieldAttr"></a-entity>

      </a-entity>

      <!-- Ground plane = the tracked image itself (footprint convention, see
           script block above): same local X/Y bounds as the printed image,
           no rotation (a-plane's default orientation already matches the
           image's own plane), sitting at Z=0. Semi-transparent visible fill
           so the footprint is visible for orientation/debugging while still
           catching shadows. -->
      <a-plane
          id="ground"
          :width="FOOTPRINT_WIDTH"
          :height="FOOTPRINT_DEPTH"
          :material="groundMaterial"
          shadow
      ></a-plane>

    </a-entity>
  </xrextras-named-image-target>

  <!-- 2D loading-progress overlay — screen-space, not part of the 3D scene
       (a second root node, sibling to the <a-entity> above). Fades out once
       every manifest asset has loaded; see the <script> block above for why
       this is plain Vue/DOM rather than an A-Frame component. -->
  <div :style="loadBarTrackStyle">
    <div :style="loadBarFillStyle"></div>
  </div>

  <!-- Centre-screen spinner, shown while the 3D content above stays hidden
       (:visible="assetsLoaded" on its root) so nothing pops in piecemeal. -->
  <div :style="loadSpinnerBackdropStyle">
    <svg viewBox="0 0 50 50" width="48" height="48">
      <circle cx="25" cy="25" r="20" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-dasharray="90 150">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  </div>

  <!-- AN ALLE! Zwischen-Basis: shared GUI baustein (archive-of-practice
       projects/an-alle/concepts/zwischen-basis.md) — each Themenfeld branch
       replaces `guiControls` above with its own attribute wiring, GuiPanel.vue
       itself is not meant to be forked. -->
  <GuiPanel :controls="guiControls" />

  <!-- AN ALLE! Zwischen-Basis: shared info button + overlay, replacing the
       raycast-driven context-text idea for every Themenfeld except
       Sound-Player (s. projects/an-alle/concepts/sound-player.md). Each
       branch passes its own scene-specific explanation text. -->
  <InfoOverlay text="Ein Feld zufällig verteilter Pflänzchen: aus der Ferne nur flache Bildchen (Billboards), aus der Nähe echte 3D-Modelle — und sie wachsen sichtbar, je näher du kommst. Die Regler unten steuern Feldbreite, Abstand, Anzahl und die Umschaltdistanz." />
</template>
