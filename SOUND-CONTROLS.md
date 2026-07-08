# Sound control scheme

How the tappable, gaze-pulsing sound buttons and the 2D play/pause/stop panel
work, and how to tune or extend them.

## Files

```
src/a-frame-components/
  sound-button-group.ts     # fades a pair of buttons in/out by distance
  sound-button.ts            # a single button: pulsate + play/pause/resume/stop
  sound-button-manager.ts    # one per module: gaze raycast, tap routing, audio state
src/manifest.ts              # registers all three components
src/ArModule.vue              # scene wiring + the 2D sound-control GUI
```

## Scene wiring (`ArModule.vue`)

Each "Wand" has this shape:

```html
<a-entity gltf-model="#Wand1" ...>
  <a-entity id="eng_sound_left" sound="src: #English_wand_1; autoplay: false" position="0 1 0"></a-entity>
  <a-entity id="ger_sound_left" sound="src: #Deutsch_wand1; autoplay: false" position="0 1 0"></a-entity>

  <a-entity sound-button-group="near: 1; far: 2.5; pulse: 0.15" position="1.6 0 0.85" rotation="-10 -4 0">
    <a-plane id="eng_left" sound-button="sound: #eng_sound_left" src="#Readittome" ...></a-plane>
    <a-plane id="ger_left" sound-button="sound: #ger_sound_left" src="#liesesmirvor" ...></a-plane>
  </a-entity>
</a-entity>
```

- The **sound entities** (`eng_sound_left`, `ger_sound_left`, ...) carry A-Frame's
  built-in `sound` component, pointing at an asset id auto-derived from the
  matching file in `src/assets/` (`English_wand_1.mp3` → `#English_wand_1`).
- The **group entity** (`sound-button-group`) wraps a pair of buttons for one
  Wand and controls their fade-in/fade-out and pulse strength.
- Each **button** (`a-plane`, `sound-button`) points at its sound entity via
  the `sound:` selector, matched by naming convention
  (`eng_left` → `eng_sound_left`, `ger_left` → `ger_sound_left`, etc.).
- The **module root** (`<a-entity no-frustum-cull sound-button-manager>`) hosts
  the one `sound-button-manager` that drives every button.

To add a new Wand/button pair, copy this shape, give the sound/button ids a
new unique prefix, and add the two new `.mp3`s to `src/assets/`.

## Tuning per-Wand fade and pulse

On each `sound-button-group` entity:

```html
<a-entity sound-button-group="near: 1; far: 2.5; pulse: 0.15" ...>
```

- `near` / `far` — world-space **metres**. Buttons are full size at/inside
  `near`, shrunk to nothing at/beyond `far`, smoothstep-fading between. Buttons
  shrunk below 5% size are also excluded from the gaze raycast and can't
  pulsate or be tapped.
- `pulse` — uniform x/y scale bump while a button is gazed at, e.g. `0.15` =
  the button grows to 115% of its (faded) size at the peak of the pulse.

The distance fade is driven by **scale**, not material opacity —
`sound-button-group` calls `setFadeFactor()` on each button, and
`sound-button.tick()` is the single place that writes `object3D.scale`,
multiplying that fade factor together with its own gaze-pulse factor. Opacity
was tried first and reverted: it fought with the button material's
`alpha-test: 0.8` (needed for crisp, sorting-artifact-free icon edges — see
the `material` attribute on each button `a-plane` in `ArModule.vue`). Any
material opacity strictly between the alphaTest threshold and `1` is a
partially-blended fragment that needs correct back-to-front sort order, which
broke down visibly (flicker/artifacts) with two close, overlapping
transparent button planes. Shrinking never touches blending, so it can't
reintroduce that problem — don't reach for opacity here again.

## Gaze + pulse

Every tick, `sound-button-manager` raycasts from the camera's forward
direction against every *active* button (see `near`/`far` above) and finds the
nearest hit. Only that one button pulsates — every other button is told to
stop. This is entirely hand-rolled (`sound-button.tick()` oscillates its own
`scale` while `pulsing`) rather than using A-Frame's cursor/raycaster
component, because the host **forbids** modules from setting `cursor`/
`raycaster` on the shared `<a-camera>` (see `lib/manifest.types.ts`
`CAMERA_PROPS_FORBIDDEN`) — multiple modules share one camera, and a module
overriding those would break tap interaction for every other module.

### Gaze/tap-active area vs. the visible icon

The manager doesn't raycast against the button's own visible plane — it calls
`sound-button.getHitMesh()`, which returns a wider, fully invisible
(`opacity: 0`, `depthWrite: false`) sibling `a-plane` nested inside the button
(class `sound-button-hit-area`) if one exists, falling back to the visible
mesh otherwise. This is how the active area is bigger than the icon: give the
hit-area a bigger `width`/`height` than the visible button, independent of the
icon's own size. It's a plain child entity, so it automatically inherits the
button's scale (fade/pulse) — no extra wiring needed when tuning those. Give
it `depthWrite: false` since A-Frame's `material` component defaults
`depthWrite` to `true` even when `transparent: true`; without it, this
invisible plane would still occupy the depth buffer at full size and could
silently occlude real geometry behind it.

The hit-area's `width`/`height` are independent, fixed values — not computed
from the visible button's own `width`/`height` — so resizing the visible
plane (see below) never changes the trigger zone, and vice versa.

Currently each button's hit-area is 1 unit wider on each side (`width: 2.8`,
regardless of the visible plane's own width) and 0.4 units taller on
whichever side that button faces outward — extended **upward** for the top
button of a pair (`eng_left`/`eng_right`, at local `position="0 0.28 0"`) and
**downward** for the bottom one (`ger_left`/`ger_right`, at
`position="0 0.05 0"`). Both directions were originally 0.2, matching the
top/bottom edges' geometric mirror of each other; the downward one was
doubled to 0.4 because it read as noticeably smaller in practice at that
size — likely the group's `rotation` tilting the local up/down axis relative
to the camera, combined with perspective, so equal world-space extension
doesn't read as equally sized on screen — and the upward one was then
matched to the same 0.4 for consistency. Since `a-plane` geometry is
centered, extending in only one direction means growing the height by the
extension amount **and** shifting the hit-area's own `position` by half of
that in the same direction, so the near edge (the one facing the other
button) stays put and only the outward edge moves — both buttons are
currently `height="0.6"`, `position="0 0.2 0"` (top) /
`position="0 -0.2 0"` (bottom).

### Visible icon size vs. the gap between the two buttons in a pair

The visible button's own `width`/`height` (currently `1` / `0.24`, up from
the original `0.8` / `0.2`) control only the rendered icon plane — resizing
these has no effect on the hit-area (see above). Because the top and bottom
button in a pair are close together (`eng_left`/`eng_right` at local
`position="0 0.28 0"`, `ger_left`/`ger_right` at `position="0 0.05 0"` — a
`0.23` gap between centers), growing `height` eats directly into the space
between them: at the original `height="0.2"` the two plane quads already
just barely touched, so any increase overlaps them unless the pair's
positions also move apart to compensate. When tuning `width`/`height`,
preserve the existing edge-to-edge gap by nudging the top button's `position`
up and the bottom button's down by **half of the height increase each** —
e.g. going from `height="0.2"` to `height="0.24"` (an increase of `0.04`)
moved the top button's `y` from `0.26` to `0.28` (`+0.02`) and the bottom
button's from `0.07` to `0.05` (`-0.02`).

To see the true bounds instead of reasoning about them blind, temporarily
change a hit-area's `material` from `opacity: 0; transparent: true; ...` to
something like `opacity: 0.35; color: #ff00ff; transparent: true; ...` — this
tints it magenta and semi-opaque instead of invisible. **Revert before
shipping**: back to `opacity: 0`, drop the `color` key, on all four
`sound-button-hit-area` planes in `ArModule.vue`.

## Play / pause / resume / stop state machine

`sound-button-manager` tracks a single `activeButton` + `activeStatus`
(`idle` / `playing` / `paused`) **module-wide** — only one sound ever plays at
a time, no matter how many Wands/buttons exist.

Tapping acts on whatever button is currently gazed at:

| Situation                                   | Result                                    |
|----------------------------------------------|--------------------------------------------|
| No sound active, tap a button                | Plays that button's sound from the start   |
| Tap the button that's currently **playing**  | Pauses it                                  |
| Tap the button that's currently **paused**   | Resumes from where it paused               |
| Tap a **different** button                   | Stops the current one, plays the new one from the start |
| A clip finishes on its own (no loop)         | Back to idle — any button can be tapped fresh |

Natural completion is detected via the `sound` component's own `sound-ended`
event: pausing/stopping programmatically nulls out that event first (see
A-Frame's `sound.js`), so it only ever fires when a clip reaches its own end.

### Why `pointerdown`/`pointerup`, not `click`

`sound-button-manager` listens for `pointerdown`/`pointerup` on `document`,
not `click`. `click` broke tapping the 3D buttons on iPad specifically:
`xrextras-gesture-detector` (on the scene, for pinch/rotate) calls
`preventDefault()` on touch events for its own gesture handling, and iOS
Safari — much more aggressively than Android Chrome — suppresses the
synthetic `click` that would otherwise follow a touch once something
upstream in that touch sequence called `preventDefault()`. This wasn't a
build/compilation issue — the standalone build (`dist-ar`) runs the exact
same `lib/preview-ar.ts` entry as the dev preview, just bundled, so the same
bug would reproduce in `npm run dev:ar` on the same device too.
`pointerdown`/`pointerup` are primary input events, not a second-order
synthesis derived from touch, so they aren't subject to that suppression.

`onPointerUp()` only treats a press as a scene tap if it (a) landed on the AR
canvas itself (`event.target.tagName === "CANVAS"`) — not the 2D
sound-control panel's real `<button>` elements, which handle their own
clicks and already stop that event's propagation — and (b) didn't move more
than `TAP_MOVE_THRESHOLD` (10px) from where the press started, so a
camera drag/pinch gesture doesn't also register as a tap.

### Why `pauseAudio()`, not `pause()`

`sound-button.ts` deliberately does **not** call its "pause the audio" method
`pause`. `pause`/`play` are reserved A-Frame component lifecycle method names —
A-Frame wraps whatever you assign to them so that calling it also deregisters
the component from the scene's tick loop. Naming it `pause()` silently killed
the pulsate animation the moment a sound was paused (the component stopped
ticking). Renamed to `pauseAudio()` to avoid the collision. If you add more
methods to these components, avoid `init`, `update`, `remove`, `tick`, `tock`,
`play`, `pause`, `updateSchema` for anything that isn't the actual A-Frame
lifecycle hook.

## The 2D sound-control panel (`ArModule.vue`)

A screen-space overlay — **not** part of the 3D scene — shown only while a
sound is playing or paused, in the bottom-middle of the screen (`bottom: 10%`,
`max-width: 66%` of viewport width). Three buttons, left to right:

1. **Restart** — plays the active sound from the beginning (works even if
   currently paused).
2. **Stop** — stops the sound and clears paused state; the panel fades out.
3. **Play/Pause toggle** — shows the pause icon while playing, the play icon
   while paused.

Icons are plain PNGs in `src/assets/` (`start.png`, `stop.png`, `play.png`,
`pause.png`), auto-injected as `<img id="...">` elements into `<a-assets>` by
the same asset pipeline as every other asset — `iconSrc()` in `ArModule.vue`
just reads `document.getElementById(id).src` rather than guessing the host's
asset base path. Each icon sits on its own white square (the PNGs have real
alpha transparency, no baked-in background) — a normal nested `<img>`, which
always paints above its parent `<span>`'s background, no z-index needed.

### Bridging 3D component state to the Vue-rendered GUI

The manager and the panel live in two different worlds (A-Frame components vs.
Vue reactivity) with no direct link, so they're bridged with a DOM event:

- `sound-button-manager.notifyStateChange()` calls `this.el.emit("sound-state-changed", { status }, false)` any time `activeButton`/`activeStatus` changes (tap, natural finish, or a GUI button).
- `ArModule.vue` holds a template `ref` to the manager's root entity, listens
  for `sound-state-changed` in `onMounted()`, and mirrors `status` into a
  reactive `soundStatus` ref that drives the panel's visibility and icon.
- The panel's own buttons call `restartActive()` / `stopActive()` /
  `togglePlayPause()` directly on the manager component instance (looked up
  via `rootEntity.value.components["sound-button-manager"]`) — these ignore
  gaze entirely and always act on whichever button is currently active.

### Why every panel button has `@click.stop`

`sound-button-manager` listens for `click` on `document` for the 3D gaze-tap
system. Without `.stop`, a tap on a 2D panel button also bubbles up to that
document listener, which then acts on whatever 3D button the camera happens to
be facing — immediately conflicting with (and sometimes undoing) the panel
button's own action. `@click.stop` on all three panel buttons keeps the two
systems isolated.

### Why the panel is styled with inline `:style`, not a `<style>` block

The library build (`npm run build`) extracts SFC `<style>` blocks into a
separate CSS file next to `ar-module.js` — but the production host only
`import()`s the JS, never that CSS (see the README's "Caveats" section).
Inline styles compile into the component's render function itself, so they
work in the real host, not just the local previews / standalone AR build.
`panelStyle`, `buttonStyle`, `squareStyle`, and `iconStyle` in `ArModule.vue`'s
`<script setup>` are the styling; there's no `<style>` block in this file.

The panel stays mounted at all times; visibility is `opacity`/`pointer-events`
bound to `soundStatus !== 'idle'`, with `transition: opacity 0.35s ease`
always present — so it fades in and out rather than popping, without needing
`v-if`/`<Transition>` (which would have nothing to animate between if the
element were removed from the DOM outright).

## Audio unlock (iOS/Android autoplay policy)

Browsers (iOS Safari in particular) refuse to run a Web Audio context until
it's resumed from inside a real user-gesture handler. `sound-button-manager`'s
document `pointerdown`/`pointerup` pair *is* that gesture, so `unlockAudio()`
resumes the shared `THREE.AudioContext` synchronously before asking a button
to play — called from `onTap()` (3D gaze+tap) and from the 2D panel's
`restartActive()`/`togglePlayPause()`, so every path that can start audio
unlocks it first. No separate "enable sound" prompt is needed — the existing
tap-to-play interaction already provides the required gesture.

`ctx.resume()` alone isn't enough on iPhone specifically: iOS's hardware
Ring/Silent switch mutes Web Audio API output independently of the
autoplay-gesture policy, even once the context reports `"running"` — most
iPads have no such switch, so a module can pass on iPad and stay silent on
iPhone with identical code. `unlockAudio()` also opts out of that, two ways,
from inside the same gesture:

- `navigator.audioSession.type = "playback"` where supported (Safari 17+,
  the documented API for this).
- A fallback for older Safari: playing one real, silent `HTMLAudioElement`
  (built at runtime in `createSilentUnlockAudio()` — a tiny in-memory WAV, no
  checked-in asset) once per session. A genuine HTMLMediaElement `play()`
  call from inside a user gesture flips the page's iOS audio session into the
  switch-ignoring category, and it stays flipped for the rest of the session,
  including for later Web Audio API playback.

## Adding new assets during development

The vite plugin that auto-derives the manifest from `src/assets/` only
re-scans the directory when its virtual module is first loaded — it doesn't
watch for files added while the dev server is already running. **Restart
`npm run dev` / `npm run dev:ar`** after adding new files to `src/assets/`
(new audio, new icons, etc.), or they won't be injected into `<a-assets>` and
will silently fail to resolve (e.g. an `<img>`/`sound` with an empty `src`).