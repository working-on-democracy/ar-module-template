// Interface 1 (SCHNITTSTELLEN.md): an object and an attracted drawing as the AR
// app gets them, positions from the planting point. The sandbox server answers
// GET /api/plant with these; the replay export (sandbox/replay-export.ts)
// records them over a whole run.
import { grainOf, grainScaleOf, tintIntensity } from "../sim/look";
import { decompose } from "../sim/pose";
import type { Drawing, PlantObject, Vec3, World } from "../sim/types";
import { modelMatrix, swayOf, swayPeriodOf } from "../sim/world";

/** A position from the planting point, as the AR app gets them. */
export const fromPlantingPoint = (w: World, v: Vec3 | number[]): Vec3 => [v[0] - w.plantingPoint[0], v[1], v[2] - w.plantingPoint[2]];

export function plantObjectAnswer(w: World, o: PlantObject) {
  const p = decompose(modelMatrix(o));
  return {
    id: o.id, model: { url: `/run/${o.glb}`, triangles: o.triangles },
    pose: { position: fromPlantingPoint(w, p.p), rotation: p.q, scale: p.s },
    state: o.state, origin: o.origin,
    tint: o.tint ? { color: o.tint.color, intensity: tintIntensity(o.tint) } : null,
    grain: { strength: grainOf(o.triangles), scale: grainScaleOf(o) },
    sway: { height: swayOf(o, w.params), period: swayPeriodOf(o, w.params) },
    photo: o.photo ? { url: `/api/photo/${o.photo.photoId}/${o.crushLevel}/${o.photo.changes}`, frame: o.photo.frame } : null,
    comment: (() => { const c = o.comment && w.comments.find((x) => x.id === o.comment!.commentId); return c ? { text: c.text, color: c.color, frame: o.comment!.frame } : null; })(),
  };
}

/** A drawing the plant has taken hold of (not `frei`): where it is now, how large, and its texture at rest. */
export const plantDrawingAnswer = (w: World, d: Drawing) => ({
  strokeId: d.id, position: fromPlantingPoint(w, d.pos), scale: d.scale, state: d.mode, textureFrom: d.texture ? `/run/${d.texture.glb}` : null,
});
