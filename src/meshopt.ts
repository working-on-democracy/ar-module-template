// A-Frame 1.3.0 / 8frame bundle a three.js GLTFLoader that CAN decode
// EXT_meshopt_compression, but only if a MeshoptDecoder is attached — A-Frame
// never wires one up, so meshopt-compressed .glb files fail to load out of the
// box. We attach meshoptimizer's decoder (WASM embedded as base64, so nothing
// extra to host) to every GLTFLoader the `gltf-model` component creates.
//
// Done in code rather than via a <head> script so it's bundled into
// ar-module.js and works in ALL contexts: the VR preview, the AR preview /
// standalone build, and — crucially — the production host, whose <head> we
// don't control. Imported for its side effect by src/manifest.ts (which the
// host loads via lib/main.ts and both previews import), so it runs once when
// the bundle is evaluated, before any model loads.
import { MeshoptDecoder } from "meshoptimizer";

declare const AFRAME: any;

/**
 * Monkey-patch GLTFLoader.prototype.load so every instance lazily attaches the
 * meshopt decoder. Patching the prototype (rather than one loader) covers the
 * gltf-model component, which news up its own loader per entity. Idempotent and
 * guarded: a missing AFRAME/THREE (or a re-import) is a no-op, and GLTFLoader
 * internally awaits `MeshoptDecoder.ready`, so attaching it before it's ready is
 * fine.
 */
export function enableMeshopt(): void {
  const proto = AFRAME?.THREE?.GLTFLoader?.prototype;
  if (!proto || proto.__meshoptPatched) return;
  proto.__meshoptPatched = true;

  const origLoad = proto.load;
  proto.load = function (url: string, onLoad: any, onProgress: any, onError: any) {
    if (!this.meshoptDecoder) this.setMeshoptDecoder(MeshoptDecoder);
    return origLoad.call(this, url, onLoad, onProgress, onError);
  };
}

enableMeshopt();