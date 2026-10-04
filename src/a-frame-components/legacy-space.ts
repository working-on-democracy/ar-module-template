import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Hosts an unchanged scene from an old 8th Wall project and places it in
// front of the current camera — module-locally, without touching the shared
// camera or XR8's world origin:
//
//   <a-entity legacy-space>
//     … old scene markup, coordinates unchanged …
//   </a-entity>
//
// The old Augmented Bahnhofsviertel projects all use 8th Wall's `responsive`
// convention: the camera starts at `0 8 8`, the floor is y = 0, and the
// camera's start height (8 units) is the real phone height. XR8 keeps that
// convention in this template too — the floor is world y = 0 and the camera
// sits at its own height above it — so placing the old scene is a pure
// similarity transform:
//
//   scale   s = cameraWorldY / legacyCameraHeight
//   rotate  around world Y so the old scene's -Z faces where the camera looks
//   move    so the old camera point (0, legacyCameraHeight, legacyCameraDistance)
//           lands on the real camera, and old y = 0 on the world floor y = 0
//
// That target pose is computed in WORLD space and converted into the parent's
// local space (inverse parent world matrix), so it doesn't matter which
// wrappers the preview (lib/preview-ar.ts' module-root at 0 1.6 -3) or the
// host put above the module — a fixed offset would only be right for one of
// them (see augmented-bahnhofsviertel/PORTING-GUIDE.md §6).
//
// Placement happens once the camera has a usable pose (XR8 has moved it off
// the floor), and again whenever the entity receives a `legacy-space-place`
// event — that's the module-local replacement for the old global
// `scene.emit('recenter')`. Content stays hidden until the first placement,
// so it doesn't flash at the wrong spot.
//
// `tapRecenter` is the module-local version of the old scene-level
// `xrextras-tap-recenter`: like the original, any tap on the scene re-places
// — but only this hull, not the whole XR8 world. In the host that includes
// taps meant for other modules or host UI on the canvas, exactly as the
// original reacted to every tap. Unlike the original it does NOT listen for
// `click`: iOS Safari suppresses the synthetic click once
// xrextras-gesture-detector has called preventDefault() on the touch (see
// guides/SOUND-FEATURE-GUIDE.md §4), so on an iPhone the original's tap did
// nothing. A tap is detected from pointer events instead: one pointer, up
// within TAP_MAX_MS, moved less than TAP_MAX_MOVE_PX — pinches and drags
// don't count.
//
// `scaleShadows` also scales the shadow-camera bounds of directional lights
// inside by s: three.js keeps those in world units regardless of the parent's
// scale, so the old bounds (e.g. ±80 old units) would otherwise cover a far
// bigger area at a fraction of the shadow-map resolution.
const TAP_MAX_MS = 350;
const TAP_MAX_MOVE_PX = 12;

export default {
  schema: {
    legacyCameraHeight: { type: "number", default: 8 },
    legacyCameraDistance: { type: "number", default: 8 },
    // Used when no camera height is available (stock-A-Frame `npm run dev`,
    // where nothing moves the camera off y = 0): seconds to wait, then the
    // scale to use instead.
    fallbackAfter: { type: "number", default: 3 },
    fallbackScale: { type: "number", default: 0.2 },
    scaleShadows: { type: "boolean", default: true },
    tapRecenter: { type: "boolean", default: false }
  },

  init() {
    const self = this as any;
    self.placed = false;
    self.waited = 0;
    self.shadowBase = new Map();
    self.el.object3D.visible = false;
    self.onPlace = () => self.place();
    self.el.addEventListener("legacy-space-place", self.onPlace);
    // Tap detection for tapRecenter (see header): track every pointer on the
    // page; a gesture is a tap only if exactly one pointer was involved.
    self.pointers = new Map();
    self.multiTouch = false;
    self.onPointerDown = (e: PointerEvent) => {
      if (self.pointers.size > 0) self.multiTouch = true;
      // Like the original (a click bubbling up to <a-scene>), only touches
      // on the scene itself count — not DOM UI (host buttons, overlays).
      // Still tracked either way, so a second finger elsewhere marks the
      // gesture as multi-touch.
      if (!self.el.sceneEl.contains(e.target as Node)) {
        self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: -Infinity });
        return;
      }
      self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    };
    self.onPointerUp = (e: PointerEvent) => {
      const start = self.pointers.get(e.pointerId);
      self.pointers.delete(e.pointerId);
      const wasMulti = self.multiTouch;
      if (self.pointers.size === 0) self.multiTouch = false;
      if (!start || wasMulti || !self.data.tapRecenter || !self.placed) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (performance.now() - start.t <= TAP_MAX_MS && moved <= TAP_MAX_MOVE_PX) self.place();
    };
    self.onPointerCancel = (e: PointerEvent) => {
      self.pointers.delete(e.pointerId);
      if (self.pointers.size === 0) self.multiTouch = false;
    };
    window.addEventListener("pointerdown", self.onPointerDown, true);
    window.addEventListener("pointerup", self.onPointerUp, true);
    window.addEventListener("pointercancel", self.onPointerCancel, true);
  },

  tick(_time: number, delta: number) {
    const self = this as any;
    if (self.placed) return;
    self.waited += (delta || 0) / 1000;
    const camera = self.el.sceneEl.camera;
    if (!camera) return;
    const pos = new THREE.Vector3();
    camera.getWorldPosition(pos);
    if (pos.y > 0.01 || self.waited >= self.data.fallbackAfter) self.place();
  },

  place() {
    const self = this as any;
    const data = self.data;
    const camera = self.el.sceneEl.camera;
    if (!camera) return;

    const camPos = new THREE.Vector3();
    const camQuat = new THREE.Quaternion();
    camera.getWorldPosition(camPos);
    camera.getWorldQuaternion(camQuat);

    const s = camPos.y > 0.01 ? camPos.y / data.legacyCameraHeight : data.fallbackScale;

    // Heading: where the camera looks, flattened onto the floor. When it
    // looks (almost) straight down or up, use the top edge of the screen
    // instead — the direction the phone is "pointing" while held flat.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat).setY(0);
    if (forward.lengthSq() < 0.04) forward.set(0, 1, 0).applyQuaternion(camQuat).setY(0);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    const yaw = Math.atan2(-forward.x, -forward.z);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    // Old camera point in the scaled, rotated old scene, relative to its origin.
    const legacyCam = new THREE.Vector3(0, data.legacyCameraHeight, data.legacyCameraDistance)
      .multiplyScalar(s)
      .applyQuaternion(rotation);
    const origin = new THREE.Vector3(camPos.x - legacyCam.x, 0, camPos.z - legacyCam.z);

    const world = new THREE.Matrix4().compose(origin, rotation, new THREE.Vector3(s, s, s));
    const obj = self.el.object3D;
    const parent = obj.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      world.premultiply(new THREE.Matrix4().copy(parent.matrixWorld).invert());
    }
    world.decompose(obj.position, obj.quaternion, obj.scale);
    obj.updateMatrixWorld(true);

    if (data.scaleShadows) self.scaleShadowCameras(s);
    self.placed = true;
    obj.visible = true;
    self.el.emit("legacy-space-placed", { scale: s }, false);
  },

  scaleShadowCameras(s: number) {
    const self = this as any;
    self.el.object3D.traverse((node: any) => {
      if (!node.isDirectionalLight || !node.shadow?.camera) return;
      const cam = node.shadow.camera;
      if (!self.shadowBase.has(node)) {
        self.shadowBase.set(node, { left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom });
      }
      const base = self.shadowBase.get(node);
      cam.left = base.left * s;
      cam.right = base.right * s;
      cam.top = base.top * s;
      cam.bottom = base.bottom * s;
      cam.updateProjectionMatrix();
    });
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("legacy-space-place", self.onPlace);
    window.removeEventListener("pointerdown", self.onPointerDown, true);
    window.removeEventListener("pointerup", self.onPointerUp, true);
    window.removeEventListener("pointercancel", self.onPointerCancel, true);
  }
} as ComponentDefinition;
