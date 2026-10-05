<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import LegacyOverlay, { type LegacyControl } from './LegacyOverlay.vue';
import { actionButtonHtml } from './legacy-ui-icons';

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

// #2 Xenoglossy II: the original's UI (image-target-ui with skip-marker,
// recenter button, startExperience): once the scene is placed, a hint with
// a Start button; Start re-places the scene and shows the model (the
// original's order). See LegacyOverlay.vue.
const centerControls: LegacyControl[] = [
  {
    id: 'start',
    // Text as in the live app digitalekunst.8thwall.app/kohlmann-xenoglossy2 (Taunustor 1-3).
    html: 'Gehe zur Skulptur von Franz West und tippe auf "Start" ' + actionButtonHtml('Start'),
    onClick: () => {
      document.getElementById('xenoglossy-ii-legacy-space')?.dispatchEvent(new CustomEvent('legacy-space-place'));
      document.getElementById('xenoglossy-ii-model')?.setAttribute('visible', 'true');
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

  <!-- #2 Xenoglossy II (Tina Kohlmann), ported from the LIVE 8th Wall app
       digitalekunst.8thwall.app/kohlmann-xenoglossy2 (scene and texts read
       from what it serves, 2026-10-05; no export exists).
       Sibling of #1 (branch abv-01-xenoglossy-i): same components and UI,
       own colour version of the face, own placement, scale and light — see
       augmented-bahnhofsviertel/about/02-xenoglossy-ii/ and
       augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original scene, coordinates unchanged (old camera at 0 8 8,
         floor at y = 0), placed module-locally by legacy-space. The model
         stays hidden until Start (LegacyOverlay below). Changes against the
         original body.html:
         - ids prefixed with "xenoglossy-ii-";
         - xrextras-hold-drag -> hold-drag (works inside the hull; groundId
           points at the prefixed ground box);
         - the light's xrextras-attach to the camera -> legacy-attach (same
           schema; the camera is host-owned, outside the hull);
         - `env-map-white` dropped: never registered in the original
           project, so it had no effect;
         - the `image-target` wrapper kept as a plain entity (its position
           offset matters; its "hidden until ready" role is the hull's);
         - `shadow="recieve: false"` kept as authored — the typo means the
           model did receive shadows in the original. -->
    <a-entity id="xenoglossy-ii-legacy-space" legacy-space>
      <a-entity position="0 0 -10">
        <a-entity
            id="xenoglossy-ii-model"
            visible="false"
            gltf-model="#xenoglossy-ii-Gesicht_v31"
            position="12 0 -10"
            rotation="0 -150 0"
            scale="12 12 12"
            hold-drag="groundId: xenoglossy-ii-ground"
            xrextras-two-finger-rotate
            xrextras-pinch-scale
            class="cantap"
            shadow="recieve: false"
            animation-mixer="clip: animation_0">
        </a-entity>
      </a-entity>

      <a-entity
          light="
            type: directional;
            intensity: 1.8;
            castShadow: true;
            shadowMapHeight: 2048;
            shadowMapWidth: 2048;
            shadowCameraTop: 20;
            shadowCameraBottom: -20;
            shadowCameraRight: 20;
            shadowCameraLeft: -20;
            target: #camera"
          legacy-attach="target: camera; offset: 20 30 14"
          position="1 4.3 2.5"
          shadow>
      </a-entity>
      <a-light type="ambient" intensity="5.5"></a-light>
      <a-box
          id="xenoglossy-ii-ground"
          scale="10000 2 10000"
          position="12 -1 -10"
          material="shader: shadow; transparent: true; opacity: 0.4"
          shadow>
      </a-box>
    </a-entity>
  </a-entity>

  <!-- The original's 2D UI: hint + Start (centre), recenter (top right). -->
  <LegacyOverlay
      hull-id="xenoglossy-ii-legacy-space"
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
