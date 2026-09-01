import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";

declare const AFRAME: any;

// Generic continuous rotation around one local axis (material-shader-
// showcase, 01.09.2026, archive-of-practice projects/an-alle/concepts/
// material-shader-showcase.md) — replaces A-Frame's own built-in
// `animation` component wherever a rotation's SPEED itself needs to react
// live to external state (a hold gesture, camera proximity, ...): the
// built-in component's own `dur` is fixed at start time, so re-setting it
// to speed up/slow down restarts the animation from its `from` value,
// causing a visible jump/reset instead of a smooth speed change. Not
// feature/scene-specific (unprefixed name, s. manifest.ts's own naming-
// convention comment) — any Themenfeld could reuse this for any
// continuously-spinning entity whose speed should react to something.
//
// Effective speed = baseSpeedDegPerSec * (1 + proximity term + hold term),
// the two terms independent and ADDITIVE (both default to a no-op, i.e. a
// plain constant-speed spin identical to the old `animation` component):
//   - proximity term: ramps 0 -> 1 as the camera gets closer to this
//     entity's own fixed anchor point (world position captured ONCE at
//     init() — this entity's own position never changes, only its
//     rotation, so a one-time capture is exact, not an approximation; same
//     "frozen anchor" pattern as proximity-swing.ts's own zBobAnchorPos).
//   - hold term: driven externally via the live `holdBoost` attribute (e.g.
//     bound to a Vue computed already tracking a press-and-hold gesture
//     elsewhere in the scene) — a plain 0..1 number, no proximity
//     measurement of its own.
// Author's explicit ordering (material-shader-showcase, 01.09.2026): both
// should speed the rotation up, but a hold should cause a BIGGER speedup
// than proximity alone — enforced by the CALLER setting
// holdSpeedMultiplier higher than proximitySpeedMultiplier, not by
// anything in this component; the two terms simply add, so both active at
// once (close AND holding) speeds things up further still rather than one
// overriding the other.
export default {
  schema: {
    // Which local axis to spin around.
    axis: { type: "string", default: "z" },
    // 1 or -1 — lets two instances share the same baseSpeedDegPerSec while
    // spinning opposite ways (s. this scene's alternating orbit lights).
    direction: { type: "number", default: 1 },
    baseSpeedDegPerSec: { type: "number", default: 0 },
    // Camera-distance band (same units as the scene's own world space) the
    // proximity term ramps over — both default to 0, i.e. a no-op (the
    // schema's own `proximityFar !== proximityNear` guard in tick() below
    // skips the ramp entirely rather than dividing by zero).
    proximityNear: { type: "number", default: 0 },
    proximityFar: { type: "number", default: 0 },
    proximitySpeedMultiplier: { type: "number", default: 1 },
    holdBoost: { type: "number", default: 0 },
    holdSpeedMultiplier: { type: "number", default: 1 }
  },

  init() {
    const self = this as any;
    self.angleDeg = 0;
    self.anchorPos = new AFRAME.THREE.Vector3();
    self.el.object3D.getWorldPosition(self.anchorPos);
    self.cameraPos = new AFRAME.THREE.Vector3();
  },

  tick(_time: number, timeDelta: number) {
    const self = this as any;
    const data = self.data;
    // Clamped so a frame hitch can't suddenly jump the rotation forward.
    const dt = Math.min(0.1, Math.max(0, (timeDelta || 0) / 1000));

    let proximityFactor = 0;
    const camera = self.el.sceneEl.camera;
    if (camera && data.proximityFar !== data.proximityNear) {
      camera.getWorldPosition(self.cameraPos);
      const dist = self.cameraPos.distanceTo(self.anchorPos);
      // distAtZero=far, distAtOne=near — 0 at/beyond far, 1 at/within near.
      proximityFactor = rampFactor(dist, data.proximityFar, data.proximityNear);
    }

    const speedMultiplier =
      1 +
      (data.proximitySpeedMultiplier - 1) * proximityFactor +
      (data.holdSpeedMultiplier - 1) * data.holdBoost;

    self.angleDeg = (self.angleDeg + data.direction * data.baseSpeedDegPerSec * speedMultiplier * dt) % 360;
    self.el.object3D.rotation[data.axis as "x" | "y" | "z"] = AFRAME.THREE.MathUtils.degToRad(self.angleDeg);
  }
} as ComponentDefinition;
