import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";

// Makes an entity continuously orbit within an annulus ("band") around a
// center entity — inner/outer radius, slow forward-facing crawl, subtle Y
// floating, and soft avoidance of both the band's edges and other
// `wander-in-band` siblings. Use alongside (not instead of) `trim-loop-clip`:
// this component only ever touches the entity's own `position`/`rotation.y`,
// `trim-loop-clip` only touches the glTF's internal skeleton animation — they
// don't conflict, and everything parented under this entity (the model, its
// `sound` component's audio node) rides along for free.
//
//   <a-entity gltf-model="#Seed1" trim-loop-clip="..."
//             wander-in-band="center: #mainEntity; innerRadius: 3; outerRadius: 7;
//                             floatIntensity: 0.15; speed: 0.3; chaos: 0.5">
//   </a-entity>
//
// All schema values are shared across every entity carrying the component,
// but each instance seeds its own random heading/timing/orbit-direction state
// in init(), so three entities with identical props still wander independently.
//
// Movement model: the baseline heading always follows the *tangent* of the
// circle at the entity's current position — i.e. it behaves like an orbit, so
// "keep turning slightly" and "eventually complete the loop" are automatic
// consequences of ordinary circular motion, not something bolted on. `chaos`
// then adds a randomly-retargeted angular *deviation* from that tangent (both
// how large the deviation can get and how often it changes scale with
// `chaos`), so low chaos traces a clean circle and high chaos lets the entity
// turn sharply on itself and temporarily abandon the orbit. Near the band's
// edges a gentle spiral-back bias is blended in *within a tolerance zone*
// before any hard correction, so drifting past the nominal radius doesn't
// cause a sudden snap-turn. Forward is assumed to be the model's local +Z
// (rotation.y follows the heading directly, plus `yawOffset` — see below).

declare const THREE: any;

// Internal tuning, not exposed on the schema — the user-facing dial for
// "how chaotic" is `chaos`; these just define the range it interpolates over.
const RETARGET_INTERVAL_CALM: [number, number] = [4, 8]; // seconds, chaos = 0
const RETARGET_INTERVAL_WILD: [number, number] = [0.8, 2]; // seconds, chaos = 1
const DEVIATION_DEG_CALM = 4; // max random deviation from the tangent, chaos = 0 (~clean circle)
const DEVIATION_DEG_WILD = 150; // chaos = 1 (can turn sharply on itself)
const HEADING_SMOOTH_RATE = 1; // rad/s-ish exponential approach to target heading
// Speed variation is intentionally subtle and slow (see the class comment) —
// a small range, smoothed over several seconds so pace drifts rather than skips.
const SPEED_VARIATION_WILD = 0.3; // +/- fraction of base speed at chaos = 1
const SPEED_SMOOTH_RATE = 0.15;
// How far past inner/outerRadius the entity may drift before a firm
// correction kicks in, as a fraction of the band's width. The absolute floor
// below and SEPARATION_RADIUS are tuned in meters against this schema's own
// default outerRadius (7, see the class comment's example) — a fork using a
// much smaller/larger outerRadius (e.g. a tabletop-scale footprint under a
// tenth of a meter across) scales both proportionally via boundaryScale in
// tick(), instead of applying these as fixed absolutes regardless of scale.
// Confirmed as the cause of wanderers drifting outside a small band no
// matter how tight the GUI slider was set (device testing, 30.08.2026): at
// that scale the 0.5m floor alone dwarfed the entire band, so the soft
// correction never engaged and the hard clamp only caught drift far beyond
// the visible scene.
// Lowered 0.4 -> 0.15 (author's correction, 02.09.2026: wanderers were
// visibly spending a lot of time genuinely OUTSIDE the band, not just
// hugging its inner tolerance edge) — on this branch's own footprint-scaled
// outerRadius, TOLERANCE_FRACTION * band width dominates over
// TOLERANCE_FLOOR_REFERENCE below (the latter stays here for the small-
// footprint floor case the comment above already covers), so this directly
// shrinks how far past the nominal radius drifting is tolerated before the
// soft correction actively pulls back.
const TOLERANCE_FRACTION = 0.15;
const TOLERANCE_FLOOR_REFERENCE = 0.5; // meters, at REFERENCE_OUTER_RADIUS
const SEPARATION_RADIUS_REFERENCE = 2; // meters, at REFERENCE_OUTER_RADIUS
const REFERENCE_OUTER_RADIUS = 7; // this schema's own default outerRadius
// AN ALLE! Animationssystem Wanderer (01.09.2026, Autor-Korrektur: "die
// Wanderer brauchen mehr Erlaubnis... sich mehr um die eigene Achse zu
// drehen, um besser wieder ihren eigentlichen Pfad erreichen zu können")
// — previously defined but never actually wired into tick() at all (the
// heading blend below used the same flat HEADING_SMOOTH_RATE regardless
// of how far outside the band an entity had drifted, so correcting course
// was exactly as slow as ordinary wandering — confirmed as the cause of
// wanderers drifting far outside the band and staying there for a while).
// Now blended in via boundaryBias (s. step 3/4 below): full HEADING_SMOOTH_RATE
// while inside tolerance, ramping up to this much faster turn rate the
// further outside it an entity is.
// Raised 4 -> 6 alongside the tighter TOLERANCE_FRACTION above (author's
// correction, 02.09.2026) — the smaller tolerance zone needs a snappier
// turn-back to actually keep excursions past the band brief, not just less
// wide.
const BOUNDARY_TURN_RATE = 6;
const SEPARATION_TURN_RATE = 3;
// Fraction of the band's [innerRadius, outerRadius] range spawn points are
// drawn from (0 = always innerRadius, 1 = full range, s. init() below).
const SPAWN_RADIUS_BIAS = 0.6;
const FLOAT_FREQ = 0.6; // Hz-ish, fixed — floatIntensity controls amplitude only

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export default {
  schema: {
    // Entity the band is centered on (typically the main character).
    center: { type: "selector", default: "" },
    innerRadius: { type: "number", default: 3 },
    outerRadius: { type: "number", default: 7 },
    // Amplitude (meters) of the subtle up/down bobbing around the entity's
    // starting Y (its "ground" height).
    floatIntensity: { type: "number", default: 0.15 },
    // Orbit speed in meters/second.
    speed: { type: "number", default: 0.3 },
    // 0..1 — how much and how often the heading deviates from a clean orbit.
    chaos: { type: "number", default: 0.5, min: 0, max: 1 },
    // Degrees added to the computed heading, in case a model's forward axis
    // isn't +Z — try 180 if it appears to walk backwards.
    yawOffset: { type: "number", default: 0 },

    // Optional camera-proximity speed modulation (AN ALLE! Animationssystem
    // Wanderer, 01.09.2026, "Proximity: Wanderer-Tempo" — Autor-Entscheidung).
    // Real 3D world distance from the camera to `center` (NOT screen
    // coverage — there's no single tracked-image entity guaranteed present
    // for every consumer of this generic component, unlike proximity-motion.ts).
    // Both distances default to 0/0, a no-op (multiplier pinned at 1
    // regardless of speedNear/FarMultiplier) — existing callers (Fanyu_module
    // etc.) that never set these two keep their exact old behaviour.
    speedProximityNear: { type: "number", default: 0 },
    speedProximityFar: { type: "number", default: 0 },
    // Multiplier applied to `speed` at/within speedProximityNear and at/
    // beyond speedProximityFar respectively — which is numerically larger
    // is up to the caller (e.g. >1 near/<1 far reads as "faster as the
    // camera approaches").
    speedNearMultiplier: { type: "number", default: 1 },
    speedFarMultiplier: { type: "number", default: 1 },
    // Scales the sibling-separation radius (s. tick()'s own step 5) —
    // default 1 is a no-op (existing callers unaffected). AN ALLE!
    // Animationssystem Wanderer (01.09.2026, Autor-Entscheidung: "sie
    // verkeilen sich gerade gerne ineinander") raises this on a branch
    // whose wanderers are small/densely packed relative to the old
    // room-scale default this radius was tuned for.
    separationRadiusMultiplier: { type: "number", default: 1 }
  },

  init() {
    const self = this as any;
    const pos = self.el.object3D.position;

    self.baseY = pos.y;
    self.orbitDir = Math.random() < 0.5 ? 1 : -1;
    self.deviation = 0;
    self.targetDeviation = 0;
    self.speedMul = 1;
    self.targetSpeedMul = 1;
    self.floatPhase = Math.random() * Math.PI * 2;
    self.retargetTimer = Math.random() * 2; // stagger the first retarget per instance
    self.warnedNoCenter = false;

    // Spawn at a random point inside the band rather than trusting whatever
    // static position/rotation was authored in HTML — once this component
    // owns the entity, those become just an initial (now-irrelevant) pose.
    // Heading starts tangent to the circle at that point, so motion is
    // orderly from frame one instead of snapping into an orbit.
    const center = self.data.center?.object3D?.position;
    let spawnAngle = Math.random() * Math.PI * 2;
    if (center) {
      // Biased toward innerRadius (author's request, 02.09.2026: start
      // positions should sit a bit more toward the inside of the band) —
      // SPAWN_RADIUS_BIAS scales the random factor down from its full [0,1]
      // range before lerping, so spawn points only ever land in the inner
      // SPAWN_RADIUS_BIAS fraction of the band instead of anywhere across
      // its full width.
      const radius = lerp(self.data.innerRadius, self.data.outerRadius, Math.random() * SPAWN_RADIUS_BIAS);
      pos.x = center.x + Math.sin(spawnAngle) * radius;
      pos.z = center.z + Math.cos(spawnAngle) * radius;
    }
    self.heading = spawnAngle + self.orbitDir * (Math.PI / 2);
  },

  pickNewTarget() {
    const self = this as any;
    const data = self.data;
    const devMaxDeg = lerp(DEVIATION_DEG_CALM, DEVIATION_DEG_WILD, data.chaos);
    self.targetDeviation = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * devMaxDeg);
    self.targetSpeedMul = 1 + (Math.random() * 2 - 1) * data.chaos * SPEED_VARIATION_WILD;

    const [calmMin, calmMax] = RETARGET_INTERVAL_CALM;
    const [wildMin, wildMax] = RETARGET_INTERVAL_WILD;
    const min = lerp(calmMin, wildMin, data.chaos);
    const max = lerp(calmMax, wildMax, data.chaos);
    self.retargetTimer = min + Math.random() * (max - min);
  },

  tick(time: number, timeDelta: number) {
    const self = this as any;
    const data = self.data;
    const dt = Math.min(timeDelta / 1000, 0.1); // clamp to avoid huge jumps after a stall

    const centerObj = data.center?.object3D;
    if (!centerObj) {
      if (!self.warnedNoCenter) {
        console.warn('[wander-in-band] no "center" entity resolved — staying put.', self.el);
        self.warnedNoCenter = true;
      }
      return;
    }
    const center = centerObj.position;
    const pos = self.el.object3D.position;

    // 1. Retarget the chaos deviation + speed multiplier at random intervals.
    self.retargetTimer -= dt;
    if (self.retargetTimer <= 0) self.pickNewTarget();
    self.deviation = lerpAngle(self.deviation, self.targetDeviation, 1 - Math.exp(-HEADING_SMOOTH_RATE * dt));
    self.speedMul = lerp(self.speedMul, self.targetSpeedMul, 1 - Math.exp(-SPEED_SMOOTH_RATE * dt));

    // 2. Baseline heading: tangent to the circle at the current position,
    // rotated consistently by this instance's orbitDir — this alone produces
    // a steady, self-turning orbit even with zero chaos.
    const offX = pos.x - center.x;
    const offZ = pos.z - center.z;
    const dist = Math.hypot(offX, offZ) || 1e-4;
    const outwardAngle = Math.atan2(offX, offZ);
    let tangentAngle = outwardAngle + self.orbitDir * (Math.PI / 2);

    // 3. Soft edge handling: within the tolerance zone beyond inner/outer,
    // bias the tangent itself inward/outward proportionally (a gradual
    // spiral back into the band) rather than overriding the heading outright
    // — nothing sudden happens exactly at the nominal radius.
    const boundaryScale = data.outerRadius / REFERENCE_OUTER_RADIUS;
    const tolerance = Math.max(
      (data.outerRadius - data.innerRadius) * TOLERANCE_FRACTION,
      TOLERANCE_FLOOR_REFERENCE * boundaryScale
    );
    // boundaryBias (0 inside tolerance, up to 1 well outside) also drives
    // step 4's heading turn RATE below, not just the tangent's own target
    // direction here.
    //
    // Redesigned 02.09.2026 (author's correction: wanderers were still
    // spending most of their time right at/past the outer edge, circling
    // it rather than actually heading back toward the band's own middle) —
    // two changes from the original single tolerance-ramp:
    //   1. Once genuinely PAST outerRadius, boundaryBias jumps straight to
    //      1 (full inward priority) instead of ramping across the whole
    //      tolerance zone — the old gradual ramp let the tangential/orbit
    //      component dominate for most of an excursion, which is exactly
    //      what read as "circling outside the band". `tolerance` still
    //      exists purely as the hard-clamp safety margin in step 7 below.
    //   2. A new ramp zone between the band's own midpoint and outerRadius
    //      pulls the heading inward with increasing strength BEFORE the
    //      entity actually exits — so by the time it's back inside, it's
    //      already aimed toward the middle rather than just re-crossing the
    //      boundary and immediately resuming a peripheral orbit there.
    const midRadius = (data.innerRadius + data.outerRadius) / 2;
    let boundaryBias = 0;
    if (dist > data.outerRadius) {
      boundaryBias = 1;
      tangentAngle = lerpAngle(tangentAngle, outwardAngle + Math.PI, boundaryBias);
    } else if (dist > midRadius) {
      boundaryBias = (dist - midRadius) / (data.outerRadius - midRadius);
      tangentAngle = lerpAngle(tangentAngle, outwardAngle + Math.PI, boundaryBias);
    } else if (dist < data.innerRadius) {
      boundaryBias = THREE.MathUtils.clamp((data.innerRadius - dist) / tolerance, 0, 1);
      tangentAngle = lerpAngle(tangentAngle, outwardAngle, boundaryBias);
    }

    // 4. Chaos deviation layered on top of the tangent, smoothed toward the
    // combined target heading — at BOUNDARY_TURN_RATE instead of the calm
    // HEADING_SMOOTH_RATE once boundaryBias rises (s. step 3 above and
    // BOUNDARY_TURN_RATE's own comment), so an entity that's drifted
    // outside the band can actually turn around fast enough to get back,
    // rather than slowly arcing further out while it catches up.
    const targetHeading = tangentAngle + self.deviation;
    const headingRate = lerp(HEADING_SMOOTH_RATE, BOUNDARY_TURN_RATE, boundaryBias);
    self.heading = lerpAngle(self.heading, targetHeading, 1 - Math.exp(-headingRate * dt));

    // 5. Soft separation from other wandering siblings (avoid overlap).
    if (!self.siblings) {
      self.siblings = Array.from(self.el.parentEl?.querySelectorAll("[wander-in-band]") ?? [])
        .filter((el: any) => el !== self.el);
    }
    let repelX = 0, repelZ = 0;
    for (const other of self.siblings) {
      const op = (other as any).object3D?.position;
      if (!op) continue;
      const dx = pos.x - op.x, dz = pos.z - op.z;
      const d = Math.hypot(dx, dz);
      const separationRadius = SEPARATION_RADIUS_REFERENCE * boundaryScale * data.separationRadiusMultiplier;
      if (d > 0 && d < separationRadius) {
        const w = (separationRadius - d) / separationRadius;
        repelX += (dx / d) * w;
        repelZ += (dz / d) * w;
      }
    }
    const repelMag = Math.hypot(repelX, repelZ);
    if (repelMag > 0.01) {
      const awayAngle = Math.atan2(repelX, repelZ);
      self.heading = lerpAngle(self.heading, awayAngle, Math.min(repelMag, 1) * (1 - Math.exp(-SEPARATION_TURN_RATE * dt)));
    }

    // 5b. Optional camera-proximity speed modulation (s. schema comment
    // above) — skipped entirely (proximitySpeedMul stays 1) unless the
    // caller set at least one of the two distances away from its 0 default.
    // Measured against `center`'s WORLD position the first time this runs,
    // then frozen (self.speedAnchorWorldPos) — NOT re-read live every
    // frame. Confirmed as a real bug (device testing, 01.09.2026): `center`
    // may itself be animated (e.g. bobbing up/down independently of this
    // component), and re-reading a live, already-moving position back into
    // this distance measurement fed that motion back into wander speed —
    // the wanderers visibly sped up purely because the centre floated
    // higher, nothing to do with the camera at all. Same fix/reasoning as
    // proximity-motion.ts's own zBobAnchorPos. A caller whose `center`
    // never moves (the common case) sees no behaviour change at all — the
    // frozen and live positions are identical.
    let proximitySpeedMul = 1;
    if (data.speedProximityNear !== 0 || data.speedProximityFar !== 0) {
      const camera = self.el.sceneEl.camera;
      if (camera) {
        if (!self.cameraPos) self.cameraPos = new THREE.Vector3();
        if (!self.speedAnchorWorldPos) {
          self.speedAnchorWorldPos = new THREE.Vector3();
          centerObj.getWorldPosition(self.speedAnchorWorldPos);
        }
        camera.getWorldPosition(self.cameraPos);
        const camDist = self.cameraPos.distanceTo(self.speedAnchorWorldPos);
        const proximityFactor = rampFactor(camDist, data.speedProximityNear, data.speedProximityFar);
        proximitySpeedMul = lerp(data.speedNearMultiplier, data.speedFarMultiplier, proximityFactor);
      }
    }

    // 6. Advance along the (now-steered) heading.
    const step = data.speed * self.speedMul * proximitySpeedMul * dt;
    pos.x += Math.sin(self.heading) * step;
    pos.z += Math.cos(self.heading) * step;

    // 7. Hard safety clamp, generous enough to honor the tolerance zone —
    // the soft steering above should keep it well inside this, it's just a
    // guarantee against edge cases (e.g. spawn overlap, a big chaos spike).
    const newOffX = pos.x - center.x;
    const newOffZ = pos.z - center.z;
    const newDist = Math.hypot(newOffX, newOffZ) || 1e-4;
    const hardMin = data.innerRadius - tolerance;
    const hardMax = data.outerRadius + tolerance;
    if (newDist > hardMax || newDist < hardMin) {
      const clamped = THREE.MathUtils.clamp(newDist, hardMin, hardMax);
      const scale = clamped / newDist;
      pos.x = center.x + newOffX * scale;
      pos.z = center.z + newOffZ * scale;
    }

    // 8. Ground-hugging float + facing direction of travel.
    pos.y = self.baseY + Math.sin(time / 1000 * FLOAT_FREQ * Math.PI * 2 + self.floatPhase) * data.floatIntensity;
    self.el.object3D.rotation.y = self.heading + THREE.MathUtils.degToRad(data.yawOffset);
  }
} as ComponentDefinition;
