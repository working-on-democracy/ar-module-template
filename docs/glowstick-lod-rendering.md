# Glowstick field: LOD, render order & transparency guide

This documents the rendering system built on the `Gyumin` branch: an auto-placed
field of concert lightsticks (`glowstick-field`), each cross-fading between a
detailed 3D model and a flat billboard by distance (`lod-object` /
`lod-manager`), with per-part draw ordering and translucency tuned per idol
group in `ArModule.vue`.

It's written for whoever picks this branch up next — it explains what each
component does, how the render pipeline actually resolves overlapping
transparent surfaces, and where the sharp edges are: several bugs on this
branch traced back to render-order/transparency/material interactions that
aren't obvious from reading any single file in isolation.

## 1. What each component does

| Component | Role |
|---|---|
| `glowstick-field.ts` | Scans `<a-assets>` for `PREFIX_01…`, `PREFIX_LICHT`, `PREFIX_PNG` groups, Poisson-disk places N copies of each on the ground, and *authors* the whole per-instance entity tree (halo, body meshes, LICHT, billboard) — wiring up every component below onto each instance. It doesn't introduce new visuals itself; it just assembles the same structure the hand-written `ArModule.vue` examples used. |
| `lod-object.ts` | Sits on one glowstick instance. Gathers its detailed meshes + billboard, captures each material's true (glTF-authored) opacity, and registers with the ancestor `lod-manager` for per-frame distance blending. Also normalizes each part's authored draw order into a *local* 0-based range (see §3). |
| `lod-manager.ts` | One instance per scene (on the module root). Each frame: ranks every registered glowstick by camera distance, cross-fades detailed-mesh-group ↔ billboard opacity, and re-packs every stick's meshes into a private "band" of `renderOrder` values so sticks never interleave with each other (see §3–4). |
| `render-order.ts` | Trivial: `render-order="N"` sets `node.renderOrder = N` on every mesh in a loaded model. Purely a static per-mesh authoring hook — `lod-manager` reads the value back off the DOM attribute at registration time and rewrites the live three.js value every frame; the component itself never re-touches it after the model loads. |
| `unlit-material.ts` | Replaces a model's PBR materials with flat `MeshBasicMaterial` (fully lit regardless of scene lighting) — used on the halo aura and the billboard PNG. Folds any emissive glow into the flat colour first, so a neon-authored asset doesn't go dark when flattened. |
| `emissive-material.ts` | Applied only to LICHT. Keeps the *real* PBR material (so it still reads ambient light on its base colour) but manually reapplies `KHR_materials_emissive_strength`, because the three.js version A-Frame 1.3.0 bundles (r135) predates native support for that glTF extension. |
| `billboard.ts` | Spins an entity about local Y to face the camera (used by the halo and the PNG billboard). |
| `glowstick-motion.ts` | Per-stick idle float + a "someone is waving it" swing that fades in as the camera approaches. Purely a transform animation — no material/render-order interaction. |
| `attach-to.ts`, `ground-decal.ts`, `no-frustum-cull.ts` | Pre-existing, not glowstick-specific — a camera/anchor follower, a flattened ground decal, and a frustum-culling opt-out. Included here only because they share the same `model-loaded` timing rules described in §5. |

Per-idol tuning (draw order, tint, opacity ceiling) lives in one place —
`glowstickOverrides` in `ArModule.vue` — and is passed down as a single JSON
blob on `data-glowstick-overrides`, which `glowstick-field.ts` distributes to
the actual owning component (`render-order`, `unlit-material`,
`emissive-material`, `lod-object`'s opacity handling).

## 2. The mental model: what "LOD" means here

Each glowstick instance is:

```
.lightstick-instance (lod-object, glowstick-motion)
├── .lod-mesh-group
│   ├── HaloSphere (.lod-mesh)   — soft glow aura, own near/far fade
│   ├── PREFIX_01…N (.lod-mesh)  — detailed body meshes
│   └── PREFIX_LICHT (.lod-mesh) — the glowing light part, own near/far fade
└── .lod-billboard               — flat always-faces-camera PNG stand-in
```

`lod-object` drives two independent fades against camera distance:

- **Group fade** (`nearDistance`/`farDistance`, e.g. 15/20m): the whole
  detailed mesh group ↔ billboard crossfade. Far away, the billboard is a
  cheap stand-in; up close, the real meshes take over.
- **Per-part override fade** (`data-lod-near`/`data-lod-far`, e.g. 7/10m for
  LICHT and the halo): a *tighter*, closer-in fade layered on top of the group
  fade, multiplied together — so LICHT and the halo only glow once the camera
  is genuinely close, even though the body meshes are already fully "detailed"
  from farther out.

`lod-manager` is the single tick driver for every registered `lod-object`: it
processes a rotating fraction of the field each frame (cheap), computes each
one's camera distance, and calls back into `lod-object`'s blend math.

## 3. How the render pipeline actually resolves this (plain English)

three.js (like most real-time renderers) does **not** render objects in
arbitrary or purely distance-sorted order. Every frame it builds two separate
lists:

1. **Opaque list** — every mesh whose material has `transparent = false`.
   Rendered **first**, sorted front-to-back (so nearer objects can early-out
   pixels behind them via the depth test — a performance optimization).
2. **Transparent list** — every mesh whose material has `transparent = true`.
   Rendered **second**, always, no matter what. Sorted by `renderOrder`
   first, then by camera distance back-to-front (so blending composites
   correctly — you need what's behind already drawn before you blend over it).

Two things follow from this that matter a lot on this branch:

- **The opaque/transparent split is a hard, unconditional ordering.** No
  `renderOrder` value can make a transparent object draw before *any* opaque
  object, or vice versa. This is stronger than anything `render-order.ts` or
  `lod-manager`'s banding can do — see §4.
- **`renderOrder` only sorts within one of those two lists**, and it sorts
  whole *objects* (mesh nodes), not individual triangles. It cannot resolve
  two overlapping faces of the *same* mesh, or a mesh whose front and back
  faces both draw in one pass.

### Depth buffer basics

Every drawn pixel writes a *depth* value if `material.depthWrite = true`
(default for opaque materials). Later draws test their own depth against
what's already there (`depthTest`, default on) and only draw where they pass.
`depthWrite: false` (the glTF default for genuinely `alphaMode: BLEND`
materials) means a transparent surface never occludes anything drawn after
it via the depth buffer — draw order (`renderOrder`) is the *only* thing
keeping it composited correctly.

### `lod-manager`'s per-instance render-order banding

Within one glowstick, `ArModule.vue`'s `order` map gives each part a small
integer (LICHT=0, BAP_02=1, BAP_03=3, BAP_01=4, …). `lod-object` normalizes
these to a local 0-based range (`_lodRenderOrder - minOrder`). But that's only
correct *within* one stick — if every stick in the field reused small numbers
like 0–4, sticks would interleave with each other's transparent parts
(stick A's LICHT could draw after stick B's translucent shell purely because
0 < 1, regardless of which stick is actually closer to the camera).

`lod-manager.updateRenderOrder()` fixes this every frame: it ranks all
registered sticks by camera distance (farthest first) and gives each one an
exclusive **band** — `renderOrder = rank * band + localOrder` — wide enough
(`band = widest single-stick span + 1`) that no two sticks' bands can overlap.
So the *relative* order authored in `ArModule.vue` is preserved inside each
stick, while whole sticks still sort correctly back-to-front between each
other. This has to be recomputed every frame (not once) because camera
distance changes continuously, and it's cheap (one sort + one loop over mesh
nodes).

## 4. Pitfalls: render order, transparency & materials

This is the section that would have saved time if it existed before the
LICHT-through-BAP_02 bug.

### 4.1 `depthWrite: true` + real alpha blending is fragile for "reveal what's behind me"

A part like BAP_02 is **opaque-authored** in the glTF (`alphaMode: OPAQUE`,
`depthWrite: true`), but `ArModule.vue`'s `opacity` override forces it
translucent anyway (`transparent = true`, `opacity: 0.5`) so LICHT can show
through it. That combination — real alpha blending *and* `depthWrite: true`
on the same mesh — only reads correctly if:

- draw order guarantees LICHT (or whatever it should reveal) drew **first**,
  and
- nothing else in that stick's own render-order band depends on the depth
  value BAP_02 just wrote.

It's a strictly weaker guarantee than "opaque objects always draw before
transparent ones" (§3) — it depends entirely on `render-order`/banding being
exactly right, every frame, for every stick. It's easy to get right for a
single mesh pair and easy to silently break when a third part, a band
recompute edge case, or a future override map entry shifts the relative
order.

**The fix applied on this branch:** don't rely on blend-order between LICHT
and the translucent shell at all. `lod-object.ts`'s `setupDitherMaterial()`
converts LICHT's own near/far fade from real opacity into a **dithered
discard** (screen-door transparency: a per-pixel `discard` driven by an
interleaved-gradient-noise threshold, see the method's doc comment). This
lets LICHT stay `transparent = false` / `depthWrite = true` — i.e. it goes
in the **opaque** list, which is unconditionally drawn (and depth-written)
before *any* transparent object, full stop. Every translucent body mesh drawn
afterwards then depth-tests against LICHT's real geometry and reveals it
through ordinary blending, with zero dependency on render-order or banding.
The trade-off: LICHT's distance fade now reads as a stipple/dither density
change rather than a smooth opacity fade — a visual style choice, not a bug.

The halo aura deliberately was **not** converted the same way (only LICHT
gets `data-lod-dither`) — it's a soft radial gradient blob where a hard
depth-test edge would look wrong, and it doesn't need to guarantee reveal-
through-translucency the way LICHT does.

### 4.2 `renderOrder` cannot fix everything

Because sorting only happens *within* a render list, and only at the object
(not triangle) granularity:

- Two transparent meshes with the *same* `renderOrder` fall back to
  camera-distance sorting — usually fine, but can flicker/pop right at the
  crossover point if their bounding centers are nearly equidistant.
- A single mesh with both front- and back-facing translucent geometry (e.g.
  a hollow shell) can self-overlap incorrectly — `renderOrder` can't reorder
  its own triangles. Dithering (or splitting into separate front/back-face
  materials) sidesteps this; real alpha blending on a concave translucent
  shape generally can't be made fully correct without one of those.

### 4.3 Materials must be cloned before mutating

`lod-object.ts` clones every material (`m.clone()`) before touching opacity,
`transparent`, or `depthWrite`. **Why it matters:** glTF assets loaded via
`gltf-model` share one underlying material object across every instance of
that asset (all copies of the same idol's glowstick reuse the same loaded
resource). Mutating in place would leak one instance's fade state onto every
other copy of that same stick in the field. The same reasoning applies in
`emissive-material.ts` (also clones before adjusting emissive intensity/tint).

### 4.4 `trueOpacity` vs `.opacity`

`lod-manager.applyBlend()` never *sets* `opacity` to the raw blend value —
it multiplies by `m.userData.trueOpacity` (captured once, before any fade
ever touches it: the glTF-authored alpha, or the `data-opacity-override`
value if one was set). Without this, every mesh — including a genuinely
translucent one — would get forced fully opaque the moment its LOD group
reaches full detail (`blend = 1`), silently hiding anything meant to show
through it. If you add a new fade path, route it through `trueOpacity` the
same way, or a translucent part will stop looking translucent at close range.

### 4.5 `onBeforeCompile` + program caching

`setupDitherMaterial()` sets `material.customProgramCacheKey` explicitly.
three.js's default program cache key is derived from ordinary material
properties and does **not** account for `onBeforeCompile` edits. Without a
custom key, a dithered material could silently share a compiled shader
program with — or have one shared onto it by — a materially different
`onBeforeCompile` callback that happens to produce the same default cache
key. Any future `onBeforeCompile` use on this branch should follow the same
pattern: pin a distinguishing `customProgramCacheKey` if the injected GLSL
differs from the material's stock shader.

### 4.6 The billboard's `alphaTest`/`depthWrite` toggle is deliberately rare

`lod-manager.applyBlend()` only flips the billboard's `alphaTest` (0 ↔ 0.5)
and `depthWrite` on an actual settle/unsettle transition (`currentBlend`
crossing the 0.01 threshold), not every frame. `alphaTest` changes force a
shader recompile (`needsUpdate`); toggling it continuously would be both
expensive and would fight the smooth crossfade (a cutout discard mid-fade
looks like popping, not blending). This is why the billboard has no visible
depth-occlusion glitches against other billboards despite writing depth —
depth writing is only enabled once it's already fully opaque and settled.

## 5. Execution order & where components can interfere

Most bugs on this branch came from **when** code runs relative to other code,
not what the code itself does. The rules that matter:

### 5.1 A-Frame loads children before parents

`ANode.load()` waits for every child's `loaded` event before running the
parent's own component updates. `glowstick-field.ts` relies on this
explicitly: it builds each instance's full subtree (halo, meshes, LICHT,
billboard) **before** appending it, and sets `lod-object` on the outer
instance entity **last**, specifically because `lod-object.init()` does
`querySelectorAll('.lod-mesh')` and needs every child already present in the
DOM. If a future change moves `lod-object` earlier (e.g. sets it before
`appendChild`), that query would silently return an empty list.

### 5.2 Multiple components listening for `model-loaded` on the same element — order matters

LICHT carries **two** components that both react to the same `model-loaded`
event on the same entity: `emissive-material` (declared directly on the
LICHT element) and `lod-object` (declared on the ancestor instance, but which
attaches its own listener directly to each `.lod-mesh` child, including
LICHT). Listeners fire in registration order. Because A-Frame initializes
children before parents (§5.1), `emissive-material`'s listener is registered
first — so by the time `lod-object`'s handler runs and clones the material
again, it's cloning the *already emissive-boosted* material, not the raw
glTF one. **This ordering is load-bearing** — `lod-object.ts`'s clone-then-
mutate logic assumes it's operating on whatever the previous component left
behind, not the original asset. If a new material-mutating component is added
to LICHT (or any `.lod-mesh`), check registration order against this same
assumption, or intensity/opacity/tint could be silently dropped or double-
applied.

The general pattern to watch for: **any component that mutates
`node.material` on a `.lod-mesh` element runs in a chain, not in isolation.**
Order = component declaration/init order on that specific element, then
ancestor-before-descendant across different elements does *not* apply here
since these are same-element listeners — it's purely "whoever calls
`addEventListener('model-loaded', …)` first, wins first."

### 5.3 `lod-manager` registration is gated on `initialized`, not presence

`lod-object.ts` walks up to the nearest `[lod-manager]` ancestor and checks
`managerComp.initialized` before calling `register()`. A component instance
can exist in `el.components` before its own `init()` has run (which is what
actually creates `self.objects`) — registering too early would push onto
`undefined` and crash node loading. If `lod-manager` isn't ready yet,
`lod-object` waits for its `componentinitialized` event instead. Any new code
that needs to talk to an ancestor component during `init()` should use the
same `initialized` check + event-wait pattern rather than assuming presence
in `el.components` means "ready."

### 5.4 `data-glowstick-overrides` is parsed once, per-prefix failures are isolated

`glowstick-field.parseGlowstickOverrides()` parses the whole JSON blob once
in `init()`. A malformed entry for one prefix (e.g. a typo breaking that one
object) is dropped individually — it does **not** blank out every other
stick's tuning, because each prefix's block is validated independently after
the top-level `JSON.parse` succeeds. A syntax error in the *overall* JSON
string, however, does lose every override at once (falls back to `{}`) — that
failure mode is not isolated, so a broken bracket anywhere in
`glowstickOverrides` in `ArModule.vue` silently reverts *every* stick to
default sequential order/untinted/as-authored opacity, with only a
`console.warn`, no visible error in the scene itself.

### 5.5 Interference risk map

| If you touch… | Watch out for… |
|---|---|
| `render-order.ts` / `ArModule.vue`'s `order` map | Only affects ordering *within* one stick's own transparent-list members. Does nothing for the LICHT-vs-body-mesh relationship anymore (dithered, see §4.1) — only matters now for ordering among the genuinely-`alphaMode: BLEND` parts (e.g. BAP_01 vs BAP_03). |
| `lod-object.ts`'s material clone/mutate block | Order relative to `emissive-material.ts`/`unlit-material.ts` on the same element (§5.2). Also: any new override flag (like `dither`) needs a matching branch in `lod-manager.applyBlend()`, or the fade will silently do nothing. |
| `lod-manager.ts`'s `applyBlend`/`updateRenderOrder` | Runs for *every* registered stick every frame — a per-object branch here is a per-frame cost multiplied by field size; keep new logic cheap. |
| `unlit-material.ts` / `emissive-material.ts` | Both are idempotent by design (`userData.unlit` / `userData.emissiveApplied` guards) so re-running on a re-parsed model doesn't double-apply — preserve that guard if you extend either. |
| `glowstick-field.ts`'s `buildGlowstick` | Element attribute order matters only where a later-set attribute's component reads DOM state set by an earlier one at *init* time (e.g. `data-lod-near`/`data-lod-far` must be present before `lod-object.init()` queries them — they are, since `lod-object` is set last per §5.1). |
| Adding a new material-mutating component anywhere in this tree | Ask: does it run on the same element as another material-mutating component? If yes, registration order decides who sees whose output — make that explicit in a comment, the way `lod-object.ts` and `emissive-material.ts` already do. |