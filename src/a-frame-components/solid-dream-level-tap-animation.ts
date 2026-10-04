import type { ComponentDefinition } from "aframe";

// #20 Solid Dream Level's tap-to-open, ported from the original tap-anim.js:
// the first tap on the shell (a `click` from the host's cursor/raycaster on
// this `.cantap` entity) plays its opening animation once — it stays open —
// and starts its sound, but only after audio was unlocked.
//
//   <a-entity class="cantap" sound="…" solid-dream-level-tap-animation></a-entity>
//
// Same behaviour as the original. Changes: the "audio unlocked" gate is the
// `unlocked` property (set by the module's PLAY button) instead of a global
// `window.soundUnlocked` written by the original's silence.js — whose
// unlock check compared two undefined legacy WebKit properties and so was
// always true once PLAY was tapped. Registered under a work-prefixed name
// (another module might register a different "tap-animation").
export default {
  schema: {
    unlocked: { type: "boolean", default: false }
  },

  init() {
    const self = this as any;
    self.started = false;
    self.onClick = () => {
      if (self.started || !self.data.unlocked) return;
      self.started = true;
      self.el.setAttribute("animation-mixer", "clip: animation_0; loop: once; clampWhenFinished: true");
      self.el.components.sound?.playSound();
    };
    self.el.addEventListener("click", self.onClick);
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("click", self.onClick);
  }
} as ComponentDefinition;
