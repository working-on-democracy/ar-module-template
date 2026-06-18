import ArModule from "./ArModule.vue";

// The manifest is generated from the files in `src/assets/` at build time and
// emitted as `dist/manifest.json`. The host reads `mod.manifest.assets` and
// injects each entry into the scene's <a-assets> before mounting the module.
export { manifest } from "virtual:ar-manifest";

export default ArModule;
