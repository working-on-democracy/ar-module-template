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
// Items B/C/D = dither-material (je ein ditherType). dither-material trägt
// seit 30.08.2026 (device testing) auch roughness/metalness/emissiveIntensity
// (gleiche Semantik/Sentinel wie material-properties, s. dessen
// applyPbrOverrides) — die globalen Regler wirken deshalb jetzt auf alle
// sechs Items, nicht nur E/F. Own base emissive colour on B/C/D's own
// `material=`-Attribut (analog zu E/F), sonst hätte der Emissive-Regler
// nichts zum Boosten. Items E/F = material-properties (normale
// Alpha-Transparenz).
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
//
// Footprint convention (s. sound-player's own ArModule.vue and
// guides/IMAGE-TRACKING-FEATURE-GUIDE.md) — the tracked image is the
// scene's ground plane. Unlike the other three retrofitted branches, none
// of material-properties/dither-material/unlit-material/render-order touch
// position/rotation/axes at all (pure material-property setters) — no
// generic component here assumes the older X/Z-ground convention. The
// `rotation: 90 0 0` on #showcase below is purely a VISUAL choice, not a
// compensating-axis one: a-circle's default orientation lies flat in its
// own local X/Y plane (matching the image's own plane once nested directly
// under the image target, per sound-player's ground-plane comment) — the
// rotation stands the discs up to face the viewer instead of lying flat on
// the image. Once rotated, authoring their positions with the OLD
// intuitive X-right/Y-up/Z-toward-viewer meaning inside the wrapper maps
// correctly onto the real footprint's Y-bounded-depth/Z-free-height outside
// it — exactly the same diagonal values as the pre-footprint version
// (Frage 11, archive-of-practice projects/an-alle/fragen.md), just
// rescaled from room-scale metres to the target's own small physical size.
const targetProps = (manifest.imageTargets?.[0] as { properties?: { width: number; height: number } } | undefined)?.properties;
const FOOTPRINT_DEPTH = 1; // the engine always normalizes the target's local Y extent to 1
const FOOTPRINT_WIDTH = targetProps ? targetProps.width / targetProps.height : 0.75; // local X extent, from the target's own aspect ratio
const FOOTPRINT_MIN_SIDE = Math.min(FOOTPRINT_WIDTH, FOOTPRINT_DEPTH); // the largest SQUARE that fits inside the footprint, whichever axis is narrower

// Spiral/helix redesign (31.08.2026, replaces the diagonal Y+Z 45° stack
// of flat discs — s. archive-of-practice
// projects/an-alle/concepts/material-shader-showcase.md) — six SPHERES
// (primitive: sphere, not circle: unlike a flat disc, a sphere looks the
// same from every angle, so the old per-item facing tilt is gone) placed
// around a vertical helix instead. STEP_COUNT/a-f keep their existing
// meaning (a = smallest, f = largest) and material-technique assignment
// (s. the template below) — only the geometry/position/colour changed.
//
// RING_RADIUS is sized so the LARGEST sphere's outer edge just reaches
// the edge of the largest square that fits inside the footprint
// (FOOTPRINT_MIN_SIDE) — "möglichst gut eine maximal große quadratische
// Fläche ausfüllen" (author's spec, smaller spheres at the same ring
// radius then sit safely inside that square too). Each sphere's own
// height is TANGENT to the previous (next-larger) one — its bottom
// touches that sphere's top exactly, forming one continuous,
// size-decreasing chain rather than independently-spaced steps; the
// largest (f) sits with its OWN radius as its centre height, i.e. its
// bottom is AT the ground ("die größte Kugel berührt fast die
// Grundfläche"). Colours interpolate the same lemon-yellow -> hot-pink
// scheme used project-wide (s. e.g. proximity-motion.ts's own
// colorInner/colorOuter defaults): smallest (a) = lemon yellow, largest
// (f) = hot pink, staggered in between.
const STEP_COUNT = 5; // 6 items (a..f = step 0..5), 5 gaps between them
const ANGLE_STEP_DEG = 360 / (STEP_COUNT + 1); // 60° — evenly spaced around the ring
const SPHERE_R_MAX = FOOTPRINT_MIN_SIDE * 0.22; // largest sphere (step 5, 'f')
const SPHERE_R_MIN = SPHERE_R_MAX * 0.35; // smallest sphere (step 0, 'a')
const RING_RADIUS = FOOTPRINT_MIN_SIDE / 2 - SPHERE_R_MAX;
const LABEL_GAP = FOOTPRINT_DEPTH * 0.03; // clearance above each sphere's own top
const COLOR_INNER = '#FFF44F'; // lemon yellow — smallest sphere
const COLOR_OUTER = '#FF69B4'; // hot pink — largest sphere

function sphereRadius(step: number): number {
  return SPHERE_R_MIN + (SPHERE_R_MAX - SPHERE_R_MIN) * (step / STEP_COUNT);
}

// Height centres, tangent-stacked from the ground up (s. comment above).
const SPHERE_HEIGHT: number[] = (() => {
  const heights = new Array(STEP_COUNT + 1);
  heights[STEP_COUNT] = sphereRadius(STEP_COUNT); // largest: bottom at 0, centre = own radius
  for (let step = STEP_COUNT - 1; step >= 0; step--) {
    heights[step] = heights[step + 1] + sphereRadius(step + 1) + sphereRadius(step);
  }
  return heights;
})();

function ringXZ(step: number): { x: number; z: number } {
  const angleRad = (step * ANGLE_STEP_DEG * Math.PI) / 180;
  return { x: RING_RADIUS * Math.cos(angleRad), z: RING_RADIUS * Math.sin(angleRad) };
}
function itemPosition(step: number): string {
  const { x, z } = ringXZ(step);
  return `${x.toFixed(4)} ${SPHERE_HEIGHT[step].toFixed(4)} ${z.toFixed(4)}`;
}
function labelPosition(step: number): string {
  const { x, z } = ringXZ(step);
  return `${x.toFixed(4)} ${(SPHERE_HEIGHT[step] + sphereRadius(step) + LABEL_GAP).toFixed(4)} ${z.toFixed(4)}`;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function toHex(v: number): string {
  return Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0');
}
function lerpHexColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const f = clamp01(t);
  return `#${toHex(ar + (br - ar) * f)}${toHex(ag + (bg - ag) * f)}${toHex(ab + (bb - ab) * f)}`;
}
function sphereColor(step: number): string {
  return lerpHexColor(COLOR_INNER, COLOR_OUTER, step / STEP_COUNT); // step 0 (smallest) = inner, step 5 (largest) = outer
}
// Base material string per item — own colour from the gradient, matching
// emissive so the global emissive slider has something to boost (same
// technique as before, just a computed colour instead of a fixed one).
// The unlit item (a) skips emissive entirely — MeshBasicMaterial (which
// unlit-material replaces the material with) has no emissive property, so
// it'd be silently ignored anyway.
function itemMaterial(step: number): string {
  const color = sphereColor(step);
  return `color: ${color}; side: double; transparent: true; emissive: ${color}; emissiveIntensity: 1`;
}
function itemMaterialUnlit(step: number): string {
  return `color: ${sphereColor(step)}; side: double; transparent: true`;
}

// Two point lights orbiting the whole scene at different speed/direction/
// color, plus a white spotlight "headlamp" that follows the camera (device
// testing, 30.08.2026). Orbit lights sit OUTSIDE #showcase's rotation
// wrapper, authored directly in real footprint X/Y-ground, Z-height terms
// (like the directional/ambient lights above) — no axis compensation
// needed since nothing here is a ported room-scale component. A rotating
// pivot entity (`animation` on `rotation`, real Z = the height axis, so
// rotation.z sweeps the ground's X/Y plane) carries a light offset along
// its own local X by ORBIT_RADIUS, tracing a circle at constant height.
const ORBIT_RADIUS = Math.max(FOOTPRINT_WIDTH, FOOTPRINT_DEPTH) * 0.55;
const ORBIT_HEIGHT = (SPHERE_HEIGHT[0] + SPHERE_HEIGHT[STEP_COUNT]) / 2; // roughly mid-height of the sphere helix

const ITEM_IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
type ItemId = typeof ITEM_IDS[number];
const ITEM_LABELS: Record<ItemId, string> = {
  a: 'Weiß (Unlit)', b: 'Rot (Dither Bayer)', c: 'Blau (Dither Noise)',
  d: 'Grün (Dither Gradient)', e: 'Gelb (Alpha)', f: 'Magenta (Alpha)'
};

const order = ref<ItemId[]>([...ITEM_IDS]);
const roughness = ref(50); // %
const metalness = ref(50); // %
const opacity = ref(100); // %
const emissive = ref(0); // %, gemappt auf material-properties' 0–3-Multiplikator

const groundMaterial = 'color: #3b82f6; opacity: 0.35; side: double';

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
  // roughness/metalness/emissiveIntensity now supported by dither-material
  // itself (device testing, 30.08.2026: previously had nothing to bind to
  // here, so B/C/D silently ignored those three global sliders).
  return `opacity: ${opacityFrac.value.toFixed(2)}; ditherType: ${ditherType}; ` +
         `roughness: ${roughnessFrac.value.toFixed(2)}; metalness: ${metalnessFrac.value.toFixed(2)}; ` +
         `emissiveIntensity: ${emissiveMultiplier.value.toFixed(2)}`;
}

const fieldKey = computed(
  () => `${order.value.join(',')}-${roughness.value}-${metalness.value}-${opacity.value}-${emissive.value}`
);

const guiControls = computed<GuiControl[]>(() => [
  // Render-order Auf/Ab-Regler vorübergehend ausgeblendet (device testing,
  // 30.08.2026): versperren den Blick auf die Szene und ihr Effekt ist auf
  // dem Gerät kaum wahrnehmbar. renderOrderOf/moveUp/moveDown und die
  // :render-order-Bindung auf jeder Scheibe bleiben bestehen, nur diese
  // GUI-Exponierung ist raus.
  // ...ITEM_IDS.map((id): GuiControl => ({
  //   type: 'updown',
  //   id: `order-${id}`,
  //   label: ITEM_LABELS[id],
  //   value: renderOrderOf(id),
  //   onDecrement: () => moveUp(id),
  //   onIncrement: () => moveDown(id)
  // })),
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
        no-frustum-cull
        :visible="assetsLoaded"
    >

      <!-- Two point lights orbiting the scene at different speed/direction,
           one pink, one turquoise (device testing, 30.08.2026, s. Skript-
           Kommentar oben für die Orbit-Mechanik). -->
      <a-entity :position="`0 0 ${ORBIT_HEIGHT}`" animation="property: rotation; from: 0 0 0; to: 0 0 360; loop: true; dur: 9000; easing: linear">
        <a-entity light="type: point; color: #ff2d95; intensity: 1.3" :position="`${ORBIT_RADIUS} 0 0`"></a-entity>
      </a-entity>
      <a-entity :position="`0 0 ${ORBIT_HEIGHT}`" animation="property: rotation; from: 0 0 180; to: 0 0 -180; loop: true; dur: 14000; easing: linear">
        <a-entity light="type: point; color: #1fd6c1; intensity: 1.3" :position="`${ORBIT_RADIUS} 0 0`"></a-entity>
      </a-entity>

      <!-- White spotlight "headlamp" — follows the camera's position AND
           rotation (attach-to's own copyRotation, added for this), so it
           always shines in the current view direction (device testing,
           30.08.2026). No explicit `target`: A-Frame's light component then
           points a spot/directional light along the entity's own local -Z,
           following its rotation every frame like a real headlamp. -->
      <a-entity
          light="type: spot; color: #ffffff; intensity: 1.5; angle: 15; penumbra: 0.4; distance: 2.5"
          attach-to="target: #camera; copyRotation: true">
      </a-entity>

      <!-- Material-/Shader-Showcase (archive-of-practice
           projects/an-alle/concepts/material-shader-showcase.md) — sechs
           farbige KUGELN (31.08.2026, ersetzt die vorherigen flachen
           Scheiben) auf einer Helix um eine senkrechte Achse gestaffelt,
           in Größe und Farbe (Zitronengelb → Hot Pink), jede tangential
           auf der nächstgrößeren aufsitzend (s. Skript-Kommentar oben).
           `rotation="90 0 0"` bleibt bestehen — rein für die
           Footprint-Koordinatenumrechnung (lokal X/Y=Boden, Z=Höhe wird
           zu real X/Z-Boden, Y=Höhe), keine Komponenten-Achsen-
           Kompensation. Ein Text-Label über jeder Kugel zeigt ihren
           aktuellen render-order-Wert. `:key="fieldKey"` erzwingt einen
           sauberen Neuaufbau bei jeder Regler-/Reihenfolgeänderung (s.
           Skript). Kein zusätzlicher Höhen-Offset mehr auf `#showcase`
           selbst (vorher `BASE_HEIGHT`) — die größte Kugel sitzt durch
           die Helix-Berechnung schon direkt auf der Grundfläche auf. -->
      <a-entity id="showcase" rotation="90 0 0" :key="fieldKey">

        <!-- A — vorderstes, unlit. unlit-material zuerst (ersetzt das
             Material durch MeshBasicMaterial), material-properties danach
             wendet nur noch opacity darauf an — roughness/metalness/emissive
             existieren auf MeshBasicMaterial nicht und werden von
             material-properties stillschweigend übersprungen. -->
        <a-entity :position="itemPosition(0)">
          <a-entity
              :geometry="`primitive: sphere; radius: ${sphereRadius(0)}`"
              :material="itemMaterialUnlit(0)"
              unlit-material
              :material-properties="unlitOpacityAttr"
              :render-order="renderOrderOf('a')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('a') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(0)"></a-entity>
        </a-entity>

        <!-- B/C/D — dither-transparent, je ein anderer ditherType. Own base
             emissive colour/intensity (like E/F) so the global emissive
             slider has something to boost — dither-material's own
             emissiveIntensity is a multiplier on top of it, same as
             material-properties (device testing, 30.08.2026). -->
        <a-entity :position="itemPosition(1)">
          <a-entity
              :geometry="`primitive: sphere; radius: ${sphereRadius(1)}`"
              :material="itemMaterial(1)"
              :dither-material="ditherAttr('bayer')"
              :render-order="renderOrderOf('b')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('b') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(1)"></a-entity>
        </a-entity>

        <a-entity :position="itemPosition(2)">
          <a-entity
              :geometry="`primitive: sphere; radius: ${sphereRadius(2)}`"
              :material="itemMaterial(2)"
              :dither-material="ditherAttr('noise')"
              :render-order="renderOrderOf('c')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('c') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(2)"></a-entity>
        </a-entity>

        <a-entity :position="itemPosition(3)">
          <a-entity
              :geometry="`primitive: sphere; radius: ${sphereRadius(3)}`"
              :material="itemMaterial(3)"
              :dither-material="ditherAttr('interleaved-gradient')"
              :render-order="renderOrderOf('d')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('d') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(3)"></a-entity>
        </a-entity>

        <!-- E/F — normale Alpha-Transparenz. -->
        <a-entity :position="itemPosition(4)">
          <a-entity
              :geometry="`primitive: sphere; radius: ${sphereRadius(4)}`"
              :material="itemMaterial(4)"
              :material-properties="materialPropsAttr"
              :render-order="renderOrderOf('e')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('e') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(4)"></a-entity>
        </a-entity>

        <a-entity :position="itemPosition(5)">
          <a-entity
              :geometry="`primitive: sphere; radius: ${sphereRadius(5)}`"
              :material="itemMaterial(5)"
              :material-properties="materialPropsAttr"
              :render-order="renderOrderOf('f')">
          </a-entity>
          <a-entity :text="'value: ' + renderOrderOf('f') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(5)"></a-entity>
        </a-entity>

      </a-entity>

      <!-- Ground plane = the tracked image itself (footprint convention, see
           script block above): same local X/Y bounds as the printed image,
           no rotation (a-plane's default orientation already matches the
           image's own plane), sitting at Z=0. Semi-transparent visible fill
           so the footprint is visible for orientation/debugging while still
           catching shadows. -->
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
  <InfoOverlay text="Sechs überlappende Scheiben, drei Transparenz-Techniken: unlit, gedithert und normal durchsichtig. Die Auf/Ab-Knöpfe ändern die Zeichenreihenfolge (Zahl über jeder Scheibe), die vier Regler wirken auf Opacity/Roughness/Metalness/Emissive." />
</template>
