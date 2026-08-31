<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import { attachSwipeDrag } from './swipe-drag';
import InfoOverlay from './InfoOverlay.vue';

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
// überlappende Objekte, zwei Transparenz-Techniken. Keine Emoji-PNGs vom
// Autor vorhanden (Entscheidung: "sechs Emoji-PNGs, vom Autor
// bereitgestellt") — wie schon in examples/random-field-lod-billboard-
// proximity-wave-scene.html bei fehlenden Assets, stehen sechs farbige
// Kugel-Primitives stellvertretend dafür; Transparenz/Dither wirken
// identisch unabhängig von einer Textur.
//
// "Bedienfeld weg" (31.08.2026) — kein GUI-Panel mehr, alles über
// swipe/proximity/Geste, wie schon in zufallsverteilung-lod: Roughness auf
// vertikalen Swipe, Metalness auf horizontalen Swipe (global, alle sechs
// Kugeln gemeinsam, s. attachSwipeDrag unten). Emissive liegt standardmäßig
// bei 0 und steigt bei gehaltenem Finger (unabhängig von Bewegung) über
// EMISSIVE_RAMP_MS auf 100%, beim Loslassen fällt er von seinem aktuellen
// Wert aus mit derselben Rate zurück auf 0 (s. stepEmissive/
// ensureEmissiveRamping unten). Opacity ist PRO Kugel an deren eigenen
// Kameraabstand gekoppelt (proximity-opacity.ts, Schwelle selbst wieder
// relativ zu FOOTPRINT_MIN_SIDE, s. OPACITY_FADE_FAR/NEAR unten) statt an
// einen globalen Regler. Unlit entfällt ganz — alle sechs Kugeln reagieren
// jetzt auf Licht. Die drei Dither-Typen liegen nicht mehr auf drei
// benachbarten Kugeln, sondern alternierend über die Größenstaffelung
// verteilt (größte ohne Dither, zweitgrößte gedithert, nächste ohne, usw.
// — s. Kommentar am Helix-Block unten); die übrigen drei nutzen normale
// Alpha-Transparenz (material-properties.ts). proximity-opacity.ts treibt
// bei beiden Techniken nur das jeweils schon vorhandene `opacity`-Feld der
// sitzenden Komponente an, kein neuer Material-Patch nötig (s. dessen
// eigener Kommentar für die Begründung, insbesondere wieso NICHT
// proximity-fade/-dither wiederverwendet wird).
//
// Da render-order jetzt fest ist (keine Auf/Ab-Knöpfe mehr) und
// material-properties/dither-material Attributänderungen bereits live über
// ihr eigenes update() übernehmen, ist kein erzwungener Neuaufbau (`:key`)
// mehr nötig — jede Änderung (Roughness/Metalness/Emissive/Opacity)
// aktualisiert die bestehenden Entities in place.
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
// Total helix height (ground to the TOP of the smallest sphere) is capped
// as a fraction of FOOTPRINT_MIN_SIDE — the same maximum square edge
// length RING_RADIUS/SPHERE_R_MAX already fill horizontally (device
// testing, 31.08.2026: a plain tangent stack of all six radii reaches
// roughly 1.8x FOOTPRINT_MIN_SIDE, even a 2/3 compression of that only
// got to ~1.3x — tall enough that the camera ends up INSIDE the sphere
// volume at normal viewing distance; a `side: double` sphere enclosing
// the camera doesn't render its own surface at all, which read as
// "everything's transparent"/"we're standing in the middle of the
// scene"). Author's explicit ceiling: never taller than ONE full
// FOOTPRINT_MIN_SIDE edge length — kept well under that (half) for a low,
// ground-hugging composition ("viel näher am Boden").
const HELIX_TOTAL_HEIGHT_FRACTION = 0.5;
// Continuous rotation of the whole helix around its own vertical axis
// (31.08.2026) — a positive Z delta on the OUTER real-world pivot below
// reads as counter-clockwise from the viewer's usual downward-looking
// vantage over the tracked image (s. the orbit-lights comment further
// below for the same sign convention already established there).
const HELIX_SPIN_DUR_MS = 24000;

function sphereRadius(step: number): number {
  return SPHERE_R_MIN + (SPHERE_R_MAX - SPHERE_R_MIN) * (step / STEP_COUNT);
}

// A plain tangent stack of N spheres spans exactly 2x the sum of their
// radii (each pair's centre-to-centre gap is r_i+r_(i+1); telescoping the
// chain leaves only the bottom-most and top-most sphere's own radius plus
// twice every radius in between). HELIX_CLIMB_SCALE below derives the
// fraction of that plain (uncompressed) climb needed so the compressed
// total exactly hits HELIX_TOTAL_HEIGHT_FRACTION * FOOTPRINT_MIN_SIDE,
// while the bottom sphere (f) keeps touching the ground and the top
// sphere (a) keeps its own full rendered radius — only the CLIMB between
// them is what gets compressed, same mechanism as before, just aimed at
// an explicit height budget instead of a flat, hard-to-predict ratio.
const RADIUS_SUM = Array.from({ length: STEP_COUNT + 1 }, (_, step) => sphereRadius(step)).reduce((a, b) => a + b, 0);
const HELIX_CLIMB_SCALE = (() => {
  const rTop = sphereRadius(0);
  const rBottom = sphereRadius(STEP_COUNT);
  const targetTotalHeight = HELIX_TOTAL_HEIGHT_FRACTION * FOOTPRINT_MIN_SIDE;
  const plainGapSum = 2 * RADIUS_SUM - rTop - rBottom; // uncompressed sum of all 5 tangent gaps
  return Math.max(0, (targetTotalHeight - rBottom - rTop) / plainGapSum);
})();

// Height centres, tangent-stacked from the ground up (s. comment above),
// with each step's climb compressed by HELIX_CLIMB_SCALE.
const SPHERE_HEIGHT: number[] = (() => {
  const heights = new Array(STEP_COUNT + 1);
  heights[STEP_COUNT] = sphereRadius(STEP_COUNT); // largest: bottom at 0, centre = own radius
  for (let step = STEP_COUNT - 1; step >= 0; step--) {
    heights[step] = heights[step + 1] + (sphereRadius(step + 1) + sphereRadius(step)) * HELIX_CLIMB_SCALE;
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
// emissive as the material's own authored base glow (no global emissive
// slider anymore, s. "Bedienfeld weg" comment above — material-properties/
// dither-material's emissiveIntensity multiplier is simply left at their
// own schema default of 1, i.e. exactly this base glow, unboosted).
function itemMaterial(step: number): string {
  const color = sphereColor(step);
  return `color: ${color}; side: double; transparent: true; emissive: ${color}; emissiveIntensity: 1`;
}

// Dither alternates over the size staggering instead of sitting on three
// adjacent spheres (31.08.2026): largest (f) = no dither, next (e) =
// dithered, next (d) = no dither, and so on down to the smallest (a) —
// s. archive-of-practice projects/an-alle/concepts/material-shader-showcase.md.
// Steps not listed here use plain alpha transparency (material-properties.ts).
const DITHER_TYPE_BY_STEP: Partial<Record<number, string>> = {
  4: 'bayer',
  2: 'noise',
  0: 'interleaved-gradient'
};
function ditherTypeOf(step: number): string | undefined {
  return DITHER_TYPE_BY_STEP[step];
}

// Per-sphere opacity fade (proximity-opacity.ts) is also expressed relative
// to FOOTPRINT_MIN_SIDE rather than a fixed cm value (31.08.2026, same
// reasoning as the helix height budget above — "auch die Abstands-
// berechnung kann sich an der Kantenlänge orientieren"): fully OPAQUE at
// two full edge lengths away, fully TRANSPARENT within a fifth of one
// (device testing, 31.08.2026: opposite of a typical fade-in-on-approach —
// here the sphere fades away as the camera gets close to it).
const OPACITY_FADE_FAR = FOOTPRINT_MIN_SIDE * 2;
const OPACITY_FADE_NEAR = FOOTPRINT_MIN_SIDE * 0.2;
function proximityOpacityAttr(targetComponent: string): string {
  return `targetComponent: ${targetComponent}; near: ${OPACITY_FADE_NEAR.toFixed(4)}; far: ${OPACITY_FADE_FAR.toFixed(4)}`;
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
// Render order is fixed now — no more Auf/Ab-Knöpfe ("Bedienfeld weg",
// 31.08.2026) — but the text label over each sphere still shows its
// (unchanging) render-order value, so this stays a plain lookup.
const ORDER: ItemId[] = [...ITEM_IDS];
const renderOrderOf = (id: ItemId) => ORDER.indexOf(id);

const roughness = ref(50); // %, vertical swipe
const metalness = ref(50); // %, horizontal swipe
const emissive = ref(0); // %, press-and-hold (s. below) — 0 at rest

const groundMaterial = 'color: #3b82f6; opacity: 0.35; side: double';

const roughnessFrac = computed(() => roughness.value / 100);
const metalnessFrac = computed(() => metalness.value / 100);
// Same 0–300% mapping the old GUI slider used — kept as-is, only the input
// mechanism (hold gesture instead of a slider) changed.
const emissiveMultiplier = computed(() => (emissive.value / 100) * 3);

// Opacity is no longer part of these strings — proximity-opacity.ts drives
// it directly, per sphere, via a partial `el.setAttribute(component,
// "opacity", value)` that only touches that one field (s. its own comment
// for why); the full-string bindings below only ever carry roughness/
// metalness/emissiveIntensity, so the two update paths never fight over
// the same key.
const materialPropsAttr = computed(
  () => `roughness: ${roughnessFrac.value.toFixed(2)}; metalness: ${metalnessFrac.value.toFixed(2)}; ` +
        `emissiveIntensity: ${emissiveMultiplier.value.toFixed(2)}`
);
function ditherAttr(ditherType: string): string {
  return `ditherType: ${ditherType}; roughness: ${roughnessFrac.value.toFixed(2)}; metalness: ${metalnessFrac.value.toFixed(2)}; ` +
         `emissiveIntensity: ${emissiveMultiplier.value.toFixed(2)}`;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// Swipe replaces the old GUI sliders entirely ("Bedienfeld weg", 31.08.2026,
// s. swipe-drag.ts and the same decision in zufallsverteilung-lod.md) —
// vertical swipe = Roughness, horizontal swipe = Metalness, both relative/
// incremental (not tied to a fixed screen position). 250px for the full
// 0–100 range, same sensitivity already established there.
const SWIPE_PX_FOR_FULL_RANGE = 250;
const SWIPE_SENSITIVITY = 100 / SWIPE_PX_FOR_FULL_RANGE;
let detachSwipeDrag: (() => void) | null = null;

// Press-and-hold emissive boost (31.08.2026): holding the finger down on
// the canvas ramps `emissive` 0 -> 100% over EMISSIVE_RAMP_MS; releasing
// (or the drag ending any other way) ramps it back down to 0 at the same
// rate, starting from whatever value it had already reached — not a fixed
// 2s round trip, so letting go early falls proportionally faster. A plain
// rAF loop (not A-Frame tick(), nothing here touches a 3D entity directly)
// that only keeps running while `emissive` hasn't yet settled at its
// current target, so it's a no-op cost once idle at rest (target 0,
// already there) or fully held (target 100, already there).
const EMISSIVE_RAMP_MS = 2000;
const EMISSIVE_RAMP_RATE = 100 / EMISSIVE_RAMP_MS; // %/ms
let emissiveHeld = false;
let emissiveRafId: number | null = null;
let lastEmissiveFrameTime = 0;

function stepEmissive(now: number) {
  const dt = now - lastEmissiveFrameTime;
  lastEmissiveFrameTime = now;
  const target = emissiveHeld ? 100 : 0;
  const delta = EMISSIVE_RAMP_RATE * dt;
  if (emissive.value < target) emissive.value = Math.min(target, emissive.value + delta);
  else if (emissive.value > target) emissive.value = Math.max(target, emissive.value - delta);

  emissiveRafId = emissive.value === target ? null : requestAnimationFrame(stepEmissive);
}

function ensureEmissiveRamping() {
  if (emissiveRafId !== null) return;
  lastEmissiveFrameTime = performance.now();
  emissiveRafId = requestAnimationFrame(stepEmissive);
}

onMounted(() => {
  detachSwipeDrag = attachSwipeDrag(
    (dx) => { metalness.value = clamp(metalness.value + dx * SWIPE_SENSITIVITY, 0, 100); },
    // -dy: swiping UP (negative screen dy) increases roughness, matching
    // zufallsverteilung-lod's "nach oben = mehr" convention.
    (dy) => { roughness.value = clamp(roughness.value - dy * SWIPE_SENSITIVITY, 0, 100); },
    () => { emissiveHeld = true; ensureEmissiveRamping(); },
    () => { emissiveHeld = false; ensureEmissiveRamping(); }
  );
});

onUnmounted(() => {
  detachSwipeDrag?.();
  if (emissiveRafId !== null) cancelAnimationFrame(emissiveRafId);
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
        no-frustum-cull
        :visible="assetsLoaded"
    >

      <!-- Two point lights orbiting the scene at different speed/direction,
           one pink, one turquoise (device testing, 30.08.2026, s. Skript-
           Kommentar oben für die Orbit-Mechanik). castShadow (31.08.2026,
           "Schlagschatten sollten aktiviert sein") — A-Frame's light
           component keeps its own shadow config directly on this same
           `light=` string, separate from the per-mesh `shadow` component
           used below on the spheres/ground. -->
      <a-entity :position="`0 0 ${ORBIT_HEIGHT}`" animation="property: rotation; from: 0 0 0; to: 0 0 360; loop: true; dur: 9000; easing: linear">
        <a-entity light="type: point; color: #ff2d95; intensity: 1.3; castShadow: true" :position="`${ORBIT_RADIUS} 0 0`"></a-entity>
      </a-entity>
      <a-entity :position="`0 0 ${ORBIT_HEIGHT}`" animation="property: rotation; from: 0 0 180; to: 0 0 -180; loop: true; dur: 14000; easing: linear">
        <a-entity light="type: point; color: #1fd6c1; intensity: 1.3; castShadow: true" :position="`${ORBIT_RADIUS} 0 0`"></a-entity>
      </a-entity>

      <!-- White spotlight "headlamp" — follows the camera's position AND
           rotation (attach-to's own copyRotation, added for this), so it
           always shines in the current view direction (device testing,
           30.08.2026). No explicit `target`: A-Frame's light component then
           points a spot/directional light along the entity's own local -Z,
           following its rotation every frame like a real headlamp. -->
      <a-entity
          light="type: spot; color: #ffffff; intensity: 1.5; angle: 15; penumbra: 0.4; distance: 2.5; castShadow: true"
          attach-to="target: #camera; copyRotation: true">
      </a-entity>

      <!-- Material-/Shader-Showcase (archive-of-practice
           projects/an-alle/concepts/material-shader-showcase.md) — sechs
           farbige KUGELN auf einer Helix um eine senkrechte Achse
           gestaffelt, in Größe und Farbe (Zitronengelb → Hot Pink), jede
           tangential auf der nächstgrößeren aufsitzend (s. Skript-
           Kommentar oben). Kein Unlit mehr — alle sechs reagieren auf
           Licht und werfen/empfangen Schlagschatten (`shadow` je Kugel).
           Dither alterniert über die Staffelung (f/d/b ohne, e/c/a mit je
           einem anderen ditherType) statt auf drei benachbarten Kugeln zu
           liegen. `#showcase-spin` dreht die GESAMTE Gruppe fortwährend um
           die eigene senkrechte (Welt-Z-)Achse (31.08.2026) — liegt
           bewusst AUSSERHALB von `#showcase`s `rotation="90 0 0"`
           (Footprint-Koordinatenumrechnung, keine Komponenten-Achsen-
           Kompensation), genau wie die beiden Orbit-Licht-Pivots oben, mit
           denen sie sich die reale Z-Rotationskonvention teilt. Kein
           `:key` mehr nötig — roughness/metalness/opacity aktualisieren
           sich jetzt alle live über bestehendes update() (s. Skript-
           Kommentar oben), render-order ist fix. -->
      <a-entity id="showcase-spin" :animation="`property: rotation; from: 0 0 0; to: 0 0 360; loop: true; dur: ${HELIX_SPIN_DUR_MS}; easing: linear`">
        <a-entity id="showcase" rotation="90 0 0">

          <!-- A (kleinste) — jetzt gedithert (interleaved-gradient), s.
               DITHER_TYPE_BY_STEP im Skript. -->
          <a-entity :position="itemPosition(0)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(0)}`"
                :material="itemMaterial(0)"
                :dither-material="ditherAttr('interleaved-gradient')"
                :render-order="renderOrderOf('a')"
                :proximity-opacity="proximityOpacityAttr('dither-material')"
                shadow>
            </a-entity>
            <a-entity :text="'value: ' + renderOrderOf('a') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(0)"></a-entity>
          </a-entity>

          <!-- B — normale Alpha-Transparenz. -->
          <a-entity :position="itemPosition(1)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(1)}`"
                :material="itemMaterial(1)"
                :material-properties="materialPropsAttr"
                :render-order="renderOrderOf('b')"
                :proximity-opacity="proximityOpacityAttr('material-properties')"
                shadow>
            </a-entity>
            <a-entity :text="'value: ' + renderOrderOf('b') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(1)"></a-entity>
          </a-entity>

          <!-- C — gedithert (noise). -->
          <a-entity :position="itemPosition(2)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(2)}`"
                :material="itemMaterial(2)"
                :dither-material="ditherAttr('noise')"
                :render-order="renderOrderOf('c')"
                :proximity-opacity="proximityOpacityAttr('dither-material')"
                shadow>
            </a-entity>
            <a-entity :text="'value: ' + renderOrderOf('c') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(2)"></a-entity>
          </a-entity>

          <!-- D — normale Alpha-Transparenz. -->
          <a-entity :position="itemPosition(3)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(3)}`"
                :material="itemMaterial(3)"
                :material-properties="materialPropsAttr"
                :render-order="renderOrderOf('d')"
                :proximity-opacity="proximityOpacityAttr('material-properties')"
                shadow>
            </a-entity>
            <a-entity :text="'value: ' + renderOrderOf('d') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(3)"></a-entity>
          </a-entity>

          <!-- E — gedithert (bayer). -->
          <a-entity :position="itemPosition(4)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(4)}`"
                :material="itemMaterial(4)"
                :dither-material="ditherAttr('bayer')"
                :render-order="renderOrderOf('e')"
                :proximity-opacity="proximityOpacityAttr('dither-material')"
                shadow>
            </a-entity>
            <a-entity :text="'value: ' + renderOrderOf('e') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(4)"></a-entity>
          </a-entity>

          <!-- F (größte) — normale Alpha-Transparenz. -->
          <a-entity :position="itemPosition(5)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(5)}`"
                :material="itemMaterial(5)"
                :material-properties="materialPropsAttr"
                :render-order="renderOrderOf('f')"
                :proximity-opacity="proximityOpacityAttr('material-properties')"
                shadow>
            </a-entity>
            <a-entity :text="'value: ' + renderOrderOf('f') + '; align: center; color: #ffffff; width: 1.6'" :position="labelPosition(5)"></a-entity>
          </a-entity>

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

  <!-- AN ALLE! Zwischen-Basis: shared info button + overlay, replacing the
       raycast-driven context-text idea for every Themenfeld except
       Sound-Player (s. projects/an-alle/concepts/sound-player.md). Each
       branch passes its own scene-specific explanation text. Kein GuiPanel
       mehr ("Bedienfeld weg", 31.08.2026) — Erklärung entsprechend auf
       Swipe/Proximity umgestellt. -->
  <InfoOverlay text="Sechs rotierende Kugeln, zwei Transparenz-Techniken: gedithert und normal durchsichtig. Vertikaler Swipe ändert die Rauheit, horizontaler Swipe die Metallizität (alle Kugeln gemeinsam). Finger gedrückt halten lässt das Leuchten ansteigen, Loslassen lässt es wieder abklingen. Die Durchsichtigkeit jeder Kugel hängt vom eigenen Abstand zur Kamera ab." />
</template>
