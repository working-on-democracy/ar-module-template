// Geometry jobs as plain numbers, for the lifecycle page: no .glb is touched,
// the triangle counts and bounds change the way the real scripts roughly
// change them (reduce keeps a fraction, split divides along a plane).
import { compose, multiply, randomQuat, transformPoint } from "./pose";
import { fusePostTriangles, STYLIZE_COPY } from "./recipes";
import { createRng } from "./rng";
import type { JobRequest, JobResult, ModelVersion, Vec3, World } from "./types";

export function runAbstractJob(w: World, job: JobRequest): JobResult {
  const o = w.objects.find((x) => x.id === job.objectId);
  if (!o) return { jobId: job.id, outputs: [] };
  const base: ModelVersion = { glb: o.glb, triangles: o.triangles, min: [...o.min], max: [...o.max] };
  if (job.kind === "copy" && job.voxelCells) {
    // measured with glb-fuse --mode voxel: about 4.2 × cells² triangles, a single cube 12
    return { jobId: job.id, outputs: [{ ...base, triangles: Math.max(12, Math.round(4.2 * job.voxelCells * job.voxelCells)) }] };
  }
  if (job.kind === "copy" && job.recipe === "p2") {
    // Phase 2 stylize: about STYLIZE_COPY.faces triangles (more where seams stay)
    return { jobId: job.id, outputs: [{ ...base, triangles: Math.min(o.triangles, STYLIZE_COPY.faces) }] };
  }
  if (job.kind === "copy" || job.kind === "compress") {
    return { jobId: job.id, outputs: [{ ...base, triangles: Math.max(1, Math.floor(o.triangles * (job.keep ?? 1))) }] };
  }
  if (job.kind === "crush") return { jobId: job.id, outputs: [base] };
  if (job.kind === "fuse") {
    // like glb-fuse: B gets a random rotation about all axes, is scaled to A's
    // height (only grows, at most maxGrowFactor in the world) and placed near
    // A's centre; the result is A's frame with B inside
    const b = w.objects.find((x) => x.id === job.partnerId);
    if (!b) return { jobId: job.id, outputs: [base] };
    const rng = createRng(job.seed ?? job.id);
    const q = randomQuat(rng);
    // like glb-fuse --match-height: B's height AFTER its rotation is matched (capped by maxGrowFactor)
    const rot = compose([0, 0, 0], q, 1);
    let y0 = Infinity, y1 = -Infinity;
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const v = transformPoint(rot, [x, y, z]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]);
    }
    const hA = o.max[1] - o.min[1], hB = Math.max(1e-6, y1 - y0);
    const worldGrow = w.params.fuseMatchHeight ? Math.min(w.params.maxGrowFactor, Math.max(1, (hA * o.scale) / (hB * b.scale))) : 1;
    const sRel = (b.scale * worldGrow) / o.scale; // B's file units → A's file units
    const cA = [0, 1, 2].map((k) => (o.min[k] + o.max[k]) / 2), cB = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2);
    const off = [0, 1, 2].map((k) => cA[k] + rng.range(-0.35, 0.35) * (o.max[k] - o.min[k])) as Vec3;
    const bMatrix = multiply(compose(off, q, sRel), compose([-cB[0], -cB[1], -cB[2]], [0, 0, 0, 1], 1));
    const min: Vec3 = [...o.min], max: Vec3 = [...o.max];
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const v = transformPoint(bMatrix, [x, y, z]);
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
    }
    return {
      jobId: job.id,
      outputs: [{ glb: o.glb, triangles: Math.max(1, job.fusePost ? fusePostTriangles(job.fusePost, o.triangles + b.triangles) : o.triangles + b.triangles), min, max }],
      bMatrix,
    };
  }
  // split: whole triangles to each side of a plane near the middle
  const rng = createRng(job.seed ?? 1);
  const f = rng.range(0.4, 0.6);
  const ta = Math.floor(o.triangles * f), div = job.halving?.divisor ?? 1;
  const cut = o.min[0] + (o.max[0] - o.min[0]) * f;
  return {
    jobId: job.id,
    outputs: [
      // then each half reduced to a half / a third (Phase 12, 13)
      { ...base, triangles: Math.max(1, Math.floor(ta / div)), max: [cut, o.max[1], o.max[2]] },
      { ...base, triangles: Math.max(1, Math.floor((o.triangles - ta) / div)), min: [cut, o.min[1], o.min[2]] },
    ],
  };
}
