# AGENTS.md — entry point for an AI agent working on the `plant` branch

Machine-oriented onboarding doc. Read it fully before changing anything.

## 1. What this branch is

`plant` (repo `working-on-democracy/ar-module-template`, branched from `main`)
holds the **plant** ("Pflanze") for the an-alle.net platform: a deterministic
simulation of an ecosystem of 3D objects, the GLB scripts that compute every
change to an object, a local sandbox (server + three.js viewer + lifecycle
page), its documentation, and the AR-module template baseline (`lib/`, `src/`,
`npm run dev:ar`) kept for AR tests on phones. All template features,
examples, guides and assets the plant does not use were removed (they live on
`feature_template`); `grain-shimmer` stays, it is a fixed part of the plant's
look.
History of the work so far: branches `ai-asset-tools` and `plant-sandbox`
(archive, read-only).

The plant is a **platform feature**, not an AR module: on the platform the
simulation runs server-side (the platform's backend repo is private; ask the
user for access, read-only unless asked) and the host app renders
it. `src/ArModule.vue` here is only a vehicle for local AR tests.

## 2. Read order

1. `README.md` — what lives where, quick start, next steps.
2. `sandbox/docs/PHASEN.md`, `sandbox/docs/ZEITMASSSTAB-UND-BOOSTS.md` and
   `sandbox/docs/PFLANZMODUS.md` (the planting scene) —
   how the simulation behaves (German).
3. `sandbox/docs/AR-TESTUMGEBUNG.md` before touching `src/ArModule.vue`,
   `src/plant-live.ts` or `lib/preview-ar.ts`: the AR test scene, how close it is to the
   host app, the three r137 / Safari pitfalls, a second test setup (German).
4. `sandbox/docs/SCHNITTSTELLEN.md` — the contract between server and AR app
   (`/api/plant` in the sandbox, `plantNearby` on the server) and between
   simulation and compute service (German). Change it only deliberately: the
   admin builds against it.
5. `sandbox/docs/TECHNISCHE-VORAUSSETZUNGEN.md`, `sandbox/docs/ADMIN-AUFGABEN.md`,
   `sandbox/SERVER-OFFENE-PUNKTE.md` — server/platform side (German).
6. `cross-feature-reference-docs/AI-ASSET-GENERATION-GUIDE.md` before touching
   any `scripts/glb-*`, `stylize-glb`, `sloyd-generate`.
7. `cross-feature-reference-docs/ASSET-COMPRESSION-GUIDE.md` before compressing
   anything for delivery.
8. `cross-feature-reference-docs/AR-MODULE-TEMPLATE.md` before touching `lib/`,
   `src/`, `vite.config.ts` or the AR previews.

## 3. Layout

```
sandbox/sim/          simulation core (world.ts rules, schedule.ts clock, types, recipes, pose, rng, abstract-jobs)
sandbox/params.ts     every simulation parameter with its default
sandbox/scenarios/    starter models (starter-models.json, DEFAULT_STARTERS) + scenario generator
sandbox/runner/       runs JobRequests with the real scripts (jobs.ts), reads GLB info
sandbox/server.ts     sandbox server: waits for a planting (POST /api/planting) unless --replay / --ohne-pflanzen / --values with plants;
                      speed, tape (tape.jsonl), replay, viewer API (/api/state, /api/frames, /api/cmd), interface 1 (/api/plant)
sandbox/objects/      new objects from the upload page (viewer/objekte.html): Sloyd (sloydFaces/sloydTexture), working version
                      (originMaxTriangles), local catalog, Keimling variants computed ahead while the run is idle (into the copy cache)
sandbox/objects/access.ts  who may make objects: an access code through the Sloyd broker (proxy/) or our own key in .env.local;
                      a participant code plants only its own objects (catalog scoped in server.ts)
proxy/                Sloyd broker (Cloudflare Worker + admin page for access codes, KV): holds the Sloyd key, counts objects per
                      code, fixes faces/texture; deploy with wrangler (sandbox/docs/WORKSHOP.md). Never put the Sloyd key in the repo
                      (public) or in anything participants get.
sandbox/planting/     planting scene shared by viewer and AR test scene: rules.ts (also checked by the server), scene.ts, ui.ts (inline-styled DOM)
sandbox/render/       rendering shared by viewer and AR test scene: photo-layer.ts (photo projection + shadow), comment-layer.ts + comment-text.ts
                      (comment text, the platform's font), stroke-tube.ts (drawings as the platform draws them); three.js is passed in
                      (npm three in the viewer, 8frame's r137 in AR): use only what both have
sandbox/viewer/       three.js viewer, buffered playback
sandbox/lifecycle-page/  lifecycle calculator (same sim, plain-number jobs), built to a single HTML file
sandbox/models/       starter .glb models (from Sloyd, uncompressed)
sandbox/test-photos/  public-domain (CC0) outdoor photos the sandbox uses as uploaded photos, sources in QUELLEN.md
sandbox/docs/         documentation (German), mirrored as online Claude Docs (links at the top of each)
scripts/              GLB tools; jimp-image.ts = texture work without native libs
src/, lib/            AR-module template baseline; src/ArModule.vue = the AR test scene (planting, then the live plant via src/plant-live.ts,
                      drawings from GET /api/strokes); dev:ar proxies /api and /run to the sandbox (PLANT_SANDBOX, default port 5180);
                      the AR preview runs 8th Wall with absolute scale and the host's lights, fog and renderer settings;
                      src/a-frame-components/grain-shimmer.ts = the plant's grain look
guides/, examples/    guide + example for grain-shimmer (the only template feature kept)
sandbox-runs/         gitignored: run folders + shared caches: fuse-cache (prepared models for glb-fuse), copy-cache (results of the
                      copy steps, keyed by input content + step; runs look there first, the objects page fills it ahead)
sandbox-objects/      gitignored: new objects (sources, Sloyd files, working versions, variants, katalog.json); never commit
```

## 4. Hard rules

- **The simulation is deterministic.** Same seed + params = same run, however
  fast jobs compute; the clock waits for due results. Any refactor that is
  meant to keep behaviour must be verified: `npm run measure` and
  `npx tsx sandbox/run-abstract.ts 120` output before and after must be
  byte-identical. Behaviour changes are deliberate and get re-measured.
- **Every number lives in `sandbox/params.ts`.** When a parameter is added,
  renamed or its meaning changes, update `sandbox/lifecycle-page/main.ts`
  (fields/notes) and the docs in `sandbox/docs/` (local file and online doc).
- **Plant jobs must not call sharp.** The CentOS 7 host (glibc 2.17) cannot
  load native sharp. `@gltf-transform/functions` imports sharp at load time
  (via `ndarray-pixels`), so sharp must stay loadable (wasm32 build or a stub),
  but no code path a plant job uses may call it. Texture work goes through
  `scripts/jimp-image.ts`. WebP output (delivery compression,
  `texture-crush --format webp`) is the only sharp use.
- **Never compress an already compressed model.** Jobs always read
  uncompressed working files; delivery files are made from those and never fed
  back into a job (`ASSET-COMPRESSION-GUIDE.md`).
- **Ports:** 5180 is the sandbox the user runs; never start or stop it. Use
  5191 for test runs and delete their run folders afterwards. The user's
  `dev:ar` runs on 5173: a second Vite (test preview on 5192) needs its own
  `cacheDir`, or it rebuilds `node_modules/.vite` under the user's server
  (`sandbox/docs/AR-TESTUMGEBUNG.md`, "Eine zweite Testumgebung").
- **Verify** with `npm run typecheck` and `npm run build` after non-trivial
  changes; delete `dist-platform/` afterwards.
- **Template baseline rules still apply** to `src/`: `src/assets/` and
  `src/a-frame-components/` are flat (no subfolders); components are
  registered by hand in `src/manifest.ts` (no automatic registration here); clone a
  glTF material before mutating it; listen for `object3dset` (type `mesh`), not
  only `model-loaded`; distinct `customProgramCacheKey` for every
  `onBeforeCompile` patch. The host runs 8frame 1.3.0 (three r137): anything
  meant for the host app must work there.
- **Only commit when explicitly told to.**

## 5. Docs obligations

A change to simulation behaviour, parameters, scripts or server assumptions
is done only when `sandbox/docs/` (and the matching online doc) and
`sandbox/SERVER-OFFENE-PUNKTE.md` say the same as the code. New server gaps go
into `SERVER-OFFENE-PUNKTE.md`.
