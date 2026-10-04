<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import LegacyOverlay, { type LegacyControl } from './LegacyOverlay.vue';
import { playLegacySounds, pauseSoundsWhileHidden } from './legacy-audio';
import { PLAY_ICON } from './funkytown-icons';

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

// #18 Funkytown: the original's UI (image-target-ui with skip-marker, no
// recenter button, enable-audio): once the scene is placed, an audio button
// in the centre starts both sounds. Re-placing is by tapping the scene
// (legacy-space tapRecenter). See LegacyOverlay.vue / legacy-audio.ts.
const rootEntity = ref<HTMLElement | null>(null);
let stopPauseWhileHidden: (() => void) | null = null;
const centerControls: LegacyControl[] = [
  {
    id: 'audio',
    html: PLAY_ICON,
    onClick: () => { if (rootEntity.value) playLegacySounds(rootEntity.value); }
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

  <!-- #18 Funkytown (saasfee*), ported from the 8th Wall export `disco` — see
       augmented-bahnhofsviertel/about/18-funkytown/ and
       augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      ref="rootEntity"
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original scene, coordinates unchanged, placed module-locally by
         legacy-space. This work's camera started at 0 18 8 (not 0 8 8),
         hence legacyCameraHeight 18. legacy-space also scales the point
         light's range and the sounds' distances to the scene. Changes
         against the original body.html:
         - ids prefixed with "funkytown-";
         - the light's xrextras-attach to the camera -> legacy-attach;
         - the scene-level xrextras-tap-recenter -> legacy-space tapRecenter;
         - responsive-immersive dropped: on phones it attached
           cubemap-static to the tiny static ball and cubemap-realtime to the
           visible one at "realityready" — the live one is set directly here
           (the host is always a phone camera session), the static one is
           left out (see the note at the end of this comment);
         - the camera's fov="120" dropped (host-owned; XR8 sets the
           projection from the device anyway); landing-page (desktop QR
           page) dropped;
         - the point light's animation__color is kept as authored: it lacks
           `property:`, so it had no effect in the original either.

         Notes from the phone tests (2026-10-04): a centred placement was
         tried and rejected — the off-centre ball and the angled floor
         lettering are as intended. The visible ball looked colourful and
         ignored the camera: in three r158 the invisible mini-ball's static
         env map (cubemap-static, funkytown02.jpg) and the visible ball's
         live one interfere, and the live one ended up showing the static
         image. The mini-ball (scale 0.001, practically invisible, so the
         static map had no visible effect in the original either) therefore
         gets no env map — deliberate deviation. -->
    <a-entity id="funkytown-legacy-space" legacy-space="legacyCameraHeight: 18; tapRecenter: true">
      <a-entity
          xr-light
          light="type: directional;
             castShadow: true;
             shadowMapHeight: 2048;
             shadowMapWidth: 2048;
             shadowCameraTop: 200;
             shadowCameraBottom: -200;
             shadowCameraRight: 200;
             shadowCameraLeft: -200;
             target: #camera;
             shadowRadius: 4"
          legacy-attach="target: camera; offset: 8 40 -22;"
          shadow>
      </a-entity>

      <a-light
          xr-light
          type="ambient">
      </a-light>

      <a-entity
          light="type: point; color: #F0F; intensity: 100.0; distance: 20"
          position="10 3 -15"
          animation="property: light.intensity; from:1.0; to:-1.0; dur: 468; loop:true; easings: easeOutExpo; dir: normal; autoplay: true"
          animation__color="light.color; from:rgb(200, 70, 30); to:rgb(0, 30, 180); dur: 1500; loop:true; easings: easeInOutSine; dir: alternate; autoplay: true">
      </a-entity>

      <a-entity id="funkytown-group">
        <a-entity
            id="funkytown-ambient-sound"
            geometry="primitive: box"
            material="color: red; opacity: 0.0; transparent: true"
            light="type: point; intensity: 2.0"
            sound="src: #funkytown-sergej-auto-ambient; loop: true; volume: .6; maxDistance: 36; distanceModel: linear; rolloffFactor: 1"
            position="0 18 8"
            shadow>
        </a-entity>

        <a-entity
            id="funkytown-disco-sound"
            geometry="primitive: box"
            material="color: green; opacity: 0.0; transparent: true"
            sound="src: #funkytown-sergej-auto-jump; loop: true; volume: 1; maxDistance: 46; distanceModel: linear; rolloffFactor: 1"
            position="-30 20 -50"
            shadow>
        </a-entity>

        <a-entity
            id="funkytown-static-ball"
            gltf-model="#funkytown-kugel49"
            position="0 0 0"
            scale=".001 .001 .001">
        </a-entity>

        <a-entity
            id="funkytown-realtime-ball"
            gltf-model="#funkytown-kugel49"
            cubemap-realtime
            animation-mixer="clip: animation_0; timeScale: 0.5"
            position="0 0 0"
            shadow>
        </a-entity>
      </a-entity>

      <a-plane
          id="funkytown-ground"
          rotation="-90 0 0"
          position="0 0 0"
          width="200"
          height="200"
          material="shader: shadow"
          shadow>
      </a-plane>
    </a-entity>
  </a-entity>

  <!-- The original's 2D UI: audio button (centre); no recenter button. -->
  <LegacyOverlay
      hull-id="funkytown-legacy-space"
      :center="centerControls"
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
