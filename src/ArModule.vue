<script setup lang="ts">
import { onMounted } from "vue";
import {
  injectDmsStyles,
  setupDmsWorldLifecycle,
  wireDmsControls
} from "./a-frame-components/dms-mirror-shards";

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
      position="0 6 0"
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
</template>
