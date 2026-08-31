import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";

declare const AFRAME: any;

// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md, "Proximity-Swing"
// decision, 31.08.2026) — replaces this scene's earlier `proximity-rise`
// (monotonic grow-on-approach over 1-3m) AND random-field's static
// `randomness`-driven jitter (baked once at placement) with ONE live,
// per-instance motion driven by camera distance over a much closer 20-60cm
// band: as the camera nears, each object swings back and forth along its
// own fixed random direction, the swing's CENTRE eases from its grid
// position (far) toward a fixed random target point (near)... actually see
// below, the near/far mapping is the opposite of a naive read — re-derived
// from the spec directly:
//
//   - At swingNear (20cm, closest): swing amplitude is FULL (= swingRadius)
//     and the swing's centre IS the grid position ("Nullpunkt").
//   - At swingFar (60cm): amplitude has eased to 0 and the centre has eased
//     to the fixed random target point — so the object ends up resting
//     exactly there, motionless.
//   - Between the two, both the centre (grid -> random target) and the
//     amplitude/speed (full -> 0) interpolate together.
//
// Also drives a separate, narrower vertical bob (peaks at swingNear,
// fades in only once inside zBobNear..zBobFar) and an always-on subtle
// per-axis idle float (independent phases, not proximity-gated at all) —
// the idle float pattern is lifted directly from proximity-wave.ts's own
// idle motion (same per-axis frequency multiples/IDLE_SPEED), not
// reimplemented from scratch.
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
    // Local offset from this entity, converted to world space once at
    // init (not every tick like proximity-fade's `target` does) — this
    // component moves its own entity's position, so re-deriving a live
    // world-space target from that same, already-moving transform every
    // frame would feed the swing back into its own distance measurement
    // (identical reasoning to proximity-rise.ts's own `target` handling).
    target: { type: "vec3", default: { x: 0, y: 0, z: 0 } },

    // Maximum horizontal (local X/Z) swing amplitude, local units — the
    // caller computes this the same way random-field's old bounded-grid
    // jitter radius was computed (grid spacing / 2 - own footprint
    // radius), just live instead of baked into a placed position.
    swingRadius: { type: "number", default: 0.05 },
    // Camera-to-target distance band (metres) the swing ramps over.
    // Nearer than swingNear -> full amplitude/speed, centred on the grid
    // position. Farther than swingFar -> zero amplitude, resting exactly
    // on the fixed random target point.
    swingNear: { type: "number", default: 0.2 },
    swingFar: { type: "number", default: 0.6 },

    // Maximum vertical (local Y) bob amplitude, local units.
    zBobHeight: { type: "number", default: 0.03 },
    // Own, narrower distance band for the vertical bob — starts fading in
    // only at zBobFar, peaks at zBobNear.
    zBobNear: { type: "number", default: 0.2 },
    zBobFar: { type: "number", default: 0.4 },

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

    self.cameraPos = new AFRAME.THREE.Vector3();
    self.targetPos = new AFRAME.THREE.Vector3();
    const { x, y, z } = self.data.target;
    self.targetPos.set(x, y, z);
    self.el.object3D.localToWorld(self.targetPos);

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

    // One-time radial colour gradient — see file header comment.
    const dist2D = Math.hypot(self.baseX, self.baseZ);
    const t = self.data.colorMaxDist > 0 ? dist2D / self.data.colorMaxDist : 0;
    self.el.setAttribute("material", "color", lerpHexColor(self.data.colorInner, self.data.colorOuter, t));
  },

  tick(time: number) {
    const self = this as any;
    const data = self.data;
    const camera = self.el.sceneEl.camera;
    if (!camera) return;
    camera.getWorldPosition(self.cameraPos);
    const dist = self.cameraPos.distanceTo(self.targetPos);
    const t = time / 1000; // seconds

    // --- Radial swing: centre eases grid -> random target, amplitude/speed full -> 0 ---
    const swingFactor = rampFactor(dist, data.swingFar, data.swingNear); // 0 at >=far, 1 at <=near
    const centerT = 1 - swingFactor; // 0 at near (centre = grid), 1 at far (centre = random target)
    const centerX = self.baseX + centerT * (self.randomTargetX - self.baseX);
    const centerZ = self.baseZ + centerT * (self.randomTargetZ - self.baseZ);
    const osc = data.swingRadius * swingFactor * Math.sin(t * SWING_SPEED * swingFactor + self.swingPhase);
    const swingX = self.swingDirX * osc;
    const swingZ = self.swingDirZ * osc;

    // --- Vertical bob: own, narrower distance band ---
    const zBobFactor = rampFactor(dist, data.zBobFar, data.zBobNear);
    const zbob = data.zBobHeight * zBobFactor * Math.sin(t * ZBOB_SPEED * zBobFactor + self.zBobPhase);

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
