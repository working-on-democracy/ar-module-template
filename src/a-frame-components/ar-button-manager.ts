import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Drives every [ar-button] in the module from one place — mounted once on
// the module root. Purely generic 3D button/trigger-zone selection: each
// tick, raycasts from the camera's forward direction against every enabled
// [ar-button]'s trigger zone (see ar-button.ts) and pulsates whichever one
// is nearest along the ray — never more than one. On tap, routes to
// whichever button is currently gazed at by emitting "ar-button-tap" on
// that button's own element. This component knows nothing about what a tap
// *does* — sound-button.ts (or any future tap-driven behavior) listens for
// that event and reacts.
//
// Hand-rolled rather than A-Frame's cursor/raycaster component because the
// host forbids modules from setting cursor/raycaster on the shared camera
// (multiple modules share one <a-camera>; see lib/manifest.types.ts
// CAMERA_PROPS_FORBIDDEN) — a module setting those would break tap
// interaction for every other module.
//
// Tap uses document-level pointerdown/pointerup, not `click`:
// xrextras-gesture-detector (on the scene, for pinch/rotate) calls
// preventDefault() on touch events for its own gesture handling, and iOS
// Safari — much more aggressively than Android Chrome — suppresses the
// synthetic `click` that would otherwise follow a touch once something
// upstream in that touch sequence called preventDefault(). pointerdown/
// pointerup are primary input events, not a second-order synthesis derived
// from touch, so they aren't subject to that suppression. onPointerUp()
// only reacts to a press that (a) landed on the AR canvas itself — not on
// any 2D UI overlay, which handles its own clicks and stops that event's
// propagation — and (b) didn't move far from where it started, so a camera
// drag/pinch gesture doesn't also register as a tap.
const TAP_MOVE_THRESHOLD = 10; // px
// Screen-space tap resolution's own max distance from a button's projected
// screen position to the actual tap point, in CSS pixels — generous since
// AR taps aren't pixel-precise and small/moving targets (e.g. a wandering
// worm) are easy to slightly miss.
const SCREEN_SPACE_TAP_RADIUS_PX = 80;

export default {
  schema: {
    // "gaze" (default, unchanged): continuous raycast straight out from the
    // camera's own forward direction, tap activates whichever registered
    // button is currently nearest along that ray — requires centering the
    // target in view first. "screen-space" (AN ALLE! Animationssystem
    // Wanderer, 01.09.2026, Autor-Entscheidung): no centering needed at
    // all — on tap, projects every registered button's CURRENT world
    // position to screen space and activates whichever one is closest to
    // the actual tap point (within SCREEN_SPACE_TAP_RADIUS_PX), like tapping
    // an icon in a photo. No continuous gaze/pulse in this mode (there's no
    // single persistent reticle position to highlight against), so tick()
    // is a no-op — each [ar-button]'s OWN near/far distance-fade still runs
    // independently either way (see ar-button.ts's own tick()).
    tapSelection: { type: "string", default: "gaze" }
  },

  init() {
    const self = this as any;
    self.scratchWorldPos = new THREE.Vector3();
    // A-Frame doesn't guarantee this entity's init() runs before a
    // descendant button's — an [ar-button] child may already have called
    // register() (see below), so don't clobber a targets array it already
    // created.
    self.targets = self.targets || [];
    self.gazed = null;
    self.raycaster = new THREE.Raycaster();
    self.camPos = new THREE.Vector3();
    self.camDir = new THREE.Vector3();
    self.pointerDownPos = null;

    self.onPointerDown = self.onPointerDown.bind(this);
    self.onPointerUp = self.onPointerUp.bind(this);
    document.addEventListener("pointerdown", self.onPointerDown);
    document.addEventListener("pointerup", self.onPointerUp);
  },

  remove() {
    const self = this as any;
    document.removeEventListener("pointerdown", self.onPointerDown);
    document.removeEventListener("pointerup", self.onPointerUp);
    self.gazed = null;
  },

  register(target: any) {
    const self = this as any;
    self.targets = self.targets || [];
    self.targets.push(target);
  },

  unregister(target: any) {
    const self = this as any;
    const idx = self.targets.indexOf(target);
    if (idx !== -1) self.targets.splice(idx, 1);
    if (self.gazed === target) self.setGazed(null);
  },

  tick() {
    const self = this as any;
    if (self.data.tapSelection === "screen-space") return; // no continuous gaze/pulse in this mode, s. schema comment
    const camera = self.el.sceneEl.camera;
    if (!camera) return;

    const candidates = self.targets.filter((t: any) => t.isEnabled());
    if (!candidates.length) {
      self.setGazed(null);
      return;
    }

    camera.getWorldPosition(self.camPos);
    camera.getWorldDirection(self.camDir);
    self.raycaster.set(self.camPos, self.camDir);

    let closest: any = null;
    let closestDist = Infinity;
    for (const target of candidates) {
      const hit = target.raycastZone(self.raycaster.ray);
      if (hit && hit.distance < closestDist) {
        closestDist = hit.distance;
        closest = target;
      }
    }
    self.setGazed(closest);
  },

  setGazed(target: any) {
    const self = this as any;
    if (self.gazed === target) return;
    if (self.gazed) {
      self.gazed.stopPulse();
      self.gazed.el.emit("ar-button-gaze-end", null, false);
    }
    self.gazed = target;
    if (self.gazed) {
      self.gazed.startPulse();
      self.gazed.el.emit("ar-button-gaze-start", null, false);
    }
  },

  onPointerDown(e: PointerEvent) {
    (this as any).pointerDownPos = { x: e.clientX, y: e.clientY };
  },

  onPointerUp(e: PointerEvent) {
    const self = this as any;
    const downPos = self.pointerDownPos;
    self.pointerDownPos = null;

    // Only a tap that started and ended on the AR canvas counts as "tap the
    // scene" — 2D UI overlays (e.g. the sound-control panel) are real DOM
    // elements with their own click handlers.
    if (!e.target || (e.target as HTMLElement).tagName !== "CANVAS") return;

    if (downPos) {
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_THRESHOLD) return; // drag/gesture, not a tap
    }

    if (self.data.tapSelection === "screen-space") {
      const target = self.resolveScreenSpaceTarget(e.clientX, e.clientY);
      if (target) target.el.emit("ar-button-tap", null, false);
      return;
    }

    if (self.gazed) self.gazed.el.emit("ar-button-tap", null, false);
  },

  // Screen-space tap resolution (s. schema comment above): projects every
  // enabled candidate's CURRENT world position through the active camera,
  // picks whichever lands closest to the actual tap point in CSS pixels —
  // no raycasting against a 3D zone at all, so a moving/small target
  // doesn't need to be centered in view first, only tapped where it
  // visually is.
  resolveScreenSpaceTarget(clientX: number, clientY: number): any {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    const canvas = self.el.sceneEl.canvas;
    if (!camera || !canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const candidates = self.targets.filter((t: any) => t.isEnabled());

    let closest: any = null;
    let closestPixelDist = Infinity;
    for (const target of candidates) {
      target.el.object3D.getWorldPosition(self.scratchWorldPos);
      self.scratchWorldPos.project(camera); // -> NDC, [-1, 1] on each axis
      const screenX = rect.left + ((self.scratchWorldPos.x + 1) / 2) * rect.width;
      const screenY = rect.top + ((1 - self.scratchWorldPos.y) / 2) * rect.height;
      const dist = Math.hypot(screenX - clientX, screenY - clientY);
      if (dist < closestPixelDist) {
        closestPixelDist = dist;
        closest = target;
      }
    }
    return closestPixelDist <= SCREEN_SPACE_TAP_RADIUS_PX ? closest : null;
  }
} as ComponentDefinition;
