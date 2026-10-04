import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// #5 Unwetter am Steg's placement cursor, ported from the original
// tap-place-cursor.js: the entity (a ring on the ground) follows the point
// where the screen centre hits the ground; every tap places the model at the
// cursor and shows it.
//
//   <a-ring tap-place-cursor="model: #my-model; ground: #my-ground"></a-ring>
//
// Same behaviour as the original. Changes, all needed to work inside a
// legacy-space hull and the host:
//   - The ground hit point (world space) is converted into the cursor's
//     parent space before it's written to the local position — the original
//     wrote world coordinates straight into the local position (same bug
//     class as xrextras-hold-drag). The fixed height y = 0.1 stays in the
//     parent's (old scene) units, as authored.
//   - Taps come from legacy-space's `legacy-space-tap` event instead of the
//     scene `click`, which iOS suppresses behind xrextras-gesture-detector.
//   - The camera is the scene's active camera instead of #camera's camera
//     object looked up once in init (the host's camera may not be ready).
//   - model/ground are schema selectors instead of hardcoded #model/#ground
//     (the ids are prefixed per work in the shared host scene).
//   - The ring's yaw follows the camera's yaw relative to the hull (the
//     original copied the camera's local Euler y, which assumed an
//     unrotated parent). The ring is symmetric, so this is cosmetic.
// Registered under a work-prefixed name: another module could register a
// different "tap-place-cursor", and A-Frame keeps whichever came first.
export default {
  schema: {
    model: { type: "selector" },
    ground: { type: "selector" }
  },

  init() {
    const self = this as any;
    self.raycaster = new THREE.Raycaster();
    self.rayOrigin = new THREE.Vector2(0, 0);
    self.cursorLocation = new THREE.Vector3();
    self.hasHit = false;
    self.hull = self.el.closest("[legacy-space]");
    if (self.data.model) {
      self.data.model.setAttribute("shadow", { receive: false });
      self.data.model.object3D.visible = false;
    }
    self.onTap = () => {
      const model = self.data.model;
      if (!model) return;
      model.object3D.position.copy(self.el.object3D.position);
      model.object3D.visible = true;
    };
    self.hull?.addEventListener("legacy-space-tap", self.onTap);
  },

  tick() {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    const ground = self.data.ground;
    if (!camera || !ground) return;
    self.raycaster.setFromCamera(self.rayOrigin, camera);
    const hits = self.raycaster.intersectObject(ground.object3D, true);
    const obj = self.el.object3D;
    if (hits.length > 0) {
      const point = hits[0].point.clone();
      self.cursorLocation.copy(obj.parent ? obj.parent.worldToLocal(point) : point);
      self.hasHit = true;
    }
    obj.position.y = 0.1;
    if (self.hasHit) obj.position.lerp(self.cursorLocation, 0.4);

    // Relative yaw camera vs. hull (cosmetic for the symmetric ring).
    const camQuat = new THREE.Quaternion();
    camera.getWorldQuaternion(camQuat);
    const camYaw = new THREE.Euler().setFromQuaternion(camQuat, "YXZ").y;
    const hullQuat = new THREE.Quaternion();
    (self.hull?.object3D ?? self.el.sceneEl.object3D).getWorldQuaternion(hullQuat);
    const hullYaw = new THREE.Euler().setFromQuaternion(hullQuat, "YXZ").y;
    obj.rotation.y = camYaw - hullYaw;
  },

  remove() {
    const self = this as any;
    self.hull?.removeEventListener("legacy-space-tap", self.onTap);
  }
} as ComponentDefinition;
