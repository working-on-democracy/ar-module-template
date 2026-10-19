// Runs the simulation's job requests with the real .glb scripts, the way the
// platform server would later: reduce (copy, compress), split (halving),
// texture-crush, fuse (+ reduce to the kept share). Every result is a new file
// in the run's glb/ folder; the scripts always read uncompressed files and
// never compress, so no geometry is quantized twice.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CRUSH, STYLIZE_COPY } from "../sim/recipes";
import type { JobRequest, JobResult, ModelVersion, Vec3, World } from "../sim/types";
import { glbInfo } from "./glb-info";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export interface JobOptions {
  runDir: string; // glb paths in the world are relative to it
  /** Overrides the mode the simulation chose for every fusion (--fuse); null = as chosen. */
  fuseMode: "hart" | "weich" | "voxel" | null;
}

export function script(name: string, args: string[]): Promise<string> {
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
  const reduce = (from: string, to: string, target: number, extra: string[] = []) =>
    script("glb-reduce.ts", [abs(from), "--target", String(Math.max(4, Math.floor(target))), ...extra, "--out", abs(to)]);
  const stylize = (from: string, to: string, faces: number, extra: string[] = []) =>
    script("stylize-glb.ts", [abs(from), "--faces", String(faces), "--texture", String(STYLIZE_COPY.texture), "--saturation", String(STYLIZE_COPY.saturation), ...extra, "--no-compress", "--out", abs(to)]);
  const crush = (from: string, to: string) => // Phase 9
    script("glb-texture-crush.ts", [abs(from), "--format", "jpeg", "--quality", String(CRUSH.quality), "--passes", String(CRUSH.passes), "--saturation", String(CRUSH.saturation), "--out", abs(to)]);

  if (job.kind === "copy") {
    if (job.voxelCells) { // Phase 5
      const rel = out(`-voxel${job.voxelCells}`);
      await script("glb-fuse.ts", [abs(o.glb), "--mode", "voxel", "--voxel-cells", String(job.voxelCells), "--out", abs(rel)]);
      return { jobId: job.id, outputs: [await version(opt.runDir, rel)] };
    }
    const rel = out(`-kopie-${job.recipe ?? "reduce"}`);
    if (job.recipe === "p2") { // Phase 2; texture seams can stop it far above the target (Muschel-Vase, Rucksack): then permissive
      const faces = job.faces ?? STYLIZE_COPY.faces; // a Vorläufer of generation 2 gets fewer
      await stylize(o.glb, rel, faces);
      if ((await glbInfo(abs(rel))).triangles > faces * 1.5) await stylize(o.glb, rel, faces, ["--permissive"]);
    } else if (job.recipe === "copy") copyFileSync(abs(o.glb), abs(rel)); // same generation: a plain copy
    else await reduce(o.glb, rel, o.triangles * (job.keep ?? 1));
    return { jobId: job.id, outputs: [await version(opt.runDir, rel)] };
  }
  if (job.kind === "compress") {
    const rel = out("-komp");
    await reduce(o.glb, rel, o.triangles * (job.keep ?? 1));
    return { jobId: job.id, outputs: [await version(opt.runDir, rel)] };
  }
  if (job.kind === "crush") {
    const rel = out(`-crush${job.level ?? o.crushLevel + 1}`);
    await crush(o.glb, rel);
    return { jobId: job.id, outputs: [await version(opt.runDir, rel)] };
  }
  if (job.kind === "split") { // Phase 11, then the halves reduced (12, 13) and crushed (13)
    const prefix = out("-halb").replace(/\.glb$/, "");
    await script("glb-split.ts", [abs(o.glb), "--seed", String(job.seed ?? 1), "--out", abs(prefix)]);
    const halves: string[] = [];
    for (const side of ["a", "b"]) {
      let rel = `${prefix}-${side}.glb`;
      if (job.halving && job.halving.divisor > 1) {
        const info = await glbInfo(abs(rel));
        const red = `${prefix}-${side}-red.glb`;
        await reduce(rel, red, info.triangles / job.halving.divisor, o.voxelCells ? ["--permissive"] : []);
        rel = red;
      }
      if (job.halving?.crush) { const cr = `${prefix}-${side}-crush.glb`; await crush(rel, cr); rel = cr; }
      halves.push(rel);
    }
    return { jobId: job.id, outputs: [await version(opt.runDir, halves[0]), await version(opt.runDir, halves[1])] };
  }
  // pose and fuse (Phase 3, 4, 6, 7, 8, 10): union of both — B posed by the script around A,
  // height-matched — then the step's own reduction or stylization. Both with the same
  // arguments and seed, so the pose found first is the one the fusion uses.
  const b = w.objects.find((x) => x.id === job.partnerId);
  if (!b) return { jobId: job.id, outputs: [await version(opt.runDir, o.glb)] };
  const raw = out("-fuse-roh");
  const args = [abs(o.glb), abs(b.glb), "--mode", opt.fuseMode ?? job.fuseMode ?? "hart", "--seed", String(job.seed ?? job.id),
    "--overlap", job.overlap ?? "0.05-0.6", "--min-fill", "0.15", "--repair", "--out", abs(raw)];
  // B grows to A's height (after its rotation), but never more than maxGrowFactor in the world
  if (w.params.fuseMatchHeight) args.push("--match-height", "--max-scale", String((w.params.maxGrowFactor * b.scale) / o.scale));
  const matrixOf = (log: string) => {
    const m = log.match(/B matrix \(column-major[^)]*\): (\[[^\]]+\])/);
    return m ? (JSON.parse(m[1]) as number[]) : undefined;
  };
  if (job.kind === "pose") { // the quick part: where B goes, and the result's estimated bounds
    const log = await script("glb-fuse.ts", [...args, "--pose-only"]);
    const box = log.match(/result box \(estimate\): (\{.*\})/);
    const est = box ? (JSON.parse(box[1]) as { min: Vec3; max: Vec3 }) : { min: o.min, max: o.max };
    return { jobId: job.id, outputs: [{ glb: o.glb, triangles: o.triangles, min: est.min, max: est.max }], bMatrix: matrixOf(log) };
  }
  const log = await script("glb-fuse.ts", args);
  const bMatrix = matrixOf(log);
  const rel = out(`-fuse-${job.recipe ?? ""}`);
  const post = job.fusePost ?? { kind: "reduce", target: o.triangles + b.triangles };
  if (post.kind === "reduce") await reduce(raw, rel, post.target);
  else if (post.kind === "stylize") await stylize(raw, rel, post.faces, ["--permissive"]);
  else {
    await script("glb-reduce.ts", [abs(raw), "--error", String(post.error), "--out", abs(rel)]);
    const info = await glbInfo(abs(rel));
    if (info.triangles > post.max) await reduce(rel, rel.replace(/\.glb$/, "-max.glb"), post.max);
    if (info.triangles > post.max) return { jobId: job.id, outputs: [await version(opt.runDir, rel.replace(/\.glb$/, "-max.glb"))], bMatrix };
  }
  return { jobId: job.id, outputs: [await version(opt.runDir, existsSync(abs(rel)) ? rel : raw)], bMatrix };
}
