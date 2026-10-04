<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import LegacyOverlay, { type LegacyControl } from './LegacyOverlay.vue';
import { playLegacySounds, pauseSoundsWhileHidden } from './legacy-audio';
import { PLAY_AUDIO_ICON } from './friendly-reminder-icons';

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

// #16 Friendly reminder: the original's UI (image-target-ui with
// skip-marker, recenter button, enable-audio): once the scene is placed, a
// play-audio button in the centre starts the sound loop, and a recenter
// button sits top right. See LegacyOverlay.vue / legacy-audio.ts.
const rootEntity = ref<HTMLElement | null>(null);
let stopPauseWhileHidden: (() => void) | null = null;
const centerControls: LegacyControl[] = [
  {
    id: 'audio',
    html: PLAY_AUDIO_ICON,
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

  <!-- #16 Friendly reminder (enşöligensi) (Nouria Behloul), ported from the
       8th Wall export `nouria-behloul` — see
       augmented-bahnhofsviertel/about/16-friendly-reminder/ and
       augmented-bahnhofsviertel/PORTING-GUIDE.md.

       Assets come from the manifest (src/assets/, id = file name without
       extension) and are injected by the host — no <a-assets> here. -->
  <a-entity
      ref="rootEntity"
      no-frustum-cull
      :visible="assetsLoaded"
  >
    <!-- The original's sound loop sat on <a-camera> (host-owned here). A
         non-positional sound sounds the same as one at the listener; it
         starts from the play-audio button (LegacyOverlay below). -->
    <a-entity
        id="friendly-reminder-sound"
        sound="src: #friendly-reminder-Soundfile; loop: true; volume: 1; positional: false">
    </a-entity>

    <!-- The original scene, coordinates unchanged (old camera at 0 8 8,
         floor at y = 0), placed module-locally by legacy-space. Changes
         against the original body.html: ids prefixed with
         "friendly-reminder-" — including the light's #group target, which
         doesn't exist in this scene (a leftover; prefixed so it can't grab
         another module's #group in the shared host scene); the scene-level
         xrextras-tap-recenter became legacy-space's tapRecenter.

         Deliberate deviation (2026-10-04, after the phone test): the flag's
         animation-mixer is replaced by crossfade-loop-clip. The flag is a
         baked cloth simulation (401 morph-target frames) whose end doesn't
         match its start, so the original jumped at every loop (~28x a normal
         frame step, measured); now the last 0.5 s blend into the loop start.
         Same played range as before (keyframes before t = 0 stay unplayed). -->
    <a-entity id="friendly-reminder-legacy-space" legacy-space="tapRecenter: true">
      <a-entity
          xr-light
          light="type: directional;
             target: #friendly-reminder-group;"
          xrextras-attach="target: friendly-reminder-group; offset: 0 15 0;">
      </a-entity>

      <a-light
          xr-light
          type="ambient">
      </a-light>

      <a-entity
          gltf-model="#friendly-reminder-Flag"
          position="4 -15 -60"
          rotation="0 0 0"
          scale="27 27 27"
          crossfade-loop-clip="clip: animation_0; crossfade: 0.5">
      </a-entity>
    </a-entity>
  </a-entity>

  <!-- The original's 2D UI: play-audio button (centre), recenter (top right). -->
  <LegacyOverlay
      hull-id="friendly-reminder-legacy-space"
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
