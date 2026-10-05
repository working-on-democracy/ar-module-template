// Ambient type for the asset manifest the Vite plugin generates from
// `src/assets/` (see `arModuleAssets()` in vite.config.ts). This declares ONLY
// the auto-derived asset list. The full, authored manifest (assets + camera +
// components + image targets) lives in `src/manifest.ts`, which imports this.
declare module "virtual:ar-manifest" {
  /** Asset descriptors derived from files in `src/assets/` at build time. */
  export interface ManifestAsset {
    id: string;
    src: string;
  }
  export interface AssetManifest {
    assets: ManifestAsset[];
  }
  export const manifest: AssetManifest;
  export default manifest;
}

// Augmented Bahnhofsviertel: names of the A-Frame components the module uses
// (see `abvUsedComponents()` in vite.config.ts / scripts/abv-used-components.ts).
declare module "virtual:abv-used-components" {
  export const usedComponents: string[];
  export default usedComponents;
}
