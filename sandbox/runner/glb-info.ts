// Triangle count and bounding box of a .glb — what the simulation needs to
// know about a model version (polygon budget, overlap with drawings, radii).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";

export interface GlbInfo {
  triangles: number;
  /** Axis-aligned bounds in the model's own frame (metres). */
  min: [number, number, number];
  max: [number, number, number];
}

let io: NodeIO | null = null;

async function getIO(): Promise<NodeIO> {
  if (io) return io;
  await MeshoptDecoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  return io;
}

export async function glbInfo(path: string): Promise<GlbInfo> {
  const doc = await (await getIO()).read(path);
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // TRIANGLES only
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      triangles += Math.floor((idx ? idx.getCount() : pos?.getCount() ?? 0) / 3);
    }
  }
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const { min, max } = getBounds(scene);
  return { triangles, min: min as [number, number, number], max: max as [number, number, number] };
}

// `npx tsx sandbox/runner/glb-info.ts <a.glb> [b.glb …]` prints the numbers.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of process.argv.slice(2)) {
    const i = await glbInfo(p);
    const size = i.max.map((v, k) => (v - i.min[k]).toFixed(2)).join(" × ");
    console.log(`${p}: ${i.triangles} triangles, ${size} m`);
  }
}
