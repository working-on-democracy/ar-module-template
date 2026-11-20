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

  <!-- Assets are declared in the manifest (derived from src/assets/) and injected
       into the scene's <a-assets> by the host before this module mounts. Reference
       them here by id (file name without extension): `my-video.mp4` → id
       "my-video". Do NOT declare your own <a-assets> here. -->
  <a-entity
      no-frustum-cull
      :visible="assetsLoaded"
  >
  <!-- Stands the scene on the real floor in front of the viewer. A fixed
       position can't do that: the host mounts the module 1.6 units above the
       scene origin and 8th Wall's floor is world y = 0, so local y = 0 floats
       above the viewer's head (README "Where a module sits"). place-in-front
       converts its floor pose through the parents' matrices; children's
       y = 0 is the floor.
       referenceHeight: 1.5 makes units inside roughly metres: the scene is
       scaled as if authored for a camera 1.5 above the floor (8th Wall's
       `responsive` scale makes the camera's start height stand for the
       phone's real height, so one raw unit would be ~4 m). distance: 2 →
       about 2 m in front. See guides/PLACEMENT-FEATURE-GUIDE.md for
       recentering and the other options. Image-target content doesn't go
       in here: wrap it in `world-origin` instead
       (guides/IMAGE-TRACKING-FEATURE-GUIDE.md). -->
  <a-entity id="scene-root" place-in-front="referenceHeight: 1.5; distance: 2">
    <!-- What the directional light below aims at — move this entity to
         redirect the light (and the shadows it casts) instead of having to
         re-aim the light itself. -->
    <a-entity id="lightTarget" position="0 0 -3"></a-entity>

    <!-- Directional light that casts shadows onto the ground plane below.
         Positioned above the scene, aimed at #lightTarget above. -->
    <a-entity
        position="1 20 10"
        light="
                    type: directional;
                    intensity: 1;
                    target: #lightTarget;
                    castShadow: true;
                    shadowMapHeight:2048;
                    shadowMapWidth:2048;
                    shadowCameraTop: 80;
                    shadowCameraBottom: -80;
                    shadowCameraRight: 80;
                    shadowCameraLeft: -80;
                    shadowRadius: 12"
        shadow>
    </a-entity>

    <a-light type="ambient" intensity="0.7"></a-light>

    <!-- Ground plane. Renders ONLY the
         shadows cast onto it (material="shader: shadow"), not a visible
         surface of its own, so it stays invisible until something above
         actually casts a shadow onto it. A good baseline to build a scene
         on top of. -->
    <a-plane
        id="ground"
        rotation="-90 0 0"
        position="-50 0 -50"
        width="500"
        height="500"
        material="shader: shadow"
        shadow
    ></a-plane>

    <!-- Fuenf unsichtbare, okkludierende Kugeln im Kreis um den Nutzer: in
         der ersten (vorne rechts) die Weinflasche, in den anderen vier je
         eine Milchkanne.

         Der Nutzer steht beim Start bei z = 2 in scene-root (place-in-front
         stellt die Szene 2 m vor ihn), deshalb sitzt der Ring-Mittelpunkt
         dort. Kugeln auf 2.8 m Ringradius (1.8 m Abstand zur Kugelwand beim
         Start), um 36 Grad versetzt, so dass keine genau in Blickrichtung
         steht (eine Okkluder-Kugel verdeckt auch alles Virtuelle dahinter).

         `occluder` (src/a-frame-components/occluder.ts): die Kugel schreibt
         nur Tiefe, keine Farbe, und nur ihre Aussenseiten - von aussen
         sieht man das Kamerabild, der Inhalt ist verdeckt; sobald die
         Kamera die Kugelwand durchquert, wird er sichtbar.
         Mittelpunkt auf 1.2 m, Radius 1 m (reicht von 0.2 bis 2.2 m):
         auf Augenhoehe (~1.5 m) erreichbar, indem man hineingeht.

         Die Kugeln sind unsichtbar. Zum Platzieren/Testen sichtbar machen:
         occluder="opacity: 0.35; color: #9fd3ff" (verdeckt weiterhin).

         Modelle, jeweils mittig in die Kugel gesetzt (y = -halbe Hoehe):
         - gino_48-bottle-4079.glb: ~5.5 Einheiten hoch, Ursprung unten;
           scale 0.1154 -> 64 cm (doppelt so gross wie echt).
         - pixellabs-milk-can-3784.glb: ~1.05 Einheiten hoch, Ursprung unten;
           scale 0.571 -> 60 cm.
         Die Modelle werfen bewusst keinen Schatten - der waere auf dem
         Boden ausserhalb der Kugel sichtbar und wuerde sie verraten. -->
    <a-entity id="bottle-spheres" position="0 0 2">
      <a-entity v-for="(item, i) in [
                  { x: 1.646, z: -2.265, model: 'gino_48-bottle-4079', scale: 0.1154, y: -0.32 },
                  { x: 2.663, z: 0.865, model: 'pixellabs-milk-can-3784', scale: 0.571, y: -0.3 },
                  { x: 0, z: 2.8, model: 'pixellabs-milk-can-3784', scale: 0.571, y: -0.3 },
                  { x: -2.663, z: 0.865, model: 'pixellabs-milk-can-3784', scale: 0.571, y: -0.3 },
                  { x: -1.646, z: -2.265, model: 'pixellabs-milk-can-3784', scale: 0.571, y: -0.3 }
                ]"
                :key="i" :position="`${item.x} 1.2 ${item.z}`">
        <a-sphere occluder radius="1" segments-width="64" segments-height="40"></a-sphere>
        <a-entity
            :gltf-model="`#${item.model}`"
            :scale="`${item.scale} ${item.scale} ${item.scale}`"
            :position="`0 ${item.y} 0`"
            :animation="`property: rotation; from: 0 0 0; to: 0 360 0; loop: true; dur: ${9000 + i * 1300}; easing: linear`"
        ></a-entity>
      </a-entity>
    </a-entity>

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
