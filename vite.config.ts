import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, parse, extname } from "node:path";

const ASSETS_SRC = fileURLToPath(new URL("./src/assets", import.meta.url));
const VIRTUAL_MANIFEST_ID = "virtual:ar-manifest";
const RESOLVED_MANIFEST_ID = "\0" + VIRTUAL_MANIFEST_ID;

const MIME: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4"
};

interface ManifestAsset { id: string; src: string }

/** Scan src/assets and derive a manifest entry per file. The file name (without
 *  extension) is used as the A-Frame asset id, e.g. `fish1.glb` → id `fish1`,
 *  served/hosted at `assets/fish1.glb`. */
function readAssets(): { entry: ManifestAsset; file: string }[] {
  if (!existsSync(ASSETS_SRC)) return [];
  return readdirSync(ASSETS_SRC)
    .filter((f) => !f.startsWith(".") && statSync(join(ASSETS_SRC, f)).isFile())
    .map((file) => ({
      entry: { id: parse(file).name, src: `assets/${file}` },
      file
    }));
}

function buildManifest() {
  return { assets: readAssets().map((a) => a.entry), components: [] as string[] };
}

/**
 * Makes module assets in `src/assets/` available everywhere:
 * - exposes the derived manifest via the `virtual:ar-manifest` module
 * - serves `/assets/*` from `src/assets` during `vite dev` (preview)
 * - on build, copies each asset into `dist/assets/` and writes `dist/manifest.json`
 */
function arModuleAssets() {
  return {
    name: "ar-module-assets",

    resolveId(id: string) {
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_MANIFEST_ID;
    },

    load(id: string) {
      if (id === RESOLVED_MANIFEST_ID) {
        return `export const manifest = ${JSON.stringify(buildManifest())};\nexport default manifest;`;
      }
    },

    // Preview / dev server: serve raw asset files at /assets/*
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/assets/")) return next();
        const file = join(ASSETS_SRC, decodeURIComponent(url.slice("/assets/".length)));
        if (!file.startsWith(ASSETS_SRC) || !existsSync(file)) return next();
        res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },

    // Library build: copy assets into dist and emit the manifest file
    generateBundle() {
      for (const { entry, file } of readAssets()) {
        // @ts-ignore — rollup plugin context
        this.emitFile({ type: "asset", fileName: entry.src, source: readFileSync(join(ASSETS_SRC, file)) });
      }
      // @ts-ignore — rollup plugin context
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(buildManifest(), null, 2)
      });
    }
  };
}

export default defineConfig(({ command }) => {
  const isLibBuild = command === "build";

  return {
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag.startsWith("a-")
          }
        }
      }),
      arModuleAssets()
    ],
    resolve: {
      alias: isLibBuild
        ? { vue: fileURLToPath(new URL("./src/vue-shim.ts", import.meta.url)) }
        : {}
    },
    build: {
      lib: {
        entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
        formats: ["es"],
        fileName: () => "ar-module.js"
      },
      rollupOptions: {
        output: { inlineDynamicImports: true }
      },
      emptyOutDir: true,
      // public/ holds the vendored A-Frame/8thwall scripts used only by the dev
      // preview; keep them out of the published module (the host supplies them).
      copyPublicDir: false
    }
  };
});