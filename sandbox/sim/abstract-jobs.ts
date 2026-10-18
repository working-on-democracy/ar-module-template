// Geometry jobs as plain numbers, for the lifecycle page: no .glb is touched,
// the triangle counts and bounds change the way the real scripts roughly
// change them (reduce keeps a fraction, split divides along a plane).
import { createRng } from "./rng";
import type { JobRequest, JobResult, ModelVersion, Vec3, World } from "./types";

export function runAbstractJob(w: World, job: JobRequest): JobResult {
  const o = w.objects.find((x) => x.id === job.objectId);
  if (!o) return { jobId: job.id, outputs: [] };
  const base: ModelVersion = { glb: o.glb, triangles: o.triangles, min: [...o.min], max: [...o.max] };
  if (job.kind === "copy" || job.kind === "compress") {
    return { jobId: job.id, outputs: [{ ...base, triangles: Math.max(1, Math.floor(o.triangles * (job.keep ?? 1))) }] };
  }
  if (job.kind === "crush") return { jobId: job.id, outputs: [base] };
  if (job.kind === "fuse") {
    // union of both: the larger bounds, both triangle counts together, compressed by `keep`
    const b = w.objects.find((x) => x.id === job.partnerId);
    if (!b) return { jobId: job.id, outputs: [base] };
    const f = (job.partnerScale ?? b.scale) / o.scale;
    return {
      jobId: job.id,
      outputs: [{
        glb: o.glb,
        triangles: Math.max(1, Math.floor((o.triangles + b.triangles) * (job.keep ?? 1))),
        // the partner, grown to partnerScale, expressed in A's model units
        min: [0, 1, 2].map((k) => Math.min(o.min[k], b.min[k] * f)) as Vec3,
        max: [0, 1, 2].map((k) => Math.max(o.max[k], b.max[k] * f)) as Vec3,
      }],
    };
  }
  // split: whole triangles to each side of a plane near the middle
  const rng = createRng(job.seed ?? 1);
  const f = rng.range(0.4, 0.6);
  const ta = Math.floor(o.triangles * f);
  const cut = o.min[0] + (o.max[0] - o.min[0]) * f;
  return {
    jobId: job.id,
    outputs: [
      { ...base, triangles: ta, max: [cut, o.max[1], o.max[2]] },
      { ...base, triangles: o.triangles - ta, min: [cut, o.min[1], o.min[2]] },
    ],
  };
}

/** Runs one step and resolves its jobs at once (no waiting, as on a fast server). */
export function settleJobs(w: World, apply: (w: World, r: JobResult) => void) {
  for (const job of [...w.jobs]) apply(w, runAbstractJob(w, job));
}
