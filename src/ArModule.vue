<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import { manifest } from './manifest';
import { trackAssetLoading } from './asset-loading-overlay';
import { attachSwipeDrag } from './swipe-drag';
import { animateValue, cancellableFade } from './tween';
import { TUTORIAL_FONT_FAMILY, ensureTutorialFontLoaded } from './fonts';
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
// überlappende Objekte, zwei kamera-abstandsgetriebene Techniken. Keine
// Emoji-PNGs vom Autor vorhanden (Entscheidung: "sechs Emoji-PNGs, vom Autor
// bereitgestellt") — wie schon in examples/random-field-lod-billboard-
// proximity-wave-scene.html bei fehlenden Assets, stehen sechs farbige
// Kugel-Primitives stellvertretend dafür; beide Techniken wirken identisch
// unabhängig von einer Textur.
//
// "Bedienfeld weg" (31.08.2026) — kein GUI-Panel mehr, alles über
// swipe/proximity/Geste, wie schon in zufallsverteilung-lod: Roughness auf
// vertikalen Swipe, Metalness auf horizontalen Swipe (global, alle sechs
// Kugeln gemeinsam, s. attachSwipeDrag unten). Emissive liegt standardmäßig
// bei 0 und steigt bei gehaltenem, unbewegtem Finger nach EMISSIVE_HOLD_DELAY_MS
// Verzögerung über EMISSIVE_RAMP_MS auf 100%; bewegt sich der Finger dabei um
// mehr als EMISSIVE_SWIPE_CANCEL_PX (Swipe statt Halten), wird der Anstieg für
// diese Berührung ganz verworfen. Beim Loslassen (oder Swipe-Abbruch) fällt der
// Wert von seinem aktuellen Stand aus mit derselben Rate zurück auf 0 (s.
// stepEmissive/ensureEmissiveRamping/registerEmissiveMovement unten).
// Roughness/Metalness/Emissive kommen bei allen sechs Kugeln einheitlich aus
// materialPropsAttr (material-properties.ts) — unabhängig davon, welche der
// beiden Proximity-Techniken unten eine Kugel sonst noch treibt. Unlit
// entfällt ganz — alle sechs Kugeln reagieren jetzt auf Licht. Drei Kugeln
// (b/d/f) sind normal alpha-transparent, mit Opacity PRO Kugel an deren
// eigenen Kameraabstand gekoppelt (proximity-opacity.ts, Schwelle relativ zu
// FOOTPRINT_MIN_SIDE, s. OPACITY_FADE_FAR/NEAR unten). Die anderen drei
// (a/c/e) nutzen stattdessen Proximity Cutout (proximity-cutout.ts, s.
// CUTOUT_RADIUS/-FEATHER unten): ein geditherter Lochrand öffnet sich um die
// Kamera, statt dass die ganze Kugel verblasst — die drei Dither-Muster
// (bayer/noise/interleaved-gradient) bleiben dabei erhalten, jetzt als
// proximity-cutout.ts's eigene `ditherType`-Option (s. dessen Kommentar für
// die Begründung, warum nicht weiterhin dither-material.ts). Nicht auf drei
// benachbarten Kugeln, sondern alternierend über die Größenstaffelung
// verteilt (größte ohne Cutout, zweitgrößte mit Cutout, nächste ohne, usw. —
// s. Kommentar am Helix-Block unten).
//
// Render-order-Thematik komplett entfernt (01.09.2026) — war ohnehin
// bereits fix (keine Auf/Ab-Knöpfe mehr) und für diese Szene nicht mehr
// relevant; die render-order-Komponente und die Nummern-Labels über jeder
// Kugel sind ersatzlos gestrichen. Da material-properties/proximity-cutout
// Attributänderungen bereits live über ihr eigenes update()/tick()
// übernehmen, ist ohnehin kein erzwungener Neuaufbau (`:key`) nötig — jede
// Änderung (Roughness/Metalness/Emissive/Opacity/Cutout-Radius) aktualisiert
// die bestehenden Entities in place.
//
// Footprint convention (s. sound-player's own ArModule.vue and
// guides/IMAGE-TRACKING-FEATURE-GUIDE.md) — the tracked image is the
// scene's ground plane. Unlike the other three retrofitted branches, none
// of material-properties/proximity-cutout/unlit-material/render-order touch
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
// FOOTPRINT_MIN_SIDE edge length. Raised back up from the initial low,
// ground-hugging 0.5 in two device-test rounds (01.09.2026: 0.5 -> 0.65 ->
// 0.75) — still comfortably under the ceiling.
const HELIX_TOTAL_HEIGHT_FRACTION = 0.75;
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
// Reverse of sphereColor (01.09.2026, author's request): same lemon-yellow
// -> hot-pink gradient, but swapped — the smallest sphere's OUTSIDE is
// yellow while its INSIDE (visible through the cutout hole) is pink, and
// vice versa for the largest. Only meaningful on the three cutout spheres
// (a/c/e) — proximity-cutout.ts's own innerColor option is what actually
// renders it, s. cutoutAttr below.
function innerSphereColor(step: number): string {
  return lerpHexColor(COLOR_OUTER, COLOR_INNER, step / STEP_COUNT);
}
// Base material string per item — own colour from the gradient, matching
// emissive as the material's own authored base glow (no global emissive
// slider anymore, s. "Bedienfeld weg" comment above — material-properties's
// emissiveIntensity multiplier is simply left at its own schema default of
// 1, i.e. exactly this base glow, unboosted).
function itemMaterial(step: number): string {
  const color = sphereColor(step);
  return `color: ${color}; side: double; transparent: true; emissive: ${color}; emissiveIntensity: 1`;
}

// Which three (of six) steps get the proximity-cutout treatment below
// alternates over the size staggering rather than sitting on three adjacent
// spheres (31.08.2026): largest (f) = plain alpha, next (e) = cutout, next
// (d) = plain alpha, and so on down to the smallest (a) — s. archive-of-
// practice projects/an-alle/concepts/material-shader-showcase.md. Steps not
// mentioned here use plain alpha transparency (material-properties.ts).

// Per-sphere opacity fade (proximity-opacity.ts), now only on the three
// ALPHA-transparent spheres (b/d/f) — the dither spheres switched to
// proximity-cutout instead (01.09.2026, s. CUTOUT_RADIUS/-FEATHER and
// emitModelLoadedOnMesh below: this is the effect originally meant for
// proximity-effekte's own dither surfaces, s. archive-of-practice
// projects/an-alle/concepts/proximity-effekte.md). Expressed relative to
// FOOTPRINT_MIN_SIDE rather than a fixed cm value (31.08.2026, same
// reasoning as the helix height budget above — "auch die Abstands-
// berechnung kann sich an der Kantenlänge orientieren"): fully OPAQUE at
// 1.5 edge lengths away (narrowed from 2, 01.09.2026), fully TRANSPARENT
// within (device testing, 31.08.2026: opposite of a typical fade-in-on-
// approach — here the sphere fades away as the camera gets close to it).
// NEAR widened 0.2x -> 0.35x -> 0.5x (01.09.2026, author's request: these
// three needed to fade out earlier, i.e. while the camera is still further
// away, not only once nearly touching) — narrows the whole fade band, so
// full transparency arrives sooner during approach.
const OPACITY_FADE_FAR = FOOTPRINT_MIN_SIDE * 1.5;
const OPACITY_FADE_NEAR = FOOTPRINT_MIN_SIDE * 0.5;
function proximityOpacityAttr(targetComponent: string): string {
  return `targetComponent: ${targetComponent}; near: ${OPACITY_FADE_NEAR.toFixed(4)}; far: ${OPACITY_FADE_FAR.toFixed(4)}`;
}

// Proximity Cutout (proximity-cutout.ts) on the three DITHER spheres
// (a/c/e) instead of the opacity fade above — a dithered hole opens around
// the camera as it approaches, letting the camera "cut into" the sphere,
// rather than the whole sphere just fading out (01.09.2026, s. comment
// above). dither-material can't sit alongside proximity-cutout on the same
// sphere (both patch the same material's onBeforeCompile, s.
// PROXIMITY-CUTOUT-FEATURE-GUIDE.md §4 — whichever patches last silently
// wins), so all three named dither LOOKS (bayer/noise/interleaved-gradient)
// live directly in proximity-cutout.ts now (its own `ditherType` option,
// added for this) rather than in a separate dither-material instance — same
// three patterns, same per-sphere assignment as before (a = interleaved-
// gradient, c = noise, e = bayer), just texturing the cutout's feather edge
// instead of a blanket transparency dither. Each of the three gets its own
// component instance rather than one wrapper spanning non-adjacent siblings
// (a/c/e sit interleaved with b/d/f in the template below, s. itemMaterial's
// step order) — cheap, since each instance only ever patches its own one
// sphere's material.
//
// Radius/feather are relative to THAT sphere's own radius (sphereRadius(step)),
// not FOOTPRINT_MIN_SIDE (01.09.2026, corrected after device testing) — the
// near/far cutoff direction itself was always correct (fragments close to
// the camera discard, far ones stay solid, s. proximity-cutout.ts's own
// shader comment), but a FOOTPRINT_MIN_SIDE-relative radius/feather sits in
// the same range as a comfortable overall viewing distance (comparable to
// OPACITY_FADE_NEAR/FAR above) — since each sphere is tiny next to the whole
// footprint, that put the ENTIRE sphere inside the feather transition band
// at once, so it looked like the whole thing dissolving rather than a small
// hole localized near wherever the camera actually is. Scaling to the
// sphere's own radius instead keeps the hole meaningfully smaller than the
// object it cuts into. First attempt at this (0.6x/0.25x) swung too far the
// other way (device testing, 01.09.2026): `radius - feather` (where the
// discard band starts) came out under the sphere's own radius, so the
// camera-to-CENTRE distance had to be within roughly r + 0.35r before the
// nearest surface point was even in range — the camera had to nearly touch
// the sphere. Raised to 2x/0.8x, then 4.5x/1.8x — both still too close on
// device (01.09.2026), settled on 7x for radius.
//
// Not purely per-sphere size anymore, though (01.09.2026, author's
// request): the middle cutout sphere (c, step 2) is the BASELINE — its
// threshold is its own true radius, undamped. The smaller (a) and larger
// (e) only deviate from that baseline at HALF weight instead of scaling
// fully off their own radius, so the three cutout distances stay closer to
// each other than a pure per-sphere scale would (s.
// cutoutEffectiveRadius below) — noticeably less "the tiny one triggers at
// a tiny distance, the big one at a big distance" than before, while c
// itself is unaffected either way. feather narrowed 2.8x -> 2.2x -> 1.8x
// ("insgesamt etwas kleiner", author's request) — a tighter transition
// band, still comfortably inside radius per the component's own constraint
// (s. PROXIMITY-CUTOUT-FEATURE-GUIDE.md §4). innerColor (s.
// innerSphereColor above) tints only what the hole exposes — proximity-
// cutout.ts's own `gl_FrontFacing` branch, added for this.
const CUTOUT_BASELINE_STEP = 2; // c — the middle of the three cutout spheres
function cutoutEffectiveRadius(step: number): number {
  const r = sphereRadius(step);
  const rBaseline = sphereRadius(CUTOUT_BASELINE_STEP);
  return rBaseline + 0.5 * (r - rBaseline);
}
function cutoutAttr(step: number, ditherType: string): string {
  const r = cutoutEffectiveRadius(step);
  const radius = r * 7.0;
  const feather = r * 1.8;
  return `radius: ${radius.toFixed(4)}; feather: ${feather.toFixed(4)}; ditherType: ${ditherType}; innerColor: ${innerSphereColor(step)}`;
}

// proximity-cutout (like proximity-fade/-dither) only discovers materials
// via a bubbled `model-loaded` event from a descendant `gltf-model` (s.
// PROXIMITY-CUTOUT-FEATURE-GUIDE.md) — the dither spheres are plain
// primitives (geometry+material components) and never fire that event on
// their own, so each one re-emits it manually once its own mesh exists.
// Identical pattern to proximity-effekte's own house primitives (s.
// archive-of-practice projects/an-alle/concepts/proximity-effekte.md).
function emitModelLoadedOnMesh(e: any) {
  if (e.detail?.type === 'mesh') e.target.emit('model-loaded');
}

// Three point lights orbiting the whole scene at different speed/direction/
// height/color (device testing, 30.08.2026 onward) — no more white
// spotlight "headlamp" (deleted 01.09.2026, author's request; had followed
// the camera instead of orbiting). Orbit lights sit OUTSIDE #showcase's
// rotation wrapper, authored directly in real footprint X/Y-ground,
// Z-height terms (like the directional/ambient lights above) — no axis
// compensation needed since nothing here is a ported room-scale component.
// A rotating pivot entity (`animation` on `rotation`, real Z = the height
// axis, so rotation.z sweeps the ground's X/Y plane) carries a light offset
// along its own local X by ORBIT_RADIUS, tracing a circle at constant
// height.
//
// Anchored directly to the sphere cluster's own outer edge
// (RING_RADIUS + SPHERE_R_MAX, the largest sphere's furthest extent from the
// axis) rather than a footprint-relative guess (01.09.2026, author's device-
// test feedback: lights were clipping into the spheres, most visible in the
// shadows) — the previous FOOTPRINT_MIN_SIDE-based value didn't scale
// together with the actual cluster size, so a later change to
// SPHERE_R_MAX/RING_RADIUS could silently reopen the same clipping. Raised
// 1.8x -> 2.4x (01.09.2026, still clipping a bit on device at 1.8x).
const ORBIT_RADIUS = (RING_RADIUS + SPHERE_R_MAX) * 2.4;
const ORBIT_HEIGHT = (SPHERE_HEIGHT[0] + SPHERE_HEIGHT[STEP_COUNT]) / 2; // roughly mid-height of the sphere helix
// Turquoise orbit light sits a bit higher than the pink one (01.09.2026,
// author's device-test feedback) — its own pivot height instead of sharing
// ORBIT_HEIGHT, offset relative to FOOTPRINT_MIN_SIDE like every other
// distance in this file.
const ORBIT_HEIGHT_TURQUOISE = ORBIT_HEIGHT + FOOTPRINT_MIN_SIDE * 0.15;
// White orbit light (added 01.09.2026, replaces the deleted spotlight) sits
// higher still than turquoise, same step size.
const ORBIT_HEIGHT_WHITE = ORBIT_HEIGHT_TURQUOISE + FOOTPRINT_MIN_SIDE * 0.15;
// Shadow acne fix (01.09.2026): a small negative bias on every shadow-
// casting light nudges the shadow map's depth comparison just enough to
// stop each sphere's own surface from self-shadowing in speckled bands —
// the standard fix for this artifact, applied uniformly to all three
// lights below rather than tuned per-light.
const SHADOW_BIAS = -0.001;

const roughness = ref(50); // %, vertical swipe
const metalness = ref(50); // %, horizontal swipe
const emissive = ref(0); // %, press-and-hold (s. below) — 0 at rest

// Real-time reflections (reflection-probe.ts) default OFF (01.09.2026,
// author's request) — a full cube render every few frames is real GPU cost
// on a mobile AR device, not something to force on every visitor by
// default. A plain screen-space checkbox (s. template below, same "not an
// A-Frame component" pattern as the loading bar/InfoOverlay) lets it be
// switched on for testing/comparison instead of resurrecting the whole
// GuiPanel/gui-controls swipe-era system for one boolean.
const reflectionEnabled = ref(false);

// Vertical position of the checkbox itself, expressed as a single `top`
// percentage (01.09.2026, author's request: animate the actual GUI element
// to screen centre for the tutorial's reflection demo, replacing an
// earlier separate cross/check emoji overlay the author didn't like) — one
// consistent anchor scheme (`top` + `transform: translate(-50%, -50%)`)
// throughout, at BOTH its resting position (near the bottom) and centred,
// so animateValue can smoothly interpolate a single number between them
// with no discontinuity, rather than switching between a `bottom`- and a
// `top`-anchored style partway through.
const REFLECTION_CHECKBOX_REST_TOP_PERCENT = 96;
const REFLECTION_CHECKBOX_CENTER_TOP_PERCENT = 50;
const reflectionCheckboxTopPercent = ref(REFLECTION_CHECKBOX_REST_TOP_PERCENT);

const reflectionToggleStyle = computed(() => ({
  position: 'fixed' as const,
  top: `${reflectionCheckboxTopPercent.value}%`,
  left: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: '8px',
  padding: '8px 14px',
  borderRadius: '999px',
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#ffffff',
  fontFamily: TUTORIAL_FONT_FAMILY,
  fontSize: '14px',
  zIndex: 1000
}));

// Animated 0 -> 1 -> STANDARD_GROUND_OPACITY as the tutorial's own lead-in
// (s. runTutorial() below, same mechanism as zufallsverteilung-lod's own
// tutorial) — starts at 0 (invisible) until that animation runs, rather
// than showing the ground at its standard opacity immediately.
const STANDARD_GROUND_OPACITY = 0.35;
const groundOpacity = ref(0);
const groundMaterial = computed(() => `color: #3b82f6; opacity: ${groundOpacity.value}; side: double`);

const roughnessFrac = computed(() => roughness.value / 100);
const metalnessFrac = computed(() => metalness.value / 100);
// Capped at 1.0, not the 0–300% range the old GUI slider used (01.09.2026,
// author's device-test feedback: emissive at high multiplier appeared
// washed out toward white rather than showing each sphere's own colour) —
// COLOR_INNER and COLOR_OUTER both have their red channel already at its
// max (0xFF), so every interpolated sphere colour's brightest channel is
// already saturated at 1.0. Any multiplier above 1 doesn't clip that
// channel further; it just pulls the OTHER two channels up toward the same
// 1.0 ceiling, which is exactly what reads as "turning white" — capping at
// 1.0 means full hold reaches the sphere's own fully-saturated colour and
// no further, never overshooting into white.
const emissiveMultiplier = computed(() => emissive.value / 100);

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

// Faster rotation on approach AND on hold (author's request, 01.09.2026:
// "Bei der Hold-Geste, sollten sich die Kugeln und die Lichter schneller
// drehen. Auch beim Näherkommen sollte das passieren, auch wenn die Hold-
// Geste eine größere Geschwindigkeitssteigerung auslöst.") — spin.ts's own
// proximity term handles "closer = faster" internally (each rotating
// entity measures its own fixed anchor point), so this file only needs to
// feed it a shared `holdBoost`. Reusing `emissiveMultiplier` directly
// (already 0..1, already tracking the exact same hold-delay/ramp/swipe-
// cancel state emissiveIntensity itself uses) keeps the glow-up and the
// speed-up perfectly in sync, driven by one underlying value, rather than
// building a second, separate hold-tracking mechanism.
// SPIN_PROXIMITY_NEAR/FAR reuse the same OPACITY_FADE_NEAR/FAR thresholds
// (already the established "close"/"far" scale for this scene, s. their
// own comment above) rather than inventing a third distance convention.
// Multiplier magnitudes are author-guess starting points (needs on-device
// retuning like every other tuned number in this codebase) — hold's own
// multiplier is deliberately larger than proximity's, per the author's
// explicit ordering above.
const SPIN_PROXIMITY_NEAR = OPACITY_FADE_NEAR;
const SPIN_PROXIMITY_FAR = OPACITY_FADE_FAR;
const SPIN_PROXIMITY_SPEED_MULTIPLIER = 1.6;
const SPIN_HOLD_SPEED_MULTIPLIER = 3;
function spinAttr(baseSpeedDegPerSec: number, direction: number): string {
  return `baseSpeedDegPerSec: ${baseSpeedDegPerSec}; direction: ${direction}; ` +
         `proximityNear: ${SPIN_PROXIMITY_NEAR.toFixed(4)}; proximityFar: ${SPIN_PROXIMITY_FAR.toFixed(4)}; ` +
         `proximitySpeedMultiplier: ${SPIN_PROXIMITY_SPEED_MULTIPLIER}; ` +
         `holdBoost: ${emissiveMultiplier.value.toFixed(2)}; holdSpeedMultiplier: ${SPIN_HOLD_SPEED_MULTIPLIER}`;
}
// Base speeds derived from the old `animation` components' own from/to/dur
// (360° over each one's own duration) — unchanged from before, just now
// expressed as deg/s for spin.ts instead of a start/end/duration triple.
const HELIX_SPIN_SPEED_DEG_PER_SEC = 360 / (HELIX_SPIN_DUR_MS / 1000);
const ORBIT_PINK_SPEED_DEG_PER_SEC = 360 / 9; // 9000ms, direction 1
const ORBIT_TURQUOISE_SPEED_DEG_PER_SEC = 360 / 14; // 14000ms, direction -1 (180 -> -180)
const ORBIT_WHITE_SPEED_DEG_PER_SEC = 360 / 19; // 19000ms, direction 1
const helixSpinAttr = computed(() => spinAttr(HELIX_SPIN_SPEED_DEG_PER_SEC, 1));
const orbitPinkSpinAttr = computed(() => spinAttr(ORBIT_PINK_SPEED_DEG_PER_SEC, 1));
const orbitTurquoiseSpinAttr = computed(() => spinAttr(ORBIT_TURQUOISE_SPEED_DEG_PER_SEC, -1));
const orbitWhiteSpinAttr = computed(() => spinAttr(ORBIT_WHITE_SPEED_DEG_PER_SEC, 1));

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
//
// Two refinements (01.09.2026, device-test feedback): (1) the climb only
// starts after EMISSIVE_HOLD_DELAY_MS of holding still — a deliberate
// "hold", not an instant reaction to touching down; (2) it must not fire on
// a swipe at all. swipe-drag.ts's onHoldStart/onHoldEnd fire on the same
// pointerdown/up bracket as a drag regardless of movement (by its own
// design — "a swipe is still a hold"), so this file tracks cumulative
// movement itself via registerEmissiveMovement, fed from the same dx/dy
// callbacks that already drive roughness/metalness: once movement exceeds
// EMISSIVE_SWIPE_CANCEL_PX, the hold is cancelled outright for the rest of
// that touch, not just delayed.
const EMISSIVE_RAMP_MS = 2000;
const EMISSIVE_RAMP_RATE = 100 / EMISSIVE_RAMP_MS; // %/ms
const EMISSIVE_HOLD_DELAY_MS = 1000;
const EMISSIVE_SWIPE_CANCEL_PX = 6;
let emissiveHeld = false;
let emissiveHoldStartTime = 0;
let emissiveMoveAccumPx = 0;
let emissiveSwipeCancelled = false;
let emissiveRafId: number | null = null;
let lastEmissiveFrameTime = 0;
let emissiveHoldWasConfirmed = false;
// Hold-blocks-swipe mutual exclusion (backported from animationssystem-
// wanderer's own gold-standard gesture handling, 01.09.2026: "keine
// versehentlichen swipes bei hold geste") — this branch already had a
// press-and-hold gesture, but only ever cancelled the EMISSIVE ramp itself
// on movement past EMISSIVE_SWIPE_CANCEL_PX; roughness/metalness kept
// updating from that same movement regardless. Once a hold is CONFIRMED
// (past EMISSIVE_HOLD_DELAY_MS), this sticky flag now also blocks any
// further roughness/metalness swipe input for the rest of that same touch
// — releasing and starting a genuinely NEW gesture is required to swipe
// again, matching wanderer's own pattern exactly.
let swipeSuppressedThisSession = false;

function stepEmissive(now: number) {
  const dt = now - lastEmissiveFrameTime;
  lastEmissiveFrameTime = now;
  const holdConfirmed = emissiveHeld && !emissiveSwipeCancelled && (now - emissiveHoldStartTime) >= EMISSIVE_HOLD_DELAY_MS;
  if (holdConfirmed && !emissiveHoldWasConfirmed) swipeSuppressedThisSession = true;
  emissiveHoldWasConfirmed = holdConfirmed;
  const target = holdConfirmed ? 100 : 0;
  const delta = EMISSIVE_RAMP_RATE * dt;
  if (emissive.value < target) emissive.value = Math.min(target, emissive.value + delta);
  else if (emissive.value > target) emissive.value = Math.max(target, emissive.value - delta);

  // Still waiting out the pre-ramp delay: emissive itself hasn't moved
  // (already sits at its target of 0), but the loop must keep running or
  // the "settled" check below would stop it before the delay elapses.
  const awaitingHoldConfirmation = emissiveHeld && !emissiveSwipeCancelled && !holdConfirmed;
  const settled = emissive.value === target && !awaitingHoldConfirmation;
  emissiveRafId = settled ? null : requestAnimationFrame(stepEmissive);
}

function ensureEmissiveRamping() {
  if (emissiveRafId !== null) return;
  lastEmissiveFrameTime = performance.now();
  emissiveRafId = requestAnimationFrame(stepEmissive);
}

function registerEmissiveMovement(deltaPx: number) {
  if (emissiveSwipeCancelled || !emissiveHeld) return;
  emissiveMoveAccumPx += Math.abs(deltaPx);
  if (emissiveMoveAccumPx > EMISSIVE_SWIPE_CANCEL_PX) {
    emissiveSwipeCancelled = true;
    emissiveHeld = false;
    ensureEmissiveRamping();
  }
}

// Tutorial animation (01.09.2026, author's request: "im Stil der LOD
// Branch", s. zufallsverteilung-lod's own ArModule.vue/tween.ts for the
// pattern this follows) — plays once on the first successful image
// recognition (`xrextrasfound`, fired by `xrextras-named-image-target`
// itself, already pre-filtered to THIS named target). Three back-to-back
// phases, each a bottom-anchored text label naming the gesture while the
// attribute it drives sweeps through waypoints and back — same
// `animateValue`/`segmentDuration` mechanism as zufallsverteilung-lod,
// copied into this branch's own tween.ts (not present here before, only on
// zufallsverteilung-lod/zwischen-basis at the time this scene branched
// off). `tutorialInputLocked` blocks real swipe/hold input for the whole
// sequence so a visitor's own touch can't fight the demo (s. the dx/dy/
// hold-start/hold-end callbacks in onMounted below) — unlike
// zufallsverteilung-lod, nothing here needs an equivalent "frozen" motion
// flag: the helix's own spin and the orbit lights aren't swipe/hold-driven
// state, so there's nothing to visually compete with the demo besides the
// gestures themselves.
//
// Phase 1 (vertical swipe/roughness): metalness pinned at 20% for the
// whole phase, roughness sweeps standard value -> 100% -> 0% -> its own
// standard value again.
// Phase 2 (horizontal swipe/metalness): metalness sweeps 20% -> 100% -> its
// own standard value, WHILE roughness simultaneously sweeps its own
// standard value -> 10% -> back (both legs share the same duration as the
// metalness leg they run alongside, s. runTutorial() below — the author's
// request, 01.09.2026, was for the two to visibly move together, not
// roughness sitting still). reflection-probe (s. reflectionEnabled/
// reflection-probe.ts) is also temporarily forced on for this phase only
// — high metalness is exactly the state that makes the reflection effect
// visible, so this phase doubles as its own demonstration — then restored
// to whatever the visitor's own checkbox already had it at, not just
// hardcoded back to off.
// Phase 2.5 (reflection checkbox, added 01.09.2026, author's request:
// "einen Tutorial-Abschnitt, der die reflection checkbox erklärt, nach der
// metalness erklärung"): the checkbox GUI element itself animates up to
// screen centre over REFLECTION_CHECKBOX_MOVE_MS (author's later refinement
// — replaces an earlier separate cross/check emoji overlay), staying OFF
// for that whole move; once centred, ON for REFLECTION_DEMO_HOLD_MS; then
// OFF again and animates back down over another REFLECTION_CHECKBOX_MOVE_MS.
// The explanatory tutorial text is hidden for both moves (only shown while
// the checkbox itself is stationary — author's spec: "während das GUI
// Element animiert, ist die erklärende Texteinblendung nicht sichtbar").
// Phase 3 (hold/emissive, new — not part of zufallsverteilung-lod's own
// tutorial, which has no hold gesture): both roughness and metalness sit at
// their standard values while emissive sweeps 0% -> 100% -> 0%. Every
// waypoint here is the author's explicit spec, not derived from any
// existing constant.
const tutorialInputLocked = ref(true);
const tutorialText = ref('');
const imageTargetEl = ref<HTMLElement | null>(null);
const GROUND_INTRO_SEGMENT_MS = 1500; // x2 = 3s lead-in, same spec as zufallsverteilung-lod's own tutorial

// Resettable tutorial lead-in (archive-of-practice projects/an-alle/
// concepts/zwischen-basis.md, backported from animationssystem-wanderer,
// 01.09.2026, same mechanism now also on zufallsverteilung-lod): if the
// FIRST successful tracking is lost again within the ~3s ground-plane
// lead-in, the tutorial resets so the NEXT tracking starts it fresh from
// the beginning; once the lead-in has fully played out, `tutorialLockedIn`
// flips true and tracking loss no longer resets anything.
let tutorialRunToken = 0;
const tutorialLockedIn = ref(false);
// True until the very first tracking of the whole session — independent
// of the resettable lead-in state above (this only ever goes false once).
const awaitingFirstTracking = ref(true);
// The six spheres (and the orbit lights around them) only exist once the
// lead-in has fully played out (author's request, 01.09.2026: "Kugeln
// sollten erst vorhanden sein nach Tutorial-Lead-in") — same mechanism as
// zufallsverteilung-lod's own `fieldVisible`. The ground plane itself is
// NOT gated by this (stays visible throughout, per the footprint
// convention every branch already follows).
const sceneContentVisible = ref(false);

const trackingHintStyle = {
  position: 'fixed' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  padding: '3vw 5vw',
  background: 'rgba(0, 0, 0, 0.5)',
  color: '#ffffff',
  fontFamily: TUTORIAL_FONT_FAMILY,
  fontSize: '4.5vw',
  textAlign: 'center' as const,
  zIndex: 1000,
  pointerEvents: 'none' as const
} as const;
const FULL_RANGE_MS = 3500; // slower than zufallsverteilung-lod's own 2500 (01.09.2026, author's request)
// Fixed durations of the tutorial's reflection-checkbox demo phase (s.
// runTutorial() below and reflectionCheckboxTopPercent above) — no value
// to sweep here. MOVE is how long the checkbox itself takes to slide to/
// from screen centre (the OFF state lasts exactly this long each way,
// since it stays off for the whole move — author's spec, 01.09.2026); HOLD
// is the stationary "on" stretch at centre in between, long enough to
// actually notice the reflections.
const REFLECTION_CHECKBOX_MOVE_MS = 1200;
const REFLECTION_DEMO_HOLD_MS = 2400;
function segmentDuration(from: number, to: number, fullRange: number): number {
  return (Math.abs(to - from) / fullRange) * FULL_RANGE_MS;
}

const TEXT_SLIDE_DISTANCE_PX = 40;
const TEXT_SLIDE_MS = 400;
const tutorialTextSlideOffset = ref(-TEXT_SLIDE_DISTANCE_PX);
function showTutorialText(text: string) {
  tutorialText.value = text;
  tutorialTextSlideOffset.value = -TEXT_SLIDE_DISTANCE_PX;
  animateValue(tutorialTextSlideOffset, -TEXT_SLIDE_DISTANCE_PX, 0, TEXT_SLIDE_MS);
}

async function runTutorial(myToken: number) {
  const cancelled = () => tutorialRunToken !== myToken;
  const finishedIntro1 = await cancellableFade(groundOpacity, 0, 1, GROUND_INTRO_SEGMENT_MS, cancelled);
  if (!finishedIntro1) return;
  const finishedIntro2 = await cancellableFade(groundOpacity, 1, STANDARD_GROUND_OPACITY, GROUND_INTRO_SEGMENT_MS, cancelled);
  if (!finishedIntro2) return;
  tutorialLockedIn.value = true;
  sceneContentVisible.value = true;

  const roughnessStart = roughness.value;
  const metalnessStart = metalness.value;

  // Phase 1: vertical swipe -> roughness. One extra leading step (author's
  // request, 01.09.2026) — animates INTO 100% from the standard value
  // first, instead of snapping straight there, so the very first move is
  // visible too.
  metalness.value = 20;
  showTutorialText('Vertikaler Swipe ↕️ = Rauheit');
  await animateValue(roughness, roughnessStart, 100, segmentDuration(roughnessStart, 100, 100));
  await animateValue(roughness, 100, 0, segmentDuration(100, 0, 100));
  await animateValue(roughness, 0, roughnessStart, segmentDuration(0, roughnessStart, 100));

  // Phase 2: horizontal swipe -> metalness, roughness co-animating
  // alongside it (s. Skript-Kommentar oben), reflection-probe forced on for
  // the duration. Roughness's down-leg no longer restores it back to
  // roughnessStart here (author's correction, 01.09.2026: "am Ende der
  // Metallizitäts-Abschnitt muss der Rauheitswert nicht wieder auf
  // Standardwert hochgezogen werden, das kann am Anfang von Hold
  // passieren") — it's left at METALNESS_PHASE_ROUGHNESS_LOW, picked up
  // from exactly there by Phase 2.5 below, and only actually restored once,
  // at the start of Phase 3.
  const METALNESS_PHASE_ROUGHNESS_LOW = 10;
  const reflectionWasEnabled = reflectionEnabled.value;
  reflectionEnabled.value = true;
  showTutorialText('Horizontaler Swipe ↔️ = Metallizität');
  const metalnessUpMs = segmentDuration(20, 100, 100);
  await Promise.all([
    animateValue(metalness, 20, 100, metalnessUpMs),
    animateValue(roughness, roughnessStart, METALNESS_PHASE_ROUGHNESS_LOW, metalnessUpMs)
  ]);
  const metalnessDownMs = segmentDuration(100, metalnessStart, 100);
  await animateValue(metalness, 100, metalnessStart, metalnessDownMs);
  reflectionEnabled.value = reflectionWasEnabled;

  // Phase 2.5: reflection checkbox explanation (author's request,
  // 01.09.2026, "nach der metalness erklärung") — a fixed-duration demo
  // (off, then on) for the checkbox itself, but the reflection EFFECT is
  // only actually visible at high metalness/low roughness (s.
  // reflection-probe.ts). Metalness re-animates up from its own standard
  // value; roughness only needs a small nudge from
  // METALNESS_PHASE_ROUGHNESS_LOW (where phase 2 left it, s. its own
  // comment above) to REFLECTION_DEMO_ROUGHNESS, not a big round trip
  // through roughnessStart.
  const REFLECTION_DEMO_METALNESS = 100;
  const REFLECTION_DEMO_ROUGHNESS = 20;
  showTutorialText('Häkchen Reflektionen ☑️ = Spiegelungen');
  const reflectionDemoInMs = segmentDuration(metalnessStart, REFLECTION_DEMO_METALNESS, 100);
  await Promise.all([
    animateValue(metalness, metalnessStart, REFLECTION_DEMO_METALNESS, reflectionDemoInMs),
    animateValue(roughness, METALNESS_PHASE_ROUGHNESS_LOW, REFLECTION_DEMO_ROUGHNESS, reflectionDemoInMs)
  ]);
  // Checkbox move/off/on/off sequence (author's spec, 01.09.2026, replaces
  // an earlier fixed-timing off/on/off with a separate emoji overlay the
  // author didn't like) — OFF explicitly first (not just trusting the
  // restore above, since the checkbox is a plain DOM control the visitor
  // could already have toggled themselves during an earlier phase — it
  // isn't gated by tutorialInputLocked like swipe/hold are), staying off
  // for the checkbox's own move-to-centre animation, ON once centred and
  // actually held there, OFF again for the move back down. The
  // explanatory text is hidden for both moves (s. Phase 2.5's own header
  // comment above) and re-shown (sliding back in via showTutorialText)
  // once the checkbox is stationary again at centre.
  reflectionEnabled.value = false;
  tutorialText.value = '';
  await animateValue(reflectionCheckboxTopPercent, REFLECTION_CHECKBOX_REST_TOP_PERCENT, REFLECTION_CHECKBOX_CENTER_TOP_PERCENT, REFLECTION_CHECKBOX_MOVE_MS);
  reflectionEnabled.value = true;
  showTutorialText('Häkchen Reflektionen ☑️ = Spiegelungen');
  await new Promise<void>((resolve) => setTimeout(resolve, REFLECTION_DEMO_HOLD_MS));
  reflectionEnabled.value = false;
  tutorialText.value = '';
  await animateValue(reflectionCheckboxTopPercent, REFLECTION_CHECKBOX_CENTER_TOP_PERCENT, REFLECTION_CHECKBOX_REST_TOP_PERCENT, REFLECTION_CHECKBOX_MOVE_MS);

  // Phase 3: hold -> emissive. Reflection is already off from Phase 2.5's
  // own final step above, so nothing further to do for it here. Roughness/
  // metalness animate back to their standard values here (author's
  // follow-up spec: "am Anfang des Holds Abschnitts dann wieder zurück auf
  // Standardwerte") — this phase's own emissive demo doesn't need the
  // reflection-demo's exaggerated metalness/roughness either.
  const reflectionDemoOutMs = segmentDuration(REFLECTION_DEMO_METALNESS, metalnessStart, 100);
  await Promise.all([
    animateValue(metalness, REFLECTION_DEMO_METALNESS, metalnessStart, reflectionDemoOutMs),
    animateValue(roughness, REFLECTION_DEMO_ROUGHNESS, roughnessStart, reflectionDemoOutMs)
  ]);
  showTutorialText('Finger halten ✋ = Leuchten');
  await animateValue(emissive, 0, 100, segmentDuration(0, 100, 100));
  await animateValue(emissive, 100, 0, segmentDuration(100, 0, 100));

  tutorialText.value = '';
  tutorialInputLocked.value = false;
}

function onTutorialTrackingFound() {
  awaitingFirstTracking.value = false;
  if (tutorialLockedIn.value) return; // already played through once — never resets again
  tutorialRunToken += 1;
  const myToken = tutorialRunToken;
  groundOpacity.value = 0;
  sceneContentVisible.value = false;
  tutorialInputLocked.value = true;
  runTutorial(myToken);
}

function onTutorialTrackingLost() {
  if (tutorialLockedIn.value) return; // locked in — tracking loss no longer resets anything
  tutorialRunToken += 1; // invalidates any in-flight runTutorial() via cancelled()
  groundOpacity.value = 0;
  tutorialText.value = '';
  tutorialInputLocked.value = true;
}

const tutorialTextStyle = computed(() => ({
  position: 'fixed' as const,
  bottom: '25%',
  left: '50%',
  whiteSpace: 'nowrap' as const,
  transform: `translate(-50%, ${tutorialTextSlideOffset.value}px)`,
  padding: '2vw 3vw',
  background: 'rgba(0, 0, 0, 0.5)',
  color: '#ffffff',
  fontFamily: TUTORIAL_FONT_FAMILY,
  fontSize: '4vw',
  textAlign: 'center' as const,
  zIndex: '1000',
  pointerEvents: 'none' as const
}));

// "Tutorial" header (01.09.2026, author's request) — same 25% distance
// from the TOP edge as the instruction label above has from the bottom,
// shown for the exact same duration (both gated on tutorialText being
// non-empty). No slide-in of its own — it's a static label naming the
// whole sequence, not a per-phase instruction that needs to draw the eye
// each time it changes.
const tutorialHeaderStyle = {
  position: 'fixed' as const,
  top: '25%',
  left: '50%',
  transform: 'translateX(-50%)',
  whiteSpace: 'nowrap' as const,
  padding: '2vw 3vw',
  background: 'rgba(0, 0, 0, 0.5)',
  color: '#ffffff',
  fontFamily: TUTORIAL_FONT_FAMILY,
  fontSize: '4vw',
  textAlign: 'center' as const,
  zIndex: 1000,
  pointerEvents: 'none' as const
} as const;

onMounted(() => {
  ensureTutorialFontLoaded();
  detachSwipeDrag = attachSwipeDrag(
    (dx) => {
      if (tutorialInputLocked.value || swipeSuppressedThisSession) return;
      metalness.value = clamp(metalness.value + dx * SWIPE_SENSITIVITY, 0, 100);
      registerEmissiveMovement(dx);
    },
    // -dy: swiping UP (negative screen dy) increases roughness, matching
    // zufallsverteilung-lod's "nach oben = mehr" convention.
    (dy) => {
      if (tutorialInputLocked.value || swipeSuppressedThisSession) return;
      roughness.value = clamp(roughness.value - dy * SWIPE_SENSITIVITY, 0, 100);
      registerEmissiveMovement(dy);
    },
    () => {
      if (tutorialInputLocked.value) return;
      swipeSuppressedThisSession = false; // fresh gesture — reset the sticky block from any earlier hold
      emissiveHoldWasConfirmed = false;
      emissiveMoveAccumPx = 0;
      emissiveSwipeCancelled = false;
      emissiveHeld = true;
      emissiveHoldStartTime = performance.now();
      ensureEmissiveRamping();
    },
    () => {
      if (tutorialInputLocked.value) return;
      emissiveHeld = false;
      ensureEmissiveRamping();
    }
  );
  imageTargetEl.value?.addEventListener('xrextrasfound', onTutorialTrackingFound);
  imageTargetEl.value?.addEventListener('xrextraslost', onTutorialTrackingLost);
});

onUnmounted(() => {
  detachSwipeDrag?.();
  imageTargetEl.value?.removeEventListener('xrextrasfound', onTutorialTrackingFound);
  imageTargetEl.value?.removeEventListener('xrextraslost', onTutorialTrackingLost);
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
  <xrextras-named-image-target name="video-target" ref="imageTargetEl">
    <a-entity
        no-frustum-cull
        :visible="assetsLoaded"
    >

      <!-- Three point lights orbiting the scene at different speed/direction/
           height, pink/turquoise/white bottom to top (device testing,
           30.08.2026 onward, s. Skript-Kommentar oben für die Orbit-Mechanik).
           Direction alternates by height, not just pairwise: pink (lowest)
           counter-clockwise, turquoise (middle) clockwise, white (highest,
           01.09.2026, replaces the deleted spotlight) counter-clockwise again
           — opposite to turquoise, the light immediately below it, per
           author's spec. castShadow (31.08.2026, "Schlagschatten sollten
           aktiviert sein") — A-Frame's light component keeps its own shadow
           config directly on this same `light=` string, separate from the
           per-mesh `shadow` component used below on the spheres/ground.
           shadowBias (01.09.2026, s. SHADOW_BIAS oben) fixes shadow-acne
           artifacts on the spheres. `spin` (01.09.2026, replaces the old
           fixed-duration `animation` component, s. Skript-Kommentar bei
           spinAttr) speeds these orbits up live on camera-proximity and on
           a hold, in sync with the helix's own spin below. -->
      <a-entity :position="`0 0 ${ORBIT_HEIGHT}`" :spin="orbitPinkSpinAttr">
        <a-entity :light="`type: point; color: #ff2d95; intensity: 1.3; castShadow: true; shadowBias: ${SHADOW_BIAS}`" :position="`${ORBIT_RADIUS} 0 0`"></a-entity>
      </a-entity>
      <a-entity :position="`0 0 ${ORBIT_HEIGHT_TURQUOISE}`" :spin="orbitTurquoiseSpinAttr">
        <a-entity :light="`type: point; color: #1fd6c1; intensity: 1.3; castShadow: true; shadowBias: ${SHADOW_BIAS}`" :position="`${ORBIT_RADIUS} 0 0`"></a-entity>
      </a-entity>
      <a-entity :position="`0 0 ${ORBIT_HEIGHT_WHITE}`" :spin="orbitWhiteSpinAttr">
        <a-entity :light="`type: point; color: #ffffff; intensity: 0.8; castShadow: true; shadowBias: ${SHADOW_BIAS}`" :position="`${ORBIT_RADIUS} 0 0`"></a-entity>
      </a-entity>

      <!-- Material-/Shader-Showcase (archive-of-practice
           projects/an-alle/concepts/material-shader-showcase.md) — sechs
           farbige KUGELN auf einer Helix um eine senkrechte Achse
           gestaffelt, in Größe und Farbe (Zitronengelb → Hot Pink), jede
           tangential auf der nächstgrößeren aufsitzend (s. Skript-
           Kommentar oben). Kein Unlit mehr — alle sechs reagieren auf
           Licht und werfen/empfangen Schlagschatten (`shadow` je Kugel).
           Cutout-Dither alterniert über die Staffelung (f/d/b Alpha-Fade,
           e/c/a Proximity-Cutout mit je einem anderen ditherType) statt auf
           drei benachbarten Kugeln zu liegen. `#showcase-spin` dreht die
           GESAMTE Gruppe fortwährend um die eigene senkrechte (Welt-Z-)Achse
           (31.08.2026) — liegt bewusst AUSSERHALB von `#showcase`s
           `rotation="90 0 0"` (Footprint-Koordinatenumrechnung, keine
           Komponenten-Achsen-Kompensation), genau wie die beiden
           Orbit-Licht-Pivots oben, mit denen sie sich die reale
           Z-Rotationskonvention teilt. Kein `:key` mehr nötig —
           roughness/metalness/opacity aktualisieren sich jetzt alle live
           über bestehendes update() (s. Skript-Kommentar oben); render-
           order-Komponente und Nummern-Labels ersatzlos entfernt
           (01.09.2026), da nicht mehr relevant. `spin` (01.09.2026, ersetzt
           die alte, feste `animation`-Komponente) beschleunigt die Drehung
           live bei Kameranähe und während eines Holds (s. Skript-Kommentar
           bei spinAttr). `:visible="sceneContentVisible"` (01.09.2026,
           Autor-Wunsch: "Kugeln sollten erst vorhanden sein nach Tutorial-
           Lead-in") hält die gesamte Kugel-Helix bis zum Ende des ~3s
           Grundflächen-Lead-ins unsichtbar — die Grundfläche selbst bleibt
           davon unberührt (Footprint-Konvention). -->
      <a-entity id="showcase-spin" :spin="helixSpinAttr" :visible="sceneContentVisible">
        <a-entity id="showcase" rotation="90 0 0">

          <!-- A (kleinste) — Proximity Cutout, ditherType interleaved-gradient. -->
          <a-entity :position="itemPosition(0)" :proximity-cutout="cutoutAttr(0, 'interleaved-gradient')">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(0)}`"
                :material="itemMaterial(0)"
                :material-properties="materialPropsAttr"
                @object3dset="emitModelLoadedOnMesh"
                shadow>
            </a-entity>
          </a-entity>

          <!-- B — normale Alpha-Transparenz. -->
          <a-entity :position="itemPosition(1)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(1)}`"
                :material="itemMaterial(1)"
                :material-properties="materialPropsAttr"
                :proximity-opacity="proximityOpacityAttr('material-properties')"
                shadow>
            </a-entity>
          </a-entity>

          <!-- C — Proximity Cutout, ditherType noise. -->
          <a-entity :position="itemPosition(2)" :proximity-cutout="cutoutAttr(2, 'noise')">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(2)}`"
                :material="itemMaterial(2)"
                :material-properties="materialPropsAttr"
                @object3dset="emitModelLoadedOnMesh"
                shadow>
            </a-entity>
          </a-entity>

          <!-- D — normale Alpha-Transparenz. -->
          <a-entity :position="itemPosition(3)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(3)}`"
                :material="itemMaterial(3)"
                :material-properties="materialPropsAttr"
                :proximity-opacity="proximityOpacityAttr('material-properties')"
                shadow>
            </a-entity>
          </a-entity>

          <!-- E — Proximity Cutout, ditherType bayer. -->
          <a-entity :position="itemPosition(4)" :proximity-cutout="cutoutAttr(4, 'bayer')">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(4)}`"
                :material="itemMaterial(4)"
                :material-properties="materialPropsAttr"
                @object3dset="emitModelLoadedOnMesh"
                shadow>
            </a-entity>
          </a-entity>

          <!-- F (größte) — normale Alpha-Transparenz. -->
          <a-entity :position="itemPosition(5)">
            <a-entity
                :geometry="`primitive: sphere; radius: ${sphereRadius(5)}`"
                :material="itemMaterial(5)"
                :material-properties="materialPropsAttr"
                :proximity-opacity="proximityOpacityAttr('material-properties')"
                shadow>
            </a-entity>
          </a-entity>

        </a-entity>
      </a-entity>

      <!-- reflection-probe (01.09.2026, author's request: "auch andere
           Objekte sollen sich in metallischem Material spiegeln", s.
           reflection-probe.ts) — eigene Entity statt Attribut direkt auf
           `#showcase-spin`, damit `v-if` sie beim Umschalten wirklich aus
           dem DOM entfernt/neu anhängt (verlässlicher Weg, eine A-Frame-
           Komponente zur Laufzeit an-/abzuschalten, als nur ihren
           Attributwert auf einer bereits gemounteten Entity zu toggeln).
           `target: #showcase-spin` (attach-to.ts's eigenes Selector-Muster)
           lässt sie die sechs Kugeln dort finden, ohne selbst deren
           Elternteil sein zu müssen. Checkbox dafür s. Template weiter
           unten. Default aus (reflectionEnabled startet bei false). -->
      <a-entity v-if="reflectionEnabled" reflection-probe="target: #showcase-spin"></a-entity>

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
       branch passes its own scene-specific explanation text. Rewritten
       01.09.2026 (Wanderer-Goldstandard): Überschrift, allgemeine
       Einleitung zur AN ALLE!-Plattform, Szenenbeschreibung, dann eine
       übersichtliche Emoji-Gestenliste statt Fließtext — für Leute
       geschrieben, die sich mit der Materie nicht auskennen. -->
  <InfoOverlay
      heading="Material- & Shader-Showcase AR Demo"
      :font-family="TUTORIAL_FONT_FAMILY"
      text="Dies ist eine Demo für die AR-Funktionen unserer AN ALLE!-Plattform. Sie zeigt beispielhaft, was in einer solchen Anwendung möglich ist: Materialien, die live auf deine Eingaben reagieren, und Oberflächen, die sich je nach Nähe der Kamera anders verhalten.

Sechs bunte Kugeln kreisen übereinander gestaffelt auf dem Bild. Drei von ihnen werden komplett durchsichtig, je näher du mit der Kamera kommst; die anderen drei öffnen stattdessen ein kleines, gemustertes Loch genau an der Stelle, wo die Kamera gerade ist.

So kannst du mitspielen:
↕️ Hoch/runter wischen: wie rau oder glatt die Kugeln wirken
↔️ Links/rechts wischen: wie metallisch die Kugeln wirken
✋ Gedrückt halten: die Kugeln beginnen zu leuchten
☑️ Häkchen Reflektionen: Spiegelungen in den Kugeln ein-/ausschalten" />

  <!-- Reflection-Toggle (01.09.2026, author's request) — plain screen-space
       checkbox, not an A-Frame component/GuiPanel control (s. Skript-
       Kommentar bei reflectionEnabled oben für die Begründung). Default
       aus, da reflection-probe.ts laufend eine Cube-Map rendert. -->
  <label :style="reflectionToggleStyle">
    <input type="checkbox" v-model="reflectionEnabled" />
    Reflektionen
  </label>

  <!-- Kamera-Hinweis (backported from animationssystem-wanderer,
       01.09.2026) — shown until the very first successful tracking of the
       whole session, independent of the resettable tutorial-lead-in state
       below. -->
  <div v-if="awaitingFirstTracking" :style="trackingHintStyle">Kamera auf Image Target richten!</div>

  <!-- Tutorial-animation text label (s. Skript-Kommentar, runTutorial()) —
       screen-centred, only rendered while a tutorial phase is showing. -->
  <div v-if="tutorialText" :style="tutorialTextStyle">{{ tutorialText }}</div>

  <!-- "Tutorial" header, same visibility condition as the instruction
       label above (01.09.2026, author's request). -->
  <div v-if="tutorialText" :style="tutorialHeaderStyle">Tutorial</div>
</template>
