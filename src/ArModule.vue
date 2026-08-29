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

// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md) — random-field's own
// attributes exposed directly, no derived math (Entscheidung 3/4: "kein
// Algorithmus-Umbau", "kein Code-Umbau nötig"). minDistance/maxDistance and
// LOD nearDistance/farDistance are each a "band" pair, so each gets one
// range-slider rather than two separate sliders — still a direct 1:1
// pass-through per thumb, not a computed/proportional value like
// proximity-effekte's distanceScale. proximity-rise's own parameters
// (riseStart/riseEnd/riseHeight) stay fixed — the concept doc's decisions
// only call out random-field's and lod-object's attributes as GUI targets.
const areaWidth = ref(8);
const minDistance = ref(1.5);
const maxDistance = ref(3);
const copies = ref(4);
const lodNear = ref(4);
const lodFar = ref(7);

const randomFieldAttr = computed(
  () => `items: #prop; areaWidth: ${areaWidth.value}; minDistance: ${minDistance.value}; ` +
        `maxDistance: ${maxDistance.value}; copies: ${copies.value}`
);
const lodObjectAttr = computed(() => `nearDistance: ${lodNear.value}; farDistance: ${lodFar.value}`);

// random-field places its clones once in init() (a one-shot procedural
// generation, not a per-frame effect) and lod-object likewise only reads
// nearDistance/farDistance in its own init() — neither component defines an
// update() handler, so changing their DOM attribute reactively (the pattern
// proximity-effekte/animationssystem-wanderer use for their own, genuinely
// per-tick components) would update the GUI's displayed number without
// touching the actual scene. A Vue `:key` tied to every GUI-affecting value
// forces a full unmount/remount of the field on any change instead — the
// standard Vue technique for "re-run a one-shot child from scratch" — so
// adjusting a slider genuinely re-scatters the field with the new
// parameters (arguably the point of this Themenfeld's demo, too).
const fieldKey = computed(
  () => `${areaWidth.value}-${minDistance.value}-${maxDistance.value}-${copies.value}-${lodNear.value}-${lodFar.value}`
);

const guiControls = computed<GuiControl[]>(() => [
  {
    type: 'slider',
    id: 'area-width',
    label: 'Feldbreite',
    min: 4,
    max: 16,
    step: 1,
    value: areaWidth.value,
    unit: 'm',
    onInput: (value) => { areaWidth.value = value; }
  },
  {
    type: 'range-slider',
    id: 'object-spacing',
    label: 'Objektabstand',
    min: 0.5,
    max: 6,
    step: 0.5,
    valueLow: minDistance.value,
    valueHigh: maxDistance.value,
    unit: 'm',
    onInput: (low, high) => { minDistance.value = low; maxDistance.value = high; }
  },
  {
    type: 'slider',
    id: 'copies',
    label: 'Anzahl',
    min: 1,
    max: 10,
    step: 1,
    value: copies.value,
    onInput: (value) => { copies.value = value; }
  },
  {
    type: 'range-slider',
    id: 'lod-distance',
    label: 'LOD-Umschaltdistanz',
    min: 1,
    max: 12,
    step: 0.5,
    valueLow: lodNear.value,
    valueHigh: lodFar.value,
    unit: 'm',
    onInput: (low, high) => { lodNear.value = low; lodFar.value = high; }
  }
]);
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
        position="0 -2 0"
        no-frustum-cull
        :visible="assetsLoaded"
    >
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

      <!-- Zufallsverteilung & LOD (archive-of-practice
           projects/an-alle/concepts/zufallsverteilung-lod.md) — structure
           and attribute conventions ported from
           examples/random-field-lod-billboard-proximity-wave-scene.html
           (lod-manager wrapper, .lod-mesh-group/.lod-mesh/.lod-billboard
           classes, per-part render-order). No custom detail-model/billboard
           texture from the author yet (Entscheidung 2), so — same reasoning
           as that reference example — this uses plain primitives as a
           stand-in: a "sprout" (stem + bud) for the detail mesh, a
           matching-coloured plane for the billboard. Swap for a real
           gltf-model once the author's assets exist; nothing else about
           the structure changes. `:key="fieldKey"` forces a full field
           regeneration when a GUI slider changes (s. Skript-Kommentar). -->
      <a-entity lod-manager="chunksPerCycle: 6" :key="fieldKey">

        <!-- Prop template — hidden by random-field once cloned. Rises on
             approach via [proximity-rise] (own Entscheidung 1, fixed
             parameters, not a GUI target); LOD-swaps to the billboard via
             [lod-object] (nearDistance/farDistance GUI-bound). Both
             components live on this same entity and get cloned onto every
             placed copy along with it (s. proximity-rise.ts). -->
        <a-entity id="prop" :lod-object="lodObjectAttr" proximity-rise="riseStart: 5; riseEnd: 1.5; riseHeight: 0.4">
          <a-entity class="lod-mesh-group">
            <a-entity
                class="lod-mesh"
                geometry="primitive: box; width: 0.08; height: 0.5; depth: 0.08"
                material="color: #6b4a2f"
                position="0 0.25 0"
                render-order="1">
            </a-entity>
            <a-entity
                class="lod-mesh"
                geometry="primitive: sphere; radius: 0.14"
                material="color: #e8c34a"
                position="0 0.55 0"
                render-order="2">
            </a-entity>
          </a-entity>
          <a-entity
              class="lod-billboard"
              geometry="primitive: plane; width: 0.28; height: 0.7"
              material="color: #b89a3a; side: double"
              position="0 0.3 0"
              render-order="3"
              billboard
              unlit-material="brightness: 0.4">
          </a-entity>
        </a-entity>

        <a-entity :random-field="randomFieldAttr"></a-entity>

      </a-entity>

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
  <InfoOverlay text="Ein Feld zufällig verteilter Pflänzchen: aus der Ferne nur flache Bildchen (Billboards), aus der Nähe echte 3D-Modelle — und sie wachsen sichtbar, je näher du kommst. Die Regler unten steuern Feldbreite, Abstand, Anzahl und die Umschaltdistanz." />
</template>
