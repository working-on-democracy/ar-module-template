// A drawing's line as the platform draws it (ar-demo-backend,
// frontend/src/components/ar-tube.ts, checked at 0651352): a tube along a
// Catmull-Rom curve through the points, its radius interpolated from each
// point's own radius, rounded end caps (a sphere at each end), and a lit Phong
// material per colour with a dim grey specular sheen. three.js comes in from
// the caller (the sandbox viewer's npm three, 8frame's r137 in AR).
import type * as T from "three";
import type { DrawingLine } from "../sim/types";

const TUBE_RADIAL_SEGMENTS = 8;
const MAX_TUBULAR_SEGMENTS = 400;

export function strokeTubes(THREE: typeof T) {
  // one material per colour, shared by every line of that colour (never disposed, as on the platform)
  const materials = new Map<string, T.MeshPhongMaterial>();
  const materialFor = (color: string) => {
    const key = color.toLowerCase();
    let m = materials.get(key);
    if (!m) { m = new THREE.MeshPhongMaterial({ color, specular: 0x2b2b2b, shininess: 22 }); materials.set(key, m); }
    return m;
  };
  /** The same sheen over another texture (a resting drawing takes its object's texture). */
  const texturedMaterial = (map: T.Texture) => new THREE.MeshPhongMaterial({ map, specular: 0x2b2b2b, shininess: 22 });
  let unitSphere: T.SphereGeometry | null = null;

  /** Radius along the tube (u = share of the arc length) from the points' own radii. */
  function radiusSampler(points: DrawingLine["points"]) {
    const n = points.length, cum = new Array<number>(n).fill(0);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
    const total = cum[n - 1];
    let k = 1;
    return (u: number) => {
      if (total <= 0) return points[0][3];
      const target = u * total;
      while (k < n - 1 && cum[k] < target) k++;
      const lo = cum[k - 1], hi = cum[k], t = hi > lo ? (target - lo) / (hi - lo) : 0;
      return points[k - 1][3] + (points[k][3] - points[k - 1][3]) * t;
    };
  }

  /** Rings along the curve's Frenet frames, each scaled by its own radius (as THREE.TubeGeometry, with a varying radius). */
  function tubeGeometry(points: DrawingLine["points"]): T.BufferGeometry {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const tubular = Math.min(MAX_TUBULAR_SEGMENTS, Math.max(2, points.length * 3)), radial = TUBE_RADIAL_SEGMENTS;
    const frames = curve.computeFrenetFrames(tubular, false), radiusAt = radiusSampler(points);
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const centre = new THREE.Vector3(), dir = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      const u = i / tubular;
      centre.copy(curve.getPointAt(u));
      const N = frames.normals[i], B = frames.binormals[i], r = radiusAt(u);
      for (let j = 0; j <= radial; j++) {
        const v = (j / radial) * Math.PI * 2, sin = Math.sin(v), cos = -Math.cos(v);
        dir.set(cos * N.x + sin * B.x, cos * N.y + sin * B.y, cos * N.z + sin * B.z).normalize();
        normals.push(dir.x, dir.y, dir.z);
        positions.push(centre.x + r * dir.x, centre.y + r * dir.y, centre.z + r * dir.z);
        uvs.push(u, j / radial);
      }
    }
    for (let j = 1; j <= tubular; j++) for (let i = 1; i <= radial; i++) {
      const a = (radial + 1) * (j - 1) + (i - 1), b = (radial + 1) * j + (i - 1), c = (radial + 1) * j + i, d = (radial + 1) * (j - 1) + i;
      indices.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(indices);
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    return g;
  }

  /** One line: the tube and its two end caps, all with one material. */
  function lineMesh(line: DrawingLine, material: T.Material = materialFor(line.color)): T.Mesh | null {
    if (line.points.length < 2) return null;
    const mesh = new THREE.Mesh(tubeGeometry(line.points), material);
    unitSphere ??= new THREE.SphereGeometry(1, TUBE_RADIAL_SEGMENTS, 6);
    for (const p of [line.points[0], line.points[line.points.length - 1]]) {
      const cap = new THREE.Mesh(unitSphere, material);
      cap.position.set(p[0], p[1], p[2]);
      cap.scale.setScalar(p[3]);
      mesh.add(cap);
    }
    return mesh;
  }

  return { lineMesh, materialFor, texturedMaterial };
}
