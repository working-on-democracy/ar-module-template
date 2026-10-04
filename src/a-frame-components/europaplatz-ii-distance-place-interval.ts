import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// #4 Europaplatz II: after "Start", places the work's slat models one by one
// at a distance in front of the camera, at an interval. Port of the
// original's `distance-place-interval` (place-model.js, built with
// scaleTo(1.5) + rotateFacingTheCamera):
//
//   <a-entity europaplatz-ii-distance-place-interval="models: #a, #b, …;
//             interval: 1000; runs: 40; distance: 33"></a-entity>
//
// Same rules as the original: every `interval` ms the next model (in list
// order, cycling) appears `distance` ± `variation`/2 units along the
// camera's view direction (pitch included), dropped to the floor (y = 0),
// turned to face the camera and springing up from 0.001 to `scale` within
// 750 ms (elastic ease); stops after runs - 1 placements (the original's
// off-by-one, kept). Shadows: cast, not received, like the original.
//
// Why a port: the original added raw three.js objects to the scene root,
// read the camera's LOCAL position as scene coordinates, and needed TWEEN.
// Here the models are A-Frame entities inside this entity (put it inside the
// legacy-space hull, at the old scene origin): the camera's world position
// and direction are converted into this entity's space, so distances stay
// in the old units. `startInterval()` is called by the module's Start
// button; models only appear once the hull is placed (the original waited
// for `realityready`). The scale tween uses A-Frame's animation component
// (easeOutElastic) instead of TWEEN's Elastic.Out — same character, slightly
// different spring curve.
export default {
  schema: {
    models: { type: "array", default: [] },
    interval: { type: "int", default: 2000 },
    runs: { type: "int", default: 10 },
    auto: { type: "boolean", default: true },
    distance: { type: "number", default: 20 },
    variation: { type: "number", default: 3 },
    scale: { type: "number", default: 1.5 }
  },

  init() {
    const self = this as any;
    self.camPos = new THREE.Vector3();
    self.camDir = new THREE.Vector3();
    self.invQuat = new THREE.Quaternion();
    self.timer = null;
    if (self.data.auto) self.startInterval();
  },

  startInterval() {
    const self = this as any;
    self.clearInterval();
    let i = 0;
    let c = 0;
    self.timer = setInterval(() => {
      const hull = self.el.closest("[legacy-space]") as any;
      if (hull && !hull.components["legacy-space"]?.placed) return;
      const models: string[] = self.data.models;
      if (!models.length) return;
      self.placeModel(models[i]);
      i = (i + 1) % models.length;
      c++;
      if (c === self.data.runs - 1) self.clearInterval();
    }, self.data.interval);
  },

  clearInterval() {
    const self = this as any;
    if (self.timer) clearInterval(self.timer);
    self.timer = null;
  },

  placeModel(model: string) {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    if (!camera) return;
    const obj = self.el.object3D;
    obj.updateMatrixWorld();
    // Camera position and view direction in this entity's (old scene) space.
    camera.getWorldPosition(self.camPos);
    obj.worldToLocal(self.camPos);
    camera.getWorldDirection(self.camDir);
    obj.getWorldQuaternion(self.invQuat).invert();
    self.camDir.applyQuaternion(self.invQuat).normalize();

    const distance = self.data.distance + (Math.random() - 0.5) * self.data.variation;
    const x = self.camPos.x + self.camDir.x * distance;
    const z = self.camPos.z + self.camDir.z * distance;
    const facing = Math.atan2(self.camPos.x - x, self.camPos.z - z) * 180 / Math.PI;
    const s = self.data.scale;

    const el = document.createElement("a-entity");
    el.setAttribute("gltf-model", model);
    el.setAttribute("position", `${x} 0 ${z}`);
    el.setAttribute("rotation", `0 ${facing} 0`);
    el.setAttribute("scale", "0.001 0.001 0.001");
    el.setAttribute("shadow", "cast: true; receive: false");
    // Grow once the mesh is there, like the original's tween in the loader
    // callback.
    const onMesh = (e: any) => {
      if (e.detail?.type !== "mesh") return;
      el.removeEventListener("object3dset", onMesh);
      el.setAttribute("animation__grow",
        `property: scale; from: 0.001 0.001 0.001; to: ${s} ${s} ${s}; dur: 750; easing: easeOutElastic`);
    };
    el.addEventListener("object3dset", onMesh);
    self.el.appendChild(el);
  },

  remove() {
    (this as any).clearInterval();
  }
} as ComponentDefinition;
