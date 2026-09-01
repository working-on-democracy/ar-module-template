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

// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md) — Version 2
// (30.08.2026, s. archive-of-practice projects/an-alle/fragen.md, Frage 10):
// a bounded square field (random-field's new `areaDepth`, s.
// random-field.ts/RANDOM-FIELD-FEATURE-GUIDE.md) sized as a % of the
// target image's own footprint, filled to a % density instead of exposing
// areaWidth/copies/minDistance/maxDistance directly (replaces this
// project's own earlier Version 1 "kein Algorithmus-Umbau" simplification).
//
// Footprint convention (s. sound-player's own ArModule.vue and
// guides/IMAGE-TRACKING-FEATURE-GUIDE.md) — the tracked image is the
// scene's ground plane. `random-field`/`proximity-swing` (like
// `wander-in-band`) assume the older three.js/A-Frame default (X/Z ground,
// Y height) rather than the convention's X/Y ground, Z height, so the
// field/prop group below sits inside ONE compensating `rotation: 90 0 0`
// wrapper (same technique as proximity-effekte/animationssystem-wanderer):
// authored X/Z-ground/Y-height inside maps onto the real footprint's
// X/Y-ground/Z-height outside. FOOTPRINT_MIN_SIDE (not the raw
// FOOTPRINT_WIDTH/FOOTPRINT_DEPTH) bounds the field so a 100%-size square
// field fits inside the image on BOTH axes, whichever is narrower.
const targetProps = (manifest.imageTargets?.[0] as { properties?: { width: number; height: number } } | undefined)?.properties;
const FOOTPRINT_DEPTH = 1; // the engine always normalizes the target's local Y extent to 1
const FOOTPRINT_WIDTH = targetProps ? targetProps.width / targetProps.height : 0.75; // local X extent, from the target's own aspect ratio
const FOOTPRINT_MIN_SIDE = Math.min(FOOTPRINT_WIDTH, FOOTPRINT_DEPTH);

// The prop is now a single sphere (LOD/billboard removed 31.08.2026 — added
// little to this scene and was hard to demonstrate) — its radius is the old
// room-scale bud radius (tuned for a 6m reference field) times PROP_SCALE, a
// direct proportional shrink to the image target's own much smaller
// physical size.
const PROP_SCALE = FOOTPRINT_MIN_SIDE / 6;
// Ground-plane radius of a placed prop — the density/spacing calc below and
// proximity-swing's own colour/motion attributes both need this.
const PROP_FOOTPRINT_RADIUS = 0.14 * PROP_SCALE;
// Grid nodes per side, hard-capped regardless of density (rendering
// budget — the jittered-grid algorithm itself is cheap regardless of `n`,
// unlike the old Poisson-disk's per-point candidate search). 14 → 196
// props — high enough that "almost touching" at max density actually
// holds for large field sizes too (author's call, 31.08.2026: at a small
// field size this cap is never hit; at a large field size + max density,
// the "touching" guarantee below now costs up to ~196 clones instead of
// silently loosening the spacing at 49 as it used to).
const MAX_GRID_NODES_PER_SIDE = 14;

const FIELD_SIZE_MIN = 20;
const FIELD_SIZE_MAX = 100;
// Raised above the mathematical midpoint (author's call, 31.08.2026 — the
// midpoint didn't read as visually "medium", the density/field-size scales
// aren't linear-aesthetic) — % of FOOTPRINT_MIN_SIDE.
const fieldSizePercent = ref(75);
const DENSITY_MIN = 10;
const DENSITY_MAX = 90;
// Same reasoning as fieldSizePercent above — s. gridSpacing below for what the extremes guarantee.
const density = ref(65);

// True from mount until the tutorial animation (s. runTutorial() below)
// finishes — declared this early because proximitySwingAttr/fieldKey below
// both need to read it. Double duty: gates swipe input AND freezes every
// placed sphere's own swing/bob/idle motion (proximity-swing's `frozen`
// attribute) so the field reads as a perfectly still, ordered grid while
// the tutorial demonstrates field size/density, instead of visibly
// wobbling on its own at the same time.
const tutorialInputLocked = ref(true);
// False until the tutorial's ground-plane lead-in finishes (s.
// runTutorial()) — the field stays hidden for those ~3s rather than
// popping in before the intro fade has even started.
const fieldVisible = ref(false);

const areaSide = computed(() => FOOTPRINT_MIN_SIDE * (fieldSizePercent.value / 100));

// Density now drives the GRID SPACING directly rather than an area/prop-
// footprint-area ratio (archive-of-practice projects/an-alle/concepts/
// zufallsverteilung-lod.md, "Platzierungsalgorithmus — Version 3",
// 31.08.2026 — the old ratio saturated the copy-count cap well before the
// density range's high end, so most of it did nothing visible). Highest
// density (DENSITY_MAX) → spacing = one prop diameter PLUS a small margin
// (props close but not exactly touching — exact touching would zero out
// proximity-swing's swingRadius below, making its swing motion invisible
// right when density is highest; author's call, 31.08.2026); lowest
// density (DENSITY_MIN) → spacing = the full field side, i.e. a 2×2
// lattice with exactly one prop in each of the field's four corners.
// Linear interpolation between those two spacings by where `density` sits
// in [DENSITY_MIN, DENSITY_MAX].
// proximity-swing's swingRadius = spacing/2 - PROP_FOOTPRINT_RADIUS (s.
// its own computed below) — so spacing = 2R keeps NO swing room at all.
// This fraction of R is added on top so DENSITY_MAX still leaves that much
// swing radius (e.g. 0.3 → 0.3 × R of visible wiggle room).
const MAX_DENSITY_JITTER_FRACTION = 0.3;
const gridSpacing = computed(() => {
  const t = (density.value - DENSITY_MIN) / (DENSITY_MAX - DENSITY_MIN);
  const spacingAtMaxDensity = PROP_FOOTPRINT_RADIUS * 2 * (1 + MAX_DENSITY_JITTER_FRACTION);
  const spacingAtMinDensity = areaSide.value;
  return spacingAtMinDensity + t * (spacingAtMaxDensity - spacingAtMinDensity);
});

// Grid nodes per side implied by that spacing (>= 2 so the low-density
// four-corner case always holds), capped at MAX_GRID_NODES_PER_SIDE — above
// the cap, actual spacing ends up looser than `density` alone would imply
// rather than exceeding the rendering budget.
const gridNodesPerSide = computed(() =>
  Math.min(MAX_GRID_NODES_PER_SIDE, Math.max(2, Math.round(areaSide.value / gridSpacing.value) + 1))
);
const targetCopies = computed(() => gridNodesPerSide.value * gridNodesPerSide.value);

// elevation: PROP_FOOTPRINT_RADIUS lifts every sphere so it sits ON the
// ground plane (tangent to it), not centred AT it — a sphere centred at
// y=0 would have its lower half clipped into the ground (author's
// correction, 31.08.2026; the earlier LOD/billboard prop never showed this
// since its meshes were already authored above y=0).
const randomFieldAttr = computed(
  () => `items: #prop; areaWidth: ${areaSide.value.toFixed(3)}; areaDepth: ${areaSide.value.toFixed(3)}; ` +
        `elevation: ${PROP_FOOTPRINT_RADIUS.toFixed(4)}; copies: ${targetCopies.value}`
);

// proximity-swing (archive-of-practice projects/an-alle/concepts/
// zufallsverteilung-lod.md, "Proximity-Swing" decision, 31.08.2026) —
// replaces both the old randomness-driven static jitter (random-field no
// longer bakes any offset, see randomFieldAttr above) and proximity-rise.
// swingRadius mirrors the same "grid spacing / 2 - own radius" calc that
// random-field's own jitter radius used to do internally, just computed
// here and driven live instead of baked into a placed position.
// colorMaxDist is the field's own half-diagonal, so the radial colour
// gradient always spans exactly from this field's centre to its actual
// edge regardless of current field size. targetHalfWidth feeds
// proximity-swing's own screen-coverage measurement (s.
// proximity-swing.ts's targetCoverage()) — half of the SAME footprint
// width the ground plane below is actually sized to, so the measurement
// matches the real printed target exactly. zBobHeightMax/Min are fixed
// fractions of the field's own MAXIMUM possible edge length
// (FOOTPRINT_MIN_SIDE, s. its own comment above — not the prop's radius,
// and not the CURRENT, live-changing areaSide) — author's correction,
// 31.08.2026: unlike swingRadius (which genuinely has to shrink with
// density/grid spacing to keep neighbouring props from overlapping), the
// vertical height has no overlap risk to guard against, so tying its size
// to density/field-size at all was pointless coupling; a fixed physical-
// scale reference is the right basis instead. Direction inverted the same
// day (s. proximity-swing.ts's own comment): highest at zBobFar (15cm),
// sinking toward the ground the closer the camera gets. proximityCoverageNear/Far,
// zBobNear/Far, idleGroundRadius/idleHeightRadius and the two colours stay
// on the component's own schema defaults — no GUI/scene-specific override
// needed for those (targetSelector's own default, #ground, already matches
// the ground plane's id below).
const swingRadius = computed(() => Math.max(0, gridSpacing.value / 2 - PROP_FOOTPRINT_RADIUS));
const colorMaxDist = computed(() => Math.SQRT1_2 * areaSide.value);
const zBobHeightMax = FOOTPRINT_MIN_SIDE / 4;
const zBobHeightMin = FOOTPRINT_MIN_SIDE / 10;

// Chaos-Modus (archive-of-practice projects/an-alle/concepts/
// zufallsverteilung-lod.md, "Chaos-Modus" Entscheidung, 01.09.2026, analog
// zum animationssystem-wanderer-Standard: dort "Chaos-Boost") — ein Hold
// maximiert die Schwing-/Bob-/Idle-Animation jeder platzierten Kugel
// (proximity-swing's neues `chaosBoost`). Bewusst NICHT Feldgröße/Dichte
// (Autor-Korrektur, 01.09.2026: "Hold darf nicht die Feldgröße und Dichte
// beeinflussen") — nur die Bewegung selbst wird wilder, die Anordnung der
// Kugeln bleibt exakt die, die zuletzt per Swipe gesetzt wurde.
const CHAOS_HOLD_DELAY_MS = 700;
// Reverse of swipeSuppressedThisSession below (01.09.2026, author's
// correction: "Eine Swipe Geste sollte nicht in eine Hold Geste übergehen,
// wenn der Finger noch zu lange auf dem Display gehalten wird") — a real
// swipe must cancel a still-PENDING (not yet confirmed) hold outright, or
// simply stopping mid-swipe without lifting the finger would let
// CHAOS_HOLD_DELAY_MS quietly elapse afterwards and activate Chaos-Modus
// on what was clearly meant as a swipe. Same threshold/shape already used
// for the opposite direction on this same gesture pair, and for the
// analogous emissive-hold gesture in material-shader-showcase.
const CHAOS_SWIPE_CANCEL_PX = 6;
const chaosActive = ref(false);
let chaosConfirmTimer: number | null = null;
let chaosHoldConfirmed = false;
let chaosMoveAccumPx = 0;
let chaosSwipeCancelled = false;
let swipeSuppressedThisSession = false;

function onChaosHoldStart() {
  if (tutorialInputLocked.value) return;
  swipeSuppressedThisSession = false; // fresh gesture — reset the sticky block from any earlier hold
  chaosHoldConfirmed = false;
  chaosMoveAccumPx = 0;
  chaosSwipeCancelled = false;
  chaosConfirmTimer = window.setTimeout(() => {
    chaosHoldConfirmed = true;
    swipeSuppressedThisSession = true; // block a swipe from this same gesture once released
    chaosActive.value = true;
  }, CHAOS_HOLD_DELAY_MS);
}

function onChaosHoldEnd() {
  if (chaosConfirmTimer !== null) {
    window.clearTimeout(chaosConfirmTimer);
    chaosConfirmTimer = null;
  }
  if (chaosHoldConfirmed) {
    chaosActive.value = false;
    chaosHoldConfirmed = false;
  }
}

// Fed from the same dx/dy swipe callbacks that already drive density/
// fieldSizePercent — accumulates movement while a hold-confirm timer is
// still pending, and cancels that timer outright once it crosses
// CHAOS_SWIPE_CANCEL_PX (a no-op once already confirmed or already
// cancelled, s. the early return below).
function registerChaosMovement(deltaPx: number) {
  if (chaosSwipeCancelled || chaosHoldConfirmed || chaosConfirmTimer === null) return;
  chaosMoveAccumPx += Math.abs(deltaPx);
  if (chaosMoveAccumPx > CHAOS_SWIPE_CANCEL_PX) {
    chaosSwipeCancelled = true;
    window.clearTimeout(chaosConfirmTimer);
    chaosConfirmTimer = null;
  }
}

const proximitySwingAttr = computed(
  () => `swingRadius: ${swingRadius.value.toFixed(4)}; colorMaxDist: ${colorMaxDist.value.toFixed(4)}; ` +
        `targetHalfWidth: ${(FOOTPRINT_WIDTH / 2).toFixed(4)}; ` +
        `zBobHeightMax: ${zBobHeightMax.toFixed(4)}; zBobHeightMin: ${zBobHeightMin.toFixed(4)}; ` +
        // frozen also unfreezes while chaosActive is true (not just once the
        // tutorial fully ends) — the only time that combination happens
        // DURING the tutorial is its own hold/Chaos-Modus demo phase below,
        // deliberately un-freezing the grid for exactly that phase so the
        // boosted motion is actually visible; after the tutorial ends,
        // tutorialInputLocked is already false, so this term is moot for
        // the real, visitor-triggered hold.
        `frozen: ${tutorialInputLocked.value && !chaosActive.value}; chaosBoost: ${chaosActive.value ? 1 : 0}`
);

const lightPosition = `${(FOOTPRINT_WIDTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 1.5).toFixed(3)}`;
const lightConfig = `type: directional; intensity: 1; target: #lightTarget; castShadow: true; shadowMapHeight: 2048; shadowMapWidth: 2048; shadowCameraTop: ${FOOTPRINT_DEPTH}; shadowCameraBottom: ${-FOOTPRINT_DEPTH}; shadowCameraRight: ${FOOTPRINT_DEPTH}; shadowCameraLeft: ${-FOOTPRINT_DEPTH}; shadowRadius: 4`;
// Animated 0 -> 1 -> STANDARD_GROUND_OPACITY as the tutorial's own lead-in
// (s. runTutorial() below) — starts at 0 (invisible) until that animation
// runs, rather than showing the ground at its standard opacity immediately.
const STANDARD_GROUND_OPACITY = 0.35;
const groundOpacity = ref(0);
const groundMaterial = computed(() => `color: #3b82f6; opacity: ${groundOpacity.value}; side: double`);

// random-field places its clones once in init() (a one-shot procedural
// generation, not a per-frame effect) — it defines no update() handler, so
// changing its DOM attribute reactively (the pattern proximity-effekte/
// animationssystem-wanderer use for their own, genuinely per-tick
// components) would update density/fieldSizePercent without touching the
// actual scene. A Vue `:key` tied to both forces a full unmount/remount of
// the field on any change instead — the standard Vue technique for
// "re-run a one-shot child from scratch" — so a swipe gesture genuinely
// re-scatters the field with the new parameters. proximity-swing itself
// needs no remount even though it also reacts to swingRadius/colorMaxDist —
// those only change together with density/fieldSizePercent anyway, so the
// remount this key already triggers re-initializes it with fresh values.
// tutorialInputLocked is also included so the frozen <-> live motion
// transition always gets a remount exactly when it toggles, even on the
// rare tick where fieldSizePercent/density don't ALSO happen to change at
// that same instant. chaosActive is included for the same reason as
// swingRadius/colorMaxDist above, just the other way round: proximity-
// swing's `chaosBoost` (s. Chaos-Modus comment below) is baked into each
// clone ONCE at random-field's own clone time, not live-bound — so toggling
// it needs an explicit remount of its own, even though it no longer changes
// density/fieldSizePercent at all (01.09.2026 correction).
const fieldKey = computed(() => `${fieldSizePercent.value}-${density.value}-${tutorialInputLocked.value}-${chaosActive.value}`);

// Swipe-driven density/field-size (archive-of-practice projects/an-alle/
// concepts/zufallsverteilung-lod.md, "Swipe statt Regler" decision,
// 31.08.2026) — replaces the GUI sliders above with a relative/incremental
// screen drag (see swipe-drag.ts for why relative, not absolute-position,
// mapping): horizontal = density, vertical = field size, up/right = more.
// SWIPE_PX_FOR_FULL_RANGE needs at least two comfortable drags to cover the
// whole range (author's call, 31.08.2026 — one drag covering the full
// range gave too little control), while still being shorter than a full
// screen drag — several partial drags cover the whole range, so nothing is
// ever pinned to a screen edge the way the old sliders were pinned to
// their track ends.
const SWIPE_PX_FOR_FULL_RANGE = 600;
const DENSITY_PER_PX = (DENSITY_MAX - DENSITY_MIN) / SWIPE_PX_FOR_FULL_RANGE;
const FIELD_SIZE_PER_PX = (FIELD_SIZE_MAX - FIELD_SIZE_MIN) / SWIPE_PX_FOR_FULL_RANGE;
let detachSwipeDrag: (() => void) | null = null;

// Tutorial animation (archive-of-practice projects/an-alle/concepts/
// zufallsverteilung-lod.md, "Tutorial-Animation" decision, 31.08.2026) —
// plays once, on the FIRST successful image recognition (`xrextrasfound`,
// fired by `xrextras-named-image-target` itself — s. the vendored
// `@8thwall/xrextras` source; already pre-filtered to THIS named target,
// no need to check event.detail), since swiping no longer has any visible
// GUI to hint at what it does. Leads in with the ground plane's own
// opacity (0 -> 100% -> its standard value, ~3s — s. groundOpacity above),
// which doubles as the delay before the tutorial itself starts (no
// separate timer needed, the lead-in animation's own duration IS the
// delay) — the sphere field itself stays hidden for that whole lead-in
// (`fieldVisible`, s. above), only appearing once phase 1 actually begins.
// Then two back-to-back phases, each a bottom-anchored text label naming
// the gesture while its own attribute sweeps through waypoints and back:
// field size (MIN -> MAX -> its own start value, density held constant),
// then density (its own start value -> MAX -> 30 -> back to start, field
// size held at its now-real start value — asymmetric waypoints, author's
// explicit choice, 31.08.2026, not a MIN/MAX mirror of the field-size
// phase). Every placed sphere is held frozen (motionless grid, s.
// proximity-swing.ts's `frozen` attribute) for the ENTIRE sequence,
// including the lead-in, so its own swing/bob/idle motion can't visually
// compete with the field-size/density demo. `tutorialInputLocked` blocks
// swipe input for the same whole sequence so a real drag can't fight it.
const tutorialText = ref('');
const imageTargetEl = ref<HTMLElement | null>(null);
const GROUND_INTRO_SEGMENT_MS = 1500; // x2 = 3s lead-in/delay, author's spec

// Resettable tutorial lead-in (archive-of-practice projects/an-alle/
// concepts/zwischen-basis.md, backported from animationssystem-wanderer,
// 01.09.2026): if the FIRST successful tracking is lost again within the
// ~3s ground-plane lead-in, the whole tutorial resets so the NEXT tracking
// starts the lead-in and tutorial fresh from the beginning; once the
// lead-in has fully played out, `tutorialLockedIn` flips true and tracking
// loss no longer resets anything. `tutorialRunToken` is an incrementing
// "run identity" — cancellableFade's `isCancelled` predicate below simply
// checks whether the token it captured when it started is still current,
// so a stale, still-in-flight lead-in from a previous run can never write
// into a newer one's state.
let tutorialRunToken = 0;
const tutorialLockedIn = ref(false);
// True until the very first tracking of the whole session — drives the
// "Kamera auf Bild richten" hint below, independent of the resettable
// lead-in state above (this only ever goes false once, the first time
// tracking succeeds at all).
const awaitingFirstTracking = ref(true);

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

// Segment durations are PROPORTIONAL to how much of the value's own full
// range that segment actually covers (author's spec, 31.08.2026 — makes
// every segment move at the same underlying speed, so a short hop, e.g.
// field size MAX -> its own start value, plays proportionally faster than
// a full-range sweep instead of taking the same fixed time regardless of
// distance). FULL_RANGE_MS is how long a segment spanning a value's ENTIRE
// declared range takes; any shorter segment is scaled down by exactly the
// fraction of that range it covers.
const FULL_RANGE_MS = 2500;
function segmentDuration(from: number, to: number, fullRange: number): number {
  return (Math.abs(to - from) / fullRange) * FULL_RANGE_MS;
}
// Fixed length of the tutorial's own hold/Chaos-Modus demo (s. runTutorial()
// below) — no value sweep to derive a duration from here, same order of
// magnitude as a FULL_RANGE_MS segment.
const CHAOS_DEMO_MS = 2500;

// Slides each label down into its resting position (s. tutorialTextStyle
// below) rather than just appearing there — plain inline-style transform
// animation via tween.ts's animateValue, not a CSS transition/@keyframes
// (a <style> block never ships to the host, see asset-loading-overlay.ts's
// own comment on the same constraint). Not awaited when triggered — purely
// cosmetic, shouldn't hold up the actual value-sweep timing.
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
  fieldVisible.value = true;

  const fieldRange = FIELD_SIZE_MAX - FIELD_SIZE_MIN;
  const fieldSizeStart = fieldSizePercent.value;
  fieldSizePercent.value = FIELD_SIZE_MIN;
  showTutorialText('Vertikaler Swipe ↕️ = Feldgröße');
  await animateValue(fieldSizePercent, FIELD_SIZE_MIN, FIELD_SIZE_MAX, segmentDuration(FIELD_SIZE_MIN, FIELD_SIZE_MAX, fieldRange));
  await animateValue(fieldSizePercent, FIELD_SIZE_MAX, fieldSizeStart, segmentDuration(FIELD_SIZE_MAX, fieldSizeStart, fieldRange));

  const densityRange = DENSITY_MAX - DENSITY_MIN;
  const densityStart = density.value;
  const DENSITY_TUTORIAL_WAYPOINT = 30;
  showTutorialText('Horizontaler Swipe ↔️ = Dichte');
  await animateValue(density, densityStart, DENSITY_MAX, segmentDuration(densityStart, DENSITY_MAX, densityRange));
  await animateValue(density, DENSITY_MAX, DENSITY_TUTORIAL_WAYPOINT, segmentDuration(DENSITY_MAX, DENSITY_TUTORIAL_WAYPOINT, densityRange));
  await animateValue(density, DENSITY_TUTORIAL_WAYPOINT, densityStart, segmentDuration(DENSITY_TUTORIAL_WAYPOINT, densityStart, densityRange));

  // Phase 3 (hold/Chaos-Modus, 01.09.2026, s. Chaos-Modus-Kommentar oben) —
  // no value to sweep here (Feldgröße/Dichte bleiben bewusst unberührt),
  // just a fixed-duration demo hold: chaosActive briefly forces the grid's
  // `frozen` off (s. proximitySwingAttr above) and its own `chaosBoost` on,
  // so the boosted swing/idle motion is visible for CHAOS_DEMO_MS before
  // settling back to the still, frozen grid for the rest of this instant.
  showTutorialText('Gedrückt halten ✋ = Chaos-Modus');
  chaosActive.value = true;
  await new Promise<void>((resolve) => setTimeout(resolve, CHAOS_DEMO_MS));
  chaosActive.value = false;

  tutorialText.value = '';
  tutorialInputLocked.value = false;
}

function onTutorialTrackingFound() {
  awaitingFirstTracking.value = false;
  if (tutorialLockedIn.value) return; // already played through once — never resets again
  tutorialRunToken += 1;
  const myToken = tutorialRunToken;
  groundOpacity.value = 0;
  fieldVisible.value = false;
  tutorialInputLocked.value = true;
  runTutorial(myToken);
}

function onTutorialTrackingLost() {
  if (tutorialLockedIn.value) return; // locked in — tracking loss no longer resets anything
  tutorialRunToken += 1; // invalidates any in-flight runTutorial() via cancelled()
  groundOpacity.value = 0;
  fieldVisible.value = false;
  tutorialText.value = '';
  tutorialInputLocked.value = true;
}

// Bottom-anchored (25% up from the bottom edge, author's spec), white text
// on a 50%-opacity black box, sharp corners (deliberately not the
// InfoOverlay panel's rounded look, this is a fleeting instruction, not a
// persistent UI surface). Single line, no fixed box width (author's spec,
// 31.08.2026 — a fixed 66vw box risked wrapping to two lines depending on
// the label's own length) — `whiteSpace: nowrap` forces one line and the
// box auto-sizes tightly to it, with a screen-relative font size tuned so
// that single line lands at roughly 66% of the viewport width for either
// of this scene's two labels (both a similar length).
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

// "Tutorial" header (01.09.2026, author's request, ported over from
// material-shader-showcase's own tutorial) — same 25% distance from the
// TOP edge as the instruction label above has from the bottom, shown for
// the exact same duration (both gated on tutorialText being non-empty). No
// slide-in of its own — it's a static label naming the whole sequence, not
// a per-phase instruction that needs to draw the eye each time it changes.
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
      density.value = Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, density.value + dx * DENSITY_PER_PX));
      registerChaosMovement(dx);
    },
    (dy) => {
      if (tutorialInputLocked.value || swipeSuppressedThisSession) return;
      // Screen Y grows downward, so swiping UP (negative dy) should grow the field.
      fieldSizePercent.value = Math.min(FIELD_SIZE_MAX, Math.max(FIELD_SIZE_MIN, fieldSizePercent.value - dy * FIELD_SIZE_PER_PX));
      registerChaosMovement(dy);
    },
    onChaosHoldStart,
    onChaosHoldEnd
  );
  imageTargetEl.value?.addEventListener('xrextrasfound', onTutorialTrackingFound);
  imageTargetEl.value?.addEventListener('xrextraslost', onTutorialTrackingLost);
});

onUnmounted(() => {
  detachSwipeDrag?.();
  imageTargetEl.value?.removeEventListener('xrextrasfound', onTutorialTrackingFound);
  imageTargetEl.value?.removeEventListener('xrextraslost', onTutorialTrackingLost);
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
      <!-- What the directional light below aims at — the footprint's own
           centre/ground (s. sound-player's ArModule.vue). -->
      <a-entity id="lightTarget" position="0 0 0"></a-entity>

      <!-- Directional light that casts shadows onto the ground plane below.
           Positioned above the scene (elevated in Z — the footprint
           convention's height axis), aimed at #lightTarget. Shadow camera
           bounds sized to the image's own footprint, not a room-scale
           guess. -->
      <a-entity :position="lightPosition" :light="lightConfig" shadow></a-entity>

      <a-light type="ambient" intensity="0.7"></a-light>

      <!-- Zufallsverteilung & LOD (archive-of-practice
           projects/an-alle/concepts/zufallsverteilung-lod.md) — LOD/
           billboard removed 31.08.2026 (added little to this scene, hard
           to demonstrate); prop is now a single sphere, coloured once per
           clone by [proximity-swing] itself (radial gradient, s.
           proximity-swing.ts), not authored here. `:key="fieldKey"` forces
           a full field regeneration on a swipe-driven density/field-size
           change (s. Skript-Kommentar). `rotation="90 0 0"` is the
           compensating rotation from the script block above — random-
           field/proximity-swing's native X/Z-ground, Y-height authoring
           maps onto the real footprint's X/Y-ground, Z-height outside this
           wrapper. `:visible="fieldVisible"` keeps the field hidden during
           the tutorial's ~3s ground-plane lead-in (s. runTutorial()). -->
      <a-entity rotation="90 0 0" :key="fieldKey" :visible="fieldVisible">

        <!-- Prop template — hidden by random-field once cloned. All motion
             (radial swing/vertical bob/idle float) and its own colour come
             from [proximity-swing] (own Entscheidung, 31.08.2026,
             replacing proximity-rise + random-field's old randomness-baked
             jitter — s. Skript-Kommentar and proximity-swing.ts), cloned
             onto every placed copy along with it. -->
        <a-entity
            id="prop"
            :geometry="`primitive: sphere; radius: ${PROP_FOOTPRINT_RADIUS}`"
            material="color: #ffffff"
            :proximity-swing="proximitySwingAttr">
        </a-entity>

        <a-entity :random-field="randomFieldAttr"></a-entity>

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

  <!-- No GuiPanel in this scene (removed 31.08.2026) — density/field size
       are swipe-driven (s. Skript-Kommentar, swipe-drag.ts), not GUI
       sliders. -->

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

  <!-- AN ALLE! Zwischen-Basis: shared info button + overlay, replacing the
       raycast-driven context-text idea for every Themenfeld except
       Sound-Player (s. projects/an-alle/concepts/sound-player.md). Each
       branch passes its own scene-specific explanation text. Rewritten
       01.09.2026 (Wanderer-Goldstandard): Überschrift, allgemeine
       Einleitung zur AN ALLE!-Plattform, Szenenbeschreibung, dann eine
       übersichtliche Emoji-Gestenliste statt Fließtext — für Leute
       geschrieben, die sich mit der Materie nicht auskennen. -->
  <InfoOverlay
      heading="Zufallsverteilung & Animation AR Demo"
      :font-family="TUTORIAL_FONT_FAMILY"
      text="Dies ist eine Demo für die AR-Funktionen unserer AN ALLE!-Plattform. Sie zeigt beispielhaft, was in einer solchen Anwendung möglich ist: eine Anordnung von Objekten, die sich live und zufällig verändern lässt und die auf die Nähe der Kamera reagiert.

Ein Feld aus kleinen, bunten Kugeln liegt auf dem Bild. Wie viele Kugeln es sind und wie groß das Feld ist, kannst du direkt verändern. Kommst du mit der Kamera näher heran, beginnen die Kugeln sanft zu schwingen und zu hüpfen.

So kannst du mitspielen:
↕️ Hoch/runter wischen: Feldgröße ändern
↔️ Links/rechts wischen: Dichte ändern
✋ Gedrückt halten: Chaos-Modus — die Kugeln bewegen sich für einen Moment besonders wild" />
</template>
