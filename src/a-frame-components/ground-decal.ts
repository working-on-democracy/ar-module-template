import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Keeps a decal plane flat on the ground directly under its parent's pivot,
// regardless of how the parent is rotated/tilted, and excludes it from scene fog
// so it doesn't fade with distance.
export default {
  schema: {
    groundY: { type: "number", default: 0 }, // world-Y height of the ground
    live: { type: "boolean", default: false } // true = recompute every frame (for moving/rotating parents)
  },

  init() {
    const self = this as any;
    // Target world rotation: flat, texture up. -90° about X rotates a default
    // plane (normal defaults to +Z) so it faces +Y (up). If your plane exports
    // from Blender with a different starting orientation, adjust this (e.g. +90°
    // if it ends up upside-down).
    self.desiredWorldQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

    self.parentWorldQuat = new THREE.Quaternion();
    self.parentWorldPos = new THREE.Vector3();
    self.desiredWorldPos = new THREE.Vector3();

    self.applied = false;

    // Once a glb decal is loaded, take its materials out of the scene's fog
    // computation so the decal isn't dimmed with distance. (No-op for primitive
    // geometry, which emits no `model-loaded`.)
    self.el.addEventListener("model-loaded", () => {
      const mesh = self.el.getObject3D("mesh");
      if (!mesh) return;
      mesh.traverse((node: any) => {
        if (node.isMesh) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((m: any) => {
            m.fog = false;
          });
        }
      });
    });
  },

  tick() {
    const self = this as any;
    if (!self.data.live && self.applied) return; // in "static" mode, apply once only

    const obj = self.el.object3D;
    const parent = obj.parent;
    if (!parent) return;

    // --- Rotation: always flat, independent of the parent's rotation ---
    parent.getWorldQuaternion(self.parentWorldQuat);
    obj.quaternion.copy(self.parentWorldQuat).invert().multiply(self.desiredWorldQuat);

    // --- Position: exactly under the parent pivot, at the fixed ground height ---
    parent.getWorldPosition(self.parentWorldPos);
    self.desiredWorldPos.set(self.parentWorldPos.x, self.data.groundY, self.parentWorldPos.z);
    parent.worldToLocal(self.desiredWorldPos); // convert the world point to local coords
    obj.position.copy(self.desiredWorldPos);

    self.applied = true;
  }
} as ComponentDefinition;
