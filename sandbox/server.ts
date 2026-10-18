// 3D sandbox: runs the simulation in real time with real .glb jobs and serves
// the viewer. `npm run sandbox -- [options]`, then open the printed address.
//
//   --values <file.json>  values copied from the Lebenszyklus-Rechner ("Werte kopieren")
//   --seed <n>            overrides the seed from the values
//   --speed <x>           calendar days per real minute (default 1)
//   --fuse <mode>         hart (default, ~5 s) | weich (rounded, 30–100 s) | voxel
//   --no-wait             let the clocks run while jobs compute (not repeatable)
//   --port <n>            default 5180
//
// Every run gets a folder sandbox-runs/<time>-seed<n>/ (gitignored): run.json
// (values, seed, commit), events.jsonl, state.json, every .glb version and
// the test photos with their crushed versions.
import { execSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { createServer as createViteServer } from "vite";
import { PARAMS, type Params } from "./params";
import { glbInfo } from "./runner/glb-info";
import { runGlbJob } from "./runner/jobs";
import { buildScenario, SCENARIO_DEFAULTS, type ScenarioValues } from "./scenarios/generate";
import models from "./scenarios/starter-models.json";
import { createRng } from "./sim/rng";
import type { JobRequest, ModelVersion, Vec3, World } from "./sim/types";
import {
  addDrawing, addPhoto, applyJob, createWorld, ecosystemBounds, ecosystemCenter, removePhoto, setViewers, step, swayOf, totalTriangles,
} from "./sim/world";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HERE = fileURLToPath(new URL(".", import.meta.url));

const { values: args } = parseArgs({
  options: {
    values: { type: "string" }, seed: { type: "string" }, speed: { type: "string" },
    fuse: { type: "string" }, "no-wait": { type: "boolean" }, port: { type: "string" },
  },
});

// ---------------------------------------------------------------- inputs

const DEFAULT_STARTERS = ["flamingo", "regenschirm", "naehmaschine", "tiffany-lampe"];
const input = args.values ? JSON.parse(readFileSync(args.values, "utf8")) : {};
const params: Params = { ...PARAMS, ...(input.params ?? {}) };
const scenarioValues: ScenarioValues = { ...SCENARIO_DEFAULTS, ...(input.scenario ?? {}) };
if (args.seed) scenarioValues.seed = Number(args.seed);
const starters: string[] = input.starters ?? DEFAULT_STARTERS;
const fuseMode = (args.fuse ?? "hart") as "hart" | "weich" | "voxel";
let speed = Number(args.speed ?? 1); // calendar days per real minute
let waitForJobs = !args["no-wait"];
let paused = false;
const port = Number(args.port ?? 5180);

// ---------------------------------------------------------------- run folder

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const runDir = join(HERE, "..", "sandbox-runs", `${stamp}-seed${scenarioValues.seed}`);
for (const d of ["glb", "photos"]) mkdirSync(join(runDir, d), { recursive: true });

const library = models as unknown as Record<string, ModelVersion>;
const scenario = buildScenario({ scenario: scenarioValues, starters });
for (const s of scenario.starters) {
  const src = join(ROOT, "generated-assets", library[s.name].glb);
  if (!existsSync(src)) {
    console.error(`✖ Startmodell fehlt: ${src}\n  (generated-assets/ ist lokal; die Testreihe Phase 1 muss dort liegen)`);
    process.exit(1);
  }
  const rel = `glb/${s.name}.glb`;
  copyFileSync(src, join(runDir, rel));
  const info = await glbInfo(join(runDir, rel));
  s.model = { glb: rel, triangles: info.triangles, min: info.min, max: info.max };
}

let commit = "unbekannt";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { /* not a repo */ }
writeFileSync(join(runDir, "run.json"), JSON.stringify({
  started: new Date().toISOString(), commit, fuseMode, waitForJobs, speed, params, scenario: scenarioValues, starters,
}, null, 2));

// ---------------------------------------------------------------- world, jobs

const w: World = createWorld(scenario, params);
const running = new Map<number, { job: JobRequest; since: number }>();
const queue: JobRequest[] = [];
const CONCURRENCY = 2;
let loggedEvents = 0;

function enqueue(jobs: JobRequest[]) {
  queue.push(...jobs);
  pump();
}

function pump() {
  while (running.size < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    running.set(job.id, { job, since: Date.now() });
    runGlbJob(w, job, { runDir, fuseMode })
      .then((res) => applyJob(w, res))
      .catch((err: Error) => {
        console.error(`Job ${job.id} (${job.kind}) fehlgeschlagen:\n${err.message.slice(0, 2000)}`);
        dropJob(job);
      })
      .finally(() => { running.delete(job.id); pump(); });
  }
}

/** A failed job: the objects are released unchanged, a fusion pair dissolves. */
function dropJob(job: JobRequest) {
  w.jobs = w.jobs.filter((j) => j.id !== job.id);
  for (const id of [job.objectId, job.partnerId]) {
    const o = w.objects.find((x) => x.id === id);
    if (o) { o.busy = false; o.pairedWith = null; }
  }
  w.pairs = w.pairs.filter((p) => p.jobId !== job.id);
  w.events.push({ eigen: w.eigen, calendar: w.calendar, type: "fehler", text: `Job ${job.id} (${job.kind}) fehlgeschlagen, Objekt bleibt unverändert` });
}

// Photos are generated when they appear (scenario or button).
const madePhotos = new Set<string>();
async function ensurePhotos() {
  for (const ph of w.photos) {
    if (madePhotos.has(ph.id)) continue;
    madePhotos.add(ph.id);
    await makeTestPhoto(ph.id, join(runDir, "photos", `${ph.id}-0.jpg`));
  }
}

async function makeTestPhoto(id: string, file: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rng = createRng(h);
  const hue = Math.floor(rng.range(0, 360));
  const shapes = Array.from({ length: 9 }, () => {
    const x = rng.range(0, 800), y = rng.range(0, 600), r = rng.range(30, 160), hh = (hue + rng.range(-60, 60) + 360) % 360;
    return rng.next() < 0.5
      ? `<circle cx="${x}" cy="${y}" r="${r}" fill="hsl(${hh},70%,${rng.range(35, 70)}%)"/>`
      : `<rect x="${x - r}" y="${y - r / 2}" width="${r * 2}" height="${r}" fill="hsl(${hh},60%,${rng.range(30, 75)}%)" transform="rotate(${rng.range(-40, 40)} ${x} ${y})"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="hsl(${hue},45%,85%)"/>${shapes}
    <rect x="40" y="470" width="420" height="90" fill="rgba(0,0,0,0.55)"/>
    <text x="60" y="533" font-family="Helvetica, Arial, sans-serif" font-size="56" fill="#fff">Testfoto ${id}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(file);
}

/** Crushed version of a photo for an object's crush level, made on first request (server-side, as planned). */
async function photoFile(id: string, level: number): Promise<string | null> {
  const base = join(runDir, "photos", `${id}-0.jpg`);
  if (!existsSync(base)) return null;
  if (level <= 0) return base;
  const file = join(runDir, "photos", `${id}-${level}.jpg`);
  if (!existsSync(file)) {
    const q = [30, 15, 8, 4, 2][Math.min(5, level) - 1];
    let buf: Buffer = readFileSync(base);
    for (let i = 0; i < level; i++) buf = (await sharp(buf).jpeg({ quality: q, chromaSubsampling: "4:2:0" }).toBuffer()) as Buffer;
    writeFileSync(file, buf);
  }
  return file;
}

// ---------------------------------------------------------------- the loop

const TICK_MS = 100;
setInterval(() => {
  if (paused || w.phase === "ende") return;
  if (waitForJobs && (w.jobs.length || running.size)) return; // clocks wait: same seed, same run
  let dt = (speed / 60) * (TICK_MS / 1000);
  while (dt > 1e-9) {
    const d = Math.min(dt, 0.01);
    enqueue(step(w, d));
    dt -= d;
    if (waitForJobs && w.jobs.length) break;
  }
  ensurePhotos().catch((e) => console.error(e));
  flushEvents();
}, TICK_MS);

function flushEvents() {
  if (w.events.length > loggedEvents) {
    appendFileSync(join(runDir, "events.jsonl"), w.events.slice(loggedEvents).map((e) => JSON.stringify(e)).join("\n") + "\n");
    for (const e of w.events.slice(loggedEvents)) console.log(`K ${e.calendar.toFixed(2).padStart(6)}  E ${e.eigen.toFixed(2).padStart(6)}  ${e.text}`);
    loggedEvents = w.events.length;
  }
}
setInterval(() => writeFileSync(join(runDir, "state.json"), JSON.stringify(stateFor(0))), 5000);

// ---------------------------------------------------------------- HTTP

function stateFor(sinceSample: number) {
  return {
    run: { dir: runDir.replace(ROOT, ""), commit, fuseMode, waitForJobs, speed, paused },
    phase: w.phase, eigen: w.eigen, calendar: w.calendar, factor: w.factor, factorParts: w.factorParts,
    viewers: w.viewers, plantingPoint: w.plantingPoint, center: ecosystemCenter(w), bounds: ecosystemBounds(w),
    triangles: totalTriangles(w), plateauMax: w.plateauMax, params: w.params,
    objects: w.objects.map((o) => ({ ...o, sway: swayOf(o, w.params) })),
    photos: w.photos, drawings: w.drawings.filter((d) => !d.gone), pairs: w.pairs,
    jobs: [...running.values()].map(({ job, since }) => ({ id: job.id, kind: job.kind, objectId: job.objectId, partnerId: job.partnerId, seconds: Math.round((Date.now() - since) / 1000) })),
    queued: Math.max(0, w.jobs.length - running.size),
    samples: w.samples.slice(sinceSample), sampleCount: w.samples.length,
    events: w.events.slice(-80),
  };
}

function randomSpot(): Vec3 {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * scenarioValues.contentDistance;
  const c = ecosystemCenter(w);
  return [c[0] + Math.cos(a) * r, 0, c[2] + Math.sin(a) * r];
}

function command(cmd: Record<string, unknown>) {
  switch (cmd.type) {
    case "pause": paused = true; break;
    case "resume": paused = false; break;
    case "speed": speed = Math.max(0.05, Number(cmd.value) || speed); break;
    case "wait": waitForJobs = !!cmd.value; break;
    case "viewers": setViewers(w, w.viewers + Number(cmd.delta ?? 0)); break;
    case "addPhoto": addPhoto(w, randomSpot()); break;
    case "addDrawing": addDrawing(w, randomSpot()); break;
    case "block": removePhoto(w, String(cmd.photoId), "gesperrt"); break;
    case "delete": removePhoto(w, String(cmd.photoId), "gelöscht"); break;
    default: throw new Error(`unbekannter Befehl ${String(cmd.type)}`);
  }
  ensurePhotos().catch((e) => console.error(e));
  flushEvents();
}

const MIME: Record<string, string> = { ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".json": "application/json", ".jsonl": "text/plain" };

function send(res: ServerResponse, status: number, body: string | Buffer, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function api(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/api/state") { send(res, 200, JSON.stringify(stateFor(Number(url.searchParams.get("since") ?? 0)))); return true; }
  if (url.pathname === "/api/cmd" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try { command(JSON.parse(body)); send(res, 200, "{}"); } catch (e) { send(res, 400, JSON.stringify({ error: (e as Error).message })); }
    return true;
  }
  const photo = url.pathname.match(/^\/api\/photo\/([\w-]+)\/(\d+)$/);
  if (photo) {
    const file = await photoFile(photo[1], Number(photo[2]));
    if (!file) send(res, 404, "{}");
    else send(res, 200, readFileSync(file), "image/jpeg");
    return true;
  }
  if (url.pathname.startsWith("/run/")) {
    const file = normalize(join(runDir, decodeURIComponent(url.pathname.slice(5))));
    if (!file.startsWith(runDir) || !existsSync(file)) { send(res, 404, "{}"); return true; }
    send(res, 200, readFileSync(file), MIME[extname(file)] ?? "application/octet-stream");
    return true;
  }
  return false;
}

const vite = await createViteServer({
  configFile: false,
  root: join(HERE, "viewer"),
  server: { middlewareMode: true },
  appType: "spa",
  logLevel: "warn",
});
const http = createHttpServer(async (req, res) => {
  try {
    if (await api(req, res)) return;
  } catch (e) {
    send(res, 500, JSON.stringify({ error: (e as Error).message }));
    return;
  }
  vite.middlewares(req, res);
});
http.listen(port, () => {
  console.log(`\nSandbox läuft: http://localhost:${port}/\nLauf-Ordner: ${runDir}\nTempo: ${speed} Kalendertage pro Minute, Verschmelzen: ${fuseMode}${waitForJobs ? ", Uhren warten auf Jobs" : ""}\n`);
});
enqueue(w.jobs.slice());
