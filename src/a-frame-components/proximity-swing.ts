import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";

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
//      At proximityCoverageNear (screen coverage, closest): full amplitude
//      (= swingRadius), centred on the grid position. At
//      proximityCoverageFar (farthest): amplitude eased to 0, centre eased
//      to a fixed random target point — the object ends up resting exactly
//      there, motionless.
//   2. Vertical bob (local Y, height) — a SEPARATE per-object 3D distance
//      measurement (camera to this object's own fixed grid position, NOT
//      screen coverage, and NOT this object's currently-animated position
//      — author's correction, 31.08.2026): 0 at zBobFar (20cm), full at
//      zBobNear (6cm).
//   3. Idle float (all three local axes) — gated by the SAME
//      `proximityFactor` as the swing (0 at proximityCoverageFar, full at
//      proximityCoverageNear), intensifying mostly through SPEED rather
//      than amplitude as it ramps up — kept deliberately tiny on the
//      ground-plane axes (idleGroundRadius) so neighbouring objects'
//      independent idle drift can't make them overlap; the vertical axis
//      (idleHeightRadius) can be a little more generous since vertical
//      drift alone never causes horizontal overlap.
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
const ZBOB_SPEED = 2.0; // rad/s, at full zBobFactor
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
    // Screen-coverage band (s. targetCoverage() above) both the swing AND
    // the idle float (below) ramp over. At/above proximityCoverageNear ->
    // full swing amplitude/speed (centred on the grid position) and full
    // idle float. At/below proximityCoverageFar -> zero swing amplitude
    // (resting on the fixed random target point) and no idle float at all.
    proximityCoverageNear: { type: "number", default: 0.9 },
    proximityCoverageFar: { type: "number", default: 0.3 },

    // Maximum vertical (local Y) bob amplitude, local units.
    zBobHeight: { type: "number", default: 0.03 },
    // Own, SEPARATE per-object 3D distance band (metres, camera to this
    // object's own fixed grid position — s. file header) the vertical bob
    // ramps over. At/beyond zBobFar (20cm) -> no bob. At/within zBobNear
    // (6cm) -> full bob.
    zBobNear: { type: "number", default: 0.06 },
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
    colorMaxDist: { type: "number", default: 1 }
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
    // Running phase accumulators (s. tick()'s own comment for why these
    // can't just be `elapsedTime * currentFactor`).
    self.swingAngle = 0;
    self.zBobAngle = 0;
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

    // --- Radial swing: centre eases grid -> random target, amplitude/speed full -> 0 ---
    const centerT = 1 - proximityFactor; // 0 at near (centre = grid), 1 at far (centre = random target)
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

    // --- Vertical bob: own, SEPARATE per-object 3D distance (not screen coverage) ---
    const objDist = self.cameraPos.distanceTo(self.zBobAnchorPos);
    const zBobFactor = rampFactor(objDist, data.zBobFar, data.zBobNear); // 0 at >=20cm, 1 at <=6cm
    self.zBobAngle += ZBOB_SPEED * zBobFactor * dt;
    const zbob = data.zBobHeight * zBobFactor * Math.sin(self.zBobAngle + self.zBobPhase);

    // --- Idle float: gated by proximityFactor, intensifies mostly via speed, kept tiny on X/Z ---
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
