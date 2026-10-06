#!/usr/bin/env -S npx tsx
// Turns any .glb into a hard-edged low-poly model with coarse, visibly
// pixelated, more saturated textures — run via `npm run stylize -- <in.glb>`.
// Short version of what this does:
//
//   - Simplifies the geometry to a target triangle count (meshoptimizer,
//     same library gltfpack uses) without collapsing texture seams, so
//     textures stay clean (--permissive goes further on seams, at the cost
//     of smeared texels), then splits every triangle off its
//     neighbours and gives it its own normal: hard edges, the faceted
//     low-poly look (--smooth keeps soft normals instead).
//   - Shrinks colour textures (base colour, emissive) to a few pixels per
//     side, averaging so colours stay right, and raises their saturation;
//     base-colour factors and float vertex colours get the same saturation.
//   - Writes NEAREST min/mag filters into the glTF samplers: no smoothing,
//     no mipmaps, so texel edges stay hard up close and the surface
//     flickers/sparkles from afar. three.js reads these on load — no
//     component needed. `grain-shimmer="filter: nearest"` adds grain on top.
//   - Drops normal/metal-roughness/occlusion maps and makes materials matte
//     non-metal (--keep-maps keeps them, shrunk and nearest-filtered too):
//     at a few pixels they only add noise, and metal without an env map
//     renders dark in the host.
//
// Input: a raw, uncompressed .glb — normally from generated-assets/
// (scripts/sloyd-generate.ts), or any original. Already meshopt-compressed
// or quantized files are refused (geometry would be quantized twice, see
// cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md).
// Output, by default ready to ship: the uncompressed stylized model goes to
// uncompressed-assets/<name>.glb — exactly where compress-assets keeps its
// pristine originals — and the compressed one to src/assets/<name>.glb,
// via the same code as compress-assets (glb-compression.ts) with LOSSLESS
// WebP and no resizing; lossy WebP would smear the hard texel edges.
// --no-compress writes the uncompressed model to src/assets/ instead.
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO, Primitive, TextureInfo } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, join as joinParts, listTextureSlots, normals, prune, simplify, unweld, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { compressGlbFile } from "./glb-compression";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS_DIR = join(ROOT, "src/assets");
const UNCOMPRESSED_DIR = join(ROOT, "uncompressed-assets");

const COLOR_SLOTS = ["baseColorTexture", "emissiveTexture"];

const USAGE = `Usage:
  npm run stylize -- <input.glb> [options]

Options:
  --faces <n>          target triangle count (default 1000)
  --texture <px>       longest texture side in pixels (default 64)
  --saturation <x>     1 = unchanged, 1.3 = 30% more saturated (default 1.3)
  --smooth             keep soft normals instead of hard, faceted edges
  --permissive         also simplify across texture seams: reaches low targets on fragmented
                       (AI) texture layouts, but smears textures into streaks — fine for
                       near-uniform colours only
  --keep-maps          keep normal/metal-roughness/occlusion maps
  --name <name>        output src/assets/<name>.glb (default: input file name)
  --no-compress        write the uncompressed model to src/assets/ (compress later
                       with npm run compress-assets) instead of compressing right away
  --replace            overwrite an existing src/assets/<name>.glb and its
                       uncompressed-assets/ copy
  --out <path>         write only this one file somewhere else (for trying things out)`;

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
      faces: { type: "string", default: "1000" },
      texture: { type: "string", default: "64" },
      saturation: { type: "string", default: "1.3" },
      smooth: { type: "boolean", default: false },
      permissive: { type: "boolean", default: false },
      "keep-maps": { type: "boolean", default: false },
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
  const keepMaps = values["keep-maps"];

  // Where to write. compress-assets treats an uncompressed-assets/ copy as the
  // source of truth, so both files are written (or replaced) together.
  const compress = !values["no-compress"];
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
  if (used.includes("KHR_draco_mesh_compression")) {
    fail("Draco-compressed input isn't supported yet.");
  }

  const before = triangleCount(doc);
  console.log(`\n${input}`);
  console.log(`  before: ${before.toLocaleString("de-DE")} triangles; ${describeTextures(doc)}`);

  // Geometry: merge, simplify, then hard edges. Parts sharing a material are
  // joined first so the triangle budget goes where it's least visible —
  // simplified one by one, each small part would lose the same share and
  // tiny parts would collapse. Skipped for animated/skinned models, whose
  // node structure has to survive.
  const animated = root.listAnimations().length > 0 || root.listSkins().length > 0;
  if (!animated) await doc.transform(flatten(), joinParts());
  await doc.transform(weld());
  if (before > faces) {
    // By default, UV seams stay where they are, so the reduction stops early
    // on fragmented (AI-generated) texture layouts — e.g. ~3000 instead of
    // 1500 triangles on a textured Sloyd figurine. gltf-transform passes no
    // simplifier flags of its own; with --permissive the 'Permissive' flag
    // lets edges collapse across seams. That reaches the target, but texels
    // get stretched along collapsed seams into visible streak/ring patterns
    // on colourful textures (seen 2026-10-06) — only worth it for near-uniform
    // colours.
    const simplifier = !values.permissive
      ? MeshoptSimplifier
      : {
          ...MeshoptSimplifier,
          simplify: (indices: Uint32Array, positions: Float32Array, stride: number, target: number, error: number, flags: any[] = []) =>
            MeshoptSimplifier.simplify(indices, positions, stride, target, error, [...flags, "Permissive"])
        };
    await doc.transform(simplify({ simplifier, ratio: faces / before, error: 1, lockBorder: false }));
  }
  if (!values.smooth) {
    await doc.transform(unweld(), normals({ overwrite: true }));
  }

  // Materials: matte, colour maps only (unless --keep-maps), saturated factors.
  for (const material of root.listMaterials()) {
    if (!keepMaps) {
      material.setNormalTexture(null);
      material.setOcclusionTexture(null);
      material.setMetallicRoughnessTexture(null);
      material.setMetallicFactor(0);
      material.setRoughnessFactor(1);
    }
    const [r, g, b, a] = material.getBaseColorFactor();
    material.setBaseColorFactor([...saturate([r, g, b], saturation), a] as [number, number, number, number]);
    const infos = [material.getBaseColorTextureInfo(), material.getEmissiveTextureInfo()];
    if (keepMaps) {
      infos.push(material.getNormalTextureInfo(), material.getOcclusionTextureInfo(), material.getMetallicRoughnessTextureInfo());
    }
    for (const info of infos) {
      info?.setMinFilter(TextureInfo.MinFilter.NEAREST).setMagFilter(TextureInfo.MagFilter.NEAREST);
    }
  }
  if (!keepMaps) {
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) prim.setAttribute("TANGENT", null);
    }
  }
  let skippedVertexColors = false;
  for (const accessor of new Set(root.listMeshes().flatMap((m) => m.listPrimitives().map((p) => p.getAttribute("COLOR_0"))))) {
    if (!accessor) continue;
    if (accessor.getComponentType() !== 5126) {
      skippedVertexColors = true; // normalized int colours — left as they are
      continue;
    }
    const el: number[] = [];
    for (let i = 0; i < accessor.getCount(); i++) {
      accessor.getElement(i, el);
      const rgb = saturate(el.slice(0, 3), saturation);
      accessor.setElement(i, [...rgb, ...el.slice(3)]);
    }
  }
  await doc.transform(prune(), dedup());

  // Textures: shrink (averaging), saturate colour textures, PNG (lossless).
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const isColor = listTextureSlots(texture).some((s) => COLOR_SLOTS.includes(s));
    let pipeline = sharp(image).resize(texturePx, texturePx, { fit: "inside", withoutEnlargement: true });
    if (isColor && saturation !== 1) pipeline = pipeline.modulate({ saturation });
    texture.setImage(new Uint8Array(await pipeline.png().toBuffer())).setMimeType("image/png");
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.[^.]+$/, ".png"));
  }

  if (!compress) {
    await io.write(outPath, doc);
    if (!values.out && existsSync(pristinePath)) {
      unlinkSync(pristinePath); // stale — compress-assets must copy the new one
      console.log(`  removed stale uncompressed-assets/${name}.glb`);
    }
  } else {
    const uncompressedPath = values.out ? `${outPath}.uncompressed-tmp.glb` : pristinePath;
    if (!values.out) mkdirSync(UNCOMPRESSED_DIR, { recursive: true });
    await io.write(uncompressedPath, doc);
    await compressGlbFile(uncompressedPath, outPath, { lossless: true });
    if (values.out) unlinkSync(uncompressedPath);
  }
  const after = triangleCount(doc);
  console.log(`  after:  ${after.toLocaleString("de-DE")} triangles; ${describeTextures(doc)}`);
  if (after > faces * 1.5) {
    console.log(`  note: stopped at ${after} — texture seams (try --permissive) or many separate parts limit simplification.`);
  }
  if (animated && after < faces * 0.7) {
    console.log("  note: animated model — parts are simplified one by one, so small parts lose the most.");
  }
  if (skippedVertexColors) console.log("  note: integer vertex colours were left unsaturated.");
  const shown = (path: string) => (path.startsWith(ROOT) ? path.slice(ROOT.length) : path);
  if (compress) {
    console.log(`  written: ${shown(outPath)} (compressed, ${(statSync(outPath).size / 1024).toFixed(0)} KB)`);
    if (!values.out) console.log(`  original: ${shown(pristinePath)} (uncompressed, ${(statSync(pristinePath).size / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`  written: ${shown(outPath)} (uncompressed)`);
    if (!values.out) console.log("\nNext: `npm run compress-assets` — choose LOSSLESS WebP and no resizing.");
  }
}

main();
