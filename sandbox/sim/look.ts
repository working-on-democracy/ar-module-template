// Look values the server hands the app ready to use (SCHNITTSTELLEN.md): grain
// and the emissive tint's brightness. The sandbox viewer uses the same.
import type { Vec3 } from "./types";

// Grain shimmer (concept: per object from its own triangles, 0.4 · 2^(−n/1000),
// 0 from 10 000; grainScale 2400 / model height: about 2400 cells over the model's height)
export const grainOf = (triangles: number) => (triangles >= 10000 ? 0 : 0.4 * Math.pow(2, -triangles / 1000));
export const grainScaleOf = (m: { min: Vec3; max: Vec3 }) => 2400 / Math.max(1e-6, m.max[1] - m.min[1]);

// Emissive tint: pure hues differ a lot in brightness (yellow ~13× blue). The
// strength is scaled so every hue gives off as much light (relative luminance,
// linear) as the average pure hue does at that strength.
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (c: Vec3) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const pureHue = (h: number): Vec3 => {
  const k = (n: number) => (n + h * 6) % 6, f = (n: number) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5), f(3), f(1)];
};
const MEAN_HUE_LUMINANCE = Array.from({ length: 360 }, (_, i) => luminance(pureHue(i / 360))).reduce((a, b) => a + b, 0) / 360;
export const tintIntensity = (t: { color: Vec3; strength: number }) => (t.strength * MEAN_HUE_LUMINANCE) / Math.max(1e-3, luminance(t.color));
