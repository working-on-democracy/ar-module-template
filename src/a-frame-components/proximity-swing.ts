import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";
import { seededRandom } from "./seeded-random";

declare const AFRAME: any;

// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md, "Proximity-Swing"
// decision, 31.08.2026, numbers/measurement revised 31.08.2026) — replaces
// this scene's earlier `proximity-rise` (monotonic grow-on-approach over
// 1-3m) AND random-field's static `randomness`-driven jitter (baked once
// at placement) with THREE live motions, all additive on top of this
// object's fixed grid position ("Nullpunkt"):
//
//   1. Radial swing (local X/Z, ground plane) — driven by `proximityFactor`
//      (s. below): swings back/forth along its own fixed random direction.
//      At proximityCoverageFar (screen coverage, farthest — e.g. app start,
//      before anyone approaches): ZERO amplitude, centred exactly on the
//      grid position — a perfectly still, ordered grid. At
//      proximityCoverageNear (closest): full amplitude (= swingRadius),
//      centre eased to a fixed random target point — the object swings
//      around that point instead, i.e. approaching is what turns the
//      orderly grid chaotic (direction fixed 31.08.2026 — an earlier
//      version had this backwards, resting chaotically from the start).
//   2. Vertical height (local Y) — a SEPARATE per-object 3D distance
//      measurement (camera to this object's own fixed grid position, NOT
//      screen coverage, and NOT this object's currently-animated position
//      — author's correction, 31.08.2026): NOT an oscillating hop (removed
//      31.08.2026, direction inverted per author's spec) — a smooth,
//      monotonic height that's HIGHEST (zBobHeightMax) at zBobFar (20cm)
//      and beyond, and sinks toward the ground the closer the camera gets,
//      reaching its LOWEST (zBobHeightMin) at zBobNear (4cm) and closer.
//   3. Idle float (all three local axes) — gated by the SAME
//      `proximityFactor` as the swing, same linear ramp: fully STILL at
//      proximityCoverageFar (0 at/below it, no motion at all, not just
//      slow), full amplitude/speed at proximityCoverageNear. Kept
//      deliberately tiny in absolute terms on the ground-plane axes
//      (idleGroundRadius) so neighbouring objects' independent idle drift
//      can't make them overlap; the vertical axis (idleHeightRadius) can
//      be a little more generous since vertical drift alone never causes
//      horizontal overlap.
//
// Also sets this entity's own material colour ONCE at init, from its
// ground-plane distance to the field's centre (0,0 in this entity's local
// space, since random-field's bounded grid is centred on its own origin) —
// a radial gradient from `colorInner` (field centre) to `colorOuter` (field
// edge), so the placed field reads as one colour-graded whole rather than
// a spatially independent random speckle of colours.
//
// Put directly on a [random-field] template entity, same as proximity-rise
// was — random-field's cloneItem() re-applies every live component's
// current `.data` onto each clone (see random-field.ts), so every placed
// copy gets its own independent, correctly-initialized instance.
const SWING_SPEED = 2.5; // rad/s, at full proximityFactor (near proximity-wave.ts's waveSpeed default of 3)
const IDLE_SPEED = 1.0; // rad/s base — identical constant to proximity-wave.ts's own idle float

// How "close" the camera is to the WHOLE TARGET IMAGE, measured as SCREEN
// COVERAGE rather than a 3D world distance (author's correction,
// 31.08.2026 — a raw camera-to-point distance doesn't account for viewing
// angle: tilting the phone relative to the printed image changes how
// "close" it visually reads without changing that distance). Coverage =
// how much of the camera's field of view the target image's own width
// fills, computed as the NDC (normalized device coordinate, [-1, 1] = the
// full screen) gap between the target's centre and one edge, projected
// through the live camera — i.e. roughly "target width as a fraction of
// screen width". A width-based proxy rather than true projected AREA
// (would need clipping a rotated quad against the screen rectangle) —
// close enough for a smooth, monotonic "closer = bigger number" signal,
// which is all a proximity ramp needs. Keeps growing past 1 as the target
// image overflows the frame (project() does not clip out-of-view points) —
// exactly right here, since proximityCoverageNear only needs to mark
// "close enough for full effect", not the literal point where the image
// stops fitting on screen.
//
// This is a FIELD-WIDE quantity (every placed copy shares the exact same
// target image), so it's computed at most ONCE PER FRAME regardless of how
// many copies ask for it — memoized by the `time` argument every tick()
// receives, which A-Frame guarantees is identical for every component
// ticking within the same frame.
//
// Vector3 instances are only ever created inside a function (never at
// module top-level, before A-Frame/THREE is guaranteed to have loaded —
// same reasoning every other component in this codebase already follows
// by only touching `AFRAME.THREE`/`THREE` inside init()/tick()).
let cachedCoverageTime = -1;
let cachedCoverage = 0;

function targetCoverage(time: number, camera: any, targetObject3D: any, targetHalfWidth: number): number {
  if (time === cachedCoverageTime) return cachedCoverage;
  cachedCoverageTime = time;
  const center = new AFRAME.THREE.Vector3(0, 0, 0);
  targetObject3D.localToWorld(center);
  const edge = new AFRAME.THREE.Vector3(targetHalfWidth, 0, 0);
  targetObject3D.localToWorld(edge);
  center.project(camera);
  edge.project(camera);
  const value = Math.abs(edge.x - center.x);
  // `camera.project()` can return NaN for a frame or two right at startup
  // (root cause, 31.08.2026, confirmed via device console: the camera's
  // projection matrix isn't valid yet on this component's very first
  // tick — a known iOS Safari quirk where the WebGL canvas's effective
  // size/aspect ratio isn't settled until the first resize event, which a
  // touch/swipe can trigger indirectly, explaining why swiping "fixed"
  // it). Without this guard, that NaN propagated all the way into
  // `object3D.position.set(NaN, y, NaN)` in tick() below — which doesn't
  // just render wrong for one frame, it corrupts the object permanently
  // until something else (e.g. a field remount) resets its position from
  // scratch. Falling back to 0 (= "far", the same still-grid state the
  // scene should show at startup anyway) instead means a bad frame here
  // just delays the swing/idle motion by a frame, never breaks placement.
  cachedCoverage = Number.isFinite(value) ? value : 0;
  return cachedCoverage;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(v: number): string {
  return Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, "0");
}

// Linear per-channel RGB interpolation between two "#RRGGBB" strings.
function lerpHexColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const f = clamp01(t);
  return `#${toHex(ar + (br - ar) * f)}${toHex(ag + (bg - ag) * f)}${toHex(ab + (bb - ab) * f)}`;
}

export default {
  schema: {
    // CSS selector for the tracked target image's own entity (default
    // #ground, s. ArModule.vue) — its width and live world transform are
    // what targetCoverage() above measures against. A plain string, not
    // A-Frame's `selector` schema type — this component's placed copies
    // (via random-field) can connect to the DOM before their #ground
    // sibling has, so tick() resolves and caches the element itself,
    // lazily, retrying until it's found rather than risking a one-shot
    // schema-parse-time lookup finding nothing.
    targetSelector: { type: "string", default: "#ground" },
    // Half the target image's own LOCAL width (s. ArModule.vue's
    // FOOTPRINT_WIDTH) — the point targetCoverage() projects to measure
    // apparent screen coverage.
    targetHalfWidth: { type: "number", default: 0.5 },

    // Maximum horizontal (local X/Z) swing amplitude, local units — the
    // caller computes this the same way random-field's old bounded-grid
    // jitter radius was computed (grid spacing / 2 - own footprint
    // radius), just live instead of baked into a placed position.
    swingRadius: { type: "number", default: 0.05 },
    // Screen-coverage band (s. targetCoverage() above) both the swing AND
    // the idle float (below) ramp over. At/above proximityCoverageNear ->
    // full swing amplitude/speed (centred on the grid position) and full
    // idle float. At/below proximityCoverageFar -> zero swing amplitude
    // (resting on the fixed random target point) and no idle float at all.
    proximityCoverageNear: { type: "number", default: 1.0 }, // raised from 0.9, author's recalibration 31.08.2026
    proximityCoverageFar: { type: "number", default: 0.5 }, // raised from 0.3, author's recalibration 31.08.2026

    // Vertical (local Y) height bounds, local units — direction inverted
    // 31.08.2026, s. file header: zBobHeightMax at zBobFar (20cm) and
    // beyond, easing down to zBobHeightMin at zBobNear (4cm) and closer.
    zBobHeightMax: { type: "number", default: 0.1 },
    zBobHeightMin: { type: "number", default: 0.04 },
    // Own, SEPARATE per-object 3D distance band (metres, camera to this
    // object's own fixed grid position — s. file header) the vertical
    // height ramps over.
    zBobNear: { type: "number", default: 0.04 }, // 4cm, lowered from 6cm, author's recalibration 31.08.2026
    zBobFar: { type: "number", default: 0.2 },

    // Idle float amplitude (local units), gated by proximityFactor (s.
    // above). Ground-plane (X/Z) kept deliberately tiny so neighbouring
    // objects' independent drift can't overlap; height (Y) can be a little
    // more generous.
    idleGroundRadius: { type: "number", default: 0.005 },
    idleHeightRadius: { type: "number", default: 0.015 },

    // Radial material-colour gradient by this object's own ground-plane
    // distance from the field's centre (local 0,0) — colorInner at the
    // centre, colorOuter at colorMaxDist or beyond.
    colorInner: { type: "string", default: "#FFF44F" }, // lemon yellow
    colorOuter: { type: "string", default: "#FF69B4" }, // hot pink
    colorMaxDist: { type: "number", default: 1 },

    // AN ALLE! tutorial-animation decision (31.08.2026, s. concept doc) —
    // while true, skips ALL motion below (swing/bob/idle) and holds this
    // object exactly at its grid position, so the field reads as a
    // perfectly still, ordered grid during the field-size/density demo
    // instead of visibly swinging/drifting on its own — that motion would
    // otherwise fight the very thing the tutorial is trying to show
    // clearly. ArModule.vue ties this to the same flag that locks swipe
    // input for the tutorial's duration.
    frozen: { type: "boolean", default: false }
  },

  init() {
    const self = this as any;
    const p = self.el.object3D.position;
    self.baseX = p.x;
    self.baseY = p.y;
    self.baseZ = p.z;

    self.cameraPos = new AFRAME.THREE.Vector3();
    // The vertical bob's own measurement point — this object's fixed grid
    // position in WORLD space, captured once before any animation moves
    // it (s. file header: "misst immer nur nach dem Nullpunkt-Anker, nicht
    // nach seiner Bewegung").
    self.zBobAnchorPos = new AFRAME.THREE.Vector3(0, 0, 0);
    self.el.object3D.localToWorld(self.zBobAnchorPos);

    // Own fixed swing direction + the fixed point it swings toward at full
    // amplitude ("die Zufallsposition") — seeded from this clone's OWN
    // stable grid index (random-field.ts's `data-grid-index` attribute,
    // s. seeded-random.ts), NOT `Math.random()` (bugfix, 31.08.2026): a
    // density/field-size swipe forces a full unmount/remount of the whole
    // field (s. ArModule.vue's `fieldKey`), so every placed copy gets a
    // brand new component instance on every swipe — `Math.random()` would
    // scatter a completely different chaotic arrangement each time instead
    // of the same arrangement only shifting where the grid itself changed
    // shape (a genuinely different row/column count). Falls back to
    // Math.random() only for the hidden, never-cloned #prop template
    // itself (no data-grid-index there), which is harmless since nothing
    // ever looks at its position.
    const gridIndexAttr = self.el.getAttribute("data-grid-index");
    const gridIndex = gridIndexAttr !== null ? parseInt(gridIndexAttr, 10) : NaN;
    const angle = !Number.isNaN(gridIndex) ? seededRandom(gridIndex) * Math.PI * 2 : Math.random() * Math.PI * 2;
    self.swingDirX = Math.cos(angle);
    self.swingDirZ = Math.sin(angle);
    self.randomTargetX = self.baseX + self.swingDirX * self.data.swingRadius;
    self.randomTargetZ = self.baseZ + self.swingDirZ * self.data.swingRadius;

    self.swingPhase = Math.random() * Math.PI * 2;
    self.idlePhaseX = Math.random() * Math.PI * 2;
    self.idlePhaseY = Math.random() * Math.PI * 2;
    self.idlePhaseZ = Math.random() * Math.PI * 2;
    // Running phase accumulators (s. tick()'s own comment for why these
    // can't just be `elapsedTime * currentFactor`). None needed for the
    // vertical height — it's a direct, non-oscillating function of
    // distance now, s. tick()'s own comment.
    self.swingAngle = 0;
    self.idleAngleX = 0;
    self.idleAngleY = 0;
    self.idleAngleZ = 0;

    // One-time radial colour gradient — see file header comment.
    const dist2D = Math.hypot(self.baseX, self.baseZ);
    const t = self.data.colorMaxDist > 0 ? dist2D / self.data.colorMaxDist : 0;
    self.el.setAttribute("material", "color", lerpHexColor(self.data.colorInner, self.data.colorOuter, t));
  },

  tick(time: number, timeDelta: number) {
    const self = this as any;
    const data = self.data;
    if (data.frozen) {
      self.el.object3D.position.set(self.baseX, self.baseY, self.baseZ);
      return;
    }
    const camera = self.el.sceneEl.camera;
    if (!self.targetObject3D) {
      const targetEl = self.el.sceneEl.querySelector(data.targetSelector);
      if (!targetEl) return; // not in the DOM yet — retry next tick
      self.targetObject3D = targetEl.object3D;
    }
    if (!camera) return;
    // Clamped so a frame hitch (e.g. a stall right after init()) can't
    // suddenly jump the swing/bob/idle phase forward.
    const dt = Math.min(0.1, Math.max(0, (timeDelta || 0) / 1000));

    camera.getWorldPosition(self.cameraPos);

    // --- Shared proximity factor (screen coverage): drives BOTH the swing and the idle float ---
    const coverage = targetCoverage(time, camera, self.targetObject3D, data.targetHalfWidth);
    const proximityFactor = rampFactor(coverage, data.proximityCoverageFar, data.proximityCoverageNear); // 0 at <=far, 1 at >=near

    // --- Radial swing: centre eases grid -> random target, amplitude/speed 0 -> full ---
    // Direction fixed 31.08.2026: LOW coverage (far, at/below
    // proximityCoverageFar) must read as a PERFECTLY STILL GRID — centre =
    // grid position, zero amplitude. HIGH coverage (near, at/above
    // proximityCoverageNear) is where it comes alive — full amplitude,
    // swinging around the fixed random target. So centerT tracks
    // proximityFactor directly (NOT its inverse).
    const centerT = proximityFactor; // 0 at far (centre = grid, still), 1 at near (centre = random target, swinging)
    const centerX = self.baseX + centerT * (self.randomTargetX - self.baseX);
    const centerZ = self.baseZ + centerT * (self.randomTargetZ - self.baseZ);
    // Phase is ACCUMULATED (angular velocity * dt), not `elapsedTime *
    // currentSpeed` — the latter would make the sine's argument jump
    // discontinuously whenever the factor changes (elapsedTime keeps
    // growing throughout the session, so multiplying it by a freshly
    // changed factor re-scales the ENTIRE accumulated angle at once, not
    // just its future growth). Accumulating means the speed genuinely
    // eases without ever jumping.
    self.swingAngle += SWING_SPEED * proximityFactor * dt;
    const osc = data.swingRadius * proximityFactor * Math.sin(self.swingAngle + self.swingPhase);
    const swingX = self.swingDirX * osc;
    const swingZ = self.swingDirZ * osc;

    // --- Vertical height: own, SEPARATE per-object 3D distance (not screen coverage) ---
    // Direct, non-oscillating height — no sine, no phase/angle accumulator
    // (author's spec, 31.08.2026: a smooth "sinks as you approach"
    // position, not a hop). zBobFactor: 0 at <=zBobNear (4cm) -> height =
    // zBobHeightMin, 1 at >=zBobFar (20cm) -> height = zBobHeightMax.
    const objDist = self.cameraPos.distanceTo(self.zBobAnchorPos);
    const zBobFactor = rampFactor(objDist, data.zBobNear, data.zBobFar);
    const zbob = data.zBobHeightMin + zBobFactor * (data.zBobHeightMax - data.zBobHeightMin);

    // --- Idle float: same linear proximityFactor ramp as the swing (0 = fully still), tiny on X/Z ---
    self.idleAngleX += IDLE_SPEED * 0.7 * proximityFactor * dt;
    self.idleAngleY += IDLE_SPEED * 0.9 * proximityFactor * dt;
    self.idleAngleZ += IDLE_SPEED * 1.1 * proximityFactor * dt;
    const idleX = data.idleGroundRadius * proximityFactor * Math.sin(self.idleAngleX + self.idlePhaseX);
    const idleY = data.idleHeightRadius * proximityFactor * Math.sin(self.idleAngleY + self.idlePhaseY);
    const idleZ = data.idleGroundRadius * proximityFactor * Math.sin(self.idleAngleZ + self.idlePhaseZ);

    // All three motions are additive on top of the grid/random-target base.
    self.el.object3D.position.set(
      centerX + swingX + idleX,
      self.baseY + zbob + idleY,
      centerZ + swingZ + idleZ
    );
  },

  remove() {
    const self = this as any;
    self.el.object3D.position.set(self.baseX, self.baseY, self.baseZ);
  }
} as ComponentDefinition;
