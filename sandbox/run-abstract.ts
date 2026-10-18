// Runs a scenario with plain-number jobs until the ecosystem has passed and
// prints the event log and the curve — a quick check without any viewer.
// `npx tsx sandbox/run-abstract.ts [maxCalendarDays]`
import { PARAMS } from "./params";
import { basic } from "./scenarios/basic";
import { settleJobs } from "./sim/abstract-jobs";
import { applyJob, createWorld, step } from "./sim/world";

const maxDays = Number(process.argv[2] ?? 120);
const w = createWorld(basic, { ...PARAMS });
const DT = 0.01;
while (w.calendar < maxDays && w.phase !== "ende") {
  step(w, DT);
  settleJobs(w, applyJob);
}
for (const e of w.events) console.log(`E ${e.eigen.toFixed(2).padStart(6)}  K ${e.calendar.toFixed(2).padStart(6)}  ${e.text}`);
console.log("\nEigenzeit  Kalender  Dreiecke  Faktor  K/A/V/T");
for (const s of w.samples.filter((_, i) => i % 20 === 0)) {
  console.log(`${s.eigen.toFixed(1).padStart(8)}  ${s.calendar.toFixed(1).padStart(8)}  ${String(s.triangles).padStart(8)}  ${s.factor.toFixed(2).padStart(6)}  ${s.counts.keimling}/${s.counts.aktiv}/${s.counts.verwelkend}/${s.counts.tot}`);
}
console.log(`\nPhase: ${w.phase}, Höchststand ${w.plateauMax}, Kalender ${w.calendar.toFixed(1)} Tage, Eigenzeit ${w.eigen.toFixed(1)} Tage`);
