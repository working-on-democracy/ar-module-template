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

// AN ALLE! Animationssystem Wanderer (archive-of-practice
// projects/an-alle/concepts/animationssystem-wanderer.md) — Sound-Player-
// Integration + Swipe/Proximity/Hold-Umbau (01.09.2026, Autor-
// Entscheidungen, ersetzt die vorherige GUI-Regler-Fassung, die noch von
// vor dem "Bedienfeld weg"-Kurswechsel stammte, s. zwischen-basis.md):
//
//   - Zentrale Figur vorübergehend ein statisches Primitive (kein Rig, kein
//     trim-loop-clip mehr) — der Rig-Umbau folgt in einer späteren Sitzung,
//     MainCharacter3.glb bleibt unangetastet in src/assets/ liegen.
//   - Vertikaler Swipe -> outerRadius, horizontaler Swipe -> innerRadius
//     (statt eines gemeinsamen Zwei-Schieber-Reglers) — beide Zielwerte
//     werden nicht direkt auf die Wanderer angewandt, sondern über
//     bandInner/bandOuter sanft angenähert (s. stepGestures unten), damit
//     ein schneller Bandsprung die Wanderer nicht springen lässt, sondern
//     wander-in-band's eigene Rückkehr-Logik + diese Glättung zusammen ein
//     Hineinziehen ergeben statt eines Sprungs.
//   - Halten (ohne nennenswerte Bewegung) -> chaos steigt für alle fünf
//     Wanderer gemeinsam (additiv auf ihre je eigene, schon vorher
//     authored Baseline) — identische Hold-Erkennung wie
//     material-shader-showcases Emissive-Halte-Geste (Delay, damit ein
//     Tap/Swipe-Beginn nicht sofort als Hold zählt; Abbruch bei zu viel
//     Bewegung), s. attachSwipeDrag/swipe-drag.ts.
//   - Kameranähe zur Mitte (#mainEntity) -> Wanderer-Tempo (neue,
//     rückwärtskompatible speedProximity*-Attribute auf wander-in-band.ts
//     selbst, s. dort) — kein eigener Tempo-Regler mehr.
//   - Farbschema: Mitte zitronengelb, die fünf Wanderer schrittweise
//     Richtung Hot Pink, in der ursprünglichen Anordnung (0°/72°/144°/
//     216°/288°) im Uhrzeigersinn durchnummeriert (hergeleitet aus der
//     rotation="90 0 0"-Wrapper-Matrix unten: ein innen steigender Winkel
//     bildet außen auf eine im Uhrzeigersinn laufende Bewegung ab — noch
//     nicht am Gerät gegen die tatsächliche Kamera-Perspektive bestätigt).
//   - Jeder Wanderer besteht jetzt aus 3 überlappenden Kopien seines
//     eigenen Primitives (statt einem einzelnen), entlang der lokalen
//     +Z-Achse gestaffelt — das ist bereits die Bewegungsrichtung
//     (wander-in-band setzt rotation.y exakt auf die Heading, "forward"
//     ist per Klassenkommentar dort +Z), ergibt einen kurzen "Wurm" mit
//     sichtbarer Richtung, kein zusätzliches Rotations-Mapping nötig.
//     Segment-Größe entsprechend kleiner als die frühere Einzelkörper-
//     Größe (sonst wirkt der Wurm 3x so groß wie vorher), mit leichtem
//     Farbverlauf innerhalb der 3 Segmente (Kopf leicht Richtung Pink,
//     Heck leicht Richtung Gelb — willkürliche, aber konsistente Wahl).
//   - Sound-Player-Funktionen (archive-of-practice
//     projects/an-alle/concepts/sound-player.md) integriert: zwei
//     Klangquellen (statisch/wandernd), aber NUR Tap (kein 2D-Panel, kein
//     eigener Restart/Stop-Button) — sound-controller.ts's handleTap()
//     deckt Play/Pause/Resume/Quellwechsel bereits vollständig ohne GUI
//     ab (Tap auf dieselbe Kugel pausiert/setzt fort, Tap auf die andere
//     stoppt die alte und startet die neue).
//
// Footprint convention (s. sound-player's own ArModule.vue and
// guides/IMAGE-TRACKING-FEATURE-GUIDE.md) — the tracked image is the
// scene's ground plane. `wander-in-band` (like `random-field`/
// `proximity-rise`) assumes the older three.js/A-Frame default (X/Z
// ground, Y height) rather than the convention's X/Y ground, Z height,
// so the central primitive and the wanderer group sit inside ONE
// compensating `rotation: 90 0 0` wrapper below (same technique as
// proximity-effekte) — authored X/Z-ground/Y-height inside maps onto the
// real footprint's X/Y-ground/Z-height outside. The two sound sources
// below sit OUTSIDE that wrapper instead, unrotated, exactly like
// sound-player's own ArModule.vue — their built-in A-Frame `animation`
// component already orbits around Z (the footprint's own height/up axis
// outside any wrapper), so no axis compensation is needed there.
const targetProps = (manifest.imageTargets?.[0] as { properties?: { width: number; height: number } } | undefined)?.properties;
const FOOTPRINT_DEPTH = 1; // the engine always normalizes the target's local Y extent to 1
const FOOTPRINT_WIDTH = targetProps ? targetProps.width / targetProps.height : 0.75; // local X extent, from the target's own aspect ratio
const FOOTPRINT_MIN_SIDE = Math.min(FOOTPRINT_WIDTH, FOOTPRINT_DEPTH);

const MAIN_RADIUS = FOOTPRINT_DEPTH * 0.06; // temporary static primitive standing in for the rigged figure, retune once the real model is back
// Up/down bob (Autor-Entscheidung, 01.09.2026, revised twice, same
// session): height 0.75x edge, slowed down, with a 10s rest AT THE GROUND
// every cycle ("eine 10-sekündige Ruhephase jedesmal, wenn der Ball am
// Boden ist") — AND now gated on the figure's own sound ("soll nur
// abspielen, wenn auch der Sound aktiviert wird... friert ein und setzt
// beim nächsten Tap an der gleichen Stelle fort"). A one-shot
// animateValue()/sleep() chain (the first version of this) can't freeze
// and resume mid-phase, so this is a small per-frame phase state machine
// instead: mainBobPhase/mainBobPhaseElapsedMs are plain, non-reactive
// bookkeeping (only mainPositionY itself needs to be a ref, for the
// template binding) that simply stop advancing — not reset — whenever
// mainSoundPlaying is false, s. stepMainBob below. `imageTargetEl`'s
// "start on first xrextrasfound" gate from the previous version is gone:
// with autoplay removed (same session), the figure's sound only ever
// starts on a tap anyway, so gating on ITS OWN play state already covers
// "don't start before the visitor does something", with no separate
// tracking-found trigger needed.
//
// Safe to animate the WRAPPER's position directly (rather than needing a
// separate inner node): wander-in-band's own band-distance calculation
// only ever reads `center.x`/`center.z` (s. wander-in-band.ts tick()) and
// never `center.y` (this wrapper's local Y = the real footprint's Z/height
// axis, s. header comment above), so the 5 wanderers' band GEOMETRY is
// unaffected by the centre bobbing up and down. Its camera-proximity
// SPEED modulation very much was affected, though (device testing,
// 01.09.2026: wanderers visibly sped up as the ball rose) — fixed at the
// source in wander-in-band.ts itself (s. its own speedAnchorWorldPos
// comment), not here.
const MAIN_BOB_HEIGHT = FOOTPRINT_MIN_SIDE * 0.75;
const MAIN_BOB_RISE_MS = 9000;
const MAIN_BOB_FALL_MS = 9000;
const MAIN_BOB_REST_MS = 10000;
const mainPositionY = ref(0);
const mainPosition = computed(() => `0 ${mainPositionY.value.toFixed(4)} 0`);
const mainSoundPlaying = ref(false);
const mainEntityEl = ref<HTMLElement | null>(null);

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

type MainBobPhase = 'rest' | 'rise' | 'fall';
let mainBobPhase: MainBobPhase = 'rest';
let mainBobPhaseElapsedMs = 0;
let mainBobRafId: number | null = null;
let lastMainBobFrameTime = 0;

function stepMainBob(now: number) {
  // Freeze outright (don't even reschedule) the instant the sound isn't
  // playing — whatever mainPositionY/mainBobPhase*/mainBobPhaseElapsedMs
  // currently hold just stay exactly as they are until ensureMainBobRunning()
  // is called again (s. the wander-sound-state-changed listener below).
  if (!mainSoundPlaying.value) {
    mainBobRafId = null;
    return;
  }
  const dt = Math.min(100, Math.max(0, now - lastMainBobFrameTime));
  lastMainBobFrameTime = now;
  mainBobPhaseElapsedMs += dt;

  if (mainBobPhase === 'rest') {
    mainPositionY.value = 0;
    if (mainBobPhaseElapsedMs >= MAIN_BOB_REST_MS) {
      mainBobPhase = 'rise';
      mainBobPhaseElapsedMs -= MAIN_BOB_REST_MS;
    }
  } else if (mainBobPhase === 'rise') {
    const t = Math.min(1, mainBobPhaseElapsedMs / MAIN_BOB_RISE_MS);
    mainPositionY.value = MAIN_BOB_HEIGHT * easeInOutSine(t);
    if (t >= 1) {
      mainBobPhase = 'fall';
      mainBobPhaseElapsedMs -= MAIN_BOB_RISE_MS;
    }
  } else {
    const t = Math.min(1, mainBobPhaseElapsedMs / MAIN_BOB_FALL_MS);
    mainPositionY.value = MAIN_BOB_HEIGHT * (1 - easeInOutSine(t));
    if (t >= 1) {
      mainBobPhase = 'rest';
      mainBobPhaseElapsedMs -= MAIN_BOB_FALL_MS;
    }
  }

  mainBobRafId = requestAnimationFrame(stepMainBob);
}

function ensureMainBobRunning() {
  if (mainBobRafId !== null) return;
  lastMainBobFrameTime = performance.now();
  mainBobRafId = requestAnimationFrame(stepMainBob);
}
// "ganz leichter Abstand vom Boden" (Frage 9) plus an explicit additional
// raise (Autor-Entscheidung, 01.09.2026: "etwas mehr in der Z-Ebene
// angehoben werden") of 1/8 of the footprint's own edge length.
const WANDER_GROUND_OFFSET = FOOTPRINT_DEPTH * 0.03 + FOOTPRINT_MIN_SIDE / 8;

// Band radius bounds (Autor-Entscheidung, 01.09.2026): outerRadius's own
// max now sits slightly PAST the footprint's own half-extent (0.5x) rather
// than staying safely inside it like the old fixed 0.45x — "darf leicht
// über die Bildgrenzen hinauswachsen auf seinem Maximalwert". innerRadius
// gets two independent caps now (revised twice, same session — the author
// found the band could get too thin/too far out, then raised both bounds
// again): a floor of 1/8 edge length (was 0.03x), an absolute ceiling of
// 1/3 + 1/8 edge length (was 1/4, then 1/3), and — together with
// outerRadius — a minimum band THICKNESS of 1/8 edge length, enforced
// mutually in both swipe handlers below (s. onMounted) rather than a single
// one-directional fraction-of-outer clamp like before. Note the new
// ceiling (~0.458x edge) combined with the thickness floor would in theory
// need outerRadius up to ~0.583x edge to ever actually be reached — beyond
// OUTER_RADIUS_MAX (0.52x) — so in practice innerRadius still tops out
// wherever outerRadius currently allows; raise OUTER_RADIUS_MAX too if the
// full new ceiling needs to be reachable.
const OUTER_RADIUS_MIN = FOOTPRINT_MIN_SIDE * 0.2;
const OUTER_RADIUS_MAX = FOOTPRINT_MIN_SIDE * 0.52;
const INNER_RADIUS_MIN = FOOTPRINT_MIN_SIDE / 8;
const INNER_RADIUS_MAX_ABSOLUTE = FOOTPRINT_MIN_SIDE * (1 / 3 + 1 / 8);
const MIN_BAND_THICKNESS = FOOTPRINT_MIN_SIDE / 8;

// Segment size per worm (was the single wanderer's own size before the
// 3-copy worm redesign, 01.09.2026; shrunk further in the same session —
// author's device-test feedback: they stuck together too easily and had
// too little room in the band).
const WANDER_OBJECT_SIZE = FOOTPRINT_DEPTH * 0.05 * 0.6 * 0.6;
const WORM_SEGMENT_SPACING = WANDER_OBJECT_SIZE * 1.15; // < 2x radius, so neighbouring segments visibly overlap

// AN ALLE! shared colour scheme (lemon yellow -> hot pink, s. proximity-
// motion.ts's own colorInner/colorOuter defaults) — central figure = the
// scheme's own start, the 5 wanderers step evenly toward its end.
const COLOR_CENTER = '#FFF44F'; // lemon yellow
const COLOR_EDGE = '#FF69B4'; // hot pink
const WANDERER_COUNT = 5;

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
// Slight per-segment gradient within one wanderer's 3-copy worm — head
// (leading, +Z-most) shifted a little toward pink, tail a little toward
// yellow, mid segment at the wanderer's own exact base colour.
const SEGMENT_COLOR_SHIFT = 0.06;
function segmentColor(index: number, segment: 'head' | 'mid' | 'tail'): string {
  const base = index / (WANDERER_COUNT - 1);
  const shift = segment === 'head' ? SEGMENT_COLOR_SHIFT : segment === 'tail' ? -SEGMENT_COLOR_SHIFT : 0;
  return lerpHexColor(COLOR_CENTER, COLOR_EDGE, clamp01(base + shift));
}

// Static seed positions only — wander-in-band takes over every entity's
// position/rotation every tick based on the LIVE innerRadius/outerRadius
// below, so these just need to start somewhere reasonable on the band, one
// wanderer per fifth of the circle.
function seedPosition(angleDeg: number): string {
  const seedRadius = (bandInnerTarget.value * 0.6 + bandOuterTarget.value * 0.9) / 2;
  const rad = (angleDeg * Math.PI) / 180;
  return `${(seedRadius * Math.cos(rad)).toFixed(3)} ${WANDER_GROUND_OFFSET.toFixed(3)} ${(seedRadius * Math.sin(rad)).toFixed(3)}`;
}

const lightPosition = `${(FOOTPRINT_WIDTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 0.3).toFixed(3)} ${(FOOTPRINT_DEPTH * 1.5).toFixed(3)}`;
const lightConfig = `type: directional; intensity: 1; target: #lightTarget; castShadow: true; shadowMapHeight: 2048; shadowMapWidth: 2048; shadowCameraTop: ${FOOTPRINT_DEPTH}; shadowCameraBottom: ${-FOOTPRINT_DEPTH}; shadowCameraRight: ${FOOTPRINT_DEPTH}; shadowCameraLeft: ${-FOOTPRINT_DEPTH}; shadowRadius: 4`;
// Ground opacity is now reactive (was a plain string) — the tutorial's own
// lead-in (s. runTutorial below) fades it 0 -> 1 -> its standard value,
// same idiom as zufallsverteilung-lod/material-shader-showcase's own
// tutorials.
const STANDARD_GROUND_OPACITY = 0.35;
const groundOpacity = ref(0);
const groundMaterial = computed(() => `color: #3b82f6; opacity: ${groundOpacity.value.toFixed(3)}; side: double`);
const ringMaterial = computed(() => `color: #ffffff; opacity: ${ringOpacity.value.toFixed(3)}; transparent: true; side: double`);

// Sound integration, take 2 (Autor-Entscheidung, 01.09.2026: "die Wanderer
// sind die neuen Soundquellen", NOT separate sound-player-style tap
// spheres — the earlier sound-player-ported entities are gone). Each of
// the 5 wanderers gets its own [sound] (a distinct sine-tone clip per
// wanderer, s. WANDERER_SOUND_ASSET_IDS) + [ar-button] (tap zone) +
// [wander-sound] (play/pause toggle + colour/pulse reaction, s.
// wander-sound.ts — deliberately NOT sound-controller.ts's single-active
// mutex, since several must be able to play at once).
//
// Spatial audio radius (revised, 01.09.2026 — Autor-Korrektur: the earlier
// "4x the wanderer's own bounding box" reading made maxDistance far too
// small in absolute terms): stepping into an imaginary cube extending up
// from the footprint's own square ground must already put you in range of
// every wanderer's sound, so maxDistance is now ~1 edge length
// (FOOTPRINT_MIN_SIDE) instead of a few times the worm's own tiny bounding
// radius — a cube's farthest corner from its own centre is <1 full edge
// length away, comfortably inside that. refDistance/rolloffFactor loosened
// to match (a much larger max range with the old tight near-field falloff
// would have made most of that range nearly inaudible).
//
// distanceModel switched linear -> inverse (Autor-Entscheidung, 01.09.2026:
// "können wir auch ein anderes Falloff-Modell nehmen?" — linear's strictly
// straight-line falloff between refDistance/maxDistance read as an
// unnaturally large jump for a small tweak to either endpoint, since human
// hearing is roughly logarithmic, not linear). inverse is Web Audio's own
// default distance model and the classic physically-based falloff — falls
// off quickly near the source, then gently; unlike linear/exponential it
// does NOT reach true silence at maxDistance, staying at a constant faint
// volume beyond it instead (distance is clamped to maxDistance, not the
// gain) — accepted as the intended tradeoff for a warmer, more natural
// curve.
const WANDERER_BOUNDING_RADIUS = WORM_SEGMENT_SPACING + WANDER_OBJECT_SIZE; // still used for the tap zone below
const SOUND_REF_DISTANCE = FOOTPRINT_MIN_SIDE * 0.2;
const SOUND_MAX_DISTANCE = FOOTPRINT_MIN_SIDE * 0.7;
// Extra long-range mute fade (Autor-Entscheidung, 01.09.2026), layered on
// top of the panner's own inverse falloff via wander-sound.ts's own
// muteFadeStart/End — inverse alone never reaches true silence past
// SOUND_MAX_DISTANCE, so this gives an explicit, separate hard cutoff
// further out (full volume up to 1.5 edge lengths, linearly down to
// exactly silent at 3).
const SOUND_MUTE_FADE_START = FOOTPRINT_MIN_SIDE * 0.6;
const SOUND_MUTE_FADE_END = FOOTPRINT_MIN_SIDE * 2;
const WANDERER_SOUND_ASSET_IDS = [
  'wanderer-sound-1',
  'wanderer-sound-2',
  'wanderer-sound-3',
  'wanderer-sound-4',
  'wanderer-sound-5'
];
function wanderSoundSrcAttr(index: number): string {
  return `src: #${WANDERER_SOUND_ASSET_IDS[index]}; positional: true; distanceModel: inverse; ` +
         `refDistance: ${SOUND_REF_DISTANCE.toFixed(4)}; rolloffFactor: 1; maxDistance: ${SOUND_MAX_DISTANCE.toFixed(4)}; ` +
         `loop: true; autoplay: false`;
}
// zoneSize is inert under tapSelection: screen-space (s. template below —
// ar-button-manager skips its own raycast/zone tick entirely in that mode)
// but kept anyway: ar-button's OWN near/far distance-fade tick still runs
// independently of the manager, and a real zoneSize is harmless either way.
const wanderButtonAttr = (() => {
  const zone = (WANDERER_BOUNDING_RADIUS * 2.5).toFixed(4);
  return `zoneSize: ${zone} ${zone} ${zone}`;
})();
const wanderSoundAttr = `segmentSelector: .worm-segment; colorNear: ${COLOR_CENTER}; colorFar: ${COLOR_EDGE}; ` +
  `muteFadeStart: ${SOUND_MUTE_FADE_START.toFixed(4)}; muteFadeEnd: ${SOUND_MUTE_FADE_END.toFixed(4)}`;

// Central figure as a 6th spatial sound source (Autor-Entscheidung,
// 01.09.2026: "Innere Kugel soll auch spatial Soundquelle sein... verhält
// sich wie die anderen Soundquellen") — own real loop (archive-of-practice
// inbox/FanB_KD1_Loop1.wav, copied in as wanderer-sound-main.wav), same
// SOUND_REF_DISTANCE/SOUND_MAX_DISTANCE as the wanderers ("sound radius
// wie bei den Wanderern"), same [ar-button]+[wander-sound] wiring — plain
// tap-to-start like every other source (autoplay dropped again, same
// session: "bitte doch kein Autoplay auf die Sphere, normale Klick-
// Aktivierung"), only the tap zone size differs (MAIN_RADIUS-based
// instead of a worm's bounding radius).
const mainSoundSrcAttr = `src: #wanderer-sound-main; positional: true; distanceModel: inverse; ` +
  `refDistance: ${SOUND_REF_DISTANCE.toFixed(4)}; rolloffFactor: 1; maxDistance: ${SOUND_MAX_DISTANCE.toFixed(4)}; ` +
  `loop: true; autoplay: false`;
const mainButtonAttr = (() => {
  const zone = (MAIN_RADIUS * 2.5).toFixed(4);
  return `zoneSize: ${zone} ${zone} ${zone}`;
})();
const mainWanderSoundAttr = `segmentSelector: .worm-segment; colorNear: ${COLOR_CENTER}; colorFar: ${COLOR_EDGE}; ` +
  `muteFadeStart: ${SOUND_MUTE_FADE_START.toFixed(4)}; muteFadeEnd: ${SOUND_MUTE_FADE_END.toFixed(4)}`;

// wander-in-band's `speed` is in units/second, not a ratio — the old 0.35
// default was tuned for a 6–12m room-scale band; rescaled by the same
// ratio as the radius itself (s. the branch's own device-testing history
// in the archive-of-practice memory for why this scaling matters at all).
const SPEED_SCALE = OUTER_RADIUS_MAX / 12; // 12 = the old room-scale default bandOuter
// Raised 2.2 -> 3.0 (Autor-Korrektur, 01.09.2026: "die Grundgeschwindigkeit
// bei größter Entfernung muss etwas angehoben werden, es ist okay, wenn
// dadurch proportionale Geschwindigkeiten steigen") — this scales BOTH the
// near and far end of the proximity range, so the far/resting speed rises
// as asked, and the near speed proportionally along with it.
const BASE_WANDER_SPEED = 3.0 * SPEED_SCALE; // fixed baseline — proximity now supplies the actual dynamic range, s. below
// Camera-proximity speed range (Autor-Entscheidung: "Proximity: Wanderer-
// Tempo") — closer camera reads as faster. Widened further (Autor-Korrektur,
// same session — the effect was too subtle): near/far multipliers now span
// a full 6x, well within "darf ruhig doppelt oder dreifach so schnell
// werden" relative to the old near multiplier.
const SPEED_PROXIMITY_NEAR = FOOTPRINT_MIN_SIDE * 0.3;
const SPEED_PROXIMITY_FAR = FOOTPRINT_MIN_SIDE * 1.2;
const SPEED_NEAR_MULTIPLIER = 3.5;
const SPEED_FAR_MULTIPLIER = 0.5;

// Swipe-set GOAL values (jump instantly on every pointermove) vs. the
// actual, SMOOTHED values fed to wander-in-band below (eased toward the
// goal every frame by stepGestures) — the explicit "flüssig hineinziehen,
// nicht abrupt springen" requirement. Initial values: comfortable band
// roughly matching the old GUI defaults.
const bandOuterTarget = ref(OUTER_RADIUS_MAX * 0.75);
const bandInnerTarget = ref(OUTER_RADIUS_MAX * 0.75 * 0.4);
const bandOuter = ref(bandOuterTarget.value);
const bandInner = ref(bandInnerTarget.value);

const wander1Position = seedPosition(0);
const wander2Position = seedPosition(72);
const wander3Position = seedPosition(144);
const wander4Position = seedPosition(216);
const wander5Position = seedPosition(288);

// Each wanderer keeps its own authored chaos/floatIntensity/yawOffset
// baseline (variety, per Fanyu_module's original relative proportions,
// floatIntensity itself rescaled to the footprint's own small physical
// size) — chaosBoost.value (0..CHAOS_BOOST_MAX, driven by the hold
// gesture, s. stepGestures below) adds on top of every wanderer's own
// baseline, clamped to the schema's own 0..1 ceiling. Raised to 0.9
// (Autor-Korrektur, same session — a full hold now pushes every wanderer
// to (or right at) chaos=1, wander-in-band's own ceiling, regardless of
// how low that wanderer's own baseline is — the previous 0.6 left the
// lowest baseline (0.1) capped well under 1).
const CHAOS_BOOST_MAX = 0.9;
const chaosBoost = ref(0);
// Speed push accompanying the chaos push (Autor-Entscheidung, 01.09.2026:
// "damit der Chaos-Push eindeutiger wird, muss damit auch ein Speed-Push
// einhergehen... verdoppele den momentanen Speed") — ramps in perfect
// tandem with chaosBoost (same holdConfirmed target/timing in
// stepGestures below), reaching 1.0 (i.e. a 2x multiplier, s. wanderAttr)
// at full hold. Multiplies BASE_WANDER_SPEED itself rather than being a
// separate wander-in-band attribute — since proximitySpeedNear/Far/
// multipliers inside wander-in-band.ts scale `data.speed` again on top,
// doubling the value sent here doubles whatever the CURRENT (proximity-
// modulated) speed happens to be, exactly as asked, without needing to
// know that current value here at all.
const SPEED_BOOST_MAX = 1;
const speedBoost = ref(0);

// Each wanderer's own speed is only at 100% while its OWN sound is playing
// — halved while paused (Autor-Entscheidung, 01.09.2026: "Wanderer sollen
// ihre normale Geschwindigkeit nur haben, wenn sie Sound spielen... ist
// der Sound pausiert, ist ihre Geschwindigkeit halbiert"). Bridged from
// wander-sound.ts's own "wander-sound-state-changed" emit (s. onMounted
// below) into these 5 plain refs — index-matched to wander1Attr..
// wander5Attr/wander1El..wander5El.
const SOUND_PAUSED_SPEED_MUL = 0.5;
const wandererPlaying = [ref(false), ref(false), ref(false), ref(false), ref(false)];
const wander1El = ref<HTMLElement | null>(null);
const wander2El = ref<HTMLElement | null>(null);
const wander3El = ref<HTMLElement | null>(null);
const wander4El = ref<HTMLElement | null>(null);
const wander5El = ref<HTMLElement | null>(null);

// Compensates the sound-paused 0.5x speed penalty above during the
// tutorial (Autor-Entscheidung, 01.09.2026: "während der Tutorial-
// Demonstration muss die Geschwindigkeit temporär verdoppelt werden, da
// sie ja durch den Pausen-Status halbiert ist, aber sonst die Prinzipien
// nicht sichtbar genug sind") — nothing has been tapped yet during the
// tutorial, so every wanderer is still at SOUND_PAUSED_SPEED_MUL; this
// multiplies that back out to a net 1x for the sequence's duration (s.
// runTutorial below), purely so the demonstrated chaos/speed/band changes
// read clearly, same as they will once a visitor actually taps something.
const TUTORIAL_SPEED_MUL = 1 / SOUND_PAUSED_SPEED_MUL;
const tutorialSpeedMul = ref(1);

// Wanderers were wedging into each other instead of bouncing off (Autor-
// Entscheidung, 01.09.2026: "sie verkeilen sich gerade gerne ineinander")
// — wander-in-band.ts's own sibling-separation radius is tuned for its
// old room-scale default, too tight for this branch's small, densely
// packed worms; this new, backward-compatible multiplier (default 1 for
// every other consumer) widens it here specifically. Raised again (2.5 ->
// 4, same session — still happening at 2.5).
const SEPARATION_RADIUS_MULTIPLIER = 4;

// Float (vertical bob) is now subtler at rest — half the previous
// baseline — and the hold gesture's chaos boost raises it back up to that
// original value at full boost (Autor-Entscheidung, 01.09.2026: "halb so
// stark im Normalzustand, aber der Chaos-Boost erhöht sie auf den
// jetzigen Wert"). `floatIntensity` arguments passed to wanderAttr below
// are unchanged — they're now the CEILING (at chaosBoost === CHAOS_BOOST_MAX),
// not the resting value.
const FLOAT_INTENSITY_REST_FRACTION = 0.5;

function wanderAttr(index: number, chaosBase: number, floatIntensity: number, yawOffset = 0): string {
  const soundSpeedMul = wandererPlaying[index].value ? 1 : SOUND_PAUSED_SPEED_MUL;
  const floatBoostFrac = chaosBoost.value / CHAOS_BOOST_MAX; // 0 at rest, 1 at full chaos boost
  const floatMul = FLOAT_INTENSITY_REST_FRACTION + (1 - FLOAT_INTENSITY_REST_FRACTION) * floatBoostFrac;
  return `center: #mainEntity; innerRadius: ${bandInner.value.toFixed(4)}; outerRadius: ${bandOuter.value.toFixed(4)}; ` +
         `floatIntensity: ${(floatIntensity * floatMul).toFixed(4)}; speed: ${(BASE_WANDER_SPEED * (1 + speedBoost.value) * soundSpeedMul * tutorialSpeedMul.value).toFixed(4)}; ` +
         `chaos: ${Math.min(1, chaosBase + chaosBoost.value).toFixed(3)}; ` +
         `speedProximityNear: ${SPEED_PROXIMITY_NEAR.toFixed(4)}; speedProximityFar: ${SPEED_PROXIMITY_FAR.toFixed(4)}; ` +
         `speedNearMultiplier: ${SPEED_NEAR_MULTIPLIER}; speedFarMultiplier: ${SPEED_FAR_MULTIPLIER}; ` +
         `separationRadiusMultiplier: ${SEPARATION_RADIUS_MULTIPLIER}` +
         (yawOffset ? `; yawOffset: ${yawOffset}` : '');
}

const wander1Attr = computed(() => wanderAttr(0, 0.15, FOOTPRINT_DEPTH * 0.025));
const wander2Attr = computed(() => wanderAttr(1, 0.1, FOOTPRINT_DEPTH * 0.025));
const wander3Attr = computed(() => wanderAttr(2, 0.21, FOOTPRINT_DEPTH * 0.025));
const wander4Attr = computed(() => wanderAttr(3, 0.12, FOOTPRINT_DEPTH * 0.02, 90));
const wander5Attr = computed(() => wanderAttr(4, 0.18, FOOTPRINT_DEPTH * 0.03, 180));

// --- Gestures: swipe -> band radii (smoothed), hold -> chaos boost ---
// (archive-of-practice projects/an-alle/concepts/zwischen-basis.md,
// "Swipe + Proximity statt GUI"; hold mechanics ported from
// material-shader-showcase's press-and-hold emissive boost, s. header
// comment above and swipe-drag.ts's own onHoldStart/onHoldEnd.)
const SWIPE_PX_FOR_FULL_RANGE = 600; // same convention as zufallsverteilung-lod/material-shader-showcase
const OUTER_RADIUS_PER_PX = (OUTER_RADIUS_MAX - OUTER_RADIUS_MIN) / SWIPE_PX_FOR_FULL_RANGE;
const INNER_RADIUS_PER_PX = (INNER_RADIUS_MAX_ABSOLUTE - INNER_RADIUS_MIN) / SWIPE_PX_FOR_FULL_RANGE;
const BAND_SMOOTH_RATE = 6; // exponential approach rate (1/s-ish) — visibly eased, still settles within well under a second
const HOLD_DELAY_MS = 1000; // same as material-shader-showcase's emissive hold — a deliberate hold, not an instant reaction to touching down
const HOLD_RAMP_MS = 2000;
const HOLD_RAMP_RATE = CHAOS_BOOST_MAX / HOLD_RAMP_MS;
const HOLD_SWIPE_CANCEL_PX = 6; // same threshold as material-shader-showcase — a real swipe cancels the hold outright

// Ring visualisation while a gesture manipulates the band (Autor-
// Entscheidung, 01.09.2026): a translucent annulus directly over the
// ground fades in for the whole touch session (not just once a swipe is
// confirmed — showing it immediately on touch-down is fine, since it
// disappears again just as fast if the touch turns out not to move) and
// fades out once the gesture ends. Bound to the swipe-set TARGET radii,
// not the smoothed display radii, so the ring reacts exactly as fast as
// the finger, even while the wanderers themselves are still easing in.
const RING_OPACITY_MAX = 0.4;
// Minimal lift off the ground plane (Autor-Entscheidung, 01.09.2026) —
// purely to avoid z-fighting with #ground, not a real height difference.
const RING_Z_LIFT = FOOTPRINT_DEPTH * 0.004;
const RING_OPACITY_SMOOTH_RATE = 10;
const ringOpacityTarget = ref(0);
const ringOpacity = ref(0);

let holdActive = false;
let holdStartTime = 0;
let holdMoveAccumPx = 0;
let holdSwipeCancelled = false;
let gestureRafId: number | null = null;
let lastGestureFrameTime = 0;
// Sticky per-touch-session flag (Autor-Entscheidung, 01.09.2026: "während
// eine Hold-Geste ausgeführt wird, sollte es nicht möglich sein in einen
// Swipe überzugehen, dafür muss erst losgelassen werden") — once a hold
// has actually been CONFIRMED (past HOLD_DELAY_MS, chaos/speed boost
// engaged) in the CURRENT touch, dx/dy stop affecting the band for the
// rest of THIS session, even once the hold itself gets cancelled by
// further movement (which still stops the chaos/speed ramp as before —
// that part is unrelated). Only reset on the next pointerdown (s.
// onHoldStart below), so a genuinely fresh, unambiguous swipe still works
// immediately.
let swipeSuppressedThisSession = false;

// Mutual band clamps (s. constants above): innerRadius never exceeds its
// own absolute ceiling NOR crowds outerRadius closer than the minimum band
// thickness; outerRadius never drops closer to innerRadius than that same
// thickness. Each is called right after its OWN axis was just swiped —
// the other axis's CURRENT target is pushed outward only far enough to
// keep the constraint, never yanked past its own min/max bounds.
function clampInnerTarget() {
  bandInnerTarget.value = Math.min(
    bandInnerTarget.value,
    INNER_RADIUS_MAX_ABSOLUTE,
    bandOuterTarget.value - MIN_BAND_THICKNESS
  );
}
function clampOuterTarget() {
  bandOuterTarget.value = Math.max(bandOuterTarget.value, bandInnerTarget.value + MIN_BAND_THICKNESS);
}

function registerHoldMovement(deltaPx: number) {
  if (holdSwipeCancelled || !holdActive) return;
  holdMoveAccumPx += Math.abs(deltaPx);
  if (holdMoveAccumPx > HOLD_SWIPE_CANCEL_PX) {
    holdSwipeCancelled = true;
    holdActive = false;
  }
}

function stepGestures(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - lastGestureFrameTime) / 1000));
  lastGestureFrameTime = now;

  // Band radii: ease the displayed value toward whatever swipe last set as
  // the goal, rather than jumping straight to it.
  const smoothing = 1 - Math.exp(-BAND_SMOOTH_RATE * dt);
  bandOuter.value += (bandOuterTarget.value - bandOuter.value) * smoothing;
  bandInner.value += (bandInnerTarget.value - bandInner.value) * smoothing;

  // Chaos + speed boost: both ramp up only once a hold is confirmed (past
  // the delay, never swipe-cancelled), ramp back down otherwise — same
  // shape as material-shader-showcase's stepEmissive, in lockstep with
  // each other so the speed push makes the chaos push read more clearly.
  const holdConfirmed = holdActive && !holdSwipeCancelled && (now - holdStartTime) >= HOLD_DELAY_MS;
  if (holdConfirmed) swipeSuppressedThisSession = true;
  const chaosTarget = holdConfirmed ? CHAOS_BOOST_MAX : 0;
  const chaosDelta = HOLD_RAMP_RATE * dt * 1000;
  if (chaosBoost.value < chaosTarget) chaosBoost.value = Math.min(chaosTarget, chaosBoost.value + chaosDelta);
  else if (chaosBoost.value > chaosTarget) chaosBoost.value = Math.max(chaosTarget, chaosBoost.value - chaosDelta);

  const speedBoostTarget = holdConfirmed ? SPEED_BOOST_MAX : 0;
  const speedBoostDelta = (SPEED_BOOST_MAX / HOLD_RAMP_MS) * dt * 1000;
  if (speedBoost.value < speedBoostTarget) speedBoost.value = Math.min(speedBoostTarget, speedBoost.value + speedBoostDelta);
  else if (speedBoost.value > speedBoostTarget) speedBoost.value = Math.max(speedBoostTarget, speedBoost.value - speedBoostDelta);

  // Ring opacity: fades toward whatever onHoldStart/onHoldEnd last set.
  const ringSmoothing = 1 - Math.exp(-RING_OPACITY_SMOOTH_RATE * dt);
  ringOpacity.value += (ringOpacityTarget.value - ringOpacity.value) * ringSmoothing;

  const bandSettled = Math.abs(bandOuterTarget.value - bandOuter.value) < 0.0001 &&
                       Math.abs(bandInnerTarget.value - bandInner.value) < 0.0001;
  const awaitingHoldConfirmation = holdActive && !holdSwipeCancelled && !holdConfirmed;
  const chaosSettled = chaosBoost.value === chaosTarget && !awaitingHoldConfirmation;
  const speedBoostSettled = speedBoost.value === speedBoostTarget && !awaitingHoldConfirmation;
  const ringSettled = Math.abs(ringOpacityTarget.value - ringOpacity.value) < 0.001;

  gestureRafId = (bandSettled && chaosSettled && speedBoostSettled && ringSettled) ? null : requestAnimationFrame(stepGestures);
}

function ensureGesturesRunning() {
  if (gestureRafId !== null) return;
  lastGestureFrameTime = performance.now();
  gestureRafId = requestAnimationFrame(stepGestures);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tutorial animation (archive-of-practice projects/an-alle/concepts/
// animationssystem-wanderer.md, "nach bekanntem Schema" — same structure as
// zufallsverteilung-lod/material-shader-showcase's own tutorials, s. their
// ArModule.vue) — plays once, on the FIRST successful image recognition
// (`xrextrasfound`). Leads in with the ground plane's own opacity (0 -> 100%
// -> its standard value, ~3s), which doubles as the delay before the
// tutorial itself starts. `tutorialInputLocked` blocks swipe/hold input for
// the whole sequence, same as the other two branches — NOT tap (Autor-
// Entscheidung: tapping to activate a sound source must stay available the
// entire time, including during the tutorial itself, since the sound-hint
// phase right below explicitly invites it).
//
// Four phases: (0) a screen-CENTRED (not bottom/top-anchored like the
// gesture labels below) hint about tapping objects for sound — Autor-
// Entscheidung, own fixed text, no attribute to sweep, just a timed
// display; (1) vertical swipe -> outerRadius; (2) horizontal swipe ->
// innerRadius (both driving the *Target refs, same as a real swipe would,
// so the ring visualisation and the existing stepGestures smoothing handle
// the visible easing exactly as in real use — s. ensureGesturesRunning()
// calls below); (3) hold -> "Chaos-Boost" (Autor-Entscheidung: this exact
// label) — demonstrates BOTH chaosBoost and speedBoost together (the real
// hold gesture drives both, s. stepGestures), same Promise.all co-animation
// idiom as material-shader-showcase's own metalness+roughness phase.
const tutorialInputLocked = ref(true);
const imageTargetEl = ref<HTMLElement | null>(null);
const tutorialText = ref('');
const soundHintVisible = ref(false);
// Slowed down overall (Autor-Entscheidung, 01.09.2026: "das Tutorial
// sollte ein bisschen länger dauern, etwas langsamer im Timing" — was
// GROUND_INTRO_SEGMENT_MS 1500/FULL_RANGE_MS 2500/SOUND_HINT_MS 4500).
const GROUND_INTRO_SEGMENT_MS = 2000; // x2 = 4s lead-in/delay
const FULL_RANGE_MS = 3500;
const SOUND_HINT_MS = 6000;

function segmentDuration(from: number, to: number, fullRange: number): number {
  return (Math.abs(to - from) / fullRange) * FULL_RANGE_MS;
}

// Info-Button-Überschrift + -Text (Autor-Entscheidung, 01.09.2026,
// überarbeitet: Zielgruppe sind Menschen ohne Vorwissen, die evtl. nicht
// wissen, was sie vor sich haben, und nicht zwangsläufig technikaffin sind
// — einfache Sprache, keine Fachbegriffe wie "Wanderer-Band"/"innerRadius".
// Reihenfolge: Überschrift, dann kurze Einleitung (das hier ist eine Demo
// für die AR-Funktionen der AN ALLE!-Plattform + welche Prinzipien sie
// zeigt), dann die Beschreibung der Szene, dann erst die Gestenbedienung
// (nicht mehr als Fließtext, sondern übersichtlich je eine Zeile pro Geste
// mit Emoji). Alle Teile durch Leerzeilen getrennt; InfoOverlay.vue
// rendert das per white-space: pre-line als echten Zeilenumbruch (s.
// dessen eigenen Kommentar zu `textStyle`).
const infoOverlayHeading = 'Wandernde Soundelemente AR Demo';
const infoOverlayText =
  'Dies ist eine Demo für die AR-Funktionen unserer AN ALLE!-Plattform. Sie zeigt beispielhaft, was in einer solchen Anwendung möglich ist: Klang, der räumlich aus einzelnen Objekten kommt und sich mit ihnen bewegt; Bedienung ganz ohne Menüs oder Knöpfe, allein durch Antippen und Wischen; und Objekte, die unabhängig voneinander reagieren und gleichzeitig aktiv sein können.\n\n' +
  'In der Mitte schwebt langsam eine Figur auf und ab, drumherum wandern fünf kleine, bunte Objekte umher. Jedes davon ist eine eigene Klangquelle mit eigenem Ton. Tippst du eines an, beginnt oder stoppt sein Klang — mehrere können gleichzeitig zu hören sein. Solange ein Objekt klingt, pulsiert es sanft und verändert langsam seine Farbe.\n\n' +
  'So kannst du mitspielen:\n' +
  '👆 Antippen: Klang eines Objekts starten oder stoppen\n' +
  '⬆️⬇️ Hoch/runter wischen: wie weit die Wanderer nach außen ziehen\n' +
  '⬅️➡️ Links/rechts wischen: wie nah sie an die Mitte herankommen\n' +
  '✋ Finger gedrückt halten: die Wanderer werden wilder und schneller\n' +
  '🚶 Näher herangehen: macht die Wanderer zusätzlich schneller';

// Slides each label down into its resting position — plain inline-style
// transform animation via tween.ts's animateValue, not a CSS transition
// (same reasoning as the other two branches' own version of this).
const TEXT_SLIDE_DISTANCE_PX = 40;
const TEXT_SLIDE_MS = 400;
const tutorialTextSlideOffset = ref(-TEXT_SLIDE_DISTANCE_PX);

function showTutorialText(text: string) {
  tutorialText.value = text;
  tutorialTextSlideOffset.value = -TEXT_SLIDE_DISTANCE_PX;
  animateValue(tutorialTextSlideOffset, -TEXT_SLIDE_DISTANCE_PX, 0, TEXT_SLIDE_MS);
}

// Lead-in reset (Autor-Entscheidung, 01.09.2026: "wenn die erste
// Bilderkennung innerhalb der ersten 3 Sekunden während des Tutorial-
// Lead-ins abgebrochen wird, wird das Tutorial zurückgesetzt und bei der
// nächsten Bilderkennung startet das Lead-in und das Tutorial erneut, erst
// wenn das Lead-in überschritten ist läuft das Tutorial durch und kann
// dann auch nicht mehr resettet werden") — `tutorialRunToken` invalidates
// whichever lead-in attempt (if any) is currently mid-flight whenever
// tracking is lost before `tutorialLockedIn` flips true; `runTutorial`
// checks its own token after each of the two lead-in awaits and bails out
// silently if a reset happened meanwhile. Once locked in, found/lost no
// longer have any effect on the tutorial at all — it runs to completion
// regardless (matches the OTHER two branches' own "plays once" contract
// from that point on).
let tutorialRunToken = 0;
let tutorialLockedIn = false;
// Reactive counterpart of tutorialLockedIn, just for the template binding
// below (Autor-Entscheidung, 01.09.2026: "alle Szenenobjekte außer der
// Grundfläche sollten erst nach dem Lead-in aktiviert werden, vorher sind
// sie nicht da") — everything except #ground (mainEntity, the 5
// wanderers, the ring, the lights) sits behind this, not just
// assetsLoaded. Flips true at the exact same point tutorialLockedIn does;
// flips back false on a reset, same as groundOpacity.
const sceneContentVisible = ref(false);

async function runTutorial(myToken: number) {
  const cancelled = () => tutorialRunToken !== myToken;
  if (!(await cancellableFade(groundOpacity, 0, 1, GROUND_INTRO_SEGMENT_MS, cancelled))) return;
  if (!(await cancellableFade(groundOpacity, 1, STANDARD_GROUND_OPACITY, GROUND_INTRO_SEGMENT_MS, cancelled))) return;

  tutorialLockedIn = true; // past the lead-in now — no longer resettable
  sceneContentVisible.value = true;
  tutorialSpeedMul.value = TUTORIAL_SPEED_MUL;

  soundHintVisible.value = true;
  await sleep(SOUND_HINT_MS);
  soundHintVisible.value = false;

  // Phase 1: vertical swipe -> outerRadius. Low waypoint is clamped against
  // the CURRENT innerRadius + the minimum band thickness (not the raw
  // OUTER_RADIUS_MIN constant) so the demo sweep can't invert the band
  // against wherever innerRadius currently happens to rest.
  const outerStart = bandOuterTarget.value;
  const outerLow = Math.max(OUTER_RADIUS_MIN, bandInnerTarget.value + MIN_BAND_THICKNESS);
  const outerRange = OUTER_RADIUS_MAX - OUTER_RADIUS_MIN;
  ringOpacityTarget.value = RING_OPACITY_MAX;
  ensureGesturesRunning();
  showTutorialText('Vertikaler Swipe ↕️ = Wander-Band außen');
  await animateValue(bandOuterTarget, outerStart, OUTER_RADIUS_MAX, segmentDuration(outerStart, OUTER_RADIUS_MAX, outerRange));
  await animateValue(bandOuterTarget, OUTER_RADIUS_MAX, outerLow, segmentDuration(OUTER_RADIUS_MAX, outerLow, outerRange));
  await animateValue(bandOuterTarget, outerLow, outerStart, segmentDuration(outerLow, outerStart, outerRange));

  // Phase 2: horizontal swipe -> innerRadius, its own max waypoint clamped
  // against the (now-restored) outerStart the same way.
  const innerStart = bandInnerTarget.value;
  const innerHigh = Math.min(INNER_RADIUS_MAX_ABSOLUTE, outerStart - MIN_BAND_THICKNESS);
  const innerRange = innerHigh - INNER_RADIUS_MIN;
  showTutorialText('Horizontaler Swipe ↔️ = Wander-Band innen');
  await animateValue(bandInnerTarget, innerStart, innerHigh, segmentDuration(innerStart, innerHigh, innerRange));
  await animateValue(bandInnerTarget, innerHigh, INNER_RADIUS_MIN, segmentDuration(innerHigh, INNER_RADIUS_MIN, innerRange));
  await animateValue(bandInnerTarget, INNER_RADIUS_MIN, innerStart, segmentDuration(INNER_RADIUS_MIN, innerStart, innerRange));
  ringOpacityTarget.value = 0;

  // Phase 3: hold -> "Chaos-Boost" (Autor-Entscheidung: exact label) — both
  // chaosBoost and speedBoost co-animate, matching what a real hold does.
  showTutorialText('Finger halten ✋ = Chaos-Boost');
  await Promise.all([
    animateValue(chaosBoost, 0, CHAOS_BOOST_MAX, segmentDuration(0, CHAOS_BOOST_MAX, CHAOS_BOOST_MAX)),
    animateValue(speedBoost, 0, SPEED_BOOST_MAX, segmentDuration(0, SPEED_BOOST_MAX, SPEED_BOOST_MAX))
  ]);
  await Promise.all([
    animateValue(chaosBoost, CHAOS_BOOST_MAX, 0, segmentDuration(CHAOS_BOOST_MAX, 0, CHAOS_BOOST_MAX)),
    animateValue(speedBoost, SPEED_BOOST_MAX, 0, segmentDuration(SPEED_BOOST_MAX, 0, SPEED_BOOST_MAX))
  ]);

  tutorialText.value = '';
  tutorialInputLocked.value = false;
  tutorialSpeedMul.value = 1;
}

function onTutorialTrackingFound() {
  if (tutorialLockedIn) return; // already ran past its lead-in on an earlier attempt — never restart
  tutorialRunToken++;
  groundOpacity.value = 0; // clean restart visual in case this follows a reset
  runTutorial(tutorialRunToken);
}

function onTutorialTrackingLost() {
  if (tutorialLockedIn) return; // past the resettable window — a later loss/find no longer matters
  tutorialRunToken++; // invalidates whichever lead-in attempt (if any) is currently mid-flight
  groundOpacity.value = 0;
}

// "Kamera auf Image Target richten!" (s. awaitingFirstTracking above) —
// deliberately its OWN listener rather than folded into
// onTutorialTrackingFound: it must go away for good the very first time
// tracking is found, full stop, regardless of the tutorial's own
// resettable-lead-in bookkeeping.
function onFirstTrackingEver() {
  awaitingFirstTracking.value = false;
}

// Bottom-anchored (25% up from the bottom edge) instruction label, same
// look as the other two branches' own tutorials.
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

// "Tutorial" header, 25% down from the top — same look/duration as the
// other two branches' own version.
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

// Screen-CENTRED sound hint (Autor-Entscheidung: "in der Mitte des
// Screens", unlike the bottom/top-anchored gesture labels above) — allowed
// to wrap (two sentences), unlike the single-line gesture labels.
const soundHintStyle = {
  position: 'fixed' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  maxWidth: '70vw',
  padding: '3vw 4vw',
  background: 'rgba(0, 0, 0, 0.5)',
  color: '#ffffff',
  fontFamily: TUTORIAL_FONT_FAMILY,
  fontSize: '3.2vw',
  textAlign: 'center' as const,
  zIndex: 1000,
  pointerEvents: 'none' as const
} as const;

// Shown from mount until the camera recognises the target for the very
// FIRST time ever (Autor-Entscheidung, 01.09.2026: "bevor zum ersten Mal
// die Bilderkennung gegriffen hat") — deliberately independent of the
// tutorial's own found/lost/reset bookkeeping above: once the camera has
// found the target once, this hint is done for good, even if tracking
// later drops and the tutorial's own lead-in resets (s. onMounted below).
const awaitingFirstTracking = ref(true);
const trackingHintStyle = {
  position: 'fixed' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  whiteSpace: 'nowrap' as const,
  padding: '3vw 4vw',
  background: 'rgba(0, 0, 0, 0.5)',
  color: '#ffffff',
  fontFamily: TUTORIAL_FONT_FAMILY,
  fontSize: '4vw',
  textAlign: 'center' as const,
  zIndex: 1000,
  pointerEvents: 'none' as const
} as const;

let detachSwipeDrag: (() => void) | null = null;

onMounted(() => {
  detachSwipeDrag = attachSwipeDrag(
    (dx) => {
      if (tutorialInputLocked.value) return;
      registerHoldMovement(dx);
      // A confirmed hold in THIS touch session blocks the band entirely
      // until release + a fresh press (s. swipeSuppressedThisSession
      // comment above) — registerHoldMovement above still needs to run
      // unconditionally though, so a hold that gets cancelled by this same
      // movement still ramps its chaos/speed boost back down correctly.
      if (swipeSuppressedThisSession) return;
      bandInnerTarget.value = Math.min(INNER_RADIUS_MAX_ABSOLUTE, Math.max(INNER_RADIUS_MIN, bandInnerTarget.value + dx * INNER_RADIUS_PER_PX));
      clampInnerTarget();
      clampOuterTarget();
      // Ring shows only for an actual swipe, never for a hold/tap (Autor-
      // Entscheidung, 01.09.2026) — dx/dy only ever fire on real pointer
      // movement (s. swipe-drag.ts), so gating the ring here rather than
      // on pointerdown/-up already excludes a stationary hold or a plain
      // tap on its own.
      ringOpacityTarget.value = RING_OPACITY_MAX;
      ensureGesturesRunning();
    },
    // -dy: swiping UP (negative screen dy) grows outerRadius, matching the
    // project-wide "nach oben = mehr" convention.
    (dy) => {
      if (tutorialInputLocked.value) return;
      registerHoldMovement(dy);
      if (swipeSuppressedThisSession) return;
      bandOuterTarget.value = Math.min(OUTER_RADIUS_MAX, Math.max(OUTER_RADIUS_MIN, bandOuterTarget.value - dy * OUTER_RADIUS_PER_PX));
      clampOuterTarget();
      clampInnerTarget();
      ringOpacityTarget.value = RING_OPACITY_MAX;
      ensureGesturesRunning();
    },
    () => {
      if (tutorialInputLocked.value) return;
      holdMoveAccumPx = 0;
      holdSwipeCancelled = false;
      swipeSuppressedThisSession = false;
      holdActive = true;
      holdStartTime = performance.now();
      ensureGesturesRunning();
    },
    () => {
      if (tutorialInputLocked.value) return;
      holdActive = false;
      ringOpacityTarget.value = 0;
      ensureGesturesRunning();
    }
  );

  ensureTutorialFontLoaded();
  imageTargetEl.value?.addEventListener('xrextrasfound', onTutorialTrackingFound);
  imageTargetEl.value?.addEventListener('xrextraslost', onTutorialTrackingLost);
  imageTargetEl.value?.addEventListener('xrextrasfound', onFirstTrackingEver, { once: true });

  // Central figure's bob only advances while its OWN sound is playing (s.
  // stepMainBob above) — bridged from wander-sound.ts's own
  // "wander-sound-state-changed" emit, same event each wanderer below also
  // uses for its sound-paused speed halving.
  mainEntityEl.value?.addEventListener('wander-sound-state-changed', (e: Event) => {
    mainSoundPlaying.value = (e as CustomEvent).detail.playing;
    if (mainSoundPlaying.value) ensureMainBobRunning();
  });

  // Each wanderer's own speed is halved while its own sound is paused (s.
  // wanderAttr's soundSpeedMul parameter) — Autor-Entscheidung, 01.09.2026.
  [wander1El, wander2El, wander3El, wander4El, wander5El].forEach((el, i) => {
    el.value?.addEventListener('wander-sound-state-changed', (e: Event) => {
      wandererPlaying[i].value = (e as CustomEvent).detail.playing;
    });
  });
});

onUnmounted(() => {
  detachSwipeDrag?.();
  if (gestureRafId !== null) cancelAnimationFrame(gestureRafId);
  imageTargetEl.value?.removeEventListener('xrextrasfound', onTutorialTrackingFound);
  imageTargetEl.value?.removeEventListener('xrextraslost', onTutorialTrackingLost);
  imageTargetEl.value?.removeEventListener('xrextrasfound', onFirstTrackingEver);
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
        :visible="assetsLoaded && sceneContentVisible"
        ar-button-manager="tapSelection: screen-space"
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

      <!-- `rotation="90 0 0"` is the compensating rotation from the script
           block above — everything inside keeps the familiar X/Z-ground,
           Y-height authoring, remapped onto the real footprint's X/Y-ground,
           Z-height outside this wrapper. No position — sits at the
           footprint's own centre. -->
      <a-entity id="scene-root" rotation="90 0 0">

        <!-- Band-Visualisierung während Swipe-Gesten (Autor-Entscheidung,
             01.09.2026): halbtransparenter Ring direkt über der
             Grundfläche, ein- und ausblendend mit ringOpacity (s.
             Script-Block/stepGestures oben). Radien folgen den
             *Target-Refs (nicht den geglätteten bandInner/bandOuter), damit
             der Ring exakt dem Finger folgt statt der Wanderer-eigenen
             Verzögerung. a-ring liegt standardmäßig in der lokalen X/Y-Ebene
             (Normale Z) — die eigene rotation="90 0 0" klappt ihn auf die
             X/Z-Grundfläche dieses (bereits rotierten) Wrappers, exakt wie
             #scene-root selbst nach außen auf die echte Footprint-Ebene
             klappt. Minimal auf lokal-Y angehoben (= echte Z-Höhe außerhalb
             des Wrappers), sonst Z-Fighting mit #ground (Autor-Korrektur,
             01.09.2026). -->
        <a-ring
            :position="`0 ${RING_Z_LIFT.toFixed(4)} 0`"
            rotation="90 0 0"
            :radius-inner="bandInnerTarget"
            :radius-outer="bandOuterTarget"
            :material="ringMaterial"
        ></a-ring>

        <!-- Zentrales, "unbewegliches" (nur die eigene Bezugsposition für
             die Wanderer, s. wander-in-band.ts — schwebt selbst auf/ab, s.
             stepMainBob im Script-Block, NUR während die eigene
             Klangquelle spielt) Objekt (archive-of-practice
             projects/an-alle/concepts/animationssystem-wanderer.md) —
             vorübergehend ein statisches Primitive (Autor-Entscheidung,
             01.09.2026), kein Rig/trim-loop-clip mehr; folgt in einer
             späteren Sitzung. Lemon-Yellow = Start des Farbschemas (s.
             Script-Block oben). Jetzt außerdem eine 6. Klangquelle
             (Autor-Entscheidung, s. Script-Block oben) — dieselbe
             [ar-button]+[wander-sound]-Verkabelung wie jeder Wanderer,
             reiner Tap-Start (kein Autoplay). -->
        <a-entity
            id="mainEntity"
            ref="mainEntityEl"
            :position="mainPosition"
            :sound="mainSoundSrcAttr" :ar-button="mainButtonAttr" :wander-sound="mainWanderSoundAttr">
          <a-sphere class="worm-segment" :radius="MAIN_RADIUS" :color="COLOR_CENTER" shadow></a-sphere>
        </a-entity>

        <!-- Fünf Wanderer, kein Rig — nur wander-in-band/Orbit-Pfad um
             #mainEntity, auf der Grundfläche laufend statt über dem Bild
             schwebend (Frage 9). Gemeinsamer Elternknoten, damit die
             eingebaute gegenseitige Ausweich-Logik von wander-in-band
             greift (sie schaut nur auf Geschwister unter demselben
             Parent). Jeder Wanderer jetzt ein "Wurm" aus 3 überlappenden
             Kopien seines eigenen Primitives statt einem einzelnen Körper
             (Autor-Entscheidung, 01.09.2026, s. Script-Block oben) —
             entlang der lokalen +Z-Achse gestaffelt (= wander-in-band's
             eigene "forward"-Achse, rotation.y folgt bereits der Heading),
             zeigt die Bewegungsrichtung also ohne zusätzliches Rotations-
             Mapping an. wander-in-band schreibt nur position/rotation.y
             der WRAPPER-Entität, die 3 Kinder reiten also einfach mit.
             Jeder Wanderer ist jetzt außerdem seine eigene Klangquelle
             (Autor-Entscheidung, 01.09.2026, s. Script-Block oben) — Tap
             (ar-button) schaltet per [wander-sound] Play/Pause um, ohne
             die anderen vier zu beeinflussen (mehrere gleichzeitig
             abspielbar). `.worm-segment`-Klasse auf den 3 Kindern ist
             [wander-sound]'s eigener Ziel-Selektor für Farb-/Puls-
             Reaktion. -->
        <a-entity id="wandererGroup">
          <a-entity ref="wander1El" :position="wander1Position" :wander-in-band="wander1Attr"
              :sound="wanderSoundSrcAttr(0)" :ar-button="wanderButtonAttr" :wander-sound="wanderSoundAttr">
            <a-sphere class="worm-segment" :radius="WANDER_OBJECT_SIZE" :color="segmentColor(0, 'head')" :position="`0 0 ${WORM_SEGMENT_SPACING.toFixed(4)}`" shadow></a-sphere>
            <a-sphere class="worm-segment" :radius="WANDER_OBJECT_SIZE" :color="segmentColor(0, 'mid')" position="0 0 0" shadow></a-sphere>
            <a-sphere class="worm-segment" :radius="WANDER_OBJECT_SIZE" :color="segmentColor(0, 'tail')" :position="`0 0 ${(-WORM_SEGMENT_SPACING).toFixed(4)}`" shadow></a-sphere>
          </a-entity>
          <a-entity ref="wander2El" :position="wander2Position" :wander-in-band="wander2Attr"
              :sound="wanderSoundSrcAttr(1)" :ar-button="wanderButtonAttr" :wander-sound="wanderSoundAttr">
            <a-box class="worm-segment" :width="WANDER_OBJECT_SIZE" :height="WANDER_OBJECT_SIZE" :depth="WANDER_OBJECT_SIZE" :color="segmentColor(1, 'head')" :position="`0 0 ${WORM_SEGMENT_SPACING.toFixed(4)}`" shadow></a-box>
            <a-box class="worm-segment" :width="WANDER_OBJECT_SIZE" :height="WANDER_OBJECT_SIZE" :depth="WANDER_OBJECT_SIZE" :color="segmentColor(1, 'mid')" position="0 0 0" shadow></a-box>
            <a-box class="worm-segment" :width="WANDER_OBJECT_SIZE" :height="WANDER_OBJECT_SIZE" :depth="WANDER_OBJECT_SIZE" :color="segmentColor(1, 'tail')" :position="`0 0 ${(-WORM_SEGMENT_SPACING).toFixed(4)}`" shadow></a-box>
          </a-entity>
          <a-entity ref="wander3El" :position="wander3Position" :wander-in-band="wander3Attr"
              :sound="wanderSoundSrcAttr(2)" :ar-button="wanderButtonAttr" :wander-sound="wanderSoundAttr">
            <a-cone class="worm-segment" :radius-bottom="WANDER_OBJECT_SIZE" radius-top="0" :height="WANDER_OBJECT_SIZE * 1.8" :color="segmentColor(2, 'head')" :position="`0 0 ${WORM_SEGMENT_SPACING.toFixed(4)}`" shadow></a-cone>
            <a-cone class="worm-segment" :radius-bottom="WANDER_OBJECT_SIZE" radius-top="0" :height="WANDER_OBJECT_SIZE * 1.8" :color="segmentColor(2, 'mid')" position="0 0 0" shadow></a-cone>
            <a-cone class="worm-segment" :radius-bottom="WANDER_OBJECT_SIZE" radius-top="0" :height="WANDER_OBJECT_SIZE * 1.8" :color="segmentColor(2, 'tail')" :position="`0 0 ${(-WORM_SEGMENT_SPACING).toFixed(4)}`" shadow></a-cone>
          </a-entity>
          <a-entity ref="wander4El" :position="wander4Position" :wander-in-band="wander4Attr"
              :sound="wanderSoundSrcAttr(3)" :ar-button="wanderButtonAttr" :wander-sound="wanderSoundAttr">
            <a-octahedron class="worm-segment" :radius="WANDER_OBJECT_SIZE" :color="segmentColor(3, 'head')" :position="`0 0 ${WORM_SEGMENT_SPACING.toFixed(4)}`" shadow></a-octahedron>
            <a-octahedron class="worm-segment" :radius="WANDER_OBJECT_SIZE" :color="segmentColor(3, 'mid')" position="0 0 0" shadow></a-octahedron>
            <a-octahedron class="worm-segment" :radius="WANDER_OBJECT_SIZE" :color="segmentColor(3, 'tail')" :position="`0 0 ${(-WORM_SEGMENT_SPACING).toFixed(4)}`" shadow></a-octahedron>
          </a-entity>
          <a-entity ref="wander5El" :position="wander5Position" :wander-in-band="wander5Attr"
              :sound="wanderSoundSrcAttr(4)" :ar-button="wanderButtonAttr" :wander-sound="wanderSoundAttr">
            <a-dodecahedron class="worm-segment" :radius="WANDER_OBJECT_SIZE * 0.9" :color="segmentColor(4, 'head')" :position="`0 0 ${WORM_SEGMENT_SPACING.toFixed(4)}`" shadow></a-dodecahedron>
            <a-dodecahedron class="worm-segment" :radius="WANDER_OBJECT_SIZE * 0.9" :color="segmentColor(4, 'mid')" position="0 0 0" shadow></a-dodecahedron>
            <a-dodecahedron class="worm-segment" :radius="WANDER_OBJECT_SIZE * 0.9" :color="segmentColor(4, 'tail')" :position="`0 0 ${(-WORM_SEGMENT_SPACING).toFixed(4)}`" shadow></a-dodecahedron>
          </a-entity>
        </a-entity>

      </a-entity>

    </a-entity>

    <!-- Ambient light, moved OUT of the no-frustum-cull wrapper above and
         made a sibling of #ground (Autor-Korrektur, 01.09.2026: "die
         Grundfläche wird jetzt im Lead-in schwarz" — #ground uses a lit
         `standard` material for shadow-catching, s. below; with the
         wrapper above hidden pre-lead-in, BOTH lights it depended on were
         hidden too, so it rendered fully unlit/black instead of its own
         light-blue colour). Always on, independent of sceneContentVisible
         — the directional light (still inside the wrapper) stays gated,
         since it only matters once there's something in there to cast a
         shadow from anyway. -->
    <a-light type="ambient" intensity="0.7"></a-light>

    <!-- Ground plane = the tracked image itself (footprint convention, see
         script block above): same local X/Y bounds as the printed image,
         no rotation (a-plane's default orientation already matches the
         image's own plane), sitting at Z=0. Semi-transparent visible fill
         so the footprint is visible for orientation/debugging while still
         catching shadows. Deliberately a SIBLING of the no-frustum-cull
         wrapper above, not a child (Autor-Entscheidung, 01.09.2026: "alle
         Szenenobjekte außer der Grundfläche sollten erst nach dem Lead-in
         aktiviert werden") — only gated on assetsLoaded, unaffected by
         sceneContentVisible. -->
    <a-plane
        id="ground"
        :visible="assetsLoaded"
        :width="FOOTPRINT_WIDTH"
        :height="FOOTPRINT_DEPTH"
        :material="groundMaterial"
        shadow
    ></a-plane>
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
       branch passes its own scene-specific explanation text. Kein
       GuiPanel mehr (01.09.2026, "Bedienfeld weg") — Gesten statt Regler. -->
  <InfoOverlay :heading="infoOverlayHeading" :text="infoOverlayText" :font-family="TUTORIAL_FONT_FAMILY" />

  <!-- "Kamera auf Image Target richten!" — sichtbar ab Mount, verschwindet
       endgültig sobald die Bilderkennung zum ersten Mal greift (s.
       Script-Block/onFirstTrackingEver oben), unabhängig vom
       Tutorial-Reset. -->
  <div v-if="awaitingFirstTracking" :style="trackingHintStyle">Kamera auf Image Target richten!</div>

  <!-- Tutorial-Hinweis in der Bildschirmmitte (Autor-Entscheidung, s.
       Script-Block/runTutorial oben) — eigene Position/Stil, getrennt von
       den unten stehenden Gesten-Labels. -->
  <div v-if="soundHintVisible" :style="soundHintStyle">Objekte antippen um Sound zu aktivieren. Falls Sound nicht hörbar, näher kommen und ggf. Lautstärke erhöhen.</div>

  <!-- Tutorial-Gesten-Label (s. Script-Block/runTutorial oben) —
       bildschirmzentriert am unteren Rand, nur während eine Tutorial-Phase
       läuft. -->
  <div v-if="tutorialText" :style="tutorialTextStyle">{{ tutorialText }}</div>

  <!-- "Tutorial"-Kopfzeile — steht auch schon über der allerersten Phase
       (dem Sound-Hinweis, Autor-Entscheidung), nicht erst ab dem ersten
       Gesten-Label. -->
  <div v-if="tutorialText || soundHintVisible" :style="tutorialHeaderStyle">Tutorial</div>
</template>
