#!/usr/bin/env -S npx tsx
// Lays photos side by side into one captioned image strip — run via
// `npm run photo-strip -- --title "…" --panel "a.png|Heading|Subline" --panel … --out strip.png`.
// Each photo is trimmed to its content (the uniform background around the
// model is cut away), enlarged or shrunk to fit its panel, and captioned
// with a heading and a quieter subline; the title runs across the top.
// Made for photos from `npm run photo-models`: one strip per test variant
// (e.g. input A | input B | result | reduced), ready to paste into a doc.
// See cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md.
import { parseArgs } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";

const USAGE = `Usage:
  npm run photo-strip -- --title "<text>" --panel "<image>|<heading>|<subline>" [--panel …] --out <strip.png>

Options:
  --title <text>        line across the top
  --panel <spec>        image|heading|subline — repeat once per panel, left to right
  --panel-size <WxH>    size of each picture area in px (default 440x500)
  --out <file>          output .png`;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      title: { type: "string", default: "" },
      panel: { type: "string", multiple: true },
      "panel-size": { type: "string", default: "440x500" },
      out: { type: "string" },
      help: { type: "boolean", default: false }
    }
  });
  const panels = (values.panel ?? []).map((p) => { const [file, heading = "", sub = ""] = p.split("|"); return { file, heading, sub }; });
  if (values.help || !panels.length || !values.out) { console.log(USAGE); return; }
  for (const p of panels) if (!existsSync(p.file)) fail(`Not found: ${p.file}`);
  const [pw, ph] = values["panel-size"]!.split("x").map(Number);
  if (!(pw > 0 && ph > 0)) fail('--panel-size must look like "440x500".');

  // background = the photos' own background colour (bottom-left pixel of the first one)
  const { data } = await sharp(panels[0].file).extract({ left: 2, top: (await sharp(panels[0].file).metadata()).height! - 3, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = { r: data[0], g: data[1], b: data[2] };
  const gap = 20, top = 70, cap = 80, W = pw * panels.length + gap * (panels.length + 1), H = top + ph + cap + gap;

  const layers: sharp.OverlayOptions[] = [];
  for (const [k, p] of panels.entries()) {
    const img = await sharp(p.file).removeAlpha().trim({ background: bg, threshold: 18 })
      .extend({ top: 40, bottom: 40, left: 40, right: 40, background: bg })
      .resize({ width: pw, height: ph, fit: "contain", background: bg }).png().toBuffer();
    layers.push({ input: img, left: gap + k * (pw + gap), top });
  }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">
  <text x="${gap}" y="46" font-size="30" font-weight="bold" fill="#f0f4fa">${esc(values.title!)}</text>
  ${panels.map((p, k) => { const x = gap + k * (pw + gap); return `<text x="${x}" y="${top + ph + 34}" font-size="24" font-weight="bold" fill="#f0f4fa">${esc(p.heading)}</text>
  <text x="${x}" y="${top + ph + 64}" font-size="20" fill="#bec8d6">${esc(p.sub)}</text>`; }).join("\n  ")}
</svg>`;
  layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
  mkdirSync(dirname(values.out), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(layers).png().toFile(values.out);
  console.log(`written: ${values.out} (${W}×${H})`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
