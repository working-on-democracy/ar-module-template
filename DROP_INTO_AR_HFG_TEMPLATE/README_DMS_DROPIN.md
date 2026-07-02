# Liquid Civic Mirror Drop-in Notes

Use this directory as the project root for a clean 8th Wall + A-Frame template, or merge the listed files into an existing template project.

Current build version: `20260702-white-balance-glass-v20`

Public project name: **Liquid Civic Mirror / 流动的公共之镜**

Internal code namespace: `dms`

## Commands

```bash
npm install
npm run build
```

Optional preview:

```bash
npm run build:preview
npm run serve
```

`npm run build` creates the production AR build in `dist/`.

## Main Integration Files

```text
src/index.html
src/app.js
src/index.css
src/integrations/dms/mirror-shards.js
src/assets/dms/
config/webpack.config.js
external/
_headers
wrangler.toml
```

## Runtime Components

- `dms-mirror-shards`: glass shard installation, liquid poster shader, shared render target, GPU shock response, color-state transition, idle motion, and controls
- `dms-world-room-anchor`: 8th Wall world-tracking placement

## Visual Defaults

```text
quality: auto
panelLimit: 1
enableFracture: false
enableGpuMotion: true
displayScale: 2.05
layoutScale: 1.55
```

The v20 visual balance keeps the stronger mobile pigment while reducing over-bright white film, so the shards read as glass instead of white panels.

Debug overrides:

```text
?quality=high
?quality=balanced
?quality=low
?colorBoost=0.35
?alphaBoost=1.18
?liquidHighlightLimit=0.76
```

## Production Notes

Deploy the output of `npm run build` through HTTPS. 8th Wall camera AR will not run correctly from a plain local file path or unsecured HTTP on a phone.

This source handoff keeps the production AR page and the desktop preview page. Anchor test, image-target test, USDZ, old video, and old six-poster resources are intentionally omitted.

The public name can change without touching the runtime, but renaming the internal `dms` namespace requires synchronized edits across paths, component names, HTML attributes, CSS/debug IDs, and documentation.
