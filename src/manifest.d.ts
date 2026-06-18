declare module "virtual:ar-manifest" {
  /** Asset descriptors derived from files in `src/assets/` at build time. */
  export interface ManifestAsset {
    id: string;
    src: string;
  }
  export interface Manifest {
    assets: ManifestAsset[];
    components: string[];
  }
  export const manifest: Manifest;
  export default manifest;
}
