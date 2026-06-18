import { createApp, h } from "vue";
import ArModule from "./ArModule.vue";
import { manifest } from "virtual:ar-manifest";

const mockArModule = {
  id: "preview-1",
  text: "Hello from preview",
  url: "preview://local",
  author: "Dev",
  location: { lat: 50.1109, lng: 8.6821 },
  assets: manifest.assets,
  components: [] as { name: string; url: string }[],
  createdAt: new Date().toISOString()
};

const PreviewApp = {
  render() {
    return h(
      "a-scene",
      { background: "color: #1e293b" },
      [
        // Mirror the host: inject the manifest's assets so the module can
        // reference them by id (served from src/assets/ by the dev plugin).
        h(
          "a-assets",
          {},
          manifest.assets.map((a) => h("a-asset-item", { id: a.id, src: a.src }))
        ),
        h("a-sky", { color: "#1e293b" }),
        h("a-light", { type: "ambient", color: "#ffffff", intensity: "0.6" }),
        h("a-light", { type: "directional", position: "1 1 1", intensity: "0.8" }),
        h("a-camera", {
          position: "0 1.6 3",
          "wasd-controls": "acceleration: 30",
          "look-controls": ""
        }),
        h(
          "a-entity",
          { position: "0 1.5 0" },
          [h(ArModule, { arModule: mockArModule })]
        )
      ]
    );
  }
};

const app = createApp(PreviewApp);
app.config.compilerOptions = {
  ...(app.config.compilerOptions ?? {}),
  isCustomElement: (tag: string) => tag.startsWith("a-")
};
app.mount("#app");
