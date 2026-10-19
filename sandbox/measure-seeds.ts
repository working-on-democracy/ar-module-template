// Runs the lifecycle page's standard scenario over 10 seeds with plain-number
// jobs and prints the medians of the phase days and a few shape figures.
// `npx tsx sandbox/measure-seeds.ts ['{"budget": 90000}']` — JSON overrides the params.
import { PARAMS } from "./params";
import { buildScenario, SCENARIO_DEFAULTS } from "./scenarios/generate";
import { runAbstractJob } from "./sim/abstract-jobs";
import { advance } from "./sim/schedule";
import type { JobResult } from "./sim/types";
import { createWorld } from "./sim/world";
import { STEP_LABEL } from "./sim/recipes";

const STARTERS = ["flamingo", "mango", "muschel-vase", "rucksack", "tarot-figur"];
const over = JSON.parse(process.argv[2] ?? "{}");
const med = (a: number[]) => { const s = a.filter((x) => !Number.isNaN(x)).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const P: number[] = [], D: number[] = [], H: number[] = [], V: number[] = [], E: number[] = [], high: number[] = [], drop: number[] = [], copies: number[] = [], gen: number[] = [], objs: number[] = [];
let none = 0, linesAtMax = 0, lines = 0;
const plainC: number[] = [], voxelC: number[] = [], firstVoxelAfterPlateau: number[] = [];
const stepRuns: Record<string, number> = {};
for (let seed = 1; seed <= 10; seed++) {
  const p = { ...PARAMS, ...over };
  const w = createWorld(buildScenario({ scenario: { ...SCENARIO_DEFAULTS, seed, days: 200 }, starters: STARTERS }), p);
  const ready = new Map<number, JobResult>();
  let maxObj = 0, maxGen = 0;
  const lineMax: Record<string, number> = {};
  while (w.calendar < 200 && w.phase !== "ende") {
    const r = advance(w, ready);
    if ("jobs" in r) for (const j of r.jobs) ready.set(j.id, runAbstractJob(w, j));
    maxObj = Math.max(maxObj, w.objects.length);
    for (const o of w.objects) { maxGen = Math.max(maxGen, o.generation); lineMax[o.lineage] = Math.max(lineMax[o.lineage] ?? 0, o.generation); }
  }
  const at = (t: string) => w.events.find((e) => e.type === "phase" && e.text.includes(t))?.calendar ?? NaN;
  P.push(at("Plateau")); D.push(at("Abstieg")); H.push(at("Halbieren")); V.push(at("Verfall")); E.push(at("vergangen"));
  if (Number.isNaN(at("Plateau"))) none++;
  let h = 0;
  for (let i = 1; i < w.samples.length; i++) if (w.samples[i].triangles >= w.compressAt) h += w.samples[i].calendar - w.samples[i - 1].calendar;
  high.push(h);
  let worst = 0;
  for (let i = 0; i < w.samples.length; i++) {
    const j = w.samples.findIndex((s) => s.calendar >= w.samples[i].calendar + 1);
    if (j < 0) break;
    worst = Math.max(worst, w.samples[i].triangles - w.samples[j].triangles);
  }
  for (const g of Object.values(lineMax)) { lines++; if (g >= p.maxGeneration) linesAtMax++; }
  drop.push(worst);
  for (const k of Object.keys(w.stepsSeen)) stepRuns[k] = (stepRuns[k] ?? 0) + 1;
  const kopien = w.events.filter((e) => e.type === "kopie");
  plainC.push(kopien.filter((e) => !e.text.includes("voxelisiert")).length);
  voxelC.push(kopien.filter((e) => e.text.includes("voxelisiert")).length);
  firstVoxelAfterPlateau.push((kopien.find((e) => e.text.includes("voxelisiert"))?.calendar ?? NaN) - at("Plateau")); copies.push(w.events.filter((e) => e.type === "kopie").length); gen.push(maxGen); objs.push(maxObj);
}
const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "–");
console.log(`Kalendertage (Median über 10 Seeds): Plateau ${f(med(P))}, Abstieg ${f(med(D))}, Halbieren ${f(med(H))}, Verfall ${f(med(V))}, Ende ${f(med(E))}`);
console.log(`ohne Plateau ${none}/10 · Tage über der Kompressionsgrenze ${f(med(high))} · steilster Tag −${med(drop)} · Kopien ${med(copies)} · höchste Generation ${med(gen)} (Linien mit der höchsten Generation: ${linesAtMax}/${lines}) · Objekte höchstens ${med(objs)}`);
console.log(`Kopien ohne Voxel ${med(plainC)}, mit Voxel ${med(voxelC)} · erste Voxel-Kopie ${f(med(firstVoxelAfterPlateau))} Tage nach dem Plateau (frühester Lauf ${f(Math.min(...firstVoxelAfterPlateau.filter((x) => !Number.isNaN(x))))})`);
const missing = Object.keys(STEP_LABEL).filter((k) => (stepRuns[k] ?? 0) < 10);
console.log(`Teststrecken-Schritte in allen 10 Läufen: ${Object.keys(STEP_LABEL).filter((k) => stepRuns[k] === 10).join(", ")}${missing.length ? ` · fehlen in manchen Läufen: ${missing.map((k) => `${k} (${stepRuns[k] ?? 0}/10)`).join(", ")}` : ""}`);
