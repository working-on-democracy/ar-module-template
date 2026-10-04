<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import LegacyOverlay, { type LegacyControl } from './LegacyOverlay.vue';
import { unlockAudio } from './a-frame-components/sound-unlock-audio';
import { pauseSoundsWhileHidden } from './legacy-audio';

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

// #6 Birdkin(d): the original's UI (image-target-ui with skip-marker,
// recenter button, enableAudio): "Start" unlocks audio, recenters the scene
// and starts the membrane timeline (birdkind-distance-place-sequence). See
// LegacyOverlay.vue.
const rootEntity = ref<HTMLElement | null>(null);
let stopPauseWhileHidden: (() => void) | null = null;
const centerControls: LegacyControl[] = [
  {
    id: 'audio',
    html: 'Drehe die Lautstärke auf, suche dir einen schönen Platz und tippe auf "Start" '
      + '<div style="padding: .5em; background: #1d1eff; margin-top: .5em;">Start</div>',
    onClick: () => {
      unlockAudio();
      document.getElementById('birdkind-legacy-space')
        ?.dispatchEvent(new CustomEvent('legacy-space-place'));
      const placer = document.getElementById('birdkind-placer') as any;
      placer?.components['birdkind-distance-place-sequence']?.start();
    }
  }
];

onMounted(() => {
  if (rootEntity.value) stopPauseWhileHidden = pauseSoundsWhileHidden(rootEntity.value);
  stopAssetTracking = trackAssetLoading(
    manifest.assets ?? [],
    (loaded, total) => { loadProgress.value = loaded / total; },
    () => { assetsLoaded.value = true; }
  );
});

onUnmounted(() => {
  stopAssetTracking?.();
  stopPauseWhileHidden?.();
});
</script>

<template>

  <!-- #6 Birdkin(d) (Katharina Pelosi), ported from the 8th Wall export
       `pelosi-birdkind` — see augmented-bahnhofsviertel/about/06-birdkind/
       and augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      ref="rootEntity"
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original scene, coordinates unchanged (old camera at 0 8 0,
         floor at y = 0), placed module-locally by legacy-space. Changes
         against the original body.html:
         - ids prefixed with "birdkind-";
         - the scene-level distance-place-sequence (which used every
           <a-asset-item> .gltf as model list and every .mp3 as sound list,
           in document order) -> birdkind-distance-place-sequence inside the
           hull with the same timeline and lists;
         - the lights' xrextras-attach to the camera -> legacy-attach (same
           schema; the camera is host-owned, outside the hull);
         - the original's reset hook (image-target-ui onDisabled) dropped:
           only fires on marker loss, and this work skips the marker;
         - sound falloff: linear, silent beyond 32 units (4 camera heights)
           instead of the original's gentle inverse curve, where every
           source sounded about equally loud at any distance (decided after
           the phone test, 2026-10-05). -->
    <a-entity
        id="birdkind-legacy-space"
        legacy-space="legacyCameraHeight: 8; legacyCameraDistance: 0">
      <a-entity
          id="birdkind-placer"
          birdkind-distance-place-sequence="sequence: 0, 40, 46, 54, 70, 85, 94, 109, 127, 135, 159, 175;
              models: #birdkind-Membran_01, #birdkind-Membran_02;
              sounds: #birdkind-01, #birdkind-02, #birdkind-03, #birdkind-04, #birdkind-05, #birdkind-06, #birdkind-07, #birdkind-08, #birdkind-09, #birdkind-10, #birdkind-11, #birdkind-12;
              distanceModel: linear; refDistance: 4; maxDistance: 32">
      </a-entity>

      <a-entity
          light="
            type: directional;
            intensity: 5.0;
            castShadow: true;
            shadowMapHeight: 1024;
            shadowMapWidth: 1024;
            shadowCameraTop: 20;
            shadowCameraBottom: -20;
            shadowCameraRight: 20;
            shadowCameraLeft: -20;
            target: #camera"
          legacy-attach="target: camera; offset: 8 15 4"
          position="1 4.3 2.5"
          shadow>
      </a-entity>

      <a-entity
          light="
            type: directional;
            intensity: 3.0;
            castShadow: false;
            shadowMapHeight: 1024;
            shadowMapWidth: 1024;
            shadowCameraTop: 20;
            shadowCameraBottom: -20;
            shadowCameraRight: 20;
            shadowCameraLeft: -20;
            target: #camera"
          legacy-attach="target: camera; offset: 8 15 -4"
          position="1 4.3 -2.5"
          shadow>
      </a-entity>

      <a-light type="ambient" intensity="2.0" color="#fff"></a-light>

      <a-box
          id="birdkind-ground"
          scale="10000 2 10000"
          position="0 -1 0"
          material="shader: shadow; transparent: true; opacity: 0.2; color: #fff800"
          shadow>
      </a-box>
    </a-entity>
  </a-entity>

  <!-- The original's 2D UI: hint + Start (centre), recenter (top right). -->
  <LegacyOverlay
      hull-id="birdkind-legacy-space"
      :center="centerControls"
      :recenter-button="true"
      :ready="assetsLoaded"
  />

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
</template>
