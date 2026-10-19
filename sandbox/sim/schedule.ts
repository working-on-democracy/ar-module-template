// Fixed time steps, job results used at their due time: the clock keeps
// running while jobs compute and stops only when a result is due and not
// ready yet. Every run with the same seed takes the same steps and uses every
// result at the same Eigenzeit, however fast the jobs are computed.
import type { JobRequest, JobResult, World } from "./types";
import { applyJob, step } from "./world";

/** Calendar days per step. */
export const QUANTUM = 0.01;

/** Uses all results that are due. Returns the job the clock has to wait for, or null. */
export function useDueResults(w: World, ready: Map<number, JobResult>): JobRequest | null {
  for (const job of [...w.jobs].sort((a, b) => a.id - b.id)) {
    if (job.dueAt > w.eigen) continue;
    const result = ready.get(job.id);
    if (!result) return job;
    ready.delete(job.id);
    applyJob(w, result);
  }
  return null;
}

/** One step, unless a due result is missing. Returns the new job requests, or the job it waits for. */
export function advance(w: World, ready: Map<number, JobResult>): { jobs: JobRequest[] } | { waiting: JobRequest } {
  const waiting = useDueResults(w, ready);
  if (waiting) return { waiting };
  return { jobs: step(w, QUANTUM) };
}
