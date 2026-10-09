#!/usr/bin/env -S npx tsx
// Fuses two .glb models into one — run via `npm run fuse -- <a.glb> <b.glb> [options]`.
// Short version of what this does:
//
//   - Both models keep their original size (unless --match, or --match-height:
//     B scaled so its height after the rotation equals A's). B gets a seeded
//     random rotation about all three axes and a random position near A's
//     centre; the pose is re-rolled until B overlaps the smaller model by
//     5–60 % of its volume (--overlap), so the two really grow into each
//     other instead of barely touching or one swallowing the other.
//   - Three ways to fuse (--mode):
//       hart   exact boolean union (manifold-3d). Every texture coordinate and
//              material survives; cut edges are sharp.
//       weich  both shapes as distance fields, joined with a rounded fillet
//              (--fillet, fraction of A's height) and remeshed. Textures are
//              carried over from the nearest point of whichever model is
//              closer; slow (tens of seconds).
//       voxel  both shapes sampled on a cube grid (--voxel-cells over the
//              largest side); every visible cube face gets ONE texture colour
//              — the pixel look.
//   - Inputs may be anything earlier steps produced, compressed or not
//     (dequantized on load): raw Sloyd models, stylized ones, earlier fusions.
//     A model that isn't a closed solid is made one first: welded, faces
//     turned consistently outward, parts that only touch along an edge kept
//     apart — and if that still fails, rebuilt as a distance-field solid.
//     Voxel models are recognised automatically and rebuilt from real cubes,
//     so their edges stay sharp in a hard fusion.
//
// Output: an uncompressed .glb (float geometry, both models' materials, one
// primitive per material) — by default into generated-assets/, which is
// gitignored and never shipped. Reduce/compress it afterwards with
// `npm run reduce` (look kept) or `npm run stylize` (re-stylized).
// See cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md.
import { parseArgs } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, type Document, type Material } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dequantize, mergeDocuments, prune } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import ManifoldModule from "manifold-3d";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NP = 6; // vertex properties: x y z u v material

const USAGE = `Usage:
  npm run fuse -- <a.glb> <b.glb> [options]
  npm run fuse -- <a.glb> --mode voxel [--voxel-cells n]     (one model voxelized on its own)

Options:
  --mode <m>           hart (exact union, default) | weich (rounded, slow) | voxel (cube grid)
  --seed <n>           pose seed (default 1); the same seed gives the same result
  --match              scale B so its largest side is 80 % of A's (for very different sizes)
  --match-height       scale B so its height AFTER its rotation (world y) equals A's height
  --min-fill <x>       a model whose volume is below x × its convex hull's volume (hollow or thin,
                       e.g. a lamp shade) is closed: open edges capped, then enveloped until it
                       reaches --fill-target (default 2 × min-fill). Default 0 = off
  --opening <x>        an open edge loop at least x × the model's largest side (an umbrella's rim)
                       is always capped (default 0.25; only with --min-fill > 0)
  --close <a|b|ab>     always envelop these models (extreme cases no measure catches, e.g. a fringed
                       umbrella), radius --close-radius × their largest side (default 0.15)
  --repair             repair every model's edges shared by more than two faces (faces removed, holes
                       capped), so it fuses as an exact solid instead of a coarse distance-field rebuild
  --measure            only print each model's fill (volume / convex hull volume) and stop
  --overlap <a-b>      accepted overlap of the smaller model, fraction of its volume (default 0.05-0.6)
  --fillet <x>         weich: fillet radius as a fraction of A's height (default 0.08)
  --voxel-cells <n>    voxel: grid cells over the largest side (default 40)
  --out <path>         output file (default generated-assets/<a>+<b>-<mode>.glb)`;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
const sec = (t: number) => `${((performance.now() - t) / 1000).toFixed(2)} s`;

// ---------------------------------------------------------------------------
// loading: all primitives of a model, world transforms baked, one triangle soup
// ---------------------------------------------------------------------------

interface Model {
  name: string;
  file: string;
  mats: Material[];
  P: Float32Array;
  UV: Float32Array;
  I: Uint32Array;
  vMat: Uint16Array;
  box: THREE.Box3;
  inside(x: number, y: number, z: number): boolean;
  sdf(x: number, y: number, z: number): number; // > 0 inside
  udf(x: number, y: number, z: number): number; // distance to the surface
  wrapped?: boolean; // sdf replaced by an enveloping field — always rebuilt from it
  uvMatAt(x: number, y: number, z: number): [number, number, number];
}

async function readDoc(io: NodeIO, file: string): Promise<Document> {
  const doc = await io.read(file);
  await doc.transform(dequantize());
  return doc;
}

async function load(io: NodeIO, file: string): Promise<Model> {
  const doc = await readDoc(io, file);
  const mats = doc.getRoot().listMaterials();
  const P: number[] = [], UV: number[] = [], I: number[] = [], vMat: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const wm = new THREE.Matrix4().fromArray(node.getWorldMatrix()), v = new THREE.Vector3();
    for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute("POSITION"), ta = prim.getAttribute("TEXCOORD_0"), ia = prim.getIndices();
      if (!pa) continue;
      const base = P.length / 3, mi = Math.max(0, mats.indexOf(prim.getMaterial() as Material));
      for (let i = 0; i < pa.getCount(); i++) {
        v.fromArray(pa.getElement(i, []) as number[]).applyMatrix4(wm);
        P.push(v.x, v.y, v.z);
        const t = ta ? (ta.getElement(i, []) as number[]) : [0, 0];
        UV.push(t[0], t[1]);
        vMat.push(mi);
      }
      const n = ia ? ia.getCount() : pa.getCount();
      for (let i = 0; i < n; i++) I.push(base + (ia ? ia.getScalar(i) : i));
    }
  }
  if (!I.length) fail(`${file} has no triangles.`);
  return buildModel(basename(file, extname(file)), file, mats, new Float32Array(P), new Float32Array(UV), new Uint32Array(I), new Uint16Array(vMat));
}

function buildModel(name: string, file: string, mats: Material[], P: Float32Array, UV: Float32Array, I: Uint32Array, vMat: Uint16Array): Model {
  const m = { name, file, mats, P, UV, I, vMat } as Model;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(m.P, 3));
  geo.setIndex(new THREE.BufferAttribute(m.I, 1));
  const bvh = new MeshBVH(geo), hit: any = {}, q = new THREE.Vector3(), ray = new THREE.Ray(), out = new THREE.Vector2();
  const dirs = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const vec = (i: number) => new THREE.Vector3(m.P[3 * i], m.P[3 * i + 1], m.P[3 * i + 2]);
  const uvv = (i: number) => new THREE.Vector2(m.UV[2 * i], m.UV[2 * i + 1]);
  m.box = new THREE.Box3().setFromArray(m.P);
  // inside = odd number of hits along at least two of three axis rays (robust against small holes)
  m.inside = (x, y, z) => {
    let n = 0;
    q.set(x, y, z);
    for (const d of dirs) { ray.set(q, d); if ((bvh.raycast(ray, THREE.DoubleSide) as unknown[]).length % 2) n++; }
    return n >= 2;
  };
  m.sdf = (x, y, z) => { q.set(x, y, z); bvh.closestPointToPoint(q, hit); return m.inside(x, y, z) ? hit.distance : -hit.distance; };
  m.udf = (x, y, z) => { q.set(x, y, z); bvh.closestPointToPoint(q, hit); return hit.distance; };
  m.uvMatAt = (x, y, z) => {
    q.set(x, y, z);
    bvh.closestPointToPoint(q, hit);
    const f = hit.faceIndex as number, a = m.I[3 * f], b = m.I[3 * f + 1], c = m.I[3 * f + 2];
    THREE.Triangle.getInterpolation(hit.point, vec(a), vec(b), vec(c), uvv(a), uvv(b), uvv(c), out);
    return [out.x, out.y, m.vMat[a]];
  };
  return m;
}

// ---------------------------------------------------------------------------
// closing thin, open shapes (an open umbrella: a sheet with almost no volume)
// ---------------------------------------------------------------------------

// Caps every open boundary loop (edges with one face, after welding exact
// positions) with a fan from the loop's centre, split into rings so the
// texture taken from the nearest point of the original surface can vary
// across the cap.
function capHoles(m: Model): { model: Model; loops: number; largest: number } {
  const n = m.P.length / 3, map = new Map<string, number>(), w = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${m.P[3 * i]},${m.P[3 * i + 1]},${m.P[3 * i + 2]}`;
    if (!map.has(k)) map.set(k, i);
    w[i] = map.get(k)!;
  }
  const count = new Map<string, number>();
  for (let c = 0; c < m.I.length; c += 3) for (let e = 0; e < 3; e++) {
    const a = w[m.I[c + e]], b = w[m.I[c + (e + 1) % 3]], k = a < b ? `${a}_${b}` : `${b}_${a}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  // boundary edges as an undirected graph: faces next to a hole may point
  // either way (direct() turns them consistently later)
  const next = new Map<number, number[]>();
  for (const [k, c] of count) {
    if (c !== 1) continue;
    const [a, b] = k.split("_").map(Number);
    (next.get(a) ?? next.set(a, []).get(a)!).push(b);
    (next.get(b) ?? next.set(b, []).get(b)!).push(a);
  }
  const take = (a: number, b: number) => { const l = next.get(b)!; l.splice(l.indexOf(a), 1); };
  // walk boundary edges; a vertex met twice closes a cycle (handles vertices
  // where several loops touch)
  const loops: number[][] = [];
  for (const start of next.keys()) {
    while (next.get(start)!.length) {
      const path = [start], at = new Map<number, number>([[start, 0]]);
      let v = start;
      for (;;) {
        const out = next.get(v);
        if (!out?.length) break;
        const from = v;
        v = out.pop()!;
        take(from, v);
        const seenAt = at.get(v);
        if (seenAt !== undefined) {
          const cycle = path.splice(seenAt);
          for (const x of cycle) at.delete(x);
          if (cycle.length >= 3) loops.push(cycle);
          if (!path.length) break;
          path.push(v); at.set(v, path.length - 1);
          continue;
        }
        at.set(v, path.length); path.push(v);
      }
    }
  }
  let largest = 0;
  for (const loop of loops) {
    const b = new THREE.Box3();
    for (const i of loop) b.expandByPoint(new THREE.Vector3(m.P[3 * i], m.P[3 * i + 1], m.P[3 * i + 2]));
    largest = Math.max(largest, Math.max(...b.getSize(new THREE.Vector3()).toArray()));
  }
  const P = Array.from(m.P), UV = Array.from(m.UV), I = Array.from(m.I), vMat = Array.from(m.vMat);
  const add = (x: number, y: number, z: number) => {
    const [u, v, mat] = m.uvMatAt(x, y, z);
    P.push(x, y, z); UV.push(u, v); vMat.push(mat);
    return P.length / 3 - 1;
  };
  const RINGS = 4;
  for (const loop of loops) {
    const c = new THREE.Vector3();
    for (const i of loop) c.add(new THREE.Vector3(m.P[3 * i], m.P[3 * i + 1], m.P[3 * i + 2]));
    c.divideScalar(loop.length);
    const centre = add(c.x, c.y, c.z);
    // ring[r][j]: vertex r/RINGS of the way from the rim (r = 0) to the centre
    const ring: number[][] = [loop.map((i) => add(m.P[3 * i], m.P[3 * i + 1], m.P[3 * i + 2]))];
    for (let r = 1; r < RINGS; r++) {
      const t = r / RINGS;
      ring.push(loop.map((i) => add(m.P[3 * i] + (c.x - m.P[3 * i]) * t, m.P[3 * i + 1] + (c.y - m.P[3 * i + 1]) * t, m.P[3 * i + 2] + (c.z - m.P[3 * i + 2]) * t)));
    }
    const L = loop.length;
    for (let r = 0; r < RINGS - 1; r++) for (let j = 0; j < L; j++) {
      const a = ring[r][j], b = ring[r][(j + 1) % L], a2 = ring[r + 1][j], b2 = ring[r + 1][(j + 1) % L];
      I.push(b, a, a2, b, a2, b2); // reversed against the boundary direction: faces the same way as the surface
    }
    for (let j = 0; j < L; j++) I.push(ring[RINGS - 1][(j + 1) % L], ring[RINGS - 1][j], centre);
  }
  const model = buildModel(m.name, m.file, m.mats, new Float32Array(P), new Float32Array(UV), new Uint32Array(I), new Uint16Array(vMat));
  model.uvMatAt = m.uvMatAt; // texture from the original surface, also on the caps
  return { model, loops: loops.length, largest };
}

// Repairs what keeps a model from being a closed solid (so it would be
// rebuilt coarsely from a distance field): edges shared by more than two
// faces, and spots where the faces can't all be turned the same way
// (locally twisted surface). The faces there are removed and the holes
// capped — repeated a few times, since a cap can expose the next spot.
function repairEdges(m: Model): { model: Model; edges: number } {
  let edges = 0;
  for (let pass = 0; pass < 5; pass++) {
    const n = m.P.length / 3, map = new Map<string, number>(), w = new Uint32Array(n), pos: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = `${m.P[3 * i]},${m.P[3 * i + 1]},${m.P[3 * i + 2]}`;
      if (!map.has(k)) { map.set(k, map.size); pos.push(m.P[3 * i], m.P[3 * i + 1], m.P[3 * i + 2]); }
      w[i] = map.get(k)!;
    }
    const nT = m.I.length / 3, faces = new Map<string, number[]>();
    for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) {
      const a = w[m.I[3 * t + e]], b = w[m.I[3 * t + (e + 1) % 3]], k = a < b ? `${a}_${b}` : `${b}_${a}`;
      (faces.get(k) ?? faces.set(k, []).get(k)!).push(t);
    }
    const drop = new Set<number>();
    for (const fs of faces.values()) if (fs.length > 2) { edges++; for (const f of fs) drop.add(f); }
    if (!drop.size) {
      // orientation conflicts: after turning every part outward, a directed edge used twice
      const tri = new Uint32Array(m.I.length);
      for (let c = 0; c < tri.length; c++) tri[c] = w[m.I[c]];
      orient(tri, pos);
      const owner = new Map<string, number>();
      for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) {
        const k = `${tri[3 * t + e]}>${tri[3 * t + (e + 1) % 3]}`;
        if (owner.has(k)) { edges++; drop.add(t); drop.add(owner.get(k)!); } else owner.set(k, t);
      }
    }
    if (!drop.size) break;
    const I: number[] = [];
    for (let t = 0; t < nT; t++) if (!drop.has(t)) I.push(m.I[3 * t], m.I[3 * t + 1], m.I[3 * t + 2]);
    const cut = buildModel(m.name, m.file, m.mats, m.P, m.UV, new Uint32Array(I), m.vMat);
    cut.uvMatAt = m.uvMatAt;
    m = capHoles(cut).model;
  }
  return { model: m, edges };
}

// Envelops the model like shrink-wrap: everything closer to the surface than
// `radius` is filled, the outside floods in from the edge of a grid, and the
// result shrinks back by `radius` — openings narrower than about 2 × radius
// are closed, the rest of the shape stays. Texture from the nearest point of
// the original surface.
function wrapModel(m: Model, radius: number, cells = 80): Model {
  const pad = radius + 0.05 * Math.max(...m.box.getSize(new THREE.Vector3()).toArray());
  const min = m.box.min.clone().subScalar(pad), size = m.box.getSize(new THREE.Vector3()).addScalar(2 * pad);
  const h = Math.max(size.x, size.y, size.z) / cells;
  const nx = Math.ceil(size.x / h) + 1, ny = Math.ceil(size.y / h) + 1, nz = Math.ceil(size.z / h) + 1, N = nx * ny * nz;
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const blocked = new Uint8Array(N);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (m.udf(min.x + i * h, min.y + j * h, min.z + k * h) <= radius) blocked[idx(i, j, k)] = 1;
  }
  // flood the outside from the grid border
  const outside = new Uint8Array(N), queue: number[] = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if ((i && j && k && i < nx - 1 && j < ny - 1 && k < nz - 1) || blocked[idx(i, j, k)]) continue;
    const c = idx(i, j, k); outside[c] = 1; queue.push(c);
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q], i = c % nx, j = ((c / nx) | 0) % ny, k = (c / (nx * ny)) | 0;
    for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const a = i + di, b = j + dj, d = k + dk;
      if (a < 0 || b < 0 || d < 0 || a >= nx || b >= ny || d >= nz) continue;
      const o = idx(a, b, d);
      if (outside[o] || blocked[o]) continue;
      outside[o] = 1; queue.push(o);
    }
  }
  // exact Euclidean distance (in cells) of every cell to the outside —
  // separable squared-distance transform (Felzenszwalb & Huttenlocher), x, y, z
  const BIG = 1e20, d2 = new Float64Array(N);
  for (let c = 0; c < N; c++) d2[c] = outside[c] ? 0 : BIG;
  const line = (len: number, get: (t: number) => number, set: (t: number, v: number) => void) => {
    const f = new Float64Array(len), v = new Int32Array(len), z = new Float64Array(len + 1);
    for (let t = 0; t < len; t++) f[t] = get(t);
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let sct = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (sct <= z[k]) { k--; sct = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = sct; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; set(q, (q - v[k]) * (q - v[k]) + f[v[k]]); }
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) line(nx, (t) => d2[idx(t, j, k)], (t, x) => { d2[idx(t, j, k)] = x; });
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) line(ny, (t) => d2[idx(i, t, k)], (t, x) => { d2[idx(i, t, k)] = x; });
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) line(nz, (t) => d2[idx(i, j, t)], (t, x) => { d2[idx(i, j, t)] = x; });
  const dist = new Float32Array(N);
  for (let c = 0; c < N; c++) dist[c] = Math.sqrt(d2[c]);
  const field = (x: number, y: number, z: number) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - min.x) / h)), fy = Math.min(ny - 1.001, Math.max(0, (y - min.y) / h)), fz = Math.min(nz - 1.001, Math.max(0, (z - min.z) / h));
    const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, t = fz - k;
    let r = 0;
    for (const [a, wa] of [[0, 1 - u], [1, u]]) for (const [b, wb] of [[0, 1 - v], [1, v]]) for (const [c, wc] of [[0, 1 - t], [1, t]]) {
      r += wa * wb * wc * dist[idx(i + a, j + b, k + c)];
    }
    return r * h - radius; // > 0 inside the wrapped shape
  };
  const w = { ...m, wrapped: true } as Model;
  w.sdf = field;
  w.inside = (x, y, z) => field(x, y, z) > 0;
  w.box = m.box.clone().expandByScalar(h);
  return w;
}

// ---------------------------------------------------------------------------
// making a closed solid out of whatever came in
// ---------------------------------------------------------------------------

// Consistent outward orientation per connected part: breadth-first over shared
// edges, flipping neighbours that run an edge in the same direction, then
// flipping whole parts with negative signed volume.
function orient(tri: Uint32Array, pos: number[]): void {
  const nT = tri.length / 3, edgeTris = new Map<string, number[]>();
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) {
    const k = key(tri[3 * t + e], tri[3 * t + (e + 1) % 3]);
    (edgeTris.get(k) ?? edgeTris.set(k, []).get(k)!).push(t);
  }
  const done = new Uint8Array(nT), parts: number[][] = [];
  const hasDir = (t: number, a: number, b: number) => [0, 1, 2].some((e) => tri[3 * t + e] === a && tri[3 * t + (e + 1) % 3] === b);
  for (let s = 0; s < nT; s++) {
    if (done[s]) continue;
    const part = [s]; done[s] = 1;
    for (let i = 0; i < part.length; i++) {
      const t = part[i];
      for (let e = 0; e < 3; e++) {
        const a = tri[3 * t + e], b = tri[3 * t + (e + 1) % 3];
        for (const u of edgeTris.get(key(a, b))!) {
          if (done[u]) continue;
          done[u] = 1; part.push(u);
          if (hasDir(u, a, b)) { const x = tri[3 * u + 1]; tri[3 * u + 1] = tri[3 * u + 2]; tri[3 * u + 2] = x; }
        }
      }
    }
    parts.push(part);
  }
  for (const part of parts) {
    let vol = 0;
    for (const t of part) {
      const [a, b, c] = [tri[3 * t], tri[3 * t + 1], tri[3 * t + 2]].map((i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
      vol += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    if (vol < 0) for (const t of part) { const x = tri[3 * t + 1]; tri[3 * t + 1] = tri[3 * t + 2]; tri[3 * t + 2] = x; }
  }
}

function makeSolids(wasm: any) {
  const { Manifold, Mesh } = wasm;
  const props = (m: Model) => {
    const n = m.P.length / 3, vp = new Float32Array(n * NP);
    for (let i = 0; i < n; i++) vp.set([m.P[3 * i], m.P[3 * i + 1], m.P[3 * i + 2], m.UV[2 * i], m.UV[2 * i + 1], m.vMat[i]], NP * i);
    return vp;
  };

  // Weld exact positions, orient, merge — first as one piece, then with parts
  // that only touch along an edge (edges with > 2 faces) kept apart.
  function direct(m: Model): any {
    const n = m.P.length / 3, map = new Map<string, number>(), w = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${m.P[3 * i]},${m.P[3 * i + 1]},${m.P[3 * i + 2]}`;
      if (!map.has(k)) map.set(k, map.size);
      w[i] = map.get(k)!;
    }
    const attempt = (groupOf: (t: number) => number) => {
      const gmap = new Map<string, number>(), gw = new Uint32Array(m.I.length), gpos: number[] = [], rep = new Map<string, number>();
      const F: number[] = [], T: number[] = [], seen = new Set<number>();
      for (let c = 0; c < m.I.length; c++) {
        const vi = m.I[c], k = `${w[vi]}_${groupOf((c / 3) | 0)}`;
        if (!gmap.has(k)) { gmap.set(k, gmap.size); gpos.push(m.P[3 * vi], m.P[3 * vi + 1], m.P[3 * vi + 2]); }
        gw[c] = gmap.get(k)!;
        if (!rep.has(k)) rep.set(k, vi);
        else if (rep.get(k) !== vi && !seen.has(vi)) { seen.add(vi); F.push(vi); T.push(rep.get(k)!); }
      }
      orient(gw, gpos);
      const tri = Uint32Array.from(m.I);
      for (let c = 0; c < tri.length; c += 3) {
        if (gmap.get(`${w[tri[c + 1]]}_${groupOf((c / 3) | 0)}`) !== gw[c + 1]) { const x = tri[c + 1]; tri[c + 1] = tri[c + 2]; tri[c + 2] = x; }
      }
      return new Manifold(new Mesh({ numProp: NP, vertProperties: props(m), triVerts: tri, mergeFromVert: new Uint32Array(F), mergeToVert: new Uint32Array(T) }));
    };
    try { return attempt(() => 0); } catch { /* try with touching parts apart */ }
    const nT = m.I.length / 3, edges = new Map<string, number[]>(), parent = Int32Array.from({ length: nT }, (_, i) => i);
    const find = (a: number): number => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
    for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) {
      const a = w[m.I[3 * t + e]], b = w[m.I[3 * t + (e + 1) % 3]], k = a < b ? `${a}_${b}` : `${b}_${a}`;
      (edges.get(k) ?? edges.set(k, []).get(k)!).push(t);
    }
    for (const ts of edges.values()) if (ts.length === 2) parent[find(ts[0])] = find(ts[1]);
    return attempt(find);
  }

  // A voxel model (axis-aligned faces, every triangle's legs one cell long)?
  function voxelCell(m: Model): number | null {
    let cell = 0;
    for (let f = 0; f < m.I.length; f += 3) {
      const v = [0, 1, 2].map((j) => new THREE.Vector3(m.P[3 * m.I[f + j]], m.P[3 * m.I[f + j] + 1], m.P[3 * m.I[f + j] + 2]));
      const n = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
      if (Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) < 0.999) return null;
      const legs = [v[0].distanceTo(v[1]), v[1].distanceTo(v[2]), v[2].distanceTo(v[0])].sort((a, b) => a - b);
      if (!cell) cell = legs[0];
      if (Math.abs(legs[0] - cell) > cell * 1e-3 || Math.abs(legs[1] - cell) > cell * 1e-3) return null;
    }
    return cell;
  }

  // Voxel models are rebuilt from real cubes — every exposed face keeps its
  // colour — and united exactly. Cubes that only touch along an edge or a
  // corner make the plain surface non-manifold; the cube union doesn't care.
  // Only the shell cells come back (the ones behind visible faces), which is
  // all a union needs.
  function voxelSolid(m: Model, cell: number): any {
    const t = performance.now(), o = m.box.min, cells = new Map<string, Record<string, number[]>>();
    for (let f = 0; f < m.I.length; f += 3) {
      const v = [0, 1, 2].map((j) => new THREE.Vector3(m.P[3 * m.I[f + j]], m.P[3 * m.I[f + j] + 1], m.P[3 * m.I[f + j] + 2]));
      const n = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize(), c = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
      const ax = Math.abs(n.x) > 0.9 ? 0 : Math.abs(n.y) > 0.9 ? 1 : 2, sign = Math.sign(n.getComponent(ax));
      const cc = c.clone().addScaledVector(n, -cell / 2);
      const key = [0, 1, 2].map((k) => Math.floor((cc.getComponent(k) - o.getComponent(k)) / cell)).join(",");
      if (!cells.has(key)) cells.set(key, {});
      cells.get(key)![`${ax}${sign}`] = [m.UV[2 * m.I[f]], m.UV[2 * m.I[f] + 1], m.vMat[m.I[f]]];
    }
    const cubes: any[] = [];
    for (const [key, faces] of cells) {
      const [i, j, k] = key.split(",").map(Number), corner = [o.x + i * cell, o.y + j * cell, o.z + k * cell], any = Object.values(faces)[0];
      const vp: number[] = [], tri: number[] = [], F: number[] = [], T: number[] = [], first = new Map<string, number>();
      for (const ax of [0, 1, 2]) for (const sign of [-1, 1]) {
        const prop = faces[`${ax}${sign}`] ?? any, u = (ax + 1) % 3, w = (ax + 2) % 3, base = vp.length / NP;
        for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const p = [...corner];
          p[ax] += sign > 0 ? cell : 0; p[u] += a * cell; p[w] += b * cell;
          const pk = p.join(","), idx = vp.length / NP;
          if (first.has(pk)) { F.push(idx); T.push(first.get(pk)!); } else first.set(pk, idx);
          vp.push(...p, ...prop);
        }
        tri.push(...(sign > 0 ? [base, base + 1, base + 2, base, base + 2, base + 3] : [base, base + 2, base + 1, base, base + 3, base + 2]));
      }
      cubes.push(new Manifold(new Mesh({ numProp: NP, vertProperties: new Float32Array(vp), triVerts: new Uint32Array(tri), mergeFromVert: new Uint32Array(F), mergeToVert: new Uint32Array(T) })));
    }
    const r = Manifold.union(cubes);
    console.log(`   ${m.name}: voxel model → ${cells.size} cubes → ${r.numTri()} triangles (${sec(t)})`);
    return r;
  }

  const solid = function solid(m: Model, cells = 96): any {
    const cell = m.wrapped ? null : voxelCell(m);
    if (cell) return voxelSolid(m, cell);
    if (!m.wrapped) try { const r = direct(m); console.log(`   ${m.name}: closed solid`); return r; } catch { /* fall back */ }
    const t = performance.now(), s = m.box.getSize(new THREE.Vector3()), edge = Math.max(s.x, s.y, s.z) / cells, pad = 2 * edge;
    const g = Manifold.levelSet(([x, y, z]: number[]) => m.sdf(x, y, z), { min: m.box.min.clone().subScalar(pad).toArray(), max: m.box.max.clone().addScalar(pad).toArray() }, edge)
      .simplify(edge * 0.1).getMesh();
    const n = g.vertProperties.length / 3, vp = new Float32Array(n * NP);
    for (let i = 0; i < n; i++) { const [x, y, z] = g.vertProperties.subarray(3 * i, 3 * i + 3); vp.set([x, y, z, ...m.uvMatAt(x, y, z)], NP * i); }
    console.log(`   ${m.name}: ${m.wrapped ? "enveloped" : "not closed → rebuilt as a distance-field solid"} (${sec(t)})`);
    return new Manifold(new Mesh({ numProp: NP, vertProperties: vp, triVerts: g.triVerts }));
  };
  /** true when the model is already an exact closed solid (no rebuild needed) */
  solid.isClosed = (m: Model): boolean => { try { direct(m); return true; } catch { return false; } };
  return solid;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      mode: { type: "string", default: "hart" },
      seed: { type: "string", default: "1" },
      match: { type: "boolean", default: false },
      "match-height": { type: "boolean", default: false },
      "min-fill": { type: "string", default: "0" },
      "fill-target": { type: "string" },
      opening: { type: "string", default: "0.25" },
      close: { type: "string", default: "" },
      repair: { type: "boolean", default: false },
      "close-radius": { type: "string", default: "0.15" },
      measure: { type: "boolean", default: false },
      overlap: { type: "string", default: "0.05-0.6" },
      fillet: { type: "string", default: "0.08" },
      "voxel-cells": { type: "string", default: "40" },
      out: { type: "string" },
      help: { type: "boolean", default: false }
    }
  });
  const mode = values.mode!;
  // one input in voxel mode: the model is voxelized on its own, no second model, no pose
  const single = positionals.length === 1 && mode === "voxel";
  const fileA = positionals[0], fileB = single ? positionals[0] : positionals[1];
  if (values.help || !fileA || !fileB) { console.log(USAGE); return; }
  for (const f of [fileA, fileB]) if (!existsSync(f)) fail(`Not found: ${f}`);
  if (!["hart", "weich", "voxel"].includes(mode)) fail("--mode must be hart, weich or voxel.");
  const [ovMin, ovMax] = values.overlap!.split("-").map(Number);
  if (!(ovMin >= 0 && ovMax > ovMin && ovMax <= 1)) fail('--overlap must look like "0.05-0.6".');
  const fillet = parseFloat(values.fillet!), voxelCells = parseInt(values["voxel-cells"]!, 10);
  if (!(fillet > 0)) fail("--fillet must be a positive number.");
  if (!(voxelCells >= 4)) fail("--voxel-cells must be 4 or more.");
  const out = values.out ?? join(ROOT, "generated-assets", `${basename(fileA, extname(fileA))}+${basename(fileB, extname(fileB))}-${mode}.glb`);

  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const wasm: any = await (ManifoldModule as any)();
  wasm.setup();
  const { Manifold } = wasm, solid = makeSolids(wasm);

  const t0 = performance.now();
  let A = await load(io, fileA), B = single ? A : await load(io, fileB);
  console.log(single ? `\n● voxelize ${A.name}` : `\n● fuse ${A.name} + ${B.name} (${mode})`);

  // fill = volume / convex hull volume; thin open shapes are closed until they reach --min-fill
  const minFill = parseFloat(values["min-fill"]!);
  const fillOf = (S: any) => S.volume() / Math.max(1e-12, S.hull().volume());
  const fillTarget = values["fill-target"] !== undefined ? parseFloat(values["fill-target"]) : 2 * minFill;
  const opening = parseFloat(values.opening!);
  const prepare = (m: Model, force: boolean): { m: Model; S: any } => {
    const rep = repairEdges(m);
    // only where those edges keep the model from being an exact solid
    if (rep.edges && (values.repair || force) && !values.measure && !solid.isClosed(m)) {
      m = rep.model;
      console.log(`   ${m.name}: ${rep.edges} edge(s) with more than two faces repaired`);
    }
    let S = solid(m), f = fillOf(S);
    const big = Math.max(...m.box.getSize(new THREE.Vector3()).toArray());
    const capped = capHoles(m), open = capped.largest / big;
    console.log(`   ${m.name}: fill ${(f * 100).toFixed(1)} %, ${capped.loops} open edge loop(s), largest ${(open * 100).toFixed(0)} % of its size${values.measure ? `, ${rep.edges} edge(s) with more than two faces` : ""}`);
    if (values.measure) return { m, S };
    if (force) {
      if (f >= fillTarget) return { m, S };
      const r = parseFloat(values["close-radius"]!), wm = wrapModel(m, r * big), S2 = solid(wm);
      console.log(`   ${m.name}: marked as extreme case → enveloped, radius ${(r * 100).toFixed(0)} % of its size → fill ${(fillOf(S2) * 100).toFixed(1)} %`);
      return { m: wm, S: S2 };
    }
    if (!(minFill > 0)) return { m, S };
    // 1. a large opening (an umbrella's rim) is always capped; small holes only when the fill is too low
    if (capped.loops && (open >= opening || f < minFill)) {
      const S2 = solid(capped.model), f2 = fillOf(S2);
      console.log(`   ${m.name}: open edges capped → fill ${(f2 * 100).toFixed(1)} %`);
      if (open >= opening || f2 > f) { m = capped.model; S = S2; f = f2; }
    }
    if (f >= minFill) return { m, S };
    // 2. still hollow (a closed lamp shade): envelop with a growing radius until the fill reaches the target
    for (const r of [0.03, 0.06, 0.1, 0.15, 0.2, 0.3]) {
      const wm = wrapModel(m, r * big), S2 = solid(wm), f2 = fillOf(S2);
      console.log(`   ${m.name}: enveloped, radius ${(r * 100).toFixed(0)} % of its size → fill ${(f2 * 100).toFixed(1)} %`);
      m = wm; S = S2;
      if (f2 >= fillTarget) break;
    }
    return { m, S };
  };
  const pa = prepare(A, values.close!.includes("a")), pb = single ? pa : prepare(B, values.close!.includes("b"));
  if (values.measure) return;
  A = pa.m; B = pb.m;
  const MA = pa.S.asOriginal(), idA = MA.originalID(), MB0 = pb.S.asOriginal();
  const bs = A.box.getSize(new THREE.Vector3()), bc = A.box.getCenter(new THREE.Vector3()), oc = B.box.getCenter(new THREE.Vector3());
  if (values.match && values["match-height"]) fail("Use either --match or --match-height.");
  let sB = values.match ? 0.8 * Math.max(bs.x, bs.y, bs.z) / Math.max(...B.box.getSize(new THREE.Vector3()).toArray()) : 1;

  // pose: seeded rotation + offset, re-rolled until the overlap is in range
  const mulberry = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let pose: { seed: number; rot: number[]; off: THREE.Vector3; q: THREE.Quaternion } | null = null, MB: any = null, overlap = 0;
  // single model: B is A itself, unrotated and in place — the union is A alone
  if (single) { pose = { seed: 0, rot: [0, 0, 0], off: oc.clone(), q: new THREE.Quaternion() }; MB = MB0; overlap = 1; sB = 1; }
  for (let seed = parseInt(values.seed!, 10), tries = 0; !single && tries < 500; seed++, tries++) {
    const rnd = mulberry(seed), rot = [rnd() * 360 - 180, rnd() * 360 - 180, rnd() * 360 - 180];
    const off = new THREE.Vector3((rnd() - 0.5) * 0.7 * bs.x, (rnd() - 0.5) * 0.7 * bs.y, (rnd() - 0.5) * 0.7 * bs.z).add(bc);
    const turned = MB0.translate(oc.clone().negate().toArray()).rotate(rot);
    if (values["match-height"]) {
      const tb = turned.boundingBox();
      sB = bs.y / (tb.max[1] - tb.min[1]);
    }
    const cand = turned.scale(sB).translate(off.toArray());
    const f = (MA.volume() + cand.volume() - MA.add(cand).volume()) / Math.min(MA.volume(), cand.volume());
    if (f < ovMin || f > ovMax) continue;
    // manifold's rotate turns about x, then y, then z — three.js Euler order "ZYX". weich/voxel
    // sample B through this quaternion, so it must match the pose the overlap was measured for
    pose = { seed, rot, off, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot.map((d) => d * Math.PI / 180) as [number, number, number]), "ZYX")) };
    MB = cand; overlap = f;
    break;
  }
  if (!pose) fail("No pose within the --overlap range after 500 seeds — widen it.");
  const inv = pose.q.clone().invert();
  const toB = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).sub(pose!.off).applyQuaternion(inv).divideScalar(sB).add(oc);
  const box = A.box.clone();
  for (const x of [B.box.min.x, B.box.max.x]) for (const y of [B.box.min.y, B.box.max.y]) for (const z of [B.box.min.z, B.box.max.z]) {
    box.expandByPoint(new THREE.Vector3(x, y, z).sub(oc).multiplyScalar(sB).applyQuaternion(pose.q).add(pose.off));
  }
  const size = box.getSize(new THREE.Vector3()), maxDim = Math.max(size.x, size.y, size.z);

  // result: triangles grouped by "source:material", flat x y z u v per corner
  const groups = new Map<string, number[]>();
  const push = (key: string, corners: number[][]) => { if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(...corners.flat()); };
  const owner = (x: number, y: number, z: number) => { const l = toB(x, y, z); return Math.abs(B.sdf(l.x, l.y, l.z)) * sB < Math.abs(A.sdf(x, y, z)) ? 1 : 0; };
  const uvMatFor = (src: number, x: number, y: number, z: number) => { if (src === 0) return A.uvMatAt(x, y, z); const l = toB(x, y, z); return B.uvMatAt(l.x, l.y, l.z); };

  if (mode === "hart") {
    const g = MA.add(MB).getMesh();
    for (let r = 0; r < g.runOriginalID.length; r++) {
      const src = g.runOriginalID[r] === idA ? 0 : 1;
      for (let k = g.runIndex[r]; k < g.runIndex[r + 1]; k += 3) {
        const c = [0, 1, 2].map((j) => g.vertProperties.subarray(g.triVerts[k + j] * NP, g.triVerts[k + j] * NP + NP));
        push(`${src}:${Math.round(c[0][5])}`, c.map((p: Float32Array) => [p[0], p[1], p[2], p[3], p[4]]));
      }
    }
  } else if (mode === "weich") {
    const r = bs.y * fillet, smax = (a: number, b: number) => { const h = Math.max(r - Math.abs(a - b), 0) / r; return Math.max(a, b) + h * h * r * 0.25; };
    const edge = maxDim / 110, pad = r + 2 * edge;
    const g = Manifold.levelSet(([x, y, z]: number[]) => { const l = toB(x, y, z); return smax(A.sdf(x, y, z), B.sdf(l.x, l.y, l.z) * sB); },
      { min: box.min.clone().subScalar(pad).toArray(), max: box.max.clone().addScalar(pad).toArray() }, edge).simplify(edge * 0.1).getMesh();
    for (let k = 0; k < g.triVerts.length; k += 3) {
      const c = [0, 1, 2].map((j) => g.vertProperties.subarray(g.triVerts[k + j] * 3, g.triVerts[k + j] * 3 + 3));
      const cx = (c[0][0] + c[1][0] + c[2][0]) / 3, cy = (c[0][1] + c[1][1] + c[2][1]) / 3, cz = (c[0][2] + c[1][2] + c[2][2]) / 3;
      const src = owner(cx, cy, cz), mat = uvMatFor(src, cx, cy, cz)[2];
      push(`${src}:${mat}`, c.map((p: Float32Array) => { const [u, v] = uvMatFor(src, p[0], p[1], p[2]); return [p[0], p[1], p[2], u, v]; }));
    }
  } else {
    const cell = maxDim / voxelCells, o = box.min.clone().subScalar(cell);
    const nx = Math.ceil(size.x / cell) + 2, ny = Math.ceil(size.y / cell) + 2, nz = Math.ceil(size.z / cell) + 2;
    const occ = new Uint8Array(nx * ny * nz), id = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = o.x + (i + 0.5) * cell, y = o.y + (j + 0.5) * cell, z = o.z + (k + 0.5) * cell, l = toB(x, y, z);
      occ[id(i, j, k)] = A.inside(x, y, z) || B.inside(l.x, l.y, l.z) ? 1 : 0;
    }
    const on = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && occ[id(i, j, k)];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!occ[id(i, j, k)]) continue;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        if (on(i + dx, j + dy, k + dz)) continue;
        const c = new THREE.Vector3(o.x + (i + 0.5 + dx / 2) * cell, o.y + (j + 0.5 + dy / 2) * cell, o.z + (k + 0.5 + dz / 2) * cell);
        const src = owner(c.x, c.y, c.z), [u, v, mat] = uvMatFor(src, c.x, c.y, c.z); // one texel colour per face
        const n = new THREE.Vector3(dx, dy, dz), a = dx ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), b = n.clone().cross(a);
        const p = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => c.clone().addScaledVector(a, s * cell / 2).addScaledVector(b, t * cell / 2));
        const q4 = [p[0], p[1], p[2], p[0], p[2], p[3]].map((pt) => [pt.x, pt.y, pt.z, u, v]);
        push(`${src}:${mat}`, q4.slice(0, 3));
        push(`${src}:${mat}`, q4.slice(3));
      }
    }
  }

  // write: A's document (fresh) with B's materials merged in, one primitive per group
  const doc = await readDoc(io, fileA), root = doc.getRoot(), matsA = root.listMaterials();
  let matsB = matsA;
  if (fileB !== fileA) {
    const other = await readDoc(io, fileB), map = mergeDocuments(doc, other);
    matsB = other.getRoot().listMaterials().map((m) => map.get(m) as Material);
  }
  const buffer = root.listBuffers()[0] ?? doc.createBuffer(), mesh = doc.createMesh(basename(out, ".glb"));
  let tris = 0;
  for (const [key, flat] of groups) {
    const [src, mi] = key.split(":").map(Number), n = flat.length / 5, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { pos.set(flat.slice(5 * i, 5 * i + 3), 3 * i); uv.set(flat.slice(5 * i + 3, 5 * i + 5), 2 * i); }
    tris += n / 3;
    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint32Array.from({ length: n }, (_, i) => i)).setBuffer(buffer));
    const mat = (src === 0 ? matsA : matsB)[mi];
    if (mat) prim.setMaterial(mat);
    mesh.addPrimitive(prim);
  }
  for (const s of root.listScenes()) for (const c of s.listChildren()) s.removeChild(c);
  for (const nd of root.listNodes()) nd.dispose();
  // where B ended up — kept so a model's line can be traced later
  const bMatrix = new THREE.Matrix4().makeTranslation(pose.off.x, pose.off.y, pose.off.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(pose.q))
    .multiply(new THREE.Matrix4().makeScale(sB, sB, sB))
    .multiply(new THREE.Matrix4().makeTranslation(-oc.x, -oc.y, -oc.z));
  const scene = root.listScenes()[0] ?? doc.createScene();
  scene.addChild(doc.createNode(basename(out, ".glb")).setMesh(mesh)
    .setExtras(single ? {} : { fuse: { a: basename(fileA), b: basename(fileB), mode, bMatrix: bMatrix.elements.map((v) => +v.toFixed(6)) } }));
  root.setDefaultScene(scene);
  for (const b of root.listBuffers()) if (b !== buffer) { for (const a of root.listAccessors()) if (a.getBuffer() === b) a.setBuffer(buffer); b.dispose(); }
  // float geometry out — compressing is a separate, deliberate step
  for (const e of root.listExtensionsUsed()) if (["EXT_meshopt_compression", "KHR_mesh_quantization"].includes(e.extensionName)) e.dispose();
  await doc.transform(prune());
  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  if (!single) console.log(`   pose: seed ${pose.seed}, rotation ${pose.rot.map((d) => d.toFixed(0)).join("/")}°, overlap ${(overlap * 100).toFixed(0)} %${sB !== 1 ? `, B ×${sB.toFixed(2)}` : ""}`);
  if (!single) console.log(`   B matrix (column-major, B's file → result): ${JSON.stringify(bMatrix.elements.map((v) => +v.toFixed(6)))}`);
  console.log(`   ${tris} triangles, ${groups.size} material group(s), ${sec(t0)}`);
  console.log(`   written: ${out} (uncompressed)`);
  console.log(`\nNext: npm run reduce -- ${out} --compress   (keeps the look)\n`);
  process.exit(0); // manifold's wasm keeps the event loop alive
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
