import type { ComponentDefinition } from "aframe";

// A single level-of-detail instance. Under it:
//   - `.lod-mesh-group` holding the detailed `.lod-mesh` models
//   - a `.lod-billboard` stand-in that cross-fades in as the group fades out
// The group fades between nearDistance/farDistance; individual meshes may set
// their own thresholds via `data-lod-near` / `data-lod-far` attributes.
//
// This component only gathers materials and registers with the lod-manager on an
// ancestor entity — the manager does the actual per-frame blending.
export default {
  schema: {
    nearDistance: { type: "number", default: 15 },
    farDistance: { type: "number", default: 25 },
    fadeSpeed: { type: "number", default: 3 }
  },

  init() {
    const self = this as any;
    self.nearDistance = self.data.nearDistance;
    self.farDistance = self.data.farDistance;
    self.nearDistanceSq = self.nearDistance * self.nearDistance;
    self.farDistanceSq = self.farDistance * self.farDistance;
    self.fadeSpeed = self.data.fadeSpeed;
    self.currentBlend = 1;
    self._billboardSettled = false; // tracks depthWrite/alphaTest transitions in lod-manager.applyBlend

    self.meshEls = Array.from(self.el.querySelectorAll(".lod-mesh"));
    self.billboardEl = self.el.querySelector(".lod-billboard");
    self.meshGroupObj = self.el.querySelector(".lod-mesh-group").object3D;

    // Inter-stick render-order banding support. Read the internal draw order
    // authored on each rendered child (set by glowstick-field via the render-order
    // component) straight from its attribute — available before the model loads —
    // and normalize it to a 0-based *local* range. The lod-manager later adds a
    // per-instance base (ranked by camera distance) so whole sticks sort back-to-
    // front while this internal order is preserved within each stick. Without the
    // base, sticks share the same small render-order values and transparent meshes
    // of different sticks interleave (see lod-manager.updateRenderOrder).
    const orderEls = [...self.meshEls, self.billboardEl].filter(Boolean);
    let minOrder = Infinity;
    let maxOrder = -Infinity;
    orderEls.forEach((el: any) => {
      const ro = Number(el.getAttribute("render-order")) || 0;
      el._lodRenderOrder = ro;
      if (ro < minOrder) minOrder = ro;
      if (ro > maxOrder) maxOrder = ro;
    });
    self._minOrder = isFinite(minOrder) ? minOrder : 0;
    self.renderSpan = isFinite(maxOrder) ? maxOrder - self._minOrder : 0; // width of this stick's band
    self.renderNodes = []; // { node, localOrder } for every rendered mesh node below

    self.meshMaterials = []; // parts WITHOUT their own thresholds
    self.overrides = []; // parts WITH their own thresholds (data-lod-near/-far)

    self.billboardObj = null;
    self.billboardMaterials = []; // an array — a glb can carry several materials

    self.meshEls.forEach((el: any) => {
      const nearAttr = el.getAttribute("data-lod-near");
      const farAttr = el.getAttribute("data-lod-far");
      const hasOverride = nearAttr !== null && farAttr !== null;

      // Manual opacity ceiling authored in ArModule.vue (glowstick-field's
      // `opacity` override), replacing whatever the glTF itself authored —
      // for a mesh that's technically alphaMode: BLEND but barely
      // translucent as modelled (e.g. 0.9 alpha), this is how to actually
      // make it see-through without re-exporting the source .glb.
      const opacityOverrideAttr = el.getAttribute("data-opacity-override");
      const opacityOverride = opacityOverrideAttr !== null ? parseFloat(opacityOverrideAttr) : null;

      // Opt-in (glowstick-field sets this on LICHT only, not the halo) for a
      // dithered discard fade instead of real alpha blending — see
      // setupDitherMaterial below for why.
      const useDither = el.getAttribute("data-lod-dither") !== null;

      let overrideEntry: any = null;
      if (hasOverride) {
        const near = parseFloat(nearAttr);
        const far = parseFloat(farAttr);
        overrideEntry = {
          nearDistance: near,
          farDistance: far,
          nearDistanceSq: near * near,
          farDistanceSq: far * far,
          currentBlend: 1,
          fadeSpeed: self.fadeSpeed,
          dither: useDither,
          materials: []
        };
        self.overrides.push(overrideEntry);
      }

      el.addEventListener("model-loaded", () => {
        const mesh = el.getObject3D("mesh");
        const localOrder = (el._lodRenderOrder || 0) - self._minOrder;
        mesh.traverse((node: any) => {
          if (node.isMesh) {
            // Clone so fading this instance's opacity doesn't affect shared
            // materials on other instances of the same model.
            node.material = Array.isArray(node.material)
              ? node.material.map((m: any) => m.clone())
              : node.material.clone();
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((m: any) => {
              // Captured before the LOD fade ever touches opacity below —
              // this is the glTF-authored alpha (1 for a normal opaque part,
              // < 1 for something genuinely translucent like tinted glass).
              // lod-manager.applyBlend() multiplies by this instead of
              // overwriting opacity outright, so a translucent part stays
              // translucent (letting whatever's behind it, e.g. LICHT, show
              // through) even once the group is fully faded in — without
              // this, every mesh gets forced fully opaque at full blend
              // regardless of its true material. An explicit data-opacity-
              // override attribute (see above) replaces this authored value
              // outright, for a mesh that's technically translucent but not
              // translucent *enough* as modelled.
              m.userData.trueOpacity = opacityOverride !== null ? opacityOverride : m.opacity;
              if (hasOverride && overrideEntry.dither) {
                // Dithered fade: stays (or is forced) opaque/depth-writing —
                // see setupDitherMaterial — instead of joining the transparent
                // queue, so it never depends on render-order against whatever
                // translucent mesh is supposed to reveal it.
                self.setupDitherMaterial(m);
              } else {
                m.transparent = true;
                // depthWrite is deliberately left as whatever the glTF
                // authored (true for opaque-authored parts, false for
                // alphaMode: BLEND) — this is what makes real distance
                // correctly govern occlusion both between sticks and against
                // anything else in the scene.
              }
              if (hasOverride) {
                overrideEntry.materials.push(m);
              } else {
                self.meshMaterials.push(m);
              }
            });
            // Record for the manager's inter-stick render-order banding.
            self.renderNodes.push({ node, localOrder });
          }
        });
      });
    });

    // Billboard is a glb (plane + PNG from Blender), not an A-Frame primitive.
    self.billboardEl.addEventListener("model-loaded", () => {
      self.billboardObj = self.billboardEl.getObject3D("mesh"); // a Group, not one mesh
      self.billboardMaterials = [];
      const bbLocalOrder = (self.billboardEl._lodRenderOrder || 0) - self._minOrder;
      self.billboardObj.traverse((node: any) => {
        if (node.isMesh) {
          node.material = Array.isArray(node.material)
            ? node.material.map((m: any) => m.clone())
            : node.material.clone();
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((m: any) => {
            m.transparent = true;
            m.alphaTest = 0; // avoid binary cutout behaviour during the fade
            m.depthWrite = false; // avoid depth-sort popping on overlap
            m.opacity = 1 - self.currentBlend; // start correct, not at default opacity
            self.billboardMaterials.push(m);
          });
          // Record for the manager's inter-stick render-order banding.
          self.renderNodes.push({ node, localOrder: bbLocalOrder });
        }
      });
      self.billboardObj.visible = self.currentBlend < 0.99; // start correct, not default "true"
    });

    // The lod-manager was a scene system in the prototype; here it's a component
    // on an ancestor (the module root). Resolve it by walking up to the nearest
    // [lod-manager] entity and registering with its component instance.
    //
    // A-Frame loads children before parents (ANode.load waits on child `loaded`
    // before running the parent's updateComponents), so at this point the
    // ancestor's lod-manager component is usually NOT initialized yet. Its
    // instance may already sit in `el.components` while its `init()` (which
    // creates `objects`) hasn't run — registering then would `objects.push` on
    // undefined and crash node loading. So gate on the component's `initialized`
    // flag, not mere presence: register synchronously only once it's truly ready,
    // otherwise wait for its `componentinitialized` event.
    const managerEl = self.el.closest("[lod-manager]") as any;
    if (!managerEl) {
      console.warn("[lod-object] no ancestor [lod-manager] found; LOD blending disabled");
      return;
    }

    const registerWithManager = () => {
      self.manager = managerEl.components["lod-manager"];
      if (self.manager) self.manager.register(self);
    };

    const managerComp = managerEl.components["lod-manager"];
    if (managerComp && managerComp.initialized) {
      registerWithManager();
    } else {
      const onInit = (e: any) => {
        if (e.detail.name !== "lod-manager") return;
        managerEl.removeEventListener("componentinitialized", onInit);
        registerWithManager();
      };
      managerEl.addEventListener("componentinitialized", onInit);
      self._onManagerInit = onInit;
      self._managerEl = managerEl;
    }
  },

  /**
   * Converts a material's distance-based fade from real alpha blending to a
   * screen-door dither discard, driven by `m.userData.ditherFade.value`
   * (0 = fully discarded, 1 = fully solid; lod-manager.applyBlend sets it in
   * place of `m.opacity` for dither-flagged overrides).
   *
   * Why: LICHT's own near/far fade used to work like every other translucent
   * part — `transparent = true` + real opacity — which only reveals it
   * correctly if the translucent body mesh in front of it (e.g. BAP_02, which
   * is opaque-authored/depthWrite:true but forced translucent via an opacity
   * override) draws AFTER it, i.e. depends on render-order/banding being
   * exactly right every frame. Discarding fragments instead of blending them
   * lets the material stay `transparent = false` (forced here regardless of
   * how the glTF authored it) and `depthWrite = true`, so three.js puts it in
   * the OPAQUE render queue — which unconditionally draws, and writes real
   * depth, before ANY transparent object, every frame, with no render-order
   * involved at all. Every translucent mesh drawn afterwards then depth-tests
   * against LICHT's real geometry and reveals it correctly through ordinary
   * alpha blending, regardless of render-order bookkeeping.
   *
   * customProgramCacheKey pins every dithered material to one shared compiled
   * program: three.js's default cache key doesn't account for onBeforeCompile
   * edits, so without this, a dithered material could silently share a cached
   * program with (or get shared onto) a non-dithered one with otherwise
   * identical properties.
   */
  setupDitherMaterial(m: any) {
    const fadeUniform = { value: 1 };
    m.userData.ditherFade = fadeUniform;
    m.transparent = false;
    m.depthWrite = true;
    m.customProgramCacheKey = () => "lod-dither-v1";
    m.onBeforeCompile = (shader: any) => {
      shader.uniforms.uDitherFade = fadeUniform;
      shader.fragmentShader =
        "uniform highp float uDitherFade;\n" +
        shader.fragmentShader.replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
          {
            // Interleaved gradient noise (Jimenez) — cheap, array-free, avoids
            // GLSL ES 1.0's shaky dynamic-index support a Bayer matrix would need.
            float ditherNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (ditherNoise > uDitherFade) discard;
          }`
        );
    };
    m.needsUpdate = true;
  },

  remove() {
    const self = this as any;
    if (self.manager) self.manager.unregister(self);
    // Removed before the manager ever initialized — drop the pending listener.
    else if (self._managerEl && self._onManagerInit) {
      self._managerEl.removeEventListener("componentinitialized", self._onManagerInit);
    }
  }
} as ComponentDefinition;
