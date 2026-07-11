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
  assets: { id: string; src: string }[];
  components: { name: string; url: string }[];
  createdAt: string;
}

const props = defineProps<{ arModule: ArModuleData }>();

const label = computed(
    () => `${props.arModule.author}: ${props.arModule.text}`
);

// Thin top-of-screen progress bar for the manifest's own assets (the glb,
// mainly) — see asset-loading-overlay.ts. This is the phase that's actually
// visible to users: the host's dynamic import() of this module's own JS
// happens before any of this code runs, so it can't be tracked from here;
// this covers the (usually much larger) asset payload that streams in after
// the module has already mounted. Inline styles only — a <style> block never
// ships to the host (see README "Caveats").
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

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `Rosa.glb` → id "Rosa".
       Do NOT declare your own <a-assets> here. -->
  <a-entity
      no-frustum-cull
  >

    <!-- The manifest no longer moves the shared <a-camera> to "0 8 8" (see
         manifest.ts) — the platform host owns that camera and applies manifest
         values with no filtering, so doing it here would relocate the shared
         camera for every other module on screen. This offset recreates the
         same camera-relative framing without touching the camera: it's the
         delta between where the standalone build's camera+module-root used to
         put the viewer relative to this content ("0 8 8" camera, "0 1.6 -3"
         module-root) and where the real host actually puts them (confirmed
         from the deployed bundle: camera "0 0.35 0.8", module-root "0 1.6 -3").
         Untested on-device — verify the framing still looks right and nudge
         this offset if not. -->
    <a-entity position="0 -7.65 -7.2">

            <a-entity
                    gltf-model="#Rosa"
                    unlit-materials
                    mesh-render-order
                    scale="12 12 12"
                    rotation="0 0 0"
                    position="0 0 -30"
                    shadow>
                <a-entity id="group" position="0 0 0"></a-entity>
            </a-entity>

        <!-- example primitive (plane) as ground -->

            <a-plane
                    id="ground"
                    rotation="-90 0 0"
                    position="-50 0 -50"
                    width="500"
                    height="500"
                    material="shader: shadow; opacity: 0.3; transparent: true"
                    shadow
            ></a-plane>

    </a-entity>
  </a-entity>

  <!-- 2D loading-progress overlay — screen-space, not part of the 3D scene
       (a second root node, same technique other branches use for their own
       DOM chrome). Fades out once every manifest asset has loaded. -->
  <div :style="loadBarTrackStyle">
    <div :style="loadBarFillStyle"></div>
  </div>
</template>
