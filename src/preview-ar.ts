import { createApp, h, ref, nextTick } from "vue";
import ArModule from "./ArModule.vue";
import { manifest } from "./manifest";
import {
  registerManifestComponents,
  applyCameraSettings,
  configureImageTargets,
  assetElement
} from "./host-runtime";

// Same data shape the host injects.
const mockArModule = {
  id: "preview-1",
  text: "Hello from AR preview",
  url: "preview://local",
  author: "Dev",
  location: { lat: 50.1109, lng: 8.6821 },
  assets: manifest.assets,
  components: [] as { name: string; url: string }[],
  createdAt: new Date().toISOString()
};

// Mirror @8thwall/engine-binary's tiny entry: resolve once the engine (xr.js,
// loaded via the script tag in ar.html) has booted. Inlined so the module's
// TypeScript/library build never has to depend on the engine package — only its
// dist/ is needed at runtime (copied to /external/xr by vite-plugin-static-copy).
const XR8Promise: Promise<any> = new Promise((resolve) => {
  const w = window as any;
  if (w.XR8) resolve(w.XR8);
  else window.addEventListener("xrloaded", () => resolve(w.XR8), { once: true });
});

const xrReady = ref(false);
const assetsReady = ref(false);

// Pre-flight the camera permission (8th Wall then takes over the stream). Matches
// the host's usePermissions.requestCamera so the prompt fires reliably.
navigator.mediaDevices
  ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
  .then((s) => s.getTracks().forEach((t) => t.stop()))
  .catch(() => { /* user can still grant when xrweb prompts */ });

XR8Promise.then((XR8: any) => {
  XR8.XrController.configure({});
  xrReady.value = true;
});

const ArPreviewApp = {
  render() {
    if (!xrReady.value) {
      return h(
        "div",
        { style: "color:#94a3b8;font-family:sans-serif;padding:24px" },
        "Initializing 8th Wall AR…"
      );
    }

    const children = [
      // Same asset injection as the VR preview / host.
      h(
        "a-assets",
        { timeout: "10000" },
        manifest.assets.map((a) => {
          const el = assetElement(a);
          return h(el.tag, el.attrs);
        })
      ),
      h("a-light", { type: "ambient", intensity: "0.8" }),
      h("a-light", { type: "directional", position: "1 2 1", intensity: "0.9", light: "castShadow: true" }),
      h("a-camera", {
        position: "0 0 0",
        raycaster: "objects: .cantap",
        cursor: "fuse: false; rayOrigin: mouse;"
      }),
      h("a-plane", {
        id: "ground",
        rotation: "-90 0 0",
        width: "100",
        height: "100",
        material: "shader: shadow",
        shadow: ""
      })
    ];

    if (assetsReady.value) {
      // Placed like the host (AR_MODULE_POSITION) so the module previews where it
      // would actually appear in the app.
      children.push(
        h("a-entity", { id: "module-root", position: "0 1.6 -3" }, [
          h(ArModule, { arModule: mockArModule })
        ])
      );
    }

    return h(
      "a-scene",
      {
        "xrextras-loading": "",
        "xrextras-runtime-error": "",
        "xrextras-gesture-detector": "",
        xrweb: "disableWorldTracking: false",
        "xr-mode-ui": "enabled: false",
        renderer: "colorManagement: true"
      },
      children
    );
  }
};

const app = createApp(ArPreviewApp);
app.config.compilerOptions = {
  ...(app.config.compilerOptions ?? {}),
  isCustomElement: (tag: string) => tag.startsWith("a-")
};
app.mount("#app");

nextTick(() => {
  const waitForScene = () => {
    const scene = document.querySelector("a-scene") as (Element & { hasLoaded?: boolean }) | null;
    if (!scene) {
      requestAnimationFrame(waitForScene);
      return;
    }
    const mount = () => {
      // Mirror the host: register the manifest's A-Frame components, apply its
      // camera settings, and feed its image targets to XR8 before mounting.
      registerManifestComponents(manifest);
      applyCameraSettings(document.querySelector("a-camera"), manifest.camera);
      configureImageTargets((window as any).XR8, manifest.imageTargets);
      assetsReady.value = true;
    };
    // Mount the module after the scene/assets register, so `gltf-model="#id"`
    // resolves its selector (avoids "asset not found").
    if (scene.hasLoaded) mount();
    else scene.addEventListener("loaded", mount);
    requestAnimationFrame(() => requestAnimationFrame(mount));

    // Animated skinned meshes get frustum-culled by three.js; disable culling on
    // loaded model meshes so they don't vanish once animation-mixer runs.
    scene.addEventListener("model-loaded", (e: any) => {
      e.target?.getObject3D?.("mesh")?.traverse?.((o: any) => {
        if (o.isMesh) o.frustumCulled = false;
      });
    });
  };
  waitForScene();
});
