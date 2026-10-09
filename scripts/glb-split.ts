#!/usr/bin/env -S npx tsx
// Splits one model into two — run via `npm run split -- <in.glb> [options]`.
// A random plane goes roughly through the middle of the model (bounding-box
// centre, shifted along the plane's normal by up to --offset of the model's
// half-width there). Nothing is cut exactly: every triangle goes whole to
// the side its centre lies on, so the cut follows existing polygon edges —
// a jagged staircase along the plane, no new points, no triangle divided.
// The cut is NOT closed: both halves stay open, and their materials are made
// double-sided so the inside shows instead of a see-through hole
// (--single-sided keeps them as they were).
//
// Both halves keep their place, textures and materials; each is pruned to
// what it still uses. Output: <out>-a.glb and <out>-b.glb, uncompressed
// unless --compress (gltfpack + lossless WebP, like `npm run reduce` —
// an already quantized input is compressed a second time on purpose).
// See cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md.
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Node, NodeIO, Primitive, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { cloneDocument, compactPrimitive, getBounds, prune } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { compressGlbFile } from "./glb-compression";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const USAGE = `Usage:
  npm run split -- <in.glb> [options]

Options:
  --seed <n>       random plane (default 1)
  --offset <x>     how far the plane may miss the centre, fraction of the half-width (default 0.15)
  --single-sided   leave materials as they are (default: double-sided, so the open inside shows)
  --compress       compress both halves (gltfpack + lossless WebP)
  --out <path>     output prefix → <path>-a.glb, <path>-b.glb (default generated-assets/<name>)`;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function triangleCount(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    if (p.getMode() === Primitive.Mode.TRIANGLES) n += (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")!.getCount()) / 3;
  }
  return n;
}

/** Keeps only the triangles whose centre lies on `side` of the world plane n·x = d. */
async function keepSide(doc: Document, n: number[], d: number, side: 1 | -1, doubleSided: boolean): Promise<void> {
  const root = doc.getRoot();
  for (const node of root.listNodes()) {
    let mesh = node.getMesh();
    if (!mesh) continue;
    // a mesh used by several nodes gets its own copy per node — the plane differs locally
    if (mesh.listParents().filter((p) => p instanceof Node).length > 1) node.setMesh((mesh = mesh.clone()));
    // world plane → local plane: n·(A p + t) = d  ⇔  (Aᵀn)·p = d − n·t
    const m = node.getWorldMatrix();
    const nl = [0, 1, 2].map((j) => n[0] * m[j * 4] + n[1] * m[j * 4 + 1] + n[2] * m[j * 4 + 2]);
    const dl = d - (n[0] * m[12] + n[1] * m[13] + n[2] * m[14]);
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const pos = prim.getAttribute("POSITION")!;
      const indices = prim.getIndices();
      const count = indices?.getCount() ?? pos.getCount();
      const index = (i: number) => (indices ? indices.getScalar(i) : i);
      const kept: number[] = [];
      const a: number[] = [], b: number[] = [], c: number[] = [];
      for (let i = 0; i < count; i += 3) {
        const i0 = index(i), i1 = index(i + 1), i2 = index(i + 2);
        pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c);
        const s = nl[0] * (a[0] + b[0] + c[0]) + nl[1] * (a[1] + b[1] + c[1]) + nl[2] * (a[2] + b[2] + c[2]) - 3 * dl;
        if ((s >= 0 ? 1 : -1) === side) kept.push(i0, i1, i2);
      }
      if (kept.length === 0) { prim.dispose(); continue; }
      const maxIndex = kept.reduce((x, y) => Math.max(x, y), 0);
      prim.setIndices(doc.createAccessor()
        .setType("SCALAR")
        .setArray(maxIndex < 65536 ? new Uint16Array(kept) : new Uint32Array(kept))
        .setBuffer(root.listBuffers()[0]));
    }
    if (mesh.listPrimitives().length === 0) node.setMesh(null);
  }
  if (doubleSided) for (const material of root.listMaterials()) material.setDoubleSided(true);
  // vertices no index points to any more go, then unused materials/textures/accessors
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) compactPrimitive(prim);
  await doc.transform(prune());
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      seed: { type: "string", default: "1" },
      offset: { type: "string", default: "0.15" },
      "single-sided": { type: "boolean", default: false },
      compress: { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", default: false }
    }
  });
  const input = positionals[0];
  if (values.help || !input) { console.log(USAGE); return; }
  if (!existsSync(input)) fail(`Not found: ${input}`);
  const seed = parseInt(values.seed!, 10), offset = parseFloat(values.offset!);
  if (!Number.isFinite(seed)) fail("--seed must be a number.");
  if (!(offset >= 0 && offset <= 1)) fail("--offset must be 0–1.");
  const prefix = values.out ? values.out.replace(/\.glb$/, "") : join(ROOT, "generated-assets", basename(input, extname(input)));

  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const source = await io.read(input);
  // geometry is rewritten, so it leaves meshopt-compressed form (quantized attributes stay as they are)
  for (const e of source.getRoot().listExtensionsUsed()) if (e.extensionName === "EXT_meshopt_compression") e.dispose();

  // random plane through (roughly) the bounding-box centre
  const rand = mulberry32(seed);
  const z = rand() * 2 - 1, phi = rand() * 2 * Math.PI, r = Math.sqrt(1 - z * z);
  const n = [r * Math.cos(phi), z, r * Math.sin(phi)];
  const { min, max } = getBounds(source.getRoot().listScenes()[0]);
  const centre = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  const halfWidth = [0, 1, 2].reduce((sum, i) => sum + Math.abs(n[i]) * (max[i] - min[i]) / 2, 0);
  const shift = (rand() * 2 - 1) * offset * halfWidth;
  const d = n[0] * centre[0] + n[1] * centre[1] + n[2] * centre[2] + shift;

  const before = triangleCount(source);
  const tilt = (Math.acos(Math.abs(n[1])) * 180) / Math.PI;
  console.log(`\n● split ${basename(input)}: ${before} triangles, plane seed ${seed}, ${tilt.toFixed(0)}° from horizontal, ${(shift / halfWidth * 100).toFixed(0)} % off centre`);

  mkdirSync(dirname(prefix), { recursive: true });
  for (const [side, suffix] of [[1, "a"], [-1, "b"]] as const) {
    const half = cloneDocument(source);
    await keepSide(half, n, d, side, !values["single-sided"]);
    const out = `${prefix}-${suffix}.glb`;
    if (values.compress) {
      const tmp = join(tmpdir(), `split-${Date.now()}-${suffix}.glb`);
      await io.write(tmp, half);
      try { await compressGlbFile(tmp, out, { lossless: true }); } finally { rmSync(tmp, { force: true }); }
    } else {
      await io.write(out, half);
    }
    console.log(`  ${suffix}: ${triangleCount(half)} triangles → ${out}${values.compress ? " (compressed)" : ""}`);
  }
  console.log("");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
