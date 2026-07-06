// Shared "host" wiring used by the local previews so they mount a module exactly
// like the production host (frontend/src/components/ArModule.vue) does: register
// the manifest's A-Frame components and apply its camera settings — then tear them
// down again. Each apply* returns a teardown fn so previews can clean up on
// hot-reload / unmount, mirroring the host.
import type { Manifest, ManifestAsset } from "./manifest";

declare const AFRAME: any;

const VIDEO_EXT = ["mp4", "webm", "m4v", "mov", "ogv"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"];
const AUDIO_EXT = ["mp3", "wav", "aac", "m4a", "ogg"];

/**
 * The right <a-assets> child for an asset, chosen by file extension. A-Frame
 * needs media as the matching element type — a `<video>` for clips, an `<img>`
 * for textures, an `<audio>` for sound — and `<a-asset-item>` for everything else
 * (glTF, bin, …). Injecting everything as `<a-asset-item>` loads videos as opaque
 * blobs that can't play.
 */
export function assetElement(a: ManifestAsset): { tag: string; attrs: Record<string, unknown> } {
  const ext = (a.src.split(".").pop() ?? "").toLowerCase();
  if (VIDEO_EXT.includes(ext)) {
    return {
      tag: "video",
      attrs: { id: a.id, src: a.src, loop: true, muted: true, playsinline: true, preload: "auto", crossorigin: "anonymous" }
    };
  }
  if (IMAGE_EXT.includes(ext)) {
    return { tag: "img", attrs: { id: a.id, src: a.src, crossorigin: "anonymous" } };
  }
  if (AUDIO_EXT.includes(ext)) {
    return { tag: "audio", attrs: { id: a.id, src: a.src, preload: "auto", crossorigin: "anonymous" } };
  }
  return { tag: "a-asset-item", attrs: { id: a.id, src: a.src } };
}

/** Register every component the manifest declares, skipping any already present. */
export function registerManifestComponents(manifest: Pick<Manifest, "components">): void {
  for (const [name, def] of Object.entries(manifest.components ?? {})) {
    if (AFRAME?.components?.[name]) continue;
    AFRAME.registerComponent(name, def);
  }
}

/**
 * Apply camera settings to an <a-camera>, returning a teardown that restores the
 * camera to its previous attributes (so switching/unmounting a module resets it).
 */
export function applyCameraSettings(
  camera: Element | null,
  settings: Manifest["camera"]
): () => void {
  if (!camera) return () => {};
  const previous: Record<string, unknown> = {};
  for (const [attr, value] of Object.entries(settings ?? {})) {
    previous[attr] = camera.getAttribute(attr);
    camera.setAttribute(attr, value);
  }
  return () => {
    for (const [attr, value] of Object.entries(previous)) {
      if (value === null || value === undefined) camera.removeAttribute(attr);
      else camera.setAttribute(attr, value as any);
    }
  };
}