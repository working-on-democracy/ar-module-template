import type { ComponentDefinition } from "aframe";

// Trim a glTF animation's dead lead-in/tail and play it on a loop.
//
// Blender's glTF exporter bakes keyframe *times* from the scene timeline: if you
// export only a preview range that starts at, say, frame 100, the first keyframe
// lands at ~100/fps seconds, not at 0. A plain `animation-mixer` then plays from
// t=0 and just holds that first frame for those seconds — the "big pause before
// the animation starts". There's no trim knob on `animation-mixer` for this.
//
// This component takes the loaded clips and shifts every track so the earliest
// keyframe sits at t=0, then clamps the clip duration to the span that actually
// contains keyframes. What's left is only the moving part, which it plays with a
// LoopPingPong (back-and-forth) loop. Use it INSTEAD of `animation-mixer` on the
// same entity as `gltf-model`:
//
//   <a-entity gltf-model="#MainCharacter" trim-loop-clip="timeScale: 0.4"></a-entity>
//   <a-entity gltf-model="#Seeds" trim-loop-clip="loop: repeat"></a-entity>

declare const AFRAME: any;
const THREE = (AFRAME as any).THREE;

const LOOP_MODES: Record<string, number> = {
  once: THREE.LoopOnce,
  repeat: THREE.LoopRepeat,
  pingpong: THREE.LoopPingPong
};

// Shift all tracks so the earliest keyframe is at t=0 and shrink the clip to the
// keyframed span. Idempotent — a second pass shifts by 0.
//
// CAUTION: glTF samplers that share one input accessor (e.g. every bone in a rig
// keyed on the same frames) end up sharing ONE `times` array, because GLTFLoader
// caches accessors. So we must NOT subtract in place — that would shift the
// shared array once per track referencing it (27× for this rig), pushing its
// keyframes far out of range and freezing those tracks. Instead give each track
// a fresh times array derived from the original values.
function trimClipLeadIn(clip: any): void {
  if (!clip.tracks.length) return;

  let firstTime = Infinity;
  let lastTime = -Infinity;
  for (const track of clip.tracks) {
    const times = track.times;
    if (!times.length) continue;
    firstTime = Math.min(firstTime, times[0]);
    lastTime = Math.max(lastTime, times[times.length - 1]);
  }
  if (!isFinite(firstTime)) return;

  if (firstTime > 0) {
    for (const track of clip.tracks) {
      const shifted = track.times.slice(); // fresh array — never touch the shared original
      for (let i = 0; i < shifted.length; i++) shifted[i] -= firstTime;
      track.times = shifted;
    }
  }
  clip.duration = lastTime - firstTime;
}

export default {
  schema: {
    // Which clip(s) to play. '*' = all clips found on the model.
    clip: { type: "string", default: "*" },
    // Playback speed multiplier (matches animation-mixer's timeScale).
    timeScale: { type: "number", default: 1 },
    // 'once' | 'repeat' | 'pingpong'. Default ping-pong = play forward then reverse.
    loop: { type: "string", default: "pingpong", oneOf: ["once", "repeat", "pingpong"] },
    // Hold the final frame when a non-looping ('once') clip finishes.
    clampWhenFinished: { type: "boolean", default: false }
  },

  init() {
    const self = this as any;
    self.mixer = null;
    self.actions = [];

    self.onModelLoaded = (e: any) => {
      const model = e.detail?.model || self.el.getObject3D("mesh");
      const clips = model?.animations;
      if (!clips?.length) return;

      self.mixer = new THREE.AnimationMixer(model);
      self.play_(clips);
    };
    self.el.addEventListener("model-loaded", self.onModelLoaded);
  },

  // (Re)build actions for the current schema. Called on load and on update.
  play_(clips: any[]) {
    const self = this as any;
    if (!self.mixer) return;

    self.mixer.stopAllAction();
    self.actions = [];

    const wanted = self.data.clip === "*"
      ? clips
      : clips.filter((c: any) => c.name === self.data.clip);

    const loopMode = LOOP_MODES[self.data.loop] ?? THREE.LoopPingPong;

    for (const clip of wanted) {
      trimClipLeadIn(clip);
      const action = self.mixer.clipAction(clip);
      action.setLoop(loopMode, Infinity);
      action.clampWhenFinished = self.data.clampWhenFinished;
      action.reset();
      action.play();
      self.actions.push(action);
    }
  },

  update() {
    // Rebuild if the schema changed after the model was already loaded.
    const self = this as any;
    const model = self.el.getObject3D("mesh");
    if (self.mixer && model?.animations?.length) self.play_(model.animations);
  },

  tick(_time: number, timeDelta: number) {
    const self = this as any;
    if (self.mixer) self.mixer.update((timeDelta / 1000) * self.data.timeScale);
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("model-loaded", self.onModelLoaded);
    if (self.mixer) {
      self.mixer.stopAllAction();
      const root = self.mixer.getRoot?.();
      if (root) self.mixer.uncacheRoot(root);
      self.mixer = null;
    }
    self.actions = [];
  }
} as ComponentDefinition;