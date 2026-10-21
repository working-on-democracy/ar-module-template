// The steps of the test track (doc "Teststrecke – Konzeptskizze", 2026-10-08)
// as recipes: which script with which settings a copy, a fusion, a halving or a
// texture crush uses. Shared by the real job runner and the plain-number model.
import type { PlantObject } from "./types";

/** Short names of the test track's steps, as they appear in the event log. */
export const STEP_LABEL: Record<string, string> = {
  p2: "Phase 2: Stilisierung",
  p3: "Phase 3: hart verschmolzen",
  p4: "Phase 4: weich verschmolzen",
  p5: "Phase 5: Voxelisierung",
  p6: "Phase 6: weiche Voxel-Verschmelzung",
  p7: "Phase 7: weich, permissiv neu stilisiert (2 500)",
  p8: "Phase 8: weich, permissiv auf 1 000",
  p9: "Phase 9: Texturkompression",
  p10: "Phase 10: wenig Überschneidung, ein Viertel",
  p11: "Phase 11/12: halbiert, Hälften auf die halbe Dreieckszahl",
  p13: "Phase 13: nochmal halbiert, Texturen zerdrückt",
  p13d: "Phase 13 (3./4. Durchgang): ein Drittel, Texturen zerdrückt",
};

export type FusePost =
  | { kind: "reduce"; target: number } // npm run reduce --target
  | { kind: "reduceError"; error: number; max: number } // npm run reduce --error, at most max
  | { kind: "stylize"; faces: number }; // npm run stylize --faces … --texture 128 --saturation 1.3 --permissive

export interface FuseRecipe {
  step: string;
  mode: "hart" | "weich";
  overlap: string; // glb-fuse --overlap
  post: FusePost;
}

/** Phase 3 for an object's first fusion, hard, then 4, 7, 8 and 10 with every further
 *  fusion, soft (counted by the more experienced partner); with a voxel partner Phase 6, soft. */
export function fuseRecipe(a: PlantObject, b: PlantObject): FuseRecipe {
  const sum = a.triangles + b.triangles;
  const n = Math.max(a.fusions, b.fusions) + 1;
  if (a.voxelCells || b.voxelCells) return { step: "p6", mode: "weich", overlap: "0.2-0.6", post: { kind: "reduceError", error: 0.01, max: 5000 } };
  if (n === 1) return { step: "p3", mode: "hart", overlap: "0.05-0.6", post: { kind: "reduce", target: Math.min(10000, sum) } };
  if (n === 2) return { step: "p4", mode: "weich", overlap: "0.2-0.6", post: { kind: "reduce", target: Math.min(10000, sum) } };
  if (n === 3) return { step: "p7", mode: "weich", overlap: "0.2-0.4", post: { kind: "stylize", faces: 2500 } };
  if (n === 4) return { step: "p8", mode: "weich", overlap: "0.1-0.3", post: { kind: "stylize", faces: 1000 } };
  return { step: "p10", mode: "weich", overlap: "0.1-0.2", post: { kind: "reduce", target: Math.max(4, Math.floor(sum / 4)) } };
}

/** Triangles the post step leaves (for the plain-number model). */
export function fusePostTriangles(post: FusePost, sum: number): number {
  if (post.kind === "reduce") return Math.min(sum, post.target);
  if (post.kind === "reduceError") return Math.min(sum, post.max);
  return Math.min(sum, post.faces);
}

export interface HalvingRecipe { step: string; divisor: number; crush: boolean }

/** First halving: Phase 11 + 12 (halves to half the triangles); second and
 *  third: Phase 13 (half, textures crushed); from the fourth on: thirds. */
export function halvingRecipe(o: PlantObject): HalvingRecipe {
  if (o.halvings === 0) return { step: "p11", divisor: 2, crush: false };
  if (o.halvings <= 2) return { step: "p13", divisor: 2, crush: true };
  return { step: "p13d", divisor: 3, crush: true };
}

/** Phase 2 stylize settings for a first-generation copy of an origin object. */
export const STYLIZE_COPY = { faces: 1500, texture: 128, saturation: 1.3 };
/** Phase 9 texture crush. */
export const CRUSH = { quality: 2, passes: 3, saturation: 1.5 };

/** Triangles of a voxel copy (measured with glb-fuse --mode voxel: about 4.2 × cells², a single cube 12). */
export const voxelTriangles = (cells: number) => Math.max(12, Math.round(4.2 * cells * cells));
