// Viewer of the 3D sandbox: polls the server's state and shows every object
// with its current .glb version, photos, drawings and the reference points.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Drawing, Pair, Photo, PlantObject, Sample, SimEvent, Vec3 } from "../sim/types";
import type { Params } from "../params";

type Obj = PlantObject & { sway: number };
interface State {
  run: { dir: string; commit: string; fuseMode: string; waitForJobs: boolean; speed: number; paused: boolean };
  phase: string; eigen: number; calendar: number; factor: number;
  factorParts: { inhalt: number; ereignisse: number; hinschauen: number };
  viewers: number; plantingPoint: Vec3; center: Vec3; bounds: { min: Vec3; max: Vec3 } | null;
  triangles: number; plateauMax: number; params: Params;
  objects: Obj[]; photos: Photo[]; drawings: Drawing[]; pairs: Pair[];
  jobs: { id: number; kind: string; objectId: string; partnerId?: string; seconds: number }[]; queued: number;
  samples: Sample[]; sampleCount: number; events: SimEvent[];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number, d = 0) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const PHASE: Record<string, string> = { wachstum: "Wachstum", plateau: "Plateau", abstieg: "Abstieg", verfall: "Verfall", ende: "Vergangen" };
const KIND: Record<string, string> = { copy: "Kopie", compress: "Komprimierung", split: "Halbierung", crush: "Crush", fuse: "Verschmelzung" };
const STATE_COLOR: Record<string, number> = { keimling: 0x8fbf72, aktiv: 0x2e6a4c, verwelkend: 0xc08a2c, tot: 0x9aa19c };

// ---------------------------------------------------------------- scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
$("scene").appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9ece6);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
camera.position.set(6, 5, 9);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a88, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0xdfe3da, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(60, 60, 0xb9c0b5, 0xcfd5cb);
grid.position.y = 0.002;
scene.add(grid);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// helpers: planting point, moving centre, feed radius, bounding box, exclusion radius, pairs
const helpers = new THREE.Group();
scene.add(helpers);
const lineMat = (color: number, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
function circle(r: number, color: number, opacity = 1) {
  const pts = Array.from({ length: 129 }, (_, i) => { const a = (i / 128) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r); });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color, opacity));
}
const plantMark = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-0.3, 0.01, -0.3), new THREE.Vector3(0.3, 0.01, 0.3), new THREE.Vector3(0.3, 0.01, -0.3), new THREE.Vector3(-0.3, 0.01, 0.3),
]), lineMat(0x1c221e));
helpers.add(plantMark);
const centerMark = new THREE.Group();
centerMark.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-0.4, 0.01, 0), new THREE.Vector3(0.4, 0.01, 0), new THREE.Vector3(0, 0.01, -0.4), new THREE.Vector3(0, 0.01, 0.4),
]), lineMat(0x2e6a4c)));
centerMark.add(circle(0.2, 0x2e6a4c));
helpers.add(centerMark);
let feedRing = circle(1, 0x2e6a4c, 0.8);
helpers.add(feedRing);
let exclusionRing = circle(1, 0x5f6a63, 0.35);
helpers.add(exclusionRing);
const bboxHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x8a948c));
helpers.add(bboxHelper);
const pairLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0x1c221e, 0.6));
helpers.add(pairLines);

// ---------------------------------------------------------------- models

const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();
const loadGlb = (rel: string) => {
  let p = gltfCache.get(rel);
  if (!p) { p = loader.loadAsync(`/run/${rel}`); gltfCache.set(rel, p); }
  return p;
};
const texLoader = new THREE.TextureLoader();
const photoTex = new Map<string, THREE.Texture>();
function photoTexture(id: string, level: number) {
  const key = `${id}-${level}`;
  let t = photoTex.get(key);
  if (!t) { t = texLoader.load(`/api/photo/${id}/${level}`); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; photoTex.set(key, t); }
  return t;
}

let projection: "uv" | "plane" = "uv";

interface View {
  root: THREE.Group; // position, rotation, lift, sway
  model: THREE.Group | null; // current .glb clone, scaled
  glb: string;
  marker: THREE.Mesh; // state disc on the ground
  originRing: THREE.Line | null;
  photoKey: string;
  meshes: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; geometry: THREE.BufferGeometry }[];
  data: Obj;
  phase: number;
}
const views = new Map<string, View>();

function newView(o: Obj): View {
  const root = new THREE.Group();
  root.userData.objectId = o.id;
  const marker = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: STATE_COLOR[o.state], transparent: true, opacity: 0.35 }));
  marker.rotation.x = -Math.PI / 2;
  scene.add(root, marker);
  const v: View = { root, model: null, glb: "", marker, originRing: null, photoKey: "", meshes: [], data: o, phase: Math.random() * 10 };
  if (o.origin) { v.originRing = circle(1, 0x4d4038); scene.add(v.originRing); }
  root.position.set(o.pos[0], 0, o.pos[2]);
  return v;
}

async function setModel(v: View, rel: string) {
  v.glb = rel;
  const gltf = await loadGlb(rel);
  if (v.glb !== rel) return; // a newer version arrived meanwhile
  const model = gltf.scene.clone(true) as THREE.Group;
  v.meshes = [];
  model.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true;
    m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); // own materials per object
    v.meshes.push({ mesh: m, material: m.material, geometry: m.geometry });
  });
  if (v.model) v.root.remove(v.model);
  v.model = model;
  v.root.add(model);
  v.photoKey = "";
  applyLook(v);
}

/** Photo texture (reference only, the model keeps its own) and fading when dead. */
function applyLook(v: View) {
  const o = v.data;
  const key = o.photo ? `${o.photo.photoId}-${o.crushLevel}-${projection}` : "";
  if (key !== v.photoKey) {
    v.photoKey = key;
    for (const e of v.meshes) {
      e.mesh.geometry = e.geometry;
      if (!o.photo) { e.mesh.material = e.material; continue; }
      const tex = photoTexture(o.photo.photoId, o.crushLevel);
      const swap = (m: THREE.Material) => { const c = m.clone() as THREE.MeshStandardMaterial; c.map = tex; c.color?.set(0xffffff); return c; };
      e.mesh.material = Array.isArray(e.material) ? e.material.map(swap) : swap(e.material);
      if (projection === "plane") e.mesh.geometry = planarUv(e.geometry);
    }
  }
  const dead = o.state === "tot";
  for (const e of v.meshes) {
    for (const m of Array.isArray(e.mesh.material) ? e.mesh.material : [e.mesh.material]) {
      m.transparent = dead; m.opacity = dead ? 0.3 : 1;
    }
  }
}

const planarCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/** The photo projected from the front: u, v from the model's x and y. */
function planarUv(g: THREE.BufferGeometry) {
  let p = planarCache.get(g);
  if (p) return p;
  p = g.clone();
  p.computeBoundingBox();
  const b = p.boundingBox!, pos = p.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / Math.max(1e-6, b.max.x - b.min.x);
    uv[i * 2 + 1] = 1 - (pos.getY(i) - b.min.y) / Math.max(1e-6, b.max.y - b.min.y);
  }
  p.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  planarCache.set(g, p);
  return p;
}

// ---------------------------------------------------------------- photos and drawings

interface PhotoView { group: THREE.Group; plate: THREE.Mesh; blocked: boolean }
const photoViews = new Map<string, PhotoView>();
const placeholder = new THREE.MeshBasicMaterial({ color: 0x9aa19c, side: THREE.DoubleSide });

function syncPhotos(photos: Photo[]) {
  const seen = new Set<string>();
  for (const ph of photos) {
    if (ph.gone && !ph.blocked) continue;
    seen.add(ph.id);
    let pv = photoViews.get(ph.id);
    if (!pv) {
      const group = new THREE.Group();
      const t = texLoader.load(`/api/photo/${ph.id}/0`); t.colorSpace = THREE.SRGBColorSpace;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
      plate.position.y = 1.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2), new THREE.MeshBasicMaterial({ color: 0x8a948c }));
      pole.position.y = 0.6;
      group.add(plate, pole);
      group.position.set(ph.pos[0], 0, ph.pos[2]);
      scene.add(group);
      pv = { group, plate, blocked: false };
      photoViews.set(ph.id, pv);
    }
    if (ph.blocked && !pv.blocked) { pv.plate.material = placeholder; pv.blocked = true; }
  }
  for (const [id, pv] of photoViews) if (!seen.has(id)) { scene.remove(pv.group); photoViews.delete(id); }
}

interface DrawingView { group: THREE.Group; mesh: THREE.Mesh; texture: string }
const drawingViews = new Map<string, DrawingView>();

function syncDrawings(drawings: Drawing[]) {
  const seen = new Set<string>();
  for (const d of drawings) {
    seen.add(d.id);
    let dv = drawingViews.get(d.id);
    if (!dv) {
      const curve = new THREE.CatmullRomCurve3(d.points.map((q) => new THREE.Vector3(q[0], q[1], q[2])));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.015, 8), new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.4 }));
      mesh.castShadow = true;
      const group = new THREE.Group();
      group.add(mesh);
      scene.add(group);
      dv = { group, mesh, texture: "" };
      drawingViews.set(d.id, dv);
    }
    dv.group.userData.target = { pos: d.pos, scale: d.scale };
    if (d.texture && dv.texture !== d.texture.glb) {
      dv.texture = d.texture.glb;
      const view = dv;
      loadGlb(d.texture.glb).then((gltf) => {
        let map: THREE.Texture | null = null;
        gltf.scene.traverse((n) => { const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (!map && m?.map) map = m.map; });
        if (!map) return;
        const t = (map as THREE.Texture).clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 1); t.needsUpdate = true;
        view.mesh.material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
      });
    }
  }
  for (const [id, dv] of drawingViews) if (!seen.has(id)) { scene.remove(dv.group); drawingViews.delete(id); }
}

// ---------------------------------------------------------------- state sync

let state: State | null = null;
const samples: Sample[] = [];

async function poll() {
  try {
    const res = await fetch(`/api/state?since=${samples.length}`);
    const s = (await res.json()) as State;
    samples.push(...s.samples);
    state = s;
    sync(s);
    hud(s);
  } catch { /* server restarting */ }
  setTimeout(poll, 400);
}

function sync(s: State) {
  const seen = new Set<string>();
  for (const o of s.objects) {
    seen.add(o.id);
    let v = views.get(o.id);
    if (!v) { v = newView(o); views.set(o.id, v); }
    v.data = o;
    if (v.glb !== o.glb) setModel(v, o.glb);
    else applyLook(v);
    (v.marker.material as THREE.MeshBasicMaterial).color.setHex(o.origin ? 0x4d4038 : STATE_COLOR[o.state]);
  }
  for (const [id, v] of views) {
    if (seen.has(id)) continue;
    scene.remove(v.root, v.marker);
    if (v.originRing) scene.remove(v.originRing);
    views.delete(id);
  }
  syncPhotos(s.photos);
  syncDrawings(s.drawings);

  centerMark.position.set(s.center[0], 0, s.center[2]);
  plantMark.position.set(s.plantingPoint[0], 0, s.plantingPoint[2]);
  helpers.remove(feedRing, exclusionRing);
  feedRing = circle(s.params.feedRadius, 0x2e6a4c, 0.8); feedRing.position.set(s.center[0], 0.01, s.center[2]);
  exclusionRing = circle(s.params.exclusionRadius, 0x5f6a63, 0.35); exclusionRing.position.set(s.plantingPoint[0], 0.01, s.plantingPoint[2]);
  helpers.add(feedRing, exclusionRing);
  if (s.bounds) bboxHelper.box.set(new THREE.Vector3(...s.bounds.min), new THREE.Vector3(...s.bounds.max));
  bboxHelper.visible = !!s.bounds;
  const pts: THREE.Vector3[] = [];
  for (const p of s.pairs) {
    const a = s.objects.find((o) => o.id === p.a), b = s.objects.find((o) => o.id === p.b);
    if (a && b) pts.push(new THREE.Vector3(a.pos[0], 0.05, a.pos[2]), new THREE.Vector3(b.pos[0], 0.05, b.pos[2]));
  }
  pairLines.geometry.dispose();
  pairLines.geometry = new THREE.BufferGeometry().setFromPoints(pts);
}

// ---------------------------------------------------------------- HUD

function hud(s: State) {
  $("phase").textContent = PHASE[s.phase] ?? s.phase;
  $("run").textContent = `${s.run.dir} · ${s.run.commit} · ${s.run.fuseMode}`;
  const counts = { keimling: 0, aktiv: 0, verwelkend: 0, tot: 0, ursprung: 0 };
  for (const o of s.objects) { if (o.origin) counts.ursprung++; else counts[o.state]++; }
  const fp = s.factorParts;
  $("clock").innerHTML = [
    ["Kalendertag", fmt(s.calendar, 2)], ["Eigenzeit", fmt(s.eigen, 2)],
    ["Zeitfaktor", `${fmt(s.factor, 2)} × (Inhalt ${fmt(fp.inhalt, 2)}, Ereignisse ${fmt(fp.ereignisse, 2)}, Hinschauen ${fmt(fp.hinschauen, 2)})`],
    ["Dreiecke", `${fmt(s.triangles)} von ${fmt(s.params.budget)}`],
    ["Objekte", `${counts.keimling} Keimlinge, ${counts.aktiv} aktiv, ${counts.verwelkend} verwelkend, ${counts.ursprung} Ursprung`],
    ["Geräte", String(s.viewers)],
  ].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("");
  $("budget-bar").style.width = `${Math.min(100, (s.triangles / s.params.budget) * 100)}%`;
  $("pause").textContent = s.run.paused ? "Weiter" : "Pause";
  $("pause").classList.toggle("on", s.run.paused);
  const sel = $<HTMLSelectElement>("speed");
  if (document.activeElement !== sel) {
    const v = String(s.run.speed);
    if (![...sel.options].some((o) => o.value === v)) sel.add(new Option(`${fmt(s.run.speed, 2)} Tage/min`, v));
    sel.value = v;
  }
  $("jobs").innerHTML = s.jobs.length
    ? s.jobs.map((j) => `<div>${KIND[j.kind] ?? j.kind} ${j.objectId}${j.partnerId ? " + " + j.partnerId : ""} · ${j.seconds} s</div>`).join("") +
      (s.queued ? `<div class="muted">${s.queued} warten</div>` : "") + (s.run.waitForJobs ? `<div class="muted">Uhren warten auf die Jobs</div>` : "")
    : `<div class="muted">keine</div>`;
  const photos = s.photos.filter((p) => !p.gone || p.blocked);
  $("photos").innerHTML = photos.length ? photos.map((p) => {
    const user = s.objects.filter((o) => o.photo?.photoId === p.id).map((o) => o.id).join(", ");
    const age = s.calendar - p.createdAt;
    const status = p.blocked ? "gesperrt" : user ? `auf ${user}` : age < s.params.photoWaitDays ? `wartet noch ${fmt(s.params.photoWaitDays - age, 1)} Tage` : "frei";
    return `<div class="row"><span><b>${p.id}</b> · ${status}</span>${p.gone ? "" : `<span><button data-block="${p.id}">Sperren</button> <button data-delete="${p.id}">Löschen</button></span>`}</div>`;
  }).join("") : `<div class="muted">noch keine</div>`;
  $("log").innerHTML = s.events.slice().reverse().map((e) => `<div><b>${fmt(e.calendar, 2)}</b> ${e.text}</div>`).join("");
  drawChart(s);
}

function drawChart(s: State) {
  const c = $<HTMLCanvasElement>("chart");
  const box = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  c.width = box.width * dpr; c.height = box.height * dpr;
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const maxDay = Math.max(1, s.calendar), maxTri = Math.max(s.params.budget, s.plateauMax) * 1.05;
  const X = (d: number) => (d / maxDay) * box.width, Y = (v: number) => box.height - (v / maxTri) * box.height;
  ctx.strokeStyle = "#c2410c"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(0, Y(s.params.budget)); ctx.lineTo(box.width, Y(s.params.budget)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = "#2e6a4c"; ctx.lineWidth = 1.5; ctx.beginPath();
  samples.forEach((p, i) => (i ? ctx.lineTo(X(p.calendar), Y(p.triangles)) : ctx.moveTo(X(p.calendar), Y(p.triangles))));
  ctx.stroke();
}

async function cmd(body: Record<string, unknown>) {
  await fetch("/api/cmd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
$("pause").addEventListener("click", () => cmd({ type: state?.run.paused ? "resume" : "pause" }));
$("speed").addEventListener("change", (e) => cmd({ type: "speed", value: Number((e.target as HTMLSelectElement).value) }));
$("viewer-add").addEventListener("click", () => cmd({ type: "viewers", delta: 1 }));
$("viewer-remove").addEventListener("click", () => cmd({ type: "viewers", delta: -1 }));
$("photo-add").addEventListener("click", () => cmd({ type: "addPhoto" }));
$("drawing-add").addEventListener("click", () => cmd({ type: "addDrawing" }));
$("photos").addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.dataset.block) cmd({ type: "block", photoId: t.dataset.block });
  if (t.dataset.delete) cmd({ type: "delete", photoId: t.dataset.delete });
});
for (const [id, mode] of [["proj-uv", "uv"], ["proj-plane", "plane"]] as const) {
  $(id).addEventListener("click", () => {
    projection = mode;
    $("proj-uv").classList.toggle("on", mode === "uv"); $("proj-plane").classList.toggle("on", mode === "plane");
    for (const v of views.values()) applyLook(v);
  });
}
$("helpers").addEventListener("click", () => { helpers.visible = !helpers.visible; $("helpers").classList.toggle("on", helpers.visible); });

// hover: what is this object
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
renderer.domElement.addEventListener("pointermove", (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects([...views.values()].map((v) => v.root), true)[0];
  const tip = $("tip");
  let n: THREE.Object3D | null = hit?.object ?? null;
  while (n && !n.userData.objectId) n = n.parent;
  const o = n ? views.get(n.userData.objectId)?.data : undefined;
  if (!o) { tip.style.display = "none"; return; }
  tip.style.display = "block"; tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 14}px`;
  tip.innerHTML = `<b>${o.id}</b> · ${o.lineage}${o.origin ? " · Ursprung" : ""}<br>${o.state}, ${fmt(o.triangles)} Dreiecke<br>` +
    `Generation ${o.generation}, ${o.fusions} Verschmelzungen, ${o.halvings} Halbierungen<br>Crush ${o.crushLevel}, Höhe über Boden ${fmt(o.lift, 2)} m, Skalierung ${fmt(o.scale, 2)}` +
    (o.photo ? `<br>Foto ${o.photo.photoId}` : "") + `<br><span class="muted">${o.glb}</span>`;
});

// ---------------------------------------------------------------- frame loop

const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime(), k = 0.15;
  for (const v of views.values()) {
    const o = v.data;
    const h = (o.max[1] - o.min[1]) * o.scale;
    const sway = o.sway ? Math.sin(t * 1.4 + v.phase) * o.sway : 0;
    const targetY = o.lift - h * (1 - o.grow) + sway;
    v.root.position.x += (o.pos[0] - v.root.position.x) * k;
    v.root.position.z += (o.pos[2] - v.root.position.z) * k;
    v.root.position.y += (targetY - v.root.position.y) * k;
    v.root.rotation.y = o.rotY;
    if (v.model) { v.model.scale.setScalar(o.scale); v.model.position.y = -o.min[1] * o.scale; }
    const r = Math.max(0.15, Math.hypot(o.max[0] - o.min[0], o.max[2] - o.min[2]) / 2 * o.scale);
    v.marker.position.set(v.root.position.x, 0.004, v.root.position.z); v.marker.scale.setScalar(r);
    if (v.originRing) { v.originRing.position.set(v.root.position.x, 0.006, v.root.position.z); v.originRing.scale.setScalar(r + 0.08); }
  }
  for (const dv of drawingViews.values()) {
    const tg = dv.group.userData.target as { pos: Vec3; scale: number } | undefined;
    if (!tg) continue;
    dv.group.position.lerp(new THREE.Vector3(...tg.pos), k);
    dv.group.scale.setScalar(dv.group.scale.x + (tg.scale - dv.group.scale.x) * k);
  }
  for (const pv of photoViews.values()) {
    const p = pv.group.position;
    pv.plate.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z); // faces the camera
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
poll();
