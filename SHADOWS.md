# Lighting and shadows

How the Wand models cast a shadow onto the ground plane, and how to tune it.

## Setup (`ArModule.vue`)

```html
<a-light type="ambient" intensity="0.3"></a-light>

<a-entity
    light="type: directional; intensity: 1; castShadow: true; shadowMapHeight: 2048; shadowMapWidth: 2048; shadowCameraTop: 30; shadowCameraBottom: -30; shadowCameraLeft: -30; shadowCameraRight: 30; shadowRadius: 8; shadowBias: -0.001; target: #wand-church-anchor"
    position="0 2 -3">
</a-entity>
```

- **Ambient** light gives a baseline so shadowed areas aren't pure black.
- **Directional** light is the one that actually casts shadows (`castShadow: true`). It's aimed at `#wand-church-anchor` — the `id` on the `#WandChurch` entity — via `target`, so it always points at that model's origin regardless of where the light itself sits.
- `shadowCameraTop/Bottom/Left/Right` set the shadow camera's frustum (in world units, centered on the light-to-target line) — make sure it's big enough to cover every Wand, or shadows outside it simply won't render.
- `shadowRadius` softens the shadow's edge.
- `shadowBias` nudges the shadow depth comparison to avoid **shadow acne** — a moiré-like self-shadowing artifact from the shadow map's limited depth precision. Too small (near 0) and acne can reappear; too large and you get the opposite artifact, **peter-panning** (the shadow visibly detaches from the object's base). `-0.001` is a reasonable starting point either way.

Each Wand entity (and `#WandChurch`) casts and receives shadows via the bare `shadow` attribute (defaults: `cast: true; receive: true`).

## The ground / shadow-catcher (`#ground`)

```html
<a-plane
    id="ground"
    rotation="-90 0 0"
    position="-50 -0.01 -50"
    width="500"
    height="500"
    material="shader: shadow"
    shadow
></a-plane>
```

`material="shader: shadow"` (THREE.ShadowMaterial) is invisible everywhere except where a shadow actually falls — so in the real AR app, the live camera feed shows through it normally, and only the shadow itself darkens it. This is why it can look like nothing is there at all when you're not specifically looking for a shadow: that's by design, not a bug.

**If you need to actually see the plane while working on it** (position, shape, whether a shadow is landing where you expect), temporarily give it an opaque material instead, e.g. `material="shader: flat; color: #888888"` — just remember to change it back to `shader: shadow` before shipping, and match `rotation` if you copy it to a second plane (see below).

### A flat plane can appear to vanish for reasons that have nothing to do with shadows

While tracking this down, several unrelated things made this plane appear completely blank at different points — worth knowing about since they're easy to mistake for "shadows are broken":

- **Facing away from the camera.** A plane's front face must point toward the camera or it's backface-culled — rendered as nothing at all, regardless of material or lighting. If you rotate this plane, double check it's still facing the right way.
- **Viewing angle.** A large flat plane viewed edge-on (camera at the same height, looking exactly horizontally) projects to near-zero screen area — there's nothing wrong with the plane, the camera just isn't looking down at it.
- Neither of these has anything to do with the shadow/light setup itself — if the plane looks like it's not there, check orientation and camera angle before assuming the lighting is misconfigured.

## `force-shadow-map` (`src/a-frame-components/force-shadow-map.ts`)

Mounted on the module root (`<a-entity ... force-shadow-map>`). Every tick, it re-asserts `renderer.shadowMap.enabled = true` on whatever the current renderer is, if it isn't already. This guards against 8th Wall's `xrweb` pipeline creating/swapping its own THREE.js renderer on its own timing, potentially after A-Frame's core `shadow` system already tried (once) to enable shadow maps on a since-replaced renderer reference. It's cheap (a boolean check per frame) and harmless if it turns out not to be needed in your setup.