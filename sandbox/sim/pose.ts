// Minimal 4×4 / quaternion math for poses (no three.js, so the core stays
// small for the lifecycle page). Matrices are column-major arrays of 16, like
// three.js and glTF. A Pose is the transform of a model's own frame into the
// world: position, rotation, uniform scale.
import type { Rng } from "./rng";

export type Mat4 = number[];
export type Quat = [number, number, number, number]; // x, y, z, w
export interface Pose { p: [number, number, number]; q: Quat; s: number }

export function compose(p: [number, number, number], q: Quat, s: number): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s, (xy + wz) * s, (xz - wy) * s, 0,
    (xy - wz) * s, (1 - (xx + zz)) * s, (yz + wx) * s, 0,
    (xz + wy) * s, (yz - wx) * s, (1 - (xx + yy)) * s, 0,
    p[0], p[1], p[2], 1,
  ];
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + row] * b[c * 4 + k];
    r[c * 4 + row] = v;
  }
  return r;
}

/** Position, rotation and (mean) scale of a matrix without shear. */
export function decompose(m: Mat4): Pose {
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const m00 = m[0] / sx, m10 = m[1] / sx, m20 = m[2] / sx, m01 = m[4] / sy, m11 = m[5] / sy, m21 = m[6] / sy, m02 = m[8] / sz, m12 = m[9] / sz, m22 = m[10] / sz;
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]; }
  return { p: [m[12], m[13], m[14]], q: normalize(q), s: (sx + sy + sz) / 3 };
}

export function transformPoint(m: Mat4, v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

function normalize(q: Quat): Quat {
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export const quatY = (a: number): Quat => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];

/** Uniformly random rotation (Shoemake). */
export function randomQuat(rng: Rng): Quat {
  const u1 = rng.next(), u2 = rng.next() * Math.PI * 2, u3 = rng.next() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (cos > 0.9995) return normalize([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  const th = Math.acos(cos), sin = Math.sin(th), wa = Math.sin((1 - t) * th) / sin, wb = Math.sin(t * th) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t],
    q: slerp(a.q, b.q, t),
    s: a.s + (b.s - a.s) * t,
  };
}

/** Rotation by `angle` about a horizontal axis pointing in direction `dir` (radians, in the ground plane). */
export const quatTilt = (angle: number, dir: number): Quat => {
  const s = Math.sin(angle / 2);
  return [Math.cos(dir) * s, 0, Math.sin(dir) * s, Math.cos(angle / 2)];
};

/** m, then rotated by q about the world point `pivot`. */
export function rotateAbout(m: Mat4, pivot: [number, number, number], q: Quat): Mat4 {
  const r = transformPoint(compose([0, 0, 0], q, 1), pivot);
  return multiply(compose([pivot[0] - r[0], pivot[1] - r[1], pivot[2] - r[2]], q, 1), m);
}
