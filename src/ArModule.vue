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

// #23 Privileged II: the original's UI (image-target-ui with skip-marker,
// recenter button, enable-video): once the scene is placed, "P L A Y"
// starts the four videos. As in the original, only video 1 has sound — the
// host injects every video muted, so it's unmuted here, inside the tap.
const VIDEO_IDS = ['privileged-ii-1', 'privileged-ii-2', 'privileged-ii-3', 'privileged-ii-4'];
const centerControls: LegacyControl[] = [
  {
    id: 'play',
    html: 'P L A Y',
    onClick: () => {
      VIDEO_IDS.forEach((id, i) => {
        const video = document.getElementById(id) as HTMLVideoElement | null;
        if (!video) return;
        video.muted = i !== 0;
        video.play().catch(() => { /* autoplay refused — stays on the first frame */ });
      });
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

  <!-- #23 Privileged II (Jonathan Radetz, Istanbul), ported from the 8th Wall
       export `radetz-istanbul` — see
       augmented-bahnhofsviertel/about/23-privileged-ii/ and
       augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original scene, coordinates unchanged, placed module-locally by
         legacy-space. This work's camera started at 0 0.8 0 — in the middle
         of four 16x9 video screens (8 units away, all four sides) with a
         "facts" panel on the floor in front of each — hence
         legacyCameraHeight 0.8 / legacyCameraDistance 0. Changes against the
         original body.html: ids prefixed with "privileged-ii-"; the
         scene-level xrextras-tap-recenter became legacy-space's tapRecenter;
         `play-video` dropped (never registered in the original project, so
         it had no effect — the PLAY button starts the videos); the group's
         `image-target` and a stray ">" in the markup dropped; the six
         declared-but-unused cubemap images not imported. -->
    <a-entity
        id="privileged-ii-legacy-space"
        legacy-space="legacyCameraHeight: 0.8; legacyCameraDistance: 0; tapRecenter: true">
      <a-entity
          xr-light
          light="type: directional;
             castShadow: true;
             shadowMapHeight: 2048;
             shadowMapWidth: 2048;
             shadowCameraTop: 10;
             target: #privileged-ii-group;"
          xrextras-attach="target: privileged-ii-group; offset: 0 15 0;"
          shadow>
      </a-entity>

      <a-light
          xr-light
          type="ambient">
      </a-light>

      <a-entity id="privileged-ii-group">
        <a-entity
            geometry="primitive: plane; height: 9; width: 16;"
            material="src: #privileged-ii-1"
            rotation="0 180 0"
            position="0 4.5 8">
        </a-entity>

        <a-entity
            gltf-model="#privileged-ii-Fakten1"
            position="0 0 2"
            rotation="0 180 0"
            scale="1.5 1.5 1.5">
        </a-entity>

        <a-entity
            geometry="primitive: plane; height: 9; width: 16;"
            material="src: #privileged-ii-2"
            rotation="0 -90 0"
            position="8 4.5 0">
        </a-entity>

        <a-entity
            gltf-model="#privileged-ii-Fakten2"
            position="2 0 0"
            rotation="0 -90 0"
            scale="1.5 1.5 1.5">
        </a-entity>

        <a-entity
            geometry="primitive: plane; height: 9; width: 16;"
            material="src: #privileged-ii-3"
            rotation="0 0 0"
            position="0 4.5 -8">
        </a-entity>

        <a-entity
            gltf-model="#privileged-ii-Fakten3"
            position="0 0 -2"
            rotation="0 0 0"
            scale="1.5 1.5 1.5">
        </a-entity>

        <a-entity
            geometry="primitive: plane; height: 9; width: 16;"
            material="src: #privileged-ii-4"
            rotation="0 90 0"
            position="-8 4.5 0">
        </a-entity>

        <a-entity
            gltf-model="#privileged-ii-Fakten4"
            position="-2 0 0"
            rotation="0 90 0"
            scale="1.5 1.5 1.5">
        </a-entity>
      </a-entity>
    </a-entity>
  </a-entity>

  <!-- The original's 2D UI: PLAY (centre), recenter (top right). -->
  <LegacyOverlay
      hull-id="privileged-ii-legacy-space"
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
