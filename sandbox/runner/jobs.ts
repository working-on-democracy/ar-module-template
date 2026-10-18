// Runs the simulation's job requests with the real .glb scripts, the way the
// platform server would later: reduce (copy, compress), split (halving),
// texture-crush, fuse (+ reduce to the kept share). Every result is a new file
// in the run's glb/ folder; the scripts always read uncompressed files and
// never compress, so no geometry is quantized twice.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobRequest, JobResult, ModelVersion, World } from "../sim/types";
import { glbInfo } from "./glb-info";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** JPEG quality per crush level (level 1 … 5, then stays at the last). */
const CRUSH_QUALITY = [30, 15, 8, 4, 2];

export interface JobOptions {
  runDir: string; // glb paths in the world are relative to it
  fuseMode: "hart" | "weich" | "voxel";
}

function script(name: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("npx", ["tsx", join(ROOT, "scripts", name), ...args], { cwd: ROOT, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${name} ${args.join(" ")}\n${stderr || stdout || err.message}`));
      else resolve(stdout);
    });
  });
}

async function version(runDir: string, rel: string): Promise<ModelVersion> {
  const info = await glbInfo(join(runDir, rel));
  return { glb: rel, triangles: info.triangles, min: info.min, max: info.max };
}

export async function runGlbJob(w: World, job: JobRequest, opt: JobOptions): Promise<JobResult> {
  const o = w.objects.find((x) => x.id === job.objectId);
  if (!o) return { jobId: job.id, outputs: [] };
  const abs = (rel: string) => join(opt.runDir, rel);
  const out = (suffix: string) => `glb/${o.id}-j${job.id}${suffix}.glb`;

  if (job.kind === "copy" || job.kind === "compress") {
    const target = Math.max(4, Math.floor(o.triangles * (job.keep ?? 1)));
    const rel = out(job.kind === "copy" ? "-kopie" : "-komp");
    await script("glb-reduce.ts", [abs(o.glb), "--target", String(target), "--out", abs(rel)]);
    return { jobId: job.id, outputs: [await version(opt.runDir, rel)] };
  }
  if (job.kind === "crush") {
    const level = job.level ?? o.crushLevel + 1;
    const q = CRUSH_QUALITY[Math.min(CRUSH_QUALITY.length, level) - 1];
    const rel = out(`-crush${level}`);
    await script("glb-texture-crush.ts", [abs(o.glb), "--quality", String(q), "--out", abs(rel)]);
    return { jobId: job.id, outputs: [await version(opt.runDir, rel)] };
  }
  if (job.kind === "split") {
    const prefix = out("-halb").replace(/\.glb$/, "");
    await script("glb-split.ts", [abs(o.glb), "--seed", String(job.seed ?? 1), "--out", abs(prefix)]);
    return { jobId: job.id, outputs: [await version(opt.runDir, `${prefix}-a.glb`), await version(opt.runDir, `${prefix}-b.glb`)] };
  }
  // fuse: union of both (B posed by the script around A, height-matched when
  // the rule says so), then reduced to the kept share of both counts
  const b = w.objects.find((x) => x.id === job.partnerId);
  if (!b) return { jobId: job.id, outputs: [await version(opt.runDir, o.glb)] };
  const raw = out("-fuse-roh");
  const args = [abs(o.glb), abs(b.glb), "--mode", opt.fuseMode, "--seed", String(job.id), "--out", abs(raw)];
  if (w.params.fuseMatchHeight) args.push("--match-height");
  await script("glb-fuse.ts", args);
  const rel = out("-fuse");
  const target = Math.max(4, Math.floor((o.triangles + b.triangles) * (job.keep ?? 1)));
  await script("glb-reduce.ts", [abs(raw), "--target", String(target), "--out", abs(rel)]);
  return { jobId: job.id, outputs: [await version(opt.runDir, existsSync(abs(rel)) ? rel : raw)] };
}
