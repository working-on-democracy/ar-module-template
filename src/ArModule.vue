<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  injectDmsStyles,
  setupDmsWorldLifecycle,
  wireDmsControls
} from "./a-frame-components/dms-mirror-shards";
import { manifest } from "./manifest";
import { trackAssetLoading } from "./asset-loading-overlay";

interface ArModuleData {
  id: string;
  text: string;
  url: string;
  author: string;
  location: { lat: number; lng: number };
  assets: { id: string; src: string }[];
  components: { name: string; url: string }[];
  createdAt: string;
}

defineProps<{ arModule: ArModuleData }>();

// The DMS component definitions are registered by the host from
// manifest.components before this module mounts. Here we only need to bring up
// the DOM chrome and lifecycle wiring the prototype expects:
//   - injectDmsStyles()      → the control-bar / status-text CSS (once)
//   - setupDmsWorldLifecycle → drives the status text for 8th Wall world tracking
//   - wireDmsControls()      → binds the two buttons to the installation entity
onMounted(() => {
  injectDmsStyles();
  setupDmsWorldLifecycle();
  wireDmsControls();
});

// Thin top-of-screen progress bar for the manifest's own assets — see
// asset-loading-overlay.ts. This branch's manifest.assets is empty (no files
// in src/assets/), so in practice this bar never appears; the installation's
// own "Starting camera AR..." status text (see dms-mirror-shards.ts) already
// covers the world-tracking startup phase, which is a different thing.
// Inline styles only — a <style> block never ships to the host (see README
// "Caveats").
const loadProgress = ref(0);
const assetsLoaded = ref(false);
let stopAssetTracking: (() => void) | null = null;

const loadBarTrackStyle = computed(() => ({
  position: "fixed" as const,
  top: "0",
  left: "0",
  width: "100%",
  height: "3px",
  background: "rgba(255,255,255,0.15)",
  zIndex: "9999",
  pointerEvents: "none" as const,
  opacity: assetsLoaded.value ? "0" : "1",
  transition: "opacity 0.4s ease-out"
}));

const loadBarFillStyle = computed(() => ({
  height: "100%",
  width: `${Math.round(loadProgress.value * 100)}%`,
  background: "rgba(255,255,255,0.9)",
  transition: "width 0.2s ease-out"
}));

// Centre-screen spinner + backdrop, fading with the same assetsLoaded state
// as the top bar. Added for consistency with the other five _module
// branches — in practice this is a no-op here, since manifest.assets is
// empty (no files in src/assets/) so assetsLoaded flips true immediately,
// and the installation's own visibility is already governed by
// dms-world-room-anchor's own placement lifecycle, not by this. The spin
// animation is SMIL (<animateTransform>) rather than a CSS @keyframes rule,
// since a <style> block never ships to the host.
const loadSpinnerBackdropStyle = computed(() => ({
  position: "fixed" as const,
  inset: "0",
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  background: "rgba(0,0,0,0.55)",
  zIndex: "9998",
  pointerEvents: "none" as const,
  opacity: assetsLoaded.value ? "0" : "1",
  transition: "opacity 0.4s ease-out"
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
  <!-- Keeps any glTF models in the scene from being frustum-culled once their
       animation moves them outside their bind-pose bounding sphere. -->
  <a-entity no-frustum-cull></a-entity>

  <!-- Scene lighting (from the old standalone src/index.html). -->
  <a-entity light="type: ambient; intensity: 0.9; color: #e9feff"></a-entity>
  <a-entity light="type: directional; intensity: 1.4; color: #ffffff" position="0.6 2.6 1.2"></a-entity>

  <!-- 8th Wall world-tracking placement anchor wrapping the glass-shard
       installation. Both components are registered from the manifest. -->
  <a-entity
    id="dms-room-anchor"
    dms-world-room-anchor="
      autoPlace: true;
      distance: 5;
      groundY: 0.04;
      placementDelayMs: 650;
      minCameraTravelBeforePlace: 0;
      minXrPoseTravelBeforePlace: 0;
      maxXrPoseAgeMs: 700;
      requireXrWorldPose: false;
      requireSceneCameraMotion: false;
      placementMode: camera;
      minPlacementDistance: 5;
      maxPlacementDistance: 7;
      stablePlacementSamples: 4;
      stablePlacementRadius: 0.28;
      waitForRealityReady: false;
      waitForTrackingNormal: false;
    "
  >
    <a-entity
      id="dms-installation"
      class="cantap"
      position="0 1 0"
      rotation="0 0 0"
      dms-mirror-shards="
        autoCycle: false;
        panelLimit: 1;
        enableFracture: false;
        enableGpuMotion: true;
        quality: auto;
        idleRotationEnabled: true;
        idleRotationStrength: 1;
        shockAfterglow: 1;
        liquidShockCoupling: 1;
        faceCameraOnStart: false;
        layoutScale: 1.55;
        displayScale: 2;
        allowQueryScale: true;
        queryScaleMin: 1.5;
        queryScaleMax: 2.5;
        placeFromCameraOnStart: false;
        manualPlacementOnStart: false;
        placementDistance: 3.0;
        placementGroundY: 0.04;
        placementDelayMs: 180;
        autoPlacementFallbackMs: 0;
      "
    ></a-entity>
  </a-entity>

  <!-- DOM chrome (position:fixed, so it renders over the camera feed regardless
       of where the module mounts in the scene graph). -->
  <div id="runtimeWarning" class="dms-runtime-warning" hidden>Runtime loading...</div>
  <div id="targetStatus" class="dms-target-status">
    Starting camera AR. Move phone slowly after the poster appears...
  </div>

  <nav class="dms-control-bar" aria-label="Prototype controls">
    <button
      id="pulseButton"
      class="dms-icon-button is-blue"
      type="button"
      aria-label="Add democratic blue"
      title="Add democratic blue"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="2.5"></circle>
        <path d="M5.7 12a6.3 6.3 0 0 1 12.6 0"></path>
        <path d="M3.1 12a8.9 8.9 0 0 1 17.8 0"></path>
      </svg>
    </button>
    <button
      id="nextButton"
      class="dms-icon-button is-orange"
      type="button"
      aria-label="Add authoritarian orange"
      title="Add authoritarian orange"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5.5 13 12l-8 6.5Z"></path>
        <path d="M15 6v12"></path>
        <path d="M19 6v12"></path>
      </svg>
    </button>
  </nav>

  <!-- 2D loading-progress overlay — screen-space, not part of the 3D scene.
       Fades out once every manifest asset has loaded (in practice, instantly:
       see the comment above). -->
  <div :style="loadBarTrackStyle">
    <div :style="loadBarFillStyle"></div>
  </div>

  <!-- Centre-screen spinner, added for consistency (see comment above — a
       no-op in practice on this branch). -->
  <div :style="loadSpinnerBackdropStyle">
    <svg viewBox="0 0 50 50" width="48" height="48">
      <circle cx="25" cy="25" r="20" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-dasharray="90 150">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  </div>
</template>
