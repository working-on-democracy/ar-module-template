#!/usr/bin/env -S npx tsx
// A slimmed-down `stylize` — run via `npm run stylize-light -- <in.glb>`.
// Makes a raw generated model (phase 0) lighter while keeping its look:
// fewer triangles, smaller textures, a little more colour. Unlike
// scripts/stylize-glb.ts it does NOT facet the surface, keeps every
// material map (normal, metal-roughness, occlusion) and the material's
// metal/roughness values, and leaves texture filtering as it is (smooth,
// mipmapped — no NEAREST pixel look). Short version, in order:
//
//   1. Merges parts that share a material (flatten + join), so the triangle
//      budget goes where it's least visible (skipped for animated models).
//   2. Simplifies to a target triangle count (meshoptimizer) WITHOUT
//      collapsing texture seams — on fragmented AI texture layouts it
//      stops above the target; that's accepted, textures stay clean.
//   3. Shrinks every texture to a longest side of --texture px and raises
//      the saturation of colour textures, base-colour factors and float
//      vertex colours.
//   4. Compresses like stylize/compress-assets (glb-compression.ts:
//      gltfpack -c, lossless WebP, no further resizing).
//
// Defaults are "phase 1" of the AI asset test track (2026-10-08): 5000
// triangles, 512 px, saturation 1.1. Input must be uncompressed (refused
// otherwise — see cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md).
// Output like stylize: compressed → src/assets/<name>.glb, uncompressed →
// uncompressed-assets/<name>.glb; --out writes just one file elsewhere;
// --no-compress writes the uncompressed model instead (input for `stylize`,
// which refuses compressed files). See
// cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md.
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO, Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, join as joinParts, listTextureSlots, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { compressGlbFile } from "./glb-compression";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS_DIR = join(ROOT, "src/assets");
const UNCOMPRESSED_DIR = join(ROOT, "uncompressed-assets");

const COLOR_SLOTS = ["baseColorTexture", "emissiveTexture"];

const USAGE = `Usage:
  npm run stylize-light -- <input.glb> [options]

Options:
  --faces <n>          target triangle count (default 5000; texture seams are kept, so it may end higher)
  --texture <px>       longest texture side in pixels (default 512)
  --saturation <x>     1 = unchanged, 1.1 = 10% more saturated (default 1.1)
  --name <name>        output src/assets/<name>.glb (default: input file name)
  --replace            overwrite an existing src/assets/<name>.glb and its uncompressed-assets/ copy
  --no-compress        write the uncompressed model instead (e.g. as input for npm run stylize,
                       which refuses compressed files)
  --out <path>         write only this one file somewhere else`;

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function triangleCount(doc: Document): number {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const count = prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0;
      triangles += Math.floor(count / 3);
    }
  }
  return triangles;
}

function saturate(rgb: number[], amount: number): number[] {
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return rgb.map((c) => Math.min(1, Math.max(0, luma + (c - luma) * amount)));
}

function describeTextures(doc: Document): string {
  const textures = doc.getRoot().listTextures();
  if (textures.length === 0) return "no textures";
  return textures
    .map((t) => {
      const size = t.getSize();
      return `${listTextureSlots(t).join("+") || "unused"} ${size ? `${size[0]}×${size[1]}` : "?"}`;
    })
    .join(", ");
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      faces: { type: "string", default: "5000" },
      texture: { type: "string", default: "512" },
      saturation: { type: "string", default: "1.1" },
      name: { type: "string" },
      replace: { type: "boolean", default: false },
      "no-compress": { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", default: false }
    }
  });
  const input = positionals[0];
  if (values.help || !input) {
    console.log(USAGE);
    return;
  }
  if (!existsSync(input)) fail(`Not found: ${input}`);

  const faces = parseInt(values.faces, 10);
  const texturePx = parseInt(values.texture, 10);
  const saturation = parseFloat(values.saturation);
  if (!(faces > 0)) fail("--faces must be a positive number.");
  if (!(texturePx >= 1 && texturePx <= 4096)) fail("--texture must be 1–4096.");
  if (!(saturation >= 0)) fail("--saturation must be 0 or more.");

  const name = values.name ?? basename(input, extname(input));
  const outPath = values.out ? resolve(values.out) : join(ASSETS_DIR, `${name}.glb`);
  const pristinePath = join(UNCOMPRESSED_DIR, `${name}.glb`);
  if (outPath === resolve(input) || (!values.out && pristinePath === resolve(input))) {
    fail("Output would overwrite the input — use --name.");
  }
  if (!values.out && (existsSync(outPath) || existsSync(pristinePath)) && !values.replace) {
    fail(`src/assets/${name}.glb or uncompressed-assets/${name}.glb already exists — use --name or --replace.`);
  }

  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(input);
  const root = doc.getRoot();

  const used = root.listExtensionsUsed().map((e) => e.extensionName);
  if (used.includes("EXT_meshopt_compression") || used.includes("KHR_mesh_quantization")) {
    fail("This file is already compressed. Use its original (generated-assets/ or uncompressed-assets/).");
  }
  if (used.includes("KHR_draco_mesh_compression")) fail("Draco-compressed input isn't supported yet.");

  const before = triangleCount(doc);
  console.log(`\n${input}`);
  console.log(`  before: ${before.toLocaleString("de-DE")} triangles; ${describeTextures(doc)}`);

  // 1 + 2: merge, then simplify with texture seams locked (no 'Permissive'
  // flag) — soft normals stay, no unweld/faceting.
  const animated = root.listAnimations().length > 0 || root.listSkins().length > 0;
  if (!animated) await doc.transform(flatten(), joinParts());
  await doc.transform(weld());
  if (before > faces) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: faces / before, error: 1, lockBorder: false }));
  }

  // 3: saturation on colour factors and float vertex colours; maps, metal and
  // roughness stay untouched.
  for (const material of root.listMaterials()) {
    const [r, g, b, a] = material.getBaseColorFactor();
    material.setBaseColorFactor([...saturate([r, g, b], saturation), a] as [number, number, number, number]);
  }
  for (const accessor of new Set(root.listMeshes().flatMap((m) => m.listPrimitives().map((p) => p.getAttribute("COLOR_0"))))) {
    if (!accessor || accessor.getComponentType() !== 5126) continue; // normalized int colours left as they are
    const el: number[] = [];
    for (let i = 0; i < accessor.getCount(); i++) {
      accessor.getElement(i, el);
      accessor.setElement(i, [...saturate(el.slice(0, 3), saturation), ...el.slice(3)]);
    }
  }
  await doc.transform(prune(), dedup());

  // 3: every texture shrunk (averaging); colour textures saturated. PNG
  // in between, the compression step turns them into lossless WebP.
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const isColor = listTextureSlots(texture).some((s) => COLOR_SLOTS.includes(s));
    let pipeline = sharp(image).resize(texturePx, texturePx, { fit: "inside", withoutEnlargement: true });
    if (isColor && saturation !== 1) pipeline = pipeline.modulate({ saturation });
    texture.setImage(new Uint8Array(await pipeline.png().toBuffer())).setMimeType("image/png");
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.[^.]+$/, ".png"));
  }

  // 4: compress (or not).
  const compress = !values["no-compress"];
  mkdirSync(dirname(outPath), { recursive: true });
  if (!compress) {
    await io.write(outPath, doc);
    console.log(`  after:  ${triangleCount(doc).toLocaleString("de-DE")} triangles; ${describeTextures(doc)}`);
    console.log(`  written: ${outPath} (uncompressed)`);
    return;
  }
  const uncompressedPath = values.out ? `${outPath}.uncompressed-tmp.glb` : pristinePath;
  mkdirSync(dirname(outPath), { recursive: true });
  if (!values.out) mkdirSync(UNCOMPRESSED_DIR, { recursive: true });
  await io.write(uncompressedPath, doc);
  await compressGlbFile(uncompressedPath, outPath, { lossless: true });
  if (values.out) unlinkSync(uncompressedPath);

  const after = triangleCount(doc);
  console.log(`  after:  ${after.toLocaleString("de-DE")} triangles; ${describeTextures(doc)}`);
  if (after > faces * 1.5) console.log(`  note: stopped at ${after} — texture seams or many separate parts limit simplification.`);
  const shown = (path: string) => (path.startsWith(ROOT) ? path.slice(ROOT.length) : path);
  console.log(`  written: ${shown(outPath)} (compressed, ${(statSync(outPath).size / 1024).toFixed(0)} KB)`);
  if (!values.out) console.log(`  original: ${shown(pristinePath)} (uncompressed, ${(statSync(pristinePath).size / 1024).toFixed(0)} KB)`);
}

main();
