// The simulation core: rules applied per time step. No files, no network, no
// rendering — geometry work goes out as JobRequests and comes back through
// applyJob(), so the same core runs with real .glb jobs (sandbox server) and
// with plain numbers (lifecycle page). Rules: see the sandbox doc.
import type { Params } from "../params";
import { createRng, type Rng } from "./rng";
import type {
  Drawing, JobRequest, JobResult, ModelVersion, ObjectKind, ObjectState, Photo, PlantObject, Scenario, ScheduledEntry, Vec3, World,
} from "./types";

const SAMPLE_EVERY = 0.05; // Eigentage between two samples of the curve

// ---------------------------------------------------------------- geometry

/** Height of the object as it stands (model height × scale). */
export const objectHeight = (o: PlantObject) => (o.max[1] - o.min[1]) * o.scale;

/** World bounds: footprint around pos, underside at `lift` (a Keimling still
 *  rising out of the ground sits lower by the part not yet grown). */
export function worldBounds(o: PlantObject): { min: Vec3; max: Vec3 } {
  const c = Math.cos(o.rotY), s = Math.sin(o.rotY), k = o.scale;
  const height = objectHeight(o);
  const base = o.lift - height * (1 - o.grow);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const x of [o.min[0] * k, o.max[0] * k]) {
    for (const z of [o.min[2] * k, o.max[2] * k]) {
      const wx = x * c + z * s, wz = -x * s + z * c;
      x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
    }
  }
  return {
    min: [o.pos[0] + x0, base, o.pos[2] + z0],
    max: [o.pos[0] + x1, base + height, o.pos[2] + z1],
  };
}

/** Keep the top edge under maxTop: sink up to maxSink of the height, shrink beyond that. */
function fitHeight(o: PlantObject, p: Params) {
  let h = objectHeight(o);
  if (o.lift + h <= p.maxTop) return;
  const minLift = -p.maxSink * h;
  if (p.maxTop - h >= minLift) { o.lift = p.maxTop - h; return; }
  // too tall even when sunk in: shrink so that it fits with the full sink
  o.scale *= p.maxTop / (h * (1 - p.maxSink));
  h = objectHeight(o);
  o.lift = -p.maxSink * h;
}

/** Sway amplitude (m) of an object with few triangles. */
export function swayOf(o: PlantObject, p: Params): number {
  return o.triangles < p.swayBelowTriangles ? p.swayAmplitude * (1 - o.triangles / p.swayBelowTriangles) : 0;
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
    plateauMax: 0,
    phase: "wachstum",
    compressAccount: 0,
    compressSpan: rng.vary(params.compressSpanDays, params.compressVariance),
    nextDescentCompressAt: 0,
    nextHalvingAt: null,
    jobs: [],
    pairs: [],
    nextJobId: 1,
    nextId: 1,
    events: [],
    samples: [],
    nextSampleAt: 0,
    scheduled: [...scenario.timeline].sort((a, b) => a.at - b.at),
    factor: 1,
    factorParts: { inhalt: 0, ereignisse: 0, hinschauen: 0 },
  };
  let px = 0, pz = 0;
  for (const s of scenario.starters) {
    const pos: Vec3 = [s.pos[0], 0, s.pos[2]]; // standing on the ground (lift 0)
    const o = newObject(w, rng, { ...s.model }, s.name, null, 0, pos, s.rotY ?? rng.range(0, Math.PI * 2));
    o.origin = true;
    const h = s.model.max[1] - s.model.min[1];
    if (h > 0) o.scale = Math.min(params.originMaxHeight, Math.max(params.originMinHeight, h)) / h;
    o.grow = 1; // planted objects stand from the start, no growing time before their first copy
    o.nextCopyAt = rng.vary(params.copyEveryDays, params.copyVariance);
    w.objects.push(o);
    px += s.pos[0]; pz += s.pos[2];
  }
  const n = Math.max(1, scenario.starters.length);
  w.plantingPoint = [px / n, 0, pz / n]; // never changes again
  w.rngState = rng.state();
  log(w, "start", `${scenario.starters.length} Objekte gepflanzt (${totalTriangles(w)} Dreiecke)`);
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
    copiesLeft: generation < p.maxGeneration ? p.copiesPerObject : 0,
    nextCopyAt: w.eigen + p.growDays + rng.vary(p.copyEveryDays, p.copyVariance),
    busy: false,
    photo: null,
    crushLevel: 0,
    nextCrushAt: 0,
    deadSince: null,
    pairedWith: null,
    fusions: 0,
    halvings: 0,
    origin: false,
    originalTriangles: model.triangles,
    scale: 1,
    lift: 0,
  };
}

function log(w: World, type: string, text: string, objectId?: string) {
  w.events.push({ eigen: w.eigen, calendar: w.calendar, type, text, objectId });
}

function sample(w: World) {
  const counts: Record<ObjectState, number> = { keimling: 0, aktiv: 0, verwelkend: 0, tot: 0 };
  const kinds: Record<ObjectKind, number> = { ursprung: 0, keimling: 0, unveraendert: 0, v1: 0, v2: 0, v3: 0, v4: 0, halbiert: 0 };
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
  return o.state === "keimling" ? "keimling" : "unveraendert";
}

function request(w: World, job: Omit<JobRequest, "id">): number {
  for (const id of [job.objectId, job.partnerId]) {
    const o = id ? w.objects.find((x) => x.id === id) : undefined;
    if (o) o.busy = true;
  }
  const id = w.nextJobId++;
  w.jobs.push({ ...job, id });
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

  // Keimlinge: rise, copy, end of the copy phase.
  for (const o of w.objects) {
    if (o.grow < 1) o.grow = Math.min(1, o.grow + dt / p.growDays);
    if (o.state !== "keimling" || o.grow < 1 || o.busy) continue;
    if (o.copiesLeft <= 0) { o.state = "aktiv"; log(w, "aktiv", `${o.id} (${o.lineage}) wird aktiv`, o.id); continue; }
    if (w.eigen < o.nextCopyAt) continue;
    const estimate = Math.floor(o.triangles * p.copyShrink);
    if (totalTriangles(w) + estimate + pendingCopyTriangles(w) > p.budget) continue; // only below the budget
    const angle = rng.range(0, Math.PI * 2);
    const r = p.spreadBase + p.spreadPerGeneration * (o.generation + 1) + rng.range(0, p.spreadJitter);
    request(w, { kind: "copy", objectId: o.id, keep: p.copyShrink, spawn: { pos: [o.pos[0] + Math.cos(angle) * r, 0, o.pos[2] + Math.sin(angle) * r], rotY: rng.range(0, Math.PI * 2) } });
    o.copiesLeft--;
    o.nextCopyAt = w.eigen + rng.vary(p.copyEveryDays, p.copyVariance);
  }

  // Fusion: a free object picks the nearest free partner in its radius, by
  // chance. The pair is reserved for good; the smaller one travels to the
  // larger one while the fused model is computed; swap once both are done.
  const canFuse = (o: PlantObject) =>
    o.grow >= 1 && !o.origin && !o.busy && !o.pairedWith && !o.photo && (o.state === "aktiv" || o.state === "keimling");
  for (const o of w.objects) {
    if (!canFuse(o) || !rng.chance(p.fusePerDay, dt)) continue;
    const reach = objectRadius(o, p);
    const q = nearest(w.objects.filter((x) => x !== o && canFuse(x) && dist2d(x.pos, o.pos) <= reach), o.pos);
    if (!q) continue;
    const [a, b] = o.triangles >= q.triangles ? [o, q] : [q, o];
    const ang = Math.atan2(b.pos[2] - a.pos[2], b.pos[0] - a.pos[0]);
    const gap = (footprint(a) + footprint(b)) * p.fuseGap;
    const keep = Math.max(p.fuseKeepMin, p.fuseKeepStart - p.fuseKeepStep * (a.fusions + b.fusions));
    const grow = p.fuseMatchHeight ? Math.min(p.maxGrowFactor, Math.max(1, objectHeight(a) / Math.max(1e-6, objectHeight(b)))) : 1;
    const jobId = request(w, { kind: "fuse", objectId: a.id, partnerId: b.id, keep, partnerScale: b.scale * grow });
    a.pairedWith = b.id; b.pairedWith = a.id;
    w.pairs.push({
      a: a.id, b: b.id, jobId, start: w.eigen, duration: rng.vary(p.fuseTravelDays, 0.2),
      from: [...b.pos], to: [a.pos[0] + Math.cos(ang) * gap, b.pos[1], a.pos[2] + Math.sin(ang) * gap], result: null,
    });
    log(w, "verschmelzung-paar", `${b.id} (${b.triangles}) wird von ${a.id} (${a.triangles}) angezogen, Paar steht fest`, a.id);
  }
  for (const pair of [...w.pairs]) {
    const a = w.objects.find((x) => x.id === pair.a), b = w.objects.find((x) => x.id === pair.b);
    if (!a || !b) { w.pairs.splice(w.pairs.indexOf(pair), 1); continue; }
    const t = Math.min(1, (w.eigen - pair.start) / pair.duration);
    const k = p.fuseEaseK, s = k > 0 ? (Math.exp(k * t) - 1) / (Math.exp(k) - 1) : t;
    b.pos = [pair.from[0] + (pair.to[0] - pair.from[0]) * s, pair.from[1], pair.from[2] + (pair.to[2] - pair.from[2]) * s];
    if (t < 1 || !pair.result) continue; // arrived but not computed yet: they wait overlapping
    const before = a.triangles + b.triangles;
    Object.assign(a, {
      glb: pair.result.glb, triangles: pair.result.triangles, min: pair.result.min, max: pair.result.max,
      fusions: a.fusions + b.fusions + 1, state: "aktiv", copiesLeft: 0, busy: false, pairedWith: null,
    });
    // rises with each fusion, more when the result has few triangles
    const mult = Math.min(p.riseMaxMult, Math.max(1, p.riseLowPolyRef / Math.max(1, a.triangles)));
    a.lift = Math.max(a.lift, b.lift) + rng.vary(p.riseStep, p.riseVariance) * mult;
    fitHeight(a, p);
    w.objects = w.objects.filter((x) => x !== b);
    w.pairs.splice(w.pairs.indexOf(pair), 1);
    log(w, "verschmelzung", `${a.id} und ${b.id} verschmelzen: ${before} → ${a.triangles} Dreiecke (${a.fusions}. Verschmelzung)`, a.id);
  }

  const copying = w.objects.some((o) => o.state === "keimling") || w.jobs.some((j) => j.kind === "copy");
  if (w.phase === "wachstum" && total >= p.compressThreshold * p.budget) { w.phase = "plateau"; log(w, "phase", "Plateau erreicht"); }
  if ((w.phase === "wachstum" || w.phase === "plateau") && !copying) {
    w.phase = "abstieg";
    w.nextDescentCompressAt = w.eigen + p.descentCompressEveryDays;
    log(w, "phase", `Keimlinge können sich nicht mehr vermehren: Abstieg beginnt (Höchststand ${w.plateauMax} Dreiecke)`);
  }

  // Intensified compression: accumulating time account above the threshold.
  if (total >= p.compressThreshold * p.budget) w.compressAccount += dt;
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
      const pool = living(w).filter((o) => !o.busy && o.triangles > p.deathTriangles);
      if (pool.length) {
        const o = pool[Math.floor(rng.next() * pool.length)];
        request(w, { kind: "compress", objectId: o.id, keep: decay ? p.decayCompressKeep : p.descentCompressKeep });
      }
      w.nextDescentCompressAt = w.eigen + (decay ? p.decayCompressEveryDays : p.descentCompressEveryDays);
    }
    // Halving once the count has dropped from the plateau.
    if (w.nextHalvingAt === null && total <= p.halvingThreshold * w.plateauMax) {
      w.nextHalvingAt = w.eigen;
      log(w, "phase", `Polygonzahl unter ${Math.round(p.halvingThreshold * 100)} % des Höchststands: Halbieren beginnt`);
    }
    if (w.nextHalvingAt !== null && w.eigen >= w.nextHalvingAt) {
      const o = largest(w, (x) => x.triangles >= p.minTrianglesToHalve);
      if (o) {
        request(w, { kind: "split", objectId: o.id, seed: Math.floor(rng.next() * 1e6), apart: rng.range(0, Math.PI * 2) });
        log(w, "halbierung", `Halbierung: ${o.id} (${o.triangles} Dreiecke)`, o.id);
      }
      w.nextHalvingAt = w.eigen + rng.vary(p.halvingEveryDays, p.halvingVariance);
    }
    // Too small to halve: wilting without halving.
    for (const o of w.objects) {
      if (o.state === "aktiv" && !o.origin && !o.busy && o.triangles < p.minTrianglesToHalve) {
        o.state = "verwelkend"; o.nextCrushAt = w.eigen + p.crushEveryDays;
        log(w, "verwelken", `${o.id} zu klein zum Halbieren, verwelkt`, o.id);
      }
    }
  }

  // Wilting: texture crush, death, removal.
  for (const o of w.objects) {
    if (o.state === "verwelkend" && !o.busy) {
      if (o.triangles <= p.deathTriangles) {
        o.state = "tot"; o.deadSince = w.eigen;
        log(w, "tod", `${o.id} stirbt (${o.triangles} Dreiecke)`, o.id);
      } else if (o.crushLevel < p.maxCrushLevel && w.eigen >= o.nextCrushAt) {
        request(w, { kind: "crush", objectId: o.id, level: o.crushLevel + 1 });
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
        request(w, { kind: "crush", objectId: o.id, level: o.crushLevel + 1 });
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
    const candidates = w.objects.filter((o) => o.state === "aktiv" && !o.origin && !o.busy && !o.photo);
    const o = nearest(candidates, ph.pos);
    if (!o) continue;
    o.photo = { photoId: ph.id, since: w.eigen, halvedSince: false };
    o.state = "verwelkend";
    o.nextCrushAt = w.eigen + p.crushEveryDays;
    boost(w, "foto");
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
      boost(w, "zeichnung");
      log(w, "zeichnung-ruht", `Zeichnung ${d.id} ruht (Überschneidung ${(d.overlap * 100).toFixed(1)} %), erbt Textur von ${t.id}`, t.id);
    }
  }

  if (w.eigen >= w.nextSampleAt) sample(w);
  w.rngState = rng.state();
  return w.jobs.slice(before);
}

function updateFactor(w: World) {
  const p = w.params;
  const center = ecosystemCenter(w);
  const items =
    w.photos.filter((x) => !x.gone && dist2d(x.pos, center) <= p.feedRadius).length +
    w.drawings.filter((x) => !x.gone && dist2d(x.pos, center) <= p.feedRadius).length;
  const inhalt = Math.min(items, p.contentBoostMaxItems) * p.contentBoostPerItem;
  let ereignisse = 0;
  for (const b of w.boosts) ereignisse += b.strength * Math.max(0, (b.until - w.calendar) / (b.until - b.start));
  const hinschauen = w.viewers * p.viewerBoost;
  w.factorParts = { inhalt, ereignisse, hinschauen };
  w.factor = Math.min(p.maxFactor, 1 + inhalt + ereignisse + hinschauen);
}

function boost(w: World, kind: "foto" | "zeichnung") {
  const p = w.params;
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

const footprint = (o: PlantObject) => Math.hypot(o.max[0] - o.min[0], o.max[2] - o.min[2]) / 2;

function largest(w: World, filter: (o: PlantObject) => boolean): PlantObject | null {
  let best: PlantObject | null = null;
  for (const o of w.objects) if (o.state !== "tot" && !o.origin && !o.busy && filter(o) && (!best || o.triangles > best.triangles)) best = o;
  return best;
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

export function applyJob(w: World, result: JobResult) {
  const idx = w.jobs.findIndex((j) => j.id === result.jobId);
  if (idx < 0) return;
  const job = w.jobs[idx];
  w.jobs.splice(idx, 1);
  const o = w.objects.find((x) => x.id === job.objectId);
  if (!o) return;
  o.busy = false;
  const [a, b] = result.outputs;
  if (job.kind === "fuse") {
    const pair = w.pairs.find((x) => x.jobId === job.id);
    if (pair) pair.result = a; // the pair stays busy until the swap
    o.busy = true;
    return;
  }
  if (job.kind === "copy" && job.spawn) {
    const rng = createRng(w.rngState);
    const child = newObject(w, rng, a, o.lineage, o.id, o.generation + 1, job.spawn.pos, job.spawn.rotY);
    child.scale = o.scale;
    fitHeight(child, w.params); // copies keep under the height limit too (origin objects keep their size)
    w.rngState = rng.state();
    w.objects.push(child);
    log(w, "kopie", `${o.id} kopiert sich: ${child.id}, Generation ${child.generation} (${child.triangles} Dreiecke)`, child.id);
  } else if (job.kind === "compress" || job.kind === "crush") {
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
      scale: o.scale, lift: o.lift + rng.vary(p.halvingRise, p.riseVariance),
      grow: 1, copiesLeft: 0, state: "verwelkend", crushLevel: o.crushLevel, fusions: o.fusions, halvings: o.halvings + 1, nextCrushAt: w.eigen + w.params.crushEveryDays,
      photo: o.photo ? { ...o.photo, halvedSince: true } : null,
    });
    Object.assign(o, half(a, 1), { halvings: o.halvings + 1, state: "verwelkend", nextCrushAt: w.eigen + w.params.crushEveryDays });
    o.lift += rng.vary(p.halvingRise, p.riseVariance); // splinters float
    w.rngState = rng.state();
    fitHeight(o, p); fitHeight(twin, p);
    if (o.photo) o.photo.halvedSince = true;
    w.objects.push(twin);
  }
}
