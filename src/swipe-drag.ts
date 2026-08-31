// AN ALLE! Zufallsverteilung & LOD (archive-of-practice
// projects/an-alle/concepts/zufallsverteilung-lod.md, "Swipe statt Regler"
// decision, 31.08.2026) — plain DOM/Vue helper, not an A-Frame component
// (same "no A-Frame" pattern as asset-loading-overlay.ts), since this only
// needs to drive plain Vue refs (density/field size), not anything on an
// entity's own transform.
//
// document-level pointerdown/pointermove/pointerup, not element-scoped —
// same reasoning as ar-button-manager.ts's own document-level tap
// listeners (a drag that leaves the element bounds must still keep
// delivering pointermove). A drag only STARTS if pointerdown landed on the
// AR canvas itself (`e.target.tagName === "CANVAS"`, identical guard to
// ar-button-manager.ts) — 2D UI overlays (e.g. InfoOverlay.vue's small info
// button) are real DOM elements with their own click handlers and are
// never the pointerdown target for a canvas drag, so they're unaffected
// without any extra bookkeeping.
//
// Reports RELATIVE pixel deltas (this tick's pointer position minus last
// tick's), not absolute position — deliberately, so the caller's value
// isn't pinned to a fixed screen-space range the way the slider GUI it
// replaces was (the actual complaint that prompted this: sliders were hard
// to operate and got stuck at their extremes). Any number of short drags
// in the same direction keep accumulating; there's no track to run out of.
export function attachSwipeDrag(onDeltaX: (px: number) => void, onDeltaY: (px: number) => void): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (!e.target || (e.target as HTMLElement).tagName !== "CANVAS") return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx !== 0) onDeltaX(dx);
    if (dy !== 0) onDeltaY(dy);
  };

  const onPointerEnd = () => {
    dragging = false;
  };

  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerEnd);
  document.addEventListener("pointercancel", onPointerEnd);

  return () => {
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerEnd);
    document.removeEventListener("pointercancel", onPointerEnd);
  };
}
