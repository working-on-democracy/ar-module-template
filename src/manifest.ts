// The module's manifest — the single object the host reads off the published
// bundle as `mod.manifest`. It bundles everything the host must wire up *before*
// mounting the component:
//
//   - assets       → injected into the scene's <a-assets> as <a-asset-item>
//   - camera       → attributes applied to the scene's <a-camera>
//   - components   → A-Frame components registered via AFRAME.registerComponent
//   - imageTargets → XR8 image-target data fed to XR8.XrController.configure
//
// `assets` is derived automatically from `src/assets/` by the Vite plugin
// (virtual:ar-manifest). The other three are authored here by hand.
import { manifest as assetManifest } from "virtual:ar-manifest";
import type { ComponentDefinition } from "aframe";

import noFrustumCull from "./a-frame-components/no-frustum-cull";
import unlitMaterial from "./a-frame-components/unlit-material";
import renderOrder from "./a-frame-components/render-order";
import billboard from "./a-frame-components/billboard";
import groundDecal from "./a-frame-components/ground-decal";
import lodObject from "./a-frame-components/lod-object";
import lodManager from "./a-frame-components/lod-manager";
import attachTo from "./a-frame-components/attach-to";
import { patchGLTFLoaderWithMeshoptDecoder } from "./gltf-meshopt-setup";

// Runs as soon as this module is imported — by the local previews AND by the
// production host, since both must import `manifest` to do anything with this
// module. Lets glb assets compressed with `gltfpack -c` actually load; see
// gltf-meshopt-setup.ts for why this is necessary.
patchGLTFLoaderWithMeshoptDecoder();

export interface ManifestAsset {
  id: string;
  src: string;
}
/** Attribute → value pairs applied to the scene's <a-camera> before mount. */
export type CameraSettings = Record<string, string>;
export interface Manifest {
  assets: ManifestAsset[];
  camera: CameraSettings;
  /** A-Frame component name → definition, registered before the module mounts. */
  components: Record<string, ComponentDefinition>;
  /** XR8 image-target descriptors (the JSON exported by the 8th Wall target tool). */
  imageTargets: unknown[];
}

export const manifest: Manifest = {
  // Auto-scanned from src/assets/; file name (sans extension) is the asset id.
  assets: assetManifest.assets,

  camera: {
    // `id: camera` lets the module attach a camera-following point light via
    // xrextras-attach="target: camera" (the lightstick scene relies on it).
    id: "camera",
    raycaster: "objects: .cantap",
    cursor: "fuse: false; rayOrigin: mouse;",
    position: "0 8 8"
  },

  components: {
    "no-frustum-cull": noFrustumCull,
    "unlit-material": unlitMaterial,
    "render-order": renderOrder,
    billboard: billboard,
    "ground-decal": groundDecal,
    "lod-object": lodObject,
    // Drives every lod-object; place it on the module root (see ArModule.vue).
    "lod-manager": lodManager,
    // Makes an entity follow another's world position (our xrextras-attach stand-in).
    "attach-to": attachTo
  },

  // The lightstick module uses SLAM/world tracking only — no image targets.
  imageTargets: []
};

export default manifest;
