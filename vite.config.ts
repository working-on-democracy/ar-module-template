import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { readdirSync, readFileSync, existsSync, statSync, renameSync } from "node:fs";
import { join, parse, extname } from "node:path";

const ASSETS_SRC = fileURLToPath(new URL("./src/assets", import.meta.url));
// Image-target files (the JSON + its *_luminance/_cropped/… images) produced by
// the 8th Wall target tool. The engine loads each target's `imagePath` as an
// <img src>, so these must be served at /image-targets/* (dev) and shipped under
// dist/image-targets/ (build) for detection to work.
const IMAGE_TARGETS_SRC = fileURLToPath(new URL("./src/image-targets", import.meta.url));
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

/** Flat list of every file under src/image-targets/ (json + images). */
function readImageTargetFiles(): string[] {
  if (!existsSync(IMAGE_TARGETS_SRC)) return [];
  return readdirSync(IMAGE_TARGETS_SRC).filter(
    (f) => !f.startsWith(".") && statSync(join(IMAGE_TARGETS_SRC, f)).isFile()
  );
}

/** Serve a static directory at a URL prefix from a Connect middleware stack. */
function serveDir(server: any, prefix: string, root: string) {
  server.middlewares.use((req: any, res: any, next: any) => {
    const url = (req.url || "").split("?")[0];
    if (!url.startsWith(prefix)) return next();
    const file = join(root, decodeURIComponent(url.slice(prefix.length)));
    if (!file.startsWith(root) || !existsSync(file)) return next();
    res.setHeader("Content-Type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
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

    // Preview / dev server: serve raw asset + image-target files.
    configureServer(server: any) {
      serveDir(server, "/assets/", ASSETS_SRC);
      serveDir(server, "/image-targets/", IMAGE_TARGETS_SRC);
    },

    // Library build: copy assets + image targets into dist and emit the manifest.
    generateBundle() {
      for (const { entry, file } of readAssets()) {
        // @ts-ignore — rollup plugin context
        this.emitFile({ type: "asset", fileName: entry.src, source: readFileSync(join(ASSETS_SRC, file)) });
      }
      for (const file of readImageTargetFiles()) {
        // @ts-ignore — rollup plugin context
        this.emitFile({
          type: "asset",
          fileName: `image-targets/${file}`,
          source: readFileSync(join(IMAGE_TARGETS_SRC, file))
        });
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

/**
 * Three flavours, selected by command + `--mode ar`:
 *  - `vite`              → VR/desktop preview (stock A-Frame via CDN, index.html)
 *  - `vite --mode ar`    → 8th Wall AR preview (8frame + engine, ar.html, https)
 *  - `vite build`        → library build → dist/ar-module.js (consumed by the host)
 *  - `vite build --mode ar` → standalone AR app → dist-ar/ (deploy & test on device)
 */
export default defineConfig(async ({ command, mode }) => {
  const isAr = mode === "ar";
  const isLibBuild = command === "build" && !isAr;

  const plugins: any[] = [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith("a-")
        }
      }
    }),
    arModuleAssets()
  ];

  if (isAr) {
    // The AR preview lives at /ar.html, but a phone on the LAN opens the bare
    // network URL (https://<ip>:<port>/). Redirect / → /ar.html so it lands on
    // the AR page instead of the VR index.html. (The `--open /ar.html` flag only
    // opens the right path on the dev machine, not on the device.)
    plugins.push({
      name: "ar-index-redirect",
      configureServer(server: any) {
        server.middlewares.use((req: any, res: any, next: any) => {
          const url = (req.url || "").split("?")[0];
          if (url === "/" || url === "/index.html") {
            res.writeHead(302, { Location: "/ar.html" });
            res.end();
            return;
          }
          next();
        });
      }
    });

    // Standalone AR build: emit the page as index.html (not ar.html) so serving
    // dist-ar/ resolves the AR app at the root. Renamed on disk after the bundle
    // is written (build-only — no effect on the dev server, which keeps serving
    // the ar.html source).
    plugins.push({
      name: "ar-html-as-index",
      writeBundle(options: any) {
        const dir = options.dir ?? "dist-ar";
        const from = join(dir, "ar.html");
        const to = join(dir, "index.html");
        if (existsSync(from)) renameSync(from, to);
      }
    });

    // Self-host the 8th Wall engine exactly like the host app: copy the binary
    // from node_modules into /external/xr (served in dev, emitted on build).
    const { viteStaticCopy } = await import("vite-plugin-static-copy");
    plugins.push(
      viteStaticCopy({
        targets: [{ src: "node_modules/@8thwall/engine-binary/dist/*", dest: "external/xr" }]
      })
    );
    // WebAR needs a secure context (camera). localhost is exempt, but a phone on
    // the LAN needs https — enable it when the plugin is available.
    try {
      const basicSsl = (await import("@vitejs/plugin-basic-ssl")).default;
      plugins.push(basicSsl());
    } catch {
      /* optional: without it, use localhost or a tunnel for device testing */
    }
  }

  return {
    plugins,
    resolve: {
      // The library build shares the host's Vue via the shim. The standalone AR
      // build and the dev previews bundle/use the real Vue.
      alias: isLibBuild
        ? { vue: fileURLToPath(new URL("./src/vue-shim.ts", import.meta.url)) }
        : {}
    },
    server: isAr ? { host: true } : {},
    build: isAr
      ? {
          // Standalone AR app for on-device testing.
          outDir: "dist-ar",
          emptyOutDir: true,
          rollupOptions: {
            input: fileURLToPath(new URL("./ar.html", import.meta.url))
          }
        }
      : {
          // The library artifact the host platform loads.
          outDir: "dist-platform",
          lib: {
            entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
            formats: ["es"],
            fileName: () => "ar-module.js"
          },
          rollupOptions: {
            output: { inlineDynamicImports: true }
          },
          emptyOutDir: true
        }
  };
});