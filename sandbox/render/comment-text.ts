// A comment's text as the platform draws it (ar-demo-backend,
// frontend/external/aframe/canvas-text.js, checked at 0651352): bold
// "NeueMontreal, Helvetica" on a canvas, wrapped at word boundaries, the font
// shrunk by 10 % at a time until every line and the longest word fit; white on
// transparent, so it serves as an alpha map that takes any colour. The
// platform does not ship NeueMontreal, so in practice it is Helvetica Bold.
export const COMMENT_FONT = "NeueMontreal,Helvetica";

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** On an object the text is this share of the size that would fill the frame (a plate: 1). */
export const COMMENT_ON_OBJECT_SCALE = 0.5;
/** … and lets the object show through a little. */
export const COMMENT_ON_OBJECT_OPACITY = 0.7;

/** The text on a canvas of the given aspect (width / height): as large as it fits,
 *  times `scale` (smaller text wraps into longer lines, centred). */
export function commentCanvas(text: string, aspect: number, size = 512, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(aspect >= 1 ? size : size * aspect);
  canvas.height = Math.round(aspect >= 1 ? size / aspect : size);
  const ctx = canvas.getContext("2d")!;
  const pad = canvas.width * 0.04, width = canvas.width - 2 * pad;
  const longest = text.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "") || "0";
  let fs = canvas.height / 2, lines: string[] = [];
  for (;;) {
    ctx.font = `700 ${fs}px ${COMMENT_FONT}`;
    lines = wrap(ctx, text, width);
    if ((lines.length * fs * 1.3 <= canvas.height - 2 * pad && ctx.measureText(longest).width <= width) || fs < 6) break;
    fs *= 0.9;
  }
  if (scale !== 1) { fs *= scale; ctx.font = `700 ${fs}px ${COMMENT_FONT}`; lines = wrap(ctx, text, width * scale); }
  ctx.fillStyle = "white";
  ctx.textBaseline = "alphabetic";
  const top = (canvas.height - lines.length * fs * 1.3) / 2;
  const left = pad + (width - Math.max(...lines.map((l) => ctx.measureText(l).width))) / 2; // the block centred
  lines.forEach((l, i) => ctx.fillText(l, left, top + fs * 0.95 + i * fs * 1.3));
  return canvas;
}
