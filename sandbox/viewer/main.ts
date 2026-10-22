// Viewer of the 3D sandbox: polls the server's state and shows every object
// with its current .glb version, photos, drawings and the reference points.
// It plays about PLAY_DELAY seconds behind the simulation: positions come from
// the server's frames (one per tick in which the clock moved) and are
// interpolated between them, everything else changes when the playback reaches
// the moment it happened.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Drawing, Pair, Photo, PhotoFrame, PlantObject, Sample, SimEvent, Vec3 } from "../sim/types";
import type { Params } from "../params";
import { modelMatrix } from "../sim/world";
import { decompose } from "../sim/pose";

type Obj = PlantObject & { sway: number; swayPeriod: number };
const REALTIME = 1 / 1440; // one calendar day per day (npm run sandbox -- --speed echtzeit)
const REALTIME_STEPS = [1, 2, 4, 8]; // the select's "echtzeit", "echtzeit2", … options
const speedValue = (v: string) => (v.startsWith("echtzeit") ? REALTIME * Number(v.slice(8) || 1) : Number(v));
const speedOption = (speed: number) => {
  const k = REALTIME_STEPS.find((n) => Math.abs(speed - REALTIME * n) < 1e-12);
  return k ? `echtzeit${k > 1 ? k : ""}` : String(speed);
};
interface State {
  run: { dir: string; commit: string; fuseMode: string | null; speed: number; paused: boolean;
    replay: { progress: number; done: boolean; diverged: boolean } | null; waitingFor: { id: number; kind: string; objectId: string; partnerId?: string } | null };
  phase: string; eigen: number; calendar: number; factor: number; fastFactor: number;
  factorParts: { inhalt: number; ereignisse: number; hinschauen: number };
  boostsPaused: boolean;
  slowed: boolean;
  lastWatched: number;
  viewers: number; plantingPoint: Vec3; gatherPoints: Vec3[]; center: Vec3; bounds: { min: Vec3; max: Vec3 } | null;
  triangles: number; plateauMax: number; params: Params; budget: number; compressAt: number; halvingAt: number;
  objects: Obj[]; photos: Photo[]; drawings: Drawing[]; pairs: Pair[];
  jobs: { id: number; kind: string; objectId: string; partnerId?: string; seconds: number }[]; queued: number;
  samples: Sample[]; sampleCount: number; events: SimEvent[];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number, d = 0) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const PHASE: Record<string, string> = { wachstum: "Wachstum", plateau: "Plateau", abstieg: "Abstieg", verfall: "Verfall", ende: "Vergangen" };
const KIND: Record<string, string> = { copy: "Kopie", compress: "Komprimierung", split: "Halbierung", crush: "Crush", pose: "Pose", fuse: "Verschmelzung" };
const STATE_COLOR: Record<string, number> = { keimling: 0x8fbf72, aktiv: 0x2e6a4c, verwelkend: 0xc08a2c, tot: 0x9aa19c };

// ---------------------------------------------------------------- scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("scene").appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9ece6);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
camera.position.set(6, 5, 9);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
// orbit about the pivot; WASD moves pivot and camera over the ground, Q/E down
// and up, Shift faster; double-click sets the pivot on an object and moves in
controls.minDistance = 0.3;
controls.maxDistance = 150;
controls.screenSpacePanning = true;
const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).closest("input, select, textarea")) return;
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
const fwd = new THREE.Vector3(), side = new THREE.Vector3(), move = new THREE.Vector3();
function walk(dt: number) {
  if (!keys.size) return;
  camera.getWorldDirection(fwd); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  side.crossVectors(fwd, camera.up).normalize();
  move.set(0, 0, 0);
  if (keys.has("KeyW")) move.add(fwd);
  if (keys.has("KeyS")) move.sub(fwd);
  if (keys.has("KeyD")) move.add(side);
  if (keys.has("KeyA")) move.sub(side);
  if (keys.has("KeyE")) move.y += 1;
  if (keys.has("KeyQ")) move.y -= 1;
  if (!move.lengthSq()) return;
  // faster when far away from the pivot, so both close-ups and the overview work
  const speed = Math.max(0.6, camera.position.distanceTo(controls.target) * 0.8) * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3 : 1);
  move.normalize().multiplyScalar(speed * dt);
  camera.position.add(move); controls.target.add(move);
  flight = null;
}

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a88, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// tight depth range and both biases against shadow acne (stripes on the models' own faces)
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 2, far: 45 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0xdfe3da, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(60, 60, 0xb9c0b5, 0xcfd5cb);
grid.position.y = 0.002;
scene.add(grid);

let pairMaterial: LineMaterial | null = null; // set below; needs the canvas size

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  pairMaterial?.resolution.set(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// helpers: planting point, magnetic points, moving centre, feed radius, bounding box, exclusion radius, pairs
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
// the descent's three magnetic points: a ring and a post at each corner, the triangle's edges on the ground
const GATHER_COLOR = 0x3b5bd6;
const gatherMark = new THREE.Group();
helpers.add(gatherMark);
let gatherKey = "";
function setGatherPoints(pts: Vec3[]) {
  const key = JSON.stringify(pts);
  if (key === gatherKey) return; // fixed when planted: rebuilt only for another run
  gatherKey = key;
  gatherMark.clear();
  if (!pts.length) return;
  gatherMark.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(q[0], 0.012, q[2]))), lineMat(GATHER_COLOR, 0.7)));
  for (const q of pts) {
    const ring = circle(0.15, GATHER_COLOR); ring.position.set(q[0], 0.012, q[2]);
    const post = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(q[0], 0, q[2]), new THREE.Vector3(q[0], 0.6, q[2])]), lineMat(GATHER_COLOR));
    gatherMark.add(ring, post);
  }
}
// dashed line between two objects of a pair while they move towards each other
// (fat lines: WebGL draws ordinary lines 1 px wide whatever their width)
pairMaterial = new LineMaterial({ color: 0xe0218a, linewidth: 4, dashed: true, dashSize: 0.14, gapSize: 0.09, depthTest: false, transparent: true });
pairMaterial.resolution.set(window.innerWidth, window.innerHeight);
const pairLines = new LineSegments2(new LineSegmentsGeometry(), pairMaterial);
pairLines.renderOrder = 10; // drawn over the models, so it stays visible
pairLines.frustumCulled = false;
scene.add(pairLines); // not under helpers: always shown
let movingPairs: Pair[] = [];

// ---------------------------------------------------------------- models

const loader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();
const loadGlb = (rel: string) => {
  let p = gltfCache.get(rel);
  if (!p) { p = loader.loadAsync(`/run/${rel}`); gltfCache.set(rel, p); }
  return p;
};
const texLoader = new THREE.TextureLoader();
const photoTex = new Map<string, { tex: THREE.Texture; loaded: Promise<void> }>();
function photoTexture(id: string, level: number) {
  const key = `${id}-${level}`;
  let t = photoTex.get(key);
  if (!t) {
    let done = () => {};
    const loaded = new Promise<void>((resolve) => { done = resolve; });
    const tex = texLoader.load(`/api/photo/${id}/${level}`, () => done());
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
    t = { tex, loaded };
    photoTex.set(key, t);
  }
  return t;
}

let projection: "uv" | "plane" = "plane";
let grainOn = true;

// Grain shimmer (concept: per object from its own triangles, 0.4 · 2^(−n/1000),
// 0 from 10 000; grainScale 2400 / model height; textures nearest, no mipmaps) —
// the shader of src/a-frame-components/grain-shimmer.ts, for plain three.js.
const grainOf = (triangles: number) => (triangles >= 10000 ? 0 : 0.4 * Math.pow(2, -triangles / 1000));
type GrainUniforms = { grainStrength: { value: number }; grainScale: { value: number }; grainSeed: { value: number } };
function grainMaterial(original: THREE.Material, u: GrainUniforms): THREE.Material {
  const m = original.clone() as THREE.MeshStandardMaterial;
  for (const key of ["map", "emissiveMap", "roughnessMap", "metalnessMap", "aoMap", "normalMap", "alphaMap"] as const) {
    const tex = m[key];
    if (!tex) continue;
    const own = tex.clone(); // shares the image, not the sampler
    own.minFilter = THREE.NearestFilter; own.magFilter = THREE.NearestFilter; own.generateMipmaps = false; own.needsUpdate = true;
    m[key] = own;
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGrainPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGrainPos = transformed;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vGrainPos;
uniform float grainStrength;
uniform float grainScale;
uniform float grainSeed;
float grainHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419) + grainSeed);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`)
      .replace("#include <map_fragment>", `#include <map_fragment>
diffuseColor.rgb *= 1.0 + (grainHash(floor(vGrainPos * grainScale)) - 0.5) * 2.0 * grainStrength;`);
  };
  m.customProgramCacheKey = () => "grain-shimmer";
  m.needsUpdate = true;
  return m;
}
// Emissive tint: pure hues differ a lot in brightness (yellow ~13× blue). The
// strength is scaled so every hue gives off as much light (relative luminance,
// linear) as the average pure hue does at that strength.
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (c: Vec3) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const pureHue = (h: number): Vec3 => {
  const k = (n: number) => (n + h * 6) % 6, f = (n: number) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5), f(3), f(1)];
};
const MEAN_HUE_LUMINANCE = Array.from({ length: 360 }, (_, i) => luminance(pureHue(i / 360))).reduce((a, b) => a + b, 0) / 360;
const tintIntensity = (t: { color: Vec3; strength: number }) => (t.strength * MEAN_HUE_LUMINANCE) / Math.max(1e-3, luminance(t.color));

const withGrain = (mat: THREE.Material | THREE.Material[], u: GrainUniforms) =>
  Array.isArray(mat) ? mat.map((x) => grainMaterial(x, u)) : grainMaterial(mat, u);

interface View {
  root: THREE.Group; // position, rotation, lift, sway
  model: THREE.Group | null; // current .glb clone, scaled
  glb: string;
  marker: THREE.Mesh; // state disc on the ground
  originRing: THREE.Line | null;
  photoKey: string;
  meshes: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[]; grainy: THREE.Material | THREE.Material[]; geometry: THREE.BufferGeometry }[];
  grain: GrainUniforms;
  grainKey: string;
  data: Obj;
  phase: number;
  placed: boolean; // root set once (new objects start where they are, not at the origin)
}
const views = new Map<string, View>();

function newView(o: Obj): View {
  const root = new THREE.Group();
  root.userData.objectId = o.id;
  const marker = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: STATE_COLOR[o.state], transparent: true, opacity: 0.35 }));
  marker.rotation.x = -Math.PI / 2;
  scene.add(root, marker);
  const grain = { grainStrength: { value: 0 }, grainScale: { value: 300 }, grainSeed: { value: 0 } };
  const v: View = { root, model: null, glb: "", marker, originRing: null, photoKey: "", meshes: [], grain, grainKey: "", data: o, phase: Math.random() * 10, placed: false };
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
    v.meshes.push({ mesh: m, material: m.material, grainy: withGrain(m.material, v.grain), geometry: m.geometry });
  });
  v.grain.grainScale.value = 2400 / Math.max(1e-6, v.data.max[1] - v.data.min[1]); // ~2400 cells over the model's height
  if (v.model) v.root.remove(v.model);
  v.model = model;
  v.root.add(model);
  v.photoKey = "";
  applyLook(v);
}

/** Photo texture (reference only, the model keeps its own) and fading when dead.
 *  The photo is projected from where it hangs, its shadow keeps the own material. */
function applyLook(v: View) {
  const o = v.data;
  v.grain.grainStrength.value = grainOf(o.triangles);
  const key = (o.photo && v.model ? `${o.photo.photoId}-${o.crushLevel}-${projection}-${JSON.stringify(o.photo.frame)}` : "") + (grainOn ? "|grain" : "");
  if (key !== v.photoKey) {
    v.photoKey = key;
    const ph = v.model ? o.photo : null, lit = ph ? litTriangles(v.model!, ph.frame) : null;
    const tex = ph ? photoTexture(ph.photoId, o.crushLevel) : null;
    const map = ph && tex && projection === "plane" ? fitPhoto(tex.tex, tex.loaded, ph.frame) : tex?.tex;
    for (const e of v.meshes) {
      e.mesh.geometry = e.geometry;
      const own = grainOn ? e.grainy : e.material;
      if (!ph || !lit) { e.mesh.material = own; continue; }
      const swap = (m: THREE.Material) => { const c = m.clone() as THREE.MeshStandardMaterial; c.map = map ?? null; c.color?.set(0xffffff); return grainOn ? grainMaterial(c, v.grain) : c; };
      const base = projection === "plane" ? projectedUv(e.geometry, e.mesh, v.model!, ph.frame) : e.geometry;
      if (Array.isArray(e.material) || Array.isArray(own)) { e.mesh.material = Array.isArray(e.material) ? e.material.map(swap) : swap(e.material); e.mesh.geometry = base; continue; } // several materials: photo all over
      e.mesh.geometry = splitLit(base, lit.get(e.mesh)!);
      e.mesh.material = [own, swap(e.material)];
    }
  }
  for (const e of v.meshes) {
    for (const m of Array.isArray(e.mesh.material) ? e.mesh.material : [e.mesh.material]) {
      const sm = m as THREE.MeshStandardMaterial;
      if (sm.emissive) { // emissive tint: the texture stays as it is; the model's own emissive comes back without a tint
        const own = (sm.userData.ownEmissive ??= { color: sm.emissive.clone(), intensity: sm.emissiveIntensity, map: sm.emissiveMap });
        if (o.tint) {
          sm.emissive.setRGB(o.tint.color[0], o.tint.color[1], o.tint.color[2], THREE.SRGBColorSpace);
          sm.emissiveIntensity = tintIntensity(o.tint); // same brightness for every hue
          if (sm.emissiveMap) { sm.emissiveMap = null; sm.needsUpdate = true; }
        } else {
          sm.emissive.copy(own.color); sm.emissiveIntensity = own.intensity;
          if (sm.emissiveMap !== own.map) { sm.emissiveMap = own.map; sm.needsUpdate = true; }
        }
      }
    }
  }
}

// The photo is projected from where it hangs (PhotoFrame, in the model's own
// frame). Only triangles the projection reaches get it; the ones in its shadow
// (facing away or behind another part of the model) keep their own material.
// The shadow comes from a small depth buffer seen from the photo.
const SHADOW_RES = 256;
const meshToModel = (mesh: THREE.Mesh, model: THREE.Object3D) => {
  model.updateMatrixWorld(true);
  return new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
};
const along = (p: THREE.Vector3, d: Vec3) => p.x * d[0] + p.y * d[1] + p.z * d[2];
/** Per mesh, per triangle: 1 = the projection reaches it. */
function litTriangles(model: THREE.Object3D, f: PhotoFrame): Map<THREE.Mesh, Uint8Array> {
  // every triangle as seen from the photo: pixel x, y and depth (larger = nearer the photo) per corner
  const meshes: { mesh: THREE.Mesh; tris: Float32Array }[] = [];
  const sx = SHADOW_RES / Math.max(1e-6, f.max[0] - f.min[0]), sy = SHADOW_RES / Math.max(1e-6, f.max[1] - f.min[1]);
  let dMin = Infinity, dMax = -Infinity;
  const p = new THREE.Vector3();
  model.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry, pos = g.getAttribute("position"), idx = g.getIndex(), m = meshToModel(mesh, model);
    const count = (idx ? idx.count : pos.count) / 3, tris = new Float32Array(count * 9);
    for (let i = 0; i < count * 3; i++) {
      p.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
      const d = along(p, f.dir);
      tris[i * 3] = (along(p, f.right) - f.min[0]) * sx; tris[i * 3 + 1] = (along(p, f.up) - f.min[1]) * sy; tris[i * 3 + 2] = d;
      dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
    }
    meshes.push({ mesh, tris });
  });
  const depth = new Float32Array(SHADOW_RES * SHADOW_RES).fill(-Infinity), owner = new Int32Array(SHADOW_RES * SHADOW_RES).fill(-1);
  const covered: boolean[] = [];
  const pixel = (x: number, y: number) => Math.min(SHADOW_RES - 1, Math.max(0, Math.floor(y))) * SHADOW_RES + Math.min(SHADOW_RES - 1, Math.max(0, Math.floor(x)));
  let id = 0;
  for (const { tris } of meshes) for (let t = 0; t < tris.length; t += 9, id++) {
    const [ax, ay, ad, bx, by, bd, cx, cy, cd] = tris.subarray(t, t + 9);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    covered[id] = false;
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(SHADOW_RES - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(SHADOW_RES - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const wa = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, wb = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, wc = 1 - wa - wb;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      covered[id] = true;
      const d = wa * ad + wb * bd + wc * cd, k = y * SHADOW_RES + x;
      if (d > depth[k]) { depth[k] = d; owner[k] = id; }
    }
  }
  const owns = new Uint8Array(id);
  for (const k of owner) if (k >= 0) owns[k] = 1;
  // a triangle smaller than a pixel: lit if its centre is not behind what the buffer holds there
  const eps = (dMax - dMin) * 0.01;
  const lit = new Map<THREE.Mesh, Uint8Array>();
  id = 0;
  for (const { mesh, tris } of meshes) {
    const out = new Uint8Array(tris.length / 9);
    for (let t = 0; t < out.length; t++, id++) {
      if (owns[id]) { out[t] = 1; continue; }
      if (covered[id]) continue;
      const q = tris.subarray(t * 9, t * 9 + 9), k = pixel((q[0] + q[3] + q[6]) / 3, (q[1] + q[4] + q[7]) / 3);
      if ((q[2] + q[5] + q[8]) / 3 >= depth[k] - eps) out[t] = 1;
    }
    lit.set(mesh, out);
  }
  return lit;
}
/** The geometry with two groups: 0 = in the shadow (own material), 1 = lit (photo). */
function splitLit(base: THREE.BufferGeometry, lit: Uint8Array) {
  const shade: number[] = [], light: number[] = [], idx = base.getIndex();
  for (let t = 0; t < lit.length; t++) {
    const list = lit[t] ? light : shade;
    for (let k = 0; k < 3; k++) list.push(idx ? idx.getX(t * 3 + k) : t * 3 + k);
  }
  const g = base.clone();
  g.setIndex([...shade, ...light]);
  g.clearGroups();
  g.addGroup(0, shade.length, 0);
  g.addGroup(shade.length, light.length, 1);
  return g;
}
/** UVs of the projection: the image spread over the frame, as seen from the photo. */
function projectedUv(g: THREE.BufferGeometry, mesh: THREE.Mesh, model: THREE.Object3D, f: PhotoFrame) {
  const out = g.clone(), pos = out.getAttribute("position"), m = meshToModel(mesh, model), p = new THREE.Vector3();
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m);
    uv[i * 2] = (along(p, f.right) - f.min[0]) / Math.max(1e-6, f.max[0] - f.min[0]);
    uv[i * 2 + 1] = 1 - (along(p, f.up) - f.min[1]) / Math.max(1e-6, f.max[1] - f.min[1]);
  }
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}
/** The photo fills the frame and keeps its proportions: what sticks out is cut off. */
function fitPhoto(tex: THREE.Texture, loaded: Promise<void>, f: PhotoFrame) {
  const t = tex.clone(); // shares the image
  const frame = (f.max[0] - f.min[0]) / Math.max(1e-6, f.max[1] - f.min[1]);
  void loaded.then(() => {
    const img = t.image as { width: number; height: number }, photo = img.width / Math.max(1, img.height);
    if (photo > frame) { t.repeat.set(frame / photo, 1); t.offset.set((1 - frame / photo) / 2, 0); }
    else { t.repeat.set(1, photo / frame); t.offset.set(0, (1 - photo / frame) / 2); }
    t.needsUpdate = true;
  });
  return t;
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

let state: State | null = null; // the newest from the server (controls, jobs)
let shown: State | null = null; // the one the playback has reached (scene, clock, log)
const pendingStates: State[] = [];
const samples: Sample[] = [];

async function poll() {
  try {
    const res = await fetch(`/api/state?since=${samples.length}`);
    const s = (await res.json()) as State;
    samples.push(...s.samples);
    if (state && s.run.dir !== state.run.dir) { frames.length = 0; pendingStates.length = 0; playCal = null; shown = null; } // restarted
    state = s;
    pendingStates.push(s);
    if (pendingStates.length > 400) pendingStates.splice(0, pendingStates.length - 400);
    if (shown) hud(shown); // controls and running jobs at once, not only when the playback reaches a state
  } catch { /* server restarting */ }
  setTimeout(poll, 400);
}

// ---------------------------------------------------------------- playback

interface Frame { seq: number; calendar: number; poses: Record<string, [Vec3, [number, number, number, number], number]>; drawings: Record<string, [Vec3, number]> }
const frames: Frame[] = [];
const PLAY_DELAY = 1.5; // real seconds behind the newest frame
let playCal: number | null = null; // calendar day the scene shows
let lastFrameAt = 0; // performance.now() when the newest frame came in

async function pollFrames() {
  try {
    const res = await fetch(`/api/frames?since=${frames.at(-1)?.seq ?? 0}`);
    const add = (await res.json()) as Frame[];
    if (add.length && frames.length && add[0].calendar < frames.at(-1)!.calendar) { frames.length = 0; playCal = null; } // restarted
    frames.push(...add);
    if (add.length) lastFrameAt = performance.now();
    if (frames.length > 900) frames.splice(0, frames.length - 900);
  } catch { /* server restarting */ }
  setTimeout(pollFrames, 150);
}

/** Moves the playback on: at the simulation's speed, pulled gently towards PLAY_DELAY behind the newest frame (slows down smoothly while the clock waits). */
function play(dt: number) {
  if (!state || !frames.length) return;
  const newest = frames.at(-1)!.calendar, rate = state.run.paused ? 0 : state.run.speed / 60; // calendar days per real second
  // while no new frames come (the clock waits for a job), the delay runs out: the playback
  // reaches the newest frame and stops there, so the waiting state is shown too
  // (after a short grace: between two frame polls the newest frame is always a little old)
  const delay = Math.max(0, PLAY_DELAY - Math.max(0, (performance.now() - lastFrameAt) / 1000 - 0.5));
  const target = Math.max(frames[0].calendar, newest - rate * delay);
  if (playCal === null || playCal < frames[0].calendar || target - playCal > rate * PLAY_DELAY * 6 + 1e-9) playCal = target; // start, or far behind
  else playCal += dt * rate + (target - playCal) * Math.min(1, dt * 0.8);
  playCal = Math.min(playCal, newest);
  // the state the playback has reached
  let next: State | null = null;
  while (pendingStates.length && pendingStates[0].calendar <= playCal + 1e-9) next = pendingStates.shift()!;
  if (next) show(next);
}

function show(s: State) {
  shown = s;
  sync(s);
  hud(s);
}

/** Index i with frames[i].calendar <= c < frames[i + 1].calendar (clamped). */
function frameAt(c: number) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].calendar <= c) lo = mid; else hi = mid - 1; }
  return lo;
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
/** An object's pose at the playback time: cubic Hermite through the frames (positions, scale), slerp (rotation); null if no frame has it. */
function poseAt(id: string, i: number, c: number): { p: THREE.Vector3; q: THREE.Quaternion; s: number } | null {
  const f0 = frames[i]?.poses[id], f1 = frames[i + 1]?.poses[id];
  if (!f0 && !f1) return null;
  if (!f0 || !f1) { const f = (f0 ?? f1)!; return { p: new THREE.Vector3(...f[0]), q: new THREE.Quaternion(...f[1]), s: f[2] }; }
  const t0 = frames[i].calendar, t1 = frames[i + 1].calendar, h = Math.max(1e-12, t1 - t0), u = Math.min(1, Math.max(0, (c - t0) / h));
  const fm = frames[i - 1]?.poses[id], fp = frames[i + 2]?.poses[id];
  const tm = fm ? frames[i - 1].calendar : t0, tp = fp ? frames[i + 2].calendar : t1;
  // a jump (a fused object put down, a swap): straight, no overshoot
  const far = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 0.3;
  const smooth = !far(f0[0], f1[0]) && (!fm || !far(fm[0], f0[0])) && (!fp || !far(f1[0], fp[0]));
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const herm = (a: number, b: number, am: number | undefined, bp: number | undefined) => {
    if (!smooth) return a + (b - a) * u;
    const ma = am === undefined ? (b - a) / h : (b - am) / (t1 - tm), mb = bp === undefined ? (b - a) / h : (bp - a) / (tp - t0);
    return h00 * a + h10 * h * ma + h01 * b + h11 * h * mb;
  };
  const p = new THREE.Vector3(...([0, 1, 2].map((k) => herm(f0[0][k], f1[0][k], fm?.[0][k], fp?.[0][k])) as Vec3));
  const q = new THREE.Quaternion().slerpQuaternions(qa.set(...f0[1]), qb.set(...f1[1]), u);
  return { p, q, s: herm(f0[2], f1[2], fm?.[2], fp?.[2]) };
}
function drawingAt(id: string, i: number, c: number): { pos: THREE.Vector3; scale: number } | null {
  const d0 = frames[i]?.drawings[id], d1 = frames[i + 1]?.drawings[id];
  if (!d0 || !d1) return null;
  const u = Math.min(1, Math.max(0, (c - frames[i].calendar) / Math.max(1e-12, frames[i + 1].calendar - frames[i].calendar)));
  return { pos: new THREE.Vector3(...d0[0]).lerp(new THREE.Vector3(...d1[0]), u), scale: d0[1] + (d1[1] - d0[1]) * u };
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
    (v.marker.material as THREE.MeshBasicMaterial).color.setHex(o.origin && o.state !== "tot" ? 0x4d4038 : STATE_COLOR[o.state]); // the dead: grey
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
  setGatherPoints(s.gatherPoints ?? []);
  helpers.remove(feedRing, exclusionRing);
  feedRing = circle(s.params.feedRadius, 0x2e6a4c, 0.8); feedRing.position.set(s.center[0], 0.01, s.center[2]);
  exclusionRing = circle(s.params.exclusionRadius, 0x5f6a63, 0.35); exclusionRing.position.set(s.plantingPoint[0], 0.01, s.plantingPoint[2]);
  helpers.add(feedRing, exclusionRing);
  if (s.bounds) bboxHelper.box.set(new THREE.Vector3(...s.bounds.min), new THREE.Vector3(...s.bounds.max));
  bboxHelper.visible = !!s.bounds;
  movingPairs = s.pairs.filter((p) => p.start !== null);
}

// ---------------------------------------------------------------- HUD

function hud(s: State) {
  const now = state ?? s; // controls and jobs: the newest state, not the played-back one
  const rp = now.run.replay;
  $("phase").textContent = PHASE[s.phase] ?? s.phase;
  $("run").textContent = rp
    ? `Wiedergabe ${s.run.dir} · ${fmt(rp.progress * 100)} %${rp.done ? " · zu Ende" : ""}${rp.diverged ? " · weicht ab!" : ""}`
    : `${s.run.dir} · ${s.run.commit} · ${s.run.fuseMode ?? "erste Verschmelzung hart, danach weich"}`;
  for (const id of ["viewer-add", "viewer-remove", "photo-add", "drawing-add"]) $<HTMLButtonElement>(id).disabled = !!rp;
  const counts = { keimling: 0, aktiv: 0, verwelkend: 0, tot: 0, ursprung: 0, halbiert: 0 };
  for (const o of s.objects) {
    if (o.origin) counts.ursprung++; else counts[o.state]++;
    if (!o.origin && o.state !== "tot" && o.halvings > 0) counts.halbiert++; // living pieces of a halving (also counted by state)
  }
  const fp = s.factorParts;
  $("clock").innerHTML = [
    ["Kalendertag", fmt(s.calendar, 2)], ["Eigenzeit", fmt(s.eigen, 2)],
    ["Zeitfaktor", s.boostsPaused ? `${s.slowed ? fmt(s.factor, 2) : 1} × (Boosts ausgesetzt${s.slowed ? ", verlangsamt" : ""}: seit ${fmt(s.calendar - s.lastWatched, 1)} Tagen hat niemand hingeschaut)` : `${fmt(s.factor, 2)} × (Inhalt ${fmt(fp.inhalt, 2)}, Ereignisse ${fmt(fp.ereignisse, 2)}, Hinschauen ${fmt(fp.hinschauen, 2)})${s.fastFactor !== s.factor ? `, Vorläufer ${fmt(s.fastFactor, 2)} ×` : ""}`],
    ["Dreiecke", `${fmt(s.triangles)} von ${fmt(s.budget)} (Komprimierung ab ${fmt(s.compressAt)}, Halbieren unter ${fmt(s.halvingAt)})`],
    ["Objekte", `${counts.keimling} Keimlinge, ${counts.aktiv} aktiv, ${counts.verwelkend} verwelkend, ${counts.ursprung} Ursprung · ${counts.halbiert} halbiert`],
    ["Geräte", String(s.viewers)],
  ].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("");
  $("budget-bar").style.width = `${Math.min(100, (s.triangles / s.budget) * 100)}%`;
  $("pause").textContent = now.run.paused ? "Weiter" : "Pause";
  $("pause").classList.toggle("on", now.run.paused);
  const sel = $<HTMLSelectElement>("speed");
  if (document.activeElement !== sel) {
    const v = speedOption(now.run.speed);
    if (![...sel.options].some((o) => o.value === v)) sel.add(new Option(`${fmt(now.run.speed, 2)} Tage/min`, v));
    sel.value = v;
  }
  const wf = now.run.waitingFor;
  $("jobs").innerHTML = rp ? `<div class="muted">Wiedergabe: nichts wird gerechnet</div>` :
    (wf ? `<div><b>Uhr wartet auf ${KIND[wf.kind] ?? wf.kind} ${wf.objectId}${wf.partnerId ? " + " + wf.partnerId : ""}</b></div>` : `<div class="muted">Uhr läuft</div>`) +
    now.jobs.map((j) => `<div>${KIND[j.kind] ?? j.kind} ${j.objectId}${j.partnerId ? " + " + j.partnerId : ""} · ${j.seconds} s</div>`).join("") +
    (now.queued ? `<div class="muted">${now.queued} weitere fertig oder in der Warteschlange</div>` : "") +
    `<div class="muted">Anzeige ${fmt(PLAY_DELAY, 1)} s hinter der Simulation</div>`;
  const photos = s.photos.filter((p) => !p.gone || p.blocked);
  $("photos").innerHTML = photos.length ? photos.map((p) => {
    const user = s.objects.filter((o) => o.photo?.photoId === p.id).map((o) => o.id).join(", ");
    const age = s.calendar - p.createdAt;
    const status = p.blocked ? "gesperrt" : user ? `auf ${user}` : age < s.params.photoWaitDays ? `wartet noch ${fmt(s.params.photoWaitDays - age, 1)} Tage` : "frei";
    return `<div class="row"><span><b>${p.id}</b> · ${status}</span>${p.gone || rp ? "" : `<span><button data-block="${p.id}">Sperren</button> <button data-delete="${p.id}">Löschen</button></span>`}</div>`;
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
  const maxDay = Math.max(1, s.calendar), maxTri = Math.max(s.budget, s.plateauMax) * 1.05;
  const X = (d: number) => (d / maxDay) * box.width, Y = (v: number) => box.height - (v / maxTri) * box.height;
  ctx.strokeStyle = "#c2410c"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(0, Y(s.budget)); ctx.lineTo(box.width, Y(s.budget)); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = "#2e6a4c"; ctx.lineWidth = 1.5; ctx.beginPath();
  samples.forEach((p, i) => (i ? ctx.lineTo(X(p.calendar), Y(p.triangles)) : ctx.moveTo(X(p.calendar), Y(p.triangles))));
  ctx.stroke();
}

async function cmd(body: Record<string, unknown>) {
  await fetch("/api/cmd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
$("pause").addEventListener("click", () => cmd({ type: state?.run.paused ? "resume" : "pause" }));
$("speed").addEventListener("change", (e) => {
  const v = (e.target as HTMLSelectElement).value;
  cmd({ type: "speed", value: speedValue(v) });
});
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
$("grain").addEventListener("click", () => {
  grainOn = !grainOn; $("grain").classList.toggle("on", grainOn);
  for (const v of views.values()) applyLook(v);
});
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
  tip.innerHTML = `<b>${o.id}</b> · ${o.lineage}${o.origin ? " · Ursprung" : ""}${o.fast ? " · schnelle Linie" : ""}<br>${o.state}, ${fmt(o.triangles)} Dreiecke<br>` +
    `Generation ${o.generation}${o.voxelCells ? ` (Voxel, ${o.voxelCells} Zellen)` : ""}, ${o.fusions} Verschmelzungen, ${o.halvings} Halbierungen<br>Crush ${o.crushLevel}, Höhe über Boden ${fmt(o.lift, 2)} m, Skalierung ${fmt(o.scale, 2)}${o.tilt ? `, Neigung ${fmt((o.tilt.angle * 180) / Math.PI, 1)}°` : ""}<br>${o.tint ? `Leuchtfarbe <span style="color:rgb(${o.tint.color.map((c) => Math.round(c * 255)).join(",")})">■</span> ${fmt(o.tint.strength * 100)} % (Intensität ${fmt(tintIntensity(o.tint), 3)}), ` : ""}Grain ${fmt(grainOf(o.triangles), 3)}, Schweben ${fmt(o.sway * 100, 1)} cm alle ${fmt(o.swayPeriod, 1)} s` +
    (o.photo ? `<br>Foto ${o.photo.photoId}` : "") + `<br><span class="muted">${o.glb}</span>`;
});

// double-click: pivot on what is under the cursor, camera ~2 m away from it
let flight: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;
renderer.domElement.addEventListener("dblclick", (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const targets = [...views.values()].map((v) => v.root as THREE.Object3D).concat([ground]);
  const hit = ray.intersectObjects(targets, true)[0];
  if (!hit) return;
  let n: THREE.Object3D | null = hit.object, focus = hit.point.clone();
  while (n && !n.userData.objectId) n = n.parent;
  if (n) new THREE.Box3().setFromObject(n).getCenter(focus); // an object: its centre
  const dir = camera.position.clone().sub(controls.target).normalize();
  flight = { from: camera.position.clone(), to: focus.clone().add(dir.multiplyScalar(2)), tFrom: controls.target.clone(), tTo: focus, start: performance.now() };
});

// ---------------------------------------------------------------- frame loop

const clock = new THREE.Clock();
const tmpPos = new THREE.Vector3(), tmpQuat = new THREE.Quaternion();
let tmpScale = 1;
function frame() {
  const dt = clock.getDelta(), t = clock.elapsedTime, k = 0.15;
  walk(dt);
  play(dt);
  if (!shown && state) show(state); // nothing played back yet (no step so far)
  const fi = playCal === null ? -1 : frameAt(playCal);
  for (const v of views.values()) {
    const o = v.data;
    // floating: bobs up from where it stands, never below it
    const sway = o.sway ? o.sway * (1 - Math.cos((t * 2 * Math.PI) / Math.max(0.5, o.swayPeriod) + v.phase)) / 2 : 0;
    // root = the model frame in the world, as the simulation computes it: the
    // travelling pose, or standing (lift, growing, leaning) — from the frames
    // at the playback time, else from the shown state
    const fp = fi >= 0 ? poseAt(o.id, fi, playCal!) : null;
    if (fp) { tmpPos.copy(fp.p); tmpQuat.copy(fp.q); tmpScale = fp.s; }
    else { const pose = decompose(modelMatrix(o)); tmpPos.set(...pose.p); tmpQuat.set(...pose.q); tmpScale = pose.s; }
    tmpPos.y += sway;
    if (fp || !v.placed) { v.root.position.copy(tmpPos); v.root.quaternion.copy(tmpQuat); v.root.scale.setScalar(tmpScale); v.placed = true; }
    else {
      v.root.position.lerp(tmpPos, k);
      v.root.quaternion.slerp(tmpQuat, k);
      v.root.scale.setScalar(v.root.scale.x + (tmpScale - v.root.scale.x) * k);
    }
    if (v.model) { v.model.scale.setScalar(1); v.model.position.set(0, 0, 0); }
    const r = Math.max(0.15, Math.hypot(o.max[0] - o.min[0], o.max[2] - o.min[2]) / 2 * (o.pose ? o.pose.s : o.scale));
    v.marker.position.set(v.root.position.x, 0.004, v.root.position.z); v.marker.scale.setScalar(r);
    if (v.originRing) { v.originRing.position.set(v.root.position.x, 0.006, v.root.position.z); v.originRing.scale.setScalar(r + 0.08); }
  }
  const pts: THREE.Vector3[] = [];
  for (const p of movingPairs) {
    const a = views.get(p.a), b = views.get(p.b);
    if (a?.model && b?.model) pts.push(new THREE.Box3().setFromObject(a.root).getCenter(new THREE.Vector3()), new THREE.Box3().setFromObject(b.root).getCenter(new THREE.Vector3()));
  }
  pairLines.geometry.dispose();
  const geo = new LineSegmentsGeometry();
  geo.setPositions(pts.flatMap((v) => [v.x, v.y, v.z]));
  pairLines.geometry = geo;
  pairLines.visible = pts.length > 0;
  if (pts.length) pairLines.computeLineDistances();
  for (const [id, dv] of drawingViews) {
    const fd = fi >= 0 ? drawingAt(id, fi, playCal!) : null;
    if (fd) { dv.group.position.copy(fd.pos); dv.group.scale.setScalar(fd.scale); continue; }
    const tg = dv.group.userData.target as { pos: Vec3; scale: number } | undefined;
    if (!tg) continue;
    dv.group.position.lerp(new THREE.Vector3(...tg.pos), k);
    dv.group.scale.setScalar(dv.group.scale.x + (tg.scale - dv.group.scale.x) * k);
  }
  for (const pv of photoViews.values()) {
    const p = pv.group.position;
    pv.plate.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z); // faces the camera
  }
  if (flight) {
    const u = Math.min(1, (performance.now() - flight.start) / 600), e = u * u * (3 - 2 * u);
    camera.position.lerpVectors(flight.from, flight.to, e);
    controls.target.lerpVectors(flight.tFrom, flight.tTo, e);
    if (u >= 1) flight = null;
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
poll();
pollFrames();
