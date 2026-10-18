// Bundles the lifecycle page (simulation core + form + charts) into ONE html
// file: `npx tsx sandbox/lifecycle-page/build.ts [out.html]`.
// Default output: sandbox/lifecycle-page/lebenszyklus-rechner.html (gitignored).
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const out = process.argv[2] ?? here("./lebenszyklus-rechner.html");

const result = await build({
  entryPoints: [here("./main.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync(here("./template.html"), "utf8").replace("/*BUNDLE*/", () => js);
writeFileSync(out, html);
console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
