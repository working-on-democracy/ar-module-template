// Runs the simulation's job requests with the real .glb scripts, the way the
// platform server would later: reduce (copy, compress), split (halving),
// texture-crush, fuse (+ reduce to the kept share). Every result is a new file
// in the run's glb/ folder; the scripts always read uncompressed files and
// never compress, so no geometry is quantized twice.
import { execFile, type ChildProcess, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CRUSH, STYLIZE_COPY } from "../sim/recipes";
import type { JobRequest, JobResult, ModelVersion, Vec3, World } from "../sim/types";
import { glbInfo } from "./glb-info";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
/** Prepared models for glb-fuse, shared by all runs (keyed by file content and options, so a model is never prepared twice). */
const FUSE_CACHE = join(ROOT, "sandbox-runs", "fuse-cache");
/** Results of the copy steps (Keimlinge), shared by all runs and filled ahead by the objects page
 *  (objects/workshop.ts): keyed by the input file's content and the step with its settings. */
const COPY_CACHE = join(ROOT, "sandbox-runs", "copy-cache");
const COPY_CACHE_VERSION = 1; // raise when a copy step's script changes what it makes

export interface JobOptions {
  runDir: string; // glb paths in the world are relative to it
  /** Overrides the mode the simulation chose for every fusion (--fuse); null = as chosen. */
  fuseMode: "hart" | "weich" | "voxel" | null;
}

/** A script that hangs is stopped after this long and its job counts as failed (the clock would wait for it forever). */
const SCRIPT_TIMEOUT_MS = 15 * 60_000;
/** Texture seams can stop a reduction far above its target: above this × the target it runs again, permissive. */
const PERMISSIVE_RETRY = 1.5;

// Scripts still running when the server stops are stopped with it: a left-over one would
// go on on its own (a Sloyd job, for one, would come in after all and clash with a new start).
const runningScripts = new Set<ChildProcess>();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    for (const c of runningScripts) { try { process.kill(-c.pid!, "SIGTERM"); } catch { c.kill("SIGTERM"); } }
    process.exit(sig === "SIGINT" ? 130 : 143);
  });
}

const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"); // node + tsx directly: works on Windows too (no npx.cmd)
const WINDOWS = process.platform === "win32";

/** Runs scripts/<name> with tsx; `env` adds to this process's environment. */
export function script(name: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    // own process group (detached, not on Windows), so stopping it reaches tsx and the script alike
    const child = execFile(process.execPath, [TSX, join(ROOT, "scripts", name), ...args],
      { cwd: ROOT, maxBuffer: 1 << 24, timeout: SCRIPT_TIMEOUT_MS, encoding: "utf8", detached: !WINDOWS, env: { ...process.env, ...env } } as ExecFileOptionsWithStringEncoding, (err, stdout, stderr) => {
      runningScripts.delete(child);
      if (err?.killed) reject(new Error(`${name} ${args.join(" ")}\nnach ${SCRIPT_TIMEOUT_MS / 60_000} Minuten abgebrochen`));
      else if (err) reject(new Error(`${name} ${args.join(" ")}\n${stderr || stdout || err.message}`));
      else resolve(stdout);
    });
    runningScripts.add(child);
  });
}

/** A copy step from the cache, or computed and kept there; true if it came from the cache. */
async function cachedCopy(from: string, step: Record<string, unknown>, to: string, make: () => Promise<void>): Promise<boolean> {
  const key = createHash("sha1").update(readFileSync(from)).update(JSON.stringify([COPY_CACHE_VERSION, step])).digest("hex");
  const kept = join(COPY_CACHE, `${key}.glb`);
  if (existsSync(kept)) { copyFileSync(kept, to); return true; }
  await make();
  mkdirSync(COPY_CACHE, { recursive: true });
  copyFileSync(to, `${kept}.tmp`);
  renameSync(`${kept}.tmp`, kept); // complete only now
  return false;
}

// The copy steps, the same for a run's Keimlinge and the variants computed ahead (absolute paths).
/** Phase 2: stylized to `faces`; texture seams can stop it far above the target (Muschel-Vase, Rucksack): then permissive. */
export const stylizeCopy = (from: string, to: string, faces: number) => cachedCopy(from, { step: "p2", faces, texture: STYLIZE_COPY.texture, saturation: STYLIZE_COPY.saturation }, to, async () => {
  const args = [from, "--faces", String(faces), "--texture", String(STYLIZE_COPY.texture), "--saturation", String(STYLIZE_COPY.saturation), "--no-compress"];
  await script("stylize-glb.ts", [...args, "--out", to]);
  if ((await glbInfo(to)).triangles > faces * PERMISSIVE_RETRY) await script("stylize-glb.ts", [...args, "--permissive", "--out", to]);
});
/** Phase 5: a cube grid with `cells` over the largest side. */
export const voxelCopy = (from: string, to: string, cells: number) => cachedCopy(from, { step: "p5", cells }, to, async () => {
  await script("glb-fuse.ts", [from, "--mode", "voxel", "--voxel-cells", String(cells), "--out", to]);
});
/** A copy of the next plain generation: reduced to `target` triangles. */
export const reduceCopy = (from: string, to: string, target: number) => cachedCopy(from, { step: "reduce", target: Math.max(1, Math.floor(target)) }, to, async () => {
  await script("glb-reduce.ts", [from, "--target", String(Math.max(1, Math.floor(target))), "--out", to]);
});

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
    script("glb-reduce.ts", [abs(from), "--target", String(Math.max(1, Math.floor(target))), ...extra, "--out", abs(to)]);
  const stylize = (from: string, to: string, faces: number, extra: string[] = []) =>
    script("stylize-glb.ts", [abs(from), "--faces", String(faces), "--texture", String(STYLIZE_COPY.texture), "--saturation", String(STYLIZE_COPY.saturation), ...extra, "--no-compress", "--out", abs(to)]);
  const crush = (from: string, to: string) => // Phase 9
    script("glb-texture-crush.ts", [abs(from), "--format", "jpeg", "--quality", String(CRUSH.quality), "--passes", String(CRUSH.passes), "--saturation", String(CRUSH.saturation), "--out", abs(to)]);

  if (job.kind === "copy") { // from the copy cache where the step was made before (any run, or the objects page)
    if (job.voxelCells) { // Phase 5
      const rel = out(`-voxel${job.voxelCells}`);
      await voxelCopy(abs(o.glb), abs(rel), job.voxelCells);
      return { jobId: job.id, outputs: [await version(opt.runDir, rel)] };
    }
    const rel = out(`-kopie-${job.recipe ?? "reduce"}`);
    if (job.recipe === "p2") await stylizeCopy(abs(o.glb), abs(rel), job.faces ?? STYLIZE_COPY.faces); // a Vorläufer of generation 2 gets fewer faces
    else if (job.recipe === "copy") copyFileSync(abs(o.glb), abs(rel)); // same generation: a plain copy
    else await reduceCopy(abs(o.glb), abs(rel), o.triangles * (job.keep ?? 1));
    return { jobId: job.id, outputs: [await version(opt.runDir, rel)] };
  }
  if (job.kind === "compress") {
    const rel = out("-komp");
    const target = o.triangles * (job.keep ?? 1);
    // an origin object's last compression: under the death limit whatever it takes
    // (or a forced one: the object could hardly be compressed any more)
    if (job.final || job.force) await reduce(o.glb, rel, target, ["--permissive", "--prune", "--force"]);
    else {
      await reduce(o.glb, rel, target);
      // origin objects must keep up with the ecosystem: texture seams stop them far above the target, then permissive
      if (o.origin && (await glbInfo(abs(rel))).triangles > target * PERMISSIVE_RETRY) await reduce(o.glb, rel, target, ["--permissive"]);
    }
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
    "--overlap", job.overlap ?? "0.05-0.6", "--min-fill", "0.15", "--repair", "--out", abs(raw),
    "--cache", FUSE_CACHE]; // every model is prepared only once, across all runs
  // B grows to A's height (after its rotation), but never more than maxGrowFactor in the world
  args.push("--match-height", "--max-scale", String((w.params.maxGrowFactor * b.scale) / o.scale));
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
