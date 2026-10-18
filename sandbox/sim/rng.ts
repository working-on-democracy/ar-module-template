// Seeded random numbers (mulberry32): the same seed gives the same run.

export interface Rng {
  next(): number; // 0 ≤ x < 1
  range(lo: number, hi: number): number;
  /** value × (1 ± variance), uniformly. */
  vary(value: number, variance: number): number;
  /** true with the probability that a Poisson event with `ratePerDay` happens within `days`. */
  chance(ratePerDay: number, days: number): boolean;
  /** Current internal state, to continue a run later. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    vary: (value, variance) => value * (1 + variance * (next() * 2 - 1)),
    chance: (ratePerDay, days) => next() < 1 - Math.exp(-ratePerDay * days),
    state: () => s,
  };
}
