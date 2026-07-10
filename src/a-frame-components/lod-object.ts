import type { ComponentDefinition } from "aframe";

// A single level-of-detail instance. Under it:
//   - `.lod-mesh-group` holding the detailed `.lod-mesh` models
//   - a `.lod-billboard` stand-in that cross-fades in as the group fades out
// The group fades between nearDistance/farDistance; individual meshes may set
// their own thresholds via `data-lod-near` / `data-lod-far` attributes.
//
// This component only gathers materials and registers with the lod-manager on an
// ancestor entity — the manager does the actual per-frame blending.
export default {
  schema: {
    nearDistance: { type: "number", default: 15 },
    farDistance: { type: "number", default: 25 },
    fadeSpeed: { type: "number", default: 3 }
  },

  init() {
    const self = this as any;
    self.nearDistance = self.data.nearDistance;
    self.farDistance = self.data.farDistance;
    self.nearDistanceSq = self.nearDistance * self.nearDistance;
    self.farDistanceSq = self.farDistance * self.farDistance;
    self.fadeSpeed = self.data.fadeSpeed;
    self.currentBlend = 1;

    self.meshEls = Array.from(self.el.querySelectorAll(".lod-mesh"));
    self.billboardEl = self.el.querySelector(".lod-billboard");
    self.meshGroupObj = self.el.querySelector(".lod-mesh-group").object3D;

    self.meshMaterials = []; // parts WITHOUT their own thresholds
    self.overrides = []; // parts WITH their own thresholds (data-lod-near/-far)

    self.billboardObj = null;
    self.billboardMaterials = []; // an array — a glb can carry several materials

    self.meshEls.forEach((el: any) => {
      const nearAttr = el.getAttribute("data-lod-near");
      const farAttr = el.getAttribute("data-lod-far");
      const hasOverride = nearAttr !== null && farAttr !== null;

      let overrideEntry: any = null;
      if (hasOverride) {
        const near = parseFloat(nearAttr);
        const far = parseFloat(farAttr);
        overrideEntry = {
          nearDistance: near,
          farDistance: far,
          nearDistanceSq: near * near,
          farDistanceSq: far * far,
          currentBlend: 1,
          fadeSpeed: self.fadeSpeed,
          materials: []
        };
        self.overrides.push(overrideEntry);
      }

      el.addEventListener("model-loaded", () => {
        const mesh = el.getObject3D("mesh");
        mesh.traverse((node: any) => {
          if (node.isMesh) {
            // Clone so fading this instance's opacity doesn't affect shared
            // materials on other instances of the same model.
            node.material = Array.isArray(node.material)
              ? node.material.map((m: any) => m.clone())
              : node.material.clone();
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((m: any) => {
              m.transparent = true;
              if (hasOverride) {
                overrideEntry.materials.push(m);
              } else {
                self.meshMaterials.push(m);
              }
            });
          }
        });
      });
    });

    // Billboard is a glb (plane + PNG from Blender), not an A-Frame primitive.
    self.billboardEl.addEventListener("model-loaded", () => {
      self.billboardObj = self.billboardEl.getObject3D("mesh"); // a Group, not one mesh
      self.billboardMaterials = [];
      self.billboardObj.traverse((node: any) => {
        if (node.isMesh) {
          node.material = Array.isArray(node.material)
            ? node.material.map((m: any) => m.clone())
            : node.material.clone();
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((m: any) => {
            m.transparent = true;
            m.alphaTest = 0; // avoid binary cutout behaviour during the fade
            m.depthWrite = false; // avoid depth-sort popping on overlap
            m.opacity = 1 - self.currentBlend; // start correct, not at default opacity
            self.billboardMaterials.push(m);
          });
        }
      });
      self.billboardObj.visible = self.currentBlend < 0.99; // start correct, not default "true"
    });

    // The lod-manager was a scene system in the prototype; here it's a component
    // on an ancestor (the module root). Resolve it by walking up to the nearest
    // [lod-manager] entity and registering with its component instance.
    const managerEl = self.el.closest("[lod-manager]");
    self.manager = managerEl ? managerEl.components["lod-manager"] : null;
    if (self.manager) self.manager.register(self);
    else console.warn("[lod-object] no ancestor [lod-manager] found; LOD blending disabled");
  },

  remove() {
    const self = this as any;
    if (self.manager) self.manager.unregister(self);
  }
} as ComponentDefinition;
