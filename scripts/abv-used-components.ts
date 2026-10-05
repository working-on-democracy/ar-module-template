// Which A-Frame components a work module actually uses — so its manifest
// registers only those instead of every component the template ships.
//
// Why: the host registers a module's components by name, first registration
// wins, silently (AGENTS.md §5). Every extra name a module registers is a name
// it can take away from another module in the same host scene (e.g. a student
// project built from an older template that ships its own `proximity-fade`),
// and vice versa. Registering only what the scene uses keeps that surface to
// the work's real needs.
//
// How: the registered names and their files come from src/manifest.ts (its
// `import x from "./a-frame-components/…"` lines and `"name": x` entries). A
// name counts as used if it appears — outside comments — in any module file
// (src/*.vue, src/*.ts except manifest.ts) or, transitively, in the source of
// a component that is already used (e.g. proximity-wave-group sets
// proximity-wave). Over-inclusion (a name inside a string that isn't a real
// use) is harmless; a miss would surface in the preview too, since dev:ar
// uses the same filtered manifest.
//
// Used by vite.config.ts (virtual:abv-used-components, read by
// src/manifest.ts) and by scripts/abv-release.ts (build report).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Removes /* *\/, // line and <!-- --> comments (keeps `https://` in strings). */
export function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function mentions(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(source);
}

/** name → component source file, as registered in src/manifest.ts. */
export function registeredComponents(srcDir: string): Map<string, string> {
  const manifest = readFileSync(join(srcDir, "manifest.ts"), "utf8");
  const files = new Map<string, string>();
  for (const m of manifest.matchAll(/import\s+(\w+)\s+from\s+["']\.\/a-frame-components\/([\w-]+)["']/g)) {
    files.set(m[1], join(srcDir, "a-frame-components", `${m[2]}.ts`));
  }
  const block = manifest.slice(manifest.indexOf("components: {"));
  const out = new Map<string, string>();
  for (const m of stripComments(block).matchAll(/^\s*["']?([a-z][a-z0-9-]*)["']?\s*:\s*(\w+)\s*,?\s*$/gm)) {
    const file = files.get(m[2]);
    if (file) out.set(m[1], file);
  }
  return out;
}

/** Names of the registered components the module uses, sorted. */
export function usedComponents(srcDir: string): string[] {
  const registered = registeredComponents(srcDir);
  const moduleSources = readdirSync(srcDir)
    .filter((f) => /\.(vue|ts)$/.test(f) && f !== "manifest.ts" && !f.endsWith(".d.ts"))
    .map((f) => join(srcDir, f))
    .filter((p) => statSync(p).isFile())
    .map((p) => stripComments(readFileSync(p, "utf8")));

  const used = new Set<string>();
  const queue: string[] = [];
  for (const name of registered.keys()) {
    if (moduleSources.some((s) => mentions(s, name))) {
      used.add(name);
      queue.push(name);
    }
  }
  // Components that use other registered components (setAttribute,
  // components["…"], querySelector("[…]")).
  while (queue.length) {
    const file = registered.get(queue.pop()!)!;
    if (!existsSync(file)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    for (const name of registered.keys()) {
      if (!used.has(name) && mentions(source, name)) {
        used.add(name);
        queue.push(name);
      }
    }
  }
  return [...used].sort();
}
