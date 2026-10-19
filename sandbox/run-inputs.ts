// Runs the values copied from the lifecycle page ("Werte kopieren") with
// plain-number jobs and prints the phases, the curve and the event log.
// `npx tsx sandbox/run-inputs.ts values.json`
import { readFileSync } from "node:fs";
import { PARAMS } from "./params";
import { buildScenario, SCENARIO_DEFAULTS } from "./scenarios/generate";
import { runAbstractJob } from "./sim/abstract-jobs";
import { advance } from "./sim/schedule";
import type { JobResult } from "./sim/types";
import { createWorld } from "./sim/world";

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const scenario = { ...SCENARIO_DEFAULTS, ...input.scenario };
const w = createWorld(buildScenario({ scenario, starters: input.starters }), { ...PARAMS, ...input.params });
const ready = new Map<number, JobResult>();
while (w.calendar < scenario.days && w.phase !== "ende") {
  const r = advance(w, ready);
  if ("jobs" in r) for (const j of r.jobs) ready.set(j.id, runAbstractJob(w, j));
}
for (const e of w.events) console.log(`E ${e.eigen.toFixed(2).padStart(6)}  K ${e.calendar.toFixed(2).padStart(6)}  ${e.text}`);
console.log("\nEigenzeit  Kalender  Dreiecke  Faktor  K/A/V/T");
for (const s of w.samples.filter((_, i) => i % 10 === 0)) {
  console.log(`${s.eigen.toFixed(1).padStart(8)}  ${s.calendar.toFixed(1).padStart(8)}  ${String(s.triangles).padStart(8)}  ${s.factor.toFixed(2).padStart(6)}  ${s.counts.keimling}/${s.counts.aktiv}/${s.counts.verwelkend}/${s.counts.tot}`);
}
console.log(`\nPhase: ${w.phase}, Höchststand ${w.plateauMax}`);
