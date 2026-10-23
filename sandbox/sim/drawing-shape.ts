// The shape of a drawing as the platform's draw tool records it (ar-demo-backend,
// frontend/src/components/ar-draw-tool.ts and ar-tube.ts, checked at 0651352):
// one drawing holds several lines, each line a colour and points at least 1 cm
// apart, every point with its own tube radius from the drawing speed (slow =
// thick, fast = thin). The sandbox draws such lines as a simulated hand gesture.
import type { Params } from "../params";
import type { Rng } from "./rng";
import type { DrawingLine, Vec3 } from "./types";

// the draw tool's numbers (not tuning knobs of the plant: they follow the platform)
export const STROKE_DEFAULT_RADIUS = 0.012;
export const STROKE_MIN_RADIUS = 0.006;
export const STROKE_MAX_RADIUS = 0.022;
const SLOW_MPS = 0.05, FAST_MPS = 1.0; // speed → radius, linear in between
const SPEED_SMOOTHING_ALPHA = 0.25;
const MIN_POINT_DISTANCE = 0.01; // m between accepted points
/** The platform's colour picker (ColorPicker.vue). */
export const STROKE_COLORS = ["#ec1f1f", "#cc5151", "#f66906", "#ef9539", "#f49b03", "#f3e70b", "#26ec18", "#34b677", "#05f8dd", "#3aa9b6", "#0962f4", "#8272b8", "#bc4184", "#ec137d", "#111111", "#9ca3af"];

const speedToRadius = (mps: number) => STROKE_MAX_RADIUS + (STROKE_MIN_RADIUS - STROKE_MAX_RADIUS) * Math.min(1, Math.max(0, (mps - SLOW_MPS) / (FAST_MPS - SLOW_MPS)));

/** Lines of one drawing, relative to its anchor: hand gestures at about chest height,
 *  at 60 samples a second with a speed that swells and fades and a heading that bends. */
export function drawingLines(rng: Rng, p: Params, color?: string): DrawingLine[] {
  const lines: DrawingLine[] = [];
  const n = 1 + Math.floor(rng.range(0, p.drawingLinesMax));
  let start: Vec3 = [0, rng.range(0.9, 1.6), 0];
  let colour = color ?? STROKE_COLORS[Math.floor(rng.range(0, STROKE_COLORS.length))];
  for (let k = 0; k < n; k++) {
    if (k) {
      start = [start[0] + rng.range(-0.25, 0.25), Math.max(0.3, start[1] + rng.range(-0.2, 0.2)), start[2] + rng.range(-0.25, 0.25)];
      if (!color && rng.next() < 0.4) colour = STROKE_COLORS[Math.floor(rng.range(0, STROKE_COLORS.length))]; // now and then another colour
    }
    const seconds = rng.range(p.drawingGestureMinSeconds, p.drawingGestureMaxSeconds);
    const dt = 1 / 60;
    // heading: a unit vector turning by an angular velocity that wanders
    let yaw = rng.range(0, Math.PI * 2), pitch = rng.range(-0.6, 0.6), turnYaw = 0, turnPitch = 0;
    const peak = rng.range(0.25, 0.8), swell = rng.range(0.5, 1.5), phase = rng.range(0, Math.PI * 2);
    let pos: Vec3 = [...start];
    let last: Vec3 = [...start], lastT = 0, smoothed = 0;
    const points: DrawingLine["points"] = [[pos[0], pos[1], pos[2], STROKE_DEFAULT_RADIUS]];
    for (let t = dt; t <= seconds; t += dt) {
      turnYaw += rng.range(-1, 1) * 18 * dt; turnPitch += rng.range(-1, 1) * 12 * dt;
      turnYaw *= 0.97; turnPitch *= 0.97;
      yaw += turnYaw * dt * 4; pitch = Math.max(-1.2, Math.min(1.2, pitch + turnPitch * dt * 4));
      const speed = peak * (0.25 + 0.75 * Math.pow(Math.sin(Math.PI * Math.min(1, t / seconds)), 0.6) * (0.75 + 0.25 * Math.sin(swell * t * 2 * Math.PI + phase)));
      pos = [pos[0] + Math.cos(pitch) * Math.cos(yaw) * speed * dt, Math.max(0.15, pos[1] + Math.sin(pitch) * speed * dt), pos[2] + Math.cos(pitch) * Math.sin(yaw) * speed * dt];
      const dist = Math.hypot(pos[0] - last[0], pos[1] - last[1], pos[2] - last[2]);
      if (dist < MIN_POINT_DISTANCE) continue;
      smoothed += (dist / (t - lastT) - smoothed) * SPEED_SMOOTHING_ALPHA;
      points.push([pos[0], pos[1], pos[2], speedToRadius(smoothed)]);
      last = pos; lastT = t;
    }
    if (points.length >= 2) lines.push({ color: colour, points });
  }
  return lines;
}
