#!/usr/bin/env -S npx tsx
// Photographs every model of the scene on its own — run via
// `npm run photo-models -- [options]`.
// Starts the stock-A-Frame preview (`vite`, no camera, no XR session) on a
// free port, opens it in headless Chromium (software WebGL), waits until
// every gltf-model has loaded, then for each model: hides all other models
// and every `.test-label` sign, frames it from the same view, and saves a
// screenshot. Made for documenting test series as image strips
// (`npm run photo-strip`).
//
// Rendering is the preview's (stock A-Frame 1.3.0, three r137 like the host),
// lit by the scene's own lights; no phone camera behind the model. Good for
// comparing shapes and textures, not for judging how a model sits in AR.
// See cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md.
import { parseArgs } from "node:util";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const USAGE = `Usage:
  npm run photo-models -- [options]

Options:
  --ids <a,b,c>     entity ids to photograph (default: every a-entity with gltf-model)
  --out <dir>       output folder (default generated-assets/photos), one <id>.png each
  --view <v>        three-quarter (default) | front | side
  --size <WxH>      screenshot size in px (default 900x1000)
  --root <dir>      project to serve (default this repo) — e.g. a git worktree with a test scene
  --timeout <s>     max. wait for all models to load (default 60)`;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      ids: { type: "string" },
      out: { type: "string" },
      view: { type: "string", default: "three-quarter" },
      size: { type: "string", default: "900x1000" },
      root: { type: "string" },
      timeout: { type: "string", default: "60" },
      help: { type: "boolean", default: false }
    }
  });
  if (values.help) { console.log(USAGE); return; }
  const view = values.view!;
  if (!["three-quarter", "front", "side"].includes(view)) fail("--view must be three-quarter, front or side.");
  const [width, height] = values.size!.split("x").map(Number);
  if (!(width > 0 && height > 0)) fail('--size must look like "900x1000".');
  const root = resolve(values.root ?? ROOT), out = resolve(values.out ?? join(ROOT, "generated-assets", "photos"));
  mkdirSync(out, { recursive: true });

  const server = await createServer({ root, configFile: join(root, "vite.config.ts"), logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) fail("The preview server didn't start.");
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", (e) => console.log(`  page error: ${e.message}`));
    await page.goto(url, { waitUntil: "load" });
    // wait until every model has its mesh (or the timeout)
    await page.waitForFunction(() => {
      const els = [...document.querySelectorAll("a-entity[gltf-model]")] as any[];
      return els.length > 0 && els.every((e) => e.getObject3D("mesh"));
    }, undefined, { timeout: +values.timeout! * 1000 }).catch(() => console.log("  not every model loaded in time — photographing what's there"));
    await page.waitForTimeout(3000); // place-in-front may still move #scene-root right after loading
    const ids: string[] = values.ids
      ? values.ids.split(",").map((s) => s.trim()).filter(Boolean)
      : await page.evaluate(() => [...document.querySelectorAll("a-entity[gltf-model]")].map((e) => e.id).filter(Boolean));
    if (!ids.length) fail("No models found (no a-entity with gltf-model and an id).");
    // the preview's info box and every test sign stay out of the pictures
    await page.evaluate(() => {
      for (const d of document.querySelectorAll("body div")) if ((d.textContent ?? "").trim().startsWith("AR Module Preview") && !d.querySelector("a-scene, canvas")) (d as HTMLElement).style.visibility = "hidden";
      document.querySelectorAll(".test-label").forEach((e: any) => { if (e.object3D) e.object3D.visible = false; });
    });
    const frame = (id: string) => page.evaluate(([id, view]) => {
      const target = document.querySelector(`a-entity#${CSS.escape(id)}`) as any;
      if (!target?.object3D) return false;
      document.querySelectorAll("a-entity[gltf-model]").forEach((e: any) => { e.object3D.visible = e === target; });
      const T = (window as any).AFRAME.THREE, box = new T.Box3().setFromObject(target.object3D);
      const rootEl = document.getElementById("scene-root") as any;
      const q = rootEl?.object3D ? rootEl.object3D.getWorldQuaternion(new T.Quaternion()) : new T.Quaternion();
      const z = new T.Vector3(0, 0, 1).applyQuaternion(q), x = new T.Vector3(1, 0, 0).applyQuaternion(q);
      const dir = view === "front" ? z : view === "side" ? x : z.clone().multiplyScalar(0.8).add(x.clone().multiplyScalar(0.6)).normalize();
      const c = box.getCenter(new T.Vector3()), s = box.getSize(new T.Vector3());
      const cam = document.querySelector("a-camera, [camera]") as any;
      cam.setAttribute("look-controls", "enabled: false");
      const p = c.clone().addScaledVector(dir, s.y * 1.05);
      p.y += s.y * 0.35;
      cam.object3D.position.copy(cam.object3D.parent.worldToLocal(p));
      cam.object3D.lookAt(c);
      cam.object3D.rotateY(Math.PI); // lookAt points a group's +z at the target; the camera looks along -z
      return true;
    }, [id, view] as const);
    for (const id of ids) {
      // framed twice: the first pass can still see a bounding box from before the last scene update
      if (!(await frame(id))) { console.log(`  ${id}: not found, skipped`); continue; }
      await page.waitForTimeout(500);
      await frame(id);
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(out, `${id}.png`) });
      console.log(`  ${id}.png`);
    }
    console.log(`\nwritten to ${out}\n`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
