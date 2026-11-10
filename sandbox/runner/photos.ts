// A photo as an object shows it, made on first request (server-side, as planned):
// saturated for the object's changes since it took the photo, then crushed for
// its crush level. Kept in the run folder's photos/ (<id>-0.jpg is the photo itself).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Params } from "../params";
import { decodeImage, encodeJpeg, saturateBitmap, subsampleChroma } from "../../scripts/jimp-image";

export async function photoFile(runDir: string, params: Params, id: string, level: number, changes = 0): Promise<string | null> {
  const base = join(runDir, "photos", `${id}-0.jpg`);
  if (!existsSync(base)) return null;
  if (level <= 0 && changes <= 0) return base;
  const file = join(runDir, "photos", `${id}-${level}${changes > 0 ? `-s${changes}` : ""}.jpg`);
  if (!existsSync(file)) {
    let buf: Uint8Array = readFileSync(base);
    const amount = Math.min(params.photoSaturateMax, Math.pow(params.photoSaturatePerChange, changes));
    if (changes > 0) buf = await encodeJpeg(saturateBitmap(await decodeImage(buf), amount), 90);
    const q = [30, 15, 8, 4, 2][Math.min(5, Math.max(1, level)) - 1];
    for (let i = 0; i < level; i++) buf = await encodeJpeg(subsampleChroma(await decodeImage(buf)), q);
    writeFileSync(file, buf);
  }
  return file;
}
