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

// AN ALLE! Proximity-Effekte (archive-of-practice
// projects/an-alle/concepts/proximity-effekte.md) — three house elements,
// each driven by a different proximity technique (grobe Zuordnung,
// Entscheidung 29.08.2026): Außenwände=Fade, Erster Stock (Gitter)=Cutout,
// verteilte Objekte (Innen/Küche)=Wave-Group. Assets copied read-only from
// Madleen_module (s. concept doc) — a real, already-working combination of
// these components on the same house geometry, not newly authored ones.
//
// Fade-Start/-Ende and Cutout-`radius` are NOT exposed as separate sliders
// (Entscheidung, s. zwischen-basis.md "Bausteine") — one `distanceScale`
// slider scales all three together, keeping their authored ratio. This is
// a plain `SliderControl` whose onInput recomputes three attribute strings
// at once (s. gui-controls.ts comment on the "proportional composite" case)
// — GuiPanel.vue needs no special-casing for it.
//
// Footprint convention (s. sound-player's own ArModule.vue, the first scene
// built against it, and guides/IMAGE-TRACKING-FEATURE-GUIDE.md) — the
// tracked image is the scene's ground plane: xrextras-named-image-target's
// local X/Y match the image's own width/depth, local Z is height above it.
// proximity-fade/-cutout/-wave-group themselves are pure camera-distance
// math (axis-agnostic), but proximity-wave's pivotY assumes the OLDER
// three.js/A-Frame default (X/Z ground, Y height) — as does every other
// generic component this template ships (wander-in-band, random-field,
// proximity-rise). Rather than rewrite each of those, the whole house sits
// inside ONE compensating `rotation="90 0 0"` wrapper below: everything
// authored inside it keeps using the familiar X/Z-ground/Y-height meaning
// internally, while the rotation itself remaps that onto the real
// footprint's X/Y-ground/Z-height for the image target outside it. Bound
// the wrapper's own local X to the footprint's width and Z to its depth —
// Y (height) stays free, satisfying Frage 8 ("Haus muss hoch statt breit
// sein") automatically.
const targetProps = (manifest.imageTargets?.[0] as { properties?: { width: number; height: number } } | undefined)?.properties;
const FOOTPRINT_DEPTH = 1; // the engine always normalizes the target's local Y extent to 1
const FOOTPRINT_WIDTH = targetProps ? targetProps.width / targetProps.height : 0.75; // local X extent, from the target's own aspect ratio

const HOUSE_HALF_WIDTH = FOOTPRINT_WIDTH * 0.4; // wrapper-local X — real footprint width once rotated
const HOUSE_HALF_DEPTH = FOOTPRINT_DEPTH * 0.4; // wrapper-local Z — real footprint depth once rotated
const WALL_HEIGHT = FOOTPRINT_DEPTH * 0.6; // wrapper-local Y — real footprint height (free), Frage 8
const WALL_THICKNESS = FOOTPRINT_DEPTH * 0.03;
const ROOF_HEIGHT = FOOTPRINT_DEPTH * 0.35;
const ROOF_RADIUS = Math.hypot(HOUSE_HALF_WIDTH, HOUSE_HALF_DEPTH) * 1.05; // covers the walls' corners

const INNER_HALF_WIDTH = HOUSE_HALF_WIDTH * 0.5;
const INNER_HALF_DEPTH = HOUSE_HALF_DEPTH * 0.5;
const INNER_HEIGHT = WALL_HEIGHT * 0.35;
const INNER_THICKNESS = FOOTPRINT_DEPTH * 0.015;
const INNER_Y = WALL_HEIGHT * 0.55;

const OBJECT_Y = WALL_HEIGHT * 0.3;
const OBJECT_RADIUS = FOOTPRINT_DEPTH * 0.05;
const OBJECT_SIZE = FOOTPRINT_DEPTH * 0.08;

const wallFrontPosition = `0 ${(WALL_HEIGHT / 2).toFixed(3)} ${HOUSE_HALF_DEPTH.toFixed(3)}`;
const wallBackPosition = `0 ${(WALL_HEIGHT / 2).toFixed(3)} ${(-HOUSE_HALF_DEPTH).toFixed(3)}`;
const wallRightPosition = `${HOUSE_HALF_WIDTH.toFixed(3)} ${(WALL_HEIGHT / 2).toFixed(3)} 0`;
const wallLeftPosition = `${(-HOUSE_HALF_WIDTH).toFixed(3)} ${(WALL_HEIGHT / 2).toFixed(3)} 0`;
const roofPosition = `0 ${(WALL_HEIGHT + ROOF_HEIGHT / 2).toFixed(3)} 0`;
const frontBackWallWidth = (HOUSE_HALF_WIDTH * 2).toFixed(3);
const sideWallWidth = (HOUSE_HALF_DEPTH * 2).toFixed(3);

const innerFrontPosition = `0 ${INNER_Y.toFixed(3)} ${INNER_HALF_DEPTH.toFixed(3)}`;
const innerBackPosition = `0 ${INNER_Y.toFixed(3)} ${(-INNER_HALF_DEPTH).toFixed(3)}`;
const innerRightPosition = `${INNER_HALF_WIDTH.toFixed(3)} ${INNER_Y.toFixed(3)} 0`;
const innerLeftPosition = `${(-INNER_HALF_WIDTH).toFixed(3)} ${INNER_Y.toFixed(3)} 0`;
const innerFrontBackWidth = (INNER_HALF_WIDTH * 2).toFixed(3);
const innerSideWidth = (INNER_HALF_DEPTH * 2).toFixed(3);

const objectAPosition = `${(HOUSE_HALF_WIDTH * 0.3).toFixed(3)} ${OBJECT_Y.toFixed(3)} ${(HOUSE_HALF_DEPTH * 0.2).toFixed(3)}`;
const objectBPosition = `${(-HOUSE_HALF_WIDTH * 0.3).toFixed(3)} ${OBJECT_Y.toFixed(3)} ${(-HOUSE_HALF_DEPTH * 0.2).toFixed(3)}`;

const lightPosition = `${(FOOTPRINT_WIDTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 1.5).toFixed(3)}`;
const lightConfig = `type: directional; intensity: 1; target: #lightTarget; castShadow: true; shadowMapHeight: 2048; shadowMapWidth: 2048; shadowCameraTop: ${FOOTPRINT_DEPTH}; shadowCameraBottom: ${-FOOTPRINT_DEPTH}; shadowCameraRight: ${FOOTPRINT_DEPTH}; shadowCameraLeft: ${-FOOTPRINT_DEPTH}; shadowRadius: 4`;
const groundMaterial = 'color: #3b82f6; opacity: 0.35; side: double';

// Fade/cutout/wave distances rescaled from the old room-scale metres (6/3/2)
// to the image target's own small physical size — proportional to
// FOOTPRINT_DEPTH so they stay sensible whichever real target replaces the
// placeholder.
const BASE_FADE_OUT_START = FOOTPRINT_DEPTH * 3;
const BASE_FADE_OUT_END = FOOTPRINT_DEPTH * 1.2;
const BASE_CUTOUT_RADIUS = FOOTPRINT_DEPTH * 0.8;
const WAVE_NEAR = FOOTPRINT_DEPTH * 0.8;
const WAVE_FAR = FOOTPRINT_DEPTH * 2.5;
const WAVE_IDLE_RADIUS = FOOTPRINT_DEPTH * 0.02;

const distanceScale = ref(1); // 0.5–1.5, multiplies the three bases above
const cutoutFeather = ref(0.3); // own slider, Entscheidung: eng kuratierte Spanne
const waveSpeed = ref(3); // own slider, Entscheidung: eng kuratierte Spanne

const fadeAttr = computed(
  () => `fadeOutStart: ${(BASE_FADE_OUT_START * distanceScale.value).toFixed(3)}; ` +
        `fadeOutEnd: ${(BASE_FADE_OUT_END * distanceScale.value).toFixed(3)}; target: 0 0 0`
);
const cutoutAttr = computed(
  () => `radius: ${(BASE_CUTOUT_RADIUS * distanceScale.value).toFixed(3)}; feather: ${cutoutFeather.value.toFixed(2)}`
);
// waveNear/waveFar/waveIntensity/idleRadius stay fixed — only waveSpeed is a
// GUI parameter per the concept doc's decision.
const waveGroupAttr = computed(
  () => `waveNear: ${WAVE_NEAR.toFixed(3)}; waveFar: ${WAVE_FAR.toFixed(3)}; waveIntensity: 15; ` +
        `waveSpeed: ${waveSpeed.value.toFixed(2)}; idleRadius: ${WAVE_IDLE_RADIUS.toFixed(3)}`
);

const guiControls = computed<GuiControl[]>(() => [
  {
    type: 'slider',
    id: 'distance-scale',
    label: 'Abstand (Fade/Cutout)',
    min: 50,
    max: 150,
    step: 5,
    value: Math.round(distanceScale.value * 100),
    unit: '%',
    onInput: (value) => { distanceScale.value = value / 100; }
  },
  {
    type: 'slider',
    id: 'cutout-feather',
    label: 'Cutout-Weichzeichnung',
    min: 0.1,
    max: 0.6,
    step: 0.05,
    value: cutoutFeather.value,
    onInput: (value) => { cutoutFeather.value = value; }
  },
  {
    type: 'slider',
    id: 'wave-speed',
    label: 'Wellen-Tempo',
    min: 1,
    max: 6,
    step: 0.5,
    value: waveSpeed.value,
    onInput: (value) => { waveSpeed.value = value; }
  }
]);

// Primitive-only house placeholder (30.08.2026, s. archive-of-practice
// projects/an-alle/concepts/proximity-effekte.md): replaces the
// Madleen_module glTF walkthrough with authored a-box/a-cone shapes while
// the real asset is pending (s. assets-checkliste.md). proximity-fade/
// -cutout only discover materials via a bubbled `model-loaded` event from
// a descendant `gltf-model` (s. PROXIMITY-FADE-FEATURE-GUIDE.md/
// PROXIMITY-CUTOUT-FEATURE-GUIDE.md) — plain primitives never fire it, so
// each wall/compartment primitive below re-emits it manually once its own
// mesh exists (same `object3dset`-type-"mesh" check material-properties.ts
// already uses to support primitives).
function emitModelLoadedOnMesh(e: any) {
  if (e.detail?.type === 'mesh') e.target.emit('model-loaded');
}
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

      <!-- Attach-To (archive-of-practice
           projects/an-alle/concepts/proximity-effekte.md, Entscheidung
           "Attach-To"): a point light that follows the shared camera every
           tick, independent of the three house elements below — no shared
           entity/material with proximity-wave-group, so no conflict with
           attach-to's own "don't combine on the same entity" rule (s.
           ATTACH-TO-FEATURE-GUIDE.md §4). Tracks the REAL camera's real-world
           position, unrelated to the footprint's own (much smaller) scale,
           so its offset stays a plain physical metre, not footprint-relative.
           "#camera" is the id the host/preview assigns the shared camera
           (s. examples/attach-to-usage.html). -->
      <a-entity light="type: point; intensity: 0.6" attach-to="target: #camera; offset: 0 1 0"></a-entity>

      <!-- Haus aus A-Frame-Primitives (30.08.2026, s. Konzeptdokument) —
           bewusst kein Madleen_module-Asset mehr, auch nicht als Platzhalter
           (s. archive-of-practice projects/an-alle/assets-checkliste.md).
           `rotation="90 0 0"` is the compensating rotation from the script
           block above — everything inside keeps the familiar X/Z-ground,
           Y-height authoring, remapped onto the real footprint's X/Y-ground,
           Z-height outside this wrapper. No position — sits exactly at the
           footprint's own centre. -->
      <a-entity id="house" rotation="90 0 0">

        <!-- 1. Außenwände — Proximity Fade: verschwindet vollständig, sobald
             die Kamera sich `target` nähert (nur fadeOut, kein fadeIn — "ganzes
             Verschwinden ab bestimmtem Abstand", nicht ein Erscheinen-und-
             Verschwinden-Fenster). model-loaded bubbelt von jedem Kind hoch
             (bei Primitives manuell nachgebildet, s. emitModelLoadedOnMesh
             oben), eine Component-Instanz patcht alle 5 (4 Wände + Dach). -->
        <a-entity id="aussenwaende" :proximity-fade="fadeAttr">
          <a-box @object3dset="emitModelLoadedOnMesh" :position="wallFrontPosition" :width="frontBackWallWidth" :height="WALL_HEIGHT" :depth="WALL_THICKNESS" color="#8a7a63" shadow></a-box>
          <a-box @object3dset="emitModelLoadedOnMesh" :position="wallBackPosition" :width="frontBackWallWidth" :height="WALL_HEIGHT" :depth="WALL_THICKNESS" color="#8a7a63" shadow></a-box>
          <a-box @object3dset="emitModelLoadedOnMesh" :position="wallRightPosition" rotation="0 90 0" :width="sideWallWidth" :height="WALL_HEIGHT" :depth="WALL_THICKNESS" color="#8a7a63" shadow></a-box>
          <a-box @object3dset="emitModelLoadedOnMesh" :position="wallLeftPosition" rotation="0 90 0" :width="sideWallWidth" :height="WALL_HEIGHT" :depth="WALL_THICKNESS" color="#8a7a63" shadow></a-box>
          <a-cone @object3dset="emitModelLoadedOnMesh" :position="roofPosition" rotation="0 45 0" :radius-bottom="ROOF_RADIUS" radius-top="0" :height="ROOF_HEIGHT" segments-radial="4" color="#7a4a35" shadow></a-cone>
        </a-entity>

        <!-- 2. Erster Stock (Gitter) — Proximity Cutout: Loch folgt der Kamera
             beim Hineingehen, statt auf einen Schlag zu verschwinden. Kleiner
             innerer Raum aus 4 Wandstücken statt des Gitter-Modells. -->
        <a-entity id="erster-stock" :proximity-cutout="cutoutAttr">
          <a-box @object3dset="emitModelLoadedOnMesh" :position="innerFrontPosition" :width="innerFrontBackWidth" :height="INNER_HEIGHT" :depth="INNER_THICKNESS" color="#cbb994" shadow></a-box>
          <a-box @object3dset="emitModelLoadedOnMesh" :position="innerBackPosition" :width="innerFrontBackWidth" :height="INNER_HEIGHT" :depth="INNER_THICKNESS" color="#cbb994" shadow></a-box>
          <a-box @object3dset="emitModelLoadedOnMesh" :position="innerRightPosition" rotation="0 90 0" :width="innerSideWidth" :height="INNER_HEIGHT" :depth="INNER_THICKNESS" color="#cbb994" shadow></a-box>
          <a-box @object3dset="emitModelLoadedOnMesh" :position="innerLeftPosition" rotation="0 90 0" :width="innerSideWidth" :height="INNER_HEIGHT" :depth="INNER_THICKNESS" color="#cbb994" shadow></a-box>
        </a-entity>

        <!-- 3. Verteilte Objekte im Haus — Proximity Wave Group: gemeinsame
             Werte, individuelle Phase pro Instanz (proximity-wave-group lässt
             jedes Kind unabhängig voneinander schwingen/floaten; braucht kein
             model-loaded, da es nur object3D-Transform schreibt, keine
             Materialien patcht — funktioniert mit Primitives ohne Weiteres). -->
        <a-entity id="verteilte-objekte" :proximity-wave-group="waveGroupAttr">
          <a-sphere :position="objectAPosition" :radius="OBJECT_RADIUS" color="#4a90d9" shadow></a-sphere>
          <a-box :position="objectBPosition" rotation="0 20 0" :width="OBJECT_SIZE" :height="OBJECT_SIZE" :depth="OBJECT_SIZE" color="#d9954a" shadow></a-box>
        </a-entity>

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
  <InfoOverlay text="Ein verschachteltes Haus: Die Außenwände verschwinden, je näher du kommst, im ersten Stock öffnet sich ein Loch, das dir folgt, und die Objekte im Inneren schwingen sanft. Ein Licht begleitet dich dabei." />
</template>
