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

// AN ALLE! Sound-Player (archive-of-practice
// projects/an-alle/concepts/sound-player.md) — the 2D GUI panel drives the
// same play/pause/stop/restart state machine as the 3D tap buttons below,
// via [sound-controller] on the module root. The panel can't read that
// component's state directly (it lives outside the A-Frame/three.js scene
// graph entirely), so it listens for the "sound-state-changed" event the
// controller emits on the root entity instead — same bridge pattern as the
// superseded examples/sound-gui-panel.html, just re-expressed as one
// GuiControl (type: "transport") instead of a bespoke icon panel, per
// decision 2 in sound-player.md ("Umstellung auf den neuen, einheitlichen
// GUI-Baustein statt Übernahme des bestehenden sound-gui-panel.html").
type SoundStatus = 'idle' | 'playing' | 'paused';

const rootEntity = ref<HTMLElement | null>(null);
const soundStatus = ref<SoundStatus>('idle');

// Footprint convention — applies to every test scene built on this template,
// not just Sound-Player: the tracked image itself IS the scene's ground
// plane. xrextras-named-image-target's local X/Y match the printed image's
// own width/depth; local Z is height above it. Every object's horizontal
// (X/Y) position must stay within the image's own printed bounds — only Z
// (height) is free to extend beyond. Sizes/offsets below are proportional to
// the footprint rather than fixed units, so a scene keeps its proportions
// once the real AN ALLE! target (see guides/IMAGE-TRACKING-FEATURE-GUIDE.md)
// replaces this placeholder with different physical dimensions.
const targetProps = (manifest.imageTargets?.[0] as { properties?: { width: number; height: number } } | undefined)?.properties;
const FOOTPRINT_DEPTH = 1; // the engine always normalizes the target's local Y extent to 1
const FOOTPRINT_WIDTH = targetProps ? targetProps.width / targetProps.height : 0.75; // local X extent, from the target's own aspect ratio

const SPHERE_RADIUS = FOOTPRINT_DEPTH * 0.08;
const CONTENT_HEIGHT = FOOTPRINT_DEPTH * 0.2; // how high above the image plane the spheres float
const ORBIT_RADIUS = FOOTPRINT_DEPTH * 0.12;

const staticButtonPosition = `${(-FOOTPRINT_WIDTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 0.2).toFixed(3)} ${CONTENT_HEIGHT.toFixed(3)}`;
const wanderPivotPosition = `${(FOOTPRINT_WIDTH * 0.25).toFixed(3)} ${(-FOOTPRINT_DEPTH * 0.15).toFixed(3)} ${CONTENT_HEIGHT.toFixed(3)}`;
const orbitOffset = `${ORBIT_RADIUS.toFixed(3)} 0 0`;
const lightPosition = `${(FOOTPRINT_WIDTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 1.5).toFixed(3)}`;
const lightConfig = `type: directional; intensity: 1; target: #lightTarget; castShadow: true; shadowMapHeight: 2048; shadowMapWidth: 2048; shadowCameraTop: ${FOOTPRINT_DEPTH}; shadowCameraBottom: ${-FOOTPRINT_DEPTH}; shadowCameraRight: ${FOOTPRINT_DEPTH}; shadowCameraLeft: ${-FOOTPRINT_DEPTH}; shadowRadius: 4`;
const groundMaterial = 'color: #3b82f6; opacity: 0.35; side: double';

function onSoundStateChanged(e: Event) {
  soundStatus.value = (e as CustomEvent).detail.status;
}

function getController(): any {
  return (rootEntity.value as any)?.components?.['sound-controller'];
}

const guiControls = computed<GuiControl[]>(() => [
  {
    type: 'transport',
    id: 'sound-transport',
    buttons: [
      { id: 'restart', label: 'Neustart', onClick: () => getController()?.restartActive() },
      { id: 'stop', label: 'Stop', onClick: () => getController()?.stopActive() },
      {
        id: 'play-pause',
        label: soundStatus.value === 'playing' ? 'Pause' : 'Play',
        active: soundStatus.value === 'playing',
        onClick: () => getController()?.togglePlayPause()
      }
    ]
  }
]);

onMounted(() => {
  rootEntity.value?.addEventListener('sound-state-changed', onSoundStateChanged);
});

onUnmounted(() => {
  rootEntity.value?.removeEventListener('sound-state-changed', onSoundStateChanged);
});
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
        ref="rootEntity"
        no-frustum-cull
        :visible="assetsLoaded"
        ar-button-manager
        sound-controller
    >
      <!-- Sound-Player Themenfeld (archive-of-practice
           projects/an-alle/concepts/sound-player.md, Entscheidung 3): two
           sources, both tappable via [ar-button]+[sound-button] (see
           examples/ar-button-usage.html) so the 2D transport panel above and
           the 3D tap targets below drive the exact same
           [sound-controller] state machine — the pedagogical point of this
           Themenfeld ("Erklärung zu Buttons und Triggern"). Placeholder
           spheres stand in for the author's own visual assets (not yet
           provided); swap the geometry, keep the ar-button/sound-button
           wiring. Placeholder clips (src/assets/sound-*-clip.wav, short
           looping sine tones) stand in for the author's own soundfiles per
           the same decision — swap only the asset id below once real files
           land in src/assets/. -->

      <!-- Static source: fixed position, NON-positional audio (no
           panning/rolloff) — the "statisch" half of decision 3. -->
      <a-entity id="static_sound" sound="src: #sound-static-clip; autoplay: false; loop: true"></a-entity>
      <a-sphere
          id="static_button"
          :position="staticButtonPosition"
          :radius="SPHERE_RADIUS"
          color="#3b6ea5"
          ar-button="near: 2; far: 4.5; pulse: 0.2; zoneSize: 1.6 1.6 1.6"
          sound-button="sound: #static_sound">
      </a-sphere>

      <!-- Wandering source: a plain built-in [animation] on the PIVOT's
           rotation (not on the sphere's own position) turns the sphere's
           fixed offset into a circular path — the "kein Rig, kein
           wander-in-band, kein follow-node, nur A-Frames eingebaute
           animation-Component" constraint from decision 3, expressed with
           the built-in component alone (it only interpolates linearly
           between two values, so a direct position animation can't orbit —
           rotating the parent instead can). Rotates around Z (the footprint
           convention's height/up axis — see the script block above), not Y,
           so the sphere orbits in a horizontal circle above the image
           instead of a vertical one. POSITIONAL audio here
           (distanceModel/refDistance/rolloffFactor/maxDistance, pattern
           from examples/wander-in-band-usage.html) is the "räumlich
           (spatial)" half of decision 3 — panning/volume shift as it
           circles is the effect being demonstrated. -->
      <a-entity
          :position="wanderPivotPosition"
          animation="property: rotation; to: 0 0 360; loop: true; dur: 9000; easing: linear">
        <a-entity id="wander_sound" :position="orbitOffset"
            sound="src: #sound-wander-clip; autoplay: false; loop: true; positional: true; distanceModel: linear; refDistance: 1.5; rolloffFactor: 1; maxDistance: 6">
        </a-entity>
        <a-sphere
            id="wander_button"
            :position="orbitOffset"
            :radius="SPHERE_RADIUS"
            color="#a5523b"
            ar-button="near: 2; far: 4.5; pulse: 0.2; zoneSize: 1.6 1.6 1.6"
            sound-button="sound: #wander_sound">
        </a-sphere>
      </a-entity>

      <!-- What the directional light below aims at — move this entity to
           redirect the light (and the shadows it casts) instead of having to
           re-aim the light itself. -->
      <a-entity id="lightTarget" position="0 0 0"></a-entity>

      <!-- Directional light that casts shadows onto the ground plane below.
           Positioned above the scene (elevated in Z — the footprint
           convention's height axis), aimed at #lightTarget. Shadow camera
           bounds sized to the image's own footprint, not a room-scale
           guess, so the 2048px shadow map isn't spread paper-thin. -->
      <a-entity :position="lightPosition" :light="lightConfig" shadow></a-entity>

      <a-light type="ambient" intensity="0.7"></a-light>

      <!-- Ground plane = the tracked image itself (footprint convention, see
           script block above): same local X/Y bounds as the printed image,
           no rotation (a-plane's default orientation already matches the
           image's own plane), sitting at Z=0. Semi-transparent visible fill
           (not the earlier shadow-only material) so the footprint is
           visible for orientation/debugging while still catching shadows. -->
      <a-plane
          id="ground"
          :width="FOOTPRINT_WIDTH"
          :height="FOOTPRINT_DEPTH"
          :material="groundMaterial"
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
  <InfoOverlay text="Zwei Klangquellen: eine feste (blau) und eine kreisende (rot, mit Positional Audio). Tippe eine Kugel an oder nutze die Regler unten, um Play/Pause/Stop/Neustart zu steuern." />
</template>
