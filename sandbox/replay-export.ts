// Turns a recorded run into a recording the standalone replay app plays without
// any server (npm run dev:replay / build:replay, src/ReplayModule.vue):
//
//   npm run replay-export -- sandbox-runs/<run folder> [--out <folder>] [--unkomprimiert]
//
// The run's tape is played here with the same simulation as `--replay` (nothing
// is computed, every result comes from the tape), and after every step the
// plant is taken down as interface 1 shows it (runner/plant-answer.ts). Out of
// that come tracks over calendar time: per object its poses and floating (only
// as many keys as linear blending needs), its look (model, tint, grain, photo,
// comment) whenever it changes; per drawing its lines, place, size and texture.
// The folder (default sandbox-replays/<run>/) holds aufzeichnung.json and every
// model and photo the plant shows, nothing else. The models are compressed for
// delivery (meshopt, WebP textures at their own size, about a tenth of the
// bytes; made from the run's uncompressed files, ASSET-COMPRESSION-GUIDE.md).
// That calls sharp, so it runs on a development machine, not the plant's
// server; --unkomprimiert copies them as they are.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PARAMS, type Params } from "./params";
import { glbInfo } from "./runner/glb-info";
import { photoFile } from "./runner/photos";
import { fromPlantingPoint, plantDrawingAnswer, plantObjectAnswer } from "./runner/plant-answer";
import { applyWorldCommand, readTape, TapePlayer } from "./runner/tape";
import { buildScenario, DEFAULT_STARTERS, SCENARIO_DEFAULTS, type ScenarioValues } from "./scenarios/generate";
import { advance } from "./sim/schedule";
import type { DrawingLine, JobResult } from "./sim/types";
import { createWorld, jobFailed } from "./sim/world";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, unkomprimiert: { type: "boolean" } } });
if (positionals.length !== 1) {
  console.error("Aufruf: npm run replay-export -- sandbox-runs/<Ordner> [--out <Ordner>] [--unkomprimiert]");
  process.exit(1);
}
const runDir = resolve(positionals[0]);
if (!existsSync(join(runDir, "tape.jsonl"))) { console.error(`✖ ${runDir} hat keine tape.jsonl`); process.exit(1); }
const outDir = resolve(args.out ?? join(HERE, "..", "sandbox-replays", basename(runDir)));

// ---------------------------------------------------------------- the run, as --replay starts it

const recorded = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
const params: Params = { ...PARAMS, ...(recorded.params ?? {}) };
const scenarioValues: ScenarioValues = { ...SCENARIO_DEFAULTS, ...(recorded.scenario ?? {}) };
const plants = recorded.plants as { name: string; pos: [number, number, number]; rotY: number; size: number }[] | null;
const scenario = buildScenario({ scenario: scenarioValues, starters: plants ? plants.map((p) => p.name) : recorded.starters ?? DEFAULT_STARTERS });
if (plants) scenario.starters.forEach((s, i) => Object.assign(s, { pos: plants[i].pos, rotY: plants[i].rotY, size: plants[i].size }));
for (const s of scenario.starters) {
  const rel = `glb/${s.name}.glb`;
  const { triangles, min, max } = await glbInfo(join(runDir, rel));
  s.model = { glb: rel, triangles, min, max };
}
const w = createWorld(scenario, params);
const ready = new Map<number, JobResult>();
const player = new TapePlayer(w, readTape(join(runDir, "tape.jsonl")), ready, {
  command: (c) => applyWorldCommand(w, c),
  drop: (job) => { for (const id of jobFailed(w, job)) ready.delete(id); },
});

// ---------------------------------------------------------------- tracks

// a key: calendar day, position (3), rotation (4), scale, floating height, floating period
type Key = number[];
const POSE_TOLERANCE = { position: 0.003, rotation: 1e-5, scale: 0.003, sway: 0.002, period: 0.05 }; // m, 1 − |q·q'|, relative, m, s
const KEEP_AT_MOST = 100; // samples between two keys before one is kept anyway (bounds the work)

/** Keys at the samples linear blending needs: a sample is left out while every one since the last key lies on the line to it. */
class Track {
  readonly keys: Key[] = [];
  private since: Key[] = [];
  constructor(private readonly fits: (a: Key, b: Key, x: Key) => boolean) {}
  push(k: Key) {
    const a = this.keys[this.keys.length - 1];
    if (!a) { this.keys.push(k); return; }
    if (this.since.length >= KEEP_AT_MOST || !this.since.every((x) => this.fits(a, k, x))) { this.keys.push(this.since[this.since.length - 1]); this.since = []; }
    this.since.push(k);
  }
  end() { if (this.since.length) this.keys.push(this.since[this.since.length - 1]); this.since = []; }
}
const at = (a: Key, b: Key, x: Key) => (b[0] > a[0] ? (x[0] - a[0]) / (b[0] - a[0]) : 1);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const poseFits = (a: Key, b: Key, x: Key) => {
  const f = at(a, b, x), t = POSE_TOLERANCE;
  if (Math.hypot(lerp(a[1], b[1], f) - x[1], lerp(a[2], b[2], f) - x[2], lerp(a[3], b[3], f) - x[3]) > t.position) return false;
  const q = [4, 5, 6, 7].map((i) => lerp(a[i], b[i], f)), n = Math.hypot(...q) || 1;
  if (1 - Math.abs(q.reduce((s, v, i) => s + (v / n) * x[4 + i], 0)) > t.rotation) return false;
  if (Math.abs(lerp(a[8], b[8], f) - x[8]) > t.scale * Math.max(1e-3, Math.abs(x[8]))) return false;
  return Math.abs(lerp(a[9], b[9], f) - x[9]) <= t.sway && Math.abs(lerp(a[10], b[10], f) - x[10]) <= t.period;
};
const drawingFits = (a: Key, b: Key, x: Key) => {
  const f = at(a, b, x);
  return Math.hypot(lerp(a[1], b[1], f) - x[1], lerp(a[2], b[2], f) - x[2], lerp(a[3], b[3], f) - x[3]) <= POSE_TOLERANCE.position
    && Math.abs(lerp(a[4], b[4], f) - x[4]) <= POSE_TOLERANCE.scale * Math.max(1e-3, Math.abs(x[4]));
};

/** Something that changes now and then: [calendar day, value], a new entry only when it differs. */
class Steps<V> {
  readonly entries: [number, V][] = [];
  private last = "";
  push(c: number, v: V) { const s = JSON.stringify(v); if (s !== this.last) { this.last = s; this.entries.push([c, v]); } }
}

const looks: unknown[] = [], lookIndex = new Map<string, number>();
const lookOf = (look: unknown) => {
  const s = JSON.stringify(look);
  let i = lookIndex.get(s);
  if (i === undefined) { i = looks.length; looks.push(look); lookIndex.set(s, i); }
  return i;
};
const models = new Set<string>(), photos = new Map<string, { id: string; level: number; changes: number }>();
/** /run/glb/x.glb → glb/x.glb (relative to the recording). */
const modelPath = (url: string) => { const rel = url.replace(/^\/run\//, ""); models.add(rel); return rel; };
/** /api/photo/<id>/<level>/<changes> → photos/<id>-<level>-<changes>.jpg */
const photoPath = (url: string) => {
  const [, id, level, changes] = url.match(/^\/api\/photo\/([\w-]+)\/(\d+)\/(\d+)$/)!;
  const rel = `photos/${id}-${level}-${changes}.jpg`;
  photos.set(rel, { id, level: Number(level), changes: Number(changes) });
  return rel;
};

interface ObjectTrack { id: string; pose: Track; look: Steps<number>; to: number | null; lastQ: number[] }
interface DrawingTrack { id: string; lines: DrawingLine[]; place: Track; texture: Steps<string | null>; to: number | null }
const objects = new Map<string, ObjectTrack>(), drawings = new Map<string, DrawingTrack>();
const phases = new Steps<string>();
let radius = 0;

function sample() {
  const c = w.calendar;
  phases.push(c, w.phase);
  const seen = new Set<string>();
  for (const o of w.objects) {
    const a = plantObjectAnswer(w, o);
    seen.add(a.id);
    let t = objects.get(a.id);
    if (!t || t.to !== null) { t = { id: a.id, pose: new Track(poseFits), look: new Steps(), to: null, lastQ: a.pose.rotation }; objects.set(a.id, t); }
    // q and −q are the same turn: keep the sign of the last one, so blending takes the short way
    const q = a.pose.rotation.reduce((s, v, i) => s + v * t.lastQ[i], 0) < 0 ? a.pose.rotation.map((v) => -v) : a.pose.rotation;
    t.lastQ = q;
    t.pose.push([c, ...a.pose.position, ...q, a.pose.scale, a.sway.height, a.sway.period]);
    radius = Math.max(radius, Math.hypot(a.pose.position[0], a.pose.position[2]));
    t.look.push(c, lookOf({
      model: modelPath(a.model.url), tint: a.tint, grain: a.grain,
      photo: a.photo && { url: photoPath(a.photo.url), frame: a.photo.frame }, comment: a.comment,
    }));
  }
  for (const t of objects.values()) if (t.to === null && !seen.has(t.id)) { t.to = c; t.pose.end(); }
  const shown = new Set<string>();
  for (const d of w.drawings) {
    if (d.gone) continue;
    shown.add(d.id);
    let t = drawings.get(d.id);
    if (!t || t.to !== null) { t = { id: d.id, lines: d.lines, place: new Track(drawingFits), texture: new Steps(), to: null }; drawings.set(d.id, t); }
    // free: at its own place, at size 1, its own colours (as the AR scene shows strokesNearby); otherwise as the plant has it
    const a = d.mode === "frei" ? null : plantDrawingAnswer(w, d);
    t.place.push([c, ...(a ? a.position : fromPlantingPoint(w, d.pos)), a ? a.scale : 1]);
    t.texture.push(c, a?.textureFrom ? modelPath(a.textureFrom) : null);
  }
  for (const t of drawings.values()) if (t.to === null && !shown.has(t.id)) { t.to = c; t.place.end(); }
}

// ---------------------------------------------------------------- play the tape

const started = Date.now();
sample();
let steps = 0;
for (let q = player.next(); q !== null; q = player.next()) {
  if ("waiting" in advance(w, ready, q)) { console.warn(`⚠ Aufzeichnung endet bei Kalendertag ${w.calendar.toFixed(3)}: ein Ergebnis fehlt`); break; }
  player.stepDone();
  sample();
  if (++steps % 500 === 0) process.stdout.write(`\r  Kalendertag ${w.calendar.toFixed(2)} von ${player.totalStepDays.toFixed(2)}`);
}
for (const t of objects.values()) t.pose.end();
for (const t of drawings.values()) t.place.end();
console.log(`\r  ${steps} Schritte, ${w.calendar.toFixed(2)} Kalendertage, Phase ${w.phase} (${((Date.now() - started) / 1000).toFixed(1)} s)${player.diverged ? ", ⚠ weicht von der Aufzeichnung ab" : ""}`);

// ---------------------------------------------------------------- write the recording

const r = (v: number, d: number) => Number(v.toFixed(d));
const keyOut = (k: Key) => [r(k[0], 5), ...k.slice(1, 4).map((v) => r(v, 4)), ...k.slice(4, 8).map((v) => r(v, 5)), r(k[8], 5), r(k[9], 4), r(k[10], 3)];
const recording = {
  format: 1,
  run: basename(runDir), seed: scenarioValues.seed, commit: recorded.commit,
  days: r(w.calendar, 5),
  radius: r(radius, 2), // the farthest an object stands from the planting point
  phases: phases.entries.map(([c, p]) => [r(c, 5), p]),
  looks,
  objects: [...objects.values()].map((t) => ({ id: t.id, to: t.to === null ? null : r(t.to, 5), keys: t.pose.keys.map(keyOut), looks: t.look.entries.map(([c, i]) => [r(c, 5), i]) })),
  drawings: [...drawings.values()].map((t) => ({
    id: t.id, to: t.to === null ? null : r(t.to, 5), lines: t.lines,
    keys: t.place.keys.map((k) => [r(k[0], 5), ...k.slice(1, 4).map((v) => r(v, 4)), r(k[4], 5)]),
    textures: t.texture.entries.map(([c, u]) => [r(c, 5), u]),
  })),
};

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
for (const d of ["glb", "photos"]) mkdirSync(join(outDir, d), { recursive: true });
writeFileSync(join(outDir, "aufzeichnung.json"), JSON.stringify(recording));

let compress: ((src: string, out: string) => Promise<void>) | null = null;
if (!args.unkomprimiert) {
  const { compressGlbFile } = await import("../scripts/glb-compression"); // loads sharp: only here
  compress = (src, out) => compressGlbFile(src, out, { lossless: false, quality: 90 }); // textures keep their size: the crushed look stays
}
const queue = [...models];
let n = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let rel = queue.shift(); rel; rel = queue.shift()) {
    const src = join(runDir, rel);
    if (!existsSync(src)) { console.warn(`⚠ Modell fehlt: ${rel}`); continue; }
    if (compress) await compress(src, join(outDir, rel)); else copyFileSync(src, join(outDir, rel));
    if (++n % 25 === 0) process.stdout.write(`\r  Modelle ${n} von ${models.size}`);
  }
}));
for (const [rel, p] of photos) {
  const src = await photoFile(runDir, params, p.id, p.level, p.changes);
  if (src) copyFileSync(src, join(outDir, rel)); else console.warn(`⚠ Foto fehlt: ${p.id}`);
}

const mb = (f: string) => statSync(f).size / 1e6;
const total = [...models].filter((m) => existsSync(join(outDir, m))).reduce((s, m) => s + mb(join(outDir, m)), 0);
console.log(`\r✔ ${outDir}
  aufzeichnung.json ${mb(join(outDir, "aufzeichnung.json")).toFixed(1)} MB: ${objects.size} Objekte, ${drawings.size} Zeichnungen, ${looks.length} Ansichten
  ${models.size} Modelle (${total.toFixed(0)} MB${compress ? ", komprimiert" : ""}), ${photos.size} Fotos
Abspielen: npm run dev:replay (nimmt die neueste Aufzeichnung, eine bestimmte mit PLANT_REPLAY=${outDir.replace(resolve(HERE, "..") + "/", "")})`);
