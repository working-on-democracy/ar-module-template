// Deterministic pseudo-random float in [0, 1) — same `seed` always returns
// the same value, unlike `Math.random()`. Shared by random-field.ts's
// bounded-grid jitter (Version 3, 31.08.2026) and proximity-swing.ts's own
// per-node swing direction (31.08.2026) — both need a placed object's
// "random" value to depend only on its own stable grid index, not on
// re-rolling every time the containing field regenerates (a density/field-
// size swipe forces a full unmount/remount of every placed clone, s.
// ArModule.vue's `fieldKey` — without this, EVERY swipe would scatter a
// brand new random arrangement instead of the same one shifting only when
// the actual row/column count changes).
export function seededRandom(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
