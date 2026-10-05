#!/usr/bin/env -S npx tsx
// Augmented Bahnhofsviertel release builds — run via `npm run abv:release`.
// Builds every ported work (or `--only 1,19,22`) from its committed branch
// state, both ways, into release/<NN>-<slug>/:
//
//   module/      `vite build` — the library build the host loads
//                (ar-module.js + manifest.json + assets/). Host the whole
//                folder together.
//   standalone/  `vite build --mode ar` — the self-contained 8th Wall page
//                (index.html + bundle + assets + engine in external/). Serve
//                over https, with Range requests for video/audio (iOS).
//
// Per work, in a temporary detached git worktree (the branch's committed
// state — uncommitted changes in your checkout are NOT built):
//   1. Refuses a branch that doesn't contain the current
//      `augmented-bahnhofsviertel` commit (every module must ship the same
//      shared components — in the host the first registration of a name
//      wins). `--allow-behind` builds anyway and flags it.
//   2. `vue-tsc --noEmit`, then both builds.
//   3. Standalone: removes the dev hint box ("AR Module Preview · 8th Wall …")
//      from index.html and titles the page after the work. ar.html itself is
//      untouched, so `npm run dev:ar` keeps the hint.
//   4. Checks both outputs (every manifest asset present, engine/8frame/
//      xrextras in the standalone, no CSS file the host would never load,
//      asset ids prefixed with the work's slug) and writes BUILD-INFO.json
//      (branch, commits, registered components, assets with sizes).
// Across all works: no asset id may occur in two modules (they share one
// <a-assets> in the host).
//
// Writes release/REPORT.md and exits non-zero if anything failed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { usedComponents } from "./used-components";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASE_BRANCH = "augmented-bahnhofsviertel";
const WORKS_JSON = join(ROOT, "augmented-bahnhofsviertel/works.json");
const OUT = join(ROOT, "release");

interface Work { num: number; slug: string; branch: string; title: string; artist: string }
interface Result {
  work: Work;
  commit?: string;
  errors: string[];
  warnings: string[];
  components: string[];
  assets: { id: string; file: string; bytes: number }[];
  moduleBytes: number;
  standaloneBytes: number;
}

const args = process.argv.slice(2);
const allowBehind = args.includes("--allow-behind");
const onlyArg = args.find((a, i) => args[i - 1] === "--only") ?? args.find((a) => a.startsWith("--only="))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(",").map(Number)) : null;

function git(...a: string[]): string {
  return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
}
function branchExists(b: string): boolean {
  try { git("rev-parse", "--verify", "--quiet", `refs/heads/${b}`); return true; } catch { return false; }
}
function run(cmd: string, cmdArgs: string[], cwd: string): void {
  execFileSync(cmd, cmdArgs, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
}
function dirBytes(dir: string): number {
  let total = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    total += st.isDirectory() ? dirBytes(p) : st.size;
  }
  return total;
}
const mb = (b: number) => (b / 1048576).toFixed(1) + " MB";
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const works: Work[] = JSON.parse(readFileSync(WORKS_JSON, "utf8")).works
  .filter((w: Work & { branch: string | null }) => w.branch && branchExists(w.branch))
  .filter((w: Work) => !only || only.has(w.num));
if (!works.length) {
  console.error("No work branches to build.");
  process.exit(1);
}
const baseCommit = git("rev-parse", BASE_BRANCH);
mkdirSync(OUT, { recursive: true });
console.log(`Building ${works.length} work(s) against ${BASE_BRANCH} ${baseCommit.slice(0, 7)} → release/`);

const results: Result[] = [];
for (const work of works) {
  const r: Result = { work, errors: [], warnings: [], components: [], assets: [], moduleBytes: 0, standaloneBytes: 0 };
  results.push(r);
  const name = `${String(work.num).padStart(2, "0")}-${work.slug}`;
  process.stdout.write(`  ${name} … `);
  r.commit = git("rev-parse", work.branch);

  let behind = false;
  try { git("merge-base", "--is-ancestor", BASE_BRANCH, work.branch); } catch { behind = true; }
  if (behind && !allowBehind) {
    r.errors.push(`branch doesn't contain ${BASE_BRANCH} ${baseCommit.slice(0, 7)} — merge it first (or --allow-behind)`);
    console.log("skipped (behind base)");
    continue;
  }
  if (behind) r.warnings.push(`built without the current ${BASE_BRANCH} (--allow-behind)`);

  const wt = mkdtempSync(join(tmpdir(), `abv-release-${work.slug}-`));
  const outDir = join(OUT, name);
  const moduleDir = join(outDir, "module");
  const standaloneDir = join(outDir, "standalone");
  try {
    git("worktree", "add", "--detach", "--quiet", wt, work.branch);
    symlinkSync(join(ROOT, "node_modules"), join(wt, "node_modules"));
    rmSync(outDir, { recursive: true, force: true });

    try { run("npx", ["vue-tsc", "--noEmit"], wt); } catch (e: any) {
      r.errors.push(`vue-tsc failed:\n${(e.stdout || "") + (e.stderr || "")}`.trim());
    }
    try { run("npx", ["vite", "build", "--outDir", moduleDir, "--emptyOutDir"], wt); } catch (e: any) {
      r.errors.push(`module build failed:\n${e.stderr || e.stdout}`.trim());
    }
    try { run("npx", ["vite", "build", "--mode", "ar", "--outDir", standaloneDir, "--emptyOutDir"], wt); } catch (e: any) {
      r.errors.push(`standalone build failed:\n${e.stderr || e.stdout}`.trim());
    }
    r.components = [...usedComponents(join(wt, "src")).keys()];
  } finally {
    try { git("worktree", "remove", "--force", wt); } catch { rmSync(wt, { recursive: true, force: true }); }
  }
  if (r.errors.length) {
    console.log("FAILED");
    continue;
  }

  // Module output.
  const manifestPath = join(moduleDir, "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { assets: [] };
  if (!existsSync(join(moduleDir, "ar-module.js"))) r.errors.push("module: ar-module.js missing");
  if (!existsSync(manifestPath)) r.errors.push("module: manifest.json missing");
  if (readdirSync(moduleDir).some((f) => f.endsWith(".css"))) {
    r.warnings.push("module: emitted a CSS file — the host only import()s the JS, so these styles never apply");
  }
  for (const a of manifest.assets as { id: string; src: string }[]) {
    for (const [label, dir] of [["module", moduleDir], ["standalone", standaloneDir]] as const) {
      const p = join(dir, a.src);
      if (!existsSync(p) || statSync(p).size === 0) r.errors.push(`${label}: asset ${a.src} missing or empty`);
    }
    if (!a.id.startsWith(`${work.slug}-`)) r.warnings.push(`asset id "${a.id}" isn't prefixed with "${work.slug}-"`);
    r.assets.push({ id: a.id, file: a.src, bytes: existsSync(join(moduleDir, a.src)) ? statSync(join(moduleDir, a.src)).size : 0 });
  }

  // Standalone output: required runtime files + page cleanup.
  for (const f of ["index.html", "external/xr/xr.js", "external/scripts/8frame-1.3.0.min.js", "external/xrextras/xrextras.js"]) {
    if (!existsSync(join(standaloneDir, f))) r.errors.push(`standalone: ${f} missing`);
  }
  const indexPath = join(standaloneDir, "index.html");
  if (existsSync(indexPath)) {
    let html = readFileSync(indexPath, "utf8");
    html = html
      .replace(/\s*<div class="preview-overlay">[\s\S]*?<\/div>/, "")
      .replace(/\s*\.preview-overlay[^{]*\{[^}]*\}/g, "")
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(`${work.title} – ${work.artist}`)}</title>`);
    writeFileSync(indexPath, html);
    if (html.includes("preview-overlay")) r.errors.push("standalone: dev hint box still in index.html");
  }

  r.moduleBytes = existsSync(moduleDir) ? dirBytes(moduleDir) : 0;
  r.standaloneBytes = existsSync(standaloneDir) ? dirBytes(standaloneDir) : 0;
  writeFileSync(join(outDir, "BUILD-INFO.json"), JSON.stringify({
    work: `${work.num} ${work.title} (${work.artist})`,
    branch: work.branch,
    commit: r.commit,
    baseCommit,
    builtAt: new Date().toISOString(),
    registeredComponents: r.components,
    assets: r.assets,
    moduleBytes: r.moduleBytes,
    standaloneBytes: r.standaloneBytes,
    warnings: r.warnings
  }, null, 2) + "\n");
  console.log(r.errors.length ? "FAILED" : r.warnings.length ? "ok (warnings)" : "ok");
}

// Across modules: asset ids share the host's one <a-assets>.
const owners = new Map<string, string[]>();
for (const r of results) for (const a of r.assets) owners.set(a.id, [...(owners.get(a.id) ?? []), r.work.slug]);
const duplicates = [...owners].filter(([, o]) => o.length > 1);
for (const [id, o] of duplicates) {
  for (const r of results.filter((x) => o.includes(x.work.slug))) r.errors.push(`asset id "${id}" also used by ${o.filter((s) => s !== r.work.slug).join(", ")}`);
}

const failed = results.filter((r) => r.errors.length);
const lines = [
  "# Release-Builds Augmented Bahnhofsviertel",
  "",
  `Gebaut ${new Date().toISOString()} gegen \`${BASE_BRANCH}\` ${baseCommit.slice(0, 7)}. Erzeugt von \`npm run abv:release\` (scripts/abv-release.ts).`,
  "",
  "| Nr. | Werk | Branch @ Commit | Komponenten | Modul | Standalone | Status |",
  "|---|---|---|---|---|---|---|",
  ...results.map((r) => `| ${r.work.num} | ${r.work.title} | \`${r.work.branch}\` @ ${r.commit?.slice(0, 7) ?? "—"} | ${r.components.join(", ") || "—"} | ${r.moduleBytes ? mb(r.moduleBytes) : "—"} | ${r.standaloneBytes ? mb(r.standaloneBytes) : "—"} | ${r.errors.length ? "**Fehler**" : r.warnings.length ? "Warnungen" : "ok"} |`),
  ""
];
for (const r of results.filter((x) => x.errors.length || x.warnings.length)) {
  lines.push(`## ${r.work.num} ${r.work.title}`, "");
  for (const e of r.errors) lines.push(`- Fehler: ${e.replace(/\n/g, "\n  ")}`);
  for (const w of r.warnings) lines.push(`- Warnung: ${w}`);
  lines.push("");
}
writeFileSync(join(OUT, "REPORT.md"), lines.join("\n"));

console.log(`\n${results.length - failed.length}/${results.length} ok — details in release/REPORT.md`);
for (const r of failed) console.log(`  ${r.work.num} ${r.work.title}: ${r.errors[0].split("\n")[0]}`);
process.exit(failed.length ? 1 : 0);
