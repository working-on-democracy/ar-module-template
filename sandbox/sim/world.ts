// The simulation core: rules applied per time step. No files, no network, no
// rendering — geometry work goes out as JobRequests and comes back through
// applyJob(), so the same core runs with real .glb jobs (sandbox server) and
// with plain numbers (lifecycle page). Rules: see the sandbox doc.
import type { Params } from "../params";
import { compose, decompose, lerpPose, multiply, quatTilt, quatY, rotateAbout, transformPoint, type Mat4 } from "./pose";
import { createRng, type Rng } from "./rng";
import { fusePostTriangles, fuseRecipe, halvingRecipe, STEP_LABEL, STYLIZE_COPY } from "./recipes";
import type {
  Drawing, JobRequest, JobResult, ModelVersion, ObjectKind, ObjectState, Photo, PlantObject, Scenario, ScheduledEntry, Vec3, World,
} from "./types";

const SAMPLE_EVERY = 0.05; // Eigentage between two samples of the curve

// ---------------------------------------------------------------- geometry

/** Height of the object as it stands (model height × scale). */
export const objectHeight = (o: PlantObject) => (o.max[1] - o.min[1]) * o.scale;

/** Model frame → world: the travelling pose, or standing at pos with the
 *  underside at `lift` (a Keimling still rising sits lower by the part not yet
 *  grown and is smaller, from startScale to full size), leaning by its tilt
 *  about a pivot on the ground under its centre. */
export function modelMatrix(o: PlantObject): Mat4 {
  if (o.pose) return compose(o.pose.p, o.pose.q, o.pose.s);
  const s = o.scale * (o.startScale + (1 - o.startScale) * o.grow);
  const base = o.lift - (o.max[1] - o.min[1]) * s * (1 - o.grow);
  const m = compose([o.pos[0], base - o.min[1] * s, o.pos[2]], quatY(o.rotY), s);
  if (!o.tilt || !o.tilt.angle) return m;
  const c = transformPoint(m, [(o.min[0] + o.max[0]) / 2, o.min[1], (o.min[2] + o.max[2]) / 2]);
  return rotateAbout(m, [c[0], 0, c[2]], quatTilt(o.tilt.angle, o.tilt.dir));
}

/** Longest side of the object as it stands, without lean (model × scale). */
export const objectSize = (o: PlantObject) => Math.max(...[0, 1, 2].map((k) => o.max[k] - o.min[k])) * o.scale;

export function worldBounds(o: PlantObject): { min: Vec3; max: Vec3 } {
  const m = modelMatrix(o);
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [o.min[0], o.max[0]]) for (const y of [o.min[1], o.max[1]]) for (const z of [o.min[2], o.max[2]]) {
    const v = transformPoint(m, [x, y, z]);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  }
  return { min, max };
}

/** Width of the object as it stands: its longer horizontal side (model x or z × scale). */
export const objectWidth = (o: PlantObject) => Math.max(o.max[0] - o.min[0], o.max[2] - o.min[2]) * o.scale;

/** Keep the object within the size limits: no wider than maxWidth (it shrinks),
 *  top edge under maxTop (sink up to maxSink of the height, shrink beyond that). */
function fitSize(o: PlantObject, p: Params) {
  const wdt = objectWidth(o);
  if (wdt > p.maxWidth) o.scale *= p.maxWidth / wdt;
  let h = objectHeight(o);
  if (o.lift + h <= p.maxTop) return;
  const minLift = -p.maxSink * h;
  if (p.maxTop - h >= minLift) { o.lift = p.maxTop - h; return; }
  // too tall even when sunk in: shrink so that it fits with the full sink
  o.scale *= p.maxTop / (h * (1 - p.maxSink));
  h = objectHeight(o);
  o.lift = -p.maxSink * h;
}

/** 0 at swayFromTriangles and above, 1 at a single triangle (log scale). */
function swayStrength(o: PlantObject, p: Params): number {
  if (o.triangles >= p.swayFromTriangles || p.swayFromTriangles <= 1) return 0;
  return Math.min(1, Math.log(p.swayFromTriangles / Math.max(1, o.triangles)) / Math.log(p.swayFromTriangles));
}

/** Floating: how high (m) the object bobs up from where it stands. Grows as its
 *  triangles fall; less near the ground, more the higher it stands. Keimlinge
 *  only once they have fully risen out of the ground. */
export function swayOf(o: PlantObject, p: Params): number {
  if (o.grow < 1) return 0; // a Keimling still rising out of the ground stands still
  const s = swayStrength(o, p);
  if (!s) return 0;
  const height = Math.min(p.swayMaxFactor, p.swayGroundFactor + p.swayPerMetre * Math.max(0, o.lift));
  return p.swayAmplitude * Math.pow(s, 1.5) * height;
}

/** Seconds per bob: slow at first, faster with fewer triangles. */
export function swayPeriodOf(o: PlantObject, p: Params): number {
  return p.swaySlowSeconds + (p.swayFastSeconds - p.swaySlowSeconds) * swayStrength(o, p);
}

export function objectCenter(o: PlantObject): Vec3 {
  const b = worldBounds(o);
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

export function objectRadius(o: PlantObject, p: Params): number {
  const d = Math.hypot(o.max[0] - o.min[0], o.max[1] - o.min[1], o.max[2] - o.min[2]) * o.scale;
  return p.objectRadiusBase + d / 2;
}

/** The active ecosystem: everything alive except the planted origin objects. */
export const living = (w: World) => w.objects.filter((o) => o.state !== "tot" && !o.origin);

/** Moving centre of all existing objects (on the ground). */
export function ecosystemCenter(w: World): Vec3 {
  const objs = living(w);
  if (!objs.length) return w.plantingPoint;
  let x = 0, z = 0;
  for (const o of objs) { x += o.pos[0]; z += o.pos[2]; }
  return [x / objs.length, 0, z / objs.length];
}

export function ecosystemBounds(w: World): { min: Vec3; max: Vec3 } | null {
  const objs = living(w);
  if (!objs.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const o of objs) {
    const b = worldBounds(o);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], b.min[k]); max[k] = Math.max(max[k], b.max[k]); }
  }
  return { min, max };
}

export const totalTriangles = (w: World) => living(w).reduce((n, o) => n + o.triangles, 0);

const dist2d = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3d = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------------------------------------------------------------- setup

export function createWorld(scenario: Scenario, params: Params): World {
  const rng = createRng(scenario.seed);
  const w: World = {
    scenarioName: scenario.name,
    params,
    seed: scenario.seed,
    rngState: 0,
    eigen: 0,
    calendar: 0,
    objects: [],
    photos: [],
    drawings: [],
    boosts: [],
    viewers: 0,
    plantingPoint: [0, 0, 0],
    budget: params.budgetBase,
    compressAt: 0,
    halvingAt: 0,
    plateauMax: 0,
    phase: "wachstum",
    compressAccount: 0,
    compressSpan: rng.vary(params.compressSpanDays, params.compressVariance),
    nextDescentCompressAt: 0,
    nextHalvingAt: null,
    jobs: [],
    nextSpawnAt: {},
    generationCounts: {},
    plateauSince: null,
    voxelSince: null,
    pioneerQueue: [],
    firstRoundDone: {},
    opening: { stage: "warten", first: null, firstA: null },
    halvingSince: null,
    pairs: [],
    firstPairFormed: false,
    stepsSeen: {},
    champion: null,
    nextChainAt: 0,
    halvingChain: null,
    nextJobId: 1,
    nextId: 1,
    events: [],
    samples: [],
    nextSampleAt: 0,
    scheduled: [...scenario.timeline].sort((a, b) => a.at - b.at),
    factor: 1,
    pioneerFactor: 1,
    factorParts: { inhalt: 0, ereignisse: 0, hinschauen: 0 },
  };
  let px = 0, pz = 0;
  for (const s of scenario.starters) {
    const pos: Vec3 = [s.pos[0], 0, s.pos[2]]; // standing on the ground (lift 0)
    // an origin object above originMaxTriangles is reduced to it (the server reduces the file first)
    const model = { ...s.model, triangles: Math.min(s.model.triangles, params.originMaxTriangles) };
    const o = newObject(w, rng, model, s.name, null, 0, pos, s.rotY ?? rng.range(0, Math.PI * 2));
    o.origin = true;
    const side = Math.max(...[0, 1, 2].map((k) => s.model.max[k] - s.model.min[k])); // longest side
    if (side > 0) o.scale = Math.min(params.originMaxSize, Math.max(params.originMinSize, side)) / side;
    o.grow = 1; // planted objects stand from the start, no growing time before their first copy
    w.objects.push(o);
    px += s.pos[0]; pz += s.pos[2];
  }
  const n = Math.max(1, scenario.starters.length);
  w.plantingPoint = [px / n, 0, pz / n]; // never changes again
  // the budget adapts to the origin objects: 5 × 5 000 → budgetBase, more triangles → more budget
  const sum = w.objects.reduce((t, o) => t + o.triangles, 0);
  w.budget = Math.round(Math.min(params.budgetMax, Math.max(params.budgetMin, params.budgetBase + params.budgetSlope * (sum - params.budgetRefOrigins))));
  w.compressAt = Math.round(w.budget * params.compressAtShare);
  w.halvingAt = Math.round(w.budget * params.halvingAtShare);
  // the first Keimlinge (Vorläufer): every origin object once, in random order, two per generation (1, 1, 2, 2, 3 …),
  // a little apart in time; the plain Keimlinge of every line run independently of them, from planting on
  const origins = [...w.objects];
  for (let i = origins.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [origins[i], origins[j]] = [origins[j], origins[i]]; }
  let at = 0;
  for (let i = 0; i < Math.min(params.pioneerCount, origins.length); i++) {
    if (i) at += params.pioneerStaggerMinutes / 1440;
    w.pioneerQueue.push({ origin: origins[i].id, generation: Math.floor(i / 2) + 1, at });
  }
  w.rngState = rng.state();
  log(w, "start", `${scenario.starters.length} Objekte gepflanzt (${sum} Dreiecke): Budget ${w.budget}, verstärkte Komprimierung ab ${w.compressAt}, Halbieren unter ${w.halvingAt}`);
  sample(w);
  return w;
}

function newObject(
  w: World, rng: Rng, model: ModelVersion,
  lineage: string, parent: string | null, generation: number, pos: Vec3, rotY: number,
): PlantObject {
  const p = w.params;
  return {
    ...model,
    id: `o${w.nextId++}`,
    lineage, parent, generation, pos, rotY,
    state: "keimling",
    bornAt: w.eigen,
    grow: 0,
    startScale: p.keimStartScale,
    tilt: null,
    growBase: null,
    busy: false,
    photo: null,
    crushLevel: 0,
    nextCrushAt: 0,
    deadSince: null,
    pairedWith: null,
    fusions: 0,
    halvings: 0,
    sibling: null,
    tint: null,
    tintFusions: 0,
    origin: false,
    originalTriangles: model.triangles,
    scale: 1,
    lift: 0,
    pose: null,
    voxelCells: null,
    fast: false,
    shrinkBase: null,
    stuck: false,
  };
}

function log(w: World, type: string, text: string, objectId?: string) {
  w.events.push({ eigen: w.eigen, calendar: w.calendar, type, text, objectId });
}

function sample(w: World) {
  const counts: Record<ObjectState, number> = { keimling: 0, aktiv: 0, verwelkend: 0, tot: 0 };
  const kinds: Record<ObjectKind, number> = { ursprung: 0, keimling: 0, voxelkeimling: 0, unveraendert: 0, v1: 0, v2: 0, v3: 0, v4: 0, halbiert: 0 };
  for (const o of w.objects) {
    if (!o.origin) counts[o.state]++;
    if (o.state !== "tot") kinds[objectKind(o)]++;
  }
  w.samples.push({ eigen: w.eigen, calendar: w.calendar, triangles: totalTriangles(w), factor: w.factor, counts, kinds });
  w.nextSampleAt = w.eigen + SAMPLE_EVERY;
}

/** Halved wins over fused (it is the later step), fused over Keimling. */
export function objectKind(o: PlantObject): ObjectKind {
  if (o.origin) return "ursprung";
  if (o.halvings > 0) return "halbiert";
  if (o.fusions > 0) return o.fusions >= 4 ? "v4" : (`v${o.fusions}` as ObjectKind);
  if (o.state === "keimling") return o.voxelCells ? "voxelkeimling" : "keimling";
  return "unveraendert";
}

/** Requests a job; its result is used `dueIn` Eigentage from now (default: the computing lead). */
function request(w: World, job: Omit<JobRequest, "id" | "dueAt">, dueIn?: number): number {
  for (const id of [job.objectId, job.partnerId]) {
    const o = id ? w.objects.find((x) => x.id === id) : undefined;
    if (o) o.busy = true;
  }
  const id = w.nextJobId++;
  const lead = job.pioneer || job.immediate ? w.params.pioneerLeadDays : // Vorläufer, first round of plain Keimlinge
    job.kind === "fuse" && job.fuseMode === "weich" ? w.params.softFuseLeadDays : w.params.jobLeadDays;
  w.jobs.push({ ...job, id, dueAt: w.eigen + (dueIn ?? lead) });
  return id;
}

// ---------------------------------------------------------------- commands (viewer / scenario)

export function addPhoto(w: World, pos: Vec3, lifetime?: number, id?: string): Photo {
  const ph: Photo = {
    id: id ?? `f${w.nextId++}`, pos, createdAt: w.calendar,
    lifetime: lifetime ?? w.params.photoLifetimeDays, blocked: false, gone: false,
  };
  w.photos.push(ph);
  log(w, "foto", `Foto ${ph.id} hochgeladen`);
  boost(w, "foto", pos);
  return ph;
}

export function addDrawing(w: World, pos: Vec3, lifetime?: number, color?: string, id?: string): Drawing {
  const rng = createRng(w.rngState);
  const points: Vec3[] = [];
  let x = 0, y = rng.range(0.9, 1.6), z = 0;
  const n = 8 + Math.floor(rng.range(0, 8));
  for (let i = 0; i < n; i++) {
    points.push([x, y, z]);
    x += rng.range(-0.15, 0.25); y += rng.range(-0.12, 0.12); z += rng.range(-0.15, 0.15);
  }
  const d: Drawing = {
    id: id ?? `z${w.nextId++}`, pos, points,
    color: color ?? ["#eab308", "#e11d48", "#2563eb", "#16a34a"][Math.floor(rng.range(0, 4))],
    createdAt: w.calendar, lifetime: lifetime ?? w.params.drawingLifetimeDays, gone: false,
    mode: "frei", target: null, startDist: 0, travelled: 0, scale: 1,
    overlapGoal: rng.range(w.params.overlapMin, w.params.overlapMax), overlap: 0, texture: null,
  };
  w.rngState = rng.state();
  w.drawings.push(d);
  log(w, "zeichnung", `Zeichnung ${d.id} gezeichnet`);
  boost(w, "zeichnung", pos);
  return d;
}

/** Blocked, deleted or expired: the photo is gone, plant objects drop it. */
export function removePhoto(w: World, photoId: string, reason: "gesperrt" | "gelöscht" | "abgelaufen") {
  const ph = w.photos.find((x) => x.id === photoId);
  if (!ph || ph.gone) return;
  ph.gone = true;
  if (reason === "gesperrt") ph.blocked = true;
  log(w, "foto-weg", `Foto ${ph.id} ${reason}`);
  for (const o of w.objects) {
    if (o.photo?.photoId !== photoId) continue;
    const back = !o.photo.halvedSince && o.state === "verwelkend";
    o.photo = null;
    if (back) o.state = "aktiv";
    log(w, "foto-zurueck", `${o.id}: Fototextur entfernt, alte Textur zurück${back ? ", wieder aktiv" : ""}`, o.id);
  }
}

export function setViewers(w: World, count: number) {
  w.viewers = Math.max(0, count);
  log(w, "besucher", `${w.viewers} Gerät(e) im Radius`);
}

function runScheduled(w: World, e: ScheduledEntry) {
  if (e.type === "foto") addPhoto(w, e.pos, e.lifetime, e.id);
  else if (e.type === "zeichnung") addDrawing(w, e.pos, e.lifetime, e.color, e.id);
  else if (e.type === "sperren") removePhoto(w, e.photoId, "gesperrt");
  else if (e.type === "loeschen") removePhoto(w, e.photoId, "gelöscht");
  else if (e.type === "besucher") setViewers(w, e.count);
}

// ---------------------------------------------------------------- the step

/** Advances the world by `dtCalendar` calendar days. Returns the new job requests. */
export function step(w: World, dtCalendar: number): JobRequest[] {
  const p = w.params;
  const rng = createRng(w.rngState);
  const before = w.jobs.length;

  // Time scale: factor from the boosts, then both clocks.
  updateFactor(w);
  const dt = dtCalendar * w.factor; // Eigentage
  // the fast line has its own time right after planting: the boosts count pioneerBoostFactor times
  const dtFast = dtCalendar * w.pioneerFactor;
  const dtOf = (o: PlantObject) => (o.fast ? dtFast : dt);
  w.calendar += dtCalendar;
  w.eigen += dt;

  while (w.scheduled.length && w.scheduled[0].at <= w.calendar) runScheduled(w, w.scheduled.shift()!);
  for (const ph of w.photos) if (!ph.gone && w.calendar >= ph.createdAt + ph.lifetime) removePhoto(w, ph.id, "abgelaufen");
  for (const d of w.drawings) {
    if (!d.gone && w.calendar >= d.createdAt + d.lifetime) { d.gone = true; log(w, "zeichnung-weg", `Zeichnung ${d.id} abgelaufen`); }
  }
  w.boosts = w.boosts.filter((b) => b.until > w.calendar);

  const total = totalTriangles(w);
  w.plateauMax = Math.max(w.plateauMax, total);

  // Keimlinge rise out of the ground (the Vorläufer faster).
  for (const o of w.objects) if (o.grow < 1) o.grow = Math.min(1, o.grow + (dtOf(o) * (o.fast ? p.pioneerGrowSpeed : 1)) / p.growDays);

  // The first Keimlinge (Vorläufer), one after the other: copied straight from their origin
  // object as the generation they were given (Phase 2 stylize, then fewer faces, then voxels).
  while (w.pioneerQueue.length && w.pioneerQueue[0].at <= w.eigen) {
    const { origin: id, generation: gen } = w.pioneerQueue.shift()!;
    const origin = w.objects.find((x) => x.id === id && x.state !== "tot");
    if (!origin) continue;
    const voxelCells = gen >= p.voxelFromGeneration
      ? Math.max(1, Math.round(p.voxelCellsStart * Math.pow(p.voxelCellsFactor, gen - p.voxelFromGeneration)))
      : undefined;
    request(w, {
      kind: "copy", objectId: origin.id, generation: gen, voxelCells, recipe: voxelCells ? "p5" : "p2", pioneer: true,
      faces: voxelCells ? undefined : Math.round(STYLIZE_COPY.faces * Math.pow(p.copyShrink, gen - 1)),
      spawn: { pos: [...origin.pos] as Vec3, rotY: rng.range(0, Math.PI * 2) }, // placed next to the others when it arrives
    });
  }

  // Keimling phase: from planting until the plateau time is over (or growth
  // gives up after growthMaxDays). Two kinds of new Keimlinge:
  //  - plain generations (no voxels) at a rate per origin line: the parent is
  //    a grown member of the line, later generations likelier; the new one
  //    keeps its parent's generation or takes the next — likelier the longer
  //    the ecosystem lives. Growth: only below the budget; plateau: only below
  //    the refill line.
  //  - voxel generations only from the plateau on, on a schedule: each line
  //    makes voxelCopiesPerGeneration copies of every voxel generation, the
  //    last (a single cube) voxelTargetDays after the plateau.
  const keimPhase =
    (w.phase === "wachstum" && w.eigen < p.growthMaxDays) ||
    (w.phase === "plateau" && w.plateauSince !== null && w.eigen < w.plateauSince + p.plateauDays);
  if (keimPhase) {
    const limit = w.phase === "wachstum" ? w.budget : p.plateauRefillBelow * w.budget;
    const lastPlain = p.voxelFromGeneration - 1;
    const advance = Math.min(1, p.genAdvanceStart + (1 - p.genAdvanceStart) * (w.eigen / p.genAdvanceDays));
    // voxel generations begin once the count rises above halvingAt (the halving threshold, on the way up)
    if (w.voxelSince === null && totalTriangles(w) >= w.halvingAt) { w.voxelSince = w.eigen; log(w, "phase", `Über ${w.halvingAt} Dreiecken: Voxel-Generationen beginnen`); }
    const voxelStart = w.voxelSince ?? w.plateauSince ?? (w.eigen >= p.growthMaxDays - p.voxelTargetDays ? p.growthMaxDays - p.voxelTargetDays : null);
    // the Vorläufer make no copies; an origin object may copy while it is busy with another copy (a Vorläufer)
    const free = (o: PlantObject) => o.grow >= 1 && (!o.busy || o.origin) && !o.pairedWith && !o.photo && !o.fast && (o.origin || o.state === "keimling");
    const spawn = (parent: PlantObject, gen: number, max: number, immediate = false): boolean => {
      const voxelCells = gen >= p.voxelFromGeneration
        ? Math.max(1, Math.round(p.voxelCellsStart * Math.pow(p.voxelCellsFactor, gen - p.voxelFromGeneration)))
        : undefined;
      const estimate = voxelCells ? Math.max(12, Math.round(4.2 * voxelCells * voxelCells)) : Math.floor(parent.triangles * (gen > parent.generation ? p.copyShrink : 1));
      if (totalTriangles(w) + estimate + pendingCopyTriangles(w) > max) return false;
      const angle = rng.range(0, Math.PI * 2);
      const r = p.spreadBase + p.spreadPerGeneration * gen + rng.range(0, p.spreadJitter);
      // Phase 2 (stylize) for the first generation from an origin object, Phase 5 for voxels,
      // a plain copy within a generation, a reduced one for the next plain generation
      const recipe = voxelCells ? "p5" : gen === parent.generation ? "copy" : parent.origin && gen === 1 ? "p2" : "reduce";
      request(w, {
        kind: "copy", objectId: parent.id, immediate, generation: gen, voxelCells, recipe,
        keep: gen > parent.generation ? p.copyShrink : 1, // a new generation is worse, the same generation a plain copy
        spawn: { pos: [parent.pos[0] + Math.cos(angle) * r, 0, parent.pos[2] + Math.sin(angle) * r], rotY: rng.range(0, Math.PI * 2) },
      });
      const key = `${parent.lineage}:${gen}`;
      w.generationCounts[key] = (w.generationCounts[key] ?? 0) + 1;
      return true;
    };
    for (const origin of w.objects.filter((o) => o.origin && o.state !== "tot")) {
      const line = w.objects.filter((o) => o.lineage === origin.lineage && o.state !== "tot");
      // voxel generations on schedule (they may exceed the refill line, not the budget)
      if (voxelStart !== null) {
        const steps = p.maxGeneration - lastPlain;
        const due = lastPlain + Math.min(steps, Math.ceil((steps * (w.eigen - voxelStart)) / p.voxelTargetDays));
        let target = 0;
        for (let g = p.voxelFromGeneration; g <= due && !target; g++) {
          if ((w.generationCounts[`${origin.lineage}:${g}`] ?? 0) < p.voxelCopiesPerGeneration) target = g;
        }
        if (target) {
          // parent: a member of the generation before, else the line's highest member
          const cands = line.filter(free);
          let parent = cands.find((o) => o.generation === target - 1) ?? null;
          if (!parent) for (const o of cands) if (!parent || o.generation > parent.generation) parent = o;
          if (parent && spawn(parent, target, w.budget)) continue; // one new Keimling per line and step
        }
      }
      // plain generations at the rate
      if (w.eigen < (w.nextSpawnAt[origin.lineage] ?? 0)) continue;
      w.nextSpawnAt[origin.lineage] = w.eigen + rng.vary(1 / p.keimRatePerDay, p.copyVariance);
      const plain = line.filter((o) => free(o) && o.generation <= lastPlain);
      if (!plain.length) continue;
      // later generations are likelier parents (weight 1 + generation)
      let pick = rng.next() * plain.reduce((n, o) => n + 1 + o.generation, 0), parent = plain[0];
      for (const o of plain) { pick -= 1 + o.generation; if (pick <= 0) { parent = o; break; } }
      const gen = parent.origin ? 1 : Math.min(lastPlain, parent.generation + (rng.next() < advance ? 1 : 0));
      // the first round of every line is used as soon as it is ready, like the Vorläufer
      if (spawn(parent, gen, limit, !w.firstRoundDone[origin.lineage])) w.firstRoundDone[origin.lineage] = true;
    }
  } else {
    for (const o of w.objects) {
      if (o.state === "keimling" && o.grow >= 1 && !o.busy && !o.origin) { o.state = "aktiv"; log(w, "aktiv", `${o.id} (${o.lineage}) wird aktiv, die Keimlingsphase ist vorbei`, o.id); }
    }
  }

  // Fusion: a free object picks the nearest free partner in its radius, by
  // chance. The pair is reserved for good; the smaller one travels to the
  // larger one while the fused model is computed; swap once both are done.
  // (the fast line only once the Vorläufer's opening fusions are over)
  const canFuse = (o: PlantObject) =>
    o.grow >= 1 && !o.origin && !o.busy && !o.pairedWith && !o.photo && (o.state === "aktiv" || o.state === "keimling") &&
    (!o.fast || w.opening.stage === "fertig");
  const pairUp = (o: PlantObject, q: PlantObject, why: string, opening = false): number => {
    // the lower one travels and (with fuseMatchHeight) grows to the taller one's height
    const [a, b] = objectHeight(o) >= objectHeight(q) ? [o, q] : [q, o];
    // the test track step: Phase 3 hard for a first fusion, then 4, 7, 8, 10 (soft); Phase 6 with a voxel partner
    const r = fuseRecipe(a, b, !!p.softAfterFirstFusion);
    // the fused model is computed first: it fixes B's pose (position, rotation, scale) inside the result
    // the fast line travels faster, its opening fusions faster still and on a flatter curve, so they are seen moving early
    // two jobs with the same seed: first only the pose (quick, used at once: the journey starts
    // right away), then the fused model, computed during the journey and used on arrival. The
    // journey lasts at least the usual computing lead, so a fast sandbox clock rarely has to
    // wait (not the Vorläufer's opening: there the clock waits if need be)
    const lead = r.mode === "weich" ? p.softFuseLeadDays : p.jobLeadDays;
    const travel = rng.vary(p.fuseTravelDays, 0.2) / (a.fast || b.fast ? p.pioneerFuseSpeed : 1) / (opening ? p.firstFuseSpeed : 1);
    const duration = opening ? travel : Math.max(travel, lead);
    const fuse = { objectId: a.id, partnerId: b.id, fuseMode: r.mode, overlap: r.overlap, seed: Math.floor(rng.next() * 1e6) };
    const poseJobId = request(w, { kind: "pose", ...fuse }, 0);
    const jobId = request(w, { kind: "fuse", ...fuse, recipe: r.step, fusePost: r.post }, duration);
    a.pairedWith = b.id; b.pairedWith = a.id;
    w.firstPairFormed = true;
    w.pairs.push({ a: a.id, b: b.id, jobId, poseJobId, expectedTriangles: fusePostTriangles(r.post, a.triangles + b.triangles), opening, start: null, duration, easeK: opening ? p.firstFuseEaseK : p.fuseEaseK, from: null, to: null, aFrom: null, aTo: null, aLift: 0, aScale: 1, result: null });
    if (w.champion === b.id) w.champion = a.id; // the chain goes on in the merged object
    log(w, "verschmelzung-paar", `${b.id} (${b.triangles}) wird von ${a.id} (${a.triangles}) angezogen, Paar steht fest (${STEP_LABEL[r.step]}${why})`, a.id);
    return jobId;
  };

  // The Vorläufer's opening, always the same: once all of them are grown, a random two pair
  // up; halfway through their journey two of the others; as soon as the first two have
  // fused, the result pairs with the last one. All three without computing lead, at
  // firstFuseSpeed on the flatter curve. Only then does the fast line fuse with others.
  const op = w.opening;
  if (op.stage !== "fertig") {
    const ready = () => w.objects.filter((o) => o.fast && o.state === "keimling" && o.grow >= 1 && !o.busy && !o.pairedWith && !o.pose);
    const pick = (objs: PlantObject[]) => objs.splice(Math.floor(rng.next() * objs.length), 1)[0];
    const pending = w.pioneerQueue.length > 0 || w.jobs.some((j) => j.pioneer) || w.objects.some((o) => o.fast && o.state === "keimling" && o.grow < 1);
    const opening = () => w.pairs.filter((pr) => pr.opening);
    if (op.stage === "warten") {
      const c = ready();
      if (c.length >= 2 && !pending) { // all grown, so any two can be the first pair
        const x = pick(c), y = pick(c);
        op.first = pairUp(x, y, ", Vorläufer: erste Verschmelzung", true);
        op.firstA = w.pairs.find((pr) => pr.jobId === op.first)!.a;
        op.stage = "erstes";
      } else if (!pending && c.length < 2 && !w.objects.some((o) => o.fast && o.state === "keimling" && !o.pairedWith && (o.busy || o.pose))) op.stage = "fertig"; // fewer than two Vorläufer
    }
    if (op.stage === "erstes") {
      const first = w.pairs.find((pr) => pr.jobId === op.first);
      const halfway = !first || (first.start !== null && w.eigen >= first.start + first.duration / 2);
      const c = ready();
      if (halfway && (c.length >= 3 || (!pending && c.length >= 2 && !first))) {
        const x = pick(c), y = pick(c);
        pairUp(x, y, ", Vorläufer: zweite Verschmelzung", true);
        op.stage = "zweites";
      } else if (halfway && !pending && c.length < 2) op.stage = "zweites"; // nobody left for a second pair
    }
    if (op.stage === "zweites" && !w.pairs.some((pr) => pr.jobId === op.first)) {
      const merged = w.objects.find((o) => o.id === op.firstA && o.state !== "tot" && !o.busy && !o.pairedWith);
      const last = ready()[0];
      if (merged && last) { pairUp(merged, last, ", Vorläufer: dritte Verschmelzung", true); op.stage = "drittes"; }
      else if (!pending && !last) op.stage = "drittes"; // no single one left
    }
    if (op.stage === "drittes" && !opening().length) {
      op.stage = "fertig";
      log(w, "phase", "Die Vorläufer sind verschmolzen: Die schnelle Linie verschmilzt ab jetzt auch mit anderen Objekten");
    }
  }
  const nearestFusable = (o: PlantObject, ok: (x: PlantObject) => boolean) =>
    nearest(w.objects.filter((x) => x !== o && canFuse(x) && ok(x)), o.pos);

  // Every step at least once: one object (the champion) goes through the whole
  // fusion chain. It is chosen among the most fused objects and pairs again
  // regularly, with a plain (non-voxel) partner, until it has requiredFusions.
  let champ = w.champion ? w.objects.find((o) => o.id === w.champion) ?? null : null;
  if (!champ || champ.state === "tot" || champ.state === "verwelkend" || champ.photo) {
    champ = null; w.champion = null;
    for (const o of w.objects) {
      if (o.origin || o.voxelCells || o.state === "tot" || o.state === "verwelkend" || o.photo || o.grow < 1) continue;
      if (!champ || o.fusions > champ.fusions || (o.fusions === champ.fusions && o.triangles > champ.triangles)) champ = o;
    }
    if (champ && champ.fusions < p.requiredFusions && w.firstPairFormed) w.champion = champ.id;
  }
  if (champ && w.champion && champ.fusions < p.requiredFusions && canFuse(champ) && w.eigen >= w.nextChainAt) {
    // preferably a partner never fused: fusions add up, so a fused one would skip a step of the chain
    // (in the descent, when unfused ones grow scarce, any plain partner)
    const late = w.phase === "abstieg" || w.phase === "verfall";
    const q = nearestFusable(champ, (x) => !x.voxelCells && x.fusions === 0) ?? (late ? nearestFusable(champ, (x) => !x.voxelCells) : null);
    if (q) { pairUp(champ, q, ", Kette"); w.nextChainAt = w.eigen + p.chainEveryDays; }
    else if (w.phase === "abstieg" || w.phase === "verfall") w.champion = null; // nobody left to fuse with: the chain gives up
  }
  if (champ && champ.fusions >= p.requiredFusions) w.champion = null;

  // … and at least one voxel object fuses (Phase 6): halfway through the voxel
  // stage a grown voxel Keimling pairs with its nearest plain partner.
  if (!w.stepsSeen.p6 && !w.pairs.some((pr) => w.jobs.some((j) => j.id === pr.jobId && j.recipe === "p6")) && w.voxelSince !== null && w.eigen >= w.voxelSince + p.voxelTargetDays / 2) {
    const v = w.objects.find((o) => o.voxelCells && canFuse(o));
    const q = v ? nearestFusable(v, (x) => !x.voxelCells && x.id !== w.champion) : null;
    if (v && q) pairUp(v, q, ", Voxel-Garantie");
  }

  // Fusion: a free object picks the nearest free partner in its radius, by
  // chance. The pair is reserved for good; the smaller one travels to the
  // larger one while the fused model is computed; swap once both are done.
  for (const o of w.objects) {
    if (!canFuse(o) || o.id === w.champion) continue;
    // the very first pair forms as soon as two grown objects are in reach of each other
    if (w.firstPairFormed && !rng.chance(p.fusePerDay * (o.fast ? p.pioneerFuseSpeed : 1), dtOf(o))) continue; // the fast line decides faster
    const reach = objectRadius(o, p);
    const q = nearestFusable(o, (x) => x.id !== w.champion && dist2d(x.pos, o.pos) <= reach);
    if (q) pairUp(o, q, "");
  }
  for (const pair of [...w.pairs]) {
    const a = w.objects.find((x) => x.id === pair.a), b = w.objects.find((x) => x.id === pair.b);
    if (!a || !b) { w.pairs.splice(w.pairs.indexOf(pair), 1); continue; }
    if (pair.start === null || !pair.from || !pair.to || !pair.aFrom || !pair.aTo) continue; // pose not known yet: B waits
    // on the way B already turns, scales and rises into its pose inside the
    // fused model, and A already rises (or sinks/shrinks) to its final height
    const t = Math.min(1, (w.eigen - pair.start) / pair.duration);
    const k = pair.easeK, s = k > 0 ? (Math.exp(k * t) - 1) / (Math.exp(k) - 1) : t;
    b.pose = lerpPose(pair.from, pair.to, s);
    b.pos = [b.pose.p[0], 0, b.pose.p[2]];
    a.pose = lerpPose(pair.aFrom, pair.aTo, s);
    if (t < 1 || !pair.result) continue; // arrived before the fused model is ready: both wait overlapping
    const before = a.triangles + b.triangles;
    Object.assign(a, {
      glb: pair.result.glb, triangles: pair.result.triangles, min: pair.result.min, max: pair.result.max,
      lift: pair.aLift, scale: pair.aScale, growBase: pair.aScale, pose: null,
      fusions: a.fusions + b.fusions + 1, state: "aktiv", busy: false, pairedWith: null, fast: a.fast || b.fast,
      // the minimum strength holds for a first fusion only (or the first after the colour faded out); later it may fade out
      tint: mixTint(a.tint, b.tint, p.tintFuseLoss, a.tintFusions + b.tintFusions === 0 ? p.tintMin : 0, p.tintMax),
    });
    a.tintFusions = a.tint ? a.tintFusions + b.tintFusions + 1 : 0; // faded out: the next fusion counts as a first one again
    w.objects = w.objects.filter((x) => x !== b);
    w.pairs.splice(w.pairs.indexOf(pair), 1);
    log(w, "verschmelzung", `${a.id} und ${b.id} verschmelzen: ${before} → ${a.triangles} Dreiecke (${a.fusions}. Verschmelzung)`, a.id);
  }

  const copying = keimPhase || w.jobs.some((j) => j.kind === "copy") || w.objects.some((o) => o.state === "keimling" && !o.origin);
  if (w.phase === "wachstum" && total >= w.compressAt) { w.phase = "plateau"; w.plateauSince = w.eigen; log(w, "phase", "Plateau erreicht"); }
  if ((w.phase === "wachstum" || w.phase === "plateau") && !copying) {
    w.phase = "abstieg";
    w.nextDescentCompressAt = w.eigen + p.descentCompressEveryDays;
    log(w, "phase", `Keimlingsphase vorbei: Abstieg beginnt (Höchststand ${w.plateauMax} Dreiecke)`);
  }

  // Intensified compression: accumulating time account above the threshold.
  if (total >= w.compressAt) w.compressAccount += dt;
  if (w.compressAccount >= w.compressSpan) {
    const o = largest(w, (x) => x.grow >= 1);
    if (o) {
      request(w, { kind: "compress", objectId: o.id, keep: p.compressKeep });
      log(w, "komprimierung", `Verstärkte Komprimierung: ${o.id} (${o.triangles} Dreiecke)`, o.id);
    }
    w.compressAccount = 0;
    w.compressSpan = rng.vary(p.compressSpanDays, p.compressVariance);
  }

  // Decay: from the moment only wilting objects exist, compression gets more
  // frequent and stronger.
  if (w.phase === "abstieg" && !w.pairs.length) {
    const alive = living(w);
    if (alive.length && alive.every((o) => o.state === "verwelkend")) {
      w.phase = "verfall";
      w.nextDescentCompressAt = Math.min(w.nextDescentCompressAt, w.eigen + p.decayCompressEveryDays);
      log(w, "phase", `Nur noch verwelkende Objekte (${alive.length}): Verfall, Komprimierung verstärkt`);
    }
  }

  if (w.phase === "abstieg" || w.phase === "verfall") {
    const decay = w.phase === "verfall";
    // Steady compression of one random object.
    if (w.eigen >= w.nextDescentCompressAt) {
      const pool = living(w).filter((o) => !o.busy && o.triangles > p.deathTriangles && o.id !== w.halvingChain);
      if (pool.length) {
        const o = pool[Math.floor(rng.next() * pool.length)];
        request(w, { kind: "compress", objectId: o.id, keep: decay ? p.decayCompressKeep : p.descentCompressKeep });
      }
      w.nextDescentCompressAt = w.eigen + (decay ? p.decayCompressEveryDays : p.descentCompressEveryDays);
    }
    // Halving once the count has dropped from the plateau.
    if (w.nextHalvingAt === null && total <= w.halvingAt) {
      w.nextHalvingAt = w.eigen; w.halvingSince = w.eigen;
      log(w, "phase", `Polygonzahl unter ${w.halvingAt} Dreiecken: Halbieren beginnt`);
    }
    if (w.nextHalvingAt !== null && w.eigen >= w.nextHalvingAt) {
      // every step at least once: one piece is halved again and again (down to
      // thirds) until requiredHalvings; otherwise the largest object
      const chain = w.halvingChain && w.halvingChain !== "fertig" ? w.objects.find((x) => x.id === w.halvingChain && x.state !== "tot") : undefined;
      const o = chain && !chain.busy && chain.halvings < p.requiredHalvings && chain.triangles >= 24
        ? chain
        : largest(w, (x) => x.triangles >= p.minTrianglesToHalve && x.id !== w.champion, (x) => (x.fast ? p.pioneerHalvingAffinity : 1));
      if (o) {
        const hr = halvingRecipe(o);
        if (w.halvingChain !== "fertig" && !chain) w.halvingChain = o.id; // a new chain only until one has run through
        request(w, { kind: "split", objectId: o.id, recipe: hr.step, halving: hr, seed: Math.floor(rng.next() * 1e6), apart: rng.range(0, Math.PI * 2) });
        log(w, "halbierung", `Halbierung: ${o.id} (${o.triangles} Dreiecke, ${STEP_LABEL[hr.step]})`, o.id);
      }
      // the rate rises gradually from the first halving on
      w.nextHalvingAt = w.eigen + rng.vary(p.halvingEveryDays, p.halvingVariance) / (1 + p.halvingRateRisePerDay * (w.eigen - (w.halvingSince ?? w.eigen)));
    }
    // Too small to halve: wilting without halving.
    for (const o of w.objects) {
      if (o.state === "aktiv" && !o.origin && !o.busy && o.id !== w.champion && o.triangles < p.minTrianglesToHalve && rng.chance(p.smallWiltPerDay, dt)) {
        o.state = "verwelkend"; o.nextCrushAt = w.eigen + p.crushEveryDays;
        log(w, "verwelken", `${o.id} zu klein zum Halbieren, verwelkt`, o.id);
      }
    }
  }

  // Fused, active objects not reserved for another fusion grow slowly, up to
  // fusedGrowMax × their size after the fusion. Over the height limit they sink
  // to make up for it (at most maxSink of their height); no further than that,
  // and never wider than maxWidth.
  for (const o of w.objects) {
    if (o.growBase === null || o.state !== "aktiv" || o.origin || o.pairedWith || o.pose) continue;
    const goal = o.growBase * p.fusedGrowMax;
    if (o.scale >= goal) continue;
    const before = { scale: o.scale, lift: o.lift };
    o.scale = Math.min(goal, o.scale + o.growBase * p.fusedGrowPerDay * dt);
    const h = objectHeight(o);
    if (o.lift + h > p.maxTop) o.lift = p.maxTop - h; // sinks to stay under the height limit
    if (o.lift < Math.min(before.lift, -p.maxSink * h) || objectWidth(o) > p.maxWidth) { o.scale = before.scale; o.lift = before.lift; o.growBase = o.scale / p.fusedGrowMax; } // no room: stops growing
  }

  // Descent: everything not on its way to a fusion drifts slowly towards the
  // planting point, and the two halves of a halving push each other away —
  // both added up (resting drawings move along). Decay: no more drift, the
  // halves push apart more strongly, and wilting objects shrink slowly.
  if (w.phase === "abstieg" || w.phase === "verfall") {
    const decay = w.phase === "verfall";
    for (const o of w.objects) {
      if (o.origin || o.state === "tot" || o.pairedWith || o.pose) continue;
      let mx = 0, mz = 0;
      const dx = w.plantingPoint[0] - o.pos[0], dz = w.plantingPoint[2] - o.pos[2], d = Math.hypot(dx, dz);
      const room = d - (p.gatherStop + objectWidth(o) / 2);
      if (!decay && room > 0) {
        const move = Math.min(room, p.gatherPerDay * Math.min(1, room) * dt);
        mx += (dx / d) * move; mz += (dz / d) * move;
      }
      const sib = o.sibling ? w.objects.find((x) => x.id === o.sibling && x.state !== "tot") : undefined;
      if (sib) {
        const sx = o.pos[0] - sib.pos[0], sz = o.pos[2] - sib.pos[2], sd = Math.hypot(sx, sz);
        const push = p.halvingRepelPerDay * (decay ? p.decayRepelFactor : 1) * Math.max(0, 1 - sd / p.halvingRepelRange) * dt;
        if (push > 0) {
          const ux = sd > 1e-6 ? sx / sd : Math.cos(o.rotY), uz = sd > 1e-6 ? sz / sd : Math.sin(o.rotY);
          mx += ux * push; mz += uz * push;
        }
      }
      if (mx || mz) {
        o.pos = [o.pos[0] + mx, o.pos[1], o.pos[2] + mz];
        for (const dr of w.drawings) if (dr.mode === "ruhend" && dr.target === o.id) dr.pos = [dr.pos[0] + mx, dr.pos[1], dr.pos[2] + mz];
      }
      if (decay && o.state === "verwelkend") { // shrinks about its underside, down to decayShrinkMin
        o.shrinkBase ??= o.scale;
        o.scale = Math.max(o.shrinkBase * p.decayShrinkMin, o.scale - o.shrinkBase * p.decayShrinkPerDay * dt);
      }
    }
  }

  // An object that can get smaller neither by compression nor by halving dies.
  for (const o of w.objects) {
    if (!o.stuck || o.state === "tot" || o.busy || o.pairedWith || o.id === w.champion) continue;
    if (o.id === w.halvingChain && o.halvings < p.requiredHalvings) continue; // the chain's piece can still be halved
    o.state = "tot"; o.deadSince = w.eigen;
    log(w, "tod", `${o.id} stirbt: lässt sich weder komprimieren noch halbieren (${o.triangles} Dreiecke)`, o.id);
  }
  // Wilting: texture crush, death, removal.
  for (const o of w.objects) {
    if (o.state === "verwelkend" && !o.busy) {
      const chainRunning = o.id === w.halvingChain && o.halvings < p.requiredHalvings; // the halving chain's piece lives on until its last halving
      if (o.triangles <= p.deathTriangles && !chainRunning) {
        o.state = "tot"; o.deadSince = w.eigen;
        log(w, "tod", `${o.id} stirbt (${o.triangles} Dreiecke)`, o.id);
      } else if (o.crushLevel < p.maxCrushLevel && w.eigen >= o.nextCrushAt) {
        request(w, { kind: "crush", objectId: o.id, level: o.crushLevel + 1, recipe: "p9" });
        o.nextCrushAt = w.eigen + p.crushEveryDays;
      }
    }
  }
  // Origin objects mirror the active ecosystem: compressed in the same ratio
  // as its count falls below the peak, texture crush in the decay, death
  // together with its last object.
  if (w.phase === "abstieg" || w.phase === "verfall") {
    const ratio = w.plateauMax > 0 ? Math.min(1, totalTriangles(w) / w.plateauMax) : 1;
    for (const o of w.objects) {
      if (!o.origin || o.busy || o.state === "tot") continue;
      const goal = Math.max(1, Math.floor(o.originalTriangles * ratio));
      if (goal < o.triangles * 0.9) request(w, { kind: "compress", objectId: o.id, keep: goal / o.triangles });
      else if (w.phase === "verfall" && o.crushLevel < p.maxCrushLevel && w.eigen >= o.nextCrushAt) {
        request(w, { kind: "crush", objectId: o.id, level: o.crushLevel + 1, recipe: "p9" });
        o.nextCrushAt = w.eigen + p.crushEveryDays;
      }
    }
    if (!living(w).length && !w.pairs.length) {
      for (const o of w.objects) {
        if (o.origin && o.state !== "tot" && !o.busy) {
          o.state = "tot"; o.deadSince = w.eigen;
          log(w, "tod", `Ursprungsobjekt ${o.id} (${o.lineage}) stirbt mit dem Ökosystem`, o.id);
        }
      }
    }
  }

  const removed = w.objects.filter((o) => o.state === "tot" && o.deadSince !== null && w.eigen - o.deadSince >= p.lingerDays);
  if (removed.length) w.objects = w.objects.filter((o) => !removed.includes(o));
  if ((w.phase === "abstieg" || w.phase === "verfall") && !w.objects.length && !w.jobs.length && !w.pairs.length) { w.phase = "ende"; log(w, "phase", "Das Ökosystem ist vergangen"); }

  // Photos: taken after the (calendar) waiting time, by chance.
  const center = ecosystemCenter(w);
  for (const ph of w.photos) {
    if (ph.gone || w.calendar - ph.createdAt < p.photoWaitDays) continue;
    if (dist2d(ph.pos, center) > p.feedRadius) continue;
    if (w.objects.some((o) => o.photo?.photoId === ph.id)) continue; // one object per photo
    if (!rng.chance(p.photoTakePerDay, dt)) continue;
    const candidates = w.objects.filter((o) => o.state === "aktiv" && !o.origin && !o.busy && !o.photo && o.id !== w.champion);
    const o = nearest(candidates, ph.pos);
    if (!o) continue;
    o.photo = { photoId: ph.id, since: w.eigen, halvedSince: false };
    o.state = "verwelkend";
    o.nextCrushAt = w.eigen + p.crushEveryDays;
    log(w, "foto-uebernahme", `${o.id} übernimmt Foto ${ph.id} und verwelkt`, o.id);
  }

  // Drawings: attracted by the nearest object in reach, rest at a small overlap.
  for (const d of w.drawings) {
    if (d.gone || d.mode === "ruhend") continue;
    const candidates = w.objects.filter((o) => o.state !== "tot" && !o.origin && o.grow >= 1);
    if (d.mode === "frei") {
      const inReach = candidates.filter((o) => dist2d(d.pos, objectCenter(o)) <= objectRadius(o, p));
      const o = nearest(inReach, d.pos);
      if (o && rng.chance(p.drawingAttractPerDay, dt)) {
        d.mode = "angezogen"; d.target = o.id; d.startDist = dist3d(drawingCenter(d), objectCenter(o)); d.travelled = 0;
        log(w, "anziehung", `Zeichnung ${d.id} wird von ${o.id} angezogen`, o.id);
      }
      continue;
    }
    let t = candidates.find((o) => o.id === d.target);
    if (!t) { // the attractor is gone: the nearest object takes over
      t = nearest(candidates, d.pos) ?? undefined;
      if (!t) { d.mode = "frei"; d.target = null; continue; }
      d.target = t.id; d.startDist = d.travelled + dist3d(drawingCenter(d), objectCenter(t));
    }
    // Move the drawing's own centre towards the object's centre (in 3D), in
    // small increments so it stops right where the overlap goal is reached.
    const c = objectCenter(t);
    let budget = p.drawingSpeed * dt, arrived = false;
    while (budget > 0) {
      const dc = drawingCenter(d);
      const dx = c[0] - dc[0], dy = c[1] - dc[1], dz = c[2] - dc[2], len = Math.hypot(dx, dy, dz);
      if (len < 0.05) { arrived = true; break; }
      const move = Math.min(budget, len, 0.02);
      d.pos = [d.pos[0] + (dx / len) * move, d.pos[1] + (dy / len) * move, d.pos[2] + (dz / len) * move];
      d.travelled += move; budget -= move;
      const progress = d.startDist > 0 ? Math.min(1, d.travelled / d.startDist) : 1;
      d.scale = Math.min(d.scale, 1 - (1 - p.drawingMinScale) * progress); // only ever shrinks
      d.overlap = overlapOf(d, t);
      if (d.overlap >= d.overlapGoal) break;
    }
    if (d.overlap >= d.overlapGoal || arrived) {
      d.mode = "ruhend";
      d.texture = { glb: t.glb, fromObject: t.id }; // own texture only, never the photo
      log(w, "zeichnung-ruht", `Zeichnung ${d.id} ruht (Überschneidung ${(d.overlap * 100).toFixed(1)} %), erbt Textur von ${t.id}`, t.id);
    }
  }

  if (w.eigen >= w.nextSampleAt) sample(w);
  w.rngState = rng.state();
  return w.jobs.slice(before);
}

/** Fully saturated, fully bright colour of hue h (0…1). */
function pureColor(h: number): Vec3 {
  const k = (n: number) => (n + h * 6) % 6;
  const f = (n: number) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5), f(3), f(1)];
}

/** Hue (0…1) of a colour. */
function hueOf(c: Vec3): number {
  const [r, g, b] = c, max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (d <= 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h / 6) % 1 + 1) % 1;
}

/** Fusion: the hues are mixed on the colour wheel, weighted by strength, and the
 *  result stays a pure colour (mixing RGB would pale it towards white and make it
 *  brighter at the same strength); strength = mean − loss, at least min, at most max. */
function mixTint(a: PlantObject["tint"], b: PlantObject["tint"], loss: number, min: number, max: number): PlantObject["tint"] {
  const wa = a?.strength ?? 0, wb = b?.strength ?? 0;
  if (wa + wb <= 0) return null;
  let x = 0, y = 0;
  for (const [t, wt] of [[a, wa], [b, wb]] as const) {
    if (!t || wt <= 0) continue;
    const h = hueOf(t.color) * Math.PI * 2;
    x += Math.cos(h) * wt; y += Math.sin(h) * wt;
  }
  // opposite hues of equal strength cancel out: then the stronger (or first) one's hue wins
  const hue = Math.hypot(x, y) > 1e-6 * (wa + wb) ? ((Math.atan2(y, x) / (Math.PI * 2)) % 1 + 1) % 1 : hueOf((wb > wa ? b : a ?? b)!.color);
  const strength = Math.min(max, Math.max(min, (wa + wb) / 2 - loss));
  return strength > 0 ? { color: pureColor(hue), strength } : null;
}

/** Time factor from the boosts now (also right after a command: devices, photos, drawings). */
export function updateFactor(w: World) {
  const p = w.params;
  const center = ecosystemCenter(w);
  const items =
    w.photos.filter((x) => !x.gone && dist2d(x.pos, center) <= p.feedRadius).length +
    w.drawings.filter((x) => !x.gone && dist2d(x.pos, center) <= p.feedRadius).length;
  // right after planting, photos and drawings speed the plant up more
  const early = 1 + (p.earlyContentFactor - 1) * earlyShare(w, p.earlyContentHours);
  const inhalt = Math.min(items, p.contentBoostMaxItems) * p.contentBoostPerItem * early;
  let ereignisse = 0;
  for (const b of w.boosts) ereignisse += b.strength * Math.max(0, (b.until - w.calendar) / (b.until - b.start)) * early;
  const hinschauen = Math.min(w.viewers, p.viewerMaxDevices) * p.viewerBoost;
  w.factorParts = { inhalt, ereignisse, hinschauen };
  // photos and drawings have their own cap, devices never take from it
  w.factor = 1 + Math.min(p.contentMaxBoost, inhalt + ereignisse) + hinschauen;
  // the fast line, always: up to pioneerContentMaxItems photos and drawings count, events
  // fastEventFactor times, within its own higher cap; right after planting the cap is higher
  // still and all its boosts count pioneerBoostFactor times, both fading back with the other
  // extra boosts of the first half hour
  const share = earlyShare(w, p.pioneerBoostHours);
  const inhaltFast = Math.min(items, p.pioneerContentMaxItems) * p.contentBoostPerItem * early;
  const capFast = p.fastContentMaxBoost + (p.pioneerEarlyContentMax - p.fastContentMaxBoost) * share;
  const contentFast = Math.min(capFast, inhaltFast + ereignisse * p.fastEventFactor);
  w.pioneerFactor = 1 + (1 + (p.pioneerBoostFactor - 1) * share) * (contentFast + hinschauen);
}

/** How much of an extra boost of the first hours after planting is left: 1 until
 *  earlyFadeFromHours, then falling linearly to 0 at `hours` (calendar time). */
function earlyShare(w: World, hours: number): number {
  const h = w.calendar * 24, from = Math.min(w.params.earlyFadeFromHours, hours);
  if (h >= hours) return 0;
  if (h <= from) return 1;
  return (hours - h) / (hours - from);
}

/** A new photo or drawing in the feed radius speeds the ecosystem up the moment it is made. */
function boost(w: World, kind: "foto" | "zeichnung", pos: Vec3) {
  const p = w.params;
  if (w.phase === "ende" || dist2d(pos, ecosystemCenter(w)) > p.feedRadius) return;
  w.boosts.push({ kind, strength: p.eventBoost, start: w.calendar, until: w.calendar + p.eventBoostDays });
}

function pendingCopyTriangles(w: World): number {
  let n = 0;
  for (const j of w.jobs) {
    if (j.kind !== "copy") continue;
    const o = w.objects.find((x) => x.id === j.objectId);
    if (o) n += Math.floor(o.triangles * (j.keep ?? 1));
  }
  return n;
}

/** The object with the most triangles (× weight, e.g. the fast line's halving affinity). */
function largest(w: World, filter: (o: PlantObject) => boolean, weight: (o: PlantObject) => number = () => 1): PlantObject | null {
  let best: PlantObject | null = null, bestScore = -Infinity;
  for (const o of w.objects) {
    if (o.state === "tot" || o.origin || o.busy || !filter(o)) continue;
    const score = o.triangles * weight(o);
    if (score > bestScore) { best = o; bestScore = score; }
  }
  return best;
}

/** Footprint on the ground of an object fully grown: centre offset from pos and half extents (x, z). */
function footprint(o: PlantObject) {
  const grow = o.grow; o.grow = 1;
  const b = worldBounds(o); o.grow = grow;
  return { ox: (b.min[0] + b.max[0]) / 2 - o.pos[0], oz: (b.min[2] + b.max[2]) / 2 - o.pos[2], hx: (b.max[0] - b.min[0]) / 2, hz: (b.max[2] - b.min[2]) / 2 };
}

type Footprint = ReturnType<typeof footprint> & { x: number; z: number };
const placed = (o: PlantObject): Footprint => { const f = footprint(o); return { ...f, x: o.pos[0] + f.ox, z: o.pos[2] + f.oz }; };
/** Gap between two footprints (0 when they touch or overlap). */
const gapOf = (a: Footprint, b: Footprint) =>
  Math.hypot(Math.max(0, Math.abs(a.x - b.x) - a.hx - b.hx), Math.max(0, Math.abs(a.z - b.z) - a.hz - b.hz));
const overlaps = (a: Footprint, b: Footprint) => Math.abs(a.x - b.x) < a.hx + b.hx && Math.abs(a.z - b.z) < a.hz + b.hz;

/** A Vorläufer stands close to the others (footprints at most pioneerGap apart, not
 *  overlapping) and at least pioneerOriginGap away from every origin object. The
 *  first one stands as near to the planting point as allows room for the group
 *  around it (the origin objects stand in a ring, its middle is too small). */
function placePioneer(w: World, child: PlantObject, rng: Rng) {
  const p = w.params;
  const f = footprint(child);
  const at = (x: number, z: number): Footprint => ({ ...f, x, z });
  const origins = w.objects.filter((o) => o.origin && o.state !== "tot").map(placed);
  const others = w.objects.filter((o) => o.fast && o !== child && o.state !== "tot" && !o.pose).map(placed);
  const clearOfOrigins = (c: Footprint, room = 0) => origins.every((g) => gapOf(c, g) >= p.pioneerOriginGap + room);
  let best: Footprint | null = null, bestD = Infinity;
  if (!others.length) {
    const room = p.originMaxSize + p.pioneerGap; // a neighbour fits between it and the origin objects
    for (let r = 0; r <= 10 && !best; r += 0.05) {
      const start = rng.range(0, Math.PI * 2), n = Math.max(1, Math.ceil((r * Math.PI * 2) / 0.1));
      for (let k = 0; k < n; k++) {
        const a = start + (k / n) * Math.PI * 2, c = at(w.plantingPoint[0] + Math.cos(a) * r, w.plantingPoint[2] + Math.sin(a) * r);
        if (clearOfOrigins(c, room)) { best = c; break; }
      }
    }
  } else {
    // around the others: right next to one of them in a random direction, plus a random gap;
    // of the fitting places the one nearest to the group's middle
    const mx = others.reduce((n, o) => n + o.x, 0) / others.length, mz = others.reduce((n, o) => n + o.z, 0) / others.length;
    // if nothing fits, the gap to the group may grow (never the one to the origin objects)
    for (let maxGap = p.pioneerGap; !best && maxGap <= 4; maxGap *= 2) {
      for (let t = 0; t < 400; t++) {
        const o = others[Math.floor(rng.next() * others.length)], a = rng.range(0, Math.PI * 2), ux = Math.cos(a), uz = Math.sin(a);
        let r = 0;
        while (overlaps(at(o.x + ux * r, o.z + uz * r), o) && r < 10) r += 0.01;
        r += rng.range(0, maxGap);
        const c = at(o.x + ux * r, o.z + uz * r);
        if (others.some((q) => overlaps(c, q)) || !clearOfOrigins(c)) continue;
        if (Math.min(...others.map((q) => gapOf(c, q))) > maxGap) continue;
        const d = Math.hypot(c.x - mx, c.z - mz);
        if (d < bestD) { best = c; bestD = d; }
      }
    }
  }
  if (best) child.pos = [best.x - f.ox, 0, best.z - f.oz];
}

function nearest(objs: PlantObject[], pos: Vec3): PlantObject | null {
  let best: PlantObject | null = null, bd = Infinity;
  for (const o of objs) { const d = dist2d(pos, objectCenter(o)); if (d < bd) { bd = d; best = o; } }
  return best;
}

export function drawingCenter(d: Drawing): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const q of d.points) { x += q[0]; y += q[1]; z += q[2]; }
  const n = Math.max(1, d.points.length);
  return [d.pos[0] + (x / n) * d.scale, d.pos[1] + (y / n) * d.scale, d.pos[2] + (z / n) * d.scale];
}

/** Share of the drawing's points inside the object's bounding box. */
export function overlapOf(d: Drawing, o: PlantObject): number {
  const b = worldBounds(o);
  let inside = 0;
  for (const q of d.points) {
    const x = d.pos[0] + q[0] * d.scale, y = d.pos[1] + q[1] * d.scale, z = d.pos[2] + q[2] * d.scale;
    if (x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2]) inside++;
  }
  return d.points.length ? inside / d.points.length : 0;
}

// ---------------------------------------------------------------- job results

/** A pair's journey from the pose of B inside the fused model (bMatrix) and the fused model's
 *  bounds (`fused`, estimated from the pose or the real ones): A rises with the fusion (more
 *  when the result has few triangles) and is fitted under the height limit; B travels into
 *  its place in A's final model frame. */
function startJourney(w: World, pair: World["pairs"][number], o: PlantObject, partner: PlantObject, fused: ModelVersion, bMatrix: number[] | undefined, triangles: number) {
  const p = w.params, rng = createRng(w.rngState);
  const after: PlantObject = { ...o, glb: fused.glb, triangles, min: fused.min, max: fused.max, pose: null };
  after.lift = o.lift + (fused.min[1] - o.min[1]) * o.scale;
  const mult = Math.min(p.riseMaxMult, Math.max(1, p.riseLowPolyRef / Math.max(1, triangles)));
  after.lift += rng.vary(p.riseStep, p.riseVariance) * mult;
  fitSize(after, p);
  w.rngState = rng.state();
  pair.aFrom = decompose(modelMatrix(o));
  pair.aTo = decompose(modelMatrix(after));
  pair.aLift = after.lift; pair.aScale = after.scale;
  pair.from = decompose(modelMatrix(partner));
  pair.to = bMatrix ? decompose(multiply(modelMatrix(after), bMatrix)) : pair.from;
  pair.start = w.eigen;
}

export function applyJob(w: World, result: JobResult) {
  const idx = w.jobs.findIndex((j) => j.id === result.jobId);
  if (idx < 0) return;
  const job = w.jobs[idx];
  w.jobs.splice(idx, 1);
  const o = w.objects.find((x) => x.id === job.objectId);
  if (!o) return;
  o.busy = false;
  if (job.recipe && job.recipe !== "copy" && job.recipe !== "reduce") w.stepsSeen[job.recipe] = (w.stepsSeen[job.recipe] ?? 0) + 1;
  const [a, b] = result.outputs;
  if (job.kind === "pose" || job.kind === "fuse") {
    const pair = w.pairs.find((x) => (job.kind === "pose" ? x.poseJobId : x.jobId) === job.id);
    const partner = w.objects.find((x) => x.id === job.partnerId);
    if (pair && partner) {
      // the pose (or, should it be missing, the fused model) fixes where both go: the journey starts
      if (pair.start === null) startJourney(w, pair, o, partner, a, result.bMatrix, pair.expectedTriangles);
      if (job.kind === "fuse") pair.result = a; // swapped on arrival
    }
    o.busy = true; // the pair stays busy until the swap
    return;
  }
  if (job.kind === "copy" && job.spawn) {
    const rng = createRng(w.rngState);
    const p = w.params;
    const child = newObject(w, rng, a, o.lineage, o.id, job.generation ?? o.generation + 1, job.spawn.pos, job.spawn.rotY);
    child.voxelCells = job.voxelCells ?? null;
    // size: the origin's, varied a little and larger with every generation, within the
    // origin range widened by the slack (upwards more for every further generation)
    const origin = w.objects.find((x) => x.origin && x.lineage === o.lineage);
    const gen = child.generation;
    // growth per generation; after the first voxel generation the cubes would grow too
    // fast, so from there on every new generation grows by half the previous step
    // (the upper limit follows the same curve: its step per generation halves likewise)
    let grow = 1, slack = p.keimSizeSlack;
    for (let k = 1; k <= gen; k++) {
      const half = k >= p.keimGrowStopGeneration ? 0 : Math.pow(0.5, Math.max(0, k - p.voxelFromGeneration));
      grow *= 1 + p.keimGrowPerGeneration * half;
      if (k >= 2) slack += p.keimSizeSlackPerGeneration * half;
    }
    let size = (origin ? objectSize(origin) : objectSize(o)) * grow * rng.vary(1, p.keimSizeVariance);
    size = Math.min(p.originMaxSize + slack, Math.max(p.originMinSize - p.keimSizeSlack, size));
    child.scale = 1;
    child.scale = size / Math.max(1e-6, objectSize(child));
    // a random pure colour, stronger with every generation
    child.tint = { color: pureColor(rng.next()), strength: Math.min(p.tintMax, Math.max(0, p.tintStart + p.tintPerGeneration * (gen - 1))) };
    // later generations lean more and more
    const maxTilt = (p.keimTiltPerGeneration * Math.max(0, gen - 1) * Math.PI) / 180;
    if (maxTilt > 0) child.tilt = { angle: rng.range(0, maxTilt), dir: rng.range(0, Math.PI * 2) };
    fitSize(child, p); // copies keep within the size limits too (origin objects keep their size)
    if (job.pioneer) { child.fast = true; placePioneer(w, child, rng); }
    w.rngState = rng.state();
    w.objects.push(child);
    log(w, "kopie", `${o.id} kopiert sich: ${child.id}, Generation ${child.generation}${child.generation === o.generation ? " (gleiche Generation)" : ""}${child.voxelCells ? `, voxelisiert mit ${child.voxelCells} Zellen` : ""} (${child.triangles} Dreiecke)`, child.id);
  } else if (job.kind === "compress" || job.kind === "crush") {
    const p = w.params;
    // in the descent: too small to halve and the compression hardly took anything away — it cannot get smaller
    if (job.kind === "compress" && !o.origin && (w.phase === "abstieg" || w.phase === "verfall") && o.triangles < p.minTrianglesToHalve && a.triangles > o.triangles * p.stuckKeep) o.stuck = true;
    Object.assign(o, { glb: a.glb, triangles: a.triangles, min: a.min, max: a.max });
    if (job.kind === "crush") o.crushLevel = job.level ?? o.crushLevel + 1;
  } else if (job.kind === "split" && b) {
    const ang = job.apart ?? 0, push = 0.15;
    const half = (m: typeof a, sign: number): Partial<PlantObject> => ({
      glb: m.glb, triangles: m.triangles, min: m.min, max: m.max,
      pos: [o.pos[0] + Math.cos(ang) * push * sign, o.pos[1], o.pos[2] + Math.sin(ang) * push * sign],
    });
    const rng = createRng(w.rngState);
    const twin = newObject(w, rng, b, o.lineage, o.id, o.generation, o.pos, o.rotY);
    const p = w.params;
    Object.assign(twin, half(b, -1), {
      scale: o.scale, lift: o.lift + (b.min[1] - o.min[1]) * o.scale + rng.vary(p.halvingRise, p.riseVariance),
      grow: 1, tilt: o.tilt, tint: o.tint, tintFusions: o.tintFusions, fast: o.fast, shrinkBase: o.shrinkBase, sibling: o.id, state: "verwelkend", crushLevel: o.crushLevel, fusions: o.fusions, halvings: o.halvings + 1, nextCrushAt: w.eigen + w.params.crushEveryDays,
      photo: o.photo ? { ...o.photo, halvedSince: true } : null,
    });
    const liftA = o.lift + (a.min[1] - o.min[1]) * o.scale; // keeps its place inside the model
    Object.assign(o, half(a, 1), { halvings: o.halvings + 1, sibling: twin.id, state: "verwelkend", nextCrushAt: w.eigen + w.params.crushEveryDays });
    if (job.halving?.crush) { o.crushLevel++; twin.crushLevel++; } // Phase 13: the halves' textures are crushed
    if (w.halvingChain === o.id && o.halvings >= w.params.requiredHalvings) w.halvingChain = "fertig";
    o.lift = liftA + rng.vary(p.halvingRise, p.riseVariance); // splinters float
    w.rngState = rng.state();
    fitSize(o, p); fitSize(twin, p);
    if (o.photo) o.photo.halvedSince = true;
    w.objects.push(twin);
  }
}
