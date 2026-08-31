import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";

declare const AFRAME: any;

// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md, "Proximity-Swing"
// decision, 31.08.2026) — replaces this scene's earlier `proximity-rise`
// (monotonic grow-on-approach over 1-3m) AND random-field's static
// `randomness`-driven jitter (baked once at placement) with ONE live,
// per-instance motion driven by how close the camera is to the tracked
// target IMAGE. As the camera nears, each object swings back and forth
// along its own fixed random direction, the swing's CENTRE eases from its
// grid position (near) toward a fixed random target point (far):
//
//   - At swingCoverageNear (closest): swing amplitude is FULL
//     (= swingRadius) and the swing's centre IS the grid position
//     ("Nullpunkt").
//   - At swingCoverageFar (farthest): amplitude has eased to 0 and the
//     centre has eased to the fixed random target point — so the object
//     ends up resting exactly there, motionless.
//   - Between the two, both the centre (grid -> random target) and the
//     amplitude/speed (full -> 0) interpolate together.
//
// Also drives a separate, narrower vertical bob (peaks at swingCoverageNear,
// fades in only once inside zBobCoverageFar..zBobCoverageNear) and an
// always-on subtle per-axis idle float (independent phases, not
// proximity-gated at all) — the idle float pattern is lifted directly from
// proximity-wave.ts's own idle motion (same per-axis frequency multiples/
// IDLE_SPEED), not reimplemented from scratch.
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
const SWING_SPEED = 2.5; // rad/s, at full swingFactor (near proximity-wave.ts's waveSpeed default of 3)
const ZBOB_SPEED = 2.0; // rad/s, at full zBobFactor
const IDLE_SPEED = 1.0; // rad/s base — identical constant to proximity-wave.ts's own idle float

// How "close" the camera is measured as SCREEN COVERAGE of the tracked
// target image, not a 3D world distance (author's correction, 31.08.2026 —
// a raw camera-to-point distance doesn't account for viewing angle: tilting
// the phone relative to the printed image changes how "close" it visually
// reads without changing that distance). Coverage = how much of the
// camera's field of view the target image's own width fills, computed as
// the NDC (normalized device coordinate, [-1, 1] = the full screen) gap
// between the target's centre and one edge, projected through the live
// camera — i.e. roughly "target width as a fraction of screen width".
// A width-based proxy rather than true projected AREA (would need
// clipping a rotated quad against the screen rectangle) — close enough for
// a smooth, monotonic "closer = bigger number" signal, which is all a
// proximity ramp needs. This number keeps growing past 1 as the target
// image overflows the frame (project() does not clip out-of-view points),
// which is exactly right here: swingCoverageNear only needs to mark
// "close enough for full effect", not the literal point where the image
// stops fitting on screen.
//
// Computed at most ONCE PER FRAME regardless of how many placed copies ask
// for it (memoized by the `time` argument every tick() receives, which A-
// Frame guarantees is identical for every component ticking within the
// same frame) — every clone in the field shares the exact same target
// image, so recomputing this per clone would be pure waste.
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
  cachedCoverage = Math.abs(edge.x - center.x);
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
    // Target-image screen-coverage band (s. targetCoverage() above) the
    // swing ramps over. At/above swingCoverageNear -> full amplitude/
    // speed, centred on the grid position. At/below swingCoverageFar ->
    // zero amplitude, resting exactly on the fixed random target point.
    swingCoverageNear: { type: "number", default: 0.6 },
    swingCoverageFar: { type: "number", default: 0.15 },

    // Maximum vertical (local Y) bob amplitude, local units.
    zBobHeight: { type: "number", default: 0.03 },
    // Own, narrower coverage band for the vertical bob — starts fading in
    // only at zBobCoverageFar, peaks at zBobCoverageNear.
    zBobCoverageNear: { type: "number", default: 0.6 },
    zBobCoverageFar: { type: "number", default: 0.375 },

    // Always-on, proximity-independent per-axis idle float amplitude
    // (local units). 0 disables it.
    idleRadius: { type: "number", default: 0.01 },

    // Radial material-colour gradient by this object's own ground-plane
    // distance from the field's centre (local 0,0) — colorInner at the
    // centre, colorOuter at colorMaxDist or beyond.
    colorInner: { type: "string", default: "#FFF44F" }, // lemon yellow
    colorOuter: { type: "string", default: "#FF69B4" }, // hot pink
    colorMaxDist: { type: "number", default: 1 }
  },

  init() {
    const self = this as any;
    const p = self.el.object3D.position;
    self.baseX = p.x;
    self.baseY = p.y;
    self.baseZ = p.z;

    // Own fixed random swing direction + the fixed point it swings toward
    // at full amplitude ("die Zufallsposition") — rolled once per clone
    // with plain Math.random(), safe here (unlike random-field.ts's own
    // grid jitter) because this component is created exactly once per
    // placed copy and then runs continuously via tick(); nothing about
    // camera movement ever re-creates it.
    const angle = Math.random() * Math.PI * 2;
    self.swingDirX = Math.cos(angle);
    self.swingDirZ = Math.sin(angle);
    self.randomTargetX = self.baseX + self.swingDirX * self.data.swingRadius;
    self.randomTargetZ = self.baseZ + self.swingDirZ * self.data.swingRadius;

    self.swingPhase = Math.random() * Math.PI * 2;
    self.zBobPhase = Math.random() * Math.PI * 2;
    self.idlePhaseX = Math.random() * Math.PI * 2;
    self.idlePhaseY = Math.random() * Math.PI * 2;
    self.idlePhaseZ = Math.random() * Math.PI * 2;
    // Running phase accumulators for the swing/bob (s. tick()'s own
    // comment for why these can't just be `elapsedTime * currentFactor`).
    self.swingAngle = 0;
    self.zBobAngle = 0;

    // One-time radial colour gradient — see file header comment.
    const dist2D = Math.hypot(self.baseX, self.baseZ);
    const t = self.data.colorMaxDist > 0 ? dist2D / self.data.colorMaxDist : 0;
    self.el.setAttribute("material", "color", lerpHexColor(self.data.colorInner, self.data.colorOuter, t));
  },

  tick(time: number, timeDelta: number) {
    const self = this as any;
    const data = self.data;
    const camera = self.el.sceneEl.camera;
    if (!self.targetObject3D) {
      const targetEl = self.el.sceneEl.querySelector(data.targetSelector);
      if (!targetEl) return; // not in the DOM yet — retry next tick
      self.targetObject3D = targetEl.object3D;
    }
    if (!camera) return;
    const coverage = targetCoverage(time, camera, self.targetObject3D, data.targetHalfWidth);
    const t = time / 1000; // seconds, used only where the frequency is CONSTANT (idle float)
    // Clamped so a frame hitch (e.g. a stall right after init()) can't
    // suddenly jump the swing/bob phase forward.
    const dt = Math.min(0.1, Math.max(0, (timeDelta || 0) / 1000));

    // --- Radial swing: centre eases grid -> random target, amplitude/speed full -> 0 ---
    const swingFactor = rampFactor(coverage, data.swingCoverageFar, data.swingCoverageNear); // 0 at <=far, 1 at >=near
    const centerT = 1 - swingFactor; // 0 at near (centre = grid), 1 at far (centre = random target)
    const centerX = self.baseX + centerT * (self.randomTargetX - self.baseX);
    const centerZ = self.baseZ + centerT * (self.randomTargetZ - self.baseZ);
    // Phase is ACCUMULATED (angular velocity * dt), not `elapsedTime *
    // currentSpeed` — the latter would make the sine's argument jump
    // discontinuously whenever swingFactor changes (elapsedTime keeps
    // growing throughout the session, so multiplying it by a freshly
    // changed factor re-scales the ENTIRE accumulated angle at once,
    // not just its future growth). Accumulating means the speed genuinely
    // eases without ever jumping.
    self.swingAngle += SWING_SPEED * swingFactor * dt;
    const osc = data.swingRadius * swingFactor * Math.sin(self.swingAngle + self.swingPhase);
    const swingX = self.swingDirX * osc;
    const swingZ = self.swingDirZ * osc;

    // --- Vertical bob: own, narrower coverage band ---
    const zBobFactor = rampFactor(coverage, data.zBobCoverageFar, data.zBobCoverageNear);
    self.zBobAngle += ZBOB_SPEED * zBobFactor * dt;
    const zbob = data.zBobHeight * zBobFactor * Math.sin(self.zBobAngle + self.zBobPhase);

    // --- Idle: always-on subtle drift, every axis, independent phases/frequencies ---
    const r = data.idleRadius;
    const idleX = r > 0 ? r * Math.sin(t * IDLE_SPEED * 0.7 + self.idlePhaseX) : 0;
    const idleY = r > 0 ? r * Math.sin(t * IDLE_SPEED * 0.9 + self.idlePhaseY) : 0;
    const idleZ = r > 0 ? r * Math.sin(t * IDLE_SPEED * 1.1 + self.idlePhaseZ) : 0;

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
