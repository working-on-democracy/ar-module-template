// The plant in AR, as interface 1 describes it (sandbox/docs/SCHNITTSTELLEN.md):
// the app polls the whole plant, shows it one poll behind and blends between
// the last two answers; it only displays, all rules stay on the server. Here
// it polls the sandbox (GET /api/plant, proxied by dev:ar). What it works out
// for each frame, plant-view.ts draws.
//
// Drawings are the platform's own content: their lines come from the sandbox's
// stand-in for strokesNearby (GET /api/strokes, every STROKES_POLL_MS). One the
// plant has attracted is in the answer's `drawings` and drawn there instead of
// at its own place.
import type * as T from "three";
import type { DrawingLine, PhotoFrame, Vec3 } from "../sandbox/sim/types";
import { PlantView, type DrawingFrame, type ObjectFrame } from "./plant-view";

declare const AFRAME: { THREE: typeof T };

export interface PlantObjectAnswer {
  id: string;
  model: { url: string; triangles: number };
  pose: { position: Vec3; rotation: [number, number, number, number]; scale: number };
  state: string;
  origin: boolean;
  tint: { color: Vec3; intensity: number } | null;
  grain: { strength: number; scale: number };
  sway: { height: number; period: number };
  photo: { url: string; frame: PhotoFrame } | null;
  comment: { text: string; color: string; frame: PhotoFrame } | null;
}
export interface PlantDrawingAnswer { strokeId: string; position: Vec3; scale: number; state: string; textureFrom: string | null }
export interface PlantAnswer { id: string; serverTime: number; pollSeconds: number; phase: string; objects: PlantObjectAnswer[]; drawings: PlantDrawingAnswer[] }
/** A drawing as the platform keeps it (strokesNearby): its anchor, from the planting point, and its lines from there. */
interface Stroke { id: string; position: Vec3; lines: DrawingLine[] }

const STROKES_POLL_MS = 10_000; // as the host app polls its nearby content

export class LivePlant {
  private readonly THREE = AFRAME.THREE;
  private readonly answers: { at: number; a: PlantAnswer }[] = []; // at: server time
  private readonly view: PlantView;
  private strokes = new Map<string, Stroke>();
  private strokesAt = 0; // when they were last asked for (phone clock)
  private offset = 0; // server clock − phone clock (ms)
  private timer = 0;
  private stopped = false;

  /** root: an <a-entity> whose origin is the planting point, on the ground. */
  constructor(root: HTMLElement, private readonly base = "") {
    this.view = new PlantView(root, base);
  }

  /** The first answer, and the models it needs (the loading screen waits for them). */
  async prepare(progress: (f: number, note: string) => void): Promise<void> {
    const [a] = await Promise.all([this.fetch(), this.fetchStrokes().catch((e) => console.warn("Zeichnungen: Abfrage gescheitert", e))]);
    const urls = [...new Set(a.objects.map((o) => o.model.url))];
    const bytes = new Map<string, number>();
    let done = 0;
    // models and megabytes so far: on a slow network one can tell loading from hanging
    const report = () => {
      const mb = ([...bytes.values()].reduce((x, y) => x + y, 0) / 1e6).toFixed(1).replace(".", ",");
      progress(done / urls.length, `${done} von ${urls.length} Modellen, ${mb} MB geladen`);
    };
    report();
    const settle = () => { done++; report(); };
    await Promise.all(urls.map((u) => this.view.model(u, (n) => { bytes.set(u, n); report(); }).then(settle, settle)));
  }

  start() {
    const tick = () => {
      if (this.stopped) return;
      const strokes = this.fetch().then((a) => {
        // the drawings again every STROKES_POLL_MS, at once when the plant names one not known yet
        if (Date.now() - this.strokesAt >= STROKES_POLL_MS || a.drawings.some((d) => !this.strokes.has(d.strokeId))) return this.fetchStrokes();
      });
      strokes.catch((e) => console.warn("Pflanze: Abfrage gescheitert", e)).finally(() => {
        const wait = (this.answers[this.answers.length - 1]?.a.pollSeconds ?? 3) * 1000;
        this.timer = window.setTimeout(tick, wait);
      });
    };
    tick();
    const frame = () => { if (this.stopped) return; this.update(); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.view.stop();
  }

  private async fetchStrokes() {
    this.strokesAt = Date.now();
    const res = await fetch(`${this.base}/api/strokes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { strokes } = (await res.json()) as { strokes: Stroke[] };
    this.strokes = new Map(strokes.map((s) => [s.id, s]));
  }

  private async fetch(): Promise<PlantAnswer> {
    const res = await fetch(`${this.base}/api/plant`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const a = (await res.json()) as PlantAnswer;
    const offset = a.serverTime - Date.now();
    this.offset = this.answers.length ? this.offset + (offset - this.offset) * 0.2 : offset;
    this.answers.push({ at: a.serverTime, a });
    if (this.answers.length > 4) this.answers.shift();
    return a;
  }

  /** Each frame: the plant one poll behind, blended between the two answers around that moment. */
  private update() {
    if (!this.answers.length) return;
    const THREE = this.THREE;
    const newest = this.answers[this.answers.length - 1].a;
    const t = Date.now() + this.offset - newest.pollSeconds * 1000;
    let i = this.answers.findIndex((x) => x.at > t);
    if (i < 0) i = this.answers.length - 1; // past the newest: hold it
    const b = this.answers[i], a = this.answers[Math.max(0, i - 1)];
    const k = b.at > a.at ? Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at))) : 1;
    const objects: ObjectFrame[] = b.a.objects.map((ob) => {
      const oa = a.a.objects.find((x) => x.id === ob.id) ?? ob; // a new object: no blending
      const pos = new THREE.Vector3(...oa.pose.position).lerp(new THREE.Vector3(...ob.pose.position), k);
      const rot = new THREE.Quaternion(...oa.pose.rotation).slerp(new THREE.Quaternion(...ob.pose.rotation), k);
      return {
        id: ob.id, position: [pos.x, pos.y, pos.z], rotation: [rot.x, rot.y, rot.z, rot.w], scale: oa.pose.scale + (ob.pose.scale - oa.pose.scale) * k, sway: ob.sway,
        look: { model: ob.model.url, tint: ob.tint, grain: ob.grain, photo: ob.photo, comment: ob.comment },
      };
    });
    // every drawing: at its own place, or where the plant has it (blended like the objects), with its texture at rest
    const before = new Map((a.a.drawings ?? []).map((d) => [d.strokeId, d]));
    const now = new Map((b.a.drawings ?? []).map((d) => [d.strokeId, d]));
    const drawings: DrawingFrame[] = [...this.strokes.values()].map((stroke) => {
      const d1 = now.get(stroke.id), d0 = before.get(stroke.id) ?? d1;
      const position = d1 && d0 ? new THREE.Vector3(...d0.position).lerp(new THREE.Vector3(...d1.position), k).toArray() as Vec3 : stroke.position;
      const scale = d1 && d0 ? d0.scale + (d1.scale - d0.scale) * k : 1;
      return { id: stroke.id, lines: stroke.lines, position, scale, texture: d1?.textureFrom ?? null };
    });
    this.view.show(objects, drawings);
  }
}
