// AN ALLE! Zwischen-Basis (archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md, "Swipe + Proximity statt
// GUI" decision, 31.08.2026) — extracted from proximity-motion.ts (itself
// ported from zufallsverteilung-lod's proximity-swing.ts) into its own
// module, the same way seeded-random.ts and proximity-fade-shared.ts's
// rampFactor were: a small, generically useful measurement any future
// proximity-driven component can import, not just this one.
//
// Measures how "close" the camera is to a tracked target IMAGE as SCREEN
// COVERAGE, not a 3D world distance — a raw camera-to-point distance
// doesn't account for viewing angle: tilting the phone relative to the
// printed image changes how "close" it visually reads without changing
// that distance. Coverage = how much of the camera's field of view the
// target's own width fills, computed as the NDC (normalized device
// coordinate, [-1, 1] = the full screen) gap between the target's centre
// and one edge, projected through the live camera — i.e. roughly "target
// width as a fraction of screen width". A width-based proxy rather than
// true projected AREA (would need clipping a rotated quad against the
// screen rectangle) — close enough for a smooth, monotonic "closer =
// bigger number" signal, which is all a proximity ramp needs. Keeps
// growing past 1 as the target overflows the frame (project() does not
// clip out-of-view points) — usually fine, since a "near" threshold only
// needs to mark "close enough for full effect", not the literal point
// where the image stops fitting on screen.
//
// This is typically a FIELD-WIDE quantity shared by every object anchored
// to the same target image, so screenCoverage() is computed at most ONCE
// PER FRAME regardless of how many callers ask for it — memoized by the
// `time` argument every A-Frame tick() receives, which is guaranteed
// identical for every component ticking within the same frame.
declare const AFRAME: any;

let cachedTime = -1;
let cachedCoverage = 0;

/**
 * @param time         The `time` argument this tick() received — used as the memoization key.
 * @param camera       The active camera object (e.g. `this.el.sceneEl.camera`).
 * @param targetObject3D  The tracked target's own object3D (its LOCAL width is what's measured).
 * @param targetHalfWidth Half the target's own LOCAL width, in the target's own local units.
 */
export function screenCoverage(time: number, camera: any, targetObject3D: any, targetHalfWidth: number): number {
  if (time === cachedTime) return cachedCoverage;
  cachedTime = time;
  const center = new AFRAME.THREE.Vector3(0, 0, 0);
  targetObject3D.localToWorld(center);
  const edge = new AFRAME.THREE.Vector3(targetHalfWidth, 0, 0);
  targetObject3D.localToWorld(edge);
  center.project(camera);
  edge.project(camera);
  const value = Math.abs(edge.x - center.x);
  // `camera.project()` can return NaN for a frame or two right at startup
  // (confirmed via device console, 31.08.2026: the camera's projection
  // matrix isn't valid yet on an entity's very first tick — a known iOS
  // Safari quirk where the WebGL canvas's effective size/aspect ratio
  // isn't settled until the first resize event, which a touch/swipe can
  // trigger indirectly). Callers writing this straight into a live
  // object's transform should NOT propagate that NaN — falling back to 0
  // here means a bad frame just delays proximity-driven motion by a
  // frame instead of corrupting whatever position it feeds into.
  cachedCoverage = Number.isFinite(value) ? value : 0;
  return cachedCoverage;
}
