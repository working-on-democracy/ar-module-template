import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";
import { seededRandom } from "./seeded-random";
import { screenCoverage } from "../screen-coverage";

declare const AFRAME: any;

// AN ALLE! Zwischen-Basis (archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md, "Swipe + Proximity statt
// GUI" decision, 31.08.2026) — generalized from zufallsverteilung-lod's
// `proximity-swing.ts` (same branch's first end-to-end build of this
// idea) into a reusable building block for any Themenfeld that places
// primitive objects and wants them to react to how close the camera gets,
// with no GUI panel at all. FOUR live, independently-configurable
// motions, all additive on top of this object's own authored position
// ("base"):
//
//   1. Radial swing (local X/Z, ground plane) — driven by `proximityFactor`
//      (s. below): swings back/forth along its own fixed random direction.
//      At proximityCoverageFar (screen coverage): ZERO amplitude, centred
//      exactly on the base position — still. At proximityCoverageNear:
//      full amplitude (= swingRadius), centre eased to a fixed random
//      target point instead — i.e. approaching is what turns a still
//      arrangement chaotic, not the other way round. Set swingRadius: 0 to
//      disable this motion entirely.
//   2. Vertical height (local Y) — a SEPARATE per-object 3D distance
//      measurement (camera to this object's own fixed base position, NOT
//      screen coverage, and NOT this object's currently-animated
//      position — re-reading a live, already-moving position back into
//      its own distance measurement would feed back on itself). A smooth,
//      NON-oscillating height between zBobHeightMax (at/beyond zBobFar)
//      and zBobHeightMin (at/within zBobNear) — which bound is "near" and
//      which is "far" is entirely up to the two values you set; there's
//      no assumed direction. Set zBobHeightMax = zBobHeightMin to disable
//      this motion (constant height).
//   3. Idle float (all three local axes) — gated by the SAME
//      `proximityFactor` as the swing, same linear ramp: fully STILL at
//      proximityCoverageFar, full amplitude/speed at proximityCoverageNear.
//      Ground-plane (idleGroundRadius) and height (idleHeightRadius) have
//      independent amplitudes — keep the ground-plane one small if
//      several instances sit close together, so their independent drift
//      can't make them overlap. Set both to 0 to disable.
//   4. One-time radial material-colour gradient, set once at init from
//      this object's own distance from local (0,0) — colorInner at the
//      centre, colorOuter at colorMaxDist or beyond. Defaults to lemon
//      yellow -> hot pink (AN ALLE!'s shared colour scheme, s. concept
//      doc) — override colorInner/colorOuter for a different scheme, or
//      set them equal to disable the gradient (uniform colour). Requires
//      a `material` component already present on this entity (e.g. a
//      primitive's own `material="color: ..."`).
//
// Put directly on a template entity referenced by [random-field]'s
// `items` — random-field's cloneItem() re-applies every live component's
// current `.data` onto each clone (see random-field.ts), so every placed
// copy gets its own independent, correctly-initialized instance. Not
// dependent on random-field specifically, though: works on any entity,
// standalone. If the entity WAS placed by random-field's bounded/grid mode
// and carries its `data-grid-index` attribute, the swing direction (and
// only the swing direction) is seeded from that index instead of
// `Math.random()` — keeps the swing arrangement stable across a
// remount that only changed OTHER entities' placement (e.g. a density
// swipe), rather than re-rolling a new chaotic arrangement on every
// remount. Falls back to `Math.random()` with no `data-grid-index`
// present (e.g. entities placed by hand, or by random-field's unbounded
// strip mode) — one-shot, that's the correct behaviour for a template
// entity that's never itself cloned.
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

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
    // #ground — matches the Zwischen-Basis footprint convention's ground
    // plane id, s. zwischen-basis.md). A plain string, not A-Frame's
    // `selector` schema type — an entity placed by random-field can
    // connect to the DOM before its #ground sibling has, so tick()
    // resolves and caches the element itself, lazily, retrying until it's
    // found rather than risking a one-shot schema-parse-time lookup
    // finding nothing.
    targetSelector: { type: "string", default: "#ground" },
    // Half the target image's own LOCAL width — the point screenCoverage()
    // projects to measure apparent screen coverage. Set this to your
    // scene's own FOOTPRINT_WIDTH / 2.
    targetHalfWidth: { type: "number", default: 0.5 },

    // Maximum horizontal (local X/Z) swing amplitude, local units. 0
    // disables the swing motion (stays at the base position).
    swingRadius: { type: "number", default: 0.05 },
    // rad/s, at full proximityFactor.
    swingSpeed: { type: "number", default: 2.5 },
    // Screen-coverage band (s. screen-coverage.ts) both the swing AND the
    // idle float (below) ramp over. At/above proximityCoverageNear -> full
    // swing amplitude/speed (centred on the base position) and full idle
    // float. At/below proximityCoverageFar -> zero swing amplitude
    // (resting on the fixed random target point) and no idle float at all.
    proximityCoverageNear: { type: "number", default: 1.0 },
    proximityCoverageFar: { type: "number", default: 0.5 },

    // Vertical (local Y) height bounds, local units — zBobHeightMax at/
    // beyond zBobFar, easing to zBobHeightMin at/within zBobNear. Which of
    // the two is numerically larger is entirely up to you (this scene's
    // own zufallsverteilung-lod branch uses zBobHeightMax > zBobHeightMin
    // with zBobFar > zBobNear, i.e. "highest when far, sinks as you
    // approach" — the opposite pairing works exactly the same way if
    // that's what a different scene wants). Equal values disable this
    // motion (constant height).
    zBobHeightMax: { type: "number", default: 0.1 },
    zBobHeightMin: { type: "number", default: 0.04 },
    // Own, SEPARATE per-object 3D distance band (metres, camera to this
    // object's own fixed base position) the vertical height ramps over.
    zBobNear: { type: "number", default: 0.04 },
    zBobFar: { type: "number", default: 0.15 },

    // Idle float amplitude (local units), gated by proximityFactor (s.
    // above). 0 disables it on that axis group.
    idleGroundRadius: { type: "number", default: 0.005 },
    idleHeightRadius: { type: "number", default: 0.015 },
    // rad/s base — the three axes use independent multiples of this
    // (0.7x/0.9x/1.1x) so they don't move in lockstep.
    idleSpeed: { type: "number", default: 1.0 },

    // One-time radial material-colour gradient (s. file header, point 4).
    // Defaults to AN ALLE!'s shared scheme (lemon yellow -> hot pink);
    // equal colours disable the gradient.
    colorInner: { type: "string", default: "#FFF44F" }, // lemon yellow
    colorOuter: { type: "string", default: "#FF69B4" }, // hot pink
    colorMaxDist: { type: "number", default: 1 },

    // While true, skips ALL motion above and holds this object exactly at
    // its base position — e.g. for a scene-level tutorial/intro sequence
    // where live proximity-driven motion would visually compete with
    // whatever the intro itself is trying to demonstrate.
    frozen: { type: "boolean", default: false }
  },

  init() {
    const self = this as any;
    const p = self.el.object3D.position;
    self.baseX = p.x;
    self.baseY = p.y;
    self.baseZ = p.z;

    self.cameraPos = new AFRAME.THREE.Vector3();
    // The vertical height's own measurement point — this object's fixed
    // base position in WORLD space, captured once before any animation
    // moves it (measuring from a currently-animated position would feed
    // its own motion back into its own distance reading).
    self.zBobAnchorPos = new AFRAME.THREE.Vector3(0, 0, 0);
    self.el.object3D.localToWorld(self.zBobAnchorPos);

    // Own fixed swing direction + the fixed point it swings toward at full
    // amplitude — seeded from this entity's own `data-grid-index`
    // attribute if present (s. file header), NOT `Math.random()` alone.
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
    // distance, s. tick()'s own comment.
    self.swingAngle = 0;
    self.idleAngleX = 0;
    self.idleAngleY = 0;
    self.idleAngleZ = 0;

    // One-time radial colour gradient — see file header comment, point 4.
    const dist2D = Math.hypot(self.baseX, self.baseZ);
    const t = self.data.colorMaxDist > 0 ? dist2D / self.data.colorMaxDist : 0;
    self.el.setAttribute("material", "color", lerpHexColor(self.data.colorInner, self.data.colorOuter, t));
  },

  tick(time: number, timeDelta: number) {
    const self = this as any;
    const data = self.data;
    if (data.frozen) {
      // Y rests at baseY + zBobHeightMin rather than bare baseY, so
      // unfreezing (e.g. once an intro sequence ends) doesn't cause a
      // visible jump if live proximity would already sit near zBobNear at
      // that point (the common case: the camera is usually already close
      // once whatever triggered "frozen: false" has happened).
      self.el.object3D.position.set(self.baseX, self.baseY + data.zBobHeightMin, self.baseZ);
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
    // suddenly jump the swing/idle phase forward.
    const dt = Math.min(0.1, Math.max(0, (timeDelta || 0) / 1000));

    camera.getWorldPosition(self.cameraPos);

    // --- Shared proximity factor (screen coverage): drives BOTH the swing and the idle float ---
    const coverage = screenCoverage(time, camera, self.targetObject3D, data.targetHalfWidth);
    const proximityFactor = rampFactor(coverage, data.proximityCoverageFar, data.proximityCoverageNear); // 0 at <=far, 1 at >=near

    // --- Radial swing: centre eases base -> random target, amplitude/speed 0 -> full ---
    const centerT = proximityFactor; // 0 at far (centre = base, still), 1 at near (centre = random target, swinging)
    const centerX = self.baseX + centerT * (self.randomTargetX - self.baseX);
    const centerZ = self.baseZ + centerT * (self.randomTargetZ - self.baseZ);
    // Phase is ACCUMULATED (angular velocity * dt), not `elapsedTime *
    // currentSpeed` — the latter would make the sine's argument jump
    // discontinuously whenever the factor changes (elapsedTime keeps
    // growing throughout the session, so multiplying it by a freshly
    // changed factor re-scales the ENTIRE accumulated angle at once, not
    // just its future growth). Accumulating means the speed genuinely
    // eases without ever jumping.
    self.swingAngle += data.swingSpeed * proximityFactor * dt;
    const osc = data.swingRadius * proximityFactor * Math.sin(self.swingAngle + self.swingPhase);
    const swingX = self.swingDirX * osc;
    const swingZ = self.swingDirZ * osc;

    // --- Vertical height: own, SEPARATE per-object 3D distance (not screen coverage) ---
    // Direct, non-oscillating height — no sine, no phase/angle accumulator.
    const objDist = self.cameraPos.distanceTo(self.zBobAnchorPos);
    const zBobFactor = rampFactor(objDist, data.zBobNear, data.zBobFar); // 0 at <=zBobNear -> zBobHeightMin, 1 at >=zBobFar -> zBobHeightMax
    const zbob = data.zBobHeightMin + zBobFactor * (data.zBobHeightMax - data.zBobHeightMin);

    // --- Idle float: same linear proximityFactor ramp as the swing (0 = fully still) ---
    self.idleAngleX += data.idleSpeed * 0.7 * proximityFactor * dt;
    self.idleAngleY += data.idleSpeed * 0.9 * proximityFactor * dt;
    self.idleAngleZ += data.idleSpeed * 1.1 * proximityFactor * dt;
    const idleX = data.idleGroundRadius * proximityFactor * Math.sin(self.idleAngleX + self.idlePhaseX);
    const idleY = data.idleHeightRadius * proximityFactor * Math.sin(self.idleAngleY + self.idlePhaseY);
    const idleZ = data.idleGroundRadius * proximityFactor * Math.sin(self.idleAngleZ + self.idlePhaseZ);

    // All motions are additive on top of the base/random-target position.
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
