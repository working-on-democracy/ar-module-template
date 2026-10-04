import type { ComponentDefinition } from "aframe";

declare const THREE: any;

// #6 Birdkin(d): after "Start", places the membrane models on a timeline,
// each with its own one-shot positional sound. Port of the original's
// `distance-place-sequence` (place-model.js, built with scaleRandom +
// rotateRandom):
//
//   <a-entity birdkind-distance-place-sequence="sequence: 0, 40, 46;
//             models: #a, #b; sounds: #s1, #s2, #s3"></a-entity>
//
// Same rules as the original: a seconds counter starts with start(); when it
// reaches the next `sequence` entry, stop n places models[n % models] with
// sounds[n % sounds], `distance` ± `variation`/2 units along the camera's
// view direction (pitch included), dropped to the floor (y = 0), turned to a
// random heading and springing up from 0.001 to a random scale
// max(4, random·9) within 750 ms (elastic ease). The sound plays once from
// the model's position (refDistance 4, volume 4, inverse distance model —
// the original's THREE.PositionalAudio settings, the schema defaults here).
// Shadows: cast only. `distanceModel`, `maxDistance` and `rolloffFactor`
// are not in the original — they allow a steeper falloff than its gentle
// inverse curve (#6 uses linear with a range, chosen after the phone test:
// in the original every source sounded about equally loud at any distance).
//
// Why a port: the original added raw three.js objects and PositionalAudio to
// the scene root, read the camera's LOCAL position as scene coordinates, and
// needed TWEEN. Here models are A-Frame entities with a `sound` component
// inside this entity (put it inside the legacy-space hull, at the old scene
// origin): camera position and direction are converted into this entity's
// space, and the sound's refDistance is scaled by the hull scale the same way
// legacy-space scales every other sound. The scale tween uses A-Frame's
// animation component (easeOutElastic) instead of TWEEN's Elastic.Out.
// start() must be called from the Start tap after unlocking audio.
export default {
  schema: {
    sequence: { type: "array", default: [] },
    models: { type: "array", default: [] },
    sounds: { type: "array", default: [] },
    distance: { type: "number", default: 20 },
    variation: { type: "number", default: 3 },
    refDistance: { type: "number", default: 4 },
    volume: { type: "number", default: 4 },
    distanceModel: { default: "inverse", oneOf: ["linear", "inverse", "exponential"] },
    maxDistance: { type: "number", default: 10000 },
    rolloffFactor: { type: "number", default: 1 }
  },

  init() {
    const self = this as any;
    self.camPos = new THREE.Vector3();
    self.camDir = new THREE.Vector3();
    self.invQuat = new THREE.Quaternion();
    self.timer = null;
  },

  start() {
    const self = this as any;
    self.stop();
    const sequence = self.data.sequence.map((v: string) => parseInt(String(v).trim(), 10));
    let stop = 0;
    let time = 0;
    self.timer = setInterval(() => {
      if (stop === sequence.length) self.stop();
      if (time === sequence[stop]) {
        self.placeModel(stop);
        stop++;
      }
      time++;
    }, 1000);
  },

  stop() {
    const self = this as any;
    if (self.timer) clearInterval(self.timer);
    self.timer = null;
  },

  hullScale(): number {
    const hull = (this as any).el.closest("[legacy-space]") as any;
    return hull?.components["legacy-space"]?.scale ?? 1;
  },

  placeModel(stop: number) {
    const self = this as any;
    const camera = self.el.sceneEl.camera;
    const { models, sounds } = self.data;
    if (!camera || !models.length) return;
    const obj = self.el.object3D;
    obj.updateMatrixWorld();
    // Camera position and view direction in this entity's (old scene) space.
    camera.getWorldPosition(self.camPos);
    obj.worldToLocal(self.camPos);
    camera.getWorldDirection(self.camDir);
    obj.getWorldQuaternion(self.invQuat).invert();
    self.camDir.applyQuaternion(self.invQuat).normalize();

    const distance = self.data.distance + (Math.random() - 0.5) * self.data.variation;
    const x = self.camPos.x + self.camDir.x * distance;
    const z = self.camPos.z + self.camDir.z * distance;
    const heading = Math.random() * 360;
    const s = Math.max(4, Math.random() * 9);

    const el = document.createElement("a-entity");
    el.setAttribute("gltf-model", models[stop % models.length]);
    el.setAttribute("position", `${x} 0 ${z}`);
    el.setAttribute("rotation", `0 ${heading} 0`);
    el.setAttribute("scale", "0.001 0.001 0.001");
    el.setAttribute("shadow", "cast: true; receive: false");
    el.setAttribute("animation__grow",
      `property: scale; from: 0.001 0.001 0.001; to: ${s} ${s} ${s}; dur: 750; easing: easeOutElastic`);
    if (sounds.length) {
      el.setAttribute("sound",
        `src: ${sounds[stop % sounds.length]}; autoplay: true; loop: false; positional: true; ` +
        `distanceModel: ${self.data.distanceModel}; rolloffFactor: ${self.data.rolloffFactor}; ` +
        `refDistance: ${self.data.refDistance}; maxDistance: ${self.data.maxDistance}; volume: ${self.data.volume}`);
      // Scale the reference distance to the hull, like legacy-space's
      // scaleSoundDistances (which only sees sounds present at placement).
      el.addEventListener("sound-loaded", () => {
        const sound = (el as any).components.sound;
        const hs = self.hullScale();
        sound.pool.children.forEach((audio: any) => {
          audio.setRefDistance(sound.data.refDistance * hs);
          audio.setMaxDistance(sound.data.maxDistance * hs);
        });
      });
    }
    self.el.appendChild(el);
  },

  remove() {
    (this as any).stop();
  }
} as ComponentDefinition;
