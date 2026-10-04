import type { ComponentDefinition } from "aframe";
import { applyEnvMap } from "./env-map-shared";

declare const THREE: any;

// Static cube environment map (reflections) from six images:
//
//   <a-entity gltf-model="#model"
//             cubemap-static="posx: #my-posx; negx: #my-negx; posy: #my-posy;
//                             negy: #my-negy; posz: #my-posz; negz: #my-negz;
//                             reflectivity: 0.8"></a-entity>
//
// Each face is an asset id selector (or a plain URL). `materials` limits the
// effect to materials with those names (comma-separated); empty = every
// material that supports an envMap. `enableBackground` also shows the cube
// as the scene background (rarely wanted in camera AR).
//
// Ported from the Augmented Bahnhofsviertel 8th Wall projects
// (cubemap-static.js, used by 15 projects; the two versions found differ
// only in whitespace). Same name and schema, so old markup carries over;
// only the default face ids (#posx …) need renaming to the work's prefixed
// asset ids.
//
// Mechanical fixes against the original:
//   - Materials are cloned before envMap is written (see env-map-shared.ts).
//   - Reacts to `object3dset` filtered to type "mesh" (works for primitives
//     too, and for a model swapped later), as AGENTS.md §5 requires.
//   - `format` is accepted but ignored: THREE.RGBFormat no longer exists in
//     the three.js r158 that 8frame 1.5 bundles, so the original's
//     `texture.format = THREE[data.format]` would set `undefined`. The
//     loader's default (RGBA) renders the same images identically.
export default {
  multiple: true,
  schema: {
    posx: { default: "#posx" },
    posy: { default: "#posy" },
    posz: { default: "#posz" },
    negx: { default: "#negx" },
    negy: { default: "#negy" },
    negz: { default: "#negz" },
    extension: { default: "jpg", oneOf: ["jpg", "png"] },
    format: { default: "RGBFormat", oneOf: ["RGBFormat", "RGBAFormat"] },
    enableBackground: { default: false },
    reflectivity: { default: 1, min: 0, max: 1 },
    materials: { type: "array", default: [] }
  },

  init() {
    const self = this as any;
    const data = self.data;
    const toUrl = (urlOrId: string): string => {
      const img = urlOrId.startsWith("#")
        ? (document.querySelector(urlOrId) as HTMLImageElement | null)
        : null;
      return img ? img.src : urlOrId;
    };
    self.texture = new THREE.CubeTextureLoader().load([
      toUrl(data.posx), toUrl(data.negx),
      toUrl(data.posy), toUrl(data.negy),
      toUrl(data.posz), toUrl(data.negz)
    ]);

    self.apply = () => {
      const names: string[] = self.data.materials;
      applyEnvMap(self.el.getObject3D("mesh"), self.texture, {
        reflectivity: self.data.reflectivity,
        filter: names.length ? (m: any) => names.includes(m.name) : undefined
      });
    };
    self.onObject3DSet = (e: any) => {
      if (e.detail?.type === "mesh") self.apply();
    };
    self.el.addEventListener("object3dset", self.onObject3DSet);
  },

  update(oldData: any) {
    const self = this as any;
    const data = self.data;
    // Materials dropped from the list lose the map again.
    const removed: string[] = (oldData.materials ?? []).filter(
      (name: string) => !data.materials.includes(name)
    );
    if (removed.length) {
      applyEnvMap(self.el.getObject3D("mesh"), null, {
        reflectivity: 1,
        filter: (m: any) => removed.includes(m.name)
      });
    }
    self.apply();

    if (data.enableBackground && !oldData.enableBackground) {
      self.el.sceneEl.object3D.background = self.texture;
    } else if (!data.enableBackground && oldData.enableBackground) {
      self.el.sceneEl.object3D.background = null;
    }
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("object3dset", self.onObject3DSet);
    const names: string[] = self.data.materials;
    applyEnvMap(self.el.getObject3D("mesh"), null, {
      reflectivity: 1,
      filter: names.length ? (m: any) => names.includes(m.name) : undefined
    });
    if (self.data.enableBackground) self.el.sceneEl.object3D.background = null;
    self.texture?.dispose();
  }
} as ComponentDefinition;
