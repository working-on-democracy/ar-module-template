import type { ComponentDefinition } from "aframe";

// Builds a whole field of glowsticks from the assets already declared in the
// scene's <a-assets>, spread randomly across a rectangular area on the ground.
//
// It does NOT introduce any new rendering behaviour: every instance it creates is
// the exact same DOM structure as the hand-written examples that used to live in
// ArModule.vue, so it reuses the existing components verbatim —
//   lod-object / lod-manager  → distance-based cross-fade to the billboard
//   unlit-material            → flat glow materials on HaloSphere / LICHT / PNG
//   render-order              → transparent draw order
//   billboard                 → HaloSphere + PNG face the camera
// This component only *authors* those entities; it changes none of them.
//
// Glowstick assets follow a naming convention, auto-discovered here:
//   PREFIX_01, PREFIX_02, …  → the numbered body meshes (some sets use a single
//                              un-numbered base mesh named just PREFIX, e.g. AESPA2)
//   PREFIX_LICHT             → the glowing light part (gets the global LICHT near/far)
//   PREFIX_PNG               → the flat billboard stand-in
// Any asset lacking both a _PNG and a _LICHT sibling (HaloSphere, Halo, Stick*, …)
// is ignored, so only real glowsticks are placed.
//
// Placement uses Poisson-disk (Bridson) sampling inside a FIXED-WIDTH strip: the
// width is the value you set, and the depth grows freely away from the viewer to
// fit however many sticks there are. Each new stick is dropped into an annulus
// [minDistance, maxDistance] around an already-placed one and rejected if it lands
// closer than minDistance to any neighbour — so both the minimum AND maximum spacing
// are honoured exactly. Because depth is unbounded there is always room to place the
// next stick, so the count (copies) is free: more sticks just make the field deeper,
// fewer make it shallower.

interface GlowstickDef {
  prefix: string;
  meshes: string[]; // opaque body meshes, in draw order (numbered, or a single base)
  licht: string; // the _LICHT glow part
  png: string; // the _PNG billboard
}

interface Point {
  x: number;
  z: number;
}

export default {
  schema: {
    // --- Placement. The field is a FIXED-WIDTH strip on the ground (XZ plane):
    //     `areaWidth` is the width you set (X), centred on this entity's origin so it
    //     extends equally to the viewer's left and right. There is deliberately no
    //     depth setting — the depth grows automatically away from the viewer (into
    //     -Z), starting right in front of them, to fit every stick at the chosen
    //     spacing. ---
    areaWidth: { type: "number", default: 20 }, // FIXED width along X (centred on origin)

    // --- Vertical placement of the glowsticks ---
    elevation: { type: "number", default: 0 }, // base Y height of every glowstick
    elevationVariation: { type: "number", default: 0 }, // ± random offset from `elevation`

    // --- Random tilt. Every stick always gets a fully random Y spin (0–360°, not
    //     configurable). X and Z additionally get an independent random tilt whose
    //     magnitude is a random value in [tiltMin, tiltMax] degrees, applied in a
    //     random direction (±). Leave both at 0 to keep the sticks upright. ---
    tiltMin: { type: "number", default: 0 }, // min tilt magnitude for X and Z (degrees)
    tiltMax: { type: "number", default: 0 }, // max tilt magnitude for X and Z (degrees)

    // --- Spacing between glowsticks (both honoured exactly) ---
    minDistance: { type: "number", default: 2.5 }, // hard minimum gap between any two
    maxDistance: { type: "number", default: 6 }, // max gap to the nearest neighbour

    // --- How many of each glowstick ---
    copies: { type: "int", default: 1 }, // 1 = 25 sticks, 2 = 50, 3 = 75, …

    // --- Minimum ground-plane (XZ) gap between two copies of the SAME glowstick
    //     type. Only meaningful when copies > 1. 0 (default) disables it, so copies
    //     may land anywhere. Placement is a permutation over the sampled points, so
    //     this never changes the field's footprint — only which points may share a
    //     type. If the area is too tight to honour it for every copy of a type, the
    //     placement degrades gracefully (spreads those copies as far apart as it can). ---
    minCopyDistance: { type: "number", default: 0 },

    // --- Per-instance scale (the examples used 3–5) ---
    scale: { type: "number", default: 3 },

    // --- Global LOD tuning, applied to every generated instance ---
    lodNear: { type: "number", default: 15 }, // lod-object nearDistance (fully detailed)
    lodFar: { type: "number", default: 20 }, // lod-object farDistance (fully billboard)
    lichtNear: { type: "number", default: 7 }, // data-lod-near for the glow parts (LICHT + HaloSphere)
    lichtFar: { type: "number", default: 10 } // data-lod-far for the glow parts
  },

  init() {
    const self = this as any;
    const data = self.data;

    // Per-mesh render-order overrides authored in ArModule.vue (JSON on this
    // entity's data-render-order attribute). Empty → the default sequential order.
    self.renderOrderOverrides = self.parseRenderOrderOverrides();

    const defs = self.discoverGlowsticks();
    if (!defs.length) {
      console.warn("[glowstick-field] no glowstick assets found in <a-assets>; nothing placed");
      return;
    }

    const copies = Math.max(1, data.copies);
    // The full placement list: every glowstick repeated `copies` times, then
    // shuffled so copies end up scattered across the area rather than clumped.
    const queue: GlowstickDef[] = [];
    for (let c = 0; c < copies; c++) queue.push(...defs);
    self.shuffle(queue);

    // Fixed width, free depth: the sampler fills the width you set and grows away
    // from the viewer as far as needed, so the min/max spacing is honoured exactly
    // no matter how many sticks (copies) there are.
    const positions = self.samplePositions(queue.length, Math.max(0.0001, data.areaWidth));

    // Decide which sampled point each queued stick occupies. With minCopyDistance
    // set, this keeps copies of the same type apart; otherwise it's the plain 1:1
    // mapping (unchanged behaviour).
    const placement = self.assignPositions(queue, positions, Math.max(0, data.minCopyDistance));

    // Build every instance detached, then append — appending the fully-assembled
    // subtree lets A-Frame initialise the children (lod-mesh-group etc.) before the
    // instance's own lod-object, which queries them on init.
    const count = Math.min(queue.length, positions.length);
    for (let i = 0; i < count; i++) {
      const y = data.elevation + (Math.random() * 2 - 1) * data.elevationVariation;
      // Y: fully random spin. X and Z: independent random tilts within the configured range.
      const rot = { x: self.randomTilt(), y: Math.random() * 360, z: self.randomTilt() };
      const inst = self.buildGlowstick(queue[i], placement[i], y, rot);
      self.el.appendChild(inst);
    }
  },

  /**
   * Map each queued stick to one of the sampled points (a permutation — every point
   * is used exactly once, so the field footprint is unchanged). When minCopyDistance
   * > 0, greedily pick for each stick the first free point that clears every already-
   * placed copy of the SAME type by at least that distance on the ground plane. If no
   * free point qualifies (area too tight for this many copies of a type), fall back to
   * the free point farthest from the nearest same-type copy, so it degrades gracefully
   * rather than clumping. minCopyDistance <= 0 keeps the original 1:1 order.
   */
  assignPositions(queue: GlowstickDef[], positions: Point[], minCopyDistance: number): Point[] {
    const n = Math.min(queue.length, positions.length);
    const result: Point[] = new Array(n);

    if (minCopyDistance <= 0) {
      for (let i = 0; i < n; i++) result[i] = positions[i];
      return result;
    }

    const minSq = minCopyDistance * minCopyDistance;
    const used: boolean[] = new Array(positions.length).fill(false);
    // Points already assigned to each type, to test the same-type spacing against.
    const placedByPrefix: Record<string, Point[]> = {};

    // Nearest squared distance from a point to any already-placed copy of its type
    // (Infinity when it's the first copy — nothing to clash with).
    const nearestSameTypeSq = (p: Point, placed: Point[]): number => {
      let m = Infinity;
      for (const q of placed) {
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        const d = dx * dx + dz * dz;
        if (d < m) m = d;
      }
      return m;
    };

    for (let i = 0; i < n; i++) {
      const prefix = queue[i].prefix;
      const placed = placedByPrefix[prefix] || (placedByPrefix[prefix] = []);

      // First choice: the first free point that clears every same-type copy.
      let chosen = -1;
      for (let p = 0; p < positions.length; p++) {
        if (used[p]) continue;
        if (nearestSameTypeSq(positions[p], placed) >= minSq) {
          chosen = p;
          break;
        }
      }

      // Fallback: none clears it — take the free point that is as far as possible
      // from the nearest same-type copy (best effort in a too-small area).
      if (chosen === -1) {
        let bestSq = -1;
        for (let p = 0; p < positions.length; p++) {
          if (used[p]) continue;
          const d = nearestSameTypeSq(positions[p], placed);
          if (d > bestSq) {
            bestSq = d;
            chosen = p;
          }
        }
      }

      used[chosen] = true;
      result[i] = positions[chosen];
      placed.push(positions[chosen]);
    }

    return result;
  },

  /** Group every <a-asset-item> id by naming convention into glowstick definitions. */
  discoverGlowsticks(): GlowstickDef[] {
    const self = this as any;
    const scene = self.el.sceneEl || document;
    const items = Array.from(scene.querySelectorAll("a-asset-item")) as Element[];

    const groups: Record<string, { meshes: string[]; licht: string | null; png: string | null }> = {};
    for (const el of items) {
      const id = el.getAttribute("id");
      if (!id) continue;
      const us = id.indexOf("_");
      const prefix = us === -1 ? id : id.slice(0, us);
      const suffix = us === -1 ? "" : id.slice(us + 1);
      const g = (groups[prefix] ||= { meshes: [], licht: null, png: null });
      if (suffix === "PNG") g.png = id;
      else if (suffix === "LICHT") g.licht = id;
      else g.meshes.push(id); // numbered body mesh, or a bare base mesh (e.g. AESPA2)
    }

    const defs: GlowstickDef[] = [];
    for (const prefix of Object.keys(groups)) {
      const g = groups[prefix];
      // A real glowstick needs both a billboard and a light part; everything else
      // (HaloSphere, Halo, Stick*, …) is skipped.
      if (!g.png || !g.licht || !g.meshes.length) continue;
      g.meshes.sort(); // zero-padded numbers sort correctly lexicographically
      defs.push({ prefix, meshes: g.meshes, licht: g.licht, png: g.png });
    }
    defs.sort((a, b) => a.prefix.localeCompare(b.prefix)); // stable, predictable order
    return defs;
  },

  /**
   * Read the per-mesh render-order overrides authored in ArModule.vue, passed as a
   * JSON object ({ "BTS_01": 1, "BTS_LICHT": 6, … }) on this entity's
   * `data-render-order` attribute. Returns a mesh-id → order map; missing or
   * non-numeric entries fall back to the default sequential order in buildGlowstick.
   * Only the numbered body meshes and the _LICHT part are honoured — HaloSphere and
   * _PNG are always forced first/last there, so listing them here has no effect.
   */
  parseRenderOrderOverrides(): Record<string, number> {
    const self = this as any;
    const raw = self.el.dataset ? self.el.dataset.renderOrder : null;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      const out: Record<string, number> = {};
      for (const [id, value] of Object.entries(parsed)) {
        const n = Number(value);
        if (Number.isFinite(n)) out[id] = n;
      }
      return out;
    } catch (e) {
      console.warn("[glowstick-field] invalid data-render-order JSON; using default order", e);
      return {};
    }
  },

  /** Fisher–Yates in place. */
  shuffle(arr: unknown[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },

  /**
   * A random tilt angle (degrees) for a single axis: magnitude picked uniformly in
   * [tiltMin, tiltMax], with a random sign so it tilts either way. Returns 0 when no
   * tilt is configured. Called once per axis so X and Z get independent values.
   */
  randomTilt(): number {
    const self = this as any;
    const a = Math.max(0, self.data.tiltMin);
    const b = Math.max(0, self.data.tiltMax);
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    if (max <= 0) return 0;
    const mag = min + Math.random() * (max - min);
    return (Math.random() < 0.5 ? -1 : 1) * mag;
  },

  /**
   * Poisson-disk (Bridson) sample `n` points in a FIXED-WIDTH strip. Width is bounded
   * and centred on the origin (x ∈ [-width/2, width/2]); depth is unbounded and grows
   * away from the viewer (z ≤ 0), starting at z = 0 right in front of them. Each new
   * point is dropped into an annulus [minDistance, maxDistance] around an existing one
   * and rejected if it lands closer than minDistance to any neighbour, so both spacing
   * bounds hold exactly. Because depth is free there is always room ahead, so all `n`
   * points get placed however many there are — the field just grows deeper.
   */
  samplePositions(n: number, width: number): Point[] {
    const self = this as any;
    const halfW = width / 2;
    const minDist = Math.max(0, self.data.minDistance);
    const maxDist = Math.max(minDist, self.data.maxDistance);
    const minDistSq = minDist * minDist;
    const K = 30; // candidate attempts per active point

    const nearestDistSq = (p: Point, pts: Point[]) => {
      let m = Infinity;
      for (const q of pts) {
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        const d = dx * dx + dz * dz;
        if (d < m) m = d;
      }
      return m;
    };

    // Seed at the front-centre; the strip grows away from the viewer into -Z.
    const samples: Point[] = [{ x: 0, z: 0 }];
    const active: Point[] = [samples[0]];

    while (samples.length < n && active.length > 0) {
      const idx = Math.floor(Math.random() * active.length);
      const p = active[idx];
      let placed: Point | null = null;
      for (let k = 0; k < K; k++) {
        const angle = Math.random() * Math.PI * 2;
        const rad = minDist + Math.random() * (maxDist - minDist);
        const c: Point = { x: p.x + Math.cos(angle) * rad, z: p.z + Math.sin(angle) * rad };
        if (c.x < -halfW || c.x > halfW || c.z > 0) continue; // stay in the strip, in front of the viewer
        if (minDist > 0 && nearestDistSq(c, samples) < minDistSq) continue;
        placed = c;
        break;
      }
      if (placed) {
        samples.push(placed);
        active.push(placed);
      } else {
        active.splice(idx, 1); // this point can spawn no more neighbours
      }
    }

    // Safety net: if the frontier ever stalls before `n` (e.g. width < minDistance),
    // keep placing straight back from the deepest point at maxDistance spacing.
    if (samples.length < n) {
      let z = 0;
      for (const p of samples) if (p.z < z) z = p.z;
      const step = Math.max(maxDist, minDist, 0.0001);
      while (samples.length < n) {
        z -= step;
        samples.push({ x: 0, z });
      }
    }

    // Centre the strip on X so it extends equally to the viewer's left and right
    // (the near edge is already at z = 0 by construction).
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of samples) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    const xMid = (minX + maxX) / 2;
    for (const p of samples) p.x -= xMid;

    return samples;
  },

  /** Assemble one glowstick's entity subtree (matches the ArModule.vue examples). */
  buildGlowstick(def: GlowstickDef, pos: Point, y: number, rot: { x: number; y: number; z: number }): Element {
    const self = this as any;
    const { scale, lodNear, lodFar, lichtNear, lichtFar } = self.data;
    const near = String(lichtNear);
    const far = String(lichtFar);

    // Resolve the draw order of each part. Per-mesh overrides (authored in
    // ArModule.vue → data-render-order) win; otherwise fall back to the default
    // sequential order (body meshes 1..n in file order, then LICHT). The HaloSphere
    // and _PNG are deliberately NOT author-controllable: the halo is forced just
    // below the lowest part of this stick (drawn first, so its transparent glow
    // never obscures the body) and the _PNG billboard just above the highest (drawn
    // last, so it fully covers the stick as the LOD system fades it in).
    const overrides: Record<string, number> = self.renderOrderOverrides || {};
    const bodyOrders: number[] = def.meshes.map((id: string, i: number) =>
      id in overrides ? overrides[id] : i + 1
    );
    const lichtOrder = def.licht in overrides ? overrides[def.licht] : def.meshes.length + 1;
    const groupOrders = [...bodyOrders, lichtOrder];
    const haloOrder = Math.min(...groupOrders) - 1;
    const pngOrder = Math.max(...groupOrders) + 1;

    const inst = document.createElement("a-entity");
    inst.setAttribute("class", "lightstick-instance");
    inst.setAttribute("position", `${pos.x.toFixed(3)} ${y.toFixed(3)} ${pos.z.toFixed(3)}`);
    inst.setAttribute("scale", `${scale} ${scale} ${scale}`);
    inst.setAttribute("rotation", `${rot.x.toFixed(1)} ${rot.y.toFixed(1)} ${rot.z.toFixed(1)}`);

    const group = document.createElement("a-entity");
    group.setAttribute("class", "lod-mesh-group");
    group.setAttribute("visible", "true");

    // Halo sphere: a glow aura that fades with the LICHT thresholds and billboards.
    const halo = document.createElement("a-entity");
    halo.setAttribute("class", "lod-mesh");
    halo.setAttribute("gltf-model", "#HaloSphere");
    halo.setAttribute("position", "0 0.05 0"); // nudge the glow aura slightly up
    halo.setAttribute("scale", "1 1 1");
    halo.setAttribute("material", "opacity:0.1");
    halo.setAttribute("render-order", String(haloOrder));
    halo.setAttribute("unlit-material", "");
    halo.setAttribute("data-lod-near", near);
    halo.setAttribute("data-lod-far", far);
    halo.setAttribute("billboard", "");
    group.appendChild(halo);

    def.meshes.forEach((meshId: string, i: number) => {
      const m = document.createElement("a-entity");
      m.setAttribute("class", "lod-mesh");
      m.setAttribute("gltf-model", `#${meshId}`);
      m.setAttribute("render-order", String(bodyOrders[i]));
      group.appendChild(m);
    });

    // LICHT: the glowing part, flat-lit and on the global custom near/far.
    const licht = document.createElement("a-entity");
    licht.setAttribute("class", "lod-mesh");
    licht.setAttribute("gltf-model", `#${def.licht}`);
    licht.setAttribute("render-order", String(lichtOrder));
    licht.setAttribute("unlit-material", "");
    licht.setAttribute("data-lod-near", near);
    licht.setAttribute("data-lod-far", far);
    group.appendChild(licht);

    inst.appendChild(group);

    // Billboard stand-in that cross-fades in as the detailed group fades out.
    const bb = document.createElement("a-entity");
    bb.setAttribute("class", "lod-billboard");
    bb.setAttribute("gltf-model", `#${def.png}`);
    bb.setAttribute("render-order", String(pngOrder));
    bb.setAttribute("billboard", "");
    bb.setAttribute("unlit-material", "");
    inst.appendChild(bb);

    // lod-object goes on last: its init queries the children built above, and A-Frame
    // initialises children before the parent, so they're all present by then.
    inst.setAttribute("lod-object", `nearDistance: ${lodNear}; farDistance: ${lodFar}`);

    return inst;
  }
} as ComponentDefinition;