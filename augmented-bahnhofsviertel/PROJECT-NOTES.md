# Project notes — read this first (Augmented Bahnhofsviertel)

Hand-over notes for an AI agent (e.g. Claude Code on another computer)
picking up work on the `augmented-bahnhofsviertel` branch family. They
replace the local, non-synced memory of the session that did the porting.
State: **2026-10-05**. Keep this file current when the state changes.

Read after `AGENTS.md`, before anything else here. Details live in:
[`AUGMENTED-BAHNHOFSVIERTEL-WORKS.md`](../AUGMENTED-BAHNHOFSVIERTEL-WORKS.md) (steering list),
[`PORTING-GUIDE.md`](PORTING-GUIDE.md) (process, tools, §9 releases + host),
[`LEARNINGS-2026-10.md`](LEARNINGS-2026-10.md) (bugs, deviations, wrong turns).

## 1. What's going on

The 26 "Augmented Bahnhofsviertel" AR works (old 8th Wall projects) were
ported to ArModules — **done**: 22 `abv-<NN>-<slug>` branches, all
`portiert` and phone-tested; only #11 is missing (no source). Shared code sits on `augmented-bahnhofsviertel`
(intermediate base). Numbered series #12/#13/#25 are the same work as #9/#4/
#21 (no own branch); #2/#3 Xenoglossy are separate colour versions (own
branches). Original exports live locally (gitignored) in
`augmented-bahnhofsviertel/Projektordner_alt/` — not on every computer.

**Most likely next task on this computer: build and upload the releases.**

## 2. Building the releases

1. Bring every branch up to date with `origin` — the release script builds
   each local branch's **committed** state in a temporary worktree:
   `git fetch origin`, then for `augmented-bahnhofsviertel` and each
   `abv-*` branch either `git checkout <b> && git pull` or, without
   checking out, `git branch -f <b> origin/<b>` (only for branches with no
   local-only commits). Missing local branches:
   `git branch --track <b> origin/<b>`. Finish on `augmented-bahnhofsviertel`
   (the script and its checks come from the checked-out branch).
2. `npm install` if needed, then `npm run abv:release`
   (or `npm run abv:release -- --only 1,19`).
3. Read `release/REPORT.md` — it must say ok for every work. Per work:
   `release/<NN>-<slug>/module/` (the ArModule the host loads: host the
   whole folder, the host resolves `assets/…` against the module URL) and
   `release/<NN>-<slug>/standalone/` (self-contained 8th Wall page: serve
   over https with Range requests for video/audio).
4. Upload only when the user asks for it, and only where they say.

## 3. Rules the user set (follow without asking again)

- **Never merge, push, rebase or cherry-pick from `augmented-bahnhofsviertel`
  or `abv-*` into `feature_template`.** Only `feature_template` →
  `augmented-bahnhofsviertel` → `abv-*`. A local pre-push hook guards
  `feature_template`; it false-positives when `feature_template` was merged
  into the base before being pushed — **push `feature_template` first, then
  merge it into the base**. `git push --no-verify` only with the user's
  explicit OK.
- **Commit only when the user says so.** Then usually: commit on the base,
  merge the base into all `abv-*` branches, push all of them.
- **The user starts the dev server (`npm run dev:ar`) for phone tests
  themselves** — just tell them which branch to check out. Short headless
  runs on a fixed port (e.g. 5190–5199) for your own checks are fine; stop
  them afterwards.
- Language with the user: German. Status column values in the steering
  list are German (`portiert`, `in Arbeit`, …).
- Look decisions: "faithful to the original", but the user's phone-test
  judgement wins — record every such change as a deliberate deviation
  (comment in the work's `ArModule.vue` + steering list + LEARNINGS §8).

## 4. The host app (where the modules run)

- Repo: `TobiasStill/ar-demo-backend` (private; readable with the `gh` CLI —
  plain `git clone` over https may lack credentials). **Read-only for us**
  unless the user explicitly asks for a PR there. The admin said the
  template is tailored to this platform, not general-purpose.
- Runtime: **8frame 1.3.0 (three r137)** + the old exports' `xrextras`,
  aframe-extras 6.1.1, `@8thwall/engine-binary` 1.0.0. Previews and
  standalone builds on this branch family use the same files
  (`lib/vendor/8frame-1.3.0.min.js`, `lib/vendor/xrextras-host/`).
  `feature_template` itself still uses 8frame 1.5 (alignment planned).
- One module at a time, mounted under an offset root (`0 1.6 -3`); camera
  `0 0.35 0.8`; scene has `xrextras-gesture-detector`, `colorManagement`,
  linear fog; raycaster on `.cantap`; host UI top-left/centre/right
  (our recenter button sits 64 px from the top).
- Host lights: two base lights grouped as `#host-lights`; a module with
  `hostLights: false` in its manifest gets them switched off by the host
  (host PR #4 and template PR #6, both merged). The base sets
  `hostLights: false` — every work brings its own lighting.
- Template upstream: `TobiasStill/ar-module-template` (the host's
  submodule); our repo is the fork `working-on-democracy/ar-module-template`
  (`origin`; remote `upstream` = TobiasStill). Template changes go upstream
  via a PR from a small branch off `upstream/main`.

## 5. How the code is organised (since 2026-10-05)

- **Components register automatically**: every file in
  `src/a-frame-components/` with a default export is a component named
  after its file; only the ones the module uses are bundled/registered
  (`scripts/used-components.ts`, `virtual:used-components`). Work-specific
  components are `<slug>-….ts` — no manifest entry needed.
- Shared building blocks for the old scenes on the base: `legacy-space`
  (hull that places the unchanged old scene in front of the camera),
  `legacy-attach`, `legacy-portal`, `crossfade-loop-clip`,
  `LegacyOverlay.vue`, `legacy-audio.ts`. `feature_template` now has
  universal versions of most of them (Placement, Gestures, AR Overlay,
  Light & Reflections, Spawn Sequence, Portal, Video, Tap Animation,
  Grain Shimmer) — the base still uses its legacy-* ones.

## 6. Open points

- **#11 Schramm**: no source. Export missing, live app (freitagskueche
  workspace) says "App Not Available" — waits for the user.
- **Before the final export** (steering list section "Vor dem finalen
  Export"): #5 cloud look to clarify with the artist; #22/#23 Privileged
  I/II credits vs. app links contradict each other.
- **Phone checks pending**: host lights are now fully off (were dimmed to
  30 % before) — the user will look at it in the release builds; if a work
  looks too dark, give that work its own extra light (deviation, see §3).
- **feature_template**: new features are not yet phone-tested; Grain
  Shimmer needs a user decision (static vs. animated grain, `linear` vs.
  `nearest`) — offer a temporary test scene (never commit changes to
  `feature_template`'s `ArModule.vue`).
- **Planned for feature_template** (only when the user starts it):
  align its preview/runtime with the host (8frame 1.3 + host base scene —
  re-test image tracking under 1.3 first); release-build tooling like
  `abv:release` in a generic form.
