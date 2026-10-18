// Scenario from a few numbers (the lifecycle page's form): starters in a
// ring around the planting point, photos, drawings, blocks and visits spread
// over the calendar days at random from the seed.
import models from "./starter-models.json";
import { createRng } from "../sim/rng";
import type { ModelVersion, Scenario, ScheduledEntry, Vec3 } from "../sim/types";

const MODELS = models as unknown as Record<string, ModelVersion>;

export const SCENARIO_DEFAULTS = {
  seed: 1,
  days: 200,
  photosPerWeek: 2,
  drawingsPerWeek: 3,
  blockShare: 0.2,
  visitsPerWeek: 4,
  visitDevices: 2,
  visitHours: 0.5,
  contentDistance: 12,
};
export type ScenarioValues = typeof SCENARIO_DEFAULTS;

export function buildScenario(i: { scenario: ScenarioValues; starters: string[] }): Scenario {
  const s = i.scenario;
  const rng = createRng(s.seed * 7919 + 13);
  const starters = i.starters.map((name, k) => {
    const a = (k / i.starters.length) * Math.PI * 2;
    const r = i.starters.length > 1 ? 1.2 : 0;
    return { name, model: MODELS[name], pos: [Math.cos(a) * r, 0, Math.sin(a) * r] as Vec3 };
  });
  const timeline: ScheduledEntry[] = [];
  const spot = (): Vec3 => {
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * s.contentDistance;
    return [Math.cos(a) * r, 0, Math.sin(a) * r];
  };
  const poisson = (perWeek: number, fn: (at: number) => void) => {
    if (perWeek <= 0) return;
    let t = 0;
    for (;;) {
      t += -Math.log(1 - rng.next()) * (7 / perWeek);
      if (t >= s.days) break;
      fn(t);
    }
  };
  let photoNo = 0;
  poisson(s.photosPerWeek, (at) => {
    const id = `f${++photoNo}`;
    timeline.push({ at, type: "foto", id, pos: spot() });
    if (rng.next() < s.blockShare) timeline.push({ at: at + rng.range(0.2, 6), type: "sperren", photoId: id });
  });
  let drawNo = 0;
  poisson(s.drawingsPerWeek, (at) => timeline.push({ at, type: "zeichnung", id: `z${++drawNo}`, pos: spot() }));
  // Visits: devices arrive and leave; overlapping visits add up.
  const changes: { at: number; d: number }[] = [];
  poisson(s.visitsPerWeek, (at) => {
    changes.push({ at, d: s.visitDevices }, { at: at + s.visitHours / 24, d: -s.visitDevices });
  });
  changes.sort((a, b) => a.at - b.at);
  let devices = 0;
  for (const c of changes) { devices += c.d; timeline.push({ at: c.at, type: "besucher", count: devices }); }
  return { name: "formular", seed: s.seed, starters, timeline };
}

