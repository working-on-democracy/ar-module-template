import type { ComponentDefinition } from "aframe";
import { rampFactor } from "./proximity-fade-shared";

declare const AFRAME: any;

// AN ALLE! Material-/Shader-Showcase (archive-of-practice
// projects/an-alle/concepts/material-shader-showcase.md, "Bedienfeld weg"
// decision, 31.08.2026) — drives a SIBLING component's own `opacity`
// attribute (material-properties or dither-material, whichever technique
// this sphere demonstrates) from this entity's own live camera distance,
// every tick.
//
// Not built on proximity-fade/proximity-fade-dither
// (proximity-fade-shared.ts): those only patch materials on `model-loaded`
// (gltf-model children only — see their own usage examples, "wraps one or
// more gltf-model children") and apply their OWN onBeforeCompile dithering
// writer for the dithered variant, which cross-feature-reference-docs/
// RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md §4.4 warns not to combine with
// dither-material.ts's own writer on the same material. Driving the
// sibling component's existing `opacity` field instead needs no new
// material patch at all — material-properties/dither-material already
// each have their own "how do I show this opacity" implementation (real
// alpha / dithered discard), and both already support live partial
// updates via `el.setAttribute(componentName, "opacity", value)` without
// re-cloning from scratch.
export default {
  schema: {
    // Which sibling component's `opacity` field to drive.
    targetComponent: { type: "string", default: "material-properties" },
    // 6cm / 15cm — the threshold already established for AN ALLE!
    // proximity ramps elsewhere (s. zufallsverteilung-lod.md's
    // proximity-motion zBobNear/zBobFar history). Near = fully opaque,
    // far = fully transparent.
    near: { type: "number", default: 0.06 },
    far: { type: "number", default: 0.15 }
  },

  init() {
    const self = this as any;
    self.cameraPos = new AFRAME.THREE.Vector3();
    self.objectPos = new AFRAME.THREE.Vector3();
  },

  tick() {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    if (!camera) return;
    camera.getWorldPosition(self.cameraPos);
    self.el.object3D.getWorldPosition(self.objectPos);
    const dist = self.cameraPos.distanceTo(self.objectPos);
    const opacity = rampFactor(dist, self.data.far, self.data.near);
    self.el.setAttribute(self.data.targetComponent, "opacity", opacity);
  }
} as ComponentDefinition;
