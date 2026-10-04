import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Walk-through portal logic of the old 8th Wall portal works (#22 Privileged
// I, #7 I can't get no), ported from their identical portal-components.js
// (`portal-camera`):
//
//   <a-entity legacy-portal="contents: #my-contents; walls: #my-walls; portalWall: #my-portal-wall">
//     … portal contents, hider walls, portal wall …
//   </a-entity>
//
// The portal plane is this entity's z = 0. While the camera is in front of
// it (z > 0) the contents are visible but masked by the hider walls
// (xrextras-hider-material); stepping through the plane inside the doorway
// (|x| < width/2, y < height) switches to "inside": walls off, portal wall
// on. Same rules as the original.
//
// Why a port: the original sat on <a-camera> and read the camera's LOCAL
// position as the old scene's coordinates. Here the camera belongs to the
// host and the old scene sits in a scaled, rotated legacy-space hull, so the
// camera's world position is converted into this entity's local space every
// tick — put the component on the entity at the old scene's origin.
//
// Draw order (the hiders only mask what's drawn AFTER them): the originals
// ran 8frame 1.2, whose three.js sorted opaque objects by material id first,
// i.e. in creation order — everything created before the hider walls (#22's
// taxi video) drew first and stayed visible, the portal contents (created
// after) were masked. 8frame 1.5 sorts opaque objects by distance only, so
// the result flipped with every camera move (found on #22: taxi invisible,
// panorama flashing). This component therefore pins the original's order
// via renderOrder: walls + portal wall `hiderOrder`, contents
// `contentsOrder`; everything else keeps 0 and draws before them.
export default {
  schema: {
    width: { default: 10 },
    height: { default: 10 },
    contents: { type: "selector" },
    walls: { type: "selector" },
    portalWall: { type: "selector" },
    hiderOrder: { type: "number", default: 1 },
    contentsOrder: { type: "number", default: 2 }
  },

  init() {
    const self = this as any;
    self.isInPortalSpace = false;
    self.wasOutside = true;
    self.camPos = new THREE.Vector3();
    // object3dset bubbles from every child, so meshes created later (glTF
    // models in the contents) get their order too.
    self.onObject3DSet = () => self.applyOrder();
    self.el.addEventListener("object3dset", self.onObject3DSet);
  },

  update() {
    (this as any).applyOrder();
  },

  applyOrder() {
    const self = this as any;
    const { contents, walls, portalWall, hiderOrder, contentsOrder } = self.data;
    const set = (el: any, order: number) => el?.object3D.traverse((node: any) => {
      if (node.isMesh) node.renderOrder = order;
    });
    set(walls, hiderOrder);
    set(portalWall, hiderOrder);
    set(contents, contentsOrder);
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("object3dset", self.onObject3DSet);
  },

  tick() {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    const { contents, walls, portalWall } = self.data;
    if (!camera || !contents || !walls || !portalWall) return;
    camera.getWorldPosition(self.camPos);
    const position = self.el.object3D.worldToLocal(self.camPos);
    const isOutside = position.z > 0;
    const withinPortalBounds = position.y < self.data.height && Math.abs(position.x) < self.data.width / 2;
    if (self.wasOutside !== isOutside && withinPortalBounds) {
      self.isInPortalSpace = !isOutside;
    }
    contents.object3D.visible = self.isInPortalSpace || isOutside;
    walls.object3D.visible = !self.isInPortalSpace && isOutside;
    portalWall.object3D.visible = self.isInPortalSpace && !isOutside;
    self.wasOutside = isOutside;
  }
} as ComponentDefinition;
