import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Makes an entity follow another entity's world position (+ a world-space
// offset), each frame. A stand-in for 8th Wall's `xrextras-attach`, used so
// something can track the host-provided camera (`target: #camera`) or any
// other scene entity (`target: #someId`) even though it isn't a DOM child
// of it.
//
// Position only by default — rotation/scale are left untouched, unless
// `copyRotation` is set (e.g. a headlamp-style spotlight that must also
// always face the same way as the camera it's attached to, not just follow
// its position). The target is resolved lazily on every tick (not cached at
// init) so it works even if the target entity (e.g. the camera) mounts
// after this one.
//
// Ported from Gyumin_module, `copyRotation` added on top (30.08.2026, s.
// archive-of-practice projects/an-alle/concepts/material-shader-showcase.md)
// — already fully generic in the source (no naming-convention or
// asset-specific logic). Writes object3D.position (and, opt-in,
// object3D.quaternion) directly, every tick — see
// guides/ATTACH-TO-FEATURE-GUIDE.md's incompatibilities section before combining
// with wander-in-band, proximity-wave, or anything else that also writes
// this entity's position every tick.
export default {
  schema: {
    target: { type: "selector" },
    offset: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    copyRotation: { type: "boolean", default: false }
  },

  init() {
    const self = this as any;
    self.worldPos = new THREE.Vector3();
    self.worldQuat = new THREE.Quaternion();
    self.parentQuat = new THREE.Quaternion();
  },

  tick() {
    const self = this as any;
    const targetEl = self.data.target;
    if (!targetEl || !targetEl.object3D) return;

    targetEl.object3D.getWorldPosition(self.worldPos);
    self.worldPos.x += self.data.offset.x;
    self.worldPos.y += self.data.offset.y;
    self.worldPos.z += self.data.offset.z;

    // Convert the desired world position into this entity's parent space, so it
    // lands correctly regardless of any parent transform.
    const parent = self.el.object3D.parent;
    if (parent) parent.worldToLocal(self.worldPos);
    self.el.object3D.position.copy(self.worldPos);

    if (self.data.copyRotation) {
      targetEl.object3D.getWorldQuaternion(self.worldQuat);
      if (parent) {
        parent.getWorldQuaternion(self.parentQuat);
        self.worldQuat.premultiply(self.parentQuat.invert());
      }
      self.el.object3D.quaternion.copy(self.worldQuat);
    }
  }
} as ComponentDefinition;
