# Sound feature guide

A tappable/gazable 3D button system (`ar-button` + `ar-button-manager`) and a
sound-playback feature built on top of it (`sound-button` + `sound-controller`
+ a 2D play/pause/stop GUI panel). The button system is generic — reusable by
any future feature, not just sound — see [3. Under the hood](#3-under-the-hood)
for the split.

This is the worked example for `ADDING-FEATURES-WORKFLOW.md`'s general
process — see that file for the repeatable workflow this guide came out of.

Files:

```
src/a-frame-components/
  ar-button-manager.ts    # generic: one per module, gaze raycast + tap routing
  ar-button.ts             # generic: declares an entity as a button + trigger zone
  sound-controller.ts       # sound: one per module, play/pause/stop state machine
  sound-button.ts            # sound: plays/pauses/stops a `sound` entity on tap
  sound-unlock-audio.ts      # sound: shared iOS/Web Audio unlock helper
src/assets/
  sound-start.webp, sound-stop.webp, sound-play.webp, sound-pause.webp
src/manifest.ts             # registers all 5 components above
examples/
  ar-button-usage.html       # 3D scene wiring + full attribute reference
  sound-gui-panel.html        # copy/paste block for the 2D GUI panel
```

## 1. Step-by-step: adding this to a new project

These steps assume a project forked from this template (or from `main`),
i.e. it already has `src/manifest.ts`, `src/a-frame-components/`,
`src/assets/`, and `src/ArModule.vue` in the standard layout.

1. **Copy the component files** — copy all five files from
   `src/a-frame-components/` listed above into your project's own
   `src/a-frame-components/`. No path changes: they're flat files, and the
   `sound-` prefix is just a naming convention (see
   [4. Incompatibilities & risks](#4-incompatibilities-risks--troubleshooting)),
   not a folder.

2. **Copy the icon assets** — copy the four `sound-*.webp` files from
   `src/assets/` into your project's own `src/assets/`. These are the
   restart/stop/play/pause icons the GUI panel needs; swap them for your own
   art later if you want, keeping the same 4 file names (or update
   `iconSrc()` calls in step 5 if you rename them).

3. **Register the components** — in your project's `src/manifest.ts`, import
   the 5 components and add them to the `components` map, e.g.:

   ```ts
   import arButtonManager from "./a-frame-components/ar-button-manager";
   import arButton from "./a-frame-components/ar-button";
   import soundController from "./a-frame-components/sound-controller";
   import soundButton from "./a-frame-components/sound-button";

   export const manifest: Manifest = {
     assets: assetManifest.assets,
     components: {
       // ...whatever you already have...
       "ar-button-manager": arButtonManager,
       "ar-button": arButton,
       "sound-controller": soundController,
       "sound-button": soundButton
     }
   };
   ```

   (`sound-unlock-audio.ts` is imported by `sound-controller.ts` directly —
   it's not an A-Frame component and isn't registered in the manifest.)

4. **Add the sound assets you actually want to play** — drop your own
   `.mp3`/`.wav`/etc. into `src/assets/`; each becomes an asset id
   automatically (file name without extension).

5. **Wire the 3D scene** — in `ArModule.vue`'s `<template>`, put
   `ar-button-manager` and `sound-controller` on your module's root
   `<a-entity>` (exactly one of each — see
   [4](#4-incompatibilities-risks--troubleshooting)), then add `sound`
   entities and button entities as children. See
   [2. Entities & attributes](#2-entities--attributes) for the shape, or copy
   directly from `examples/ar-button-usage.html`.

6. **Add the 2D GUI panel** — open `examples/sound-gui-panel.html`; its own
   header comment has the exact copy/paste instructions. In short: copy the
   `<script setup>` block into `ArModule.vue`'s `<script setup>`, copy the
   `<div>` block into `ArModule.vue`'s `<template>` as a *sibling* of your
   root `<a-entity>` (it's a 2D screen overlay, not 3D scene content), and
   add `ref="rootEntity"` to that root `<a-entity>` so the panel can find
   `sound-controller` on it.

7. **Build and test** — `npm run build` (typechecks + bundles),
   `npm run dev` for a quick VR/desktop preview, `npm run dev:ar` on a phone
   for the real thing (audio-unlock and iOS quirks only show up on a real
   device — see [4](#4-incompatibilities-risks--troubleshooting)).

That's the whole feature. Nothing in `lib/` needs to change.

## 2. Entities & attributes

### Module root

Exactly one `ar-button-manager` and one `sound-controller`, both on the same
entity (normally your module's root):

```html
<a-entity ar-button-manager sound-controller>
  ...
</a-entity>
```

Neither takes any attributes.

### `ar-button` — generic 3D button / trigger zone

Put on *any* entity — a plane, a glTF model, a bare `a-entity` — to make it
raycast-gazable and tappable.

| Attribute    | Type   | Default       | Meaning |
|--------------|--------|---------------|---------|
| `enabled`    | boolean| `true`        | `false` excludes this button from the raycast/pulse without removing it from the DOM. |
| `zoneSize`   | vec3   | `1 1 1`       | Size of the trigger-zone box, in this entity's own **local units** (its own pre-render-scale space). |
| `zoneOffset` | vec3   | `0 0 0`       | Centre of the trigger-zone box, offset from this entity's own **pivot/origin** — not from its visible geometry's centre if that differs. |
| `near`       | number | `0`           | World-space metres; full size at/inside this distance. `0`/`0` (both defaults) disables distance fade entirely. |
| `far`        | number | `0`           | World-space metres; shrunk to nothing at/beyond this distance, smoothstep-fading from `near`. |
| `pulse`      | number | `0.15`        | Uniform scale bump while this is the gazed button, e.g. `0.15` = 115% at the peak. |

Events emitted on the button's own element (`el.emit`, non-bubbling):

- `ar-button-gaze-start` — this button just became the gazed one
- `ar-button-gaze-end` — this button just stopped being the gazed one
- `ar-button-tap` — a tap landed while this button was gazed; any component
  co-located on the same entity can listen for this to implement tap
  behavior (`sound-button` is one example)

```html
<a-plane
    width="1" height="0.24"
    ar-button="near: 2.5; far: 4; pulse: 0.15; zoneSize: 2.8 0.6 0.3; zoneOffset: 0 0 0">
</a-plane>
```

### `sound-button` — audio behavior, layered on `ar-button`

Put on the **same entity** as `ar-button`.

| Attribute | Type     | Default | Meaning |
|-----------|----------|---------|---------|
| `sound`   | selector | —       | Points at an entity carrying A-Frame's built-in `sound` component (required). |

```html
<a-entity id="my_sound" sound="src: #my_clip; autoplay: false"></a-entity>

<a-plane
    ar-button="zoneSize: 1 1 0.3"
    sound-button="sound: #my_sound">
</a-plane>
```

### The 2D GUI panel

Not an A-Frame entity — a Vue-rendered screen overlay (see
`examples/sound-gui-panel.html`). It reads `sound-controller`'s state via a
`sound-state-changed` DOM event and calls `restartActive()` /
`togglePlayPause()` / `stopActive()` on the `sound-controller` component
instance directly. No attributes to set beyond wiring `ref="rootEntity"` per
step 6 above.

### A full example

See `examples/ar-button-usage.html` for a complete worked example (a pair of
sound buttons on a 3D model, plus a standalone `ar-button` with no sound at
all) and the same attribute table with more context.

## 3. Under the hood

### Why two layers

The original implementation (three tightly-coupled components:
`sound-button-manager`/`sound-button-group`/`sound-button`) mixed "how do I
detect a gaze/tap on a 3D object" with "how do I play a sound" in the same
files. This version splits that into:

- **Generic layer** — `ar-button` + `ar-button-manager`. Knows nothing about
  audio. Answers exactly one question: which button (if any) is the camera
  currently pointed at, and route taps to it. Any future feature (from any
  branch) can build on this the same way `sound-button` does, by listening
  for `ar-button-tap` on a co-located entity.
- **Sound layer** — `sound-button` + `sound-controller` +
  `sound-unlock-audio`. Knows nothing about raycasting. Answers "what happens
  when *this* button is tapped, given what's already playing."

### `ar-button-manager` (singleton, module root)

Every tick:

1. Filters its registered `ar-button` targets to `isEnabled()` ones
   (`enabled: true` **and** not faded below 5% size).
2. Builds a `THREE.Raycaster` from the camera's world position/forward
   direction (`camera.getWorldPosition`/`getWorldDirection` — the same
   camera object A-Frame already maintains, no `cursor`/`raycaster`
   component involved).
3. Asks each candidate `raycastZone(ray)` and keeps whichever returns the
   smallest `distance`.
4. Calls `setGazed()` with that button (or `null`), which stops the
   previous button's pulse / starts the new one's and emits
   `ar-button-gaze-start`/`-end`.

Tap detection is **not** A-Frame's `click`/cursor system — it's raw
`document`-level `pointerdown`/`pointerup`:

- `onPointerUp` only counts a press as a scene tap if it landed on the AR
  `<canvas>` itself (not a DOM overlay like the GUI panel, which handles its
  own clicks) and didn't move more than 10px from where it started (so a
  drag/pinch gesture isn't read as a tap).
- If a button is currently gazed when that happens, it emits `ar-button-tap`
  on that button's element and stops — the manager doesn't know or care what
  listens for that event.

This exists because A-Frame's built-in `cursor`/`raycaster` component would
need to live on `<a-camera>`, which every module shares and which
`lib/manifest.types.ts`'s `CAMERA_PROPS_FORBIDDEN` explicitly forbids modules
from touching — one module setting it would break tap interaction for every
other module sharing that camera. See [4](#4-incompatibilities-risks--troubleshooting)
for why `pointerdown`/`pointerup` specifically, not `click`.

### `ar-button` (per-button)

The trigger zone is stored as a `THREE.Box3` in **local space**
(`zoneOffset ± zoneSize/2`), built once in `init()` / rebuilt in `update()`
when `zoneSize`/`zoneOffset` change.

`raycastZone(ray)` doesn't expand that box into a world-space AABB (which
would be wrong for a rotated entity — it'd over- or under-approximate the
true oriented box). Instead it:

1. Inverts the entity's `object3D.matrixWorld`.
2. Transforms the incoming world-space ray into the entity's local space
   with that inverse matrix (`Ray.applyMatrix4`).
3. Runs `Ray.intersectBox` against the local-space box — exact, and
   correct regardless of the entity's own rotation/scale.
4. Transforms the hit point back to world space to compute a world-space
   distance, so the manager can compare distances across buttons that live
   in different local spaces.

`tick()` drives two things purely through `object3D.scale` (never material
opacity — see the comment in `ar-button.ts` for why: it previously fought
with `alpha-test` cutout materials and caused sorting artifacts on
overlapping transparent planes):

- **Pulse** — a `sin` oscillation between 1 and `1 + pulse` while gazed,
  easing back to 1 over ~150ms once gaze moves away (a "settle" rather than
  a snap).
- **Fade** — `computeFadeFactor()`, a smoothstepped 0–1 based on camera
  distance between `near`/`far` (or a constant `1` if fade is disabled).

Both are multiplied together onto `baseScale` (the entity's own original
scale, captured once in `init()`), so they compose rather than one
overwriting the other.

### `sound-controller` (singleton, module root)

A plain state machine: `activeButton` (a `sound-button` component instance
or `null`) + `activeStatus` (`"idle" | "playing" | "paused"`).

| Situation | Result |
|---|---|
| No sound active, tap a button | Plays that button's sound from the start |
| Tap the button that's currently **playing** | Pauses it |
| Tap the button that's currently **paused** | Resumes from where it paused |
| Tap a **different** button | Stops the current one, plays the new one from the start |
| A clip finishes on its own (no loop) | Back to idle |

`handleTap(button)` is called by `sound-button` (not the manager — the
controller has no idea `ar-button-manager` exists). `release(button)` is the
shared "back to idle" path, used both for natural sound-ended completion and
for a button being removed from the DOM while active (so a hot-removed
button can't leave the controller pointing at a dead component).
`restartActive`/`togglePlayPause`/`stopActive` are the three entry points
the 2D GUI panel calls directly — they always act on whichever button is
currently active, regardless of gaze.

Every state change calls `notifyStateChange()`, which does
`el.emit("sound-state-changed", { status }, false)` on the root entity —
this is the only bridge between the A-Frame/three.js world and the
Vue-rendered GUI, which lives entirely outside the scene graph and has no
other way to read component state.

### `sound-button` (per-button)

Listens for `ar-button-tap` on its own element (the event `ar-button`
emits on the same entity) and forwards to
`sound-controller.handleTap(self)`. Also listens for the `sound` entity's
own `sound-ended` event to call `release(self)` — natural completion only,
since A-Frame's `sound` component nulls out that handler internally on a
programmatic `pauseSound()`/`stopSound()`, so it only fires when a clip
actually finishes on its own.

`playFromStart`/`pauseAudio`/`resume`/`stop` wrap A-Frame's built-in `sound`
component (`stopSound()`/`playSound()`/`pauseSound()`). Note the method is
named `pauseAudio`, not `pause` — assigning to `pause`/`play` collides with
A-Frame's own reserved component lifecycle method names and would silently
deregister the component from the tick loop when called.

### `sound-unlock-audio.ts`

A plain exported function, not a component. Web Audio requires a real user
gesture to start; this is called synchronously from inside
`sound-controller`'s `handleTap`/`restartActive`/`togglePlayPause` (all of
which are themselves called from inside a real `pointerup`/`click` handler)
before any playback starts. It resumes the shared `THREE.AudioContext` and
additionally works around iOS's hardware Ring/Silent switch, which mutes Web
Audio independently of the autoplay-gesture policy — see the file's header
comment for the two-layered fix (Safari 17+'s `navigator.audioSession`, and
a silent `HTMLAudioElement` play as a fallback for older Safari).

## 4. Incompatibilities, risks & troubleshooting

### Component name collisions across co-mounted modules

The host (and the local preview harness, `lib/host-runtime.ts`) registers
manifest components via `AFRAME.registerComponent(name, def)`, **skipping
any name already registered**. If this project's host mounts multiple
`ArModule`s side by side (the README's camera-sharing language implies it
does), and two different modules both register a component under the exact
same name (e.g. two different forks both shipping their own `ar-button`),
**only the first one to mount wins** — every other module using that name
silently runs the *first* module's code, not its own.

**Practical implication:** don't modify the behavior of `ar-button.ts` /
`ar-button-manager.ts` / `sound-button.ts` / `sound-controller.ts` in a way
that changes their public contract (schema fields, event names) for just one
project, while keeping the same component names — that change would leak
into every other simultaneously-mounted module that also happens to use
those names. If a project needs genuinely different behavior, rename the
component (and update `manifest.ts` and the scene markup accordingly).

### Multiple modules ⇒ multiple independent `ar-button-manager`s

Each mounted module that uses this feature gets its **own**
`ar-button-manager` instance, each adding its own `document` `pointerdown`/
`pointerup` listeners and each raycasting only against **its own**
registered buttons — it has no visibility into other modules' buttons. Two
consequences:

- If two different modules' buttons happen to overlap in screen space, a
  single physical tap can independently satisfy both managers' "was
  something of mine gazed" check and fire `ar-button-tap` in **both**
  modules — there's no cross-module arbitration by design (this was already
  true of the original `sound-button-manager`, not a regression here).
- Listener/raycast cost scales with the number of co-mounted modules using
  this feature. Fine at the scale of a handful of modules with a handful of
  buttons each; don't put hundreds of `ar-button`s in one module.

### Exactly one `ar-button-manager` / `sound-controller` per module

Both are effectively singletons scoped by `el.closest("[...]")` lookups from
descendants. If a module accidentally has two `sound-controller`s (e.g. one
on the root and another, unintentionally, on a nested group), buttons split
across them by whichever is nearest — each tracks its own `activeButton`
independently, silently breaking the "only one sound plays module-wide"
guarantee. Put exactly one of each on the module root.

### Missing manager/controller degrades gracefully, not silently-broken-looking

- `ar-button` with no ancestor `ar-button-manager`: `console.warn`s once,
  never registers, never pulses/responds to gaze/tap — but distance fade
  (`near`/`far`) still works, since that's computed locally in `ar-button`'s
  own `tick()`.
- `sound-button` with no ancestor `sound-controller`: `console.warn`s once;
  the tap listener is still attached but is a no-op.

Check the console first if buttons seem inert — a missing manager/controller
is the most common cause and won't throw.

### `enabled: false` doesn't stop playback

Setting `ar-button="enabled: false"` on a currently-playing button removes
it from the raycast (can't be gazed/tapped) but does **not** touch
`sound-controller`'s state — the sound keeps playing. Call
`stopActive()` (or the GUI's stop button) if you also want to silence it.

### `zoneSize` / `zoneOffset` gotchas

- **Negative components silently break the zone.** `zoneSize` components
  must be `>= 0` — a negative value inverts `Box3.min`/`max` (min ends up
  greater than max), which makes the box empty; `intersectBox` will then
  never return a hit for that button, with no warning.
- **Local units, not world units.** `zoneSize`/`zoneOffset` are in the
  button entity's own pre-transform local space. If the entity (or an
  ancestor) has its own `scale`, the effective world-space trigger zone
  scales along with it — usually the intuitive behavior, but worth knowing
  when tuning by eye.
- **The zone shrinks with fade/pulse.** Because `ar-button.tick()` writes
  the same `object3D.scale` that both the visual fade-out and the raycast
  (via `matrixWorld`) depend on, a button faded near-invisible also has a
  near-zero trigger zone, and a pulsing button's zone grows slightly too —
  this mirrors the original hit-area design (a child mesh that also
  inherited scale) and is intentional, not a bug.
- **Give the camera-facing axis some thickness.** A zero-thickness zone on
  the axis facing the camera is still mathematically raycastable head-on,
  but is much harder to actually hit at oblique/grazing viewing angles.
  ~0.2–0.5 units of depth (see the examples' `zoneSize` z-components) is
  plenty for a flat plane button.

### `near`/`far` gotchas

- Both `<= 0` (the default `0`/`0`) disables fade entirely — always full
  size. This means a negative `near`/`far` pair also disables fade, even if
  that wasn't the intent.
- `near > far` collapses to a hard cutoff at `near` (full size at/inside
  `near`, instantly gone beyond it) rather than a smooth fade — not broken,
  just not a gradient.

### Web Audio is a page-wide singleton

`THREE.AudioContext.getContext()` returns one shared context for the whole
page. A positive side effect: once any module's tap unlocks it (via
`sound-unlock-audio.ts`), it stays unlocked for **every** module's audio,
not just the one that triggered it. The flip side:
`sound-controller`'s "only one sound plays" guarantee is scoped to buttons
**within its own module** — if two different co-mounted modules both use
this sound feature, their audio can play concurrently and overlap; neither
controller can see or stop the other.

### iOS / Safari specifics (test on a real device)

- **`pointerdown`/`pointerup`, not `click`, for 3D taps** — iOS Safari has
  been observed to suppress the synthetic `click` that would otherwise
  follow a touch, once anything upstream in that touch sequence called
  `preventDefault()` (which `xrextras-gesture-detector`, used for
  pinch/rotate, does). This is why `ar-button-manager` doesn't use `click`.
- **The Ring/Silent switch mutes Web Audio independently of the
  autoplay-gesture policy** on iPhone specifically (most iPads have no such
  switch) — `sound-unlock-audio.ts` works around this two ways (Safari 17+'s
  `navigator.audioSession`, and a silent `HTMLAudioElement` play as a
  fallback for older Safari). This is a best-effort mitigation for
  undocumented/older-Safari behavior — verify on an actual iPhone before
  shipping, not just the simulator or a desktop preview.

### Interaction with [Image Tracking](IMAGE-TRACKING-FEATURE-GUIDE.md)

That feature's example uses `xrextras-play-video` (the tap-to-play/stop
video on an image target). Reading its bundled source
(`node_modules/@8thwall/xrextras/dist/xrextras.js`): it tags itself with
`class="cantap"` and listens for a plain `click` event on its own element —
i.e. it relies on **A-Frame's own cursor/raycaster system**, presumably
configured by the host on the shared `<a-camera>` to hit `.cantap` elements
(see the `raycaster` example in `lib/manifest.types.ts`), not on anything in
this feature.

Two things worth testing if a project combines a tappable image-target video
with this sound feature:

1. **No direct code conflict** — the two tap systems (host cursor/`click`
   for `.cantap` elements vs. this feature's own `pointerdown`/`pointerup`)
   are independent and don't call `preventDefault()`/`stopPropagation()` on
   each other's events. But they *do* observe the same physical touches: if
   a sound-feature button's trigger zone visually overlaps a tappable
   image-target video in screen space, a single tap could satisfy both
   systems and fire **both** — play a sound *and* toggle the video — in the
   same gesture. Keep interactive zones visually separated, or gate one of
   them (`enabled: false`) while the other is relevant.
2. **The image-target video's tap-to-play may share the exact iOS bug this
   feature was built to avoid.** `xrextras-play-video` uses a synthesized
   `click`, which is precisely the kind of event iOS Safari has been
   observed to suppress after `xrextras-gesture-detector`'s
   `preventDefault()` (see above) — the reason this feature's own buttons
   deliberately avoid `click`. This hasn't been verified directly (it's
   vendored code this project doesn't own), so if a project uses both a
   tappable image-target video **and** pinch/rotate gestures, test tapping
   the video specifically on iPad/iPhone before shipping — it may exhibit
   the same failure mode. `mirror-shard` (see `MIRROR-SHARD-FEATURE-GUIDE.md`)
   is another feature on this branch that uses `click` for the same reason
   `xrextras-play-video` does (it relies on the host's shared cursor/
   raycaster, same as any `.cantap` element) — same caveat applies to it.

### Interaction with the proximity-fade / proximity-cutout features

Found while porting those two features and updating this guide per
`ADDING-FEATURES-WORKFLOW.md`'s step 10 (re-check earlier guides when a new
feature reveals a shared risk). No property collision — `proximity-fade`/
`-dither`/`-cutout` all drive `material.opacity`/shader patches, while
`ar-button` drives `object3D.scale`; different properties, no direct
stomping. But if a button's visible geometry is (or descends from) a
`gltf-model` — see `examples/ar-button-usage.html`'s "Example 2" — and that
same entity or an ancestor also carries `proximity-fade`/`-dither`/
`-cutout`, the two fades/effects compound **without either knowing about the
other**: `ar-button-manager`'s raycast eligibility only checks `ar-button`'s
own `enabled` flag and *its own* `near`/`far` fade factor, never material
opacity — so a button made materially invisible by `proximity-fade`
(opacity `0`) but not also faded via `ar-button`'s own `near`/`far` stays
fully tappable/gazable while invisible. `a-plane`-based buttons (like the
GUI examples in this guide) never fire `model-loaded` and are entirely
untouched by this, regardless of nesting — it only applies to
`gltf-model`-based buttons. See `PROXIMITY-FADE-FEATURE-GUIDE.md` /
`PROXIMITY-CUTOUT-FEATURE-GUIDE.md` for the fuller picture (including a
separate risk between those two features when both target the same
material).

### Future features added to this branch

Every time another feature is layered into `feature_template` from another
branch, re-check this section for the same three questions: (a) does it
register any A-Frame component name that collides with an existing one
(see "Component name collisions" above), (b) does it add its own
`document`-level input listeners that could double-fire alongside
`ar-button-manager`'s, and (c) does it touch `<a-camera>` in a way
`CAMERA_PROPS_FORBIDDEN` doesn't already block. If a new feature also needs
gaze/tap detection, prefer building it on `ar-button`/`ar-button-manager`
(listen for `ar-button-tap`, as `sound-button` does) rather than adding a
second independent raycast/tap system — that's the whole reason the generic
layer was split out.
