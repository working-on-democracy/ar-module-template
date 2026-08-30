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

// AN ALLE! Animationssystem Wanderer (archive-of-practice
// projects/an-alle/concepts/animationssystem-wanderer.md) — one central,
// unmoving rigged object (trim-loop-clip only) and five wanderers with NO
// rig (wander-in-band only, Entscheidung 1: "Kein Objekt kombiniert beide
// Techniken zugleich"). Central object's asset (MainCharacter3) and the
// wander-in-band parameters below are ported from Fanyu_module's own
// already-working scene — a proven combination of these two components,
// not newly authored values. The five wanderers themselves are plain
// A-Frame primitives (30.08.2026, s. assets-checkliste.md) rather than
// Fanyu_module's Seed1/2/3 models — only the central figure keeps the
// Fanyu asset; real wanderer models pending the author. Fanyu_module also
// gave each seed a trim-loop-clip + positional sound, both dropped here:
// the concept doc's decision 1 is explicit that wanderers stay rig-free,
// and this Themenfeld doesn't cover sound at all (that's Sound-Player's
// own concern).
//
// Footprint convention (s. sound-player's own ArModule.vue and
// guides/IMAGE-TRACKING-FEATURE-GUIDE.md) — the tracked image is the
// scene's ground plane. `wander-in-band` (like `random-field`/
// `proximity-rise`) assumes the older three.js/A-Frame default (X/Z
// ground, Y height) rather than the convention's X/Y ground, Z height —
// per Frage 9 (s. archive-of-practice projects/an-alle/fragen.md) the
// wanderers walk ON the footprint's own surface, not orbiting above it, so
// this matters. Both the central figure and the wanderer group sit inside
// ONE compensating `rotation: 90 0 0` wrapper below (same technique as
// proximity-effekte): authored X/Z-ground/Y-height inside maps onto the
// real footprint's X/Y-ground/Z-height outside. `outerRadius` is bounded
// by the shorter footprint half-extent (Frage 9: "vom Bildrand begrenzt").
const targetProps = (manifest.imageTargets?.[0] as { properties?: { width: number; height: number } } | undefined)?.properties;
const FOOTPRINT_DEPTH = 1; // the engine always normalizes the target's local Y extent to 1
const FOOTPRINT_WIDTH = targetProps ? targetProps.width / targetProps.height : 0.75; // local X extent, from the target's own aspect ratio

const MAIN_SCALE = FOOTPRINT_DEPTH * 0.1; // retuned against the real target (device test, 30.08.2026: 0.5 was ~5x too large)
const WANDER_OUTER_MAX = Math.min(FOOTPRINT_WIDTH, FOOTPRINT_DEPTH) * 0.45; // stays inside the image edge, Frage 9
const WANDER_INNER_MAX = WANDER_OUTER_MAX * 0.5;
const WANDER_GROUND_OFFSET = FOOTPRINT_DEPTH * 0.03; // "ganz leichter Abstand vom Boden", Frage 9
const WANDER_OBJECT_SIZE = FOOTPRINT_DEPTH * 0.05; // retuned against the real target (device test, 30.08.2026: half the previous size)

const mainScale = `${MAIN_SCALE.toFixed(3)} ${MAIN_SCALE.toFixed(3)} ${MAIN_SCALE.toFixed(3)}`;

// Static seed positions only — wander-in-band takes over every entity's
// position/rotation every tick based on the LIVE innerRadius/outerRadius
// below, so these just need to start somewhere reasonable on the band, one
// wanderer per fifth of the circle.
function seedPosition(angleDeg: number): string {
  const seedRadius = (WANDER_INNER_MAX * 0.6 + WANDER_OUTER_MAX * 0.9) / 2;
  const rad = (angleDeg * Math.PI) / 180;
  return `${(seedRadius * Math.cos(rad)).toFixed(3)} ${WANDER_GROUND_OFFSET.toFixed(3)} ${(seedRadius * Math.sin(rad)).toFixed(3)}`;
}
const wander1Position = seedPosition(0);
const wander2Position = seedPosition(72);
const wander3Position = seedPosition(144);
const wander4Position = seedPosition(216);
const wander5Position = seedPosition(288);

const lightPosition = `${(FOOTPRINT_WIDTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 1.5).toFixed(3)}`;
const lightConfig = `type: directional; intensity: 1; target: #lightTarget; castShadow: true; shadowMapHeight: 2048; shadowMapWidth: 2048; shadowCameraTop: ${FOOTPRINT_DEPTH}; shadowCameraBottom: ${-FOOTPRINT_DEPTH}; shadowCameraRight: ${FOOTPRINT_DEPTH}; shadowCameraLeft: ${-FOOTPRINT_DEPTH}; shadowRadius: 4`;
const groundMaterial = 'color: #3b82f6; opacity: 0.35; side: double';

// wander-in-band's `speed` is in units/second, not a ratio — the old 0.35
// default was tuned for a 6–12m room-scale band; on this band's own tiny
// physical scale that speed would cross the whole annulus in well under a
// second, blowing past outerRadius before the component's gentle
// spiral-back correction can catch up (confirmed directly: uncorrected, a
// wanderer drifted to radius ~0.8 against an intended ~0.3 outerRadius
// within a few seconds). Rescaled by the same ratio as the radius itself.
const SPEED_SCALE = WANDER_OUTER_MAX / 12; // 12 = the old room-scale default bandOuter
const wanderSpeed = ref(1.5 * SPEED_SCALE); // shared across all 5 wanderers, own slider
const bandInner = ref(WANDER_INNER_MAX * 0.6); // shared band, two-thumb range-slider
const bandOuter = ref(WANDER_OUTER_MAX * 0.9);
const clipTimeScale = ref(0.4); // central object's trim-loop-clip only
const clipLoop = ref<'once' | 'repeat' | 'pingpong'>('pingpong');

const trimAttr = computed(() => `timeScale: ${clipTimeScale.value.toFixed(2)}; loop: ${clipLoop.value}`);

// Each wanderer keeps its own authored chaos/floatIntensity/yawOffset
// (variety, per Fanyu_module's original relative proportions, floatIntensity
// itself rescaled from room-scale metres to the footprint's own small
// physical size) while innerRadius/outerRadius/speed stay shared via the
// GUI, matching how proximity-wave-group applies one shared config across
// its children. chaos is a unitless ratio, unaffected by scale.
function wanderAttr(chaos: number, floatIntensity: number, yawOffset = 0): string {
  return `center: #mainEntity; innerRadius: ${bandInner.value.toFixed(3)}; outerRadius: ${bandOuter.value.toFixed(3)}; ` +
         `floatIntensity: ${floatIntensity.toFixed(4)}; speed: ${wanderSpeed.value.toFixed(4)}; chaos: ${chaos}` +
         (yawOffset ? `; yawOffset: ${yawOffset}` : '');
}

const wander1Attr = computed(() => wanderAttr(0.15, FOOTPRINT_DEPTH * 0.025));
const wander2Attr = computed(() => wanderAttr(0.1, FOOTPRINT_DEPTH * 0.025));
const wander3Attr = computed(() => wanderAttr(0.21, FOOTPRINT_DEPTH * 0.025));
const wander4Attr = computed(() => wanderAttr(0.12, FOOTPRINT_DEPTH * 0.02, 90));
const wander5Attr = computed(() => wanderAttr(0.18, FOOTPRINT_DEPTH * 0.03, 180));

const guiControls = computed<GuiControl[]>(() => [
  {
    type: 'slider',
    id: 'wander-speed',
    label: 'Wanderer-Tempo',
    // Range shifted up (device testing, 30.08.2026): the old 0.1–1 factor
    // range topped out at what now feels like a crawl. New min sits roughly
    // where the old max was, new max is ~4x that.
    min: Math.round(1 * SPEED_SCALE * 10000) / 10000,
    max: Math.round(4 * SPEED_SCALE * 10000) / 10000,
    step: Math.round(0.15 * SPEED_SCALE * 10000) / 10000,
    value: wanderSpeed.value,
    onInput: (value) => { wanderSpeed.value = value; }
  },
  {
    type: 'range-slider',
    id: 'wander-band',
    label: 'Wander-Band',
    min: Math.round(WANDER_OUTER_MAX * 0.15 * 1000) / 1000,
    max: Math.round(WANDER_OUTER_MAX * 1000) / 1000,
    step: 0.01,
    valueLow: bandInner.value,
    valueHigh: bandOuter.value,
    unit: 'm',
    onInput: (low, high) => { bandInner.value = low; bandOuter.value = high; }
  },
  {
    type: 'slider',
    id: 'clip-time-scale',
    label: 'Animationstempo (Mitte)',
    min: 0.1,
    max: 1,
    step: 0.05,
    value: clipTimeScale.value,
    onInput: (value) => { clipTimeScale.value = value; }
  },
  {
    type: 'switch',
    id: 'clip-loop',
    label: 'Loop-Modus (Mitte)',
    value: clipLoop.value,
    options: [
      { value: 'once', label: 'Einmal' },
      { value: 'repeat', label: 'Wiederholen' },
      { value: 'pingpong', label: 'Ping-Pong' }
    ],
    onSelect: (value) => { clipLoop.value = value as typeof clipLoop.value; }
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

      <!-- `rotation="90 0 0"` is the compensating rotation from the script
           block above — everything inside keeps the familiar X/Z-ground,
           Y-height authoring, remapped onto the real footprint's X/Y-ground,
           Z-height outside this wrapper. No position — sits at the
           footprint's own centre. -->
      <a-entity id="scene-root" rotation="90 0 0">

        <!-- Zentrales, unbewegliches Objekt (archive-of-practice
             projects/an-alle/concepts/animationssystem-wanderer.md,
             Entscheidung 1): Rig-Animation per trim-loop-clip, GUI-steuerbar
             (timeScale/loop). Kein wander-in-band hier — bleibt an Ort und
             Stelle, damit die fünf Wanderer einen festen Bezugspunkt haben.
             Skalierung grob geschätzt (echte Meshgröße unbekannt) — nach
             Test mit dem echten Zielbild/Modell nachjustieren. -->
        <a-entity
            id="mainEntity"
            gltf-model="#MainCharacter3"
            :scale="mainScale"
            position="0 0 0"
            :trim-loop-clip="trimAttr"
            shadow>
        </a-entity>

        <!-- Fünf Wanderer, kein Rig — nur wander-in-band/Orbit-Pfad um
             #mainEntity (Entscheidung 1), auf der Grundfläche laufend statt
             über dem Bild schwebend (Frage 9). Gemeinsamer Elternknoten,
             damit die eingebaute gegenseitige Ausweich-Logik von
             wander-in-band greift (sie schaut nur auf Geschwister unter
             demselben Parent). Primitive-Platzhalter statt der
             Fanyu_module-Seed-Modelle (30.08.2026, s. archive-of-practice
             projects/an-alle/assets-checkliste.md) — nur die zentrale Figur
             oben behält das Fanyu-Asset. wander-in-band schreibt nur
             position/rotation.y der eigenen Entität, ist also unabhängig von
             gltf-model vs. Primitive (kein model-loaded nötig, anders als bei
             proximity-fade/-cutout). -->
        <a-entity id="wandererGroup">
          <a-sphere :radius="WANDER_OBJECT_SIZE" color="#d9954a" :position="wander1Position" :wander-in-band="wander1Attr" shadow></a-sphere>
          <a-box :width="WANDER_OBJECT_SIZE" :height="WANDER_OBJECT_SIZE" :depth="WANDER_OBJECT_SIZE" color="#4a90d9" :position="wander2Position" :wander-in-band="wander2Attr" shadow></a-box>
          <a-cone :radius-bottom="WANDER_OBJECT_SIZE" radius-top="0" :height="WANDER_OBJECT_SIZE * 1.8" color="#6ea86e" :position="wander3Position" :wander-in-band="wander3Attr" shadow></a-cone>
          <a-octahedron :radius="WANDER_OBJECT_SIZE" color="#c2588a" :position="wander4Position" :wander-in-band="wander4Attr" shadow></a-octahedron>
          <a-dodecahedron :radius="WANDER_OBJECT_SIZE * 0.9" color="#8a7ac2" :position="wander5Position" :wander-in-band="wander5Attr" shadow></a-dodecahedron>
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
  <InfoOverlay text="In der Mitte eine Figur mit Rig-Animation, drumherum fünf Wanderer ohne Rig, die in einem Band um sie herumziehen. Die Regler unten steuern Tempo, Wander-Band und den Loop-Modus der mittleren Animation." />
</template>
