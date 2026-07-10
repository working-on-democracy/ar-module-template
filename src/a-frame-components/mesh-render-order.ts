import type { ComponentDefinition } from "aframe";

// Fixes draw order for Rosa.glb's named sub-meshes (Mesh_1..Mesh_8), so
// overlapping transparent/layered parts composite correctly regardless of
// camera angle.
const RENDER_ORDER: Record<string, number> = {
  Mesh_1: 1,
  Mesh_2: 2,
  Mesh_3: 3,
  Mesh_4: 4,
  Mesh_5: 5,
  Mesh_6: 6,
  Mesh_7: 7,
  Mesh_8: 8
};

export default {
  init(this: any) {
    this.el.addEventListener("model-loaded", (e: any) => {
      const model = e.detail.model;
      model.traverse((node: any) => {
        if (node.isMesh && node.name in RENDER_ORDER) {
          node.renderOrder = RENDER_ORDER[node.name];
        }
      });
    });
  }
} as ComponentDefinition;
