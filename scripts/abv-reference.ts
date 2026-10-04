#!/usr/bin/env -S npx tsx
// Augmented Bahnhofsviertel reference screenshots — `npm run abv:reference -- <NN> [legacy|port]`.
//
// Captures a work headless (Playwright, emulated iPhone, a moving image as
// fake camera — see cross-feature-reference-docs/HEADLESS-AR-TESTING-GUIDE.md),
// so the original 8th Wall version and the port can be compared under the
// same conditions:
//
//   legacy (default)  builds the old export in Projektordner_alt/<legacyFolder>/
//                     (one shared `npm install` in Projektordner_alt/, all 22
//                     exports have the identical package.json/webpack config),
//                     serves its dist/ on localhost and captures it.
//   port              starts this repo's `dev:ar` server (current branch) and
//                     captures that.
//
// Writes augmented-bahnhofsviertel/about/<NN>-<slug>/reference-<mode>.jpg
// (after pressing the start button / tapping mid-screen) and
// reference-<mode>-before-tap.jpg. Prints console errors.
//
// What this does NOT show (see the testing guide): real SLAM behaviour (the
// camera is a flat video), real-GPU rendering (SwiftShader), true scale.
// It does show whether the scene loads and renders, and roughly how it looks.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, copyFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LEGACY_DIR = join(ROOT, "augmented-bahnhofsviertel/Projektordner_alt");
const ABOUT_DIR = join(ROOT, "augmented-bahnhofsviertel/about");
const LEGACY_PORT = 5301;
const PORT_PORT = 5199;

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  ".wasm": "application/wasm", ".woff": "font/woff", ".ttf": "font/ttf", ".tflite": "application/octet-stream"
};

// Rewrites `assets/<name>.gltf` references that point at a bundle folder to
// the .gltf file inside it, in body.html and every .js/.ts outside assets/.
function patchBundleRefs(srcDir: string): void {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        if (f !== "assets") walk(p);
      } else if (/\.(html|js|ts)$/.test(f)) files.push(p);
    }
  };
  walk(srcDir);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const patched = text.replace(/((?:\.\/)?assets\/(?:[^"'\s]*\/)?)([^"'\s/]+\.gltf)(?=["'\s])/g, (m, dir: string, name: string) => {
      const folder = join(srcDir, dir.replace(/^\.\//, ""), name);
      if (!existsSync(folder) || !statSync(folder).isDirectory()) return m;
      const inner = readdirSync(folder).filter((f) => f.endsWith(".gltf"));
      const pick = inner.includes(name) ? name : inner.length === 1 ? inner[0] : null;
      return pick ? `${dir}${name}/${pick}` : m;
    });
    if (patched !== text) writeFileSync(file, patched);
  }
}

function fail(msg: string): never {
  console.error(`abv-reference: ${msg}`);
  process.exit(1);
}

const [numArg, modeArg = "legacy"] = process.argv.slice(2);
if (!numArg || !/^\d+$/.test(numArg) || !["legacy", "port"].includes(modeArg)) {
  fail("usage: npm run abv:reference -- <NN> [legacy|port]");
}
const mode = modeArg as "legacy" | "port";
const works = JSON.parse(readFileSync(join(ROOT, "augmented-bahnhofsviertel/works.json"), "utf8")).works;
const work = works.find((w: any) => w.num === Number(numArg));
if (!work) fail(`no work #${numArg} in works.json`);
const aboutDir = join(ABOUT_DIR, `${String(work.num).padStart(2, "0")}-${work.slug}`);

// ---------------------------------------------------------- fake camera
// Neutral, feature-rich grey noise drifting slowly like a hand-held phone,
// so the engine has something to track. Deliberately NOT the work's marker
// image: those are photos of the AR work itself, which would make it
// impossible to tell rendered 3D content from the camera picture.
const video = join(tmpdir(), `abv-reference-${work.num}.y4m`);
execFileSync("ffmpeg", [
  "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "nullsrc=s=1000x1300:r=30:d=12,geq=lum='96+64*random(1)':cb=128:cr=128,boxblur=2",
  "-filter_complex",
  "[0:v]crop=720:960:x='140+60*sin(2*PI*t/6)':y='170+60*cos(2*PI*t/6)',format=yuv420p",
  video
]);

// --------------------------------------------------------------- target
let server: Server | null = null;
let devServer: ChildProcess | null = null;
let url: string;

if (mode === "legacy") {
  if (!work.legacyFolder) fail(`#${work.num} has no legacy export`);
  const project = join(LEGACY_DIR, work.legacyFolder);
  if (!existsSync(join(LEGACY_DIR, "node_modules"))) {
    copyFileSync(join(project, "package.json"), join(LEGACY_DIR, "package.json"));
    execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: LEGACY_DIR, stdio: "inherit" });
  }
  // Build from a patched copy, never in the original export: the exporter
  // turned glTF bundles into folders (`assets/x.gltf/x.gltf`) but left the
  // scene pointing at the folder, which webpack can't resolve (see the
  // export's README). The copy lives under Projektordner_alt/ so it finds the
  // shared node_modules and stays gitignored.
  const build = join(LEGACY_DIR, ".reference-build", work.legacyFolder);
  if (!existsSync(join(build, "dist/index.html"))) {
    rmSync(build, { recursive: true, force: true });
    cpSync(project, build, { recursive: true, filter: (src) => !src.includes(`${project}/dist`) });
    patchBundleRefs(join(build, "src"));
    execFileSync(join(LEGACY_DIR, "node_modules/.bin/webpack"), ["--config", "config/webpack.config.js"], {
      cwd: build,
      stdio: ["ignore", "ignore", "inherit"]
    });
  }
  const dist = join(build, "dist");
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    let file = join(dist, path);
    if (!file.startsWith(dist)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server!.listen(LEGACY_PORT, "127.0.0.1", r));
  url = `http://127.0.0.1:${LEGACY_PORT}/`; // localhost is a secure context, camera allowed
} else {
  devServer = spawn(join(ROOT, "node_modules/.bin/vite"), ["--mode", "ar", "--port", String(PORT_PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("dev:ar server did not start")), 60000);
    devServer!.stdout!.on("data", (d) => {
      if (String(d).includes("Local:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    devServer!.on("exit", (code) => reject(new Error(`dev:ar server exited (${code})`)));
  });
  url = `https://localhost:${PORT_PORT}/ar.html`;
}

// -------------------------------------------------------------- capture
const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${video}`,
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist"
  ]
});
const errors: string[] = [];
try {
  const ctx = await browser.newContext({ ...devices["iPhone 15 Pro"], ignoreHTTPSErrors: true, permissions: ["camera"] });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`error: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  await page.goto(url);
  await page.waitForTimeout(8000);
  await page.screenshot({ path: join(aboutDir, `reference-${mode}-before-tap.jpg`), type: "jpeg", quality: 75 });
  // Old works show a "Start" button (some after an audio/video unlock tap);
  // press whatever start-like control is visible, else tap mid-screen.
  for (let i = 0; i < 2; i++) {
    const start = page.getByText(/^\s*start\s*$/i).first();
    if (await start.isVisible().catch(() => false)) await start.click().catch(() => {});
    else await page.mouse.click(196, 426);
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(15000);
  await page.screenshot({ path: join(aboutDir, `reference-${mode}.jpg`), type: "jpeg", quality: 75 });
} finally {
  await browser.close();
  server?.close();
  devServer?.kill();
  rmSync(video, { force: true });
}

console.log(`Saved ${join(aboutDir, `reference-${mode}.jpg`).replace(ROOT, "")} (+ -before-tap)`);
console.log(errors.length ? `Console errors:\n${errors.join("\n")}` : "No console errors.");
