// The descent's three magnetic points: corners of a triangle around the
// planted origin objects, chosen once when planting (see createWorld).
import type { Params } from "../params";
import type { Rng } from "./rng";
import type { Vec3 } from "./types";

const TRIES = 20000; // random triangles tried before the best miss is taken

/** An origin object on the ground: its centre and the radius of its footprint. */
export interface Footprint { pos: Vec3; r: number }

/** Three corners (on the ground, counterclockwise) of a triangle with random
 *  angles: every origin footprint lies inside it, gatherEdgeGap off its edges;
 *  every corner is at least gatherCornerMinDist from the middle and within
 *  gatherCornerMaxDist of the nearest origin object's centre (more when the
 *  origin objects stand further apart than gatherSpreadRef); no angle is under
 *  gatherMinAngle. Random tries; should none fit, the one that misses least. */
export function gatherTriangle(origins: Footprint[], rng: Rng, p: Params): Vec3[] {
  const n = Math.max(1, origins.length);
  const cx = origins.reduce((s, o) => s + o.pos[0], 0) / n, cz = origins.reduce((s, o) => s + o.pos[2], 0) / n;
  const reach = Math.max(0, ...origins.map((o) => Math.hypot(o.pos[0] - cx, o.pos[2] - cz)));
  const maxDist = p.gatherCornerMaxDist + p.gatherCornerPerSpread * Math.max(0, reach - p.gatherSpreadRef);
  const minAngle = (p.gatherMinAngle * Math.PI) / 180;
  let best: Vec3[] = [], bestMiss = Infinity;
  for (let t = 0; t < TRIES && bestMiss > 0; t++) {
    // directions from the middle in counterclockwise order, each gap under 180° so the middle lies inside
    const a0 = rng.range(0, Math.PI * 2);
    const [u, v] = [rng.next(), rng.next()].sort((x, y) => x - y);
    const gaps = [u, v - u, 1 - v].map((g) => g * Math.PI * 2);
    if (Math.max(...gaps) >= Math.PI) continue;
    const dirs = [a0, a0 + gaps[0], a0 + gaps[0] + gaps[1]];
    const c: Vec3[] = dirs.map((a) => {
      const r = rng.range(Math.max(reach, p.gatherCornerMinDist), reach + maxDist); // outside the origin objects, never too close or too far
      return [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r];
    });
    let miss = 0;
    for (let i = 0; i < 3; i++) {
      const a = c[i], b = c[(i + 1) % 3], q = c[(i + 2) % 3];
      const ex = b[0] - a[0], ez = b[2] - a[2], len = Math.hypot(ex, ez);
      if (len < 1e-6) { miss = Infinity; break; }
      // inside lies to the left of a → b
      for (const o of origins) miss += Math.max(0, o.r + p.gatherEdgeGap - (ex * (o.pos[2] - a[2]) - ez * (o.pos[0] - a[0])) / len);
      miss += Math.max(0, Math.min(...origins.map((o) => Math.hypot(a[0] - o.pos[0], a[2] - o.pos[2]))) - maxDist);
      miss += Math.max(0, p.gatherCornerMinDist - Math.hypot(a[0] - cx, a[2] - cz));
      const angle = Math.acos(Math.max(-1, Math.min(1, ((b[0] - a[0]) * (q[0] - a[0]) + (b[2] - a[2]) * (q[2] - a[2])) / (len * Math.hypot(q[0] - a[0], q[2] - a[2])))));
      miss += Math.max(0, minAngle - angle);
    }
    if (miss < bestMiss) { best = c; bestMiss = miss; }
  }
  return best.length ? best : [0, 1, 2].map(() => [cx, 0, cz] as Vec3);
}
