import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// Loops a glTF animation that was never authored to loop seamlessly, by
// cross-fading its last `crossfade` seconds into its start:
//
//   <a-entity gltf-model="#flag" crossfade-loop-clip="clip: animation_0; crossfade: 0.5"></a-entity>
//
// Use INSTEAD of animation-mixer on the same entity (two mixers on one model
// fight over the pose, same as trim-loop-clip).
//
// Plays the same range animation-mixer plays — from t = 0 to the clip's end;
// keyframes before 0 (some Blender exports have them) stay unplayed — but
// rebuilds every track so that during the final `crossfade` seconds the pose
// blends linearly towards the pose at `crossfade` seconds into the clip, and
// the loop restarts exactly there:
//
//   loop = [crossfade, end]; at end - crossfade + x the pose is
//   lerp(pose(end - crossfade + x), pose(x), x / crossfade)
//
// so the last frame of one pass equals the first frame of the next. Works
// for any track type (morph weights, position, scale; quaternions are
// re-normalised after the blend). Written for #16 Friendly reminder, whose
// flag is a baked cloth simulation (401 morph-target frames) whose end
// doesn't match its start — measured, the old loop jumped ~28x a normal
// frame step (augmented-bahnhofsviertel/PORTING-GUIDE.md).
//
// `clip`: clip name, or "*" for every clip on the model (like
// animation-mixer). `timeScale`: playback speed multiplier.
function buildCrossfadeLoop(clip: any, crossfade: number): any {
  const start = 0;
  const end = clip.duration;
  const fade = Math.max(0, Math.min(crossfade, (end - start) / 2));
  const loopStart = start + fade;
  const fadeFrom = end - fade;

  const tracks = clip.tracks.map((track: any) => {
    const size = track.getValueSize();
    const interpolant = track.createInterpolant();
    const sample = (t: number): number[] => Array.from(interpolant.evaluate(t) as ArrayLike<number>).slice(0, size);
    const isQuaternion = track.ValueTypeName === "quaternion";

    const keyTimes: number[] = Array.from(track.times as ArrayLike<number>);
    const times = new Set<number>([loopStart, end]);
    for (const t of keyTimes) if (t > loopStart && t < end) times.add(t);
    // Also take keys of the start segment that the fade samples from, so its
    // shape isn't lost between the fade region's own keys.
    for (const t of keyTimes) {
      if (t > start && t < loopStart) times.add(fadeFrom + (t - start));
    }
    const sorted = [...times].sort((a, b) => a - b);

    const newTimes: number[] = [];
    const newValues: number[] = [];
    for (const t of sorted) {
      let value = sample(t);
      if (fade > 0 && t >= fadeFrom) {
        const alpha = (t - fadeFrom) / fade;
        const target = sample(start + (t - fadeFrom));
        value = value.map((v, i) => v + (target[i] - v) * alpha);
        if (isQuaternion) {
          const len = Math.hypot(...value) || 1;
          value = value.map((v) => v / len);
        }
      }
      newTimes.push(t - loopStart);
      newValues.push(...value);
    }
    const TrackType = track.constructor;
    return new TrackType(track.name, newTimes, newValues, track.getInterpolation());
  });

  return new THREE.AnimationClip(`${clip.name}-crossfade-loop`, end - loopStart, tracks);
}

export default {
  schema: {
    clip: { default: "*" },
    crossfade: { default: 0.5 },
    timeScale: { default: 1 }
  },

  init() {
    const self = this as any;
    self.mixer = null;
    self.onObject3DSet = (e: any) => {
      if (e.detail?.type === "mesh") self.setup();
    };
    self.el.addEventListener("object3dset", self.onObject3DSet);
    if (self.el.getObject3D("mesh")) self.setup();
  },

  update(oldData: any) {
    const self = this as any;
    if (oldData && Object.keys(oldData).length && self.el.getObject3D("mesh")) self.setup();
  },

  setup() {
    const self = this as any;
    const mesh = self.el.getObject3D("mesh");
    const clips: any[] = mesh?.animations ?? [];
    self.teardown();
    if (!clips.length) return;
    const wanted = self.data.clip === "*" ? clips : clips.filter((c: any) => c.name === self.data.clip);
    self.mixer = new THREE.AnimationMixer(mesh);
    self.loopClips = wanted.map((c: any) => buildCrossfadeLoop(c, self.data.crossfade));
    for (const loopClip of self.loopClips) {
      const action = self.mixer.clipAction(loopClip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    }
  },

  teardown() {
    const self = this as any;
    if (!self.mixer) return;
    self.mixer.stopAllAction();
    self.mixer.uncacheRoot(self.mixer.getRoot());
    self.mixer = null;
  },

  tick(_t: number, delta: number) {
    const self = this as any;
    if (self.mixer && delta) self.mixer.update((delta / 1000) * self.data.timeScale);
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("object3dset", self.onObject3DSet);
    self.teardown();
  }
} as ComponentDefinition;
