import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Keeps a loaded model's PBR materials as real MeshStandardMaterials (unlike
// unlit-material, which flattens them to MeshBasicMaterial) so they still
// respond to scene lighting for their base color, but ensures the emissive
// channel actually drives a glow. Used on LICHT — the glowing light part of
// each glowstick.
//
// Why this is needed rather than just trusting the glTF import: these models'
// materials use the KHR_materials_emissive_strength extension (set in
// Blender) to push emissiveIntensity above the extension's un-boosted 0..1
// range — but A-Frame 1.3.0 bundles three.js r135, which predates that
// extension's native GLTFLoader support (~r152). On an unsupported
// extension, GLTFLoader still preserves the raw values on
// material.userData.gltfExtensions instead of applying them, so
// emissiveIntensity silently stays at its 1.0 default and the glow reads as
// dim/flat rather than the boosted brightness the artist authored. This
// reapplies that value by hand from the preserved raw data.
export default {
  schema: {
    // Multiplier on top of the resolved emissiveIntensity (the extension's
    // boosted value when present, otherwise whatever the glTF authored).
    // 1 = as-authored.
    intensity: { type: "number", default: 1 },
    // Optional hex colour (e.g. "#ff2d55") multiplied into the emissive
    // colour — lets different stick prefixes glow different colours from the
    // same source LICHT model. Empty (default) = no tint.
    tint: { type: "string", default: "" }
  },

  init() {
    const self = this as any;
    self.applyEmissive = self.applyEmissive.bind(self);
    // The model may already be present (event fired before we initialised); if so,
    // convert now. Always (re)listen so a later load / re-parse is handled too.
    if (self.el.getObject3D("mesh")) self.applyEmissive();
    self.el.addEventListener("model-loaded", self.applyEmissive);
  },

  applyEmissive() {
    const self = this as any;
    const mesh = self.el.getObject3D("mesh");
    if (!mesh) return;

    mesh.traverse((node: any) => {
      if (!node.isMesh) return;

      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const newMats = mats.map((oldMat: any) => {
        // Idempotent: leave a material we already processed alone.
        if (oldMat && oldMat.userData.emissiveApplied) return oldMat;

        // Clone rather than mutate in place: the loaded material may still be
        // shared with other instances of the same glTF asset (e.g. other
        // copies of this same stick prefix) until lod-object's own clone step
        // runs, so mutating it here could leak this instance's intensity/tint
        // onto — or be stomped by — another instance.
        const mat = oldMat.clone();

        const strength = oldMat.userData?.gltfExtensions?.KHR_materials_emissive_strength?.emissiveStrength;
        if (typeof strength === "number" && mat.emissiveIntensity === 1) {
          mat.emissiveIntensity = strength;
        }

        if (self.data.intensity !== 1) {
          mat.emissiveIntensity *= self.data.intensity;
        }

        if (self.data.tint) {
          mat.emissive.multiply(new THREE.Color(self.data.tint));
        }

        mat.userData.emissiveApplied = true;
        return mat;
      });

      node.material = Array.isArray(node.material) ? newMats : newMats[0];

      // Matches the shadow behavior LICHT had under unlit-material — a
      // light-emitting part shouldn't cast or receive shadows.
      node.castShadow = false;
      node.receiveShadow = false;
    });
  }
} as ComponentDefinition;