#!/usr/bin/env -S npx tsx
// Generates a .glb with the Sloyd API (https://api-dashboard.sloyd.ai/documentation/)
// — run via `npm run sloyd -- <command> ...`. Short version of what this does:
//
//   - Sends a text prompt, one image, or up to four views of one subject to
//     Sloyd, polls the job until it finishes, downloads the GLB into
//     generated-assets/ (gitignored, local) — NOT src/assets/: every file
//     there is bundled and preloaded by the host. Next step is
//     `npm run stylize` (scripts/stylize-glb.ts), which writes src/assets/.
//   - Reads SLOYD_CLIENT_ID / SLOYD_CLIENT_SECRET from .env.local
//     (gitignored). Never put them in a VITE_ variable or anything under
//     src/ — the module is hosted publicly.
//   - Every job costs prepaid credits, so it prints an estimate and asks
//     before sending (--yes skips the question). Every jobId is appended to
//     .sloyd-jobs.jsonl (gitignored): Sloyd has no "list my jobs" endpoint,
//     and `resume <jobId>` can fetch a job whose polling was interrupted.
//   - Never overwrites a file in generated-assets/ — each one cost credits.
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";
import { appendFileSync, existsSync, mkdirSync, openAsBlob, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GENERATED_DIR = join(ROOT, "generated-assets");
const ENV_FILE = join(ROOT, ".env.local");
const JOB_LOG = join(ROOT, ".sloyd-jobs.jsonl");

const API = "https://api.sloyd.ai/api";
const DOWNLOAD = "https://storage.googleapis.com/ai-services-quality/jobs";
const POLL_MS = 5000;
const TIMEOUT_MS = 20 * 60 * 1000;

const TEXTURES = ["128", "256", "512", "1k", "2k", "4k", "auto", "none"];
const TOPOLOGIES = ["auto", "quads", "triangles"];

const USAGE = `Usage:
  npm run sloyd -- text "<prompt>"          [options]
  npm run sloyd -- image <bild.png>         [options]
  npm run sloyd -- multi --front <f.png> [--left <l.png>] [--back <b.png>] [--right <r.png>] [options]
  npm run sloyd -- resume <jobId> --name <name>

Options:
  --name <name>        file name in generated-assets/ (without .glb); default from prompt/image
  --faces <n>          target face count, 0 = Sloyd decides (max 500000)
  --texture <res>      ${TEXTURES.join(" | ")}  (multi: anything but "none" = PBR texture)
  --topology <t>       ${TOPOLOGIES.join(" | ")}  (text/image only)
  --tpose              T-pose for later rigging (text only)
  --yes                don't ask before spending credits`;

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function credentials(): Record<string, string> {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const id = process.env.SLOYD_CLIENT_ID;
  const secret = process.env.SLOYD_CLIENT_SECRET;
  if (!id || !secret) fail("SLOYD_CLIENT_ID and SLOYD_CLIENT_SECRET must be set in .env.local.");
  return { "x-client-id": id, "x-client-secret": secret };
}

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...credentials(), ...(init.headers as Record<string, string>) }
  });
  const body = await res.text();
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    json = { message: body };
  }
  if (!res.ok) {
    if (res.status === 402) {
      fail(`Not enough credits: ${json.required} needed, ${json.available} available.`);
    }
    fail(`Sloyd ${res.status}: ${json.message ?? body}`);
  }
  return json;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)
      .replace(/-$/, "") || "sloyd-model"
  );
}

function targetFile(name: string): string {
  const path = join(GENERATED_DIR, `${name}.glb`);
  if (existsSync(path)) fail(`generated-assets/${name}.glb already exists — choose another --name.`);
  return path;
}

function imageBlob(path: string): Promise<Blob> {
  if (!existsSync(path)) fail(`Image not found: ${path}`);
  const ext = extname(path).toLowerCase();
  const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return openAsBlob(path, { type });
}

/** Rough estimate from sloyd.ai/api/pricing — Sloyd's own deduction is authoritative. */
function estimateCredits(kind: string, textured: boolean, faces: number, topology: string): number {
  let credits = 10;
  if (textured) credits += 10;
  if (kind === "text") credits += 5;
  if (kind === "multi") credits += 10;
  if (topology === "quads") credits += 5;
  if (faces >= 500000) credits += 10;
  return credits;
}

async function confirm(question: string, skip: boolean): Promise<void> {
  if (skip) return;
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "j") fail("Cancelled — nothing was sent.");
}

async function waitForJob(jobId: string): Promise<void> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < TIMEOUT_MS) {
    const job = await api(`/jobs/${jobId}`);
    const stage = job.fragments?.at(-1)?.displayName ?? "";
    const line = `${job.status}${stage ? ` — ${stage}` : ""}`;
    if (line !== last) {
      console.log(`  [${Math.round((Date.now() - start) / 1000)}s] ${line}`);
      last = line;
    }
    if (job.status === "success" || job.status === "completed") return;
    if (job.status === "error" || job.status === "failed") {
      fail(`Job failed: ${job.errorMessage ?? "no message"} (jobId ${jobId})`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  fail(`Still not finished after ${TIMEOUT_MS / 60000} min. Fetch it later with:\n  npm run sloyd -- resume ${jobId} --name <name>`);
}

async function download(jobId: string, outPath: string): Promise<void> {
  const res = await fetch(`${DOWNLOAD}/${jobId}.glb`);
  if (!res.ok) fail(`Download failed (${res.status}) — try: npm run sloyd -- resume ${jobId} --name <name>`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 4)) !== "glTF") fail("Download is not a .glb file.");
  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(outPath, bytes);
  console.log(`\nSaved ${outPath.slice(ROOT.length)} (${(bytes.length / (1024 * 1024)).toFixed(2)} MB)`);
}

/** Prints what matters for AR on a phone: triangles, textures, extensions. */
async function summarize(path: string): Promise<void> {
  try {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const doc = await io.read(path);
    let triangles = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const count = prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0;
        triangles += Math.floor(count / 3);
      }
    }
    const root = doc.getRoot();
    console.log(`  ${triangles.toLocaleString("de-DE")} triangles, ${root.listMaterials().length} material(s)`);
    for (const tex of root.listTextures()) {
      const size = tex.getSize();
      console.log(`  texture ${tex.getMimeType()} ${size ? `${size[0]}×${size[1]}` : ""}`);
    }
    const ext = root.listExtensionsUsed().map((e) => e.extensionName);
    if (ext.length) console.log(`  extensions: ${ext.join(", ")}`);
  } catch (err) {
    console.log(`  (could not inspect: ${(err as Error).message})`);
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: "string" },
      faces: { type: "string", default: "0" },
      texture: { type: "string", default: "auto" },
      topology: { type: "string", default: "auto" },
      tpose: { type: "boolean", default: false },
      front: { type: "string" },
      left: { type: "string" },
      back: { type: "string" },
      right: { type: "string" },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false }
    }
  });
  const [command, arg] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }

  const faces = parseInt(values.faces, 10);
  if (!Number.isFinite(faces) || faces < 0 || faces > 500000) fail("--faces must be 0–500000.");
  if (!TEXTURES.includes(values.texture)) fail(`--texture must be one of ${TEXTURES.join(", ")}.`);
  if (!TOPOLOGIES.includes(values.topology)) fail(`--topology must be one of ${TOPOLOGIES.join(", ")}.`);
  const textured = values.texture !== "none";

  if (command === "resume") {
    if (!arg || !values.name) fail(USAGE);
    const outPath = targetFile(values.name);
    await waitForJob(arg);
    await download(arg, outPath);
    await summarize(outPath);
    return;
  }

  let path: string;
  let init: RequestInit;
  let defaultName: string;
  if (command === "text") {
    if (!arg) fail(USAGE);
    path = "/jobs/text-to-3d";
    defaultName = slug(arg);
    init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: arg,
        targetFaceCount: faces,
        textureResolution: values.texture,
        topology: values.topology,
        tPose: values.tpose
      })
    };
  } else if (command === "image") {
    if (!arg) fail(USAGE);
    path = "/jobs/image-to-3d";
    defaultName = slug(basename(arg, extname(arg)));
    const form = new FormData();
    form.append("file", await imageBlob(arg), basename(arg));
    form.append("targetFaceCount", String(faces));
    form.append("textureResolution", values.texture);
    form.append("topology", values.topology);
    init = { method: "POST", body: form };
  } else if (command === "multi") {
    if (!values.front || !(values.left || values.back || values.right)) {
      fail("multi needs --front and at least one of --left / --back / --right.");
    }
    path = "/jobs/multi-image-to-3d";
    defaultName = slug(basename(values.front, extname(values.front)));
    const form = new FormData();
    for (const view of ["front", "left", "back", "right"] as const) {
      const file = values[view];
      if (file) form.append(`${view}Image`, await imageBlob(file), basename(file));
    }
    if (faces) form.append("FaceCount", String(faces));
    form.append("EnablePBR", String(textured));
    init = { method: "POST", body: form };
  } else {
    fail(USAGE);
  }

  const name = values.name ?? defaultName;
  const outPath = targetFile(name);
  const topology = command === "multi" ? "auto" : values.topology;
  const credits = estimateCredits(command, textured, faces, topology);
  console.log(`\n${command}-to-3d → generated-assets/${name}.glb`);
  console.log(`  faces ${faces || "auto"}, texture ${command === "multi" ? (textured ? "PBR" : "none") : values.texture}, topology ${topology}`);
  await confirm(`Costs about ${credits} credits. Send?`, values.yes);

  const { jobId } = await api(path, init);
  appendFileSync(JOB_LOG, JSON.stringify({ jobId, command, name, input: arg ?? values.front, faces, texture: values.texture, at: new Date().toISOString() }) + "\n");
  console.log(`\njobId ${jobId} (logged in .sloyd-jobs.jsonl)`);
  await waitForJob(jobId);
  await download(jobId, outPath);
  await summarize(outPath);
  console.log(`\nNext: npm run stylize -- generated-assets/${name}.glb`);
}

main();
