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

// AN ALLE! Material-/Shader-Showcase (archive-of-practice
// projects/an-alle/concepts/material-shader-showcase.md) — sechs
// überlappende Objekte, drei Transparenz-Techniken. Keine Emoji-PNGs vom
// Autor vorhanden (Entscheidung: "sechs Emoji-PNGs, vom Autor
// bereitgestellt") — wie schon in examples/random-field-lod-billboard-
// proximity-wave-scene.html bei fehlenden Assets, stehen sechs farbige
// Kreis-Primitives stellvertretend dafür; Transparenz/Dither/Unlit wirken
// identisch unabhängig von einer Textur.
//
// Item A (vorderstes) = unlit-material + material-properties auf DERSELBEN
// Entity: unlit-material ersetzt das Material zuerst durch ein flaches
// MeshBasicMaterial (ignoriert roughness/metalness/emissive, die es nicht
// besitzt), material-properties wendet danach NUR opacity darauf an (opacity
// existiert auf jedem Material) — genau das in der Entscheidung beschriebene
// Verhalten ("nur Opacity, Roughness/Metalness/Emissive haben keine
// Wirkung"), ohne Sonderfall-Code, allein durch Komponenten-Reihenfolge.
// Items B/C/D = dither-material (je ein ditherType). dither-material besitzt
// selbst kein roughness/metalness/emissiveIntensity-Attribut — die globalen
// Regler dafür wirken deshalb ausschließlich auf E/F (material-properties),
// nicht weil hier etwas unterdrückt würde, sondern weil dither-material
// diese Eigenschaften schlicht nicht kennt. Items E/F = material-properties
// (normale Alpha-Transparenz).
//
// render-order.ts und die vier Material-Komponenten oben lesen ihre Daten
// größtenteils nur einmal in init() (render-order/unlit-material haben kein
// update(); material-properties/dither-material haben zwar update(), aber
// die zusammengesetzte unlit+material-properties-Reihenfolge auf Item A
// bräuchte ohnehin einen sauberen Neuaufbau bei Reihenfolgeänderungen) — statt
// die Update()-Fähigkeit jeder Komponente einzeln nachzuvollziehen, erzwingt
// ein `:key` auf der ganzen Gruppe (wie schon in zufallsverteilung-lod) bei
// jeder Regler-/Reihenfolgeänderung einen vollständigen Neuaufbau. Bei nur
// sechs einfachen Primitives ist das trivial günstig.
const ITEM_IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
type ItemId = typeof ITEM_IDS[number];
const ITEM_LABELS: Record<ItemId, string> = {
  a: 'Weiß (Unlit)', b: 'Rot (Dither Bayer)', c: 'Blau (Dither Noise)',
  d: 'Grün (Dither Gradient)', e: 'Gelb (Alpha)', f: 'Magenta (Alpha)'
};

const order = ref<ItemId[]>([...ITEM_IDS]);
const roughness = ref(50); // %
const metalness = ref(50); // %
const opacity = ref(70); // %
const emissive = ref(33); // %, gemappt auf material-properties' 0–3-Multiplikator

const renderOrderOf = (id: ItemId) => order.value.indexOf(id);

function moveUp(id: ItemId) {
  const i = order.value.indexOf(id);
  if (i <= 0) return;
  const next = [...order.value];
  [next[i - 1], next[i]] = [next[i], next[i - 1]];
  order.value = next;
}

function moveDown(id: ItemId) {
  const i = order.value.indexOf(id);
  if (i === -1 || i >= order.value.length - 1) return;
  const next = [...order.value];
  [next[i], next[i + 1]] = [next[i + 1], next[i]];
  order.value = next;
}

const opacityFrac = computed(() => opacity.value / 100);
const roughnessFrac = computed(() => roughness.value / 100);
const metalnessFrac = computed(() => metalness.value / 100);
const emissiveMultiplier = computed(() => (emissive.value / 100) * 3);

const unlitOpacityAttr = computed(() => `opacity: ${opacityFrac.value.toFixed(2)}`);
const materialPropsAttr = computed(
  () => `roughness: ${roughnessFrac.value.toFixed(2)}; metalness: ${metalnessFrac.value.toFixed(2)}; ` +
        `opacity: ${opacityFrac.value.toFixed(2)}; emissiveIntensity: ${emissiveMultiplier.value.toFixed(2)}`
);
function ditherAttr(ditherType: string): string {
  return `opacity: ${opacityFrac.value.toFixed(2)}; ditherType: ${ditherType}`;
}

const fieldKey = computed(
  () => `${order.value.join(',')}-${roughness.value}-${metalness.value}-${opacity.value}-${emissive.value}`
);

const guiControls = computed<GuiControl[]>(() => [
  ...ITEM_IDS.map((id): GuiControl => ({
    type: 'updown',
    id: `order-${id}`,
    label: ITEM_LABELS[id],
    value: renderOrderOf(id),
    onDecrement: () => moveUp(id),
    onIncrement: () => moveDown(id)
  })),
  {
    type: 'slider', id: 'roughness', label: 'Roughness (global)',
    min: 0, max: 100, step: 5, value: roughness.value, unit: '%',
    onInput: (v) => { roughness.value = v; }
  },
  {
    type: 'slider', id: 'metalness', label: 'Metalness (global)',
    min: 0, max: 100, step: 5, value: metalness.value, unit: '%',
    onInput: (v) => { metalness.value = v; }
  },
  {
    type: 'slider', id: 'opacity', label: 'Opacity (global)',
    min: 0, max: 100, step: 5, value: opacity.value, unit: '%',
    onInput: (v) => { opacity.value = v; }
  },
  {
    type: 'slider', id: 'emissive', label: 'Emissive (global)',
    min: 0, max: 100, step: 5, value: emissive.value, unit: '%',
    onInput: (v) => { emissive.value = v; }
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

      <!-- Material-/Shader-Showcase (archive-of-practice
           projects/an-alle/concepts/material-shader-showcase.md) — sechs
           farbige Kreis-Scheiben, hintereinander gestapelt und nach hinten
           zunehmend größer, garantiert Überschneidung aus Kamerasicht. Ein
           Text-Label über jeder Scheibe zeigt ihren aktuellen
           render-order-Wert. `:key="fieldKey"` erzwingt einen sauberen
           Neuaufbau bei jeder Regler-/Reihenfolgeänderung (s. Skript). -->
      <a-entity id="showcase" position="0 1 -2" :key="fieldKey">

        <!-- A — vorderstes, unlit. unlit-material zuerst (ersetzt das
             Material durch MeshBasicMaterial), material-properties danach
             wendet nur noch opacity darauf an — roughness/metalness/emissive
             existieren auf MeshBasicMaterial nicht und werden von
             material-properties stillschweigend übersprungen. -->
        <a-entity position="0 0 0">
          <a-entity
              geometry="primitive: circle; radius: 0.3"
              material="color: #f2f2f2; side: double; transparent: true"
              unlit-material
              :material-properties="unlitOpacityAttr"
              :render-order="renderOrderOf('a')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('a') + '; align: center; color: #ffffff; width: 1.6'" position="0 0.5 0.01"></a-entity>
        </a-entity>

        <!-- B/C/D — dither-transparent, je ein anderer ditherType. -->
        <a-entity position="0 0 -0.5">
          <a-entity
              geometry="primitive: circle; radius: 0.37"
              material="color: #ff4d4d; side: double; transparent: true"
              :dither-material="ditherAttr('bayer')"
              :render-order="renderOrderOf('b')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('b') + '; align: center; color: #ffffff; width: 1.6'" position="0 0.6 0.01"></a-entity>
        </a-entity>

        <a-entity position="0 0 -1">
          <a-entity
              geometry="primitive: circle; radius: 0.45"
              material="color: #4d79ff; side: double; transparent: true"
              :dither-material="ditherAttr('noise')"
              :render-order="renderOrderOf('c')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('c') + '; align: center; color: #ffffff; width: 1.6'" position="0 0.7 0.01"></a-entity>
        </a-entity>

        <a-entity position="0 0 -1.5">
          <a-entity
              geometry="primitive: circle; radius: 0.52"
              material="color: #4dff88; side: double; transparent: true"
              :dither-material="ditherAttr('interleaved-gradient')"
              :render-order="renderOrderOf('d')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('d') + '; align: center; color: #ffffff; width: 1.6'" position="0 0.8 0.01"></a-entity>
        </a-entity>

        <!-- E/F — normale Alpha-Transparenz, mit eigener Emissiv-Grundfarbe
             (sonst hätte der globale Emissive-Regler nichts zum Boosten). -->
        <a-entity position="0 0 -2">
          <a-entity
              geometry="primitive: circle; radius: 0.6"
              material="color: #ffe14d; side: double; transparent: true; emissive: #ffcc00; emissiveIntensity: 1"
              :material-properties="materialPropsAttr"
              :render-order="renderOrderOf('e')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('e') + '; align: center; color: #ffffff; width: 1.6'" position="0 0.9 0.01"></a-entity>
        </a-entity>

        <a-entity position="0 0 -2.5">
          <a-entity
              geometry="primitive: circle; radius: 0.67"
              material="color: #ff4dd2; side: double; transparent: true; emissive: #ff00aa; emissiveIntensity: 1"
              :material-properties="materialPropsAttr"
              :render-order="renderOrderOf('f')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('f') + '; align: center; color: #ffffff; width: 1.6'" position="0 1 0.01"></a-entity>
        </a-entity>

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
  <InfoOverlay text="Sechs überlappende Scheiben, drei Transparenz-Techniken: unlit, gedithert und normal durchsichtig. Die Auf/Ab-Knöpfe ändern die Zeichenreihenfolge (Zahl über jeder Scheibe), die vier Regler wirken auf Opacity/Roughness/Metalness/Emissive." />
</template>
