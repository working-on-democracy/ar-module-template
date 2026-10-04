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

// #7 I can't get no: the original's UI (image-target-ui with skip-marker,
// recenter button, startExperience): "Start" recenters the scene, opens the
// portal (the hider ring's inner radius springs from 0 to 5) and starts the
// panorama video (it has no audio track). See LegacyOverlay.vue.
const centerControls: LegacyControl[] = [
  {
    id: 'start',
    html: 'Trete von der Strasse weg. Richte die Kamera auf den Eingang der Deutschen Bank. Tippe auf "Start". '
      + '<div style="padding: .5em; background: #1d1eff; margin-top: .5em;">Start</div>',
    onClick: () => {
      document.getElementById('i-cant-get-no-legacy-space')
        ?.dispatchEvent(new CustomEvent('legacy-space-place'));
      document.getElementById('i-cant-get-no-portalHiderRing')?.setAttribute('animation__1',
        'property: radius-inner; dur: 1500; from: 0.001; to: 5; easing: easeOutElastic');
      (document.getElementById('i-cant-get-no-sphericalMap2') as HTMLVideoElement | null)
        ?.play().catch(() => { /* autoplay refused — stays on the first frame */ });
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

  <!-- #7 I can't get no (Diefenbach), ported from the 8th Wall export
       `diefenbach-cannotgetno` — see augmented-bahnhofsviertel/about/07-i-cant-get-no/
       and augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original scene, coordinates unchanged, placed module-locally by
         legacy-space (old camera at 0 8 11, hence legacyCameraHeight 8 /
         legacyCameraDistance 11). A walk-through portal: the hider ring
         (xrextras-hider-material, depth only) masks everything behind the
         portal plane until "Start" opens a hole in it; walking through the
         plane (z = 0) shows the panorama video and the two treadmills all
         around. Changes against the original body.html: ids prefixed with
         "i-cant-get-no-"; `portal-camera` on the host-owned camera ->
         legacy-portal on the old scene origin (converts the camera's world
         position into the hull, pins the original's draw order). No
         tap-recenter in the original. -->
    <a-entity
        id="i-cant-get-no-legacy-space"
        legacy-space="legacyCameraHeight: 8; legacyCameraDistance: 11">
      <a-entity
          legacy-portal="contents: #i-cant-get-no-portal-contents; walls: #i-cant-get-no-hider-walls; portalWall: #i-cant-get-no-portal-wall">
        <!-- Hider walls -->
        <a-entity id="i-cant-get-no-hider-walls">
          <a-box scale="100 1 100" position="0 -1 49" xrextras-hider-material></a-box>
          <a-box scale="100 100 1" position="0 50 75" xrextras-hider-material></a-box>
          <a-box scale="100 1 100" position="0 100 49" xrextras-hider-material></a-box>
          <a-box scale="1 100 100" position="-30 50 50" xrextras-hider-material></a-box>
          <a-box scale="1 100 100" position="30 50 50" xrextras-hider-material></a-box>
          <a-ring id="i-cant-get-no-portalHiderRing" radius-inner="0" radius-outer="100" position="0 7.5 -0.2" xrextras-hider-material></a-ring>
        </a-entity>

        <a-entity id="i-cant-get-no-portal-wall">
          <a-circle radius="5.2" rotation="0 180 0" position="0 7.5 0" scale="0.8 0.8 0" xrextras-hider-material></a-circle>
          <a-circle radius="5.2" rotation="0 180 0" position="0 7.5 -0.25" scale="0.8 0.8 0" xrextras-hider-material></a-circle>
        </a-entity>

        <!-- Lights -->
        <a-light type="ambient" intensity="0.9" color="#e33900"></a-light>
        <a-entity light="type: directional; color: #E37300; intensity: 4.5" position="-1 1 0"></a-entity>

        <!-- Portal contents -->
        <a-entity id="i-cant-get-no-portal-contents">
          <a-videosphere rotation="0 -90 0" src="#i-cant-get-no-sphericalMap2"></a-videosphere>
          <a-entity
              gltf-model="#i-cant-get-no-Laufband"
              rotation="0 90 0"
              position="15 0 -22"
              scale="40 40 40"
              shadow="cast: false">
          </a-entity>
          <a-entity
              gltf-model="#i-cant-get-no-Laufband"
              rotation="0 -120 0"
              position="-5 0 -70"
              scale="40 40 40"
              shadow="cast: false">
          </a-entity>
        </a-entity>
      </a-entity>
    </a-entity>
  </a-entity>

  <!-- The original's 2D UI: start text button (centre), recenter (top right). -->
  <LegacyOverlay
      hull-id="i-cant-get-no-legacy-space"
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
