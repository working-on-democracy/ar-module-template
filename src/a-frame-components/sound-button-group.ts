import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Fades a pair of sound buttons in/out by camera distance, and hands out the
// pulse amount its sound-button children pulsate by when gazed at. Placed on
// the entity that groups two buttons for one "Wand" (see ArModule.vue).
//
// `near`/`far` are world-space distances (metres): fully visible at/inside
// `near`, fully hidden at/beyond `far`, cross-fading (smoothstepped) between.
//
// The fade is driven by scale (sound-button.setFadeFactor), not material
// opacity. Opacity fought with the button material's `alpha-test` (needed for
// crisp cutout icon edges without transparency-sorting artifacts): any value
// between alphaTest and 1 is a partially-blended fragment that needs correct
// back-to-front sorting, which broke down with two close, overlapping
// transparent button planes. Shrinking never touches blending, so it can't
// reintroduce that.
export default {
  schema: {
    near: { type: "number", default: 1 },
    far: { type: "number", default: 2.5 },
    pulse: { type: "number", default: 0.15 }
  },

  init() {
    const self = this as any;
    self.buttons = Array.from(self.el.querySelectorAll("[sound-button]"));
    self.worldPos = new THREE.Vector3();
    self.camPos = new THREE.Vector3();
    self.currentFactor = -1; // force the first tick to apply
    self.applyFactor(0);
  },

  tick() {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    if (!camera) return;

    camera.getWorldPosition(self.camPos);
    self.el.object3D.getWorldPosition(self.worldPos);
    const dist = self.worldPos.distanceTo(self.camPos);

    const { near, far } = self.data;
    let factor = far <= near ? (dist <= near ? 1 : 0) : 1 - (dist - near) / (far - near);
    factor = Math.min(1, Math.max(0, factor));
    factor = factor * factor * (3 - 2 * factor); // smoothstep

    if (Math.abs(factor - self.currentFactor) > 0.001) {
      self.currentFactor = factor;
      self.applyFactor(factor);
    }
  },

  applyFactor(factor: number) {
    const self = this as any;
    for (const buttonEl of self.buttons) {
      const buttonComp = buttonEl.components && buttonEl.components["sound-button"];
      if (!buttonComp) continue;
      buttonComp.setFadeFactor(factor);
      // Keep near-invisible buttons out of the gaze raycast and un-pulsatable.
      buttonComp.active = factor > 0.05;
    }
  },

  getPulseAmount() {
    return (this as any).data.pulse;
  }
} as ComponentDefinition;