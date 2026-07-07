import type { ComponentDefinition } from "aframe";

declare const THREE: any;

const PULSE_SPEED = 6; // rad/s — one full grow/shrink cycle roughly every second

// A single tappable button. Registers with the nearest [sound-button-manager]
// ancestor (the module root) so exactly one button system-wide can pulsate —
// the manager owns the gaze raycast and decides who's being looked at, this
// component only knows how to pulsate itself and play its sound.
//
// `active` (toggled by the sibling sound-button-group as it fades the button
// in/out) gates whether the manager will ever raycast against this button.
//
// Scale, not opacity, drives both the distance fade (fadeFactor, set by
// sound-button-group) and the gaze pulse (pulseScale, below) — this is the
// single place either of those may write `object3D.scale`, so they compose
// (multiply) instead of stomping each other. Opacity-based fade was tried
// first and reverted: it fought with the button material's `alpha-test`
// (needed for crisp, sorting-artifact-free icon edges — see ArModule.vue),
// since any value between alphaTest and 1 is a partially-blended fragment
// that needs correct back-to-front sorting, which broke down with two
// close, overlapping transparent button planes. Shrinking to nothing never
// touches blending at all, so it can't reintroduce that problem.
export default {
  schema: {
    sound: { type: "selector" }
  },

  init() {
    const self = this as any;
    self.active = false;
    self.pulsing = false;
    self.pulseAmount = 0;
    self.pulsePhase = 0;
    self.pulseScale = 1;
    self.fadeFactor = 1;
    self.baseScale = self.el.object3D.scale.clone();
    // Optional invisible, wider plane (see ArModule.vue) that the manager
    // raycasts against instead of this button's own visible mesh, so the
    // gaze/tap-active area can be bigger than the icon without enlarging it.
    // Inherits this entity's scale (fade/pulse) automatically as a child.
    self.hitAreaEl = self.el.querySelector(".sound-button-hit-area");

    const managerEl = self.el.closest("[sound-button-manager]");
    self.manager = managerEl ? managerEl.components["sound-button-manager"] : null;
    if (self.manager) self.manager.register(self);
    else console.warn("[sound-button] no ancestor [sound-button-manager] found; gaze/tap disabled");

    // The sound component's own onended handler nulls itself out on a
    // programmatic pauseSound()/stopSound(), so "sound-ended" only fires here
    // when the clip runs to its own end — exactly the natural-finish signal
    // the manager needs to release this button back to the idle state.
    self.onSoundEnded = () => {
      if (self.manager) self.manager.onSoundEnded(self);
    };
    if (self.data.sound) self.data.sound.addEventListener("sound-ended", self.onSoundEnded);
  },

  remove() {
    const self = this as any;
    if (self.manager) self.manager.unregister(self);
    if (self.data.sound) self.data.sound.removeEventListener("sound-ended", self.onSoundEnded);
  },

  tick(_time: number, delta: number) {
    const self = this as any;
    const obj = self.el.object3D;

    if (self.pulsing) {
      self.pulsePhase += delta / 1000;
      const osc = Math.sin(self.pulsePhase * PULSE_SPEED) * 0.5 + 0.5; // 0..1
      self.pulseScale = 1 + self.pulseAmount * osc;
    } else if (self.pulseScale !== 1) {
      // Ease back to rest size instead of snapping, so the pulse stop reads as
      // a settle rather than a pop.
      self.pulseScale += (1 - self.pulseScale) * Math.min(delta / 150, 1);
    }

    const fade = self.fadeFactor;
    obj.scale.set(
      self.baseScale.x * fade * self.pulseScale,
      self.baseScale.y * fade * self.pulseScale,
      self.baseScale.z * fade
    );
  },

  // Called every tick by the sibling sound-button-group as it fades this
  // button in/out by camera distance — 1 = full size, 0 = shrunk away.
  setFadeFactor(factor: number) {
    (this as any).fadeFactor = factor;
  },

  // What sound-button-manager raycasts against for gaze detection: the wider
  // invisible hit-area if one is present, otherwise this button's own visible
  // mesh.
  getHitMesh() {
    const self = this as any;
    if (self.hitAreaEl) {
      const hitMesh = self.hitAreaEl.getObject3D("mesh");
      if (hitMesh) return hitMesh;
    }
    return self.el.getObject3D("mesh");
  },

  startPulse(amount: number) {
    const self = this as any;
    self.pulsing = true;
    self.pulseAmount = amount;
    self.pulsePhase = 0;
  },

  stopPulse() {
    (this as any).pulsing = false;
  },

  // Stops (resetting playback position) and plays from the top — used when
  // this button is tapped while idle, or while a *different* button's sound
  // is playing/paused.
  playFromStart() {
    const self = this as any;
    const soundComp = self.getSoundComponent();
    if (!soundComp) return;
    soundComp.stopSound();
    soundComp.playSound();
  },

  // Named pauseAudio (not `pause`) because `pause`/`play` are reserved A-Frame
  // component lifecycle method names — A-Frame wraps whatever you assign to
  // them to also deregister the component from the scene's tick loop when
  // called, which silently killed this button's pulsate animation the moment
  // its sound was paused. pauseSound()/playSound() (not stopSound()) preserve
  // the pool member's internal playback offset, so a later playSound() call
  // resumes rather than restarting — used when this same button is tapped
  // again.
  pauseAudio() {
    const self = this as any;
    self.getSoundComponent()?.pauseSound();
  },

  resume() {
    const self = this as any;
    self.getSoundComponent()?.playSound();
  },

  stop() {
    const self = this as any;
    self.getSoundComponent()?.stopSound();
  },

  getSoundComponent() {
    const self = this as any;
    const soundEl = self.data.sound;
    const soundComp = soundEl && soundEl.components && soundEl.components.sound;
    if (!soundComp) console.warn("[sound-button] no sound component on target entity", soundEl);
    return soundComp;
  }
} as ComponentDefinition;
