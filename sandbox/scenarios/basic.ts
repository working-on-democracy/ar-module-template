// First scenario: four origin objects, a few photos and drawings around them,
// one photo blocked, a few visits. Calendar days in `at`.
import models from "./starter-models.json";
import type { ModelVersion, Scenario } from "../sim/types";

const m = models as unknown as Record<string, ModelVersion>;

export const basic: Scenario = {
  name: "basic",
  seed: 1,
  starters: [
    { name: "flamingo", model: m.flamingo, pos: [-1, 0, 0] },
    { name: "regenschirm", model: m.regenschirm, pos: [1.2, 0, 0.4] },
    { name: "naehmaschine", model: m.naehmaschine, pos: [0, 0, 1.3] },
    { name: "tiffany-lampe", model: m["tiffany-lampe"], pos: [0.2, 0, -1.2] },
  ],
  timeline: [
    { at: 0.5, type: "foto", id: "f-a", pos: [4, 0, 3] },
    { at: 1, type: "zeichnung", id: "z-a", pos: [5, 0, -2] },
    { at: 2, type: "foto", id: "f-b", pos: [-5, 0, 2] },
    { at: 2.5, type: "zeichnung", id: "z-b", pos: [-3, 0, -5] },
    { at: 3, type: "besucher", count: 2 },
    { at: 3.1, type: "besucher", count: 0 },
    { at: 4, type: "foto", id: "f-c", pos: [2, 0, -6] },
    { at: 5, type: "zeichnung", id: "z-c", pos: [7, 0, 5] },
    { at: 6, type: "sperren", photoId: "f-b" },
    { at: 7, type: "foto", id: "f-d", pos: [-7, 0, -3] },
    { at: 8, type: "zeichnung", id: "z-d", pos: [-6, 0, 6] },
    { at: 9, type: "besucher", count: 1 },
    { at: 9.05, type: "besucher", count: 0 },
    { at: 12, type: "zeichnung", id: "z-e", pos: [3, 0, 9] },
    { at: 14, type: "loeschen", photoId: "f-c" },
  ],
};
