#!/usr/bin/env -S npx tsx
// Augmented Bahnhofsviertel deploy — run via `npm run abv:deploy` (optionally
// `-- --only 1,19`). Rsyncs the already-built `release/<NN>-<slug>/` folders
// (from `npm run abv:release`) to the AN ALLE! production server, same host
// and same `ar-modules/` + `standalones/` locations as the AN ALLE! works,
// under an `abv-`-prefixed name so the two projects stay distinguishable:
//
//   release/<NN>-<slug>/module/      -> html/ar-modules/abv-<slug>-module/
//   release/<NN>-<slug>/standalone/  -> html/standalones/abv-<slug>-standalone/
//
// Refuses a work whose release/ output is missing or failed (per
// release/REPORT.md) instead of uploading a stale or broken build.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKS_JSON = join(ROOT, "augmented-bahnhofsviertel/works.json");
const RELEASE_DIR = join(ROOT, "release");
const REMOTE_HOST = "uberspace-allean";
const REMOTE_BASE = "html";

interface Work { num: number; slug: string; branch: string | null; title: string }

const args = process.argv.slice(2);
const onlyArg = args.find((a, i) => args[i - 1] === "--only") ?? args.find((a) => a.startsWith("--only="))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(",").map(Number)) : null;

const works: Work[] = JSON.parse(readFileSync(WORKS_JSON, "utf8")).works
  .filter((w: Work) => w.branch)
  .filter((w: Work) => !only || only.has(w.num));
if (!works.length) {
  console.error("No works to deploy.");
  process.exit(1);
}

function rsync(src: string, dest: string): void {
  execFileSync("rsync", ["-avz", "--delete", "-e", "ssh", `${src}/`, `${REMOTE_HOST}:${dest}/`], { stdio: "inherit" });
}

let failed = 0;
for (const work of works) {
  const name = `${String(work.num).padStart(2, "0")}-${work.slug}`;
  const outDir = join(RELEASE_DIR, name);
  const moduleDir = join(outDir, "module");
  const standaloneDir = join(outDir, "standalone");
  if (!existsSync(join(moduleDir, "manifest.json")) || !existsSync(join(standaloneDir, "index.html"))) {
    console.error(`${name}: no successful release build in release/${name}/ — run \`npm run abv:release\` first`);
    failed++;
    continue;
  }

  const moduleName = `abv-${work.slug}-module`;
  const standaloneName = `abv-${work.slug}-standalone`;
  console.log(`${name} -> ar-modules/${moduleName}/ + standalones/${standaloneName}/`);
  rsync(moduleDir, `${REMOTE_BASE}/ar-modules/${moduleName}`);
  rsync(standaloneDir, `${REMOTE_BASE}/standalones/${standaloneName}`);
  console.log(`  standalone: https://allean.uber.space/standalones/${standaloneName}/`);
}

process.exit(failed ? 1 : 0);
