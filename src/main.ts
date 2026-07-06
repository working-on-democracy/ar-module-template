import ArModule from "./ArModule.vue";

// The host imports this bundle and reads `mod.manifest` to wire the module up
// before mounting it: inject assets, apply camera settings, and register A-Frame
// components. See src/manifest.ts for the shape.
export { manifest } from "./manifest";

export default ArModule;