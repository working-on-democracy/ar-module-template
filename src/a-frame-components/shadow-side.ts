import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Which faces of a model are drawn into shadow maps — the cure for shadow
// acne on self-shadowing models, set on the model instead of the light.
//
//   <a-entity gltf-model="#model" shadow="cast: true; receive: true" shadow-side="back"></a-entity>
//
// Shadow acne is the fine striped/moiré self-shadow a model throws onto its
// own lit faces when they're compared against a shadow map rendered from
// those same faces. Rendering only the BACK faces into the shadow map moves
// the depth the lit front faces are compared against to the far side of
// the model, so they no longer shadow themselves; real shadows one part
// throws onto another stay. Works for closed meshes (AI-generated and
// stylized models are); open single-sided surfaces (a plane, a leaf) then
// cast no shadow from their front — use `double` or `front` there.
//
// Values: back (default) | front | double | auto (= material default).
// The alternative on the light, `shadow.normalBias`, isn't exposed by
// A-Frame's `light` component and changes every model that light shadows.
//
// Materials are cloned before they're changed (glTF instances share them —
// AGENTS.md §5) and restored on remove(); another component's
// onBeforeCompile patch on them is kept (clone() drops it). Applies on
// `object3dset` (type mesh), so primitives and models swapped later work.
// Combines with grain-shimmer in either order: material.clone() copies
// shadowSide, so grain-shimmer's clone keeps it.
const SIDES: Record<string, () => number | null> = {
  back: () => THREE.BackSide,
  front: () => THREE.FrontSide,
  double: () => THREE.DoubleSide,
  auto: () => null
};

export default {
  schema: { default: "back", oneOf: ["back", "front", "double", "auto"] },

  init() {
    const self = this as any;
    self.originals = new Map(); // mesh -> original material(s)
    self.onObject3DSet = (e: any) => {
      if (e.detail?.type === "mesh") self.apply();
    };
    self.el.addEventListener("object3dset", self.onObject3DSet);
  },

  update() {
    const self = this as any;
    self.restore();
    self.apply();
  },

  apply() {
    const self = this as any;
    const root = self.el.getObject3D("mesh");
    if (!root) return;
    const side = SIDES[self.data]();
    root.traverse((node: any) => {
      if (!node.isMesh || self.originals.has(node)) return;
      self.originals.set(node, node.material);
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const patched = mats.map((m: any) => {
        if (!m) return m;
        const material = m.clone();
        // clone() drops another component's shader patch — keep it.
        if (m.onBeforeCompile) material.onBeforeCompile = m.onBeforeCompile;
        if (Object.prototype.hasOwnProperty.call(m, "customProgramCacheKey")) {
          material.customProgramCacheKey = m.customProgramCacheKey;
        }
        material.shadowSide = side;
        return material;
      });
      node.material = Array.isArray(node.material) ? patched : patched[0];
    });
  },

  restore() {
    const self = this as any;
    self.originals.forEach((original: any, node: any) => {
      const current = Array.isArray(node.material) ? node.material : [node.material];
      current.forEach((m: any) => m?.dispose());
      node.material = original;
    });
    self.originals.clear();
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("object3dset", self.onObject3DSet);
    self.restore();
  }
} as ComponentDefinition;
