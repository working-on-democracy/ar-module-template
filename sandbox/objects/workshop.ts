// New objects from the upload page (sandbox/viewer/objekte.html), until the
// platform does this on its server: an image or a prompt goes to Sloyd
// (scripts/sloyd-generate.ts, with sloydFaces and sloydTexture), the result is
// reduced to the working version (originMaxTriangles, as when planting) and
// entered in the local catalog, so the planting scene offers it at once. Then
// every Keimling variant of its line is computed ahead (SERVER-OFFENE-PUNKTE.md,
// "Keimling-Varianten vorbereiten"), one step at a time and only while the
// simulation computes nothing: the Vorläufer copies, generations 1 to 8 and the
// preparation of every version for fusing (the shared fuse cache). The runs do
// not use the variants yet.
//
// Everything lives in sandbox-objects/ (gitignored):
//   katalog.json                the objects ready to plant (like starter-models.json, with a label)
//   <name>/status.json          what was asked for and how far it is
//   <name>/quelle.<ext> | prompt.txt, roh.glb (Sloyd), <name>.glb (working version), varianten/*.glb
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Params } from "../params";
import { glbInfo } from "../runner/glb-info";
import { script } from "../runner/jobs";
import { STYLIZE_COPY } from "../sim/recipes";
import type { ModelVersion } from "../sim/types";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const OBJECTS_DIR = join(ROOT, "sandbox-objects");
const CATALOG = join(OBJECTS_DIR, "katalog.json");
const FUSE_CACHE = join(ROOT, "sandbox-runs", "fuse-cache"); // the one the runs use (runner/jobs.ts)
const PERMISSIVE_RETRY = 1.5; // as in runner/jobs.ts: texture seams can stop a reduction far above its target

export type StepState = "wartet" | "läuft" | "fertig" | "fehler";
export interface Step { id: string; label: string; state: StepState; triangles?: number; error?: string }
export interface ObjectStatus {
  name: string; // file name, a–z 0–9 and -
  label: string; // shown in the planting list
  kind: "image" | "text";
  input: string; // the prompt, or the image's file name
  createdAt: string;
  state: "sloyd" | "arbeitsfassung" | "varianten" | "fertig" | "fehler";
  error?: string;
  steps: Step[]; // the variants
}
export type CatalogEntry = ModelVersion & { label: string };

/** Texture size in px as Sloyd names it: 2048 → "2k" */
const sloydTexture = (px: number) => (px >= 1024 ? `${Math.round(px / 1024)}k` : String(px));

/** "Gelbe Gießkanne!" → "gelbe-giesskanne" */
export const slug = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function readCatalog(): Record<string, CatalogEntry> {
  return existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8")) : {};
}

/** Where an object's working version is: the 8 starter models in sandbox/models, new ones in sandbox-objects/<name>/. */
export const objectFile = (name: string, glb: string) => join(OBJECTS_DIR, name, glb);

export class Workshop {
  private readonly busyObjects: string[] = []; // waiting for Sloyd and the working version, in order
  private working = false;
  private variantsRunning = false;

  /** simulationBusy: true while the sandbox's run computes or waits for jobs (it goes first). */
  constructor(private readonly params: Params, private readonly simulationBusy: () => boolean, private readonly taken: (name: string) => boolean) {
    mkdirSync(OBJECTS_DIR, { recursive: true });
    // what was interrupted by a restart goes on
    for (const s of this.list()) {
      if (s.state === "sloyd" || s.state === "arbeitsfassung") this.busyObjects.push(s.name);
    }
    this.next();
    setInterval(() => this.variants(), 2000);
  }

  list(): ObjectStatus[] {
    return readdirSync(OBJECTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(OBJECTS_DIR, d.name, "status.json")))
      .map((d) => this.status(d.name)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** A new object: checks, stores the input, queues it. Returns an error text or null. */
  add(input: { kind: string; label: string; prompt?: string; image?: string; imageName?: string }): string | null {
    const label = String(input.label ?? "").trim();
    const name = slug(label);
    if (!name) return "Bitte einen Namen angeben.";
    if (this.taken(name) || existsSync(join(OBJECTS_DIR, name))) return `Den Namen „${label}“ (${name}) gibt es schon.`;
    const dir = join(OBJECTS_DIR, name);
    let source: string;
    if (input.kind === "text") {
      const prompt = String(input.prompt ?? "").trim();
      if (prompt.length < 3) return "Bitte eine Beschreibung eingeben.";
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "prompt.txt"), prompt);
      source = prompt;
    } else if (input.kind === "image") {
      const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(String(input.image ?? ""));
      if (!m) return "Bitte ein Bild (PNG, JPEG oder WebP) wählen.";
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `quelle.${m[1] === "jpeg" ? "jpg" : m[1]}`), Buffer.from(m[2], "base64"));
      source = String(input.imageName ?? `quelle.${m[1]}`);
    } else return "Unbekannte Art.";
    this.save({ name, label, kind: input.kind, input: source, createdAt: new Date().toISOString(), state: "sloyd", steps: [] });
    this.busyObjects.push(name);
    this.next();
    return null;
  }

  // ------------------------------------------------------------ Sloyd and the working version (one object at a time)

  private async next() {
    if (this.working) return;
    const name = this.busyObjects.shift();
    if (!name) return;
    this.working = true;
    try { await this.make(name); } catch (e) {
      const s = this.status(name);
      this.save({ ...s, state: "fehler", error: (e as Error).message.slice(0, 1500) });
      console.error(`Objekt ${name}: ${(e as Error).message.slice(0, 500)}`);
    }
    this.working = false;
    this.next();
  }

  private async make(name: string) {
    const dir = join(OBJECTS_DIR, name), raw = join(dir, "roh.glb"), work = join(dir, `${name}.glb`);
    let s = this.status(name);
    if (!existsSync(raw)) {
      const source = s.kind === "text" ? ["text", readFileSync(join(dir, "prompt.txt"), "utf8")] : ["image", join(dir, readdirSync(dir).find((f) => f.startsWith("quelle."))!)];
      const sloydName = `objekt-${name}`; // in generated-assets/, where the script writes (it never overwrites)
      await script("sloyd-generate.ts", [...source, "--faces", String(this.params.sloydFaces), "--texture", sloydTexture(this.params.sloydTexture), "--name", sloydName, "--yes"]);
      renameSync(join(ROOT, "generated-assets", `${sloydName}.glb`), raw);
    }
    this.save(s = { ...this.status(name), state: "arbeitsfassung" });
    const target = this.params.originMaxTriangles;
    if ((await glbInfo(raw)).triangles > target) {
      await script("glb-reduce.ts", [raw, "--target", String(target), "--out", work]);
      if ((await glbInfo(work)).triangles > target * 1.1) await script("glb-reduce.ts", [raw, "--target", String(target), "--permissive", "--out", work]);
    } else writeFileSync(work, readFileSync(raw));
    const info = await glbInfo(work);
    const catalog = readCatalog();
    catalog[name] = { glb: `${name}.glb`, label: s.label, triangles: info.triangles, min: info.min, max: info.max };
    writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
    this.save({ ...this.status(name), state: "varianten", steps: this.plan() });
    console.log(`Objekt ${name} (${s.label}) ist im Katalog: ${info.triangles} Dreiecke, Varianten folgen`);
  }

  // ------------------------------------------------------------ Keimling variants (one step at a time, after the simulation)

  /** The variants of a line, early generations first (as the simulation asks for them). */
  private plan(): Step[] {
    const p = this.params, steps: Step[] = [];
    const cells = (gen: number) => Math.max(1, Math.round(p.voxelCellsStart * Math.pow(p.voxelCellsFactor, gen - p.voxelFromGeneration)));
    steps.push({ id: "g1", label: `Generation 1 und Vorläufer: Phase 2, ${STYLIZE_COPY.faces} Flächen`, state: "wartet" });
    steps.push({ id: "vorlaeufer-g2", label: `Vorläufer Generation 2: Phase 2, ${Math.round(STYLIZE_COPY.faces * p.copyShrink)} Flächen`, state: "wartet" });
    steps.push({ id: "g2", label: `Generation 2: Reduktion auf ${p.copyShrink} der Generation 1`, state: "wartet" });
    steps.push({ id: `vorlaeufer-g${p.voxelFromGeneration}`, label: `Vorläufer Generation ${p.voxelFromGeneration}: Voxel ${cells(p.voxelFromGeneration)} vom Ursprung`, state: "wartet" });
    for (let g = p.voxelFromGeneration; g <= p.maxGeneration; g++) steps.push({ id: `g${g}`, label: `Generation ${g}: Voxel ${cells(g)} aus Generation ${g - 1}`, state: "wartet" });
    steps.push({ id: "fuse", label: "Vorbereitung fürs Verschmelzen (jede Fassung)", state: "wartet" });
    return steps;
  }

  private async variants() {
    if (this.variantsRunning || this.working || this.simulationBusy()) return;
    const s = this.list().reverse().find((x) => x.state === "varianten"); // oldest first
    const step = s?.steps.find((x) => x.state === "wartet" || x.state === "läuft");
    if (!s) return;
    if (!step) { this.save({ ...s, state: "fertig" }); return; }
    this.variantsRunning = true;
    step.state = "läuft";
    this.save(s);
    try {
      step.triangles = await this.variant(s.name, step.id);
      step.state = "fertig";
    } catch (e) {
      step.state = "fehler";
      step.error = (e as Error).message.slice(0, 800);
    }
    this.save({ ...this.status(s.name), steps: s.steps });
    this.variantsRunning = false;
  }

  private async variant(name: string, id: string): Promise<number | undefined> {
    const p = this.params, dir = join(OBJECTS_DIR, name), vdir = join(dir, "varianten");
    mkdirSync(vdir, { recursive: true });
    const work = join(dir, `${name}.glb`), file = (v: string) => join(vdir, `${v}.glb`);
    const stylize = async (from: string, to: string, faces: number) => {
      const args = [from, "--faces", String(faces), "--texture", String(STYLIZE_COPY.texture), "--saturation", String(STYLIZE_COPY.saturation), "--no-compress", "--out", to];
      await script("stylize-glb.ts", args);
      if ((await glbInfo(to)).triangles > faces * PERMISSIVE_RETRY) await script("stylize-glb.ts", [...args.slice(0, -2), "--permissive", "--out", to]);
    };
    const voxel = (from: string, to: string, cells: number) => script("glb-fuse.ts", [from, "--mode", "voxel", "--voxel-cells", String(cells), "--out", to]);
    const gen = /^g(\d+)$/.exec(id), pioneer = /^vorlaeufer-g(\d+)$/.exec(id);
    if (id === "g1") await stylize(work, file("g1"), STYLIZE_COPY.faces);
    else if (id === "vorlaeufer-g2") await stylize(work, file(id), Math.round(STYLIZE_COPY.faces * p.copyShrink));
    else if (id === "g2") await script("glb-reduce.ts", [file("g1"), "--target", String(Math.floor((await glbInfo(file("g1"))).triangles * p.copyShrink)), "--out", file("g2")]);
    else if (pioneer) await voxel(work, file(id), Math.max(1, Math.round(p.voxelCellsStart * Math.pow(p.voxelCellsFactor, Number(pioneer[1]) - p.voxelFromGeneration))));
    else if (gen) {
      const g = Number(gen[1]);
      await voxel(file(`g${g - 1}`), file(id), Math.max(1, Math.round(p.voxelCellsStart * Math.pow(p.voxelCellsFactor, g - p.voxelFromGeneration))));
    } else if (id === "fuse") {
      // every version prepared once into the runs' fuse cache, with the options the runs use (runner/jobs.ts)
      for (const f of [work, ...readdirSync(vdir).filter((x) => x.endsWith(".glb")).map((x) => join(vdir, x))]) {
        await script("glb-fuse.ts", [f, f, "--mode", "hart", "--min-fill", "0.15", "--repair", "--cache", FUSE_CACHE, "--pose-only"]);
      }
      return undefined;
    } else throw new Error(`unbekannte Variante ${id}`);
    return (await glbInfo(file(id))).triangles;
  }

  // ------------------------------------------------------------ status files

  private status(name: string): ObjectStatus {
    return JSON.parse(readFileSync(join(OBJECTS_DIR, name, "status.json"), "utf8"));
  }

  private save(s: ObjectStatus) {
    const f = join(OBJECTS_DIR, s.name, "status.json");
    writeFileSync(`${f}.tmp`, JSON.stringify(s, null, 2));
    renameSync(`${f}.tmp`, f);
  }
}
