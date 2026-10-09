// The .glb compression step shared by scripts/compress-assets.ts (interactive,
// src/assets/), scripts/stylize-glb.ts and scripts/stylize-light-glb.ts
// (compress their own output). One
// implementation so both always produce the same result — see
// cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md for the full
// picture. No default export: a helper, not a component or entry point.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compressTexture } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GLTFPACK_BIN = join(ROOT, "node_modules/.bin/gltfpack");

export interface GlbCompressionOptions {
  lossless: boolean;
  quality?: number; // WebP quality when not lossless
  /** [width, height] to resize a texture to, or undefined to leave it. */
  resizeTarget?: (width: number, height: number) => [number, number] | undefined;
}

/**
 * Mesh-compresses `srcPath` (must be an UNCOMPRESSED original — compressing
 * an already-compressed file corrupts geometry further each time) and
 * re-encodes its textures as WebP, writing the result to `outPath`.
 */
export async function compressGlbFile(srcPath: string, outPath: string, options: GlbCompressionOptions): Promise<void> {
  const meshCompressedTmp = join(tmpdir(), `compress-glb-${Date.now()}-${basename(outPath)}`);

  try {
    // Mesh compression — gltfpack -c is the same tool (and same -c flag)
    // this template's projects have always used for this step. Without
    // -kn/-km, gltfpack strips node/mesh/material names entirely by
    // default (verified directly: Rosa_module's shipped, compressed
    // Rosa.glb has zero node names left at all) — plausibly the root cause
    // of mesh-render-order's original hardcoded "Mesh_1".."Mesh_8" map
    // never matching anything real, documented as an open question in
    // guides/MESH-RENDER-ORDER-FEATURE-GUIDE.md at the time. -km keeps named
    // materials outright. -kn keeps names too, but NOT on the mesh node
    // itself — see reattachNamesToMeshNodes below for what it actually
    // does and why that still isn't enough on its own.
    execFileSync(GLTFPACK_BIN, ["-i", srcPath, "-o", meshCompressedTmp, "-c", "-kn", "-km"], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    // Texture pass — deliberately NOT another gltfpack invocation. Running
    // gltfpack's own texture conversion on a file gltfpack JUST mesh-
    // compressed would re-parse and re-quantize the geometry a second time;
    // quantization is lossy, so a second pass compounds precision loss on
    // top of the first. Reading via NodeIO with the meshopt decoder/encoder
    // registered instead round-trips the already-compressed mesh data
    // unchanged — only the textures are touched.
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

    const document = await io.read(meshCompressedTmp);
    reattachNamesToMeshNodes(document);
    for (const texture of document.getRoot().listTextures()) {
      const size = texture.getSize();
      await compressTexture(texture, {
        encoder: sharp,
        targetFormat: "webp",
        resize: size && options.resizeTarget ? options.resizeTarget(size[0], size[1]) : undefined,
        lossless: options.lossless,
        quality: options.quality
      });
    }
    await io.write(outPath, document);
  } finally {
    if (existsSync(meshCompressedTmp)) rmSync(meshCompressedTmp);
  }
}

/**
 * gltfpack's -kn ("keep named nodes") does NOT keep the name on the
 * mesh-bearing node itself — verified directly, not assumed. Instead it
 * wraps each named mesh node in a NEW, unnamed-mesh parent that carries the
 * name, and leaves the original mesh node unnamed as that parent's only
 * child (so the name can still be found and used to transform the group
 * externally, per gltfpack's own stated intent — just not where a component
 * written against the pre-compression convention (a name directly on the
 * mesh node, e.g. mesh-render-order.ts) would look for it). This walks the
 * document and copies each such wrapper's name back down onto its one
 * mesh-bearing child, restoring the original "name lives on the mesh node"
 * convention — so nothing that referenced mesh names before compression
 * needs to change after it.
 */
function reattachNamesToMeshNodes(document: Document): void {
  for (const node of document.getRoot().listNodes()) {
    const name = node.getName();
    if (!name || node.getMesh()) continue;
    const children = node.listChildren();
    if (children.length !== 1) continue;
    const [child] = children;
    if (child.getMesh() && !child.getName()) child.setName(name);
  }
}
