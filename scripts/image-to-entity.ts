#!/usr/bin/env -S npx tsx
// One command from a picture to an entity in the scene — run via
// `npm run image-to-entity -- <image>`. Always the same steps:
//
//   1. generate  scripts/sloyd-generate.ts: image → generated-assets/<name>.glb
//                (costs credits, asks first). Skipped when that file already
//                exists, so re-running never pays twice; --glb <file> starts
//                from any existing model instead of an image.
//   2. stylize   scripts/stylize-glb.ts: low poly, hard edges, coarse
//                pixelated saturated texture, compressed → src/assets/<name>.glb
//   3. measure   the model's height → grainScale for ~2400 grain cells over
//                it, so grain-shimmer glitters (cells smaller than a screen
//                pixel) instead of showing specks
//   4. insert    an entity into src/ArModule.vue, inside a marked block in
//                #scene-root (created on first use); re-running with the
//                same name replaces that entity instead of adding another:
//
//     <a-entity id="<name>" gltf-model="#<name>" shadow="cast: true; receive: true"
//               shadow-side="back" grain-shimmer="filter: nearest; grain: 0.15; grainScale: …"
//               gesture-control="drag: false">
//
// shadow-side="back" prevents shadow acne on the faceted model,
// grain-shimmer adds the fine glitter (both tuned on a phone),
// gesture-control lets visitors turn (two fingers) and pinch-scale it —
// scene-wide gestures, so all generated entities turn together
// (--no-gestures leaves it out).
// Placement: a NEW entity always appears at the scene-root origin (on the
// floor, in front of the viewer) unless --position is given, and every
// entity already in the block moves 1 m (--push) further from the viewer
// first: in a random direction within the half circle facing away from
// them. place-in-front turns #scene-root so its local -z points along the
// viewer's gaze (viewer on the +z side), so "away" is an angle θ in
// [-90°, 90°] around -z: (sin θ, 0, -cos θ). Each entity's θ comes from
// its own seed (its name + the new entity's name) — different per entity,
// reproducible per run. Replacing an existing name moves nothing and keeps
// that entity's position. --height scales the entity to a target height
// via a wrapper (so gesture/pinch components that read the model's own
// scale stay at 1); position always sits on the outermost element.
//
// Each step's script can also be run on its own — see
// cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md.
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TSX = join(ROOT, "node_modules/.bin/tsx");
const SCENE_FILE = join(ROOT, "src/ArModule.vue");
const BLOCK_START = "<!-- image-to-entity: generated entities — managed by `npm run image-to-entity`, edit freely -->";
const BLOCK_END = "<!-- /image-to-entity -->";

// Grain cells over the model's height: 0.12 units × grainScale 20000 was
// tuned on a phone for a ~1 m figurine at ~2.5 m (cells < 1 screen pixel).
const GRAIN_CELLS_OVER_HEIGHT = 2400;

const USAGE = `Usage:
  npm run image-to-entity -- <image.png|jpg> [options]
  npm run image-to-entity -- --glb <model.glb> [options]

Options:
  --name <name>          asset/entity id (default: from the file name)
  --faces <n>            stylize: target triangles (default 1500)
  --texture <px>         stylize: texture size (default 128)
  --saturation <x>       stylize: saturation (default 1.3)
  --grain <x>            grain-shimmer strength (default 0.15, 0 = no grain)
  --height <m>           scale the entity to this height (default: model's own size)
  --position "x y z"     position inside #scene-root (default "0 0 0"; on --replace
                         the entity's current position is kept unless this is given)
  --push <m>             how far existing entities move away from the viewer
                         when a new one is added (default 1, 0 = not at all)
  --sloyd-faces <n>      generation detail (default 20000)
  --sloyd-texture <res>  generation texture (default 2k)
  --replace              overwrite an existing stylized src/assets/<name>.glb
  --no-gestures          leave out gesture-control (two-finger rotate + pinch-scale)
  --no-insert            don't touch ArModule.vue, only print the entity
  --yes                  don't ask before spending Sloyd credits`;

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)
      .replace(/-$/, "") || "model"
  );
}

function step(n: number, text: string): void {
  console.log(`\n── ${n}. ${text}`);
}

function run(script: string, args: string[]): void {
  try {
    execFileSync(TSX, [join(ROOT, "scripts", script), ...args], { stdio: "inherit", cwd: ROOT });
  } catch {
    fail(`${script} failed — nothing was inserted into the scene.`);
  }
}

/** Two significant digits: 19 836 → 20 000. */
function round2(n: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

function entityMarkup(
  name: string,
  grain: number,
  grainScale: number,
  position: string,
  scale: number | null,
  gestures: boolean
): string {
  const attrs = [
    `id="${name}"`,
    `gltf-model="#${name}"`,
    `shadow="cast: true; receive: true"`,
    `shadow-side="back"`,
    ...(grain > 0 ? [`grain-shimmer="filter: nearest; grain: ${grain}; grainScale: ${grainScale}"`] : []),
    // On the model, not the scale wrapper: xrextras-pinch-scale reads its
    // base scale once at init and scales around the entity's own origin.
    ...(gestures ? [`gesture-control="drag: false"`] : [])
  ].join("\n        ");
  if (scale === null) {
    return `    <a-entity position="${position}"\n        ${attrs}></a-entity>`;
  }
  return (
    `    <a-entity id="${name}-wrapper" position="${position}" scale="${scale} ${scale} ${scale}">\n` +
    `      <a-entity\n          ${attrs.replace(/\n {8}/g, "\n          ")}></a-entity>\n` +
    `    </a-entity>`
  );
}

/** Index just before the closing tag of the <a-entity> whose opening tag starts at `openAt`. */
function closingTagIndex(source: string, openAt: number): number {
  const tag = /<(\/?)a-entity\b[^>]*?(\/?)>/g;
  tag.lastIndex = openAt;
  let depth = 0;
  for (let m = tag.exec(source); m; m = tag.exec(source)) {
    if (m[1]) depth--;
    else if (!m[2]) depth++;
    if (depth === 0) return m.index;
  }
  return -1;
}

/** First `position="x y z"` in an entry (its outermost element), or "0 0 0". */
function entryPosition(entry: string): string {
  return /\bposition="([^"]*)"/.exec(entry)?.[1].trim() ?? "0 0 0";
}

/** Sets the outermost element's position in an entry (adds the attribute if missing). */
function withPosition(entry: string, position: string): string {
  if (/\bposition="[^"]*"/.test(entry)) return entry.replace(/\bposition="[^"]*"/, `position="${position}"`);
  return entry.replace(/<a-entity\b/, `<a-entity position="${position}"`);
}

/** FNV-1a string hash → mulberry32: a small seeded PRNG, one value in [0, 1). */
function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let t = (h + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const fmt = (n: number) => String(+n.toFixed(3));

interface Moved { name: string; angle: number; from: string; to: string }

/**
 * Inserts or replaces the entity for `name` in the managed block of
 * ArModule.vue. On insert, every entity already in the block first moves
 * `push` units away from the viewer (see header).
 */
function insertIntoScene(
  name: string,
  markup: string,
  push: number,
  keepPositionOnReplace: boolean
): { result: "inserted" | "replaced"; moved: Moved[]; markup: string } {
  let source = readFileSync(SCENE_FILE, "utf8");

  if (!source.includes(BLOCK_START)) {
    const open = source.search(/<a-entity\b[^>]*\bid="scene-root"/);
    if (open < 0) fail(`No #scene-root in src/ArModule.vue — add this entity by hand:\n\n${markup}`);
    const close = closingTagIndex(source, open);
    if (close < 0) fail(`Couldn't find the end of #scene-root — add this entity by hand:\n\n${markup}`);
    const lineStart = source.lastIndexOf("\n", close) + 1;
    const blankBefore = /\n\s*\n$/.test(source.slice(0, lineStart));
    source = source.slice(0, lineStart) + `${blankBefore ? "" : "\n"}    ${BLOCK_START}\n    ${BLOCK_END}\n` + source.slice(lineStart);
  }

  const startAt = source.indexOf(BLOCK_START) + BLOCK_START.length;
  const endAt = source.indexOf(BLOCK_END, startAt);
  let block = source.slice(startAt, endAt);
  const entryPattern = (n: string) => new RegExp(`    <!-- ${n} -->[\\s\\S]*?<!-- /${n} -->`);
  const moved: Moved[] = [];
  let result: "inserted" | "replaced";

  const existing = entryPattern(name).exec(block);
  if (existing) {
    if (keepPositionOnReplace) markup = withPosition(markup, entryPosition(existing[0]));
    block = block.replace(existing[0], `    <!-- ${name} -->\n${markup}\n    <!-- /${name} -->`);
    result = "replaced";
  } else {
    if (push > 0) {
      for (const m of block.matchAll(/    <!-- ([a-z0-9-]+) -->[\s\S]*?<!-- \/\1 -->/g)) {
        const [entry, other] = m;
        const theta = (seededRandom(`${other}|${name}`) - 0.5) * Math.PI; // −90° … +90° around −z
        const [x, y, z] = entryPosition(entry).split(/\s+/).map(Number);
        const to = `${fmt(x + push * Math.sin(theta))} ${fmt(y)} ${fmt(z - push * Math.cos(theta))}`;
        moved.push({ name: other, angle: Math.round((theta * 180) / Math.PI), from: `${x} ${y} ${z}`, to });
        block = block.replace(entry, withPosition(entry, to));
      }
    }
    block = block.replace(/\n\s*$/, "") + `\n    <!-- ${name} -->\n${markup}\n    <!-- /${name} -->\n    `;
    result = "inserted";
  }
  source = source.slice(0, startAt) + block + source.slice(endAt);
  writeFileSync(SCENE_FILE, source);
  return { result, moved, markup };
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      glb: { type: "string" },
      name: { type: "string" },
      faces: { type: "string", default: "1500" },
      texture: { type: "string", default: "128" },
      saturation: { type: "string", default: "1.3" },
      grain: { type: "string", default: "0.15" },
      height: { type: "string" },
      position: { type: "string" },
      push: { type: "string", default: "1" },
      "sloyd-faces": { type: "string", default: "20000" },
      "sloyd-texture": { type: "string", default: "2k" },
      replace: { type: "boolean", default: false },
      "no-insert": { type: "boolean", default: false },
      "no-gestures": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false }
    }
  });
  const image = positionals[0];
  if (values.help || (!image && !values.glb) || (image && values.glb)) {
    console.log(USAGE);
    return;
  }
  const source = values.glb ?? image;
  if (!existsSync(source)) fail(`Not found: ${source}`);
  const name = slug(values.name ?? basename(source, extname(source)));
  const grain = parseFloat(values.grain);
  if (!(grain >= 0)) fail("--grain must be 0 or more.");
  const height = values.height !== undefined ? parseFloat(values.height) : null;
  if (height !== null && !(height > 0)) fail("--height must be a positive number.");
  const position = values.position ?? "0 0 0";
  if (!/^-?[\d.]+ -?[\d.]+ -?[\d.]+$/.test(position)) fail('--position must look like "x y z".');
  const push = parseFloat(values.push);
  if (!(push >= 0)) fail("--push must be 0 or more.");

  // 1. generate
  let raw = values.glb;
  if (!raw) {
    raw = join("generated-assets", `${name}.glb`);
    step(1, `generate — ${raw}`);
    if (existsSync(join(ROOT, raw))) {
      console.log(`   already there — reusing it (no credits). Delete it to generate anew.`);
    } else {
      run("sloyd-generate.ts", [
        "image", image, "--name", name,
        "--faces", values["sloyd-faces"], "--texture", values["sloyd-texture"],
        ...(values.yes ? ["--yes"] : [])
      ]);
    }
  } else {
    step(1, `generate — skipped, starting from ${raw}`);
  }

  // 2. stylize (+ compress)
  step(2, `stylize — src/assets/${name}.glb`);
  run("stylize-glb.ts", [
    raw, "--name", name,
    "--faces", values.faces, "--texture", values.texture, "--saturation", values.saturation,
    ...(values.replace ? ["--replace"] : [])
  ]);

  // 3. measure
  step(3, "measure");
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(join(ROOT, "src/assets", `${name}.glb`));
  const bounds = getBounds(doc.getRoot().listScenes()[0]);
  const modelHeight = bounds.max[1] - bounds.min[1];
  if (!(modelHeight > 0)) fail("The model has no height — can't size the grain.");
  const grainScale = round2(GRAIN_CELLS_OVER_HEIGHT / modelHeight);
  const scale = height !== null ? +(height / modelHeight).toFixed(3) : null;
  const shown = height ?? modelHeight;
  console.log(
    `   height ${modelHeight.toFixed(3)} units` +
      (scale !== null ? ` × ${scale} = ${shown.toFixed(2)} m` : "") +
      ` · grainScale ${grainScale}` +
      (bounds.min[1] < -0.001 || bounds.min[1] > 0.001 ? ` · note: base at y = ${bounds.min[1].toFixed(3)}, not 0` : "")
  );

  // 4. insert
  const markup = entityMarkup(name, grain, grainScale, position, scale, !values["no-gestures"]);
  if (values["no-insert"]) {
    step(4, "entity (not inserted, --no-insert)");
    console.log(`\n${markup}\n`);
    return;
  }
  step(4, "insert into src/ArModule.vue");
  const { result, moved, markup: written } = insertIntoScene(name, markup, push, values.position === undefined);
  for (const m of moved) {
    console.log(`   moved #${m.name} ${push} m away from the viewer (${m.angle}°): ${m.from} → ${m.to}`);
  }
  console.log(`   ${result} entity #${name}:\n\n${written}\n`);
  console.log("Done. Check it with npm run dev:ar (phone) before committing.");
}

main();
