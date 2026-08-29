import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";

declare const AFRAME: any;

// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md, Entscheidung 1) — a new
// component, not a reuse of proximity-wave: objects rise monotonically as the
// camera approaches, up to a settable maximum, with no swing and no idle
// float. Structurally the same ramp math as proximity-fade (distance -> 0-1
// factor via the shared `rampFactor` helper, see proximity-fade-shared.ts),
// just ONE ramp instead of two (a monotonic rise has no fade-out side to
// combine with), and applied to `position.y` instead of `material.opacity`.
//
// Put directly on a [random-field] template entity (or anywhere inside its
// subtree) — random-field's cloneItem() re-applies every live component's
// current `.data` onto each clone (see random-field.ts), so every placed
// copy gets its own independent, correctly-initialized instance, same as
// render-order already does in examples/random-field-lod-billboard-proximity-wave-scene.html.
// No "-group" variant needed, unlike proximity-wave.
export default {
  schema: {
    // Two distances from the camera (to `target`), in either order — same
    // order-independence as proximity-fade's ramps. Whichever is farther is
    // where the object sits at its resting height (factor 0), whichever is
    // nearer is where it's fully risen (factor 1).
    riseStart: { type: "number", default: 5 },
    riseEnd: { type: "number", default: 1.5 },
    // How far up (local units, along this entity's own Y) the object rises
    // at factor 1.
    riseHeight: { type: "number", default: 0.4 },
    // Local offset from this entity's own pivot, measured ONCE at init (not
    // re-read every tick like proximity-fade's `target` does) — this
    // component moves its own entity's position.y, so re-deriving a live
    // world-space target from that same, already-shifting transform every
    // frame would feed the rise back into its own distance measurement.
    // Caching the pre-rise reference point avoids that entirely; harmless
    // since neither this entity nor its parent (a random-field placement)
    // moves horizontally after spawn.
    target: { type: "vec3", default: { x: 0, y: 0, z: 0 } }
  },

  init() {
    const self = this as any;
    self.baseY = self.el.object3D.position.y;
    self.cameraPos = new AFRAME.THREE.Vector3();
    self.targetPos = new AFRAME.THREE.Vector3();
    const { x, y, z } = self.data.target;
    self.targetPos.set(x, y, z);
    self.el.object3D.localToWorld(self.targetPos);
  },

  tick() {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    if (!camera) return;
    camera.getWorldPosition(self.cameraPos);
    const dist = self.cameraPos.distanceTo(self.targetPos);

    // far (riseStart/riseEnd's larger value) -> 0 (resting), near -> 1
    // (fully risen) — same far/near resolution as proximity-fade's fade-in
    // ramp, order-independent.
    const far = Math.max(self.data.riseStart, self.data.riseEnd);
    const near = Math.min(self.data.riseStart, self.data.riseEnd);
    const factor = rampFactor(dist, far, near);

    self.el.object3D.position.y = self.baseY + factor * self.data.riseHeight;
  },

  remove() {
    const self = this as any;
    self.el.object3D.position.y = self.baseY;
  }
} as ComponentDefinition;
