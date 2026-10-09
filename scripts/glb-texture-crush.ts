#!/usr/bin/env -S npx tsx
// Crushes a model's textures on purpose — run via `npm run texture-crush -- <in.glb> [options]`.
// Re-encodes every texture with a very low lossy quality so compression
// artifacts become part of the look: with JPEG, 8×8 blocks, colour bleeding
// (4:2:0 chroma) and banding; with WebP, smeared, washed-out patches.
// --passes repeats the encoding (generation loss), each pass a little worse.
//
// Geometry, materials and samplers stay exactly as they are — the file is
// read and written with the meshopt decoder/encoder registered, so an
// already-compressed model keeps its compressed geometry (no second
// quantization). Output: --out, default generated-assets/<name>-crushed.glb.
// See cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md.
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { listTextureSlots } from "@gltf-transform/functions";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const USAGE = `Usage:
  npm run texture-crush -- <in.glb> [options]

Options:
  --format <f>     jpeg (default: blocks, colour bleeding) | webp (smeared patches)
  --quality <n>    1–100, lower = more artifacts (default 5)
  --saturation <x> colour textures (base colour, emissive) more saturated first, 1.5 = +50 % (default 1)
  --passes <n>     encode this many times in a row, quality dropping each time (default 1)
  --out <path>     output file (default generated-assets/<name>-crushed.glb)`;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      format: { type: "string", default: "jpeg" },
      quality: { type: "string", default: "5" },
      passes: { type: "string", default: "1" },
      saturation: { type: "string", default: "1" },
      out: { type: "string" },
      help: { type: "boolean", default: false }
    }
  });
  const input = positionals[0];
  if (values.help || !input) { console.log(USAGE); return; }
  if (!existsSync(input)) fail(`Not found: ${input}`);
  const format = values.format!;
  if (!["jpeg", "webp"].includes(format)) fail("--format must be jpeg or webp.");
  const quality = parseInt(values.quality!, 10), passes = parseInt(values.passes!, 10);
  if (!(quality >= 1 && quality <= 100)) fail("--quality must be 1–100.");
  if (!(passes >= 1)) fail("--passes must be 1 or more.");
  const saturation = parseFloat(values.saturation!);
  if (!(saturation >= 0)) fail("--saturation must be 0 or more.");
  const out = values.out ?? join(ROOT, "generated-assets", `${basename(input, extname(input))}-crushed.glb`);

  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  const doc = await io.read(input);
  const root = doc.getRoot();

  let n = 0;
  for (const texture of root.listTextures()) {
    let image = texture.getImage();
    if (!image) continue;
    const isColor = listTextureSlots(texture).some((slot) => slot === "baseColorTexture" || slot === "emissiveTexture");
    if (isColor && saturation !== 1) image = new Uint8Array(await sharp(image).modulate({ saturation }).png().toBuffer());
    for (let p = 0; p < passes; p++) {
      const q = Math.max(1, Math.round(quality * (1 - p / (passes + 1))));
      const pipe = sharp(image).removeAlpha();
      image = new Uint8Array(format === "jpeg"
        ? await pipe.jpeg({ quality: q, chromaSubsampling: "4:2:0", mozjpeg: false }).toBuffer()
        : await pipe.webp({ quality: q }).toBuffer());
    }
    texture.setImage(image).setMimeType(format === "jpeg" ? "image/jpeg" : "image/webp");
    if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.[^.]+$/, format === "jpeg" ? ".jpg" : ".webp"));
    n++;
  }
  // a texture written as JPEG must not still be flagged as WebP
  if (format === "jpeg") for (const e of root.listExtensionsUsed()) if (e.extensionName === "EXT_texture_webp") e.dispose();

  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  console.log(`\n● texture-crush ${basename(input)}: ${n} texture(s), ${format} quality ${quality}${passes > 1 ? `, ${passes} passes` : ""}${saturation !== 1 ? `, saturation ×${saturation}` : ""}`);
  console.log(`  written: ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)\n`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
