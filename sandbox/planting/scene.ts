// The planting scene: visitors pick objects from a list and place them on the
// ground, one after the other, 3 to 5 of them. The same code runs in the
// sandbox viewer (three.js from npm) and in the AR test scene (8frame's
// three r137): three.js comes in from the host, and only what both versions
// have is used.
//
//   list    → pick an object
//   aim     → its see-through copy stands on the ground in the middle of the view,
//             green where it may stand, red where not; "Platzieren" fixes it
//   placed  → it stays there; size (two fingers / mouse wheel) and turn (one finger /
//             drag) can still change; "Bestätigen" asks once more, then it is planted
//   …       → back to the list; with plantMaxObjects planted, or "Pflanze starten"
//             (from plantMinObjects on, asked once more), the planting is done
import type * as T from "three";
import type { Vec3 } from "../sim/types";
import { checkPlacement, clampSize, defaultSize, footprintRadius, longestSide, type CatalogItem, type PlacementCheck, type PlantRules, type Planting } from "./rules";
import { C, button, confirmDialog, control, el, layer, row, setEnabled, sheet, toast } from "./ui";

export interface PlantingHost {
  THREE: typeof T;
  /** World frame with the ground at y = 0: the objects are added here. */
  root: T.Object3D;
  camera: T.Camera;
  /** The page's renderer: the list pictures are drawn with it (Safari on iPhone/iPad gives no further WebGL context next to 8th Wall). */
  renderer: T.WebGLRenderer;
  /** Where the overlay goes (a full-screen layer is added to it). */
  ui: HTMLElement;
  /** A loaded copy of an object's model (its glTF scene); the scene clones it. */
  loadModel(item: CatalogItem, progress?: (loaded: number, total: number) => void): Promise<T.Object3D>;
  /** Mouse and wheel (sandbox viewer) instead of touch gestures (phone). */
  desktop: boolean;
  /** m: further away the view hits no ground for planting (default 12; the sandbox's overview camera needs more). */
  maxAimDistance?: number;
  /** The catalog as it is now: asked every CATALOG_POLL_MS and when the page comes back into view, so
   *  objects made meanwhile (the objects page) join the list. */
  fetchCatalog?: () => Promise<CatalogItem[]>;
  /** The finished planting, in the root's frame, with the seed drawn for its simulation (0 … 99). */
  onFinish(plants: Planting[], seed: number): void;
}

type State = "list" | "aim" | "placed" | "busy";

interface Placed { item: CatalogItem; pos: Vec3; size: number; rotY: number; object: T.Object3D }

const CATALOG_POLL_MS = 10_000;
const ROTATE_PER_PIXEL = 0.012; // rad per pixel of a one-finger drag
const WHEEL_SCALE = 0.0015; // size × e^(−deltaY · this) per wheel step

export class PlantingScene {
  private readonly T: typeof T;
  private readonly layer = layer();
  private readonly group: T.Group;
  private readonly rings: T.Group;
  private readonly models = new Map<string, T.Object3D>();
  private readonly thumbs = new Map<string, string>();
  private readonly failed = new Map<string, string>(); // why a model did not load: shown on its card (no console on a phone)
  private readonly loading = new Map<string, HTMLSpanElement>(); // the card line that shows how far a model has loaded
  private readonly placed: Placed[] = [];
  private state: State = "list";
  private current: { item: CatalogItem; size: number; rotY: number; pos: Vec3 | null; ghost: T.Object3D; footprint: T.Mesh } | null = null;
  private check: PlacementCheck | null = null;
  private readonly ghostOk: T.Material;
  private readonly ghostBad: T.Material;
  private readonly ray: T.Raycaster;
  private readonly ground: T.Plane;
  private panel: HTMLDivElement | null = null;
  private status: HTMLDivElement | null = null;
  private primary: HTMLButtonElement | null = null;
  private readonly unlisten: (() => void)[] = [];

  constructor(private readonly host: PlantingHost, private readonly catalog: CatalogItem[], private readonly rules: PlantRules) {
    const THREE = (this.T = host.THREE);
    this.group = new THREE.Group();
    this.rings = new THREE.Group();
    this.group.add(this.rings);
    host.root.add(this.group);
    const ghost = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostOk = ghost(0x2fd06a);
    this.ghostBad = ghost(0xff3b3b);
    this.ray = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    host.ui.append(this.layer);
    this.listenGestures();
    for (const item of catalog) this.load(item);
    this.showList();
    if (host.fetchCatalog) {
      const fetchNow = () => { if (document.visibilityState === "visible") host.fetchCatalog!().then((c) => this.addToCatalog(c)).catch(() => {}); };
      const timer = setInterval(fetchNow, CATALOG_POLL_MS);
      document.addEventListener("visibilitychange", fetchNow);
      window.addEventListener("focus", fetchNow);
      this.unlisten.push(() => { clearInterval(timer); document.removeEventListener("visibilitychange", fetchNow); window.removeEventListener("focus", fetchNow); });
    }
  }

  /** Objects that came into the catalog meanwhile (e.g. from the objects page): added to the list. */
  addToCatalog(items: CatalogItem[]) {
    const fresh = items.filter((i) => !this.catalog.some((c) => c.name === i.name));
    for (const item of fresh) { this.catalog.push(item); this.load(item); }
    if (fresh.length && this.state === "list") this.showList();
  }

  private load(item: CatalogItem) {
    const show = (text: string) => { const line = this.loading.get(item.name); if (line) line.textContent = text; };
    this.host.loadModel(item, (loaded, total) => {
      const mb = (n: number) => (n / 1e6).toFixed(1).replace(".", ",");
      show(loaded >= total && total > 0 ? "wird aufbereitet" : total > 0 ? `lädt ${Math.round((loaded / total) * 100)} %` : `lädt ${mb(loaded)} MB`);
    }).then((m) => {
      this.models.set(item.name, m);
      this.thumbs.set(item.name, this.thumbnail(m));
      if (this.state === "list") this.showList();
    }).catch((e) => {
      console.error(`Modell ${item.name} lädt nicht`, e);
      this.failed.set(item.name, (e as Error)?.message ?? String(e));
      if (this.state === "list") this.showList();
    });
  }

  /** Call once per frame: the see-through copy follows the middle of the view. */
  update() {
    if (this.state !== "aim" || !this.current) return;
    const THREE = this.T;
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.host.camera);
    const hit = this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
    const cam = new THREE.Vector3().setFromMatrixPosition(this.host.camera.matrixWorld);
    const root = this.host.root;
    root.updateMatrixWorld(true);
    const local = hit && hit.distanceTo(cam) <= (this.host.maxAimDistance ?? 12) ? root.worldToLocal(hit.clone()) : null;
    this.current.pos = local ? [local.x, 0, local.z] : null;
    this.refresh();
  }

  /** The planted objects stay in the scene until this. */
  dispose() {
    for (const off of this.unlisten) off();
    this.layer.remove();
    this.group.removeFromParent();
  }

  // ------------------------------------------------------------ states

  private showList() {
    this.state = "list";
    this.setRings(false);
    const p = this.panel = this.reset();
    const done = this.placed.length;
    const head = el("div", { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" });
    head.append(el("div", { fontWeight: "600", fontSize: "19px" }, done ? "Wähle das nächste Objekt" : "Wähle ein Objekt zum Pflanzen"),
      el("div", { color: C.muted, fontSize: "14px", whiteSpace: "nowrap" }, `${done} von ${this.rules.plantMaxObjects} gepflanzt`));
    const grid = el("div", { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", maxHeight: "42vh", overflowY: "auto" });
    for (const item of this.catalog) {
      const used = this.placed.some((q) => q.item.name === item.name);
      const ready = this.models.has(item.name);
      const card = control(el("button", {
        display: "grid", justifyItems: "center", gap: "4px", padding: "6px 4px", borderRadius: "10px", border: `1px solid ${C.line}`,
        background: "#fff", cursor: ready && !used ? "pointer" : "default", fontFamily: "inherit", fontWeight: "500", fontSize: "13px", color: C.ink, opacity: used ? "0.45" : "1",
      }));
      card.type = "button";
      const img = this.thumbs.get(item.name);
      const pic = img ? el("img", { width: "64px", height: "64px", objectFit: "contain" }) : el("div", { width: "64px", height: "64px", borderRadius: "8px", background: "#eef1ec" });
      if (img) (pic as HTMLImageElement).src = img;
      if (img) (pic as HTMLImageElement).alt = "";
      card.append(pic, el("span", {}, used ? "gepflanzt" : item.label));
      const failed = !ready && this.failed.get(item.name);
      if (!ready && !failed) {
        const line = el("span", { color: C.muted, fontSize: "11px", fontWeight: "400" }, this.loading.get(item.name)?.textContent || "lädt");
        this.loading.set(item.name, line);
        card.append(line);
      }
      if (failed && ready) card.append(el("span", { color: "#c0392b", fontSize: "11px", fontWeight: "400", wordBreak: "break-word" }, `kein Bild: ${failed}`));
      else if (failed) card.append(el("span", { color: "#c0392b", fontSize: "11px", fontWeight: "400", wordBreak: "break-word" }, `lädt nicht: ${failed}`));
      card.disabled = used || !ready;
      card.setAttribute("aria-label", used ? `${item.label}, schon gepflanzt` : ready ? item.label : `${item.label}, lädt noch`);
      card.onclick = () => this.startAim(item);
      grid.append(card);
    }
    const start = button(done >= this.rules.plantMinObjects ? "Pflanze starten" : `Pflanze starten (ab ${this.rules.plantMinObjects} Objekten)`, "primary");
    setEnabled(start, done >= this.rules.plantMinObjects);
    start.onclick = () => this.finishAsked();
    // with an access code only one's own objects can be planted: too few of them, then make some first
    const tooFew = this.catalog.length < this.rules.plantMinObjects;
    const note = el("div", { color: tooFew ? C.ink : C.muted, fontSize: "13px" }, tooFew
      ? `Zum Pflanzen brauchst du mindestens ${this.rules.plantMinObjects} Objekte, ${this.catalog.length ? `hier sind erst ${this.catalog.length}` : "hier ist noch keins"}. Erstelle zuerst eigene Objekte: `
      : `Pflanze ${this.rules.plantMinObjects} bis ${this.rules.plantMaxObjects} Objekte, höchstens ${fmt(this.rules.originMaxGap)} m voneinander entfernt.`);
    if (tooFew) {
      const link = control(el("a", { color: C.accent, fontWeight: "600" }, "Neue Objekte"));
      link.href = "/objekte.html"; link.target = "_blank"; link.rel = "noopener";
      note.append(link, document.createTextNode(". Sie erscheinen hier, sobald sie fertig sind."));
    }
    p.append(head, grid, note, start);
  }

  private startAim(item: CatalogItem) {
    const model = this.models.get(item.name);
    if (!model) return;
    const THREE = this.T;
    const size = defaultSize(item, this.rules);
    const ghost = this.objectFor(item, model, true);
    const footprint = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), this.ghostOk);
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.y = 0.004;
    this.group.add(ghost, footprint);
    this.current = { item, size, rotY: 0, pos: null, ghost, footprint };
    this.aimState();
  }

  private aimState() {
    this.state = "aim";
    this.setRings(true);
    const p = this.panel = this.reset();
    this.status = el("div", { fontSize: "15px", minHeight: "40px" });
    const cancel = button("Abbrechen");
    cancel.onclick = () => this.cancel();
    this.primary = button("Platzieren", "primary");
    this.primary.onclick = () => this.placeHere();
    p.append(this.status, row(cancel, this.primary));
    this.layer.append(this.crosshair());
    this.refresh();
  }

  private placeHere() {
    if (!this.current?.pos || !this.check?.ok) return;
    this.state = "placed";
    const p = this.panel = this.reset();
    this.status = el("div", { fontSize: "15px", minHeight: "40px" });
    const cancel = button("Abbrechen");
    cancel.onclick = () => this.cancel();
    const move = button("Verschieben");
    move.onclick = () => this.aimState();
    this.primary = button("Bestätigen", "primary");
    this.primary.onclick = () => this.confirmAsked();
    p.append(this.status, row(cancel, move, this.primary));
    toast(this.layer, this.host.desktop
      ? "Mit dem Mausrad änderst du die Größe, durch Ziehen drehst du das Objekt."
      : "Mit zwei Fingern änderst du die Größe, mit einem Finger drehst du das Objekt.");
    this.refresh();
  }

  private async confirmAsked() {
    const cur = this.current;
    if (!cur?.pos || !this.check?.ok) return;
    this.state = "busy";
    const sure = await confirmDialog(this.layer, "Bist du sicher?", `${cur.item.label} wird hier gepflanzt. Danach lässt es sich nicht mehr verschieben oder ändern.`, "Ja, pflanzen");
    if (!sure) { this.state = "placed"; return; }
    // the real object takes the see-through copy's place
    const object = this.objectFor(cur.item, this.models.get(cur.item.name)!, false);
    this.pose(object, cur.item, cur.pos, cur.size, cur.rotY);
    this.group.add(object);
    this.placed.push({ item: cur.item, pos: cur.pos, size: cur.size, rotY: cur.rotY, object });
    this.dropCurrent();
    if (this.placed.length >= this.rules.plantMaxObjects) this.finish();
    else this.showList();
  }

  private async finishAsked() {
    if (this.placed.length < this.rules.plantMinObjects) return;
    this.state = "busy";
    const n = this.placed.length;
    const sure = await confirmDialog(this.layer, "Pflanze starten?", `Du hast ${n} Objekte gepflanzt. Danach kannst du keine weiteren hinzufügen, und die Pflanze beginnt zu wachsen.`, "Ja, starten");
    if (sure) this.finish(); else this.showList();
  }

  private finish() {
    this.state = "busy";
    this.reset();
    const seed = Math.floor(Math.random() * 100); // every planting its own run
    this.host.onFinish(this.placed.map((q) => ({ name: q.item.name, pos: q.pos, size: q.size, rotY: q.rotY })), seed);
  }

  private cancel() {
    this.dropCurrent();
    this.showList();
  }

  private dropCurrent() {
    if (this.current) { this.current.ghost.removeFromParent(); this.current.footprint.removeFromParent(); }
    this.current = null;
    this.check = null;
  }

  /** Validity, colour, pose and the status line of the object being placed. */
  private refresh() {
    const cur = this.current;
    if (!cur) return;
    cur.ghost.visible = cur.footprint.visible = !!cur.pos;
    if (cur.pos) {
      this.pose(cur.ghost, cur.item, cur.pos, cur.size, cur.rotY);
      const r = footprintRadius(cur.item, cur.size);
      cur.footprint.position.set(cur.pos[0], 0.004, cur.pos[2]);
      cur.footprint.scale.set(r, r, 1);
    }
    this.check = cur.pos ? checkPlacement(cur.item, cur.pos, cur.size, this.placed, this.rules) : null;
    const ok = !!this.check?.ok;
    const mat = ok ? this.ghostOk : this.ghostBad;
    cur.ghost.traverse((n) => { if ((n as T.Mesh).isMesh) (n as T.Mesh).material = mat; });
    cur.footprint.material = mat;
    if (this.primary) setEnabled(this.primary, ok);
    if (!this.status) return;
    const sizeNote = `Größe ${fmt(cur.size)} m (${fmt(this.rules.originMinSize)} bis ${fmt(this.rules.originMaxSize)} m)`;
    let text: string, color: string = C.ink;
    if (!cur.pos) { text = "Richte die Kamera auf den Boden, wo das Objekt stehen soll."; color = C.muted; }
    else if (!this.check!.ok) {
      color = C.bad;
      text = this.check!.reason === "overlap" ? "Zu nah: Es überschneidet sich mit einem gepflanzten Objekt." : `Zu weit weg: höchstens ${fmt(this.rules.originMaxGap)} m bis zum nächsten Objekt.`;
    } else text = this.state === "aim" ? (this.placed.length ? "Hier kann es stehen." : "Hier kann es stehen. Das erste Objekt bestimmt den Ort der Pflanze.") : "So wird es gepflanzt.";
    this.status.replaceChildren(el("div", { color, fontWeight: "500" }, text), el("div", { color: C.muted, fontSize: "13px" }, sizeNote));
  }

  // ------------------------------------------------------------ 3D

  /** A copy of the model, standing on the ground at its origin: see-through or with its own materials. */
  private objectFor(item: CatalogItem, model: T.Object3D, ghost: boolean): T.Object3D {
    const outer = new this.T.Group();
    const inner = model.clone(true);
    if (!ghost) inner.traverse((n) => {
      const m = n as T.Mesh;
      if (m.isMesh) { m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); m.castShadow = m.receiveShadow = true; }
    });
    outer.add(inner);
    outer.userData.item = item.name;
    return outer;
  }

  private pose(o: T.Object3D, item: CatalogItem, pos: Vec3, size: number, rotY: number) {
    const s = size / Math.max(1e-9, longestSide(item));
    o.position.set(pos[0], 0, pos[2]);
    o.rotation.set(0, rotY, 0);
    const inner = o.children[0];
    inner.scale.setScalar(s);
    inner.position.y = -item.min[1] * s; // the model's underside on the ground, as in the simulation
  }

  /** Around every planted object: its footprint and the zone a new one may reach into. */
  private setRings(on: boolean) {
    const THREE = this.T;
    this.rings.clear();
    if (!on) return;
    const zone = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const edge = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    for (const q of this.placed) {
      const r = footprintRadius(q.item, q.size);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + this.rules.originMaxGap, 64), zone);
      const line = new THREE.Mesh(new THREE.RingGeometry(r + this.rules.originMaxGap - 0.01, r + this.rules.originMaxGap, 64), edge);
      for (const m of [ring, line]) { m.rotation.x = -Math.PI / 2; m.position.set(q.pos[0], 0.003, q.pos[2]); this.rings.add(m); }
    }
  }

  /** A small picture of the model for the list, drawn by the page's renderer into a render target (no context of its own). */
  private thumbnail(model: T.Object3D): string {
    const THREE = this.T;
    const size = 128;
    const scene = new THREE.Scene();
    // the platform's light (as in the sandbox viewer); three r155+ needs the intensities × π
    const units = Number(THREE.REVISION) >= 155 ? Math.PI : 1;
    scene.add(new THREE.AmbientLight(0xbbbbbb, 1 * units));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6 * units);
    sun.position.set(-0.5, 1, 1);
    scene.add(sun);
    const copy = model.clone(true);
    scene.add(copy);
    const box = new THREE.Box3().setFromObject(copy);
    const centre = box.getCenter(new THREE.Vector3()), extent = box.getSize(new THREE.Vector3()).length() || 1;
    const camera = new THREE.PerspectiveCamera(30, 1, extent / 100, extent * 10);
    camera.position.copy(centre).add(new THREE.Vector3(0.9, 0.6, 1.2).normalize().multiplyScalar(extent * 1.9));
    camera.lookAt(centre);

    const renderer = this.host.renderer;
    const target = new THREE.WebGLRenderTarget(size, size);
    const before = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), xr: renderer.xr.enabled };
    const pixels = new Uint8Array(size * size * 4);
    try {
      renderer.xr.enabled = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    } finally {
      renderer.setRenderTarget(before.target);
      renderer.setClearColor(before.color, before.alpha);
      renderer.xr.enabled = before.xr;
      target.dispose();
    }
    // a render target stays linear: to sRGB here, and the rows the other way up
    const srgb = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) { const c = i / 255; srgb[i] = 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const from = ((size - 1 - y) * size + x) * 4, to = (y * size + x) * 4;
        image.data[to] = srgb[pixels[from]]; image.data[to + 1] = srgb[pixels[from + 1]]; image.data[to + 2] = srgb[pixels[from + 2]];
        image.data[to + 3] = pixels[from + 3];
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }

  // ------------------------------------------------------------ input

  private listenGestures() {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      window.addEventListener(type, fn as EventListener, opts);
      this.unlisten.push(() => window.removeEventListener(type, fn as EventListener, opts));
    };
    const fromUi = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.("[data-plant-ui]");
    const active = () => (this.state === "aim" || this.state === "placed") && !!this.current;
    const setSize = (s: number) => { if (this.current) { this.current.size = clampSize(s, this.rules); this.refresh(); } };
    const turn = (dx: number) => { if (this.current) { this.current.rotY += dx * ROTATE_PER_PIXEL; this.refresh(); } };
    if (this.host.desktop) {
      let drag: number | null = null;
      on("pointerdown", (e) => { if (active() && e.button === 0 && !fromUi(e)) drag = e.clientX; });
      on("pointermove", (e) => { if (drag !== null) { turn(e.clientX - drag); drag = e.clientX; } });
      on("pointerup", () => { drag = null; });
      on("wheel", (e) => {
        if (!active() || fromUi(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setSize(this.current!.size * Math.exp(-e.deltaY * WHEEL_SCALE * (e.ctrlKey ? 4 : 1))); // ctrlKey: a trackpad pinch
      }, { passive: false, capture: true });
      return;
    }
    let one: number | null = null, pinch: { d: number; size: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    on("touchstart", (e) => {
      if (!active() || fromUi(e)) return;
      if (e.touches.length === 1) { one = e.touches[0].clientX; pinch = null; }
      else if (e.touches.length === 2) { one = null; pinch = { d: dist(e.touches), size: this.current!.size }; }
    }, { passive: true });
    on("touchmove", (e) => {
      if (!active()) return;
      if (pinch && e.touches.length >= 2) setSize(pinch.size * (dist(e.touches) / Math.max(1, pinch.d)));
      else if (one !== null && e.touches.length === 1) { turn(e.touches[0].clientX - one); one = e.touches[0].clientX; }
    }, { passive: true });
    on("touchend", (e) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 1 && !pinch) one = e.touches[0].clientX; else if (!e.touches.length) one = null;
    }, { passive: true });
  }

  // ------------------------------------------------------------ overlay

  private reset(): HTMLDivElement {
    this.layer.replaceChildren();
    this.status = null;
    this.primary = null;
    const s = sheet();
    this.layer.append(s);
    return s;
  }

  private crosshair(): HTMLDivElement {
    const c = el("div", { position: "absolute", left: "50%", top: "50%", width: "22px", height: "22px", margin: "-11px 0 0 -11px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 0 0 1px rgba(0,0,0,0.35)" });
    c.setAttribute("aria-hidden", "true");
    return c;
  }
}

const fmt = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
