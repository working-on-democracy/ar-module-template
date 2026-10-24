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
import type { Comment, Drawing, Pair, Photo, PlantObject, Sample, SimEvent, Vec3 } from "../sim/types";
import type { Params } from "../params";
import { modelMatrix } from "../sim/world";
import { decompose } from "../sim/pose";
import { grainOf, grainScaleOf, tintIntensity } from "../sim/look";
import { PlantingScene } from "../planting/scene";
import { loadingScreen, saveFile } from "../planting/ui";
import type { CatalogItem, PlantRules, Planting } from "../planting/rules";
import { photoLayer } from "../render/photo-layer";
import { commentCanvas } from "../render/comment-text";
import { commentLayer } from "../render/comment-layer";
import { strokeTubes } from "../render/stroke-tube";

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
  objects: Obj[]; photos: Photo[]; comments: Comment[]; drawings: Drawing[]; pairs: Pair[];
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

// The platform's light (ar-demo-backend ArScene.vue, #host-lights, checked at 0651352):
// ambient #BBB at 1 and a white directional light at 0.6 from (−0.5, 1, 1), casting
// shadows. Its three.js (r137, 8frame 1.3) still uses the old light units; since r155
// the same picture needs the intensities × π.
scene.add(new THREE.AmbientLight(0xbbbbbb, 1 * Math.PI));
const sun = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
sun.position.set(-0.5, 1, 1).normalize().multiplyScalar(15); // its direction; the distance only frames the shadow
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
// state discs and origin rings under the objects
const markers = new THREE.Group();
scene.add(markers);

// Preview: no GUI, no markers or helper lines. A dark grey ground hides what
// sinks into it and fades into a horizon (fog of the horizon's colour), above
// it the sky darkens upwards. P toggles it, Esc leaves it.
const HORIZON = 0x3d3d3d, ZENITH = 0x1c1c1c;
const previewGround = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 1 }));
previewGround.rotation.x = -Math.PI / 2;
previewGround.receiveShadow = true;
// sky dome: horizon colour at and below the horizon, darker towards the top; follows the camera
const skyGeometry = new THREE.SphereGeometry(400, 32, 16);
const skyColors: number[] = [], horizon = new THREE.Color(HORIZON), zenith = new THREE.Color(ZENITH), c = new THREE.Color();
const skyPos = skyGeometry.getAttribute("position");
for (let i = 0; i < skyPos.count; i++) {
  c.copy(horizon).lerp(zenith, Math.pow(Math.max(0, skyPos.getY(i) / 400), 0.6));
  skyColors.push(c.r, c.g, c.b);
}
skyGeometry.setAttribute("color", new THREE.Float32BufferAttribute(skyColors, 3));
const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -1;
const previewFog = new THREE.FogExp2(HORIZON, 0.014);
let preview = false;
function setPreview(on: boolean) {
  preview = on;
  document.body.classList.toggle("preview", on);
  if (on) scene.add(previewGround, sky); else scene.remove(previewGround, sky);
  scene.background = on ? horizon : new THREE.Color(0xe9ece6);
  scene.fog = on ? previewFog : null;
  ground.visible = !on;
  grid.visible = pairLines.visible = markers.visible = !on;
  helpers.visible = !on && $("helpers").classList.contains("on");
  $("preview").classList.toggle("on", on);
}
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).closest("input, select, textarea")) return;
  if (e.code === "KeyP") setPreview(!preview);
  else if (e.code === "Escape" && preview) setPreview(false);
});
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
function photoTexture(id: string, level: number, changes: number) {
  const key = `${id}-${level}-${changes}`;
  let t = photoTex.get(key);
  if (!t) {
    let done = () => {};
    const loaded = new Promise<void>((resolve) => { done = resolve; });
    const tex = texLoader.load(`/api/photo/${id}/${level}/${changes}`, () => done());
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
    t = { tex, loaded };
    photoTex.set(key, t);
  }
  return t;
}

let projection: "uv" | "plane" = "plane";
let grainOn = true;

// Grain shimmer: the shader of src/a-frame-components/grain-shimmer.ts, for plain three.js
// (strength and scale from sim/look.ts).
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
const withGrain = (mat: THREE.Material | THREE.Material[], u: GrainUniforms) =>
  Array.isArray(mat) ? mat.map((x) => grainMaterial(x, u)) : grainMaterial(mat, u);

interface View {
  root: THREE.Group; // position, rotation, lift, sway
  model: THREE.Group | null; // current .glb clone, scaled
  glb: string;
  marker: THREE.Mesh; // state disc on the ground
  originRing: THREE.Line | null;
  photoKey: string;
  commentKey: string; // the comment layer was made for this
  removeComment: (() => void) | null;
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
  scene.add(root); markers.add(marker);
  const grain = { grainStrength: { value: 0 }, grainScale: { value: 300 }, grainSeed: { value: 0 } };
  const v: View = { root, model: null, glb: "", marker, originRing: null, photoKey: "", commentKey: "", removeComment: null, meshes: [], grain, grainKey: "", data: o, phase: Math.random() * 10, placed: false };
  if (o.origin) { v.originRing = circle(1, 0x4d4038); markers.add(v.originRing); }
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
  v.grain.grainScale.value = grainScaleOf(v.data);
  if (v.model) v.root.remove(v.model);
  v.model = model;
  v.root.add(model);
  v.photoKey = "";
  v.commentKey = "";
  applyLook(v);
}

/** Photo texture (reference only, the model keeps its own) and fading when dead.
 *  The photo is projected from where it hangs, its shadow keeps the own material. */
function applyLook(v: View) {
  const o = v.data;
  v.grain.grainStrength.value = grainOf(o.triangles);
  const key = (o.photo && v.model ? `${o.photo.photoId}-${o.crushLevel}-${o.photo.changes}-${projection}-${JSON.stringify(o.photo.frame)}` : "") + (grainOn ? "|grain" : "");
  if (key !== v.photoKey) {
    v.photoKey = key;
    const ph = v.model ? o.photo : null, lit = ph ? litTriangles(v.model!, ph.frame) : null;
    const tex = ph ? photoTexture(ph.photoId, o.crushLevel, ph.changes) : null;
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
  applyComment(v);
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

const photoLayers = photoLayer(THREE);
const { litTriangles, splitLit, projectedUv, fitPhoto } = photoLayers;

/** A comment's text on the object (render/comment-layer.ts), made again when the comment or the model changes. */
const comments = commentLayer(THREE, photoLayers);
function applyComment(v: View) {
  const o = v.data, c = o.comment && state?.comments.find((x) => x.id === o.comment!.commentId);
  const key = c && v.model ? `${c.id}-${v.glb}-${JSON.stringify(o.comment!.frame)}` : "";
  if (key === v.commentKey) return;
  v.commentKey = key;
  v.removeComment?.();
  v.removeComment = c && v.model ? comments.add(v.model, o.comment!.frame, c.text, c.color) : null;
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
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
      plate.position.y = state?.params.photoHeight ?? 0.6; // floating a little above the ground
      group.add(plate);
      group.position.set(ph.pos[0], 0, ph.pos[2]);
      scene.add(group);
      pv = { group, plate, blocked: false };
      photoViews.set(ph.id, pv);
    }
    if (ph.blocked && !pv.blocked) { pv.plate.material = placeholder; pv.blocked = true; }
  }
  for (const [id, pv] of photoViews) if (!seen.has(id)) { scene.remove(pv.group); photoViews.delete(id); }
}

// comments at their place: the text on a plate, black as on the platform (blocked: grey)
interface CommentView { group: THREE.Group; plate: THREE.Mesh; blocked: boolean }
const commentViews = new Map<string, CommentView>();
function syncComments(comments: Comment[]) {
  const seen = new Set<string>();
  for (const c of comments) {
    if (c.gone && !c.blocked) continue;
    seen.add(c.id);
    let cv = commentViews.get(c.id);
    if (!cv) {
      const group = new THREE.Group();
      const tex = new THREE.CanvasTexture(commentCanvas(c.text, 1.5));
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, side: THREE.DoubleSide }));
      plate.position.y = state?.params.photoHeight ?? 0.6; // floating a little above the ground, like a photo
      group.add(plate);
      group.position.set(c.pos[0], 0, c.pos[2]);
      scene.add(group);
      cv = { group, plate, blocked: false };
      commentViews.set(c.id, cv);
    }
    if (c.blocked && !cv.blocked) { cv.plate.material = placeholder; cv.blocked = true; }
  }
  for (const [id, cv] of commentViews) if (!seen.has(id)) { scene.remove(cv.group); commentViews.delete(id); }
}

// drawings as the platform draws them (render/stroke-tube.ts): tubes with the same material
const tubes = strokeTubes(THREE);
interface DrawingView { group: THREE.Group; meshes: THREE.Mesh[]; texture: string }
const drawingViews = new Map<string, DrawingView>();

function syncDrawings(drawings: Drawing[]) {
  const seen = new Set<string>();
  for (const d of drawings) {
    seen.add(d.id);
    let dv = drawingViews.get(d.id);
    if (!dv) {
      const meshes = d.lines.map((l) => tubes.lineMesh(l)).filter((m): m is THREE.Mesh => !!m);
      const group = new THREE.Group();
      group.add(...meshes);
      scene.add(group);
      dv = { group, meshes, texture: "" };
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
        const mat = tubes.texturedMaterial(t);
        for (const m of view.meshes) m.traverse((n) => { if ((n as THREE.Mesh).isMesh) (n as THREE.Mesh).material = mat; });
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
    scene.remove(v.root); markers.remove(v.marker);
    if (v.originRing) markers.remove(v.originRing);
    views.delete(id);
  }
  syncPhotos(s.photos);
  syncComments(s.comments);
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
  for (const id of ["viewer-add", "viewer-remove", "photo-add", "drawing-add", "comment-add"]) $<HTMLButtonElement>(id).disabled = !!rp;
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
  const comments = s.comments.filter((c) => !c.gone || c.blocked);
  $("comments").innerHTML = comments.length ? comments.map((c) => {
    const user = s.objects.filter((o) => o.comment?.commentId === c.id).map((o) => o.id).join(", ");
    const age = s.calendar - c.createdAt;
    const status = c.blocked ? "gesperrt" : user ? `auf ${user}` : age < s.params.commentWaitDays ? `wartet noch ${fmt(s.params.commentWaitDays - age, 1)} Tage` : "frei";
    return `<div class="row"><span><b style="color:${c.color}">■</b> <b>${c.id}</b> · ${status}<br><span class="muted">${c.text.replace(/[<&]/g, (ch) => (ch === "<" ? "&lt;" : "&amp;"))}</span></span>${c.gone || rp ? "" : `<span><button data-block="${c.id}">Sperren</button> <button data-delete="${c.id}">Löschen</button></span>`}</div>`;
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
$("comment-add").addEventListener("click", () => cmd({ type: "addComment" }));
$("comments").addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.dataset.block) cmd({ type: "blockComment", commentId: t.dataset.block });
  if (t.dataset.delete) cmd({ type: "deleteComment", commentId: t.dataset.delete });
});
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
$("preview").addEventListener("click", () => setPreview(true));

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
    (o.photo ? `<br>Foto ${o.photo.photoId}` : "") + (o.comment ? `<br>Kommentar ${o.comment.commentId}` : "") + `<br><span class="muted">${o.glb}</span>`;
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

let planting: PlantingScene | null = null; // the planting scene, while a new run waits for its planting
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
  pairLines.visible = pts.length > 0 && !preview;
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
  planting?.update();
  if (preview) sky.position.copy(camera.position);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- planting
// A new run starts with the planting scene: the server waits for the planting,
// then the run starts with it. Left drag turns the object, the wheel sizes it;
// the right mouse button turns the view, W A S D moves.


async function begin() {
  const info = await (await fetch("/api/planting")).json() as { waiting: boolean; catalog: CatalogItem[]; rules: PlantRules };
  if (!info.waiting) { poll(); pollFrames(); return; }
  document.body.classList.add("planting");
  const buttons = { ...controls.mouseButtons };
  controls.mouseButtons = { LEFT: -1 as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.enableZoom = false;
  helpers.visible = false;
  camera.position.set(0, 2.4, 3.6); controls.target.set(0, 0, 0); // close to where the plant will stand
  const hint = document.createElement("div");
  hint.className = "planting-hint";
  hint.textContent = "Rechte Maustaste dreht die Ansicht, W A S D bewegt sie, Q / E nach unten / oben.";
  document.body.append(hint);
  const gltf = new GLTFLoader();
  planting = new PlantingScene({
    THREE, root: scene, camera, ui: document.body, desktop: true, maxAimDistance: 60,
    loadModel: async (item) => (await gltf.loadAsync(`/api/planting/models/${item.glb}`)).scene,
    onFinish: (plants, seed) => void plant(plants, seed).then(() => {
      planting?.dispose(); planting = null; hint.remove();
      controls.mouseButtons = buttons; controls.enableZoom = true;
      helpers.visible = $("helpers").classList.contains("on");
      document.body.classList.remove("planting");
    }),
  }, info.catalog, info.rules);
}

/** Hands the planting to the server and loads only what the first picture needs: the origin objects' models. */
async function plant(plants: Planting[], seed: number) {
  const load = loadingScreen(document.body);
  load.progress(0.05, "Die Pflanzung wird übergeben …");
  const res = await fetch("/api/planting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plants, seed }) });
  const answer = await res.json();
  if (!res.ok) { load.progress(0, `Fehler: ${answer.error}`); throw new Error("planting refused"); }
  saveFile(answer.file, JSON.stringify(answer.values, null, 2)); // to start the same run again: --values <file>
  load.progress(0.25, "Die Modelle werden geladen …");
  let done = 0;
  await Promise.all(plants.map((p) => loadGlb(`glb/${p.name}.glb`).then(() => load.progress(0.25 + (0.75 * ++done) / plants.length))));
  poll(); pollFrames();
  load.done();
}
frame();
begin().catch((e) => { console.error(e); poll(); pollFrames(); });
