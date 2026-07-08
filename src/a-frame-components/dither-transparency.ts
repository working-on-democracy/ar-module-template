import type { ComponentDefinition } from "aframe";

// Ordered-dithering ("screen-door") transparency for a glTF model's materials.
//
// A-Frame 1.3.0 bundles three.js r137, which has no native hashed-alpha
// (material.alphaHash arrived in r150). So we inject a Bayer 8x8 dither into each
// material's fragment shader via onBeforeCompile: a fragment is discarded when
// its combined alpha (material opacity × vertex/texture alpha) falls below a
// per-pixel threshold. The mesh then renders in the OPAQUE pass
// (transparent=false, depthWrite=true) — no alpha blending, so no transparency
// sort artefacts, no draw-order flicker against the AR camera feed, and correct
// self-occlusion. The trade-off vs true transparency is the visible dot pattern.
//
// Put it on the same entity as `gltf-model`. `model-loaded` bubbles (like
// no-frustum-cull), so one listener on the entity covers the whole model.
//
//   <a-entity gltf-model="#glass" dither-transparency></a-entity>
//   <a-entity gltf-model="#glass" dither-transparency="opacity: 0.4"></a-entity>

declare const AFRAME: any;

// GLSL injected after `#include <common>` (which sits after three's precision
// prefix, so function defs are legal there). Compact recursive Bayer dither —
// pure arithmetic, no array/matrix indexing, so it compiles on both GLSL ES 1.00
// (WebGL1) and 3.00 (WebGL2). Returns an ordered threshold in [0, 1).
const BAYER_GLSL = `
float ditherBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float ditherBayer4(vec2 a) { return ditherBayer2(0.5 * a) * 0.25 + ditherBayer2(a); }
float ditherBayer8(vec2 a) { return ditherBayer4(0.5 * a) * 0.25 + ditherBayer2(a); }
`;

// Injected just before `#include <alphatest_fragment>`, where `diffuseColor` is
// in scope and already carries material opacity, vertex colour alpha, map alpha
// and alphaMap. Discard below the screen-space Bayer threshold.
const DITHER_DISCARD = `
{
  float ditherThreshold = ditherBayer8(gl_FragCoord.xy);
  if (diffuseColor.a < ditherThreshold) discard;
}
`;

interface MaterialSnapshot {
  transparent: boolean;
  depthWrite: boolean;
  opacity: number;
  onBeforeCompile: any;
  customProgramCacheKey: any;
}

function applyDither(material: any, opacityOverride: number, store: Map<any, MaterialSnapshot>): void {
  if (!material || material.userData?.__ditherTransparency) return;
  material.userData = material.userData || {};
  material.userData.__ditherTransparency = true;

  // Snapshot for teardown (module switch / unmount restores the original look).
  store.set(material, {
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    opacity: material.opacity,
    onBeforeCompile: material.onBeforeCompile,
    customProgramCacheKey: material.customProgramCacheKey
  });

  if (opacityOverride >= 0) material.opacity = opacityOverride;
  material.transparent = false; // dither handles see-through; keep it in the opaque pass
  material.depthWrite = true;

  material.onBeforeCompile = (shader: any) => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + BAYER_GLSL)
      .replace("#include <alphatest_fragment>", DITHER_DISCARD + "\n#include <alphatest_fragment>");
  };
  // r137 doesn't fold onBeforeCompile into the program cache key, so without a
  // distinct key three could hand this material a program compiled for a
  // non-dithered material with matching parameters. The rest of the key still
  // varies per material, so dithered materials don't collide with each other.
  material.customProgramCacheKey = () => "dither-transparency";
  material.needsUpdate = true; // force a recompile with the injected shader
}

export default {
  schema: {
    // < 0 keeps each material's own alpha; >= 0 overrides every material's opacity.
    opacity: { type: "number", default: -1 }
  },

  init() {
    const self = this as any;
    self.store = new Map();
    self.onModelLoaded = (e: any) => {
      e.target.object3D?.traverse((o: any) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m: any) => applyDither(m, self.data.opacity, self.store));
      });
    };
    self.el.addEventListener("model-loaded", self.onModelLoaded);
  },

  update() {
    // opacity changed at runtime after materials were already processed.
    const self = this as any;
    self.store.forEach((_orig: MaterialSnapshot, m: any) => {
      if (self.data.opacity >= 0) m.opacity = self.data.opacity;
      m.needsUpdate = true;
    });
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("model-loaded", self.onModelLoaded);
    self.store.forEach((orig: MaterialSnapshot, m: any) => {
      m.transparent = orig.transparent;
      m.depthWrite = orig.depthWrite;
      m.opacity = orig.opacity;
      m.onBeforeCompile = orig.onBeforeCompile;
      m.customProgramCacheKey = orig.customProgramCacheKey;
      if (m.userData) delete m.userData.__ditherTransparency;
      m.needsUpdate = true;
    });
    self.store.clear();
  }
} as ComponentDefinition;