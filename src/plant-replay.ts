// A recorded run, played without a server: the recording (sandbox/replay-export.ts)
// holds per object its poses over calendar time (keys, blended linearly in
// between) and its look whenever it changed, per drawing its place, size and
// texture. The clock is the plant's calendar day; the scene sets how fast it
// runs, also backwards. What it works out for each frame, plant-view.ts draws.
// Before it starts, every file the recording shows is downloaded (download()),
// so winding never waits for the network.
import type * as T from "three";
import type { DrawingLine } from "../sandbox/sim/types";
import { PlantView, type DrawingFrame, type ObjectFrame, type PlantLook } from "./plant-view";

declare const AFRAME: { THREE: typeof T };

// key: calendar day, position (3), rotation (4), scale, floating height, floating period
type Key = number[];
export interface Recording {
  format: 1;
  run: string; seed: number; commit: string;
  days: number; // the last calendar day
  radius: number; // the farthest an object stands from the planting point (m)
  phases: [number, string][];
  looks: PlantLook[];
  objects: { id: string; to: number | null; keys: Key[]; looks: [number, number][] }[];
  // key: calendar day, position (3), scale
  drawings: { id: string; to: number | null; lines: DrawingLine[]; keys: Key[]; textures: [number, string | null][] }[];
}

const LOOK_AHEAD_SECONDS = 8; // models needed this far ahead (real seconds at the current pace) are loaded beforehand
const PRELOADS = 3; // models loaded ahead at the same time, at most
const DOWNLOADS = 6; // files downloaded at the same time before the start
const TRIES = 3; // a file that fails is asked for again this often

/** The last entry at or before t (entries sorted by their first value), or -1. */
function before<E extends [number, ...unknown[]] | number[]>(entries: E[], t: number): number {
  let lo = 0, hi = entries.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((entries[mid][0] as number) <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

/** The keys blended at t (t within the track). */
function blend(keys: Key[], t: number): Key {
  const i = Math.max(0, before(keys, t)), a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
  const f = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0;
  return a.map((v, k) => v + (b[k] - v) * f);
}

export class ReplayPlant {
  private readonly THREE = AFRAME.THREE;
  private readonly view: PlantView;
  private readonly q0 = new this.THREE.Quaternion();
  private readonly q1 = new this.THREE.Quaternion();
  /** The plant's calendar day shown now. */
  day = 0;
  /** Calendar days per real second; negative runs backwards. */
  pace = 0;
  private last = 0;
  private stopped = false;
  private readonly files = new Map<string, string>(); // downloaded files: path → blob URL

  /** root: an <a-entity> whose origin is the planting point, on the ground; base: where the recording's files are. */
  constructor(root: HTMLElement, private readonly rec: Recording, private readonly base: string) {
    this.view = new PlantView(root, base, this.files);
  }

  /** Downloads every model and photo the recording shows; a file that keeps failing is left to load later from the server. */
  async download(progress: (f: number, note: string) => void): Promise<void> {
    const paths = [...new Set([
      ...this.rec.looks.flatMap((l) => [l.model, l.photo?.url ?? ""]),
      ...this.rec.drawings.flatMap((d) => d.textures.map(([, t]) => t ?? "")),
    ].filter(Boolean))];
    let done = 0, bytes = 0, next = 0;
    const note = () => progress(done / paths.length, `${done} von ${paths.length} Dateien · ${Math.round(bytes / 1e6)} MB`);
    note();
    const one = async (path: string) => {
      for (let t = 1; t <= TRIES && !this.stopped; t++) {
        try {
          const res = await fetch(`${this.base}${path}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          this.files.set(path, URL.createObjectURL(blob));
          bytes += blob.size;
          return;
        } catch (e) {
          if (t === TRIES) console.warn(`${path} lädt nicht`, e);
        }
      }
    };
    await Promise.all(Array.from({ length: DOWNLOADS }, async () => {
      while (next < paths.length && !this.stopped) { await one(paths[next++]); done++; note(); }
    }));
  }

  /** The phase at the day shown. */
  get phase() { return this.rec.phases[Math.max(0, before(this.rec.phases, this.day))]?.[1] ?? ""; }

  /** The models the first frame needs (the loading screen waits for them). */
  async prepare(progress: (f: number, note: string) => void): Promise<void> {
    const urls = [...new Set(this.objectsAt(this.day).map((o) => o.look.model))];
    let done = 0;
    progress(0, `0 von ${urls.length} Modellen`);
    await Promise.all(urls.map((u) => this.view.model(u).catch(() => {}).then(() => progress(++done / urls.length, `${done} von ${urls.length} Modellen`))));
  }

  start() {
    this.last = performance.now();
    const frame = () => {
      if (this.stopped) return;
      const now = performance.now(), dt = Math.min(0.25, (now - this.last) / 1000); // a stalled tab doesn't jump
      this.last = now;
      this.day = Math.min(this.rec.days, Math.max(0, this.day + this.pace * dt));
      this.view.show(this.objectsAt(this.day), this.drawingsAt(this.day));
      this.preload();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop() {
    this.stopped = true;
    this.view.stop();
    for (const u of this.files.values()) URL.revokeObjectURL(u);
    this.files.clear();
  }

  private objectsAt(t: number): ObjectFrame[] {
    const out: ObjectFrame[] = [];
    for (const o of this.rec.objects) {
      if (t < o.keys[0][0] || (o.to !== null && t >= o.to)) continue;
      const k = blend(o.keys, t);
      // rotation: slerp between the two keys (the export keeps their signs on the short way)
      const i = Math.max(0, before(o.keys, t)), a = o.keys[i], b = o.keys[Math.min(o.keys.length - 1, i + 1)];
      const f = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0;
      const q = this.q0.set(a[4], a[5], a[6], a[7]).slerp(this.q1.set(b[4], b[5], b[6], b[7]), f);
      out.push({
        id: o.id, look: this.rec.looks[o.looks[Math.max(0, before(o.looks, t))][1]],
        position: [k[1], k[2], k[3]], rotation: [q.x, q.y, q.z, q.w], scale: k[8], sway: { height: k[9], period: k[10] },
      });
    }
    return out;
  }

  private drawingsAt(t: number): DrawingFrame[] {
    const out: DrawingFrame[] = [];
    for (const d of this.rec.drawings) {
      if (t < d.keys[0][0] || (d.to !== null && t >= d.to)) continue;
      const k = blend(d.keys, t);
      out.push({ id: d.id, lines: d.lines, position: [k[1], k[2], k[3]], scale: k[4], texture: d.textures[Math.max(0, before(d.textures, t))][1] });
    }
    return out;
  }

  /** The models the plant will need in the next LOOK_AHEAD_SECONDS, in the direction it runs. */
  private preload() {
    if (!this.pace || this.view.loading >= PRELOADS) return;
    const from = this.day, to = Math.min(this.rec.days, Math.max(0, this.day + this.pace * LOOK_AHEAD_SECONDS));
    const [lo, hi] = from < to ? [from, to] : [to, from];
    const wanted: [number, string][] = []; // how soon, which model
    for (const o of this.rec.objects) {
      if (hi < o.keys[0][0] || (o.to !== null && lo >= o.to)) continue;
      for (let i = Math.max(0, before(o.looks, lo)); i < o.looks.length && o.looks[i][0] <= hi; i++) {
        const url = this.rec.looks[o.looks[i][1]].model;
        if (!this.view.has(url)) wanted.push([Math.abs(Math.max(o.looks[i][0], lo) - from), url]);
      }
    }
    wanted.sort((a, b) => a[0] - b[0]);
    for (const [, url] of wanted) {
      if (this.view.loading >= PRELOADS) break;
      if (!this.view.has(url)) this.view.model(url).catch(() => {});
    }
  }
}
