import type { ComponentDefinition } from "aframe";

// Scatters clones of one or more referenced entities across a rectangular
// area, using Poisson-disk (Bridson) sampling so both a minimum AND maximum
// spacing between neighbours are honoured exactly.
//
//   <a-entity id="propA" ...></a-entity>
//   <a-entity id="propB" ...></a-entity>
//
//   <a-entity random-field="
//     items: #propA, #propB;
//     areaWidth: 20; minDistance: 2.5; maxDistance: 6; copies: 3
//   "></a-entity>
//
// `items` is a plain CSS selector list (A-Frame's `selectorAll` schema type
// — a comma-separated list of ids works directly), so it can reference ANY
// entity: a single mesh, or a whole hand-authored parent/child bundle (e.g.
// an [lod-object] group with its own billboard — see
// guides/LOD-BILLBOARD-FEATURE-GUIDE.md). This component only clones and places —
// it knows nothing about what's inside what it's cloning, and doesn't touch
// LOD, render order, or motion at all; combine those separately by
// authoring them directly on your referenced entity/entities (see
// guides/RANDOM-FIELD-FEATURE-GUIDE.md) or by adding [proximity-wave-group] on
// this same entity once the field is built (see
// guides/PROXIMITY-WAVE-FEATURE-GUIDE.md).
//
// Once cloned, each referenced entity is hidden (`visible: false`) so it
// doesn't ALSO render at wherever you happened to author it — only the
// placed clones are shown.
//
// Placement is a FIXED-WIDTH strip on the ground (XZ plane) by default:
// `areaWidth` is centred on this entity's own origin so it extends equally
// left/right. With no `areaDepth` set (0, the default), depth grows
// automatically away from the viewer (into -Z) to fit however many clones
// there are, so min/maxDistance always hold exactly regardless of `copies`.
//
// Setting `areaDepth` > 0 switches to a BOUNDED `areaWidth`×`areaDepth`
// rectangle instead, centred on this entity's own origin in both X and Z
// (s. AN ALLE! projects/an-alle/concepts/zufallsverteilung-lod.md,
// "Verteilungsmodell — Version 2" — needed there so the field's footprint
// stays within a printed image target's own bounds instead of growing
// indefinitely). The bounded rectangle uses a DIFFERENT placement
// algorithm than the unbounded strip: a jittered grid instead of
// Poisson-disk (s. the same file, "Platzierungsalgorithmus — Version 3",
// 31.08.2026 — Poisson-disk left visible gaps/uneven coverage across a
// fixed footprint), controlled by `randomness`/`boundingBoxRadius` below
// instead of `minDistance`/`maxDistance` (those two stay unbounded-only).
interface Point {
  x: number;
  z: number;
}

export default {
  schema: {
    // Entities to clone into the field — a CSS selector list, e.g.
    // "#propA, #propB". Each is cloned `copies` times and hidden once cloned.
    items: { type: "selectorAll" },

    areaWidth: { type: "number", default: 20 }, // fixed width along X, centred on origin
    // 0 (default) = unbounded strip, depth grows in -Z as needed (legacy
    // behaviour). > 0 = bounded areaWidth × areaDepth rectangle, centred on
    // origin in both X and Z — see the header comment above.
    areaDepth: { type: "number", default: 0 },

    elevation: { type: "number", default: 0 }, // base Y height of every clone
    elevationVariation: { type: "number", default: 0 }, // ± random offset from `elevation`

    // Each clone is rotated around Y by a random angle in [-yawMax, +yawMax]
    // degrees, ADDED to that clone's own authored Y rotation. 180 (default)
    // = fully random heading; smaller values keep clones pointing roughly
    // the way their source entity already faced; 0 = no extra spin.
    yawMax: { type: "number", default: 180 },

    // X and Z each get an independent random tilt whose magnitude is a
    // random value in [tiltMin, tiltMax] degrees (± direction), ADDED to
    // that clone's own authored X/Z rotation. Both 0 (default) adds no tilt.
    tiltMin: { type: "number", default: 0 },
    tiltMax: { type: "number", default: 0 },

    // Spacing between any two clones (both honoured exactly). UNBOUNDED
    // strip only (areaDepth 0) — ignored in bounded mode, see
    // `randomness`/`boundingBoxRadius` below for that case instead.
    minDistance: { type: "number", default: 2.5 },
    maxDistance: { type: "number", default: 6 },

    // BOUNDED rectangle only (areaDepth > 0). 0 (default) = exact regular
    // grid, no jitter. 1 = every point at its full random offset. Values in
    // between linearly interpolate each point between its grid position and
    // that same random offset, so moving this alone (e.g. a live GUI
    // slider) eases toward/away from one fixed randomised layout rather
    // than re-rolling it.
    randomness: { type: "number", default: 0 },

    // BOUNDED rectangle only (areaDepth > 0). Shrinks each point's random-
    // offset radius by half this amount, so neighbouring bounding boxes
    // can't overlap even at randomness: 1. 0 (default) = offset radius is
    // the full half grid-spacing.
    boundingBoxRadius: { type: "number", default: 0 },

    // How many copies of EACH referenced entity (uniform across all of them).
    copies: { type: "int", default: 1 },

    // Minimum ground-plane (XZ) gap between two copies of the SAME
    // referenced entity. 0 (default) disables it. Only meaningful when
    // copies > 1; if the area is too tight to honour it for every copy,
    // placement degrades gracefully (spreads those copies as far apart as
    // it can) rather than failing.
    minCopyDistance: { type: "number", default: 0 },

    // Uniform multiplier on each clone's OWN authored scale (1 = unchanged).
    scale: { type: "number", default: 1 }
  },

  init() {
    const self = this as any;
    const data = self.data;

    const items: any[] = Array.from(data.items ?? []);
    if (!items.length) {
      console.warn("[random-field] `items` resolved to nothing; nothing placed");
      return;
    }

    const copies = Math.max(1, data.copies);
    // The full placement list: every referenced item repeated `copies`
    // times, then shuffled so copies end up scattered rather than clumped.
    const queue: any[] = [];
    for (let c = 0; c < copies; c++) queue.push(...items);
    self.shuffle(queue);

    const positions = self.samplePositions(queue.length, Math.max(0.0001, data.areaWidth));
    const placement = self.assignPositions(queue, positions, Math.max(0, data.minCopyDistance));

    const count = Math.min(queue.length, positions.length);
    for (let i = 0; i < count; i++) {
      const y = data.elevation + (Math.random() * 2 - 1) * data.elevationVariation;
      const rot = {
        x: self.randomTilt(),
        y: (Math.random() * 2 - 1) * data.yawMax,
        z: self.randomTilt()
      };
      const clone = self.cloneItem(queue[i], placement[i], y, rot);
      self.el.appendChild(clone);
    }

    // Hide the source entities now that they've been cloned from, so they
    // don't also render at wherever they happen to be authored.
    for (const item of items) item.setAttribute("visible", "false");
  },

  /**
   * Map each queued item to one of the sampled points (a permutation — every
   * point is used exactly once, so the field footprint is unchanged). When
   * minCopyDistance > 0, greedily pick for each item the first free point
   * that clears every already-placed copy of the SAME source entity by at
   * least that distance on the ground plane. If no free point qualifies
   * (area too tight for this many copies), fall back to the free point
   * farthest from the nearest same-source copy, so it degrades gracefully
   * rather than clumping. minCopyDistance <= 0 keeps the original 1:1 order.
   */
  assignPositions(queue: any[], positions: Point[], minCopyDistance: number): Point[] {
    const n = Math.min(queue.length, positions.length);
    const result: Point[] = new Array(n);

    if (minCopyDistance <= 0) {
      for (let i = 0; i < n; i++) result[i] = positions[i];
      return result;
    }

    const minSq = minCopyDistance * minCopyDistance;
    const used: boolean[] = new Array(positions.length).fill(false);
    const placedBySource = new Map<any, Point[]>();

    const nearestSameSourceSq = (p: Point, placed: Point[]): number => {
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
      const source = queue[i];
      const placed = placedBySource.get(source) ?? (placedBySource.set(source, []).get(source) as Point[]);

      let chosen = -1;
      for (let p = 0; p < positions.length; p++) {
        if (used[p]) continue;
        if (nearestSameSourceSq(positions[p], placed) >= minSq) {
          chosen = p;
          break;
        }
      }

      if (chosen === -1) {
        let bestSq = -1;
        for (let p = 0; p < positions.length; p++) {
          if (used[p]) continue;
          const d = nearestSameSourceSq(positions[p], placed);
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

  /** Fisher–Yates in place. */
  shuffle(arr: unknown[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },

  /**
   * A random tilt angle (degrees) for a single axis: magnitude picked
   * uniformly in [tiltMin, tiltMax], with a random sign so it tilts either
   * way. Returns 0 when no tilt is configured. Called once per axis so X
   * and Z get independent values.
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
   * Dispatches to whichever placement algorithm matches the current mode
   * (s. the file header comment): the BOUNDED `width`×`areaDepth`
   * rectangle (`areaDepth` > 0) uses a jittered grid (`gridPositions`); the
   * legacy UNBOUNDED strip (`areaDepth` 0, width bounded and centred on the
   * origin, depth unbounded and growing away from the viewer into -Z) uses
   * Poisson-disk (Bridson) sampling.
   */
  samplePositions(n: number, width: number): Point[] {
    const self = this as any;
    const depth = Math.max(0, self.data.areaDepth);
    if (depth > 0) return self.gridPositions(n, width, depth);

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
        if (c.x < -halfW || c.x > halfW) continue; // stay within the width
        if (c.z > 0) continue; // stay in front of the viewer, depth unbounded
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

    if (samples.length < n) {
      // Safety net: if the frontier ever stalls before `n` (e.g. width < minDistance),
      // keep placing straight back from the deepest point at maxDistance spacing.
      let z = 0;
      for (const p of samples) if (p.z < z) z = p.z;
      const step = Math.max(maxDist, minDist, 0.0001);
      while (samples.length < n) {
        z -= step;
        samples.push({ x: 0, z });
      }
    }

    // Centre on X so the field extends equally left/right.
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

  /**
   * Jittered-grid sample of `n` points inside a BOUNDED `width`×`depth`
   * rectangle centred on the origin (s. the file header comment and AN
   * ALLE! zufallsverteilung-lod.md, "Platzierungsalgorithmus — Version 3").
   * First lays out a REGULAR grid with a single spacing `d` shared by both
   * axes, sized so `cols × rows` covers at least `n` cells (excess trailing
   * cells, if any, are simply not used). Each grid point then gets ONE
   * fixed random offset, sampled uniformly over a disk of radius
   * `d/2 − boundingBoxRadius/2` (so neighbouring bounding boxes can't
   * overlap even at `randomness: 1`), and `randomness` (0–1) linearly
   * interpolates that point between its exact grid position (0) and that
   * same fixed offset (1) — moving `randomness` alone (e.g. a live GUI
   * slider) never re-rolls the offset, it only eases toward/away from one
   * fixed randomised layout. Edge cells get the same offset radius as
   * interior ones, so they CAN spill slightly outside `width`×`depth` at
   * high `randomness` — accepted, not clamped (s. the Version 3 decision).
   */
  gridPositions(n: number, width: number, depth: number): Point[] {
    const self = this as any;
    if (n <= 0 || width <= 0 || depth <= 0) return [];

    const cols = Math.max(1, Math.ceil(Math.sqrt((n * width) / depth)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const d = Math.min(width / cols, depth / rows);

    const boundingBoxRadius = Math.max(0, self.data.boundingBoxRadius);
    const jitterRadius = Math.max(0, d / 2 - boundingBoxRadius / 2);
    const randomness = Math.min(1, Math.max(0, self.data.randomness));

    const points: Point[] = [];
    for (let r = 0; r < rows && points.length < n; r++) {
      for (let c = 0; c < cols && points.length < n; c++) {
        let x = -width / 2 + d * (c + 0.5);
        let z = -depth / 2 + d * (r + 0.5);
        if (jitterRadius > 0 && randomness > 0) {
          const angle = Math.random() * Math.PI * 2;
          const rad = jitterRadius * Math.sqrt(Math.random()); // uniform over the disk's AREA
          x += randomness * Math.cos(angle) * rad;
          z += randomness * Math.sin(angle) * rad;
        }
        points.push({ x, z });
      }
    }

    return points;
  },

  /**
   * Deep-clones a referenced entity, composing the field-computed position/
   * rotation with whatever the source entity's OWN authored transform
   * already is — position is placed fresh (there's no meaningful "offset"
   * reading for where in the field something goes), but rotation/scale ADD
   * to the source's own values, so a source authored with e.g. a fixed
   * correction tilt or a non-default scale keeps that on every clone, with
   * the field's own randomization layered on top.
   */
  cloneItem(item: any, pos: Point, y: number, rot: { x: number; y: number; z: number }): Element {
    const clone = item.cloneNode(true) as any;
    clone.removeAttribute("id"); // clones must not duplicate the source's id

    // A-Frame doesn't keep an already-initialized component's DOM attribute in
    // sync with its live parsed data — cloneNode(true) only copies whatever's
    // literally still in the DOM at clone time, which for a component like
    // geometry/material (parsed once, not written back) can already be stale
    // by the time an entity's been sitting on the page. Verified directly: a
    // plain `geometry="primitive: cone; ..."` prop cloned by this component
    // came out as a default white 1x1x1 box, not a coloured cone — the clone's
    // OWN geometry/material components had silently fallen back to their
    // schema defaults. Re-applying every live component's current `.data`
    // (not the DOM attribute) onto the corresponding cloned element — for the
    // whole subtree, not just the root, since a clone of an [lod-object]
    // group carries its own nested geometry/material entities too — makes
    // every clone self-contained regardless of what the DOM attribute still
    // says. position/rotation/scale/visible are re-set again explicitly below
    // with the field-computed values, so copying them here first is harmless.
    const originalEls = [item, ...item.querySelectorAll("*")];
    const cloneEls = [clone, ...clone.querySelectorAll("*")];
    originalEls.forEach((originalEl: any, i: number) => {
      const cloneEl = cloneEls[i];
      const components = originalEl.components || {};
      Object.keys(components).forEach((name) => cloneEl.setAttribute(name, components[name].data));
    });

    clone.setAttribute("visible", "true"); // in case the source itself is hidden as a template

    const baseRot = item.getAttribute("rotation") || { x: 0, y: 0, z: 0 };
    const baseScale = item.getAttribute("scale") || { x: 1, y: 1, z: 1 };
    const scaleMul = (this as any).data.scale;

    clone.setAttribute("position", `${pos.x.toFixed(3)} ${y.toFixed(3)} ${pos.z.toFixed(3)}`);
    clone.setAttribute(
      "rotation",
      `${(baseRot.x + rot.x).toFixed(1)} ${(baseRot.y + rot.y).toFixed(1)} ${(baseRot.z + rot.z).toFixed(1)}`
    );
    clone.setAttribute(
      "scale",
      `${(baseScale.x * scaleMul).toFixed(4)} ${(baseScale.y * scaleMul).toFixed(4)} ${(baseScale.z * scaleMul).toFixed(4)}`
    );

    return clone;
  }
} as ComponentDefinition;
