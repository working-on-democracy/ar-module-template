import type { ComponentDefinition } from "aframe";

// A-Frame exposes three.js as a global (set by aframe.min.js). Use it rather than
// importing the `three` package, so materials/instanceof checks share A-Frame's
// single THREE instance.
declare const THREE: any;

// Replaces a loaded model's PBR materials with flat MeshBasicMaterials, so it
// renders fully lit regardless of scene lighting — used for neon/glow meshes and
// the billboard PNG. Ported verbatim from the prototype's `unlit-material`.
export default {
  schema: {
    // Fold a material's emissive glow into the flat base color, so effects like
    // neon leuchten survive the conversion to an unlit material.
    keepEmissive: { type: "boolean", default: true }
  },

  init() {
    const self = this as any;
    self.el.addEventListener("model-loaded", () => {
      const mesh = self.el.getObject3D("mesh");
      if (!mesh) return;

      mesh.traverse((node: any) => {
        if (!node.isMesh) return;

        const mats = Array.isArray(node.material) ? node.material : [node.material];
        const newMats = mats.map((oldMat: any) => {
          const basicMat = new THREE.MeshBasicMaterial({
            map: oldMat.map || null,
            color: oldMat.color ? oldMat.color.clone() : new THREE.Color(0xffffff),
            transparent: oldMat.transparent,
            opacity: oldMat.opacity,
            side: oldMat.side,
            alphaTest: oldMat.alphaTest,
            depthWrite: oldMat.depthWrite,
            vertexColors: oldMat.vertexColors
          });

          // Carry an emissive glow over as color so the visual effect survives.
          if (self.data.keepEmissive && oldMat.emissive && oldMat.emissiveIntensity > 0) {
            basicMat.color.lerp(oldMat.emissive, Math.min(oldMat.emissiveIntensity, 1));
          }

          return basicMat;
        });

        node.material = Array.isArray(node.material) ? newMats : newMats[0];
        node.castShadow = false; // unlit objects sensibly cast no shadow…
        node.receiveShadow = false; // …and receive none either
      });
    });
  }
} as ComponentDefinition;
