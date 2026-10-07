#!/usr/bin/env -S npx tsx
// Fuses two .glb models into one — run via `npm run fuse -- <a.glb> <b.glb> [options]`.
// Short version of what this does:
//
//   - Both models keep their original size (unless --match). B gets a seeded
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

Options:
  --mode <m>           hart (exact union, default) | weich (rounded, slow) | voxel (cube grid)
  --seed <n>           pose seed (default 1); the same seed gives the same result
  --match              scale B so its largest side is 80 % of A's (for very different sizes)
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
  const m = { name: basename(file, extname(file)), file, mats, P: new Float32Array(P), UV: new Float32Array(UV), I: new Uint32Array(I), vMat: new Uint16Array(vMat) } as Model;
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

  return function solid(m: Model, cells = 96): any {
    const cell = voxelCell(m);
    if (cell) return voxelSolid(m, cell);
    try { const r = direct(m); console.log(`   ${m.name}: closed solid`); return r; } catch { /* fall back */ }
    const t = performance.now(), s = m.box.getSize(new THREE.Vector3()), edge = Math.max(s.x, s.y, s.z) / cells, pad = 2 * edge;
    const g = Manifold.levelSet(([x, y, z]: number[]) => m.sdf(x, y, z), { min: m.box.min.clone().subScalar(pad).toArray(), max: m.box.max.clone().addScalar(pad).toArray() }, edge)
      .simplify(edge * 0.1).getMesh();
    const n = g.vertProperties.length / 3, vp = new Float32Array(n * NP);
    for (let i = 0; i < n; i++) { const [x, y, z] = g.vertProperties.subarray(3 * i, 3 * i + 3); vp.set([x, y, z, ...m.uvMatAt(x, y, z)], NP * i); }
    console.log(`   ${m.name}: not closed → rebuilt as a distance-field solid (${sec(t)})`);
    return new Manifold(new Mesh({ numProp: NP, vertProperties: vp, triVerts: g.triVerts }));
  };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      mode: { type: "string", default: "hart" },
      seed: { type: "string", default: "1" },
      match: { type: "boolean", default: false },
      overlap: { type: "string", default: "0.05-0.6" },
      fillet: { type: "string", default: "0.08" },
      "voxel-cells": { type: "string", default: "40" },
      out: { type: "string" },
      help: { type: "boolean", default: false }
    }
  });
  const [fileA, fileB] = positionals;
  if (values.help || !fileA || !fileB) { console.log(USAGE); return; }
  for (const f of [fileA, fileB]) if (!existsSync(f)) fail(`Not found: ${f}`);
  const mode = values.mode!;
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
  const A = await load(io, fileA), B = await load(io, fileB);
  console.log(`\n● fuse ${A.name} + ${B.name} (${mode})`);
  const MA = solid(A).asOriginal(), idA = MA.originalID(), MB0 = solid(B).asOriginal();
  const bs = A.box.getSize(new THREE.Vector3()), bc = A.box.getCenter(new THREE.Vector3()), oc = B.box.getCenter(new THREE.Vector3());
  const sB = values.match ? 0.8 * Math.max(bs.x, bs.y, bs.z) / Math.max(...B.box.getSize(new THREE.Vector3()).toArray()) : 1;

  // pose: seeded rotation + offset, re-rolled until the overlap is in range
  const mulberry = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let pose: { seed: number; rot: number[]; off: THREE.Vector3; q: THREE.Quaternion } | null = null, MB: any = null, overlap = 0;
  for (let seed = parseInt(values.seed!, 10), tries = 0; tries < 500; seed++, tries++) {
    const rnd = mulberry(seed), rot = [rnd() * 360 - 180, rnd() * 360 - 180, rnd() * 360 - 180];
    const off = new THREE.Vector3((rnd() - 0.5) * 0.7 * bs.x, (rnd() - 0.5) * 0.7 * bs.y, (rnd() - 0.5) * 0.7 * bs.z).add(bc);
    const cand = MB0.translate(oc.clone().negate().toArray()).scale(sB).rotate(rot).translate(off.toArray());
    const f = (MA.volume() + cand.volume() - MA.add(cand).volume()) / Math.min(MA.volume(), cand.volume());
    if (f < ovMin || f > ovMax) continue;
    pose = { seed, rot, off, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot.map((d) => d * Math.PI / 180) as [number, number, number]), "XYZ")) };
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
  const scene = root.listScenes()[0] ?? doc.createScene();
  scene.addChild(doc.createNode(basename(out, ".glb")).setMesh(mesh));
  root.setDefaultScene(scene);
  for (const b of root.listBuffers()) if (b !== buffer) { for (const a of root.listAccessors()) if (a.getBuffer() === b) a.setBuffer(buffer); b.dispose(); }
  // float geometry out — compressing is a separate, deliberate step
  for (const e of root.listExtensionsUsed()) if (["EXT_meshopt_compression", "KHR_mesh_quantization"].includes(e.extensionName)) e.dispose();
  await doc.transform(prune());
  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  console.log(`   pose: seed ${pose.seed}, rotation ${pose.rot.map((d) => d.toFixed(0)).join("/")}°, overlap ${(overlap * 100).toFixed(0)} %${sB !== 1 ? `, B ×${sB.toFixed(2)}` : ""}`);
  console.log(`   ${tris} triangles, ${groups.size} material group(s), ${sec(t0)}`);
  console.log(`   written: ${out} (uncompressed)`);
  console.log(`\nNext: npm run reduce -- ${out} --compress   (keeps the look)\n`);
  process.exit(0); // manifold's wasm keeps the event loop alive
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
