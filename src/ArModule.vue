<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import LegacyOverlay, { type LegacyControl } from './LegacyOverlay.vue';
import { TAP_ON_CURSOR_ICON } from './legacy-ui-icons';

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

// #5 Unwetter am Steg: the original's UI (image-target-ui with skip-marker,
// recenter button, showCustomTapCursorHint): once the scene is placed, the
// hint "Gehe auf die Brücke und tippe auf den Cursor" (closes on tap); the
// placement itself is the cursor component in the scene. See LegacyOverlay.vue.
const centerControls: LegacyControl[] = [
  {
    id: 'tap-cursor',
    variant: 'hint',
    html: 'Gehe auf die Brücke und tippe auf den Cursor ' + TAP_ON_CURSOR_ICON
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

  <!-- #5 Unwetter am Steg (Parastou Forouhar), ported from the 8th Wall
       export `forouhar-unwetter` — see
       augmented-bahnhofsviertel/about/05-unwetter-am-steg/ and
       augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original scene, coordinates unchanged (old camera at 0 8 8,
         floor at y = 0), placed module-locally by legacy-space. The pink
         ring follows the screen centre on the ground; every tap places the
         cloud at the ring (unwetter-am-steg-tap-place-cursor, the original's
         tap-place-cursor made to work inside the hull and on iOS). Changes
         against the original body.html: ids prefixed with
         "unwetter-am-steg-"; cubemap-static's faces point at the work's
         prefixed images; the `image-target` wrapper kept as a plain entity;
         the cursor component attached directly (the original attached it
         when the scene became ready — the hull stays hidden until then).

         Deliberate deviation (2026-10-04, matched by eye to the original's
         marker screenshot): cubemap-static envMapIntensity 2.5. The figures
         are black and fully metallic, so only the env map lights them; even
         with the faces read linearly like the original, they stayed darker
         than in the screenshot. -->
    <a-entity id="unwetter-am-steg-legacy-space" legacy-space>
      <a-entity
          xr-light
          light="
            type: directional;
            intensity: 0.1;
            castShadow: true;
            shadowMapHeight: 1024;
            shadowMapWidth: 1024;
            shadowCameraTop: 10;
            target: #unwetter-am-steg-model;"
          xrextras-attach="target: unwetter-am-steg-model; offset: 1 15 3;"
          shadow>
      </a-entity>

      <a-light
          xr-light
          type="ambient"
          intensity="0.1">
      </a-light>

      <a-entity>
        <a-ring
            id="unwetter-am-steg-cursor"
            unwetter-am-steg-tap-place-cursor="model: #unwetter-am-steg-model; ground: #unwetter-am-steg-ground"
            position="0 0 0"
            rotation="-90 0 0"
            material="shader: flat; color: #FC046C"
            radius-inner="0.65" radius-outer="0.8"></a-ring>

        <a-entity
            id="unwetter-am-steg-model"
            gltf-model="#unwetter-am-steg-Wolke_v05"
            scale="90 90 90"
            position="0 -40 0"
            shadow="receive: false"
            animation-mixer="clip: animation_0"
            cubemap-static="envMapIntensity: 2.5; posx: #unwetter-am-steg-posx; negx: #unwetter-am-steg-negx; posy: #unwetter-am-steg-posy; negy: #unwetter-am-steg-negy; posz: #unwetter-am-steg-posz; negz: #unwetter-am-steg-negz">
        </a-entity>
      </a-entity>

      <a-plane
          id="unwetter-am-steg-ground"
          rotation="-90 0 0"
          width="20000"
          height="20000"
          material="shader: shadow"
          shadow>
      </a-plane>
    </a-entity>
  </a-entity>

  <!-- The original's 2D UI: tap-cursor hint (centre), recenter (top right). -->
  <LegacyOverlay
      hull-id="unwetter-am-steg-legacy-space"
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
