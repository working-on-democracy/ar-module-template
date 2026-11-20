import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Turns every mesh of its entity into an invisible occluder: it writes depth
// but no colour, so the camera image shows through while virtual content
// behind it is hidden. Only the FRONT faces are drawn (side: front by
// default) — from outside, a closed shape hides what is inside it; once the
// camera is inside the shape, all faces turn their back to it, nothing is
// drawn and the contents appear. Works on any entity (primitive or glTF).
//
//   <a-sphere occluder radius="0.6"></a-sphere>
//   <a-entity gltf-model="#bottle"></a-entity>   ← inside the sphere, visible only from inside
//
// renderOrder (default -1) makes the occluder draw before ordinary content
// (renderOrder 0) — an occluder only hides what is drawn after it, and three
// r137 (host) / r158 (dev:ar) would otherwise sort opaque objects differently.
// Transparent content inside is sorted after opaque content anyway and stays
// hidden as long as it lies behind the occluder's surface.
//
// opacity > 0 (with `color`) additionally shows the occluder as a tinted,
// half-transparent surface — handy while placing things; it still occludes
// (the depth-only mesh stays), and like the occluder it is front-faces only,
// so it vanishes too once the camera is inside. opacity: 0 = invisible.
//
// The material is replaced rather than mutated (no shared glTF material is
// touched). Re-checked every tick because A-Frame's material component can
// assign its material after the mesh appears.
export default {
  schema: {
    renderOrder: { type: "number", default: -1 },
    side: { type: "string", default: "front", oneOf: ["front", "double"] },
    opacity: { type: "number", default: 0 },
    color: { type: "color", default: "#ffffff" }
  },

  init() {
    const self = this as any;
    self.material = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: self.data.side === "double" ? THREE.DoubleSide : THREE.FrontSide
    });
    self.overlayMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide
    });
    self.overlays = [];
  },

  update(oldData: any) {
    const self = this as any;
    if (oldData && oldData.side !== self.data.side) {
      self.material.side = self.data.side === "double" ? THREE.DoubleSide : THREE.FrontSide;
      self.material.needsUpdate = true;
    }
    self.overlayMaterial.color.set(self.data.color);
    self.overlayMaterial.opacity = self.data.opacity;
    self.overlayMaterial.side = self.material.side;
    self.overlayMaterial.needsUpdate = true;
    self.overlays.forEach((o: any) => { o.visible = self.data.opacity > 0; });
    self.dirty = true;
  },

  tick() {
    const self = this as any;
    const mesh = self.el.getObject3D("mesh");
    if (!mesh) return;
    mesh.traverse((node: any) => {
      if (!node.isMesh || node.userData.occluderOverlay) return;
      if (!node.userData.occluderOverlayAdded) {
        // Same geometry and transform as the depth-only mesh, drawn after it
        // (transparent pass, equal depth passes LessEqual).
        const overlay = new THREE.Mesh(node.geometry, self.overlayMaterial);
        overlay.userData.occluderOverlay = true;
        overlay.visible = self.data.opacity > 0;
        node.add(overlay);
        node.userData.occluderOverlayAdded = true;
        self.overlays.push(overlay);
      }
      if (node.material !== self.material || self.dirty) {
        node.material = self.material;
        node.renderOrder = self.data.renderOrder;
        node.castShadow = false;
        node.receiveShadow = false;
      }
    });
    self.dirty = false;
  },

  remove() {
    const self = this as any;
    self.overlays.forEach((o: any) => o.parent?.remove(o));
    self.material.dispose();
    self.overlayMaterial.dispose();
  }
} as ComponentDefinition;
