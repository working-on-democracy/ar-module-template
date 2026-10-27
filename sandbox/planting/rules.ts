// Planting rules, the same for the sandbox viewer and the AR test scene: which
// objects can be planted, how large, and how far apart. Plain numbers only
// (no three.js), so the server can check a planting with the same code.
import type { Params } from "../params";
import type { ModelVersion, Vec3 } from "../sim/types";

/** The numbers planting needs (from params.ts; the server hands them to the scene). */
export type PlantRules = Pick<Params, "originMinSize" | "originMaxSize" | "originMaxGap" | "plantMinObjects" | "plantMaxObjects">;

/** An object visitors can plant (for now the 8 starter models in sandbox/models). */
export interface CatalogItem { name: string; label: string; glb: string; triangles: number; min: Vec3; max: Vec3; removable?: boolean } // removable: a new object, deletable from the list

/** A planted origin object: model name, place on the ground, size (m, longest side), turn about the vertical. */
export interface Planting { name: string; pos: Vec3; size: number; rotY: number }

const LABELS: Record<string, string> = {
  flamingo: "Flamingo", mango: "Mango", "muschel-vase": "Muschelvase", naehmaschine: "Nähmaschine",
  regenschirm: "Regenschirm", rucksack: "Rucksack", "tarot-figur": "Tarotfigur", "tiffany-lampe": "Tiffanylampe",
};

export function catalogOf(models: Record<string, ModelVersion & { label?: string }>): CatalogItem[] {
  return Object.entries(models).map(([name, m]) => ({ name, label: m.label ?? LABELS[name] ?? name, glb: m.glb, triangles: m.triangles, min: m.min, max: m.max }));
}

/** The model's longest side in its own units. */
export const longestSide = (m: { min: Vec3; max: Vec3 }) => Math.max(...[0, 1, 2].map((k) => m.max[k] - m.min[k]));

export const clampSize = (size: number, p: PlantRules) => Math.min(p.originMaxSize, Math.max(p.originMinSize, size));

/** The size an object is offered in: its own, brought into originMinSize … originMaxSize (as the simulation does). */
export const defaultSize = (m: { min: Vec3; max: Vec3 }, p: PlantRules) => clampSize(longestSide(m), p);

/** Radius of the object's footprint on the ground at a size: half its horizontal diagonal (as for the magnetic triangle). */
export const footprintRadius = (m: { min: Vec3; max: Vec3 }, size: number) =>
  (Math.hypot(m.max[0] - m.min[0], m.max[2] - m.min[2]) / 2) * (size / Math.max(1e-9, longestSide(m)));

export type PlacementCheck =
  | { ok: true; gap: number | null } // gap: m to the nearest planted footprint (null for the first)
  | { ok: false; reason: "overlap" | "far"; gap: number };

/** May an object stand here? Its footprint must not overlap a planted one, and (from
 *  the second on) must be at most originMaxGap from the nearest planted footprint. */
export function checkPlacement(
  item: { min: Vec3; max: Vec3 }, pos: Vec3, size: number,
  planted: { item: { min: Vec3; max: Vec3 }; pos: Vec3; size: number }[], p: PlantRules,
): PlacementCheck {
  if (!planted.length) return { ok: true, gap: null };
  const r = footprintRadius(item, size);
  let gap = Infinity;
  for (const q of planted) gap = Math.min(gap, Math.hypot(pos[0] - q.pos[0], pos[2] - q.pos[2]) - r - footprintRadius(q.item, q.size));
  if (gap < 0) return { ok: false, reason: "overlap", gap };
  if (gap > p.originMaxGap) return { ok: false, reason: "far", gap };
  return { ok: true, gap };
}

/** The server's check of a whole planting: known models, count, sizes and distances, in the order planted. */
export function checkPlanting(plants: Planting[], catalog: CatalogItem[], p: PlantRules): string | null {
  if (plants.length < p.plantMinObjects || plants.length > p.plantMaxObjects) return `${p.plantMinObjects} bis ${p.plantMaxObjects} Objekte, nicht ${plants.length}`;
  const done: { item: CatalogItem; pos: Vec3; size: number }[] = [];
  for (const pl of plants) {
    const item = catalog.find((c) => c.name === pl.name);
    if (!item) return `unbekanntes Objekt ${pl.name}`;
    if (done.some((d) => d.item.name === pl.name)) return `${pl.name} ist zweimal gepflanzt`;
    if (Math.abs(clampSize(pl.size, p) - pl.size) > 1e-6) return `${pl.name}: Größe ${pl.size} außerhalb ${p.originMinSize} … ${p.originMaxSize} m`;
    const c = checkPlacement(item, pl.pos, pl.size, done, p);
    if (!c.ok) return `${pl.name}: ${c.reason === "overlap" ? "überschneidet sich mit einem anderen Objekt" : `mehr als ${p.originMaxGap} m vom nächsten Objekt`}`;
    done.push({ item, pos: pl.pos, size: pl.size });
  }
  return null;
}
