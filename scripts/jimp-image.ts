// Texture work in plain JavaScript (jimp), shared by stylize-glb.ts and
// glb-texture-crush.ts. No native library: runs where sharp's prebuilt
// libvips does not (older glibc, e.g. the CentOS 7 Uberspace host).
// Pixels are handled as RGBA bitmaps; decoding PNG/JPEG and encoding PNG/JPEG
// come from jimp, the rest (shrinking, saturation, chroma subsampling) is done
// here so the result does not depend on jimp's own filters.
import { Jimp } from "jimp";

export interface Bitmap { data: Buffer; width: number; height: number }

/** Decodes a PNG or JPEG texture. */
export async function decodeImage(bytes: Uint8Array): Promise<Bitmap> {
  const img = await Jimp.read(Buffer.from(bytes));
  return { data: Buffer.from(img.bitmap.data), width: img.bitmap.width, height: img.bitmap.height };
}

export async function encodePng(b: Bitmap): Promise<Uint8Array> {
  return new Uint8Array(await Jimp.fromBitmap(b).getBuffer("image/png"));
}

export async function encodeJpeg(b: Bitmap, quality: number): Promise<Uint8Array> {
  return new Uint8Array(await Jimp.fromBitmap(b).getBuffer("image/jpeg", { quality }));
}

/** Shrinks to fit inside max × max (never enlarges) by averaging every source
 *  pixel into the target pixels it covers, so colours stay right. */
export function shrinkInside(b: Bitmap, max: number): Bitmap {
  const scale = Math.min(1, max / b.width, max / b.height);
  if (scale >= 1) return b;
  const w = Math.max(1, Math.round(b.width * scale)), h = Math.max(1, Math.round(b.height * scale));
  const sum = new Float64Array(w * h * 4), weight = new Float64Array(w * h);
  const fx = w / b.width, fy = h / b.height;
  for (let y = 0; y < b.height; y++) {
    // a source pixel may straddle two target rows/columns: split it by area
    const y0 = y * fy, y1 = (y + 1) * fy;
    for (let x = 0; x < b.width; x++) {
      const x0 = x * fx, x1 = (x + 1) * fx, s = (y * b.width + x) * 4;
      for (let ty = Math.floor(y0); ty < Math.min(h, Math.ceil(y1)); ty++) {
        const wy = Math.min(y1, ty + 1) - Math.max(y0, ty);
        for (let tx = Math.floor(x0); tx < Math.min(w, Math.ceil(x1)); tx++) {
          const a = wy * (Math.min(x1, tx + 1) - Math.max(x0, tx)), t = ty * w + tx;
          for (let c = 0; c < 4; c++) sum[t * 4 + c] += b.data[s + c] * a;
          weight[t] += a;
        }
      }
    }
  }
  const data = Buffer.alloc(w * h * 4);
  for (let t = 0; t < w * h; t++) for (let c = 0; c < 4; c++) data[t * 4 + c] = Math.round(sum[t * 4 + c] / weight[t]);
  return { data, width: w, height: h };
}

/** More (amount > 1) or less saturated, about each pixel's luma (Rec. 709). */
export function saturateBitmap(b: Bitmap, amount: number): Bitmap {
  const data = Buffer.from(b.data);
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.max(0, Math.round(l + (data[i + c] - l) * amount)));
  }
  return { ...b, data };
}

/** 4:2:0 chroma subsampling (the colour of every 2×2 block averaged, brightness
 *  kept per pixel), as a JPEG encoder with subsampling does: colour bleeds
 *  across edges. jimp's encoder keeps full chroma, so this is done first. */
export function subsampleChroma(b: Bitmap): Bitmap {
  const data = Buffer.from(b.data), { width: w, height: h } = b;
  for (let by = 0; by < h; by += 2) for (let bx = 0; bx < w; bx += 2) {
    let cb = 0, cr = 0, n = 0;
    for (let y = by; y < Math.min(h, by + 2); y++) for (let x = bx; x < Math.min(w, bx + 2); x++) {
      const i = (y * w + x) * 4, [r, g, bl] = [data[i], data[i + 1], data[i + 2]];
      cb += -0.168736 * r - 0.331264 * g + 0.5 * bl; cr += 0.5 * r - 0.418688 * g - 0.081312 * bl; n++;
    }
    cb /= n; cr /= n;
    for (let y = by; y < Math.min(h, by + 2); y++) for (let x = bx; x < Math.min(w, bx + 2); x++) {
      const i = (y * w + x) * 4, l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = clamp(l + 1.402 * cr); data[i + 1] = clamp(l - 0.344136 * cb - 0.714136 * cr); data[i + 2] = clamp(l + 1.772 * cb);
    }
  }
  return { ...b, data };
}

const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
