# ar-module-template

A starter project for building **ArModule** components — Vue 3 SFCs that are compiled to a single ES module, hosted at any URL, and dynamically loaded into the AR scene at runtime.

## Layout

```
ar-module-template/
├── package.json          # deps + build/dev scripts
├── tsconfig.json
├── vite.config.ts        # lib build + VR/AR previews + standalone AR build; bundles src/assets
├── index.html            # VR/desktop preview page  (npm run dev)
├── ar.html               # 8th Wall AR preview page (npm run dev:ar / build:ar)
└── src/
    ├── main.ts                # entry: re-exports the SFC as default + the manifest
    ├── ArModule.vue           # the user-edited component (template syntax)
    ├── manifest.ts            # the authored manifest: assets + camera + components
    ├── preview.ts             # VR/desktop preview harness (stock A-Frame)
    ├── preview-ar.ts          # 8th Wall AR preview harness (8frame + engine + xrweb)
    ├── host-runtime.ts        # shared preview wiring (register components / camera)
    ├── assets/                # drop .glb/.png/.mp3/… here — auto-derived into the manifest
    ├── a-frame-components/     # custom A-Frame components, referenced from manifest.ts
    ├── virtual-manifest.d.ts  # ambient types for the auto-generated `virtual:ar-manifest`
    └── vue-shim.ts            # statically re-exports every Vue runtime symbol from window.__AR_VUE__
```

## Workflow

1. `cd ar-module-template`
2. `npm install`
3. Edit `src/ArModule.vue` — full SFC with `<template>`, `<script setup>`, `<style>`. The `arModule` prop matches the data shape the host injects.
4. `npm run build` → produces `dist-platform/ar-module.js`, a single ES module that default-exports your component.
5. Host that JS somewhere reachable by the AR app (e.g. `frontend/public/ar-modules/your-module.js`, or any CORS-enabled URL).
6. Insert an `ArModule` record in Mongo whose `url` field points at that JS file.

### Local VR preview during development

- `npm run dev` starts a Vite dev server (with HMR) that mounts `ArModule.vue` standalone inside an A-Frame scene. Open the printed URL in a browser.
- The scene shows A-Frame's built-in **"Enter VR"** button (bottom-right). Any WebXR-compatible HMD (Quest browser, SteamVR, etc.) can enter immersive mode.
- Desktop fallback: WASD to move, mouse drag to look around.
- Mock prop data lives in `src/preview.ts` — edit it to test different inputs.
- For LAN access (e.g. from a standalone HMD on the same network): `npm run dev -- --host`.

The VR preview loads the host's component runtime from CDN, pinned to the host's versions: **A-Frame 1.3.0** (the version 8thwall's `8frame` is built on), `aframe-extras` (`animation-mixer`, …) and `xrextras` (`xrextras-*`).

Note this mode uses **stock A-Frame, not `8frame`**: 8frame's render loop is driven by the 8th Wall camera engine, so it never paints standalone — fine for a desktop/VR preview that has no camera. Stock A-Frame self-renders and is binary-compatible with the same `aframe-extras`/`xrextras`. `xrextras-*` components that depend on the AR engine (e.g. `xrextras-attach` to a tracked target) simply no-op here. For a true 8th Wall AR preview, see below.

### 8th Wall AR preview (camera + world tracking)

- `npm run dev:ar` runs the preview against the **full host runtime** — `8frame` + `aframe-extras` + `xrextras` + the 8th Wall engine (`xrweb`) — so the module renders in real camera AR, identical to production. Mock prop data lives in `src/preview-ar.ts`.
- The engine itself isn't on a public CDN: it's installed via the `@8thwall/engine-binary` dev-dependency and copied into `/external/xr/` by `vite-plugin-static-copy` (exactly as the host does). `npm install` puts it in place.
- **HTTPS is required for the camera** on any non-`localhost` origin. `dev:ar` serves over https (`@vitejs/plugin-basic-ssl`) and binds all interfaces (`--host`), so you can open the printed LAN URL on a phone (accept the self-signed cert). 8th Wall's SLAM/world-tracking needs a phone's rear camera + IMU — a laptop webcam works for a quick sanity check but won't track.

### Builds

- `npm run build` → **library** build → `dist-platform/ar-module.js` (uses the vue-shim alias so the module shares the host's Vue runtime). This is the artifact the host loads. `npm run build:watch` rebuilds it on every save.
- `npm run build:ar` → **standalone AR app** → `dist-ar/` (`index.html` + bundled module + the engine copied into `external/xr/`). A self-contained, deployable page for testing the module in AR on a device — serve `dist-ar/` over https and open it on a phone.

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
- `npm run build` copies every asset into `dist-platform/assets/` and writes `dist-platform/manifest.json`. The emitted `dist-platform/ar-module.js` also re-exports the same manifest, which is what the host reads via `mod.manifest`.
- `npm run dev` serves the assets at `/assets/*` and injects them into the standalone preview scene, so models resolve exactly as they will in the host.

When you publish, host the **whole `dist-platform/` folder together** so the relative `assets/…` paths in the manifest resolve next to the page that loads them.

## The manifest: components & camera

Everything the host needs to set up your scene travels in **one object** — the
`manifest` your bundle exports (the host reads it as `mod.manifest` right after
`import(url)`). `src/manifest.ts` is where you author it:

```ts
export const manifest: Manifest = {
  assets: assetManifest.assets,          // auto-derived from src/assets/
  camera: {                              // applied to the scene's <a-camera>
    raycaster: "objects: .cantap",
    cursor: "fuse: false; rayOrigin: mouse;",
    position: "0 8 8"
  },
  components: {                          // name → AFRAME component definition
    "no-frustrum-cull": noFrustrumCull
  }
};
```

Before mounting your component, the host (`frontend/src/components/ArModule.vue`)
walks the manifest and, in order:

1. **`components`** — registers each `name → definition` via `AFRAME.registerComponent`
   (skipping any already registered). Definitions are **bundled into your module**
   — author them in `src/a-frame-components/` and import them into `manifest.ts`.
   They no longer need to self-register or be hosted as separate URLs.
2. **`camera`** — applies each attribute to the scene's `<a-camera>`, remembering
   the previous values.
3. **`assets`** — injects each `{ id, src }` into `<a-assets>` as an `<a-asset-item>`.

On unmount the host tears all of this back down: it removes the injected assets and
**restores the camera** to its previous attributes. Registered components stay
registered — A-Frame has no deregister — which is why registration is guarded
against duplicates.

The two local previews (`npm run dev` / `npm run dev:ar`) mirror this exact wiring
via `src/host-runtime.ts`, so components and camera behave the same in preview as
in the host.

## Caveats

- The shim is bundled into every output (~1 KB). Acceptable price for self-contained modules — no extra HTTP round trip, no host-side path coordination.
- If you use a Vue API that isn't enumerated in `vue-shim.ts`, add it there. It must be a static `export const` — ES modules don't allow dynamic exports.
- The host **must** expose Vue at `window.__VUE__` before any ArModule loads. If that wiring ever moves, every published module breaks; treat it as a stable contract.
- Cross-origin loading: the host fetches your module via `import(url)`. The server hosting the JS must send appropriate CORS headers and the correct `Content-Type: text/javascript` (or `application/javascript`). Vite's dev server does this by default.
- Don't add Vue to `dependencies`. It's a peer of the host runtime; bundling it would create a second Vue instance and break vnode rendering.
