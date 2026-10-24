// 3D sandbox: runs the simulation in real time with real .glb jobs and serves
// the viewer. `npm run sandbox -- [options]`, then open the printed address.
//
//   --values <file.json>  values copied from the Lebenszyklus-Rechner ("Werte kopieren")
//   --seed <n>            overrides the seed from the values
//   --speed <x>           calendar days per real minute, or echtzeit = real time (1/1440, default), echtzeit2/4/8 = that many times
//   --fuse <mode>         force one mode for every fusion: hart (~5–15 s) | weich (rounded, 30–100 s) | voxel;
//                         default: an object's first fusion hard, later ones soft
//   --port <n>            default 5180
//   --replay <run folder> plays a recorded run again (its tape.jsonl), without computing
//                         and without waiting, at --speed (default: the run's starting speed)
//   --ohne-pflanzen       starts at once with the default origin objects in a ring, instead of
//                         waiting for a planting (the viewer's or the AR test scene's planting scene)
//
// Without --replay or --ohne-pflanzen the server first waits for a planting
// (POST /api/planting, with a seed 0 … 99 drawn by the planting scene); the run
// starts with it. The planting scene then saves a file with everything that run
// needs (params, scenario with the seed, planting): --values <that file> starts
// the same run again at once.
//
// Every run gets a folder sandbox-runs/<time>-seed<n>/ (gitignored): run.json
// (values, seed, commit), events.jsonl, state.json, tape.jsonl (everything
// --replay needs), every .glb version and the test photos (from sandbox/test-photos) with their crushed versions.
import { execSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer as createViteServer } from "vite";
import { PARAMS, type Params } from "./params";
import { decodeImage, encodeJpeg, saturateBitmap, subsampleChroma } from "../scripts/jimp-image";
import { glbInfo } from "./runner/glb-info";
import { runGlbJob, script } from "./runner/jobs";
import { buildScenario, DEFAULT_STARTERS, SCENARIO_DEFAULTS, type ScenarioValues } from "./scenarios/generate";
import { catalogOf, checkPlanting, type Planting } from "./planting/rules";
import { objectFile, readCatalog, Workshop } from "./objects/workshop";
import { grainOf, grainScaleOf, tintIntensity } from "./sim/look";
import models from "./scenarios/starter-models.json";
import { SAMPLE_COMMENTS } from "./scenarios/comments";
import { advance, QUANTUM } from "./sim/schedule";
import { decompose } from "./sim/pose";
import type { JobRequest, JobResult, ModelVersion, Vec3, World } from "./sim/types";
import {
  addComment, addDrawing, addPhoto, applyJob, removeComment, createWorld, jobFailed, modelMatrix, ecosystemBounds, ecosystemCenter, removePhoto, setViewers, step, swayOf, swayPeriodOf, totalTriangles, updateFactor,
} from "./sim/world";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HERE = fileURLToPath(new URL(".", import.meta.url));
const TEST_PHOTOS = readdirSync(join(HERE, "test-photos")).filter((f) => f.endsWith(".jpg")).sort();

const { values: args } = parseArgs({
  options: {
    values: { type: "string" }, seed: { type: "string" }, speed: { type: "string" },
    fuse: { type: "string" }, port: { type: "string" }, replay: { type: "string" }, "ohne-pflanzen": { type: "boolean" },
  },
});

// ---------------------------------------------------------------- inputs

// a replay takes everything from the recorded run
const replayDir = args.replay ? resolve(args.replay) : null;
const recorded = replayDir ? JSON.parse(readFileSync(join(replayDir, "run.json"), "utf8")) : null;
if (replayDir && !existsSync(join(replayDir, "tape.jsonl"))) {
  console.error(`✖ ${replayDir} hat keine tape.jsonl (aufgezeichnet wird erst seit der Wiedergabe-Funktion)`);
  process.exit(1);
}
const input = recorded ?? (args.values ? JSON.parse(readFileSync(args.values, "utf8")) : {});
const params: Params = { ...PARAMS, ...(input.params ?? {}) };
const scenarioValues: ScenarioValues = { ...SCENARIO_DEFAULTS, ...(input.scenario ?? {}) };
if (args.seed && !recorded) scenarioValues.seed = Number(args.seed);
const starters: string[] = input.starters ?? DEFAULT_STARTERS;
const fuseMode = (args.fuse ?? input.fuseMode ?? null) as "hart" | "weich" | "voxel" | null; // null: first fusion hard, later ones soft (params)
const REALTIME = 1 / 1440; // one calendar day per day
// calendar days per real minute; echtzeit (default), echtzeit2, echtzeit4, echtzeit8 = that many times real time
const given = input.speed !== undefined && !args.speed; // a recorded run or a saved planting keeps its speed (the steps decide the run)
const rt = given ? null : /^(?:echtzeit|realtime)(\d*)$/.exec(args.speed ?? "echtzeit");
let speed = given ? input.speed : rt ? REALTIME * Number(rt[1] || 1) : Number(args.speed);
let paused = false;
const port = Number(args.port ?? 5180);

// ---------------------------------------------------------------- run folder, world

// what can be planted: the 8 starter models (sandbox/models) and the new objects from the
// upload page (sandbox-objects/, sandbox/objects/workshop.ts)
const library = models as unknown as Record<string, ModelVersion>;
const catalog = () => catalogOf({ ...library, ...readCatalog() });
const modelSource = (name: string) => library[name] ? join(HERE, "models", library[name].glb) : objectFile(name, `${name}.glb`);
let commit = "unbekannt";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { /* not a repo */ }
if (recorded && recorded.commit !== commit) console.warn(`⚠ aufgezeichnet mit ${recorded.commit}, jetzt ${commit}: hat sich die Simulation seitdem geändert, weicht die Wiedergabe ab`);

// set by startRun: before the planting there is no run (no folder, no world)
let runDir = replayDir ?? "";
let w!: World;
let started = false;
let plantingPoint: Vec3 = [0, 0, 0]; // in the frame the planting came in

/** Starts the run: with a planting (positions, sizes, turns as planted) or the default ring. */
async function startRun(plants: Planting[] | null) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  runDir = replayDir ?? join(HERE, "..", "sandbox-runs", `${stamp}-seed${scenarioValues.seed}`);
  for (const d of ["glb", "photos"]) mkdirSync(join(runDir, d), { recursive: true });
  const scenario = buildScenario({ scenario: scenarioValues, starters: plants ? plants.map((p) => p.name) : starters });
  if (plants) scenario.starters.forEach((s, i) => Object.assign(s, { pos: plants[i].pos, rotY: plants[i].rotY, size: plants[i].size }));
  for (const s of scenario.starters) {
    const src = modelSource(s.name);
    if (!replayDir && !existsSync(src)) throw new Error(`Startmodell fehlt: ${src} (die Startmodelle liegen in sandbox/models/)`);
    const rel = `glb/${s.name}.glb`;
    if (replayDir) { s.model = { glb: rel, ...(({ triangles, min, max }) => ({ triangles, min, max }))(await glbInfo(join(runDir, rel))) }; continue; }
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
  if (!replayDir) writeFileSync(join(runDir, "run.json"), JSON.stringify({
    started: new Date().toISOString(), commit, fuseMode, jobLeadDays: params.jobLeadDays, speed, params, scenario: scenarioValues, starters: scenario.starters.map((s) => s.name), plants,
  }, null, 2));
  w = createWorld(scenario, params);
  plantingPoint = w.plantingPoint;
  if (replayDir) loadTape();
  started = true;
  console.log(`Lauf-Ordner: ${runDir}${plants ? ` (${plants.length} Objekte gepflanzt)` : ""}`);
  enqueue(w.jobs.slice());
}

const running = new Map<number, { job: JobRequest; since: number }>();
const ready = new Map<number, JobResult>(); // computed, waiting for their due time
let waitingFor: JobRequest | null = null;
const queue: JobRequest[] = [];
const CONCURRENCY = 3; // jobs computed at the same time (6 cores: soft fusions and stylize are heavy)
let loggedEvents = 0;

function enqueue(jobs: JobRequest[]) {
  if (replayDir) return; // the results come from the tape
  queue.push(...jobs);
  pump();
}

// ---------------------------------------------------------------- tape (--replay)
// Everything that decides a run, in order: the size of every step (equal steps
// in a row as one line), every result when it arrives, results used while the
// clock waits for another one, failed jobs, commands that change the world, and
// a checksum with every write. The simulation itself is deterministic, so this
// gives the same run again, at any speed and without computing.
type TapeEntry =
  | { s: number; n: number } // n steps of s calendar days
  | { r: JobResult } // a result arrived
  | { a: number[] } // these results were used while the clock waited
  | { d: number } // this job failed
  | { c: Record<string, unknown> } // a command, with its random parts resolved
  | { k: [number, number, number] }; // checksum: Eigenzeit, triangles, objects
const tapeFile = () => join(runDir, "tape.jsonl");
const tapeOut: TapeEntry[] = [];
let stepRun: { s: number; n: number } | null = null;
const checksum = (): [number, number, number] => [w.eigen, totalTriangles(w), w.objects.length];
function record(e: TapeEntry) {
  if (replayDir) return;
  if ("s" in e && stepRun?.s === e.s) { stepRun.n++; return; }
  stepRun = "s" in e ? e : null;
  tapeOut.push(e);
}
function flushTape() {
  if (replayDir || !tapeOut.length) return;
  tapeOut.push({ k: checksum() });
  appendFileSync(tapeFile(), tapeOut.map((e) => JSON.stringify(e)).join("\n") + "\n");
  tapeOut.length = 0; stepRun = null;
}
// replay: the whole tape; every result is "ready" from the start, used at its due time as recorded
let tape: TapeEntry[] = [];
let tapeAt = 0, tapeStepsLeft = 0, replayDone = false, diverged = false, totalStepDays = 0;
function loadTape() {
  tape = readFileSync(tapeFile(), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const e of tape) if ("r" in e) ready.set(e.r.jobId, e.r);
  totalStepDays = tape.reduce((t, e) => t + ("s" in e ? e.s * e.n : 0), 0);
}
/** Plays the tape up to the next step; returns its size, or null at the end. */
function nextReplayStep(): number | null {
  for (; tapeAt < tape.length; tapeAt++) {
    const e = tape[tapeAt];
    if ("s" in e) {
      if (!tapeStepsLeft) tapeStepsLeft = e.n;
      return e.s;
    }
    if ("a" in e) for (const id of e.a) { const r = ready.get(id); if (r) { ready.delete(id); applyJob(w, r); } }
    else if ("d" in e) { const job = w.jobs.find((j) => j.id === e.d); if (job) dropJob(job); }
    else if ("c" in e) applyCommand(e.c);
    else if ("k" in e && !diverged && (Math.abs(e.k[0] - w.eigen) > 1e-9 || e.k[1] !== totalTriangles(w) || e.k[2] !== w.objects.length)) {
      diverged = true;
      console.warn(`⚠ Wiedergabe weicht ab bei Kalendertag ${w.calendar.toFixed(3)}: aufgezeichnet ${JSON.stringify(e.k)}, jetzt ${JSON.stringify(checksum())}`);
    }
  }
  return null;
}
function replayStepDone() {
  if (--tapeStepsLeft === 0) tapeAt++;
}

function pump() {
  // the most urgent first: a pose is due at once (the journey waits for it), a copy or fusion later
  queue.sort((a, b) => a.dueAt - b.dueAt || a.id - b.id);
  while (running.size < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    running.set(job.id, { job, since: Date.now() });
    runGlbJob(w, job, { runDir, fuseMode })
      .then((res) => { if (w.jobs.some((j) => j.id === job.id)) { ready.set(job.id, res); record({ r: res }); } })
      .catch((err: Error) => {
        console.error(`Job ${job.id} (${job.kind}) fehlgeschlagen:\n${err.message.slice(0, 2000)}`);
        record({ d: job.id });
        dropJob(job);
      })
      .finally(() => { running.delete(job.id); pump(); });
  }
}

/** A failed job: the world releases the objects unchanged (a fusion pair dissolves with its other job);
 *  a failed copy is simply not made. Repeated failures let a wilting object die early (sim). */
function dropJob(job: JobRequest) {
  const ids = jobFailed(w, job);
  for (const id of ids) ready.delete(id);
  for (let i = queue.length - 1; i >= 0; i--) if (ids.includes(queue[i].id)) queue.splice(i, 1);
}

// Photos are generated when they appear (scenario or button).
const madePhotos = new Set<string>();
async function ensurePhotos() {
  for (const ph of w.photos) {
    if (madePhotos.has(ph.id)) continue;
    madePhotos.add(ph.id);
    if (existsSync(join(runDir, "photos", `${ph.id}-0.jpg`))) continue; // a replay: made when recorded
    await makeTestPhoto(ph.id, join(runDir, "photos", `${ph.id}-0.jpg`));
  }
}

async function makeTestPhoto(id: string, file: string) {
  // a public-domain outdoor photo (sandbox/test-photos), the same one for the same id
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pick = TEST_PHOTOS[h % TEST_PHOTOS.length];
  copyFileSync(join(HERE, "test-photos", pick), file);
}

/** A photo as an object shows it, made on first request (server-side, as planned): saturated
 *  for the object's changes since it took the photo, then crushed for its crush level. */
async function photoFile(id: string, level: number, changes = 0): Promise<string | null> {
  const base = join(runDir, "photos", `${id}-0.jpg`);
  if (!existsSync(base)) return null;
  if (level <= 0 && changes <= 0) return base;
  const file = join(runDir, "photos", `${id}-${level}${changes > 0 ? `-s${changes}` : ""}.jpg`);
  if (!existsSync(file)) {
    let buf: Uint8Array = readFileSync(base);
    const amount = Math.min(params.photoSaturateMax, Math.pow(params.photoSaturatePerChange, changes));
    if (changes > 0) buf = await encodeJpeg(saturateBitmap(await decodeImage(buf), amount), 90);
    const q = [30, 15, 8, 4, 2][Math.min(5, Math.max(1, level)) - 1];
    for (let i = 0; i < level; i++) buf = await encodeJpeg(subsampleChroma(await decodeImage(buf)), q);
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
  if (!started || paused || w.phase === "ende" || replayDone) return;
  budget += (speed / 60) * (TICK_MS / 1000);
  waitingFor = null;
  const before = w.calendar;
  if (replayDir) {
    // the recorded step sizes, as fast as the chosen speed asks for
    for (let q = nextReplayStep(); ; q = nextReplayStep()) {
      if (q === null) { replayDone = true; console.log("\nAufzeichnung zu Ende."); break; }
      if (budget < q) break;
      if ("waiting" in advance(w, ready, q)) { replayDone = true; console.log("\nAufzeichnung endet hier (ein Ergebnis fehlt)."); break; }
      replayStepDone();
      budget -= q;
    }
  } else {
    const q = stepDays();
    while (budget >= q) {
      const pending = w.jobs.map((j) => j.id);
      const r = advance(w, ready, q);
      if ("waiting" in r) {
        const used = pending.filter((id) => !w.jobs.some((j) => j.id === id));
        if (used.length) record({ a: used });
        waitingFor = r.waiting; budget = Math.min(budget, q); break;
      }
      record({ s: q, n: 1 });
      enqueue(r.jobs);
      budget -= q;
    }
  }
  if (w.calendar !== before) pushFrame();
  ensurePhotos().catch((e) => console.error(e));
  flushEvents();
}, TICK_MS);
setInterval(() => { if (started) flushTape(); }, 5000);

// The viewer plays a little behind the simulation and interpolates between
// these frames (one per tick in which the clock moved), so the motion stays
// smooth however large the steps are.
interface Frame { seq: number; calendar: number; poses: Record<string, [number[], number[], number]>; drawings: Record<string, [number[], number]> }
const frames: Frame[] = [];
let frameSeq = 0;
function pushFrame() {
  const poses: Frame["poses"] = {}, drawings: Frame["drawings"] = {};
  for (const o of w.objects) { const p = decompose(modelMatrix(o)); poses[o.id] = [p.p, p.q, p.s]; }
  for (const d of w.drawings) if (!d.gone) drawings[d.id] = [d.pos, d.scale];
  frames.push({ seq: ++frameSeq, calendar: w.calendar, poses, drawings });
  if (frames.length > 600) frames.splice(0, frames.length - 600);
}

function flushEvents() {
  if (w.events.length > loggedEvents) {
    if (!replayDir) appendFileSync(join(runDir, "events.jsonl"), w.events.slice(loggedEvents).map((e) => JSON.stringify(e)).join("\n") + "\n");
    for (const e of w.events.slice(loggedEvents)) console.log(`K ${e.calendar.toFixed(2).padStart(6)}  E ${e.eigen.toFixed(2).padStart(6)}  ${e.text}`);
    loggedEvents = w.events.length;
  }
}
if (!replayDir) setInterval(() => { if (started) writeFileSync(join(runDir, "state.json"), JSON.stringify(stateFor(0))); }, 5000);

// ---------------------------------------------------------------- HTTP

function stateFor(sinceSample: number) {
  return {
    run: {
      dir: runDir.replace(ROOT, ""), commit, fuseMode, speed, paused,
      replay: replayDir ? { progress: totalStepDays ? w.calendar / totalStepDays : 1, done: replayDone, diverged } : null,
      waitingFor: waitingFor ? { id: waitingFor.id, kind: waitingFor.kind, objectId: waitingFor.objectId, partnerId: waitingFor.partnerId } : null,
    },
    phase: w.phase, eigen: w.eigen, calendar: w.calendar, factor: w.factor, fastFactor: w.fastFactor, factorParts: w.factorParts, boostsPaused: w.boostsPaused, slowed: w.slowed, lastWatched: w.lastWatched,
    viewers: w.viewers, plantingPoint: w.plantingPoint, gatherPoints: w.gatherPoints, center: ecosystemCenter(w), bounds: ecosystemBounds(w),
    triangles: totalTriangles(w), plateauMax: w.plateauMax, params: w.params,
    budget: w.budget, compressAt: w.compressAt, halvingAt: w.halvingAt,
    objects: w.objects.map((o) => ({ ...o, sway: swayOf(o, w.params), swayPeriod: swayPeriodOf(o, w.params) })),
    photos: w.photos, comments: w.comments.filter((c) => !c.gone || c.blocked), drawings: w.drawings.filter((d) => !d.gone), pairs: w.pairs,
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
    case "pause": paused = true; return;
    case "resume": paused = false; return;
    case "speed": speed = Math.max(REALTIME, Number(cmd.value) || speed); return;
  }
  if (replayDir) throw new Error("In der Wiedergabe lässt sich nichts hinzufügen");
  // random parts resolved here, so the tape holds exactly what happened
  const c = cmd.type === "addPhoto" || cmd.type === "addDrawing" ? { ...cmd, pos: randomSpot() }
    : cmd.type === "addComment" ? { ...cmd, pos: randomSpot(), text: SAMPLE_COMMENTS[Math.floor(Math.random() * SAMPLE_COMMENTS.length)] } : cmd;
  applyCommand(c);
  record({ c });
}

/** A command that changes the world (live, or from the tape). */
function applyCommand(cmd: Record<string, unknown>) {
  switch (cmd.type) {
    case "viewers": setViewers(w, w.viewers + Number(cmd.delta ?? 0)); break;
    case "addPhoto": addPhoto(w, cmd.pos as Vec3); break;
    case "addDrawing": addDrawing(w, cmd.pos as Vec3); break;
    case "block": removePhoto(w, String(cmd.photoId), "gesperrt"); break;
    case "delete": removePhoto(w, String(cmd.photoId), "gelöscht"); break;
    case "addComment": addComment(w, cmd.pos as Vec3, String(cmd.text)); break;
    case "blockComment": removeComment(w, String(cmd.commentId), "gesperrt"); break;
    case "deleteComment": removeComment(w, String(cmd.commentId), "gelöscht"); break;
    default: throw new Error(`unbekannter Befehl ${String(cmd.type)}`);
  }
  updateFactor(w); // devices, photos, drawings and comments count at once, not only at the next step
  ensurePhotos().catch((e) => console.error(e));
  flushEvents();
}

const MIME: Record<string, string> = { ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".json": "application/json", ".jsonl": "text/plain" };

function send(res: ServerResponse, status: number, body: string | Buffer, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

/** Interface 1 (SCHNITTSTELLEN.md): the whole plant, as the AR app gets it. Positions from the planting point. */
function plantFor() {
  const off = (v: Vec3 | number[]): Vec3 => [v[0] - plantingPoint[0], v[1], v[2] - plantingPoint[2]];
  return {
    id: "sandbox", location: SANDBOX_LOCATION, serverTime: Date.now(),
    pollSeconds: speed <= REALTIME * 1.01 ? 3 : 1, // the accelerated sandbox moves more between two answers
    phase: w.phase,
    objects: w.objects.map((o) => {
      const p = decompose(modelMatrix(o));
      return {
        id: o.id, model: { url: `/run/${o.glb}`, triangles: o.triangles },
        pose: { position: off(p.p), rotation: p.q, scale: p.s },
        state: o.state, origin: o.origin,
        tint: o.tint ? { color: o.tint.color, intensity: tintIntensity(o.tint) } : null,
        grain: { strength: grainOf(o.triangles), scale: grainScaleOf(o) },
        sway: { height: swayOf(o, w.params), period: swayPeriodOf(o, w.params) },
        photo: o.photo ? { url: `/api/photo/${o.photo.photoId}/${o.crushLevel}/${o.photo.changes}`, frame: o.photo.frame } : null,
        comment: (() => { const c = o.comment && w.comments.find((x) => x.id === o.comment!.commentId); return c ? { text: c.text, color: c.color, frame: o.comment!.frame } : null; })(),
      };
    }),
    drawings: w.drawings.filter((d) => !d.gone && d.mode !== "frei").map((d) => ({
      strokeId: d.id, position: off(d.pos), scale: d.scale, state: d.mode, textureFrom: d.texture ? `/run/${d.texture.glb}` : null,
    })),
  };
}
const SANDBOX_LOCATION = { lat: 50.1109, lng: 8.6821 }; // the sandbox has no place; the same as the AR preview's mock

async function readBody(req: IncomingMessage) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

async function api(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  // planting: what can be planted and how (GET), the planting itself (POST), the models to place
  if (url.pathname === "/api/planting" && req.method === "GET") {
    const p = params;
    send(res, 200, JSON.stringify({
      waiting: !started && !replayDir, catalog: catalog(), plantingPoint: started ? plantingPoint : null,
      rules: { originMinSize: p.originMinSize, originMaxSize: p.originMaxSize, originMaxGap: p.originMaxGap, plantMinObjects: p.plantMinObjects, plantMaxObjects: p.plantMaxObjects },
    }));
    return true;
  }
  if (url.pathname === "/api/planting" && req.method === "POST") {
    if (started || replayDir) { send(res, 409, JSON.stringify({ error: "Die Sandbox hat schon eine Pflanze. Für eine neue Pflanzung neu starten." })); return true; }
    const body = await readBody(req);
    const plants = body.plants as Planting[], seed = Number(body.seed);
    const wrong = !Array.isArray(plants) ? "keine Pflanzung" : !Number.isInteger(seed) || seed < 0 || seed > 99 ? `Seed ${body.seed} nicht zwischen 0 und 99` : checkPlanting(plants, catalog(), params);
    if (wrong) { send(res, 400, JSON.stringify({ error: wrong })); return true; }
    scenarioValues.seed = seed;
    await startRun(plants);
    // everything this run needs to start again: npm run sandbox -- --values <this file>
    const values = { params, scenario: scenarioValues, plants, speed, fuseMode, commit };
    send(res, 200, JSON.stringify({ plantingPoint, values, file: `pflanzung-${runDir.split("/").pop()}.json` }));
    return true;
  }
  const model = url.pathname.match(/^\/api\/planting\/models\/([\w-]+\.glb)$/);
  if (model) {
    const item = catalog().find((c) => c.glb === model[1]);
    const file = item && modelSource(item.name);
    if (file && existsSync(file)) { send(res, 200, readFileSync(file), "model/gltf-binary"); return true; }
  }
  // new objects (the upload page): their state, and a new one
  if (url.pathname === "/api/objects" && req.method === "GET") {
    send(res, 200, JSON.stringify({ objects: workshop.list(), settings: { faces: params.sloydFaces, texture: params.sloydTexture, target: params.originMaxTriangles } }));
    return true;
  }
  if (url.pathname === "/api/objects" && req.method === "POST") {
    const wrong = workshop.add(await readBody(req));
    send(res, wrong ? 400 : 200, JSON.stringify(wrong ? { error: wrong } : {}));
    return true;
  }
  if (!started && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/planting")) { send(res, 409, JSON.stringify({ planting: true })); return true; }
  if (url.pathname === "/api/plant") { send(res, 200, JSON.stringify(plantFor())); return true; }
  if (url.pathname === "/api/frames") {
    const since = Number(url.searchParams.get("since") ?? 0);
    send(res, 200, JSON.stringify(frames.filter((f) => f.seq > since)));
    return true;
  }
  if (url.pathname === "/api/state") { send(res, 200, JSON.stringify(stateFor(Number(url.searchParams.get("since") ?? 0)))); return true; }
  if (url.pathname === "/api/cmd" && req.method === "POST") {
    const body = await readBody(req);
    try { command(body); send(res, 200, "{}"); } catch (e) { send(res, 400, JSON.stringify({ error: (e as Error).message })); }
    return true;
  }
  const photo = url.pathname.match(/^\/api\/photo\/([\w-]+)\/(\d+)(?:\/(\d+))?$/); // id / crush level / changes (saturation)
  if (photo) {
    const file = await photoFile(photo[1], Number(photo[2]), Number(photo[3] ?? 0));
    if (!file) send(res, 404, "{}");
    else send(res, 200, readFileSync(file), "image/jpeg");
    return true;
  }
  if (url.pathname.startsWith("/run/")) {
    if (!started) { send(res, 404, "{}"); return true; }
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
// new objects: Sloyd, working version, catalog; their Keimling variants only while the run computes nothing
const workshop = new Workshop(params, () => started && (running.size > 0 || queue.length > 0 || waitingFor !== null), (name) => !!library[name]);

const waitForPlanting = !replayDir && !args["ohne-pflanzen"] && !input.plants;
if (!waitForPlanting) await startRun(recorded?.plants ?? input.plants ?? null);
http.listen(port, () => {
  const tempo = rt ? `${Number(rt[1] || 1) > 1 ? `${rt[1]}× ` : ""}Echtzeit` : Math.abs(speed / REALTIME - Math.round(speed / REALTIME)) < 1e-9 ? `${Math.round(speed / REALTIME)}× Echtzeit` : `${speed} Kalendertage pro Minute`;
  console.log(replayDir
    ? `\nWiedergabe läuft: http://localhost:${port}/\nTempo: ${tempo}, ${totalStepDays.toFixed(2)} aufgezeichnete Kalendertage\n`
    : `\nSandbox läuft: http://localhost:${port}/\nTempo: ${tempo}, Verschmelzen: ${fuseMode ?? "erste hart, danach weich"}, Rechenvorlauf ${params.jobLeadDays} Eigentage\n${waitForPlanting ? "Wartet auf die Pflanzung (im Viewer oder in der AR-Testszene).\n" : ""}`);
});
