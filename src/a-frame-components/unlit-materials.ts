import { ComponentDefinition } from "aframe";

// Replaces every mesh material on the loaded glTF model with an unlit
// (MeshBasicMaterial) one, so the model shows its baked textures at full
// brightness regardless of scene lighting. Handy for models whose textures
// already contain lighting/shading and shouldn't be re-lit by the AR scene.
//
// We wait for `model-loaded` because the mesh only exists after the glTF has
// finished loading, then traverse it and swap each mesh's material while
// preserving its texture (`map`), alpha cutout and face `side`.
//
// Registered via the module.
export default {
  init(this: any) {
    const THREE = (window as any).THREE;

    this.el.addEventListener("model-loaded", () => {
      const mesh = this.el.getObject3D("mesh");
      if (!mesh) return;

      mesh.traverse((node: any) => {
        if (!node.isMesh) return;

        const oldMat = node.material;
        const newMat = new THREE.MeshBasicMaterial({
          map: oldMat.map,
          transparent: true,
          alphaTest: 0.5,
          side: oldMat.side
        });

        if (newMat.map) {
          newMat.map.colorSpace = THREE.SRGBColorSpace;
        }
        newMat.toneMapped = true;

        node.material = newMat;
      });
    });
  }
} as ComponentDefinition;
