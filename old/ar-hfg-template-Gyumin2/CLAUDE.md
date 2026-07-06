# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run serve   # webpack-dev-server with hot reload at localhost:8080
npm run build   # production build → dist/
```

For mobile AR testing, expose the dev server via ngrok (HTTPS required for camera access). Add `allowedHosts: ['.ngrok-free.app']` to the `devServer` block in `config/webpack.config.js` if needed.

## Architecture

This is an **8th Wall WebAR** project built on **A-Frame** (a three.js wrapper). The app renders an AR scene in the browser using the device camera, with optional face-tracking and SLAM (world-tracking) capabilities.

### Entry points

- `src/app.js` — registers A-Frame components and scene logic; this is the webpack entry point
- `src/index.html` — A-Frame scene markup; not injected by HtmlWebpackPlugin (`inject: false`), so scripts are managed manually in the HTML

### Build pipeline

`config/webpack.config.js` drives everything:

- Bundles `src/app.js` → `dist/bundle.js`
- A custom `config/asset-loader.js` exports asset file paths as strings (handles Windows backslash normalization) so they can be imported in JS and referenced in HTML attributes
- A custom HTML loader expands `src`, `gltf-model`, `cover-image-url`, `footer-image-url`, and `watermark-image-url` attributes to bundled paths
- `CopyWebpackPlugin` copies `external/`, `src/assets/`, and `image-targets/` directories verbatim to `dist/`

### External libraries (not npm-installed)

All live under `external/` and are copied to `dist/external/` at build time:

| Directory | Contents |
|---|---|
| `external/xr/` | 8th Wall XR engine (`xr.js`, face, SLAM chunks) |
| `external/xrextras/` | XR utility components (loading screens, error handling) |
| `external/scripts/` | A-Frame 1.3.0, aframe-extras 6.1.1 |
| `external/landing-page/` | Optional landing page |
| `external/xrextras-shared-resources/` | Fonts, icons shared by xrextras |

These are loaded as `<script>` tags in `index.html` before `bundle.js`.

### Assets

3D models and images go in `src/assets/`. Import them in JS:

```js
import fishModel from './assets/fish1.glb'
// fishModel is a path string like "assets/fish1.glb"
```

GLTF bundles are folders; reference the `.gltf` file inside them (e.g., `assets/mymodel/mymodel.gltf`).

### A-Frame component pattern

Custom components are registered in `src/app.js`:

```js
AFRAME.registerComponent('my-component', {
  init() { /* runs once on entity attach */ },
  tick(time, delta) { /* runs every frame */ },
})
```

### Stripping XR (non-AR builds)

Remove `external/xr/` and delete the `<script src="external/xr/xr.js">` tag from `index.html` to build a non-AR A-Frame scene without the 8th Wall engine.

### Image targets

If using image targets, place marker images in `image-targets/` and register them in `app.js`:

```js
XR8.XrController.configure({ imageTargets: ['target-name'] })
```