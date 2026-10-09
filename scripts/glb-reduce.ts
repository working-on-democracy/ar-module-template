#!/usr/bin/env -S npx tsx
// Fewer triangles, same look — run via `npm run reduce -- <in.glb> [options]`.
// Unlike `npm run stylize`, nothing about the surface changes: textures,
// colours, saturation and texture filters stay as they are. Only the mesh
// is simplified, and only as far as its shape moves by less than --error
// (a fraction of the model's size). Texture seams are kept (never the
// --permissive smearing of stylize), so a texture can't be pulled across
// an edge.
//
//   --snap  first moves every texture coordinate to the centre of the texel
//           it already shows. With the NEAREST filtering stylized models use
//           this changes no pixel, but neighbouring faces that show the same
//           texel become identical vertices and can be merged.
//
// Made for results of `npm run fuse`: soft fusions drop to about a tenth at
// --error 0.01 without a visible change. Hard fusions with voxel parts keep
// more — every cube face has its own colour, and a smooth partner's texture
// seams stop the simplification.
// Output is uncompressed unless --compress (gltfpack + lossless WebP, the
// same code as compress-assets). Compressing an already quantized input a
// second time is allowed here on purpose — say so in the output.
// See cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md.
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { NodeIO, type Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { cloneDocument, dequantize, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { compressGlbFile } from "./glb-compression";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const USAGE = `Usage:
  npm run reduce -- <in.glb> [options]

Options:
  --error <x>      allowed shape change, fraction of the model size (default 0.01 = 1 %)
  --target <n>     simplify to about n triangles — no lower, whatever the shape change (a model
                   already at or below n is only compressed); replaces --error / --max-triangles
  --max-triangles <n>  raise --error step by step (up to 25 %) until the model has at most n triangles
  --permissive     also simplify across texture seams (meshoptimizer 'Permissive', as in stylize):
                   reaches low counts on fragmented layouts, but smears texels into streaks
  --snap           snap texture coordinates to texel centres first (merges same-colour faces)
  --compress       compress the result (gltfpack + lossless WebP)
  --out <path>     output file (default generated-assets/<name>-reduced.glb)`;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      error: { type: "string", default: "0.01" },
      snap: { type: "boolean", default: false },
      permissive: { type: "boolean", default: false },
      "max-triangles": { type: "string" },
      target: { type: "string" },
      compress: { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", default: false }
    }
  });
  const input = positionals[0];
  if (values.help || !input) { console.log(USAGE); return; }
  if (!existsSync(input)) fail(`Not found: ${input}`);
  let error = parseFloat(values.error!);
  if (!(error > 0 && error < 1)) fail("--error must be between 0 and 1 (0.01 = 1 %).");
  const maxTris = values["max-triangles"] !== undefined ? parseInt(values["max-triangles"], 10) : Infinity;
  if (!(maxTris > 0)) fail("--max-triangles must be a positive number.");
  const target = values.target !== undefined ? parseInt(values.target, 10) : null;
  if (target !== null && !(target > 0)) fail("--target must be a positive number.");
  const out = values.out ?? join(ROOT, "generated-assets", `${basename(input, extname(input))}-reduced.glb`);

  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  let doc = await io.read(input);
  const wasQuantized = doc.getRoot().listExtensionsUsed().some((e) => ["EXT_meshopt_compression", "KHR_mesh_quantization"].includes(e.extensionName));
  await doc.transform(dequantize());
  const prims = (): Primitive[] => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  const count = () => prims().reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION")?.getCount() ?? 0) / 3, 0);
  const before = count();

  if (values.snap) {
    for (const prim of prims()) {
      const size = prim.getMaterial()?.getBaseColorTexture()?.getSize(), uv = prim.getAttribute("TEXCOORD_0");
      if (!size || !uv) continue;
      const a = uv.getArray()!.slice();
      for (let i = 0; i < a.length; i += 2) {
        a[i] = (Math.floor(a[i] * size[0]) + 0.5) / size[0];
        a[i + 1] = (Math.floor(a[i + 1] * size[1]) + 0.5) / size[1];
      }
      uv.setArray(a);
    }
  }
  // flat-shaded models: normals would only stop welding; three.js recomputes them
  for (const prim of prims()) prim.setAttribute("NORMAL", null);
  await doc.transform(weld());
  // with --target: a triangle count, not an error limit, decides where to stop
  const prepared = cloneDocument(doc);
  const simplifier = !values.permissive
    ? MeshoptSimplifier
    : {
        ...MeshoptSimplifier,
        simplify: (indices: Uint32Array, positions: Float32Array, stride: number, target: number, err: number, flags: any[] = []) =>
          MeshoptSimplifier.simplify(indices, positions, stride, target, err, [...flags, "Permissive"])
      };
  if (target !== null) {
    // aim a little lower each round until the result fits (seams and part borders stop some parts early)
    // a tiny model can jump straight to nothing — then the last non-empty round is kept
    let lastNonEmpty = doc;
    for (let aim = target; before > target && aim > target * 0.3; aim *= 0.93) {
      doc = cloneDocument(prepared);
      await doc.transform(simplify({ simplifier: simplifier as typeof MeshoptSimplifier, ratio: aim / before, error: 1, lockBorder: false }), prune());
      if (count() === 0) { doc = lastNonEmpty; break; }
      lastNonEmpty = doc;
      if (count() <= target) break;
    }
  } else for (const step of [error, 0.02, 0.04, 0.08, 0.15, 0.25].filter((e) => e >= error)) {
    doc = cloneDocument(prepared);
    error = step;
    await doc.transform(simplify({ simplifier: simplifier as typeof MeshoptSimplifier, ratio: 0, error, lockBorder: false }), prune());
    if (count() <= maxTris) break;
  }
  for (const e of doc.getRoot().listExtensionsUsed()) if (["EXT_meshopt_compression", "KHR_mesh_quantization"].includes(e.extensionName)) e.dispose();

  mkdirSync(dirname(out), { recursive: true });
  if (values.compress) {
    const tmp = join(tmpdir(), `reduce-${process.pid}.glb`);
    await io.write(tmp, doc);
    await compressGlbFile(tmp, out, { lossless: true });
    rmSync(tmp, { force: true });
  } else {
    await io.write(out, doc);
  }
  console.log(`\n● reduce ${basename(input)}: ${before} → ${count()} triangles (${target !== null ? `target ${target}` : `error ${error * 100} %`}${values.snap ? ", texels snapped" : ""}${values.permissive ? ", permissive" : ""})`);
  if (count() > maxTris) console.log(`  note: still above ${maxTris} at 25 % — texture seams stop the simplification`);
  if (values.compress && wasQuantized) console.log("  note: the input was already compressed — its geometry is now quantized a second time (intended here)");
  console.log(`  written: ${out}${values.compress ? " (compressed)" : " (uncompressed)"}\n`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
