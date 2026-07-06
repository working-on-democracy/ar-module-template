import type { ComponentDefinition } from "aframe";

// Sets three.js `renderOrder` on every mesh of the loaded model, so the scene can
// control draw order for overlapping transparent surfaces (higher = drawn later,
// i.e. on top). Single-property schema: `render-order="2"`.
export default {
  schema: { type: "number", default: 0 },
  init() {
    const self = this as any;
    self.el.addEventListener("model-loaded", () => {
      const mesh = self.el.getObject3D("mesh");
      if (!mesh) return;
      mesh.traverse((node: any) => {
        if (node.isMesh) node.renderOrder = self.data;
      });
    });
  }
} as ComponentDefinition;
