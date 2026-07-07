import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Drives every [sound-button] in the module from one place, mounted once on
// the module root (see ArModule.vue). Two jobs:
//
//   1. Gaze: each tick, raycast from the camera's forward direction against
//      every *active* button (buttons faded out by their sound-button-group
//      report themselves inactive, so they're never candidates) and pulsate
//      whichever one is closest along the ray — never more than one, since
//      only the nearest hit is chosen and every other button is told to stop.
//
//   2. Tap: a single document-level `click` (fires for touch taps on both
//      Android and iOS, not just mouse) acts on whatever button is currently
//      gazed at, per the play/pause/resume/switch state machine in onTap()
//      below — only one button's sound ever plays module-wide. We can't use
//      A-Frame's cursor/raycaster component for this because the host forbids
//      modules from setting `cursor`/`raycaster` on the shared camera (see
//      lib/manifest.types.ts CAMERA_PROPS_FORBIDDEN) — so gaze + tap are both
//      hand-rolled here instead.
//
// Audio unlock: browsers (iOS Safari in particular) refuse to start a Web
// Audio context until it's resumed from inside a real user-gesture handler.
// The `click` handler below is exactly that gesture, so we resume the shared
// THREE.AudioContext (the one A-Frame's `sound` component plays through)
// synchronously on every tap, before asking the button to play. Once resumed
// it stays resumed for the rest of the session.
export default {
  init() {
    const self = this as any;
    // A-Frame doesn't guarantee this entity's init() runs before a descendant
    // button's — a [sound-button] child may already have called register()
    // (see below), so don't clobber a buttons array it already created.
    self.buttons = self.buttons || [];
    self.gazed = null;
    // The one button whose sound is currently playing/paused, module-wide —
    // only ever one at a time, enforced entirely below.
    self.activeButton = null;
    self.activeStatus = "idle"; // "idle" | "playing" | "paused"
    self.raycaster = new THREE.Raycaster();
    self.camPos = new THREE.Vector3();
    self.camDir = new THREE.Vector3();

    self.onTap = self.onTap.bind(this);
    document.addEventListener("click", self.onTap);
  },

  remove() {
    const self = this as any;
    document.removeEventListener("click", self.onTap);
    self.gazed = null;
    self.activeButton = null;
  },

  register(button: any) {
    const self = this as any;
    self.buttons = self.buttons || [];
    self.buttons.push(button);
  },

  unregister(button: any) {
    const self = this as any;
    const idx = self.buttons.indexOf(button);
    if (idx !== -1) self.buttons.splice(idx, 1);
    if (self.gazed === button) self.setGazed(null);
    if (self.activeButton === button) {
      self.activeButton = null;
      self.activeStatus = "idle";
      self.notifyStateChange();
    }
  },

  tick() {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    if (!camera) return;

    const candidates = self.buttons.filter((b: any) => b.active && b.el.getObject3D("mesh"));
    if (!candidates.length) {
      self.setGazed(null);
      return;
    }

    camera.getWorldPosition(self.camPos);
    camera.getWorldDirection(self.camDir);
    self.raycaster.set(self.camPos, self.camDir);

    const meshes = candidates.map((b: any) => b.el.getObject3D("mesh"));
    const hits = self.raycaster.intersectObjects(meshes, false);
    if (!hits.length) {
      self.setGazed(null);
      return;
    }

    const hitButton = candidates.find((b: any) => b.el.getObject3D("mesh") === hits[0].object) ?? null;
    self.setGazed(hitButton);
  },

  setGazed(button: any) {
    const self = this as any;
    if (self.gazed === button) return;
    if (self.gazed) self.gazed.stopPulse();
    self.gazed = button;
    if (self.gazed) {
      const groupEl = self.gazed.el.closest("[sound-button-group]");
      const group = groupEl && groupEl.components["sound-button-group"];
      self.gazed.startPulse(group ? group.getPulseAmount() : 0.15);
    }
  },

  // Only one sound plays module-wide, ever:
  //  - tap the button whose sound is playing  → pause it
  //  - tap that same button again (now paused) → resume it
  //  - tap any *other* button                  → stop the current one and
  //                                              play the new one from the top
  onTap() {
    const self = this as any;
    self.unlockAudio();
    const target = self.gazed;
    if (!target) return;

    if (self.activeButton === target) {
      if (self.activeStatus === "playing") {
        target.pauseAudio();
        self.activeStatus = "paused";
      } else {
        target.resume();
        self.activeStatus = "playing";
      }
      self.notifyStateChange();
      return;
    }

    if (self.activeButton) self.activeButton.stop();
    target.playFromStart();
    self.activeButton = target;
    self.activeStatus = "playing";
    self.notifyStateChange();
  },

  // Fired by a button when its sound reaches the end on its own (no loop) —
  // release it back to idle so any button can be tapped fresh, matching a
  // user-initiated stop/switch.
  onSoundEnded(button: any) {
    const self = this as any;
    if (self.activeButton === button) {
      self.activeButton = null;
      self.activeStatus = "idle";
      self.notifyStateChange();
    }
  },

  // The 2D sound-control GUI (ArModule.vue) drives these three directly,
  // regardless of gaze — it always acts on whichever button is currently
  // active, since only one ever is.
  restartActive() {
    const self = this as any;
    if (!self.activeButton) return;
    self.activeButton.playFromStart();
    self.activeStatus = "playing";
    self.notifyStateChange();
  },

  togglePlayPause() {
    const self = this as any;
    if (!self.activeButton) return;
    if (self.activeStatus === "playing") {
      self.activeButton.pauseAudio();
      self.activeStatus = "paused";
    } else {
      self.activeButton.resume();
      self.activeStatus = "playing";
    }
    self.notifyStateChange();
  },

  stopActive() {
    const self = this as any;
    if (!self.activeButton) return;
    self.activeButton.stop();
    self.activeButton = null;
    self.activeStatus = "idle";
    self.notifyStateChange();
  },

  // Bridges to the Vue-rendered 2D sound-control GUI, which lives outside
  // A-Frame/three.js entirely and so can't just read component state directly.
  notifyStateChange() {
    const self = this as any;
    self.el.emit("sound-state-changed", { status: self.activeStatus }, false);
  },

  unlockAudio() {
    const ctx = THREE.AudioContext.getContext();
    if (ctx.state === "suspended") ctx.resume();
  }
} as ComponentDefinition;