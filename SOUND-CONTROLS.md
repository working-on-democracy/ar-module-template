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

- `near` / `far` — world-space **metres**. Buttons are fully visible at/inside
  `near`, fully invisible at/beyond `far`, smoothstep-fading between. Buttons
  fully faded out (opacity ≤ 0.05) are also excluded from the gaze raycast and
  can't pulsate or be tapped.
- `pulse` — uniform x/y scale bump while a button is gazed at, e.g. `0.15` =
  the button grows to 115% of its rest size at the peak of the pulse.

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

## Play / pause / resume / stop state machine

`sound-button-manager` tracks a single `activeButton` + `activeStatus`
(`idle` / `playing` / `paused`) **module-wide** — only one sound ever plays at
a time, no matter how many Wands/buttons exist.

Tapping (a document-level `click`, so it fires for touch taps on both Android
and iOS) acts on whatever button is currently gazed at:

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
document `click` handler *is* that gesture, so `unlockAudio()` resumes the
shared `THREE.AudioContext` synchronously on every tap, before asking a button
to play. No separate "enable sound" prompt is needed — the existing tap-to-play
interaction already provides the required gesture.

## Adding new assets during development

The vite plugin that auto-derives the manifest from `src/assets/` only
re-scans the directory when its virtual module is first loaded — it doesn't
watch for files added while the dev server is already running. **Restart
`npm run dev` / `npm run dev:ar`** after adding new files to `src/assets/`
(new audio, new icons, etc.), or they won't be injected into `<a-assets>` and
will silently fail to resolve (e.g. an `<img>`/`sound` with an empty `src`).