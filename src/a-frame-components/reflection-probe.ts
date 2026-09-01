import type { ComponentDefinition } from "aframe";

declare const AFRAME: any;

// Real-time environment reflections for metallic materials — a single
// shared THREE.CubeCamera renders the actual scene (other objects, lights,
// ground — not just a static/baked image) into a cube render target, then
// assigns that texture as `envMap` on every MeshStandardMaterial found among
// `target`'s descendants (or this entity's own descendants if `target` is
// omitted). Written for AN ALLE! material-shader-showcase (archive-of-
// practice projects/an-alle/concepts/material-shader-showcase.md, author's
// request 01.09.2026: "nicht nur Lichter, auch andere Objekte sollen sich in
// metallischem Material spiegeln" — plain point/spot lights only ever
// contribute specular highlights, never reflections of actual geometry,
// since three.js doesn't do that without an environment map).
//
// ONE shared cube camera for the whole group, not one per reflective
// object — the standard real-time-reflection cost/quality compromise. The
// reflection is captured from a single vantage point (this entity's own
// position) rather than each individual sphere's exact position, which is
// visually indistinguishable here (the six spheres sit close together on
// one small helix) but costs the same single extra render pass regardless
// of how many materials end up using the result.
//
// `target` (attach-to.ts's own selector pattern, s. its own comment) lets
// this live on its OWN entity, separate from the group it reflects onto —
// added 01.09.2026 so the whole probe can be toggled on/off at runtime via
// Vue `v-if` (which actually connects/disconnects the underlying DOM node,
// the well-established way A-Frame initialises/tears down a component) —
// toggling this component's OWN attribute value on an entity that was
// already mounted turned out not to reliably re-run init() the same way.
//
//   <a-entity reflection-probe="target: #showcase; updateEveryNFrames: 10; resolution: 128"></a-entity>
//   ...
//   <a-entity id="showcase">
//     <a-entity geometry="primitive: sphere" material="metalness: 1"></a-entity>
//     ...
//   </a-entity>
//
// Only affects materials that are already `MeshStandardMaterial`/
// `MeshPhysicalMaterial` (anything A-Frame's own `material`/`material-
// properties`/`dither-material` components create) — reflections are a
// built-in part of that material's own shader (`envmap_fragment`, a
// standard three.js chunk activated automatically once `envMap` is set),
// so this needs no onBeforeCompile shader patch of its own, unlike
// proximity-cutout.ts/dither-material.ts.
export default {
  schema: {
    // Defaults to this entity itself (s. init() below) if omitted.
    target: { type: "selector" },
    // How many rendered frames between cube captures — a full cube capture
    // is six passes over the scene, not free on a mobile AR device, and
    // this scene's reflections (slowly orbiting lights, swipe-driven
    // material changes) don't need frame-perfect freshness. 1 = every frame.
    updateEveryNFrames: { type: "number", default: 10 },
    // Cube map face resolution — kept low on purpose; this feeds a blurry/
    // small reflection accent on tiny spheres, not a sharp mirror.
    resolution: { type: "number", default: 128 }
  },

  init() {
    const self = this as any;
    self.renderTarget = new AFRAME.THREE.WebGLCubeRenderTarget(self.data.resolution, {
      format: AFRAME.THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: AFRAME.THREE.LinearMipmapLinearFilter
    });
    // near/far chosen for this scene's own small (footprint-relative) scale,
    // not room-scale metres — matches the same unit system every other
    // distance in ArModule.vue uses (s. FOOTPRINT_MIN_SIDE there).
    self.cubeCamera = new AFRAME.THREE.CubeCamera(0.01, 10, self.renderTarget);
    self.el.object3D.add(self.cubeCamera);
    self.materials = new Set<any>();
    self.frameCount = 0;
    self.targetEl = self.data.target || self.el;

    // Re-scans on every object3dset bubble (mirrors dither-material.ts's
    // own primitive-support pattern) so materials created after this
    // component's init() — the usual case for primitives, which set up
    // their mesh slightly later — still get discovered, not just whatever
    // already existed at init() time.
    self.registerMaterials = () => {
      self.targetEl.object3D.traverse((node: any) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m: any) => {
          if (m.isMeshStandardMaterial && !self.materials.has(m)) {
            m.envMap = self.renderTarget.texture;
            m.needsUpdate = true;
            self.materials.add(m);
          }
        });
      });
    };
    self.targetEl.addEventListener("object3dset", self.registerMaterials);
    self.registerMaterials();
  },

  tick() {
    const self = this as any;
    self.frameCount++;
    if (self.frameCount % self.data.updateEveryNFrames !== 0) return;

    const sceneEl = self.el.sceneEl;
    const renderer = sceneEl?.renderer;
    const scene = sceneEl?.object3D;
    if (!renderer || !scene) return;

    self.cubeCamera.updateMatrixWorld(true);
    self.cubeCamera.update(renderer, scene);
  },

  remove() {
    const self = this as any;
    self.targetEl.removeEventListener("object3dset", self.registerMaterials);
    self.materials.forEach((m: any) => {
      m.envMap = null;
      m.needsUpdate = true;
    });
    self.materials.clear();
    self.cubeCamera.parent?.remove(self.cubeCamera);
    self.renderTarget.dispose();
  }
} as ComponentDefinition;
