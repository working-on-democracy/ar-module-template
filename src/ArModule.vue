<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';

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
</script>

<template>

  <!-- #21 Die Reisende (HazMatLab), ported from the 8th Wall export
       `hazmadlab` — see augmented-bahnhofsviertel/about/21-die-reisende/
       and augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original scene, coordinates unchanged (old camera at 0 8 8,
         floor at y = 0), placed module-locally by legacy-space. Changes
         against the original body.html: ids prefixed with "die-reisende-"
         (shared host scene); the scene-level xrextras-tap-recenter became
         legacy-space's tapRecenter (re-places only this work, not the whole
         XR8 world); `Scale` written lowercase (HTML treated it as `scale`
         anyway). The original also declared six cubemap-static images it
         never used — not imported.

         Deliberate deviations after the phone test (2026-10-04, user's own
         judgment — the original's look isn't known to us):
         - slime at z = -35 instead of -25 (a bit further away);
         - xrextras-pinch-scale moved from the group onto the model: on the
           group it scaled around the old scene origin ~25 units in front of
           the slime, so pinching also pushed the slime away and its apparent
           size barely followed the fingers. On the model it scales around
           the slime itself, from its start size down to 1/3 and up to 5x. -->
    <a-entity id="die-reisende-legacy-space" legacy-space="tapRecenter: true">
      <a-entity
          xr-light
          light="type: directional;
             castShadow: true;
             shadowMapHeight: 2048;
             shadowMapWidth: 2048;
             shadowCameraTop: 10;
             target: #die-reisende-group;"
          xrextras-attach="target: die-reisende-group; offset: 0 15 0;"
          shadow>
      </a-entity>

      <a-light
          xr-light
          type="ambient">
      </a-light>

      <a-entity
          id="die-reisende-group"
          position="0 0 0"
          scale="1 1 1">
        <a-entity
            gltf-model="#die-reisende-slime8"
            cubemap-realtime
            xrextras-pinch-scale="max: 5"
            position="-4 -4 -35"
            rotation="0 60 0"
            scale="12 12 12"
            shadow>
        </a-entity>
      </a-entity>

      <a-plane
          id="die-reisende-ground"
          rotation="-90 0 0"
          width="2048"
          height="2048"
          material="shader: shadow; transparent: true; opacity: 0.15"
          shadow>
      </a-plane>
    </a-entity>
  </a-entity>

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
