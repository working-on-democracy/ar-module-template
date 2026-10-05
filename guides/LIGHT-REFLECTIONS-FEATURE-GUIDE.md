# Light & Reflections feature guide

Makes virtual objects belong to the real place: reflections of the real
surroundings, live from the camera image (`cubemap-realtime`), or designed
reflections from six images (`cubemap-static`), and lights whose brightness
follows the measured brightness of the room (`xr-light`). Applicable to any
entity with a mesh / a light. Ported from the Augmented Bahnhofsviertel
8th Wall projects via `augmented-bahnhofsviertel` (same names and schemas,
so old 8th Wall markup carries over) — see [3. Under the hood](#3-under-the-hood).

Files:

```
src/a-frame-components/cubemap-realtime.ts
src/a-frame-components/cubemap-static.ts
src/a-frame-components/xr-light.ts
src/a-frame-components/env-map-shared.ts       # helper, not a component
examples/light-reflections-usage.html          # scene wiring + attribute reference
```

No shipped assets; `cubemap-static` uses six images a project adds itself.
One feature, three independent components: they share the 8th Wall
lighting/env-map plumbing and its pitfalls, but each works on its own.

## 1. Step-by-step: adding this to a new project

1. **Copy the files** you need into `src/a-frame-components/`; both cubemap
   components import `env-map-shared.ts` — copy it with either.

2. **Nothing to register** — every component file in
   `src/a-frame-components/` is registered automatically under its file
   name as soon as the scene uses it (README, "The manifest"); unused ones
   aren't even bundled. Only a component registered under a different name,
   or one whose name is built at runtime, needs a manual entry in
   `src/manifest.ts`.

3. **Static cube images** (only for `cubemap-static`): six square images
   (`posx`, `negx`, `posy`, `negy`, `posz`, `negz`) into `src/assets/`;
   reference them by id.

4. **Wire the scene** — `examples/light-reflections-usage.html`. Reflections
   need a reflective material (metallic and/or low roughness).

5. **Build and test** — `cubemap-realtime` and `xr-light` need the camera
   engine: `npm run dev:ar` on a phone. Move the phone: the chrome object
   should mirror the room, the light should follow when you cover the
   camera. `cubemap-static` also works in `npm run dev`.

## 2. Entities & attributes

### `cubemap-realtime`

| Attribute | Type | Default | Meaning |
|---|---|---|---|
| `envMapIntensity` | number | `1` | Reflection strength on the materials. |
| `size` | int | `256` | Cube render target size per face. |

### `cubemap-static` (`multiple`: several per entity as `cubemap-static__name`)

| Attribute | Type | Default | Meaning |
|---|---|---|---|
| `posx` … `negz` | string | `#posx` … `#negz` | Face images: asset id or URL. |
| `materials` | array | `[]` | Only materials with these names; empty = all with an envMap slot. |
| `reflectivity` | number | `1` | 0–1, for materials that use it (Phong/Lambert/Basic). |
| `envMapIntensity` | number | `1` | Reflection strength (standard/physical materials). |
| `colorSpace` | string | `linear` | `linear` = image values as-is (host's three r137, the old projects); `srgb` = linearised first (darker). |
| `enableBackground` | boolean | `false` | Also show the cube as scene background. |
| `extension`, `format` | — | — | Accepted for old 8th Wall markup, ignored. |

### `xr-light` (on any entity with a `light`)

| Attribute | Type | Default | Meaning |
|---|---|---|---|
| `min` | number | `0` | Lower bound. |
| `max` | number | `2` | Upper bound. Intensity = clamp(1 + exposure, min, max). |

None of them emit events.

```html
<a-entity gltf-model="#ChromeSculpture" cubemap-realtime></a-entity>
<a-light type="ambient" xr-light="max: 1.2"></a-light>
```

## 3. Under the hood

**Live reflections.** `cubemap-realtime` maps the 8th Wall camera texture
onto a private inside-out sphere and renders it with a `CubeCamera` into a
cube render target on every camera frame (an XR8 camera pipeline module per
instance), then uses that target as the materials' `envMap`. The camera
texture is used without upload — the three.js texture is pointed straight
at the engine's WebGL texture, as in 8th Wall's own examples. It reads the
camera image from `processCpuResult.reality.realityTexture`, the one in
sync with the XR controller. After every update the target is flagged
`needsPMREMUpdate` — three r158 only re-prefilters a render-target env map
when told to, otherwise glossy materials keep the first frame.

**Materials are cloned** before an `envMap` is written (`env-map-shared.ts`).
glTF instances share material objects; writing in place would put the
reflection on every copy of the asset (AGENTS.md §5). Both cubemap
components apply on `object3dset` (type `mesh`), so they work for
primitives and for models swapped later, not only for glTF `model-loaded`.

**Colour space.** three r152+ marks `CubeTextureLoader` images as sRGB and
linearises them before shading (mid-grey 0.5 → ~0.21). three r137 — the
version the host app's 8frame 1.3 bundles, and what the old projects used —
reads them as linear. `cubemap-static` defaults to linear so preview and
host agree and old scenes keep their brightness; `colorSpace: srgb` is the
r152 behaviour. The live render target is sRGB like the original
(`encoding: sRGBEncoding`), set through `colorSpace` on r152+ and through
`encoding` on r137 — with only one of the two, it silently falls back to
linear on the other.

**Light estimation.** `xr-light` turns on `enableLighting` in the XR
controller and reads `exposure` from the camera pipeline; one shared
pipeline module for all instances (module-level singleton — the manifest
can't register A-Frame systems), removed again when the last instance goes,
so an unmounted module leaves nothing running in the host's XR8 pipeline.
Intensity is only written when it changed.

Changes against the 8th Wall originals: cloning, `object3dset`, unique and
removed pipeline modules (the original's shared `cubemap-process` name let a
second instance replace the first), `needsPMREMUpdate`, `RGBFormat` (gone
in r137+) ignored, plus the new `envMapIntensity`/`size`/`colorSpace`
options whose defaults keep the original behaviour.

## 4. Incompatibilities, risks & troubleshooting

- **Two different env maps on copies of the same model.** A
  `cubemap-static` on one instance and a `cubemap-realtime` on another
  instance of the same glTF interfere when three r158 prefilters them — the
  live one ended up showing the static image (found on an Augmented
  Bahnhofsviertel work). Use one kind of env map per model asset.
- **Materials replaced later lose the reflection.** [`unlit-material`](LOD-BILLBOARD-FEATURE-GUIDE.md)
  and [Material Properties](MATERIAL-PROPERTIES-FEATURE-GUIDE.md) swap in
  new material objects; a reflection applied *before* is carried along by
  `clone()`, but `unlit-material`'s MeshBasicMaterial shows it unlit. Apply
  env maps last, or re-set the attribute after a swap.
- **Matte materials show nothing.** Roughness near 1 and metalness 0 —
  typical of many exports — reflect almost nothing; that's the material,
  not the component. Use [Material Properties](MATERIAL-PROPERTIES-FEATURE-GUIDE.md)
  to make a model reflective.
- **Cost.** Each `cubemap-realtime` renders six cube faces every camera
  frame. A handful is fine on phones (one Augmented Bahnhofsviertel work
  runs eight); for many objects lower `size` or share one model.
- **Host lights.** The host keeps two base lights on; a module that brings
  its complete lighting can switch them off with `hostLights: false` in the
  manifest (see README). Only in a module with lights of its own —
  `xr-light` and `cubemap-*` don't count: they only drive an existing light
  or provide reflections.
- **No XR8, no live data.** In `npm run dev` `cubemap-realtime` does nothing
  and `xr-light` stays at clamp(1, min, max).
