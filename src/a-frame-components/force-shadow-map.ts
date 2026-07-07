import type { ComponentDefinition } from "aframe";

// 8th Wall's AR pipeline (xrweb) creates/manages its own THREE.js renderer on
// its own timing, separate from A-Frame's normal render loop (see the
// README: stock A-Frame "never paints standalone" without 8th Wall's camera
// engine driving it). A-Frame's core `shadow` *system* only ever calls
// `renderer.shadowMap.enabled = true` once, from the `shadow` *component*'s
// init() (see any entity with the bare `shadow` attribute, e.g. the Wand
// entities and #ground in ArModule.vue) — if that runs before 8th Wall has
// created/swapped in the renderer actually used to draw the AR scene, the
// flag lands on a stale reference and shadows never turn on for the real
// one, even though the light/cast/receive setup is otherwise correct.
//
// Cheaply keep re-asserting the flag on whatever the *current* renderer is,
// every frame, until it sticks — self-corrects regardless of exactly when
// 8th Wall's renderer becomes the "real" one.
export default {
  tick() {
    const renderer = (this as any).el.sceneEl.renderer;
    if (renderer && !renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.needsUpdate = true;
    }
  }
} as ComponentDefinition;
