#!/usr/bin/env -S npx tsx
// Augmented Bahnhofsviertel porting helper — run via `npm run abv:port -- <NN>`.
// See augmented-bahnhofsviertel/PORTING-GUIDE.md for the whole workflow; this
// script does the mechanical first step for one work:
//
//   1. Creates the work's branch `abv-<NN>-<slug>` off `augmented-bahnhofsviertel`
//      (or off its series parent's branch, see works.json) and switches to it.
//      `--no-branch` skips this and instead requires that you're already on
//      that exact branch, so it can never run on the template or base branch.
//   2. Imports every asset the old scene references from the 8th Wall export
//      in augmented-bahnhofsviertel/Projektordner_alt/<legacyFolder>/ into
//      src/assets/, flat, prefixed with the work's slug (asset ids are file
//      names and share one <a-assets> in the host, so they must not collide
//      across works). Self-contained .gltf files are converted losslessly to
//      .glb so `npm run compress-assets` can process them afterwards. Existing
//      files are left alone unless --force-assets.
//   3. Writes augmented-bahnhofsviertel/port-drafts/<NN>-<slug>.md: the old
//      scene markup minus <a-assets>/<a-camera>, with asset references
//      rewritten to the new ids, plus everything that needs a manual
//      decision (scene/camera attributes, components the template lacks,
//      UI texts, assets referenced from JS, unused files).
//
// It never edits src/ArModule.vue or src/manifest.ts — integrating the draft
// is the manual part of the port.
//
// `--dry-run` touches neither git nor the project: assets and draft go to a
// temp folder (printed at the end), to preview what a port would produce.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse, NodeTypes, type ElementNode, type TemplateChildNode } from "@vue/compiler-dom";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { unpartition } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BASE_BRANCH = "augmented-bahnhofsviertel";
const PROTECTED_BRANCHES = ["main", "feature_template", BASE_BRANCH];
const WORKS_JSON = join(ROOT, "augmented-bahnhofsviertel/works.json");
const LEGACY_DIR = join(ROOT, "augmented-bahnhofsviertel/Projektordner_alt");

const CUBEMAP_FACES = ["posx", "negx", "posy", "negy", "posz", "negz"];

interface Work {
  num: number;
  slug: string;
  branch: string;
  title: string;
  artist: string;
  legacyFolder: string | null;
  seriesParent: number | null;
  status: string;
}

interface ImportedAsset {
  oldRef: string; // old asset id, or the old relative path for inline refs
  oldPath: string; // relative to the old src/ dir
  newFile: string; // file name in src/assets/
  newId: string;
  status: "imported" | "converted" | "exists" | "missing" | "shared";
}

function fail(msg: string): never {
  console.error(`abv-port: ${msg}`);
  process.exit(1);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function branchExists(name: string): boolean {
  try {
    git("rev-parse", "--verify", "--quiet", `refs/heads/${name}`);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const noBranch = args.includes("--no-branch");
const forceAssets = args.includes("--force-assets");
const dryRun = args.includes("--dry-run");
const numArg = args.find((a) => /^\d+$/.test(a));
if (!numArg) {
  fail("usage: npm run abv:port -- <NN> [--no-branch] [--force-assets] [--dry-run]");
}

const works: Work[] = JSON.parse(readFileSync(WORKS_JSON, "utf8")).works;
const found = works.find((w) => w.num === Number(numArg));
if (!found) fail(`no work #${numArg} in works.json`);
const work: Work = found;
if (work.status === "zurückgestellt") fail(`#${work.num} ${work.title} is deferred (status "zurückgestellt")`);
const parent = work.seriesParent ? works.find((w) => w.num === work.seriesParent) ?? null : null;
const dryRunDir = join(tmpdir(), "abv-port-dry-run", `${String(work.num).padStart(2, "0")}-${work.slug}`);
const ASSETS_DIR = dryRun ? join(dryRunDir, "src/assets") : join(ROOT, "src/assets");
const DRAFTS_DIR = dryRun ? join(dryRunDir, "port-drafts") : join(ROOT, "augmented-bahnhofsviertel/port-drafts");

// ------------------------------------------------------------------- branch
const current = git("rev-parse", "--abbrev-ref", "HEAD");
if (dryRun) {
  rmSync(dryRunDir, { recursive: true, force: true });
  console.log(`Dry run: no git changes, output goes to ${dryRunDir}`);
} else if (noBranch) {
  if (current !== work.branch) {
    fail(`--no-branch requires being on ${work.branch} (currently on ${current})`);
  }
} else {
  const base = parent ? parent.branch : BASE_BRANCH;
  if (branchExists(work.branch)) fail(`branch ${work.branch} already exists — use --no-branch on it`);
  if (!branchExists(base)) fail(`base branch ${base} does not exist${parent ? " (port the series parent first)" : ""}`);
  if (git("status", "--porcelain", "--untracked-files=no")) fail("working tree has uncommitted changes");
  git("switch", "-c", work.branch, base);
  console.log(`Created and switched to ${work.branch} (from ${base}).`);
}
if (!dryRun && PROTECTED_BRANCHES.includes(git("rev-parse", "--abbrev-ref", "HEAD"))) {
  fail("refusing to import into a protected branch");
}

if (!work.legacyFolder) {
  console.log(
    `#${work.num} has no own 8th Wall export${parent ? `; it starts from ${parent.branch}'s state` : ""}. ` +
      "Nothing to import — check the parent's legacy folder for this work's variant (see PORTING-GUIDE.md)."
  );
  process.exit(0);
}

const legacyRoot = join(LEGACY_DIR, work.legacyFolder);
const legacySrc = join(legacyRoot, "src");
if (!existsSync(legacySrc)) fail(`legacy export not found: ${relative(ROOT, legacySrc)}`);

// ------------------------------------------------------------------- parse
const bodyHtml = readFileSync(join(legacySrc, "body.html"), "utf8");
// The old body.html files aren't always valid HTML (stray end tags); collect
// parser errors as warnings for the draft instead of aborting.
const parseWarnings: string[] = [];
const ast = parse(bodyHtml, {
  isCustomElement: () => true,
  comments: true,
  onError: (e) => parseWarnings.push(`Zeile ${e.loc?.start.line ?? "?"}: ${e.message}`)
});

function elements(nodes: TemplateChildNode[]): ElementNode[] {
  return nodes.filter((n): n is ElementNode => n.type === NodeTypes.ELEMENT);
}

function findElement(nodes: TemplateChildNode[], tag: string): ElementNode | null {
  for (const el of elements(nodes)) {
    if (el.tag === tag) return el;
    const found = findElement(el.children, tag);
    if (found) return found;
  }
  return null;
}

function attrs(el: ElementNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of el.props) {
    if (p.type === NodeTypes.ATTRIBUTE) out[p.name] = p.value?.content ?? "";
  }
  return out;
}

const scene = findElement(ast.children, "a-scene");
if (!scene) fail("no <a-scene> in body.html");
const assetsEl = elements(scene.children).find((el) => el.tag === "a-assets") ?? null;
const cameraEls = elements(scene.children).filter((el) => el.tag === "a-camera");

// ------------------------------------------------------------------ assets
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

function normalizeRel(p: string): string {
  return p.replace(/^\.\//, "").replace(/^\//, "");
}

function newNameFor(oldPath: string): string {
  const ext = extname(oldPath).toLowerCase();
  const stem = basename(oldPath, extname(oldPath)).replace(/[^A-Za-z0-9_-]+/g, "-");
  return `${work.slug}-${stem}${ext === ".gltf" ? ".glb" : ext}`;
}

// The 8th Wall export turned asset bundles into plain folders: a model
// referenced as `assets/Flag.gltf` is the folder `assets/Flag.gltf/` holding
// the real file (see the export's README). Prefer the file named like the
// folder, else the folder's only .gltf/.glb.
function resolveBundle(path: string): string | null {
  if (!existsSync(path)) return null;
  if (!statSync(path).isDirectory()) return path;
  const inner = readdirSync(path).filter((f) => /\.(gltf|glb)$/i.test(f));
  if (inner.includes(basename(path))) return join(path, basename(path));
  return inner.length === 1 ? join(path, inner[0]) : null;
}

async function importAsset(oldRef: string, rel: string): Promise<ImportedAsset> {
  const oldPath = normalizeRel(rel);
  const newFile = newNameFor(oldPath);
  const newId = basename(newFile, extname(newFile));
  const dest = join(ASSETS_DIR, newFile);
  // Several old ids may point at the same file — import it once.
  if (imported.some((i) => i.newFile === newFile)) return { oldRef, oldPath, newFile, newId, status: "shared" };
  const src = resolveBundle(join(legacySrc, oldPath));
  if (!src) return { oldRef, oldPath, newFile, newId, status: "missing" };
  if (existsSync(dest) && !forceAssets) return { oldRef, oldPath, newFile, newId, status: "exists" };
  if (extname(oldPath).toLowerCase() === ".gltf") {
    const doc = await io.read(src);
    // A .glb holds exactly one binary buffer; the old .gltf files sometimes
    // have several. Merging them is lossless (same accessors, one buffer).
    await doc.transform(unpartition());
    writeFileSync(dest, await io.writeBinary(doc));
    return { oldRef, oldPath, newFile, newId, status: "converted" };
  }
  copyFileSync(src, dest);
  return { oldRef, oldPath, newFile, newId, status: "imported" };
}

mkdirSync(ASSETS_DIR, { recursive: true });
const imported: ImportedAsset[] = [];

// 2a. Everything declared in <a-assets>.
for (const el of assetsEl ? elements(assetsEl.children) : []) {
  const a = attrs(el);
  if (a.id && a.src) imported.push(await importAsset(a.id, a.src));
}

// 2b. Inline asset paths elsewhere in the scene (e.g. src="./assets/x.mp4"
// directly on an entity) — imported and rewritten to #id references.
const sceneSource = scene.loc.source;
const assetsSource = assetsEl?.loc.source ?? "";
const inlinePathRe = /(?:\.\/|\/)?assets\/[^"'\s;)]+?\.(?:gltf|glb|png|jpe?g|webp|mp3|wav|m4a|ogg|mp4|webm|mov)/gi;
const inlinePaths = new Set(sceneSource.replace(assetsSource, "").match(inlinePathRe) ?? []);
for (const p of inlinePaths) {
  if (!imported.some((i) => i.oldRef === p)) imported.push(await importAsset(p, p));
}

// ------------------------------------------------------------- draft scene
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewrite(markup: string): string {
  let out = markup;
  for (const a of imported) {
    if (a.oldRef.includes("/")) {
      out = out.replace(new RegExp(escapeRe(a.oldRef), "g"), `#${a.newId}`);
    } else {
      out = out.replace(new RegExp(`#${escapeRe(a.oldRef)}(?![\\w-])`, "g"), `#${a.newId}`);
    }
  }
  // cubemap-static falls back to #posx … when a face isn't given; spell the
  // faces out with the work's prefixed ids so the defaults never apply.
  const faceIds = Object.fromEntries(
    CUBEMAP_FACES.map((f) => [f, imported.find((a) => a.oldRef === f)?.newId]).filter(([, id]) => id)
  );
  if (Object.keys(faceIds).length === CUBEMAP_FACES.length) {
    out = out.replace(/cubemap-static(?:="([^"]*)")?(?=[\s>\/])/g, (_m, value: string | undefined) => {
      const given = value ?? "";
      const missing = CUBEMAP_FACES.filter((f) => !new RegExp(`(^|;)\\s*${f}\\s*:`).test(given))
        .map((f) => `${f}: #${faceIds[f]}`);
      const merged = [given.trim().replace(/;\s*$/, ""), ...missing].filter(Boolean).join("; ");
      return `cubemap-static="${merged}"`;
    });
  }
  return out;
}

const sceneChildren = scene.children
  .filter((n) => !(n.type === NodeTypes.ELEMENT && (n.tag === "a-assets" || n.tag === "a-camera")))
  .filter((n) => n.type !== NodeTypes.TEXT || n.content.trim());
const draftMarkup = rewrite(sceneChildren.map((n) => n.loc.source).join("\n\n"));

// ------------------------------------------------- manual-decision report
const templateComponents = new Set(
  [...readFileSync(join(ROOT, "src/manifest.ts"), "utf8").matchAll(/^\s*"?([\w-]+)"?:\s*\w+,?\s*$/gm)].map((m) => m[1])
);
const knownExternal = /^(xrextras-|animation-mixer|animation(__|$)|sound$|light$|shadow$|material$|geometry$|gltf-model$|position$|rotation$|scale$|visible$|id$|class$|text$|look-at$|raycaster$|cursor$|src$|width$|height$|radius$|color$|opacity$|intensity$|type$|radius(-inner|-outer)?$|segments-[\w-]+$|theta-[\w-]+$|phi-[\w-]+$|depth$|autoplay$|loop$|crossorigin$|playsinline$|muted$|preload$|side$|transparent$|shader$|repeat$)/;
const usedAttrs = new Set<string>();
const collectAttrs = (nodes: TemplateChildNode[]) => {
  for (const el of elements(nodes)) {
    Object.keys(attrs(el)).forEach((a) => usedAttrs.add(a));
    collectAttrs(el.children);
  }
};
collectAttrs(sceneChildren);
const missingComponents = [...usedAttrs].filter((a) => !templateComponents.has(a) && !knownExternal.test(a)).sort();

const jsFiles: string[] = [];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== "assets") walk(p);
    } else if (/\.(js|ts)$/.test(f)) jsFiles.push(p);
  }
};
walk(legacySrc);
const js = jsFiles.map((f) => readFileSync(f, "utf8"));
const registered = [...new Set(js.flatMap((s) => [...s.matchAll(/registerComponent\(\s*['"]([\w-]+)['"]/g)].map((m) => m[1])))].sort();
const labels = [...new Set(js.flatMap((s) => [...s.matchAll(/label:\s*[`'"]([^`'"]*)[`'"]/g)].map((m) => m[1])))]
  .filter((l) => l && !l.startsWith("${") && !l.startsWith("<img"));
const jsAssetRefs = [...new Set(js.flatMap((s) => s.match(inlinePathRe) ?? []))]
  .filter((p) => !normalizeRel(p).startsWith("assets/ui/")).sort();

const usedPaths = new Set(imported.map((a) => a.oldPath));
const unused: string[] = [];
const walkAssets = (dir: string) => {
  for (const f of readdirSync(dir)) {
    if (f.startsWith(".")) continue;
    const p = join(dir, f);
    const rel = relative(legacySrc, p);
    if (statSync(p).isDirectory() && !f.endsWith(".gltf")) {
      if (rel !== join("assets", "ui")) walkAssets(p);
    } else if (!statSync(p).isDirectory() && !usedPaths.has(rel)) unused.push(rel);
  }
};
if (existsSync(join(legacySrc, "assets"))) walkAssets(join(legacySrc, "assets"));

const elementIds: string[] = [];
const collectIds = (nodes: TemplateChildNode[]) => {
  for (const el of elements(nodes)) {
    const id = attrs(el).id;
    if (id) elementIds.push(id);
    collectIds(el.children);
  }
};
collectIds(sceneChildren);

const fmtAttrs = (a: Record<string, string>) =>
  Object.entries(a).map(([k, v]) => `- \`${k}${v ? `="${v.replace(/\s+/g, " ").trim()}"` : ""}\``).join("\n") || "- (keine)";

const imageTargets = existsSync(join(legacyRoot, "image-targets"))
  ? readdirSync(join(legacyRoot, "image-targets")).filter((f) => f.endsWith(".json"))
  : [];

const draft = `# Port-Entwurf #${work.num} ${work.title} (${work.artist})

Generiert von \`npm run abv:port -- ${work.num}\` aus \`Projektordner_alt/${work.legacyFolder}/\`.
Arbeitsgrundlage für \`src/ArModule.vue\` auf \`${work.branch}\` — Ablauf und Regeln: [PORTING-GUIDE.md](../PORTING-GUIDE.md).

## Assets

| alt | Datei alt | neu (\`src/assets/\`) | id | Status |
|---|---|---|---|---|
${imported.map((a) => `| \`${a.oldRef}\` | \`${a.oldPath}\` | \`${a.newFile}\` | \`#${a.newId}\` | ${a.status} |`).join("\n")}

Nicht von der Szene referenziert (nicht importiert, ggf. Varianten/Geschwister-Werke prüfen):
${unused.map((u) => `- \`${u}\``).join("\n") || "- (keine)"}

Aus JS referenzierte Assets (nicht importiert, manuell prüfen):
${jsAssetRefs.map((u) => `- \`${u}\``).join("\n") || "- (keine)"}

## Manuell zu entscheiden

### Szenen-Attribute (\`<a-scene>\`, gehören dem Host)
${fmtAttrs(attrs(scene))}

### Kamera (\`<a-camera>\`, gehört dem Host)
${cameraEls.map((c) => fmtAttrs(attrs(c)) + (elements(c.children).length ? `\n- Kinder der Kamera:\n\n\`\`\`html\n${rewrite(elements(c.children).map((e) => e.loc.source).join("\n"))}\n\`\`\`` : "")).join("\n\n") || "- (keine)"}

### Komponenten in der Szene, die das Template nicht registriert
${missingComponents.map((c) => `- \`${c}\`${registered.includes(c) ? " — im alten Projekt selbst definiert" : ""}`).join("\n") || "- (keine)"}

Im alten Projekt registrierte Komponenten: ${registered.map((c) => `\`${c}\``).join(", ") || "(keine)"}

### \`xrextras-attach\` → \`attach-to\`
${[...draftMarkup.matchAll(/xrextras-attach="([^"]*)"/g)].map((m) => `- \`xrextras-attach="${m[1]}"\``).join("\n") || "- (keine)"}

\`xrextras-attach\` kopiert die *lokale* Position des Ziels: unverändert lassen, wenn Ziel und Element denselben Elternteil haben (Ziel-ID ohne \`#\` mitprefixen); bei \`target: camera\` (außerhalb des Moduls) durch \`attach-to="target: #camera; offset: …"\` ersetzen, Offset dann in Welteinheiten — PORTING-GUIDE.md §8.

### Element-IDs in der Szene
${elementIds.map((id) => `- \`${id}\``).join("\n") || "- (keine)"}

Alle Module teilen sich eine Host-Szene (und das Template hat selbst schon \`#ground\`/\`#lightTarget\`): IDs mit \`${work.slug}-\` prefixen und jede Referenz darauf mitziehen — auch ohne \`#\`, z. B. \`xrextras-attach="target: model"\`.

### UI-Texte aus dem alten Projekt
${labels.map((l) => `- „${l.trim()}“`).join("\n") || "- (keine)"}

### HTML-Fehler in body.html
${parseWarnings.map((w) => `- ${w}`).join("\n") || "- (keine)"}

### Image-Targets im Export
${imageTargets.map((t) => `- \`${t}\``).join("\n") || "- (keine)"} — laut Entscheidung nicht verwendet (SLAM wie im Original, siehe PORTING-GUIDE.md).

## Szene (alt, Asset-Referenzen umgeschrieben)

Ohne \`<a-assets>\` und \`<a-camera>\`. Koordinaten noch im alten System (Kamera auf \`0 8 8\`) — Umrechnung siehe PORTING-GUIDE.md.

\`\`\`html
${draftMarkup}
\`\`\`
`;

mkdirSync(DRAFTS_DIR, { recursive: true });
const draftPath = join(DRAFTS_DIR, `${String(work.num).padStart(2, "0")}-${work.slug}.md`);
writeFileSync(draftPath, draft);

console.log(`\nAssets (${imported.length}):`);
for (const a of imported) console.log(`  ${a.status.padEnd(9)} ${a.oldPath} -> src/assets/${a.newFile}`);
if (missingComponents.length) console.log(`\nComponents the template lacks: ${missingComponents.join(", ")}`);
console.log(`\nDraft: ${dryRun ? draftPath : relative(ROOT, draftPath)}`);
console.log("Next: integrate the draft into src/ArModule.vue, then `npm run compress-assets` (see PORTING-GUIDE.md).");
