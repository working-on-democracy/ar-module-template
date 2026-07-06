import type { ComponentDefinition } from "aframe";
import { disableFrustumCulling } from "../frustum-culling";

// Keeps animated skinned meshes under this entity from being frustum-culled.
//
// `model-loaded` bubbles, so we delegate from the component's own entity rather
// than doing a one-shot `querySelectorAll('[gltf-model]')` in init(): that would
// miss children not yet parsed when init() runs, and any gltf-model entity added
// later. The listener is removed on teardown.
export default {
  init() {
    const self = this as any;
    self.onModelLoaded = (e: any) => disableFrustumCulling(e.target);
    self.el.addEventListener("model-loaded", self.onModelLoaded);
  },
  remove() {
    const self = this as any;
    self.el.removeEventListener("model-loaded", self.onModelLoaded);
  }
} as ComponentDefinition;