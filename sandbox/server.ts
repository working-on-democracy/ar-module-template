// 3D sandbox: runs the simulation in real time with real .glb jobs and serves
// the viewer. `npm run sandbox -- [options]`, then open the printed address.
//
//   --values <file.json>  values copied from the Lebenszyklus-Rechner ("Werte kopieren")
//   --seed <n>            overrides the seed from the values
//   --speed <x>           calendar days per real minute, or echtzeit = real time (1/1440, default), echtzeit2/4/8 = that many times
//   --fuse <mode>         force one mode for every fusion: hart (~5–15 s) | weich (rounded, 30–100 s) | voxel;
//                         default: an object's first fusion hard, later ones soft
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
import { runGlbJob, script } from "./runner/jobs";
import { buildScenario, SCENARIO_DEFAULTS, type ScenarioValues } from "./scenarios/generate";
import models from "./scenarios/starter-models.json";
import { createRng } from "./sim/rng";
import { advance, QUANTUM } from "./sim/schedule";
import type { JobRequest, JobResult, ModelVersion, Vec3, World } from "./sim/types";
import {
  addDrawing, addPhoto, createWorld, ecosystemBounds, ecosystemCenter, removePhoto, setViewers, step, swayOf, swayPeriodOf, totalTriangles, updateFactor,
} from "./sim/world";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HERE = fileURLToPath(new URL(".", import.meta.url));

const { values: args } = parseArgs({
  options: {
    values: { type: "string" }, seed: { type: "string" }, speed: { type: "string" },
    fuse: { type: "string" }, port: { type: "string" },
  },
});

// ---------------------------------------------------------------- inputs

const DEFAULT_STARTERS = ["flamingo", "mango", "muschel-vase", "rucksack", "tarot-figur"];
const input = args.values ? JSON.parse(readFileSync(args.values, "utf8")) : {};
const params: Params = { ...PARAMS, ...(input.params ?? {}) };
const scenarioValues: ScenarioValues = { ...SCENARIO_DEFAULTS, ...(input.scenario ?? {}) };
if (args.seed) scenarioValues.seed = Number(args.seed);
const starters: string[] = input.starters ?? DEFAULT_STARTERS;
const fuseMode = (args.fuse ?? null) as "hart" | "weich" | "voxel" | null; // null: first fusion hard, later ones soft (params)
const REALTIME = 1 / 1440; // one calendar day per day
// calendar days per real minute; echtzeit (default), echtzeit2, echtzeit4, echtzeit8 = that many times real time
const rt = /^(?:echtzeit|realtime)(\d*)$/.exec(args.speed ?? "echtzeit");
let speed = rt ? REALTIME * Number(rt[1] || 1) : Number(args.speed);
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
  let info = await glbInfo(join(runDir, rel));
  if (info.triangles > params.originMaxTriangles) { // too heavy for an origin object: reduced to the limit when planted
    const reduce = (extra: string[]) => script("glb-reduce.ts", [src, "--target", String(params.originMaxTriangles), ...extra, "--out", join(runDir, rel)]);
    await reduce([]);
    info = await glbInfo(join(runDir, rel));
    if (info.triangles > params.originMaxTriangles * 1.1) { await reduce(["--permissive"]); info = await glbInfo(join(runDir, rel)); } // texture seams stopped it
  }
  s.model = { glb: rel, triangles: info.triangles, min: info.min, max: info.max };
}

let commit = "unbekannt";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { /* not a repo */ }
writeFileSync(join(runDir, "run.json"), JSON.stringify({
  started: new Date().toISOString(), commit, fuseMode, jobLeadDays: params.jobLeadDays, speed, params, scenario: scenarioValues, starters,
}, null, 2));

// ---------------------------------------------------------------- world, jobs

const w: World = createWorld(scenario, params);
const running = new Map<number, { job: JobRequest; since: number }>();
const ready = new Map<number, JobResult>(); // computed, waiting for their due time
let waitingFor: JobRequest | null = null;
const queue: JobRequest[] = [];
const CONCURRENCY = 3; // jobs computed at the same time (6 cores: soft fusions and stylize are heavy)
let loggedEvents = 0;

function enqueue(jobs: JobRequest[]) {
  queue.push(...jobs);
  pump();
}

function pump() {
  // the most urgent first: a pose is due at once (the journey waits for it), a copy or fusion later
  queue.sort((a, b) => a.dueAt - b.dueAt || a.id - b.id);
  while (running.size < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    running.set(job.id, { job, since: Date.now() });
    runGlbJob(w, job, { runDir, fuseMode })
      .then((res) => { if (w.jobs.some((j) => j.id === job.id)) ready.set(job.id, res); })
      .catch((err: Error) => {
        console.error(`Job ${job.id} (${job.kind}) fehlgeschlagen:\n${err.message.slice(0, 2000)}`);
        dropJob(job);
      })
      .finally(() => { running.delete(job.id); pump(); });
  }
}

/** A failed job: the objects are released unchanged, a fusion pair dissolves (with its other job). */
function dropJob(job: JobRequest) {
  const pair = w.pairs.find((p) => p.jobId === job.id || p.poseJobId === job.id);
  const ids = pair ? [pair.jobId, pair.poseJobId] : [job.id];
  w.jobs = w.jobs.filter((j) => !ids.includes(j.id));
  for (const id of ids) ready.delete(id);
  for (let i = queue.length - 1; i >= 0; i--) if (ids.includes(queue[i].id)) queue.splice(i, 1);
  for (const id of [job.objectId, job.partnerId]) {
    const o = w.objects.find((x) => x.id === id);
    if (o) { o.busy = false; o.pairedWith = null; }
  }
  if (pair) {
    w.pairs = w.pairs.filter((p) => p !== pair);
    for (const id of [pair.a, pair.b]) { const o = w.objects.find((x) => x.id === id); if (o) { o.busy = false; o.pairedWith = null; o.pose = null; } }
  }
  w.events.push({ eigen: w.eigen, calendar: w.calendar, type: "fehler", text: `Job ${job.id} (${job.kind}) fehlgeschlagen, Objekt bleibt unverändert` });
  // a failed copy is simply not made; a failed fusion leaves both objects as they were
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

// The clock runs in fixed steps while jobs compute; it stops only when a
// result is due and not ready yet (see sim/schedule.ts). Slow speeds take
// smaller steps, so the plant moves and reacts at least about once a real
// second (in real time a step of 0.01 days would be 14.4 minutes); the same
// seed at the same speed still gives the same run.
const TICK_MS = 100;
const STEP_SECONDS = 1; // real seconds per step at most
const stepDays = () => Math.min(QUANTUM, (speed / 60) * STEP_SECONDS);
let budget = 0; // calendar days the clock may still advance
setInterval(() => {
  if (paused || w.phase === "ende") return;
  budget += (speed / 60) * (TICK_MS / 1000);
  waitingFor = null;
  const q = stepDays();
  while (budget >= q) {
    const r = advance(w, ready, q);
    if ("waiting" in r) { waitingFor = r.waiting; budget = Math.min(budget, q); break; }
    enqueue(r.jobs);
    budget -= q;
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
    run: {
      dir: runDir.replace(ROOT, ""), commit, fuseMode, speed, paused,
      waitingFor: waitingFor ? { id: waitingFor.id, kind: waitingFor.kind, objectId: waitingFor.objectId, partnerId: waitingFor.partnerId } : null,
    },
    phase: w.phase, eigen: w.eigen, calendar: w.calendar, factor: w.factor, pioneerFactor: w.pioneerFactor, factorParts: w.factorParts,
    viewers: w.viewers, plantingPoint: w.plantingPoint, center: ecosystemCenter(w), bounds: ecosystemBounds(w),
    triangles: totalTriangles(w), plateauMax: w.plateauMax, params: w.params,
    budget: w.budget, compressAt: w.compressAt, halvingAt: w.halvingAt,
    objects: w.objects.map((o) => ({ ...o, sway: swayOf(o, w.params), swayPeriod: swayPeriodOf(o, w.params) })),
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
    case "speed": speed = Math.max(REALTIME, Number(cmd.value) || speed); break;
    case "viewers": setViewers(w, w.viewers + Number(cmd.delta ?? 0)); break;
    case "addPhoto": addPhoto(w, randomSpot()); break;
    case "addDrawing": addDrawing(w, randomSpot()); break;
    case "block": removePhoto(w, String(cmd.photoId), "gesperrt"); break;
    case "delete": removePhoto(w, String(cmd.photoId), "gelöscht"); break;
    default: throw new Error(`unbekannter Befehl ${String(cmd.type)}`);
  }
  updateFactor(w); // devices, photos and drawings count at once, not only at the next step
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

// the viewer through Vite; its live-reload socket runs on this same server
let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;
const http = createHttpServer(async (req, res) => {
  try {
    if (await api(req, res)) return;
  } catch (e) {
    send(res, 500, JSON.stringify({ error: (e as Error).message }));
    return;
  }
  vite?.middlewares(req, res);
});
vite = await createViteServer({
  configFile: false,
  root: join(HERE, "viewer"),
  server: { middlewareMode: true, hmr: { server: http } },
  appType: "spa",
  logLevel: "warn",
});
http.listen(port, () => {
  console.log(`\nSandbox läuft: http://localhost:${port}/\nLauf-Ordner: ${runDir}\nTempo: ${rt ? `${Number(rt[1] || 1) > 1 ? `${rt[1]}× ` : ""}Echtzeit` : `${speed} Kalendertage pro Minute`}, Verschmelzen: ${fuseMode ?? "erste hart, danach weich"}, Rechenvorlauf ${params.jobLeadDays} Eigentage\n`);
});
enqueue(w.jobs.slice());
