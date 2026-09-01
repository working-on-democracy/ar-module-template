import type { ComponentDefinition } from "aframe";
import { unlockAudio } from "./sound-unlock-audio";
import { rampFactor } from "./proximity-fade-shared";

declare const THREE: any;

// AN ALLE! Animationssystem Wanderer (archive-of-practice
// projects/an-alle/concepts/animationssystem-wanderer.md, 01.09.2026,
// Autor-Entscheidung) — the wanderers themselves are the sound sources now,
// replacing the separate sound-player-style tap spheres. Sits on the SAME
// entity as [ar-button] and A-Frame's own `sound` (co-located, not a
// selector reference) — reacts to "ar-button-tap" (routed by
// [ar-button-manager], see ar-button.ts) by toggling play/pause on its own
// sound. Deliberately NOT going through sound-controller.ts's single-
// active-sound mutex: multiple wanderers must be able to play at once
// (Autor-Entscheidung), so each instance is a fully independent toggle.
//
// Re-asserts playback on "xrextrasfound" (01.09.2026, Autor-Korrektur:
// "wenn das Image Tracking unterbrochen wird, wird auch der Sound
// unterbrochen und kommt danach nicht wieder") — `xrextras-named-image-
// target`'s own component (see @8thwall/xrextras's namedImageTargetComponent)
// emits "xrextrasfound"/"xrextraslost" on ITSELF (non-bubbling) whenever
// tracking is lost/regained, toggling only its object3D.visible in
// between. That alone shouldn't stop Web Audio playback, but something in
// the underlying engine/context lifecycle across a tracking interruption
// evidently does — since our own `self.playing` boolean survives that
// regardless (it's just a plain field, untouched by tracking events), the
// robust fix is to unconditionally call playSound() again once tracking
// is confirmed regained, for any instance that still considers itself
// playing. A harmless no-op for an instance that's paused/idle.
//
// Drives two purely visual reactions on `segmentSelector`'s matches (the
// 3 worm segments, scoped children of this same entity — NOT this entity's
// own object3D, which [ar-button] already owns exclusively for its
// gaze-pulse/distance-fade, see ar-button.ts's own header comment):
//
//   - Colour oscillates between colorNear/colorFar (the shared AN ALLE!
//     scheme) while playing, each segment's own phase offset derived from
//     its OWN current colour at the moment playback starts — so the
//     oscillation continues smoothly from whatever static gradient colour
//     it already had, no jump. Pausing freezes it outright (simply stops
//     writing the attribute — whatever was last painted stays, per the
//     explicit spec: "die zuletzt angezeigte Farbe bleibt bestehen").
//   - Scale pulses (all segments in phase) while playing, eases back to
//     1x once paused (same easing idiom as ar-button.ts's own
//     pulseScale-settle, so a paused wanderer doesn't visibly snap flat).
export default {
  schema: {
    // CSS selector, scoped to this entity's own descendants (querySelectorAll),
    // for the visual segments this component's colour/pulse should drive.
    segmentSelector: { type: "string", default: ".worm-segment" },
    colorNear: { type: "string", default: "#FFF44F" }, // lemon yellow
    colorFar: { type: "string", default: "#FF69B4" }, // hot pink
    cycleSpeed: { type: "number", default: 1.2 }, // rad/s-ish, color oscillation
    pulseAmount: { type: "number", default: 0.35 }, // fractional scale bump at peak
    pulseSpeed: { type: "number", default: 5 }, // rad/s
    // Starts already playing (AN ALLE! Animationssystem Wanderer, 01.09.2026,
    // Autor-Entscheidung: the central figure's own sound "ist zum Start
    // standardmäßig aktiviert") — deferred to this component's own first
    // tick() rather than fired here in init(), since `self.el.components.sound`
    // isn't guaranteed to exist yet at THIS component's init() time (A-Frame
    // doesn't guarantee co-located components initialize in a fixed order).
    // By the first tick(), every component on the entity is guaranteed
    // initialized.
    autoplay: { type: "boolean", default: false },
    // Extra long-range mute fade (AN ALLE! Animationssystem Wanderer,
    // 01.09.2026, Autor-Entscheidung: "eine Funktion, die Lautstärken...
    // nochmal zusätzlich bis auf nicht mehr hörbar runterregelt") — layered
    // ON TOP of whatever the [sound] component's own distanceModel/
    // refDistance/maxDistance curve already produces, via the plain `sound`
    // component's own `volume` property (a master multiplier). Unlike the
    // panner's own "inverse" model (chosen precisely because it never
    // reaches true silence, s. ArModule.vue's own comment), this DOES reach
    // exactly 0 at muteFadeEnd — a deliberate, separate hard cutoff further
    // out. Both default to 0, a no-op (volume left at the `sound`
    // component's own default of 1) — existing/other consumers of this
    // component unaffected.
    muteFadeStart: { type: "number", default: 0 },
    muteFadeEnd: { type: "number", default: 0 }
  },

  init() {
    const self = this as any;
    self.playing = false;
    self.elapsedPlaying = 0;
    self.pendingAutoplay = self.data.autoplay;
    self.cameraPos = new THREE.Vector3();
    self.selfWorldPos = new THREE.Vector3();

    const segmentEls = Array.from(self.el.querySelectorAll(self.data.segmentSelector)) as any[];
    self.segments = segmentEls.map((el) => {
      const materialData = el.getAttribute("material");
      const t0 = self.inverseLerpColor(materialData?.color ?? self.data.colorNear);
      return {
        el,
        colorPhase0: Math.asin(THREE.MathUtils.clamp(2 * t0 - 1, -1, 1)),
        baseScale: el.object3D.scale.clone(),
        pulseScale: 1
      };
    });

    self.onTap = () => self.togglePlaying();
    self.el.addEventListener("ar-button-tap", self.onTap);

    self.imageTargetEl = self.el.closest("xrextras-named-image-target");
    self.onTrackingFound = () => {
      if (self.playing) self.el.components.sound?.playSound();
    };
    if (self.imageTargetEl) self.imageTargetEl.addEventListener("xrextrasfound", self.onTrackingFound);
    else console.warn("[wander-sound] no ancestor xrextras-named-image-target found; won't recover playback after a tracking interruption", self.el);
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("ar-button-tap", self.onTap);
    if (self.imageTargetEl) self.imageTargetEl.removeEventListener("xrextrasfound", self.onTrackingFound);
  },

  togglePlaying() {
    const self = this as any;
    unlockAudio();
    const soundComp = self.el.components.sound;
    if (!soundComp) {
      console.warn("[wander-sound] no [sound] component on this entity", self.el);
      return;
    }
    self.playing = !self.playing;
    if (self.playing) soundComp.playSound();
    else soundComp.pauseSound();
    // Bridges to Vue (ArModule.vue's own onMounted listeners), same pattern
    // as the old sound-controller.ts's "sound-state-changed" — used, e.g.,
    // to gate the central figure's bob cycle (only advances while its own
    // sound plays) and to halve a wanderer's own speed while its sound is
    // paused (both Autor-Entscheidungen, 01.09.2026).
    self.el.emit("wander-sound-state-changed", { playing: self.playing }, false);
  },

  // Solves t in lerpHexColor(colorNear, colorFar, t) = hex, using whichever
  // channel differs most between the two endpoints (most numerically
  // stable) — generic rather than assuming a specific scheme, even though
  // this branch's own colorNear/colorFar always leaves green as that
  // channel (#FFF44F -> #FF69B4).
  inverseLerpColor(hex: string): number {
    const data = (this as any).data;
    const parse = (h: string): [number, number, number] => {
      const c = h.replace("#", "");
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    };
    const a = parse(data.colorNear);
    const b = parse(data.colorFar);
    let bestChannel = 0;
    let bestDiff = -1;
    for (let i = 0; i < 3; i++) {
      const diff = Math.abs(b[i] - a[i]);
      if (diff > bestDiff) {
        bestDiff = diff;
        bestChannel = i;
      }
    }
    if (bestDiff === 0) return 0;
    const target = parse(hex);
    return THREE.MathUtils.clamp((target[bestChannel] - a[bestChannel]) / (b[bestChannel] - a[bestChannel]), 0, 1);
  },

  lerpColor(t: number): string {
    const data = (this as any).data;
    const parse = (h: string): [number, number, number] => {
      const c = h.replace("#", "");
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    };
    const toHex = (v: number) => THREE.MathUtils.clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    const a = parse(data.colorNear);
    const b = parse(data.colorFar);
    return `#${toHex(a[0] + (b[0] - a[0]) * t)}${toHex(a[1] + (b[1] - a[1]) * t)}${toHex(a[2] + (b[2] - a[2]) * t)}`;
  },

  tick(time: number, delta: number) {
    const self = this as any;
    const data = self.data;
    const dt = Math.min(0.1, Math.max(0, delta / 1000));

    if (self.pendingAutoplay) {
      self.pendingAutoplay = false;
      self.togglePlaying(); // sets playing=true and calls playSound() on the now-guaranteed-initialized [sound]
    }

    // Extra long-range mute fade (s. schema comment above) — kept live
    // regardless of self.playing, so the correct volume is already in
    // place the instant playback actually starts.
    if (data.muteFadeStart !== 0 || data.muteFadeEnd !== 0) {
      const camera = self.el.sceneEl.camera;
      if (camera) {
        camera.getWorldPosition(self.cameraPos);
        self.el.object3D.getWorldPosition(self.selfWorldPos);
        const dist = self.cameraPos.distanceTo(self.selfWorldPos);
        const muteFactor = 1 - rampFactor(dist, data.muteFadeStart, data.muteFadeEnd);
        self.el.setAttribute("sound", "volume", muteFactor);
      }
    }

    if (self.playing) self.elapsedPlaying += dt;

    for (const seg of self.segments) {
      if (self.playing) {
        const t = 0.5 + 0.5 * Math.sin(seg.colorPhase0 + data.cycleSpeed * self.elapsedPlaying);
        seg.el.setAttribute("material", "color", self.lerpColor(t));
        const osc = Math.sin((time / 1000) * data.pulseSpeed) * 0.5 + 0.5;
        seg.pulseScale = 1 + data.pulseAmount * osc;
      } else if (seg.pulseScale !== 1) {
        // Ease back to rest instead of snapping — same idiom as
        // ar-button.ts's own pulse-release (colour itself is NOT touched
        // here, s. class comment: it must stay frozen, not ease anywhere).
        seg.pulseScale += (1 - seg.pulseScale) * Math.min(dt / 0.15, 1);
      }
      seg.el.object3D.scale.set(
        seg.baseScale.x * seg.pulseScale,
        seg.baseScale.y * seg.pulseScale,
        seg.baseScale.z * seg.pulseScale
      );
    }
  }
} as ComponentDefinition;
