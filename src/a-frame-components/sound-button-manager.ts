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
//   2. Tap: a document-level `pointerdown`/`pointerup` pair (not `click` —
//      see below) acts on whatever button is currently gazed at, per the
//      play/pause/resume/switch state machine in onTap() below — only one
//      button's sound ever plays module-wide. We can't use A-Frame's
//      cursor/raycaster component for this because the host forbids modules
//      from setting `cursor`/`raycaster` on the shared camera (see
//      lib/manifest.types.ts CAMERA_PROPS_FORBIDDEN) — so gaze + tap are both
//      hand-rolled here instead.
//
// Why pointerdown/pointerup and not `click`: `xrextras-gesture-detector` (on
// the scene, for pinch/rotate) calls preventDefault() on touch events for its
// own gesture handling, and iOS Safari — much more aggressively than Android
// Chrome — suppresses the synthetic `click` that would otherwise follow a
// touch once something upstream in that touch sequence called
// preventDefault(). That silently broke tapping the 3D buttons on iPad
// specifically. pointerdown/pointerup are primary input events, not a
// second-order synthesis derived from touch, so they aren't subject to that
// suppression. onPointerUp() only reacts to taps that (a) landed on the AR
// canvas itself — not the 2D sound-control panel's real <button> elements,
// which handle their own clicks and already stop that event's propagation —
// and (b) didn't move far from where the press started, so a camera
// drag/pinch gesture doesn't also register as a tap.
//
// Audio unlock: browsers (iOS Safari in particular) refuse to start a Web
// Audio context until it's resumed from inside a real user-gesture handler.
// onPointerUp is exactly that gesture, so we resume the shared
// THREE.AudioContext (the one A-Frame's `sound` component plays through)
// synchronously there, before asking the button to play. Once resumed it
// stays resumed for the rest of the session.
//
// That resume() alone isn't sufficient on iPhone specifically: iOS's
// hardware Ring/Silent switch mutes Web Audio API output independently of
// the autoplay-gesture policy above, even once the context reports
// "running" — a device-level behavior most iPads don't have (no physical
// switch), which is why this can pass on iPad and stay silent on iPhone.
// Safari 17+ exposes an explicit opt-out (navigator.audioSession); older
// Safari has none, so as a fallback we also play one real, silent
// HTMLMediaElement from inside this same gesture — that flips the page's
// iOS audio session into the category that ignores the switch, and the
// flip persists for the rest of the session, including for subsequent Web
// Audio API playback. See unlockAudio() below.
const TAP_MOVE_THRESHOLD = 10; // px

// A ~0.2s silent WAV, built at runtime rather than checked in as a base64
// blob. Its only job is to be a *real* HTMLMediaElement play() call inside
// the unlock gesture (see unlockAudio()) — content is inaudible either way.
function createSilentUnlockAudio(): HTMLAudioElement {
  const sampleRate = 8000;
  const numSamples = Math.round(sampleRate * 0.2);
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate (1 byte/sample, mono)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, numSamples, true);
  new Uint8Array(buffer, 44, numSamples).fill(128); // 128 = silence, unsigned 8-bit PCM
  const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  return new Audio(url);
}

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

    const candidates = self.buttons.filter((b: any) => b.active && b.getHitMesh());
    if (!candidates.length) {
      self.setGazed(null);
      return;
    }

    camera.getWorldPosition(self.camPos);
    camera.getWorldDirection(self.camDir);
    self.raycaster.set(self.camPos, self.camDir);

    // Raycasts against each button's (possibly wider, invisible) hit-area
    // mesh, not necessarily its visible one — see sound-button.getHitMesh().
    const meshes = candidates.map((b: any) => b.getHitMesh());
    const hits = self.raycaster.intersectObjects(meshes, false);
    if (!hits.length) {
      self.setGazed(null);
      return;
    }

    const hitButton = candidates.find((b: any) => b.getHitMesh() === hits[0].object) ?? null;
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

  onPointerDown(e: PointerEvent) {
    (this as any).pointerDownPos = { x: e.clientX, y: e.clientY };
  },

  onPointerUp(e: PointerEvent) {
    const self = this as any;
    const downPos = self.pointerDownPos;
    self.pointerDownPos = null;

    // Only a tap that started and ended on the AR canvas counts as "tap the
    // scene" — the 2D sound-control panel's buttons are real <button>
    // elements with their own @click.stop handlers.
    if (!e.target || (e.target as HTMLElement).tagName !== "CANVAS") return;

    if (downPos) {
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_THRESHOLD) return; // was a drag/gesture, not a tap
    }

    self.onTap();
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
    self.unlockAudio();
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
      self.unlockAudio();
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
    const self = this as any;
    const ctx = THREE.AudioContext.getContext();
    if (ctx.state === "suspended") ctx.resume();

    // Opt out of iOS's Ring/Silent switch muting Web Audio output (Safari
    // 17+). Wrapped in try/catch: older Safari that lacks the API entirely
    // is handled by the `"audioSession" in navigator` guard, but a Safari
    // version that has the property yet rejects "playback" as a value would
    // otherwise throw and skip the HTMLMediaElement fallback below too.
    if ("audioSession" in navigator) {
      try {
        (navigator as any).audioSession.type = "playback";
      } catch {
        // fall through to the HTMLMediaElement fallback below
      }
    }

    // Fallback for Safari versions without navigator.audioSession: a real
    // (silent) HTMLMediaElement play() call from inside this same gesture
    // also flips the page's audio session away from the mute-switch-obeying
    // category. Only needs to happen once per session.
    if (!self.silentUnlockEl) self.silentUnlockEl = createSilentUnlockAudio();
    self.silentUnlockEl.play().catch(() => {});
  }
} as ComponentDefinition;