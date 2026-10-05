<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import LegacyOverlay, { type LegacyControl } from './LegacyOverlay.vue';

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

// #4 Europaplatz II: the original's UI (image-target-ui with skip-marker,
// recenter button, startInterval): "Start" recenters the scene and starts
// placing the slats (europaplatz-ii-distance-place-interval). See
// LegacyOverlay.vue.
const centerControls: LegacyControl[] = [
  {
    id: 'start',
    // Text from the live app the website links for #4 (mettler-europaplatz,
    // Willy-Brandt-Platz = Euro-Skulptur); the export mettler-europaplatz2
    // said "Europaviertel" (decided 2026-10-05).
    html: 'Richte Kamera auf Euro-Skulptur, tippe auf "Start" und bewege Dich langsam. '
      + '<div style="padding: .5em; background: #1d1eff; margin-top: .5em;">Start</div>',
    onClick: () => {
      document.getElementById('europaplatz-ii-legacy-space')
        ?.dispatchEvent(new CustomEvent('legacy-space-place'));
      const placer = document.getElementById('europaplatz-ii-placer') as any;
      placer?.components['europaplatz-ii-distance-place-interval']?.startInterval();
    }
  }
];

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

  <!-- #4 Europaplatz (Frankfurt) II (Yves Mettler), ported from the 8th Wall
       export `mettler-europaplatz2` — see
       augmented-bahnhofsviertel/about/04-europaplatz-ii/ and
       augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original scene, coordinates unchanged (old camera at 0 8 0,
         floor at y = 0), placed module-locally by legacy-space. Changes
         against the original body.html:
         - ids prefixed with "europaplatz-ii-";
         - the scene-level distance-place-interval (which placed every
           <a-asset-item> model in document order) ->
           europaplatz-ii-distance-place-interval inside the hull, with the
           same 40-entry model list (Latten_07 recurs as in the original),
           interval, runs and distance;
         - the lights' xrextras-attach to the camera -> legacy-attach (same
           schema; the camera is host-owned, outside the hull);
         - the scene-level `recenter` component (8th Wall "smart recenter":
           resets the engine's tracking after walking 5 units, to curb scale
           drift) dropped — it's engine-wide, the host owns tracking, and it
           was meant to be invisible ("objects appear to stay in place"). -->
    <a-entity
        id="europaplatz-ii-legacy-space"
        legacy-space="legacyCameraHeight: 8; legacyCameraDistance: 0">
      <a-entity
          id="europaplatz-ii-placer"
          europaplatz-ii-distance-place-interval="auto: false; interval: 1000; runs: 40; distance: 33;
              models: #europaplatz-ii-Yves_Latten_01, #europaplatz-ii-Yves_Latten_02, #europaplatz-ii-Yves_Latten_03, #europaplatz-ii-Yves_Latten_04, #europaplatz-ii-Yves_Latten_05, #europaplatz-ii-Yves_Latten_06, #europaplatz-ii-Yves_Latten_07, #europaplatz-ii-Yves_Latten_08, #europaplatz-ii-Yves_Latten_09, #europaplatz-ii-Yves_Latten_10, #europaplatz-ii-Yves_Latten_11, #europaplatz-ii-Yves_Latten_12, #europaplatz-ii-Yves_Latten_13, #europaplatz-ii-Yves_Latten_14, #europaplatz-ii-Yves_Latten_15, #europaplatz-ii-Yves_Latten_16, #europaplatz-ii-Yves_Latten_17, #europaplatz-ii-Yves_Latten_18, #europaplatz-ii-Yves_Latten_19, #europaplatz-ii-Yves_Latten_20, #europaplatz-ii-Yves_Latten_21, #europaplatz-ii-Yves_Latten_22, #europaplatz-ii-Yves_Latten_07, #europaplatz-ii-Yves_Latten_23, #europaplatz-ii-Yves_Latten_24, #europaplatz-ii-Yves_Latten_25, #europaplatz-ii-Yves_Latten_26, #europaplatz-ii-Yves_Latten_27, #europaplatz-ii-Yves_Latten_07, #europaplatz-ii-Yves_Latten_28, #europaplatz-ii-Yves_Latten_29, #europaplatz-ii-Yves_Latten_30, #europaplatz-ii-Yves_Latten_31, #europaplatz-ii-Yves_Latten_32, #europaplatz-ii-Yves_Latten_33, #europaplatz-ii-Yves_Latten_34, #europaplatz-ii-Yves_Latten_07, #europaplatz-ii-Yves_Latten_35, #europaplatz-ii-Yves_Latten_36, #europaplatz-ii-Yves_Latten_07">
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
            intensity: 2.0;
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

      <a-light type="ambient" intensity="1.5" color="#fff"></a-light>

      <a-box
          id="europaplatz-ii-ground"
          scale="10000 2 10000"
          position="0 -1 0"
          material="shader: shadow; transparent: true; opacity: 0.4"
          shadow>
      </a-box>
    </a-entity>
  </a-entity>

  <!-- The original's 2D UI: hint + Start (centre), recenter (top right). -->
  <LegacyOverlay
      hull-id="europaplatz-ii-legacy-space"
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
