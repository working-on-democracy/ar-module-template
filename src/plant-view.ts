// Draws the plant: what each frame hands it, it shows. Used by the live plant
// (plant-live.ts: interface 1, polled from the sandbox) and the replay
// (plant-replay.ts: a recorded run, played without a server); both work out the
// poses, this file only displays them.
//
// Every object is an <a-entity> with the plant's grain-shimmer component; its
// model is set as the entity's 'mesh' (a new file is loaded in the background
// and swapped in once it is there). Tint, photo layer, comment text and
// floating come with the frame, as in the sandbox viewer. Drawings are drawn as
// the platform draws them (render/stroke-tube.ts), at the place the frame gives.
//
// A plant changes its models all the time (a replay wound through a whole life
// loads about a thousand), so nothing stays on the GPU longer than needed: a
// swapped-out mesh gives back what was made for it, and loaded models nobody
// shows are dropped once more than KEEP_MODELS are loaded.
import type * as T from "three";
import type { DrawingLine, PhotoFrame, Vec3 } from "../sandbox/sim/types";
import { photoLayer } from "../sandbox/render/photo-layer";
import { commentLayer } from "../sandbox/render/comment-layer";
import { strokeTubes } from "../sandbox/render/stroke-tube";

declare const AFRAME: { THREE: typeof T };

/** How an object looks: everything but where it is. */
export interface PlantLook {
  model: string; // url of its .glb
  tint: { color: Vec3; intensity: number } | null;
  grain: { strength: number; scale: number };
  photo: { url: string; frame: PhotoFrame } | null;
  comment: { text: string; color: string; frame: PhotoFrame } | null;
}
/** An object in this frame. */
export interface ObjectFrame { id: string; look: PlantLook; position: Vec3; rotation: [number, number, number, number]; scale: number; sway: { height: number; period: number } }
/** A drawing in this frame: its lines (from its anchor, at scale 1), where the anchor is, and the texture it took at rest. */
export interface DrawingFrame { id: string; lines: DrawingLine[]; position: Vec3; scale: number; texture: string | null }

const KEEP_MODELS = 60; // loaded models kept although nothing shows them (a replay wound back finds them again)

interface Shown {
  el: HTMLElement & { object3D: T.Object3D; setObject3D(type: string, obj: T.Object3D): void; getObject3D(type: string): T.Object3D | undefined };
  key: string; // model url + photo + comment: what the mesh was made for
  tint: string; // the tint its materials have
  loading: string | null;
  phase: number; // floating out of step with the others
  uncomment: (() => void) | null; // takes the comment text off the mesh
}
interface Drawn { group: T.Group; meshes: T.Mesh[]; lines: DrawingLine[]; texture: string; textured: T.Material | null }
interface Loaded { scene: Promise<T.Object3D>; used: number }

export class PlantView {
  private readonly THREE = AFRAME.THREE;
  private readonly shown = new Map<string, Shown>();
  private readonly gltf = new Map<string, Loaded>();
  private readonly shared = new WeakSet<object>(); // geometries and textures of loaded models and photos: never given back with a mesh
  private readonly photos = new Map<string, { tex: T.Texture; loaded: Promise<void> }>();
  private readonly layer = photoLayer(this.THREE);
  private readonly comments = commentLayer(this.THREE, this.layer);
  private readonly tubes = strokeTubes(this.THREE);
  private readonly drawn = new Map<string, Drawn>();
  /** Models being loaded right now. */
  loading = 0;

  /** root: an <a-entity> whose origin is the planting point, on the ground; local: files already downloaded (path → blob URL), the rest comes from base. */
  constructor(private readonly root: HTMLElement, private readonly base = "", private readonly local?: Map<string, string>) {}

  private at(url: string) { return this.local?.get(url) ?? `${this.base}${url}`; }

  /** Shows this frame: objects and drawings not in it are taken away. */
  show(objects: ObjectFrame[], drawings: DrawingFrame[]) {
    const THREE = this.THREE;
    const now = performance.now() / 1000;
    const seen = new Set<string>();
    for (const o of objects) {
      seen.add(o.id);
      const s = this.ensure(o.id, o.look);
      const sway = o.sway.height ? o.sway.height * (1 - Math.cos((now * 2 * Math.PI) / Math.max(0.5, o.sway.period) + s.phase)) / 2 : 0;
      s.el.object3D.position.set(o.position[0], o.position[1] + sway, o.position[2]);
      s.el.object3D.quaternion.set(...o.rotation);
      s.el.object3D.scale.setScalar(o.scale);
    }
    for (const [id, s] of this.shown) if (!seen.has(id)) this.drop(id, s);
    const here = new Set<string>();
    for (const d of drawings) {
      here.add(d.id);
      let view = this.drawn.get(d.id);
      if (!view) {
        const meshes = d.lines.map((l) => this.tubes.lineMesh(l)).filter((m): m is T.Mesh => !!m);
        const group = new THREE.Group();
        if (meshes.length) group.add(...meshes);
        (this.root as unknown as { object3D: T.Object3D }).object3D.add(group);
        view = { group, meshes, lines: d.lines, texture: "", textured: null };
        this.drawn.set(d.id, view);
      }
      view.group.position.set(...d.position);
      view.group.scale.setScalar(d.scale);
      if ((d.texture ?? "") !== view.texture) this.retexture(view, d.texture ?? "");
    }
    for (const [id, view] of this.drawn) if (!here.has(id)) { view.group.removeFromParent(); this.untexture(view); this.drawn.delete(id); }
  }

  stop() {
    for (const [id, s] of this.shown) this.drop(id, s);
    for (const d of this.drawn.values()) { d.group.removeFromParent(); this.untexture(d); }
    this.drawn.clear();
  }

  /** A model, loaded once (and kept while it is in use or among the last KEEP_MODELS). */
  model(url: string, loaded?: (bytes: number) => void): Promise<T.Object3D> {
    let m = this.gltf.get(url);
    if (!m) {
      const Loader = (this.THREE as unknown as { GLTFLoader: new () => { loadAsync(u: string, progress?: (e: ProgressEvent) => void): Promise<{ scene: T.Object3D }> } }).GLTFLoader;
      this.loading++;
      const scene = new Loader().loadAsync(this.at(url), (e) => loaded?.(e.loaded)).then((g) => {
        g.scene.traverse((n) => {
          const mesh = n as T.Mesh;
          if (!mesh.isMesh) return;
          this.shared.add(mesh.geometry);
          for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) for (const t of textures(mat)) this.shared.add(t);
        });
        return g.scene;
      });
      scene.finally(() => { this.loading--; this.evict(); }).catch(() => this.gltf.delete(url)); // a failed load: tried again next time
      m = { scene, used: 0 };
      this.gltf.set(url, m);
    }
    m.used = performance.now();
    return m.scene;
  }

  /** Whether a model is loaded (or on its way). */
  has(url: string) { return this.gltf.has(url); }

  /** Loaded models nobody shows, beyond the last KEEP_MODELS used: dropped, their GPU memory given back. */
  private evict() {
    if (this.gltf.size <= KEEP_MODELS) return;
    const inUse = new Set<string>();
    for (const s of this.shown.values()) for (const k of [s.key, s.loading]) if (k) inUse.add(k.split("|")[0]);
    for (const d of this.drawn.values()) if (d.texture) inUse.add(d.texture);
    const spare = [...this.gltf].filter(([url]) => !inUse.has(url)).sort((a, b) => a[1].used - b[1].used);
    for (const [url, m] of spare.slice(0, Math.max(0, this.gltf.size - KEEP_MODELS))) {
      this.gltf.delete(url);
      m.scene.then((scene) => scene.traverse((n) => {
        const mesh = n as T.Mesh;
        if (!mesh.isMesh) return;
        this.shared.delete(mesh.geometry);
        mesh.geometry.dispose();
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const t of textures(mat)) { this.shared.delete(t); t.dispose(); }
          mat.dispose();
        }
      }), () => {});
    }
  }

  /** The entity of an object, its model (swapped once a new file is loaded) and its look. */
  private ensure(id: string, o: PlantLook): Shown {
    let s = this.shown.get(id);
    if (!s) {
      const el = document.createElement("a-entity") as unknown as Shown["el"];
      this.root.appendChild(el);
      s = { el, key: "", tint: "", loading: null, phase: Math.random() * 10, uncomment: null };
      this.shown.set(id, s);
    }
    const key = `${o.model}|${o.photo ? `${o.photo.url}|${JSON.stringify(o.photo.frame)}` : ""}|${o.comment ? JSON.stringify(o.comment) : ""}`;
    if (key !== s.key && key !== s.loading) {
      s.loading = key;
      const shown = s;
      this.dress(o).then((mesh) => {
        if (shown.loading !== key || this.shown.get(id) !== shown) { this.giveBack(mesh); return; } // a newer one is on its way, or the object is gone
        shown.loading = null;
        shown.key = key;
        const old = shown.el.getObject3D("mesh");
        shown.uncomment?.();
        shown.uncomment = null;
        shown.el.setObject3D("mesh", mesh); // grain-shimmer patches the new materials and gives back its copies of the old ones
        if (old) this.giveBack(old);
        if (o.comment) shown.uncomment = this.comments.add(mesh, o.comment.frame, o.comment.text, o.comment.color); // after: the text keeps its own material
        shown.tint = ""; // new materials: tint them
      }).catch((e) => { console.warn(`Modell ${o.model} lädt nicht`, e); if (shown.loading === key) shown.loading = null; });
    }
    const grain = `grain: ${o.grain.strength}; grainScale: ${o.grain.scale}`;
    if (s.el.dataset.grain !== grain) { s.el.dataset.grain = grain; s.el.setAttribute("grain-shimmer", grain); }
    const tint = JSON.stringify(o.tint);
    if (s.key && s.tint !== tint) { s.tint = tint; this.tint(s, o); }
    return s;
  }

  private drop(id: string, s: Shown) {
    const mesh = s.el.getObject3D("mesh");
    s.uncomment?.();
    s.el.remove(); // grain-shimmer gives back its copies
    if (mesh) this.giveBack(mesh);
    this.shown.delete(id);
  }

  /** What was made for a mesh (material copies, photo geometry and texture), not what it shares with its model. */
  private giveBack(mesh: T.Object3D) {
    mesh.traverse((n) => {
      const m = n as T.Mesh;
      if (!m.isMesh) return;
      if (!this.shared.has(m.geometry)) m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        for (const t of textures(mat)) if (!this.shared.has(t)) t.dispose();
        mat.dispose();
      }
    });
  }

  /** At rest a drawing takes its object's texture along the tube (8 times lengthwise, as in the sandbox viewer). */
  private retexture(view: Drawn, url: string) {
    view.texture = url;
    const paint = (material: (i: number) => T.Material) => view.meshes.forEach((m, i) => m.traverse((n) => { if ((n as T.Mesh).isMesh) (n as T.Mesh).material = material(i); }));
    if (!url) { paint((i) => this.tubes.materialFor(view.lines.filter((l) => l.points.length >= 2)[i].color)); this.untexture(view); return; }
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
      this.untexture(view);
      view.textured = material;
    }).catch((e) => console.warn(`Textur ${url} lädt nicht`, e));
  }

  private untexture(view: Drawn) {
    if (!view.textured) return;
    for (const t of textures(view.textured)) t.dispose();
    view.textured.dispose();
    view.textured = null;
  }

  /** A copy of the model, with the photo projected onto the triangles it reaches. */
  private async dress(o: PlantLook): Promise<T.Object3D> {
    const copy = (await this.model(o.model)).clone(true);
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
  private tint(s: Shown, o: PlantLook) {
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

  private photo(url: string) {
    let p = this.photos.get(url);
    if (!p) {
      let done = () => {};
      const loaded = new Promise<void>((r) => { done = r; });
      const tex = new this.THREE.TextureLoader().load(this.at(url), () => done(), undefined, () => done()); // a missing photo: the object without it
      const t = tex as unknown as Record<string, unknown>;
      if ("colorSpace" in t) t.colorSpace = "srgb"; else t.encoding = (this.THREE as unknown as { sRGBEncoding: number }).sRGBEncoding;
      tex.flipY = false;
      this.shared.add(tex);
      p = { tex, loaded };
      this.photos.set(url, p);
    }
    return p;
  }
}

const TEXTURE_KEYS = ["map", "emissiveMap", "roughnessMap", "metalnessMap", "aoMap", "normalMap", "alphaMap"] as const;
/** The textures a material uses. */
function textures(mat: T.Material): T.Texture[] {
  const m = mat as unknown as Record<string, T.Texture | null | undefined>;
  return TEXTURE_KEYS.map((k) => m[k]).filter((t): t is T.Texture => !!t?.isTexture);
}
