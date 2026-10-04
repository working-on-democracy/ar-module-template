import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Follows another entity like 8th Wall's `xrextras-attach`, with the same
// schema, but works when the target lives in a different coordinate space —
// typically the host-owned camera, followed by a light inside a
// `legacy-space` hull:
//
//   <a-entity light="type: directional; target: #camera"
//             legacy-attach="target: camera; offset: 20 30 14"></a-entity>
//
// `target` is an element id without '#', like the original. Every tick the
// target's WORLD position is converted into this entity's parent space and
// `offset` is added there — so the offset stays in the old scene's units and
// axes, as authored, even though the hull is scaled and rotated.
//
// Why not xrextras-attach: it copies the target's LOCAL position plus offset
// into this entity's local position (verified in @8thwall/xrextras' source).
// That only works when both share a parent; for `target: camera` (outside
// the module) the light lands somewhere unrelated. Why not the template's
// attach-to: its offset is in world units/axes, so old offsets would have to
// be rescaled and re-rotated by hand for every hull placement.
// For targets inside the same parent the result equals xrextras-attach.
export default {
  schema: {
    target: { default: "" },
    offset: { default: "0 0 0" }
  },

  init() {
    const self = this as any;
    self.worldPos = new THREE.Vector3();
  },

  update() {
    const self = this as any;
    self.offset = self.data.offset.trim().split(/\s+/).map(Number);
    self.targetEl = null;
  },

  tick() {
    const self = this as any;
    if (!self.targetEl || !self.targetEl.isConnected) {
      self.targetEl = self.data.target ? document.getElementById(self.data.target) : null;
      if (!self.targetEl) return;
    }
    const obj = self.el.object3D;
    self.targetEl.object3D.getWorldPosition(self.worldPos);
    const local = obj.parent ? obj.parent.worldToLocal(self.worldPos) : self.worldPos;
    const [x = 0, y = 0, z = 0] = self.offset;
    obj.position.set(local.x + x, local.y + y, local.z + z);
  }
} as ComponentDefinition;
