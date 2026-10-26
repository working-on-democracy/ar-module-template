// The plant in AR, as interface 1 describes it (sandbox/docs/SCHNITTSTELLEN.md):
// the app polls the whole plant, shows it one poll behind and blends between
// the last two answers; it only displays, all rules stay on the server. Here
// it polls the sandbox (GET /api/plant, proxied by dev:ar).
//
// Every object is an <a-entity> with the plant's grain-shimmer component; its
// model is set as the entity's 'mesh' (a new file is loaded in the background
// and swapped in once it is there). Tint, photo layer, comment text and
// floating come from the answer, as in the sandbox viewer.
//
// Drawings are the platform's own content: their lines come from the sandbox's
// stand-in for strokesNearby (GET /api/strokes, every STROKES_POLL_MS), drawn as
// the platform draws them (render/stroke-tube.ts). One the plant has attracted
// is in the answer's `drawings` and drawn there instead of at its own place.
import type * as T from "three";
import type { DrawingLine, PhotoFrame, Vec3 } from "../sandbox/sim/types";
import { photoLayer } from "../sandbox/render/photo-layer";
import { commentLayer } from "../sandbox/render/comment-layer";
import { strokeTubes } from "../sandbox/render/stroke-tube";

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

interface Shown {
  el: HTMLElement & { object3D: T.Object3D; setObject3D(type: string, obj: T.Object3D): void; getObject3D(type: string): T.Object3D | undefined };
  key: string; // model url + photo + comment: what the mesh was made for
  tint: string; // the tint its materials have
  loading: string | null;
  phase: number; // floating out of step with the others
}

export class LivePlant {
  private readonly THREE = AFRAME.THREE;
  private readonly answers: { at: number; a: PlantAnswer }[] = []; // at: server time
  private readonly shown = new Map<string, Shown>();
  private readonly gltf = new Map<string, Promise<T.Object3D>>();
  private readonly photos = new Map<string, { tex: T.Texture; loaded: Promise<void> }>();
  private readonly layer = photoLayer(this.THREE);
  private readonly comments = commentLayer(this.THREE, this.layer);
  private readonly tubes = strokeTubes(this.THREE);
  private strokes = new Map<string, Stroke>();
  private strokesAt = 0; // when they were last asked for (phone clock)
  private readonly drawn = new Map<string, { group: T.Group; meshes: T.Mesh[]; texture: string }>();
  private offset = 0; // server clock − phone clock (ms)
  private timer = 0;
  private stopped = false;

  /** root: an <a-entity> whose origin is the planting point, on the ground. */
  constructor(private readonly root: HTMLElement, private readonly base = "") {}

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
    await Promise.all(urls.map((u) => this.model(u, (n) => { bytes.set(u, n); report(); }).then(settle, settle)));
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
    for (const s of this.shown.values()) s.el.remove();
    this.shown.clear();
    for (const d of this.drawn.values()) d.group.removeFromParent();
    this.drawn.clear();
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
    const now = performance.now() / 1000;
    const seen = new Set<string>();
    for (const ob of b.a.objects) {
      seen.add(ob.id);
      const oa = a.a.objects.find((x) => x.id === ob.id) ?? ob; // a new object: no blending
      const s = this.ensure(ob);
      const pos = new THREE.Vector3(...oa.pose.position).lerp(new THREE.Vector3(...ob.pose.position), k);
      const rot = new THREE.Quaternion(...oa.pose.rotation).slerp(new THREE.Quaternion(...ob.pose.rotation), k);
      const scale = oa.pose.scale + (ob.pose.scale - oa.pose.scale) * k;
      const sway = ob.sway.height ? ob.sway.height * (1 - Math.cos((now * 2 * Math.PI) / Math.max(0.5, ob.sway.period) + s.phase)) / 2 : 0;
      s.el.object3D.position.set(pos.x, pos.y + sway, pos.z);
      s.el.object3D.quaternion.copy(rot);
      s.el.object3D.scale.setScalar(scale);
    }
    for (const [id, s] of this.shown) if (!seen.has(id)) { s.el.remove(); this.shown.delete(id); }
    this.updateDrawings(a.a, b.a, k);
  }

  /** Every drawing: at its own place, or where the plant has it (blended like the objects), with its texture at rest. */
  private updateDrawings(a: PlantAnswer, b: PlantAnswer, k: number) {
    const THREE = this.THREE;
    const before = new Map((a.drawings ?? []).map((d) => [d.strokeId, d]));
    const now = new Map((b.drawings ?? []).map((d) => [d.strokeId, d]));
    for (const [id, stroke] of this.strokes) {
      let view = this.drawn.get(id);
      if (!view) {
        const meshes = stroke.lines.map((l) => this.tubes.lineMesh(l)).filter((m): m is T.Mesh => !!m);
        const group = new THREE.Group();
        if (meshes.length) group.add(...meshes);
        (this.root as unknown as { object3D: T.Object3D }).object3D.add(group);
        view = { group, meshes, texture: "" };
        this.drawn.set(id, view);
      }
      const d1 = now.get(id), d0 = before.get(id) ?? d1;
      if (d1 && d0) {
        view.group.position.set(...d0.position).lerp(new THREE.Vector3(...d1.position), k);
        view.group.scale.setScalar(d0.scale + (d1.scale - d0.scale) * k);
      } else {
        view.group.position.set(...stroke.position);
        view.group.scale.setScalar(1);
      }
      const texture = d1?.textureFrom ?? "";
      if (texture !== view.texture) this.retexture(view, stroke, texture);
    }
    for (const [id, view] of this.drawn) if (!this.strokes.has(id)) { view.group.removeFromParent(); this.drawn.delete(id); }
  }

  /** At rest a drawing takes its object's texture along the tube (8 times lengthwise, as in the sandbox viewer). */
  private retexture(view: { meshes: T.Mesh[]; texture: string }, stroke: Stroke, url: string) {
    view.texture = url;
    const paint = (material: (i: number) => T.Material) => view.meshes.forEach((m, i) => m.traverse((n) => { if ((n as T.Mesh).isMesh) (n as T.Mesh).material = material(i); }));
    if (!url) { paint((i) => this.tubes.materialFor(stroke.lines.filter((l) => l.points.length >= 2)[i].color)); return; }
    this.model(url).then((model) => {
      if (view.texture !== url) return; // changed again meanwhile
      let map: T.Texture | null = null;
      model.traverse((n) => { const m = (n as T.Mesh).material as T.MeshStandardMaterial | undefined; if (!map && m?.map) map = m.map; });
      if (!map) return;
      const t = (map as T.Texture).clone(); // the model is loaded: its image is there (r137 clones only that)
      t.wrapS = t.wrapT = this.THREE.RepeatWrapping;
      t.repeat.set(8, 1);
      t.needsUpdate = true;
      const material = this.tubes.texturedMaterial(t);
      paint(() => material);
    }).catch((e) => console.warn(`Textur ${url} lädt nicht`, e));
  }

  /** The entity of an object, its model (swapped once a new file is loaded) and its look. */
  private ensure(o: PlantObjectAnswer): Shown {
    let s = this.shown.get(o.id);
    if (!s) {
      const el = document.createElement("a-entity") as unknown as Shown["el"];
      this.root.appendChild(el);
      s = { el, key: "", tint: "", loading: null, phase: Math.random() * 10 };
      this.shown.set(o.id, s);
    }
    const key = `${o.model.url}|${o.photo ? `${o.photo.url}|${JSON.stringify(o.photo.frame)}` : ""}|${o.comment ? JSON.stringify(o.comment) : ""}`;
    if (key !== s.key && key !== s.loading) {
      s.loading = key;
      const shown = s;
      this.dress(o).then((mesh) => {
        if (shown.loading !== key) return; // a newer one is on its way
        shown.loading = null;
        shown.key = key;
        shown.el.setObject3D("mesh", mesh); // grain-shimmer patches the new materials
        if (o.comment) this.comments.add(mesh, o.comment.frame, o.comment.text, o.comment.color); // after: the text keeps its own material
        shown.tint = ""; // new materials: tint them
      }).catch((e) => { console.warn(`Modell ${o.model.url} lädt nicht`, e); shown.loading = null; });
    }
    const grain = `grain: ${o.grain.strength}; grainScale: ${o.grain.scale}`;
    if (s.el.dataset.grain !== grain) { s.el.dataset.grain = grain; s.el.setAttribute("grain-shimmer", grain); }
    const tint = JSON.stringify(o.tint);
    if (s.key && s.tint !== tint) { s.tint = tint; this.tint(s, o); }
    return s;
  }

  /** A copy of the model, with the photo projected onto the triangles it reaches. */
  private async dress(o: PlantObjectAnswer): Promise<T.Object3D> {
    const copy = (await this.model(o.model.url)).clone(true);
    copy.traverse((n) => {
      const m = n as T.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
      m.castShadow = true; // onto the ground, from the platform's directional light (not onto itself: bias 0 would stripe it)
    });
    if (!o.photo) return copy;
    const holder = new this.THREE.Group(); // the photo frame is in the model's own frame
    holder.add(copy);
    const lit = this.layer.litTriangles(holder, o.photo.frame);
    const photo = this.photo(o.photo.url);
    await photo.loaded; // grain-shimmer clones the map once the mesh is set: with r137 the clone needs the image by then
    const map = this.layer.fitPhoto(photo.tex, photo.loaded, o.photo.frame);
    copy.traverse((n) => {
      const m = n as T.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return; // several materials: left as they are
      const own = m.material;
      const onPhoto = own.clone() as T.MeshStandardMaterial;
      onPhoto.map = map;
      onPhoto.color?.set(0xffffff);
      m.geometry = this.layer.splitLit(this.layer.projectedUv(m.geometry, m, holder, o.photo!.frame), lit.get(m)!);
      m.material = [own, onPhoto];
    });
    holder.remove(copy);
    return copy;
  }

  /** The emissive tint, on the materials the mesh has now (grain-shimmer's copies). */
  private tint(s: Shown, o: PlantObjectAnswer) {
    s.el.getObject3D("mesh")?.traverse((n) => {
      const m = n as T.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const sm = mat as T.MeshStandardMaterial;
        if (!sm.emissive) continue;
        const own = (sm.userData.ownEmissive ??= { color: sm.emissive.clone(), intensity: sm.emissiveIntensity, map: sm.emissiveMap });
        if (o.tint) {
          sm.emissive.setRGB(o.tint.color[0], o.tint.color[1], o.tint.color[2]).convertSRGBToLinear();
          sm.emissiveIntensity = o.tint.intensity;
          if (sm.emissiveMap) { sm.emissiveMap = null; sm.needsUpdate = true; }
        } else {
          sm.emissive.copy(own.color);
          sm.emissiveIntensity = own.intensity;
          if (sm.emissiveMap !== own.map) { sm.emissiveMap = own.map; sm.needsUpdate = true; }
        }
      }
    });
  }

  private model(url: string, loaded?: (bytes: number) => void): Promise<T.Object3D> {
    let p = this.gltf.get(url);
    if (!p) {
      const Loader = (this.THREE as unknown as { GLTFLoader: new () => { loadAsync(u: string, progress?: (e: ProgressEvent) => void): Promise<{ scene: T.Object3D }> } }).GLTFLoader;
      p = new Loader().loadAsync(`${this.base}${url}`, (e) => loaded?.(e.loaded)).then((g) => g.scene);
      this.gltf.set(url, p);
    }
    return p;
  }

  private photo(url: string) {
    let p = this.photos.get(url);
    if (!p) {
      let done = () => {};
      const loaded = new Promise<void>((r) => { done = r; });
      const tex = new this.THREE.TextureLoader().load(`${this.base}${url}`, () => done(), undefined, () => done()); // a missing photo: the object without it
      const t = tex as unknown as Record<string, unknown>;
      if ("colorSpace" in t) t.colorSpace = "srgb"; else t.encoding = (this.THREE as unknown as { sRGBEncoding: number }).sRGBEncoding;
      tex.flipY = false;
      p = { tex, loaded };
      this.photos.set(url, p);
    }
    return p;
  }
}
