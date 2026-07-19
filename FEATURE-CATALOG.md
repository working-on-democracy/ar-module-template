# Feature catalog

A quick-lookup index of every feature universalized into this branch: what
it does, which components implement it, and which assets it uses. Kept
up to date as part of the workflow in `UNIVERSALIZING-FEATURES.md` (step
10) — every new feature gets an entry here when its guide is written.

For the full story on any one feature (setup steps, attribute reference,
internals, known risks), follow the link in its **Guide** column to the
matching `<FEATURE>-FEATURE-GUIDE.md`. This document is intentionally just
the index — descriptions here are one line on purpose.

## Index

| Feature | What it does | Source branch | Guide |
|---|---|---|---|
| [Sound](#sound) | Tap a 3D button to play/pause/stop a sound; optional 2D GUI panel | `Jakob_module` | [SOUND-FEATURE-GUIDE.md](SOUND-FEATURE-GUIDE.md) |
| [Proximity Fade](#proximity-fade) | Fades a model's opacity in/out by camera distance to a target point | `Madleen_module` | [PROXIMITY-FADE-FEATURE-GUIDE.md](PROXIMITY-FADE-FEATURE-GUIDE.md) |
| [Proximity Cutout](#proximity-cutout) | Dithers away a hole in a model centred on the camera as it approaches | `Madleen_module` | [PROXIMITY-CUTOUT-FEATURE-GUIDE.md](PROXIMITY-CUTOUT-FEATURE-GUIDE.md) |
| [Mirror Shard](#mirror-shard) | A field of 112 glass shards that ripple outward when tapped | `Zhichang_module` | [MIRROR-SHARD-FEATURE-GUIDE.md](MIRROR-SHARD-FEATURE-GUIDE.md) |
| [Liquid Texture](#liquid-texture) | Generic procedural "liquid ink" texture, optionally reveals a target image | `Zhichang_module` | [LIQUID-TEXTURE-FEATURE-GUIDE.md](LIQUID-TEXTURE-FEATURE-GUIDE.md) |
| [Follow Node](#follow-node) | Tracks a named node inside another entity's animated glTF | `Fanyu_module` | [FOLLOW-NODE-FEATURE-GUIDE.md](FOLLOW-NODE-FEATURE-GUIDE.md) |
| [Wander In Band](#wander-in-band) | Orbits an entity within a band around a center entity | `Fanyu_module` | [WANDER-IN-BAND-FEATURE-GUIDE.md](WANDER-IN-BAND-FEATURE-GUIDE.md) |
| [Random Field](#random-field) | Scatters clones of referenced entities across an area, spacing/copies configurable | `Gyumin_module` | [RANDOM-FIELD-FEATURE-GUIDE.md](RANDOM-FIELD-FEATURE-GUIDE.md) |
| [Proximity Wave](#proximity-wave) | Proximity-triggered wave + idle motion, single entity or a whole group | `Gyumin_module` | [PROXIMITY-WAVE-FEATURE-GUIDE.md](PROXIMITY-WAVE-FEATURE-GUIDE.md) |
| [LOD + Billboard](#lod--billboard) | Cross-fades a detailed model into a flat camera-facing billboard by distance | `Gyumin_module` | [LOD-BILLBOARD-FEATURE-GUIDE.md](LOD-BILLBOARD-FEATURE-GUIDE.md) |
| [Render Order](#render-order) | Sets per-mesh draw order for overlapping transparent surfaces | `Gyumin_module` | [RENDER-ORDER-FEATURE-GUIDE.md](RENDER-ORDER-FEATURE-GUIDE.md) |
| [Mesh Render Order](#mesh-render-order) | Sets per-NAMED-submesh draw order within a single glTF asset | `Rosa_module` | [MESH-RENDER-ORDER-FEATURE-GUIDE.md](MESH-RENDER-ORDER-FEATURE-GUIDE.md) |

Not covered here: `main`'s own baseline demo content (`fish1.glb`,
`jellyfish-video.mp4`, the `video-target` image target) — that's the
template's own placeholder scene content, not a universalized feature.

**Cross-feature reference docs** — not tied to one feature, so not listed
above: [RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md](RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md)
(how draw order and material patching interact across Render Order,
Mesh Render Order, LOD + Billboard, Proximity Fade, and Proximity Cutout —
read before combining any of those).

## Shared building blocks

Components not owned by any one feature — generic/reusable by design, kept
unprefixed per the naming convention in `src/manifest.ts`. Listed once
here rather than repeated under every feature that uses them.

| Component | File | What it does | Introduced by | Used by |
|---|---|---|---|---|
| `no-frustum-cull` | [`src/a-frame-components/no-frustum-cull.ts`](src/a-frame-components/no-frustum-cull.ts) | Keeps an animated glTF mesh from being frustum-culled once it moves outside its bind-pose bounding sphere | `main` template baseline | Template baseline (`main`); any feature with animated models |
| `ar-button` | [`src/a-frame-components/ar-button.ts`](src/a-frame-components/ar-button.ts) | Declares an entity as a tappable/gazable button with a bounding-box trigger zone, gaze pulse, and optional distance fade | Written fresh while porting [Sound](#sound) from `Jakob_module` — generalized out of that source's tap/gaze code, not copied verbatim | [Sound](#sound) |
| `ar-button-manager` | [`src/a-frame-components/ar-button-manager.ts`](src/a-frame-components/ar-button-manager.ts) | One per module; owns the gaze raycast and tap routing for every `ar-button` | Same as `ar-button` | [Sound](#sound) |
| `unlit-material` | [`src/a-frame-components/unlit-material.ts`](src/a-frame-components/unlit-material.ts) | Replaces a loaded model's PBR materials with flat, fully-lit MeshBasicMaterials — typically the LOD billboard's flat/shadeless look, but also usable standalone on a full model (`examples/unlit-material-usage.html`) | Written while porting [LOD + Billboard](#lod--billboard) from `Gyumin_module`; extended (`alphaTest`, `keepShadowBehavior` attributes) while comparing against `Rosa_module`'s own, separate `unlit-materials` component — confirmed this shared one already covers that use case once extended, so no duplicate was created | [LOD + Billboard](#lod--billboard); usable standalone by any feature |

## Sound

Guide: [SOUND-FEATURE-GUIDE.md](SOUND-FEATURE-GUIDE.md) · Source: `Jakob_module`

Tap a 3D button to play/pause/stop a sound (only one plays module-wide at
a time), with an optional 2D screen-space GUI panel (restart/stop/
play-pause) that mirrors the same state. Built on the generic `ar-button`
system above rather than its own raycast/tap code.

**Components**

| Component | File | What it does |
|---|---|---|
| `sound-controller` | [`sound-controller.ts`](src/a-frame-components/sound-controller.ts) | One per module; single-active-sound play/pause/stop state machine, drives the 2D GUI |
| `sound-button` | [`sound-button.ts`](src/a-frame-components/sound-button.ts) | Plays/pauses/stops a `sound` entity on tap (place alongside `ar-button`) |
| — *(not a component)* | [`sound-unlock-audio.ts`](src/a-frame-components/sound-unlock-audio.ts) | Shared iOS/Web Audio unlock helper, imported by `sound-controller.ts` |

Also depends on the shared `ar-button` / `ar-button-manager` (see
[Shared building blocks](#shared-building-blocks)).

**Assets**

| Asset | Used by | Function |
|---|---|---|
| [`sound-start.webp`](src/assets/sound-start.webp) | `examples/sound-gui-panel.html` | Restart icon on the 2D GUI panel |
| [`sound-stop.webp`](src/assets/sound-stop.webp) | `examples/sound-gui-panel.html` | Stop icon |
| [`sound-play.webp`](src/assets/sound-play.webp) | `examples/sound-gui-panel.html` | Play icon |
| [`sound-pause.webp`](src/assets/sound-pause.webp) | `examples/sound-gui-panel.html` | Pause icon |

Examples: [`ar-button-usage.html`](examples/ar-button-usage.html),
[`sound-gui-panel.html`](examples/sound-gui-panel.html)

## Proximity Fade

Guide: [PROXIMITY-FADE-FEATURE-GUIDE.md](PROXIMITY-FADE-FEATURE-GUIDE.md) · Source: `Madleen_module`

Fades a wrapped model's opacity in and/or out as the camera moves toward a
configurable target point — two independent, order-independent distance
ramps that combine into one appear-then-disappear window. Two
interchangeable rendering techniques share one implementation.

**Components**

| Component | File | What it does |
|---|---|---|
| — *(not a component)* | [`proximity-fade-shared.ts`](src/a-frame-components/proximity-fade-shared.ts) | Shared schema/ramp/target logic both variants below are built from |
| `proximity-fade` | [`proximity-fade.ts`](src/a-frame-components/proximity-fade.ts) | Real alpha-blended transparency variant |
| `proximity-fade-dither` | [`proximity-fade-dither.ts`](src/a-frame-components/proximity-fade-dither.ts) | Dithered opaque-pass transparency variant (for objects overlapping other transparent materials) |

**Assets:** none.

Examples: [`proximity-fade-usage.html`](examples/proximity-fade-usage.html)

## Proximity Cutout

Guide: [PROXIMITY-CUTOUT-FEATURE-GUIDE.md](PROXIMITY-CUTOUT-FEATURE-GUIDE.md) · Source: `Madleen_module`

Dithers away fragments of a wrapped model within a radius of the camera,
opening a hole that lets the camera "cut into" the model as it approaches.

**Components**

| Component | File | What it does |
|---|---|---|
| `proximity-cutout` | [`proximity-cutout.ts`](src/a-frame-components/proximity-cutout.ts) | The whole feature — one file |

**Assets:** none.

Examples: [`proximity-cutout-usage.html`](examples/proximity-cutout-usage.html)

## Mirror Shard

Guide: [MIRROR-SHARD-FEATURE-GUIDE.md](MIRROR-SHARD-FEATURE-GUIDE.md) · Source: `Zhichang_module`

A field of 112 glass shards (three merged draw calls total) that ripple
outward from tapped points with a gentle idle sway. Optionally shows an
inner illustration layer powered by [Liquid Texture](#liquid-texture).

**Components**

| Component | File | What it does |
|---|---|---|
| `mirror-shard` | [`mirror-shard.ts`](src/a-frame-components/mirror-shard.ts) | The shard field: geometry, impact/idle motion shader, tap-to-pulse |

**Assets**

| Asset | Used by | Function |
|---|---|---|
| [`mirror-shard-data/shards.json`](src/a-frame-components/mirror-shard-data/shards.json) | `mirror-shard.ts` (static import, not `src/assets/` — build-time geometry, not a runtime-loaded asset) | Bundled shard geometry: 112 triangles + per-shard seed/depth |

Related feature: [Liquid Texture](#liquid-texture) (optional inner
illustration layer, wired via the `liquidTarget` selector attribute).

Examples: [`mirror-shard-usage.html`](examples/mirror-shard-usage.html),
[`mirror-shard-liquid-texture-scene.html`](examples/mirror-shard-liquid-texture-scene.html)

## Liquid Texture

Guide: [LIQUID-TEXTURE-FEATURE-GUIDE.md](LIQUID-TEXTURE-FEATURE-GUIDE.md) · Source: `Zhichang_module`

Generic, reusable procedural "liquid ink" texture generator — fbm marbling
that optionally reveals a target image, with a swirl/cellular-bubble look.
Renders to an offscreen texture any material can sample; not specific to
Mirror Shard despite being salvaged from the same source branch (no
feature prefix — see the naming-convention comment in `src/manifest.ts`).

**Components**

| Component | File | What it does |
|---|---|---|
| `liquid-texture` | [`liquid-texture.ts`](src/a-frame-components/liquid-texture.ts) | The whole feature — generic, standalone |

**Assets**

| Asset | Used by | Function |
|---|---|---|
| [`liquid-texture-target-1.webp`](src/assets/liquid-texture-target-1.webp) | `examples/liquid-texture-usage.html`, `examples/mirror-shard-liquid-texture-scene.html` | Example `target` image (blue/civic-themed illustration) demonstrating the ink revealing a real photo |
| [`liquid-texture-target-2.webp`](src/assets/liquid-texture-target-2.webp) | `examples/liquid-texture-usage.html`, `examples/mirror-shard-usage.html` | Second example `target` image (orange-themed illustration), paired with a different palette |

Related feature: [Mirror Shard](#mirror-shard) (consumes this component's
rendered texture for its inner illustration layer).

Examples: [`liquid-texture-usage.html`](examples/liquid-texture-usage.html),
[`mirror-shard-liquid-texture-scene.html`](examples/mirror-shard-liquid-texture-scene.html)

## Follow Node

Guide: [FOLLOW-NODE-FEATURE-GUIDE.md](FOLLOW-NODE-FEATURE-GUIDE.md) · Source: `Fanyu_module`

Makes an entity's position continuously track a named node (mesh, empty, or
bone) inside another entity's loaded glTF — e.g. attaching a positional
`sound` to a specific animated part of a model rather than its overall
static transform. Ported essentially unchanged (only a cosmetic THREE-access
normalization) — already fully generic in the source.

**Components**

| Component | File | What it does |
|---|---|---|
| `follow-node` | [`follow-node.ts`](src/a-frame-components/follow-node.ts) | The whole feature — one file |

**Assets:** none.

Examples: [`follow-node-usage.html`](examples/follow-node-usage.html)

## Wander In Band

Guide: [WANDER-IN-BAND-FEATURE-GUIDE.md](WANDER-IN-BAND-FEATURE-GUIDE.md) · Source: `Fanyu_module`

Makes an entity continuously orbit within an annulus ("band") around a
center entity — steady baseline orbit, a chaos-driven angular deviation,
subtle floating, soft edge spiral-back, and gentle mutual avoidance of
sibling `wander-in-band` entities sharing the same DOM parent. Ported
essentially unchanged (only a cosmetic THREE-access normalization) —
already fully generic in the source. Independent of Follow Node despite
both being ported from the same source branch in the same batch.

**Components**

| Component | File | What it does |
|---|---|---|
| `wander-in-band` | [`wander-in-band.ts`](src/a-frame-components/wander-in-band.ts) | The whole feature — one file |

**Assets:** none.

Examples: [`wander-in-band-usage.html`](examples/wander-in-band-usage.html)

## Random Field

Guide: [RANDOM-FIELD-FEATURE-GUIDE.md](RANDOM-FIELD-FEATURE-GUIDE.md) · Source: `Gyumin_module`

Scatters clones of one or more referenced entities (by id) across a
fixed-width strip, using Poisson-disk sampling so a min/max spacing and a
per-entity copy count are honoured exactly. Reworked from the source's
`glowstick-field`, which bundled this together with auto-discovering assets
by naming convention and building LOD structure from scratch — this version
only places; what it clones is entirely up to what you author and
reference by id (see [LOD + Billboard](#lod--billboard)).

**Components**

| Component | File | What it does |
|---|---|---|
| `random-field` | [`random-field.ts`](src/a-frame-components/random-field.ts) | The whole feature — one file |

**Assets:** none.

Examples: [`random-field-usage.html`](examples/random-field-usage.html),
[`random-field-lod-billboard-proximity-wave-scene.html`](examples/random-field-lod-billboard-proximity-wave-scene.html)

## Proximity Wave

Guide: [PROXIMITY-WAVE-FEATURE-GUIDE.md](PROXIMITY-WAVE-FEATURE-GUIDE.md) · Source: `Gyumin_module`

Proximity-gated wave (fades in as the camera approaches) plus a subtle
always-on idle float. `proximity-wave` works standalone on one entity;
`proximity-wave-group` broadcasts one shared parameter set to every direct
child of a group (a plain hand-authored group, or a
[Random Field](#random-field) entity — same component either way).

**Components**

| Component | File | What it does |
|---|---|---|
| `proximity-wave` | [`proximity-wave.ts`](src/a-frame-components/proximity-wave.ts) | Per-entity motion — works standalone |
| `proximity-wave-group` | [`proximity-wave-group.ts`](src/a-frame-components/proximity-wave-group.ts) | Applies one shared config to every direct child |

**Assets:** none.

Examples: [`proximity-wave-usage.html`](examples/proximity-wave-usage.html),
[`random-field-lod-billboard-proximity-wave-scene.html`](examples/random-field-lod-billboard-proximity-wave-scene.html)

## LOD + Billboard

Guide: [LOD-BILLBOARD-FEATURE-GUIDE.md](LOD-BILLBOARD-FEATURE-GUIDE.md) · Source: `Gyumin_module`

Cross-fades a detailed 3D model (optionally split into several parts) into
a flat, always-camera-facing billboard image by distance. The
`.lod-mesh`/`.lod-mesh-group`/`.lod-billboard` structure `lod-object` reads
was already fully generic in the source (driven by CSS class, not any
naming convention) — the only change is that the source's field-population
component used to build this structure programmatically; here it's
authored directly in the scene (see
[RANDOM-FIELD-FEATURE-GUIDE.md](RANDOM-FIELD-FEATURE-GUIDE.md) for how the
two combine). Composes closely with
[Render Order](#render-order) — see
[RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md](RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md).

**Components**

| Component | File | What it does |
|---|---|---|
| `lod-object` | [`lod-object.ts`](src/a-frame-components/lod-object.ts) | One per LOD instance — gathers materials, registers with the manager |
| `lod-manager` | [`lod-manager.ts`](src/a-frame-components/lod-manager.ts) | One per module; ticks every `lod-object`, drives the crossfade + render-order banding |
| `billboard` | [`billboard.ts`](src/a-frame-components/billboard.ts) | Spins an entity about Y to face the camera |
| `unlit-material` | [`unlit-material.ts`](src/a-frame-components/unlit-material.ts) | Flat/shadeless material technique, typically used on the billboard — a [shared building block](#shared-building-blocks), not owned by this feature |

**Assets:** none.

Examples: [`lod-billboard-usage.html`](examples/lod-billboard-usage.html),
[`random-field-lod-billboard-proximity-wave-scene.html`](examples/random-field-lod-billboard-proximity-wave-scene.html)

## Render Order

Guide: [RENDER-ORDER-FEATURE-GUIDE.md](RENDER-ORDER-FEATURE-GUIDE.md) · Source: `Gyumin_module`

Sets three.js `renderOrder` on every mesh of a loaded model, for
controlling draw order among overlapping transparent surfaces. Applicable
to any entity. Ported unchanged — see
[RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md](RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md)
for how this composes with [LOD + Billboard](#lod--billboard) (inside an
`lod-object` group, this value means local order within that one group,
not the final runtime value) and with Proximity Fade/Cutout's own material
patching.

**Components**

| Component | File | What it does |
|---|---|---|
| `render-order` | [`render-order.ts`](src/a-frame-components/render-order.ts) | The whole feature — one file |

**Assets:** none.

Examples: [`render-order-usage.html`](examples/render-order-usage.html),
[`random-field-lod-billboard-proximity-wave-scene.html`](examples/random-field-lod-billboard-proximity-wave-scene.html)

## Mesh Render Order

Guide: [MESH-RENDER-ORDER-FEATURE-GUIDE.md](MESH-RENDER-ORDER-FEATURE-GUIDE.md) · Source: `Rosa_module`

Sets three.js `renderOrder` on individual **named** meshes inside a single
loaded model, for controlling draw order among one asset's own
overlapping/layered internal parts, relative to each other — finer
granularity than [Render Order](#render-order), which sets one value
across a whole model. The source hardcoded both the mesh names and their
order in TypeScript for one specific asset; this version takes the
name→order mapping as a runtime attribute. **Real, confirmed conflict**
with [LOD + Billboard](#lod--billboard) — see
[RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md](RENDER-ORDER-AND-TRANSPARENCY-GUIDE.md)
and the guide's own incompatibilities section.

**Components**

| Component | File | What it does |
|---|---|---|
| `mesh-render-order` | [`mesh-render-order.ts`](src/a-frame-components/mesh-render-order.ts) | The whole feature — one file |

**Assets**

| Asset | Used by | Function |
|---|---|---|
| [`mesh-render-order-rosa.glb`](src/assets/mesh-render-order-rosa.glb) | `examples/mesh-render-order-unlit-material-rosa-scene.html` | `Rosa_module`'s character model, pulled from the plain `Rosa` branch's own uncompressed copy instead (real node names intact — see the guide's §3 for why `Rosa_module`'s own compressed copy couldn't be used), so the example recreating `Rosa_module`'s scene actually renders |

Examples: [`mesh-render-order-usage.html`](examples/mesh-render-order-usage.html),
[`mesh-render-order-unlit-material-rosa-scene.html`](examples/mesh-render-order-unlit-material-rosa-scene.html)
