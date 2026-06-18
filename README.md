# ar-module-template

A starter project for building **ArModule** components — Vue 3 SFCs that are compiled to a single ES module, hosted at any URL, and dynamically loaded into the AR scene at runtime.

## Layout

```
ar-module-template/
├── package.json          # deps + build/dev scripts
├── tsconfig.json
├── vite.config.ts        # lib build; aliases "vue" → vue-shim; bundles src/assets; treats a-* as custom elements
└── src/
    ├── main.ts           # entry: re-exports the SFC as default + the generated manifest
    ├── ArModule.vue      # the user-edited component (template syntax)
    ├── preview.ts        # standalone A-Frame preview harness (npm run dev)
    ├── assets/           # drop .glb/.png/.mp3/… here — bundled into the manifest
    ├── manifest.d.ts     # types for the `virtual:ar-manifest` module
    └── vue-shim.ts       # statically re-exports every Vue runtime symbol from window.__VUE__
```

## Workflow

1. `cd ar-module-template`
2. `npm install`
3. Edit `src/ArModule.vue` — full SFC with `<template>`, `<script setup>`, `<style>`. The `arModule` prop matches the data shape the host injects.
4. `npm run build` → produces `dist/ar-module.js`, a single ES module that default-exports your component.
5. Host that JS somewhere reachable by the AR app (e.g. `frontend/public/ar-modules/your-module.js`, or any CORS-enabled URL).
6. Insert an `ArModule` record in Mongo whose `url` field points at that JS file.

### Local VR preview during development

- `npm run dev` starts a Vite dev server (with HMR) that mounts `ArModule.vue` standalone inside an A-Frame scene. Open the printed URL in a browser.
- The scene shows A-Frame's built-in **"Enter VR"** button (bottom-right). Any WebXR-compatible HMD (Quest browser, SteamVR, etc.) can enter immersive mode.
- Desktop fallback: WASD to move, mouse drag to look around.
- Mock prop data lives in `src/preview.ts` — edit it to test different inputs.
- For LAN access (e.g. from a standalone HMD on the same network): `npm run dev -- --host`.

The preview loads the host's component runtime so modules behave the same: **A-Frame 1.3.0** (the version 8thwall's `8frame` is built on), `aframe-extras` (`animation-mixer`, …) and `xrextras` (`xrextras-*`). These are vendored in `public/vendor/` (pinned to the host's versions) and served only by the dev server — `copyPublicDir: false` keeps them out of `dist/`.

Note we use **stock A-Frame, not `8frame`**: 8frame's render loop is driven by the 8thwall camera engine (`xr.js`), which a desktop/VR preview can't load (it needs an app key and a camera), so 8frame never paints standalone. Stock A-Frame self-renders and is binary-compatible with the same `aframe-extras`/`xrextras` the host uses. `xrextras-*` components that depend on the AR engine (e.g. `xrextras-attach` to a tracked target) simply no-op in the preview.

### Library build for the host app

- `npm run build` → production `dist/ar-module.js` (uses the vue-shim alias so the module shares the host's Vue runtime).
- `npm run build:watch` → rebuilds the library output on every save (use this when iterating against the host app rather than the standalone preview).

## How it works

- Vite is configured in **library mode**, so the build output is a single ES module.
- `resolve.alias` redirects every `import { ... } from "vue"` to `src/vue-shim.ts`. The shim reads `window.__VUE__` at runtime and re-exports each public Vue symbol — including the SFC compiler's emitted helpers (`createElementBlock`, `openBlock`, `toDisplayString`, etc.). This guarantees the compiled component uses the **host's** Vue instance, not its own.
- `a-*` tags are registered as custom elements so A-Frame markup compiles without warnings.
- The host (`frontend/src/main.ts`) exposes Vue via `(window as any).__VUE__ = Vue` before mounting the app, so the shim has something to read from.

## The `arModule` prop

Every ArModule receives the database record as a prop:

```ts
interface ArModuleData {
  id: string;
  text: string;
  url: string;
  author: string;
  location: { lat: number; lng: number };
  assets: { id: string; src: string }[];
  components: { name: string; url: string }[];
  createdAt: string;
}

defineProps<{ arModule: ArModuleData }>();
```

Use it to drive your scene content (e.g. show the author's name, position by location, etc.).

## Bundling assets with the module

Drop any binary asset (`.glb`, `.gltf`, `.png`, `.mp3`, …) into `src/assets/`. The build pipeline picks them up automatically — no manual wiring:

- Each file becomes a manifest entry. The **file name without its extension is the asset id**, and it is hosted at `assets/<filename>`. So `src/assets/fish1.glb` → `{ id: "fish1", src: "assets/fish1.glb" }`.
- Reference it from `ArModule.vue` by id: `<a-entity gltf-model="#fish1">`. Do **not** declare your own `<a-assets>` — the host (and the dev preview) inject the manifest's assets into the scene's `<a-assets>` before your module mounts.
- `npm run build` copies every asset into `dist/assets/` and writes `dist/manifest.json`. The emitted `dist/ar-module.js` also re-exports the same manifest, which is what the host reads via `mod.manifest`.
- `npm run dev` serves the assets at `/assets/*` and injects them into the standalone preview scene, so models resolve exactly as they will in the host.

When you publish, host the **whole `dist/` folder together** so the relative `assets/…` paths in the manifest resolve next to the page that loads them.

## Assets and A-Frame components (host-declared)

Beyond the bundled assets above, an ArModule record can also declare extra resources the host loads on its behalf:

Each ArModule record can declare extra resources the host loads on its behalf:

- **`assets`** — `{ id, src }` entries the host injects into the scene's `<a-assets>` as `<a-asset-item>` tags. Reference them from your template by id, e.g. `<a-gltf-model src="#bubble">`. IDs are used as-authored, so pick names unlikely to collide with other modules.
- **`components`** — `{ name, url }` entries pointing at JS files that self-register via `AFRAME.registerComponent(...)`. The host dynamically imports each URL **before** mounting your module, so the custom component is available the moment your template renders.

Both arrays are optional. To add them, update the ArModule's Mongo record:

```js
{
  text: "...",
  url: "https://.../my-module.js",
  assets: [{ id: "bubble", src: "https://.../bubble.glb" }],
  components: [{ name: "spin", url: "https://.../spin-component.js" }],
  // ...
}
```

## Caveats

- The shim is bundled into every output (~1 KB). Acceptable price for self-contained modules — no extra HTTP round trip, no host-side path coordination.
- If you use a Vue API that isn't enumerated in `vue-shim.ts`, add it there. It must be a static `export const` — ES modules don't allow dynamic exports.
- The host **must** expose Vue at `window.__VUE__` before any ArModule loads. If that wiring ever moves, every published module breaks; treat it as a stable contract.
- Cross-origin loading: the host fetches your module via `import(url)`. The server hosting the JS must send appropriate CORS headers and the correct `Content-Type: text/javascript` (or `application/javascript`). Vite's dev server does this by default.
- Don't add Vue to `dependencies`. It's a peer of the host runtime; bundling it would create a second Vue instance and break vnode rendering.
