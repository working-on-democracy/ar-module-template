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
const wanderSpeed = ref(0.35); // shared across all 5 wanderers, own slider
const bandInner = ref(6); // shared band, two-thumb range-slider
const bandOuter = ref(12);
const clipTimeScale = ref(0.4); // central object's trim-loop-clip only
const clipLoop = ref<'once' | 'repeat' | 'pingpong'>('pingpong');

const trimAttr = computed(() => `timeScale: ${clipTimeScale.value.toFixed(2)}; loop: ${clipLoop.value}`);

// Each wanderer keeps its own authored chaos/floatIntensity/yawOffset
// (variety, per Fanyu_module's original values) while innerRadius/
// outerRadius/speed stay shared via the GUI, matching how
// proximity-wave-group applies one shared config across its children.
function wanderAttr(chaos: number, floatIntensity: number, yawOffset = 0): string {
  return `center: #mainEntity; innerRadius: ${bandInner.value}; outerRadius: ${bandOuter.value}; ` +
         `floatIntensity: ${floatIntensity}; speed: ${wanderSpeed.value.toFixed(2)}; chaos: ${chaos}` +
         (yawOffset ? `; yawOffset: ${yawOffset}` : '');
}

const wander1Attr = computed(() => wanderAttr(0.15, 0.05));
const wander2Attr = computed(() => wanderAttr(0.1, 0.05));
const wander3Attr = computed(() => wanderAttr(0.21, 0.05));
const wander4Attr = computed(() => wanderAttr(0.12, 0.04, 90));
const wander5Attr = computed(() => wanderAttr(0.18, 0.06, 180));

const guiControls = computed<GuiControl[]>(() => [
  {
    type: 'slider',
    id: 'wander-speed',
    label: 'Wanderer-Tempo',
    min: 0.1,
    max: 1,
    step: 0.05,
    value: wanderSpeed.value,
    onInput: (value) => { wanderSpeed.value = value; }
  },
  {
    type: 'range-slider',
    id: 'wander-band',
    label: 'Wander-Band',
    min: 2,
    max: 16,
    step: 0.5,
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
        position="0 -2 0"
        no-frustum-cull
        :visible="assetsLoaded"
    >
      <!-- What the directional light below aims at — move this entity to
           redirect the light (and the shadows it casts) instead of having to
           re-aim the light itself. -->
      <a-entity id="lightTarget" position="0 0 -3"></a-entity>

      <!-- Directional light that casts shadows onto the ground plane below.
           Positioned above the scene, aimed at #lightTarget above. -->
      <a-entity
          position="1 20 10"
          light="
                      type: directional;
                      intensity: 1;
                      target: #lightTarget;
                      castShadow: true;
                      shadowMapHeight:2048;
                      shadowMapWidth:2048;
                      shadowCameraTop: 80;
                      shadowCameraBottom: -80;
                      shadowCameraRight: 80;
                      shadowCameraLeft: -80;
                      shadowRadius: 12"
          shadow>
      </a-entity>

      <a-light type="ambient" intensity="0.7"></a-light>

      <!-- Zentrales, unbewegliches Objekt (archive-of-practice
           projects/an-alle/concepts/animationssystem-wanderer.md,
           Entscheidung 1): Rig-Animation per trim-loop-clip, GUI-steuerbar
           (timeScale/loop). Kein wander-in-band hier — bleibt an Ort und
           Stelle, damit die fünf Wanderer einen festen Bezugspunkt haben. -->
      <a-entity
          id="mainEntity"
          gltf-model="#MainCharacter3"
          scale="2 2 2"
          position="0 0 -10"
          :trim-loop-clip="trimAttr"
          shadow>
      </a-entity>

      <!-- Fünf Wanderer, kein Rig — nur wander-in-band/Orbit-Pfad um
           #mainEntity (Entscheidung 1). Gemeinsamer Elternknoten, damit die
           eingebaute gegenseitige Ausweich-Logik von wander-in-band greift
           (sie schaut nur auf Geschwister unter demselben Parent).
           Primitive-Platzhalter statt der Fanyu_module-Seed-Modelle
           (30.08.2026, s. archive-of-practice
           projects/an-alle/assets-checkliste.md) — nur die zentrale Figur
           oben behält das Fanyu-Asset. wander-in-band schreibt nur
           position/rotation.y der eigenen Entität, ist also unabhängig von
           gltf-model vs. Primitive (kein model-loaded nötig, anders als bei
           proximity-fade/-cutout). -->
      <a-entity id="wandererGroup">
        <a-sphere radius="0.6" color="#d9954a" position="-5 0.5 -6" :wander-in-band="wander1Attr" shadow></a-sphere>
        <a-box width="1" height="1" depth="1" color="#4a90d9" position="-5 0.5 -2" :wander-in-band="wander2Attr" shadow></a-box>
        <a-cone radius-bottom="0.6" radius-top="0" height="1.1" color="#6ea86e" position="10 0.5 -4" :wander-in-band="wander3Attr" shadow></a-cone>
        <a-octahedron radius="0.55" color="#c2588a" position="4 0.5 -14" :wander-in-band="wander4Attr" shadow></a-octahedron>
        <a-dodecahedron radius="0.5" color="#8a7ac2" position="-8 0.5 -12" :wander-in-band="wander5Attr" shadow></a-dodecahedron>
      </a-entity>

      <!-- Ground plane. Renders ONLY the
           shadows cast onto it (material="shader: shadow"), not a visible
           surface of its own, so it stays invisible until something above
           actually casts a shadow onto it. A good baseline to build a scene
           on top of. -->
      <a-plane
          id="ground"
          rotation="-90 0 0"
          position="-50 0 -50"
          width="500"
          height="500"
          material="shader: shadow"
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
