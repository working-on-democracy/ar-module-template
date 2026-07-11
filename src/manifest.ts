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
import meshRenderOrder from "./a-frame-components/mesh-render-order";
import unlitMaterials from "./a-frame-components/unlit-materials";
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

  // The platform host owns one <a-camera> shared by every module on screen: it
  // sets id/position (to place the viewer) and cursor/raycaster (to make posts
  // tappable) itself, and applies whatever this object contains on top with no
  // filtering — unlike this branch's own standalone preview, the real host has
  // no notion of "forbidden" camera keys. Setting position/cursor/raycaster
  // here would relocate the *shared* camera and drop its tap-raycast interval
  // for every other module on screen while this one is mounted. This used to
  // set position: "0 8 8" (plus cursor/raycaster) to get an elevated, pulled-
  // back overview of the scene in the standalone build — see ArModule.vue for
  // the compensating position that now recreates that same framing without
  // touching the camera.
  camera: {},

  components: {
    "no-frustum-cull": noFrustumCull,
    "mesh-render-order": meshRenderOrder,
    "unlit-materials": unlitMaterials
  },

  // No image targets in use. The image-target machinery is kept intact (this
  // field, host-runtime's configureImageTargets, and the vite plumbing) for
  // future use: drop a target's JSON + images into src/image-targets/, import the
  // JSON here, and add it to this array.
  imageTargets: []
};

export default manifest;
