import type { ComponentDefinition } from "aframe";

declare const AFRAME: any;

// Dithered cutout sphere centred on the active camera — ported from
// ar-hfg-template's `proximity-cutout` (src/app.js), same shader/algorithm.
// Every frame the camera's world position is written into a shader uniform, so
// fragments within `radius` (minus a dithered `feather` band) of the camera are
// discarded: as the camera approaches the object, a hole opens up around it
// (dithered rather than a hard edge), letting the camera "cut into" the model.
// Reads the camera's world position only; never touches the `<a-camera>`
// element itself, so it works the same regardless of who owns/drives the camera.
//
// Put it on a transform entity that wraps one or more `gltf-model` children —
// `model-loaded` bubbles, so this single component patches materials on every
// descendant model as each one loads (see no-frustum-cull for the same pattern).
//
//   <a-entity proximity-cutout="radius: 12; feather: 5">
//     <a-entity gltf-model="#Aussen1"></a-entity>
//     ...
//   </a-entity>
//
// ditherType (added 01.09.2026, material-shader-showcase, archive-of-practice
// projects/an-alle/concepts/material-shader-showcase.md): the feather band's
// dithered edge originally used one hardcoded per-pixel noise hash. This
// swaps in the same three named patterns dither-material.ts already
// establishes for this codebase ("bayer" | "noise" | "interleaved-gradient"),
// reusing its EXACT formulas — not a new option so much as a way to reuse
// dither-material's three looks on a material that can't also carry
// dither-material itself: both patch the same material's onBeforeCompile/
// customProgramCacheKey, so combining them on one node silently drops
// whichever patches last (see PROXIMITY-CUTOUT-FEATURE-GUIDE.md §4). Default
// stays "noise" — the pattern this component always rendered before this
// option existed.
const DITHER_HELPERS: Record<string, string> = {
  bayer: `
float ditherBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float ditherBayer4(vec2 a) { return ditherBayer2(0.5 * a) * 0.25 + ditherBayer2(a); }
float ditherBayer8(vec2 a) { return ditherBayer4(0.5 * a) * 0.25 + ditherBayer2(a); }
`,
  noise: "",
  "interleaved-gradient": ""
};
const DITHER_NOISE_EXPR: Record<string, string> = {
  bayer: "ditherBayer8(gl_FragCoord.xy)",
  // Same pseudo-random hash this component always used.
  noise: "fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)",
  // Same Jimenez interleaved-gradient-noise formula as dither-material.ts/lod-object.ts.
  "interleaved-gradient": "fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))"
};
const DEFAULT_DITHER_TYPE = "noise";
function resolveDitherType(requested: string): string {
  if (requested in DITHER_NOISE_EXPR) return requested;
  console.warn(`[proximity-cutout] unknown ditherType "${requested}" — falling back to "${DEFAULT_DITHER_TYPE}"`);
  return DEFAULT_DITHER_TYPE;
}

// innerColor (added 01.09.2026, material-shader-showcase): once the cutout
// hole exposes the DoubleSide back face, giving that back face its own
// colour reads as "a different colour on the inside" rather than the
// outside colour just seen from behind. `gl_FrontFacing` (a GLSL builtin,
// true while rasterizing a front face) branches on which side is currently
// being drawn; `diffuseColor` is overridden — not `material.color` itself —
// so this still goes through the normal PBR lighting path (roughness/
// metalness/lights all still apply), it just starts from a different base
// colour on the inside. Empty string (default) skips the branch entirely,
// so materials that don't need this pay nothing extra.
const DEFAULT_INNER_COLOR = "";

// innerEmissive (added 01.09.2026, same request): the inside should glow a
// little on its own by default, in its OWN colour, independent of whatever
// the front's material.emissiveIntensity happens to be at that moment (in
// material-shader-showcase, that's swipe/hold-driven and normally 0 at
// rest — the inside would otherwise look flat/unlit until the hold gesture
// fires). Deliberately NOT routed through the real
// emissive/emissiveIntensity/emissivemap PBR path (that would mean locating
// and safely mutating `totalEmissiveRadiance`, whose exact declaration point
// shifts between three.js versions/build chunks — not worth the risk of a
// silent shader-compile break for a stylised accent glow). Instead this
// adds innerColor * innerEmissive directly to gl_FragColor at the same
// late injection point (`dithering_fragment`) the cutout discard already
// uses, once gl_FragColor already holds the fully lit, tone-mapped pixel —
// a flat additive tint rather than a physically-modelled light source, but
// visually reads the same for this purpose.
const DEFAULT_INNER_EMISSIVE = 0.9;

export default {
  schema: {
    // Distance from the camera within which fragments are cut away.
    radius: { type: "number", default: 12 },
    // Width of the dithered transition band, inside `radius`.
    feather: { type: "number", default: 5 },
    // "bayer" | "noise" | "interleaved-gradient" — see the file header above.
    ditherType: { type: "string", default: DEFAULT_DITHER_TYPE },
    // Empty (default) = back faces keep the same colour as the front, i.e.
    // the original behaviour. Any other value recolours only what the
    // cutout hole exposes — see the comment above.
    innerColor: { type: "color", default: DEFAULT_INNER_COLOR },
    // Only applied when innerColor is set — see the comment above.
    innerEmissive: { type: "number", default: DEFAULT_INNER_EMISSIVE }
  },

  init() {
    const self = this as any;
    self.centerVec = new AFRAME.THREE.Vector3();
    self.materials = [] as any[];
    // Original onBeforeCompile/customProgramCacheKey per patched material, so
    // remove() can hand them back exactly as found (mirrors the restore()
    // half of proximity-fade-shared.ts's MaterialPatcher) — without this, a
    // dynamically removed/toggled-off cutout entity would leave every
    // material it touched permanently running the cutout shader.
    self.store = new Map<any, { onBeforeCompile: any; customProgramCacheKey: any; side: any }>();

    self.processMesh = (targetEl: any) => {
      const mesh = targetEl.getObject3D("mesh");
      if (!mesh) return;
      mesh.traverse((node: any) => {
        if (!node.isMesh) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((mat: any) => {
          if (self.store.has(mat)) return; // already patched (shared material, e.g. multiple instances of one glTF)
          self.store.set(mat, { onBeforeCompile: mat.onBeforeCompile, customProgramCacheKey: mat.customProgramCacheKey, side: mat.side });
          mat.side = AFRAME.THREE.DoubleSide;
          self.patchMaterial(mat);
        });
      });
    };
    self.onModelLoaded = (e: any) => self.processMesh(e.target);
    self.el.addEventListener("model-loaded", self.onModelLoaded);

    // Catch-up pass: see the identical comment in proximity-fade-shared.ts —
    // a primitive child can fire+bubble "model-loaded" before this listener
    // exists (init() timing isn't guaranteed parent-before-child), leaving
    // self.materials permanently empty. processMesh's self.store guard makes
    // re-processing an element the listener also catches harmless.
    self.el.querySelectorAll("*").forEach((child: any) => {
      if (child.getObject3D?.("mesh")) self.processMesh(child);
    });
  },

  patchMaterial(material: any) {
    const self = this as any;
    const ditherType = resolveDitherType(self.data.ditherType);
    const innerColor = self.data.innerColor ? new AFRAME.THREE.Color(self.data.innerColor) : null;
    material.onBeforeCompile = (shader: any) => {
      shader.uniforms.uCenter = { value: self.centerVec };
      shader.uniforms.uRadius = { value: self.data.radius };
      shader.uniforms.uFeather = { value: self.data.feather };

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vWorldPos;`
        )
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>
           vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
                varying vec3 vWorldPos;
                uniform vec3 uCenter;
                uniform float uRadius;
                uniform float uFeather;
                ${DITHER_HELPERS[ditherType]}`
        )
        .replace(
          "#include <dithering_fragment>",
          `#include <dithering_fragment>
                float dist = distance(vWorldPos, uCenter);
                float cutoff = smoothstep(uRadius - uFeather, uRadius, dist);
                float noise = ${DITHER_NOISE_EXPR[ditherType]};
                if (cutoff < noise) discard;
                ${innerColor ? `if (!gl_FrontFacing) gl_FragColor.rgb += vec3(${innerColor.r.toFixed(4)}, ${innerColor.g.toFixed(4)}, ${innerColor.b.toFixed(4)}) * ${self.data.innerEmissive.toFixed(4)};` : ""}`
        );

      if (innerColor) {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
                if (!gl_FrontFacing) diffuseColor.rgb = vec3(${innerColor.r.toFixed(4)}, ${innerColor.g.toFixed(4)}, ${innerColor.b.toFixed(4)});`
        );
      }

      material.userData.shader = shader;
    };
    // A-Frame 1.3.0's three.js (r137) doesn't fold onBeforeCompile into the
    // program cache key, so without a distinct key a patched material could be
    // handed a program compiled for an unpatched one with otherwise matching
    // parameters (see dither-transparency for the same fix). Key includes
    // ditherType (and, if set, innerColor) for the same reason dither-material.ts's
    // own key does — a differently-configured cutout instance must not reuse a
    // cached program built for another pattern/colour.
    material.customProgramCacheKey = () => "proximity-cutout-" + ditherType + (innerColor ? "-" + self.data.innerColor + "-" + self.data.innerEmissive : "");
    material.needsUpdate = true;
    self.materials.push(material);
  },

  tick() {
    const self = this as any;
    if (!self.materials.length) return;

    const camera = self.el.sceneEl.camera;
    if (!camera) return;
    camera.getWorldPosition(self.centerVec);

    self.materials.forEach((mat: any) => {
      if (mat.userData.shader) {
        mat.userData.shader.uniforms.uRadius.value = self.data.radius;
        mat.userData.shader.uniforms.uFeather.value = self.data.feather;
      }
    });
  },

  remove() {
    const self = this as any;
    self.el.removeEventListener("model-loaded", self.onModelLoaded);
    self.store.forEach((snapshot: any, mat: any) => {
      mat.onBeforeCompile = snapshot.onBeforeCompile;
      mat.customProgramCacheKey = snapshot.customProgramCacheKey;
      mat.side = snapshot.side;
      mat.needsUpdate = true;
    });
    self.store.clear();
    self.materials.length = 0;
  }
} as ComponentDefinition;
