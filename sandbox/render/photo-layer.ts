// The photo layer (SCHNITTSTELLEN.md, `photo.frame`): the same code for the
// sandbox viewer (three.js from npm) and the AR test scene (8frame's three
// r137), so three.js comes in from the caller.
import type * as T from "three";
import type { PhotoFrame, Vec3 } from "../sim/types";

export function photoLayer(THREE: typeof T) {
  // The photo is projected from where it hangs (PhotoFrame, in the model's own
  // frame). Only triangles the projection reaches get it; the ones in its shadow
  // (facing away or behind another part of the model) keep their own material.
  // The shadow comes from a small depth buffer seen from the photo.
  const SHADOW_RES = 256;
  const meshToModel = (mesh: T.Mesh, model: T.Object3D) => {
    model.updateMatrixWorld(true);
    return new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
  };
  const along = (p: T.Vector3, d: Vec3) => p.x * d[0] + p.y * d[1] + p.z * d[2];
  /** Per mesh, per triangle: 1 = the projection reaches it. */
  function litTriangles(model: T.Object3D, f: PhotoFrame): Map<T.Mesh, Uint8Array> {
    // every triangle as seen from the photo: pixel x, y and depth (larger = nearer the photo) per corner
    const meshes: { mesh: T.Mesh; tris: Float32Array }[] = [];
    const sx = SHADOW_RES / Math.max(1e-6, f.max[0] - f.min[0]), sy = SHADOW_RES / Math.max(1e-6, f.max[1] - f.min[1]);
    let dMin = Infinity, dMax = -Infinity;
    const p = new THREE.Vector3();
    model.traverse((n) => {
      const mesh = n as T.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry, pos = g.getAttribute("position"), idx = g.getIndex(), m = meshToModel(mesh, model);
      const count = (idx ? idx.count : pos.count) / 3, tris = new Float32Array(count * 9);
      for (let i = 0; i < count * 3; i++) {
        p.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
        const d = along(p, f.dir);
        tris[i * 3] = (along(p, f.right) - f.min[0]) * sx; tris[i * 3 + 1] = (along(p, f.up) - f.min[1]) * sy; tris[i * 3 + 2] = d;
        dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
      }
      meshes.push({ mesh, tris });
    });
    const depth = new Float32Array(SHADOW_RES * SHADOW_RES).fill(-Infinity), owner = new Int32Array(SHADOW_RES * SHADOW_RES).fill(-1);
    const covered: boolean[] = [];
    const pixel = (x: number, y: number) => Math.min(SHADOW_RES - 1, Math.max(0, Math.floor(y))) * SHADOW_RES + Math.min(SHADOW_RES - 1, Math.max(0, Math.floor(x)));
    let id = 0;
    for (const { tris } of meshes) for (let t = 0; t < tris.length; t += 9, id++) {
      const [ax, ay, ad, bx, by, bd, cx, cy, cd] = tris.subarray(t, t + 9);
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      covered[id] = false;
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(SHADOW_RES - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(SHADOW_RES - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const wa = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, wb = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        covered[id] = true;
        const d = wa * ad + wb * bd + wc * cd, k = y * SHADOW_RES + x;
        if (d > depth[k]) { depth[k] = d; owner[k] = id; }
      }
    }
    const owns = new Uint8Array(id);
    for (const k of owner) if (k >= 0) owns[k] = 1;
    // a triangle smaller than a pixel: lit if its centre is not behind what the buffer holds there
    const eps = (dMax - dMin) * 0.01;
    const lit = new Map<T.Mesh, Uint8Array>();
    id = 0;
    for (const { mesh, tris } of meshes) {
      const out = new Uint8Array(tris.length / 9);
      for (let t = 0; t < out.length; t++, id++) {
        if (owns[id]) { out[t] = 1; continue; }
        if (covered[id]) continue;
        const q = tris.subarray(t * 9, t * 9 + 9), k = pixel((q[0] + q[3] + q[6]) / 3, (q[1] + q[4] + q[7]) / 3);
        if ((q[2] + q[5] + q[8]) / 3 >= depth[k] - eps) out[t] = 1;
      }
      lit.set(mesh, out);
    }
    return lit;
  }
  /** The geometry with two groups: 0 = in the shadow (own material), 1 = lit (photo). */
  function splitLit(base: T.BufferGeometry, lit: Uint8Array) {
    const shade: number[] = [], light: number[] = [], idx = base.getIndex();
    for (let t = 0; t < lit.length; t++) {
      const list = lit[t] ? light : shade;
      for (let k = 0; k < 3; k++) list.push(idx ? idx.getX(t * 3 + k) : t * 3 + k);
    }
    const g = base.clone();
    g.setIndex([...shade, ...light]);
    g.clearGroups();
    g.addGroup(0, shade.length, 0);
    g.addGroup(shade.length, light.length, 1);
    return g;
  }
  /** UVs of the projection: the image spread over the frame, as seen from the photo. */
  function projectedUv(g: T.BufferGeometry, mesh: T.Mesh, model: T.Object3D, f: PhotoFrame) {
    const out = g.clone(), pos = out.getAttribute("position"), m = meshToModel(mesh, model), p = new THREE.Vector3();
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      uv[i * 2] = (along(p, f.right) - f.min[0]) / Math.max(1e-6, f.max[0] - f.min[0]);
      uv[i * 2 + 1] = 1 - (along(p, f.up) - f.min[1]) / Math.max(1e-6, f.max[1] - f.min[1]);
    }
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return out;
  }
  /** The photo fills the frame and keeps its proportions: what sticks out is cut off. Fitted at once when the
   *  photo is there already, else once it loads. With three r137 (8frame) a clone gets only the image the texture
   *  has at that moment: whoever clones the result again (grain-shimmer) should wait for the photo first. */
  function fitPhoto(tex: T.Texture, loaded: Promise<void>, f: PhotoFrame) {
    const t = tex.clone(); // shares the image (r155+: its source, also one that is still loading)
    const frame = (f.max[0] - f.min[0]) / Math.max(1e-6, f.max[1] - f.min[1]);
    const fit = () => {
      if (t.image !== tex.image) t.image = tex.image; // r137: cloned before the image was there
      const img = t.image as { width: number; height: number } | undefined;
      if (!img?.width) return;
      const photo = img.width / Math.max(1, img.height);
      if (photo > frame) { t.repeat.set(frame / photo, 1); t.offset.set((1 - frame / photo) / 2, 0); }
      else { t.repeat.set(1, photo / frame); t.offset.set(0, (1 - photo / frame) / 2); }
      t.needsUpdate = true;
    };
    if ((tex.image as { width?: number } | undefined)?.width) fit(); else void loaded.then(fit);
    return t;
  }

  return { litTriangles, splitLit, projectedUv, fitPhoto };
}
