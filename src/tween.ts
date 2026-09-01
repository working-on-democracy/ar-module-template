// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md, "Tutorial-Animation"
// decision, 31.08.2026) — plain TS helper, not an A-Frame component (same
// "no A-Frame" pattern as swipe-drag.ts/asset-loading-overlay.ts), since
// this only needs to drive plain Vue refs over time, not anything on an
// entity's own transform.
import type { Ref } from "vue";

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Animates `target.value` from `from` to `to` over `durationMs`, eased
// (standard ease-in-out). Resolves once the animation completes.
//
// Writes to `target.value` are THROTTLED to at most once per
// `minCommitIntervalMs` (default 80ms, ~12/s) rather than every animation
// frame — this drives ArModule.vue's `fieldSizePercent`/`density` refs,
// each of which triggers a full field regeneration (random-field
// unmount/remount, s. ArModule.vue's `fieldKey`) on every change; writing
// at 60fps would remount up to ~196 clones that often, which is far too
// expensive to stay smooth on a phone. The eased timing math itself still
// runs every frame (cheap), only the actual ref write is throttled, so the
// animation's SHAPE stays exactly as eased regardless of the throttle.
export function animateValue(
  target: Ref<number>,
  from: number,
  to: number,
  durationMs: number,
  minCommitIntervalMs = 80
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let lastCommit = 0;

    function step(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, durationMs > 0 ? elapsed / durationMs : 1);
      const eased = easeInOutQuad(t);
      const done = t >= 1;
      if (done || now - lastCommit >= minCommitIntervalMs) {
        target.value = from + (to - from) * eased;
        lastCommit = now;
      }
      if (done) resolve();
      else requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}

// AN ALLE! Zwischen-Basis (archive-of-practice
// projects/an-alle/concepts/zwischen-basis.md) — extracted from
// animationssystem-wanderer's own ArModule.vue (01.09.2026), where it was
// needed for a resettable tutorial lead-in ("wenn die erste Bilderkennung
// innerhalb der ersten Sekunden abgebrochen wird, wird das Tutorial
// zurückgesetzt"). animateValue above can't be used for that: its own
// rAF loop keeps writing toward `to` for the FULL fixed duration
// regardless of anything else, so a cancellation check only after
// `await`-ing it is too late — the fade would already have finished
// playing out. This checks `isCancelled()` every frame instead, resolving
// `false` (without ever reaching `to`) the instant it starts returning
// true, or `true` on a normal, uninterrupted finish. Generic over
// whatever cancellation condition the caller wants to use (e.g. an
// incrementing "run token" no longer matching the value captured when the
// fade started) — no fixed token concept baked in here.
export function cancellableFade(
  target: Ref<number>,
  from: number,
  to: number,
  durationMs: number,
  isCancelled: () => boolean
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now: number) {
      if (isCancelled()) {
        resolve(false);
        return;
      }
      const t = Math.min(1, durationMs > 0 ? (now - start) / durationMs : 1);
      target.value = from + (to - from) * t;
      if (t >= 1) {
        resolve(true);
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
