// A comment's text on an object (SCHNITTSTELLEN.md, `comment`): projected like
// a photo (photo-layer.ts), a see-through layer over the triangles the
// projection reaches, the letters in the comment's colour, unlit like the
// platform's comment text. The same code for the sandbox viewer and the AR test
// scene; three.js comes in from the caller.
import type * as T from "three";
import type { PhotoFrame } from "../sim/types";
import { COMMENT_ON_OBJECT_OPACITY, COMMENT_ON_OBJECT_SCALE, commentCanvas } from "./comment-text";
import { photoLayer } from "./photo-layer";

export function commentLayer(THREE: typeof T, layer = photoLayer(THREE)) {
  const hidden = new THREE.MeshBasicMaterial({ visible: false });

  /** Lays the text over every mesh of the model (the frame is in the model's own frame); returns what takes it off again. */
  function add(model: T.Object3D, frame: PhotoFrame, text: string, color: string): () => void {
    const meshes: T.Mesh[] = [];
    model.traverse((n) => { if ((n as T.Mesh).isMesh && !n.userData.comment) meshes.push(n as T.Mesh); });
    const lit = layer.litTriangles(model, frame);
    const tex = new THREE.CanvasTexture(commentCanvas(text, (frame.max[0] - frame.min[0]) / Math.max(1e-6, frame.max[1] - frame.min[1]), 1024, COMMENT_ON_OBJECT_SCALE));
    tex.flipY = false; // as the photo: v = 0 at the top of the frame
    const mat = new THREE.MeshBasicMaterial({ color, alphaMap: tex, transparent: true, opacity: COMMENT_ON_OBJECT_OPACITY, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const overlays = meshes.map((m) => {
      const o = new THREE.Mesh(layer.splitLit(layer.projectedUv(m.geometry, m, model, frame), lit.get(m)!), [hidden, mat]);
      o.userData.comment = true;
      o.renderOrder = 1;
      m.add(o);
      return o;
    });
    return () => {
      for (const o of overlays) { o.removeFromParent(); o.geometry.dispose(); }
      mat.dispose();
      tex.dispose();
    };
  }

  return { add };
}
