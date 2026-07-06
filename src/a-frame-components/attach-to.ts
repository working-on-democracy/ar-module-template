import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Makes an entity follow another entity's world position (+ a world-space
// offset), each frame. Our stand-in for 8th Wall's `xrextras-attach`, used so a
// light can track the host-provided camera (`target: #camera`) or a scene anchor
// (`target: #group`) even though it isn't a DOM child of either.
//
// Position only — rotation/scale are left untouched (the lights that use this
// don't need to inherit orientation). The target is resolved lazily so it works
// even if the target entity (e.g. the camera) mounts after this one.
export default {
  schema: {
    target: { type: "selector" },
    offset: { type: "vec3", default: { x: 0, y: 0, z: 0 } }
  },

  init() {
    const self = this as any;
    self.worldPos = new THREE.Vector3();
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
  }
} as ComponentDefinition;
