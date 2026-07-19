  # Workflow: universalizing a feature into `feature_template`

The repeatable process for taking a feature built on one project-specific
fork branch (e.g. `Jakob_module`) and porting it into `feature_template` as
a reusable, drop-in piece any future fork can adopt. `SOUND-FEATURE-GUIDE.md`
is the worked example this workflow produced — read it alongside this file
to see each step's concrete output. Follow this same sequence for the next
feature, and name its guide `<FEATURE>-FEATURE-GUIDE.md` to match.
`FEATURE-CATALOG.md` is the running index across every feature this
workflow has produced so far — check it first to see what's already on
this branch before starting a new port (step 12 covers checking the new
feature against it for compatibility; step 10 covers keeping it updated).
`QUICK_START_GUIDE.md` is a separate, short, non-technical guide for
artists using this template's features — not part of researching or
building a port, but step 11 covers when it needs a touch-up.

## 0. Keep `main` current — but don't touch feature branches with it

`git fetch origin`, then merge into **local `main` only**
(`git checkout main && git merge origin/main`). Never merge `main`'s
changes into a source feature branch (`Jakob_module`, etc.) — those stay
exactly as their authors left them. `feature_template` is branched fresh
from this updated `main` (or, once it exists, already sits on top of it —
see step 2), so it's `main`'s current state that every universalized
feature has to work against, not whatever `main` looked like when the
source branch first forked from it.

## 1. Scope the feature on its source branch

Before writing anything, read every file the feature actually touches on
its source branch — components, manifest registration, the relevant slice
of `ArModule.vue`, and any existing docs (e.g. `Jakob_module`'s
`SOUND-CONTROLS.md` was a big head start). The goal is a clear line between:

- **Feature-owned files** — only exist because of this feature.
- **Incidental, unrelated changes** on the same branch — e.g. `Jakob_module`
  also had a `force-shadow-map.ts` component fixing shadow rendering in
  general; that's not part of "the sound feature" and was deliberately left
  behind. Don't drag unrelated fixes along just because they live on the
  same source branch — port them as their own separate feature later if
  they're worth generalizing too.

Also identify **hidden assumptions** baked into the original code that
won't hold in an arbitrary future project — e.g. the original relied on a
specific invisible child-plane naming convention (`sound-button-hit-area`)
for its tap target, and a camera position offset compensating for one
specific host deployment. Anything like that needs to become an explicit,
documented attribute instead (see step 3).

## 2. Branch (or reuse) `feature_template`

Created once, from `main`, with **no upstream tracking**
(`git checkout -b feature_template main` — not `origin/main`, and don't set
`-u` afterwards) so a stray `git push` can't land on a shared branch by
accident. Every subsequent feature is added to this same branch, on top of
whatever's already there — don't re-branch from `main` per feature, or
you'll lose every previously-universalized feature.

## 3. Design for universality before writing code

This is the step most worth slowing down for. Ask, for every piece of the
original implementation:

- **Is this generic, or specific to this one feature?** The sound feature's
  original three components tangled "detect a gaze/tap on a 3D object"
  together with "play/pause/stop audio." Splitting that into a generic
  layer (`ar-button` + `ar-button-manager` — reusable by *any* future
  tap-driven feature) and a thin feature-specific layer built on its events
  (`sound-button` + `sound-controller`) is the pattern to repeat: pull out
  anything a *different* feature would plausibly also need, and connect the
  feature-specific part to it via a narrow event/method contract rather
  than tight coupling.
- **Would the current component structure survive a rewrite, or is it worth
  restructuring?** Don't assume the source branch's file boundaries are the
  right ones — they're often just how the feature happened to evolve
  through trial and error (this was true here: three components became
  five, cleanly separated, not three renamed ones).
- **Replace scene-specific hacks with declarative attributes.** The
  invisible-hit-area-child-plane pattern became a `zoneSize`/`zoneOffset`
  attribute pair directly on the button entity. A hardcoded camera offset
  stays out of anything universalized — that's specific to one project's
  scene, not the feature.
- **Define the public surface deliberately**: schema attributes (with
  sensible defaults so most attributes are optional), and DOM events for
  anything another component might want to react to. Once decided, treat it
  as the contract other features (and other forks) will build against.

## 4. File naming & organization convention

`src/a-frame-components/` and `src/assets/` are flat, shared folders — every
feature's files live there side by side. Two ways to keep them
distinguishable: subfolders, or a naming convention. **Check the actual
build tooling before picking** — don't assume subfolders are free. Here,
`vite.config.ts`'s asset scanner (`readdirSync(ASSETS_SRC).filter(isFile)`)
is **non-recursive**, so anything placed in an `src/assets/` subfolder would
silently never reach the manifest. That ruled out subfolders for assets,
and the same convention was applied to components too, for consistency
rather than mixing schemes.

The convention adopted:

- A feature's own files (components **and** assets) are prefixed with the
  feature's name — `sound-button.ts`, `sound-controller.ts`,
  `sound-unlock-audio.ts`, `sound-start.webp`, etc.
- Files that are genuinely generic — reusable by any feature, not owned by
  one — stay unprefixed or keep a neutral prefix (`ar-button.ts`,
  `ar-button-manager.ts`, `no-frustum-cull.ts`), **even if only one feature
  currently uses them**. Don't retroactively feature-prefix something just
  because nothing else needs it yet.

This means adopting a feature is always a flat file copy into the same
folders a project already has — never a path change or a move. Document the
convention itself once (currently in the comment above the `components` map
in `src/manifest.ts`); each new feature just follows it.

## 5. Decide which assets are integral to the feature

Not everything the source branch ships in `src/assets/` belongs in the
universalized version. Split:

- **Integral, feature-defining assets** — needed for the feature's own code
  to function, and generic enough that any project would want the same
  ones (or could reasonably use them as-is). The sound feature's four
  play/pause/stop/restart icons are this: `sound-controller`'s GUI panel
  code references them by id directly, and a restart/stop/play/pause icon
  set isn't specific to any one project's content. These get copied over
  for real (`git checkout <source-branch> -- <path>`), renamed to the
  naming convention, and committed.
- **Artistic / project-specific content** — 3D models, recorded audio
  clips, anything that's *what this particular project's feature instance
  happens to play or show*. The sound feature's Wand models and
  German/English narration clips are this — they don't travel. They only
  appear as illustrative placeholder ids in example markup (`#Wand1`,
  `#English_wand_1`, ...), clearly explained as stand-ins a real project
  replaces with its own content, not real shipped assets.

When in doubt: would a *different* project using this feature plausibly want
the exact same file? If yes, it's integral. If it's "content," it's not.

## 6. Implement components, register in `manifest.ts` with a minimal diff

Write the universalized components in `src/a-frame-components/`. Register
them in `src/manifest.ts` **additively** — import the new components, add
entries to the existing `components` map — without touching whatever else
is already registered there (image targets, other features' entries, etc.).
The diff for adding a whole feature's components to the manifest should be
small and obviously additive, easy to review in isolation from everything
else in the file.

## 7. Demonstrate usage with example files — don't touch `ArModule.vue`

`ArModule.vue` is the one file every fork is expected to hand-edit with its
own scene content; `feature_template`'s copy must stay generic/untouched so
it doesn't fight with whatever a project already put there. Instead, add
files under `examples/` (outside `src/`/`lib/`, so they're excluded from
`tsconfig`'s `include` and never touched by the Vite build — pure reference
text, not compiled or served):

- **3D usage example** — scene markup showing every component/attribute
  combination that matters, with a full attribute reference as comments at
  the end (`examples/ar-button-usage.html`).
- **GUI/2D-overlay example**, if the feature has one — a copy/paste block
  (Vue SFC syntax, even if kept as a `.html` file for readability) with
  explicit instructions *in the file's own top comment* for where each
  piece goes in a real `ArModule.vue`, what the module root entity needs,
  and what assets it depends on (`examples/sound-gui-panel.html`).

If a feature is complex enough to need both, keep them as separate files
(3D wiring and a 2D GUI overlay are conceptually different integration
points) rather than one combined example.

## 8. Verify

After each meaningful change: `npx vue-tsc --noEmit` (fast typecheck) and a
full `npm run build` (exercises the actual Vite asset pipeline — this is
what caught, for example, that the icon assets were correctly picked up
under their new prefixed names). Delete the generated `dist-platform/`
output before committing — it's gitignored, but there's no reason to leave
build output sitting in the working tree either.

## 9. Write the per-feature guide

One `<FEATURE>-FEATURE-GUIDE.md` per feature, at the repo root, covering —
in this order, matching `SOUND-FEATURE-GUIDE.md`:

1. **Step-by-step setup** — a literal checklist for copying the feature
   into a fresh project: which files to copy, how to register them in
   `manifest.ts`, how to wire the scene, how to integrate any GUI pieces,
   how to verify it worked. Written for someone who's never seen the
   internals.
2. **Entities & attributes** — every custom element/attribute the feature
   adds, as a reference table: name, type, default, meaning. Include events
   emitted, and a full worked example.
3. **Under the hood** — how the components are structured and why (what's
   generic vs feature-specific and why it was split that way), the key
   algorithms/state machines, and the non-obvious "why" behind any design
   decision inherited from the source branch or introduced during the port.
4. **Incompatibilities, risks & troubleshooting** — see step 12; this
   section's content comes directly out of that check.

## 10. Update `FEATURE-CATALOG.md`

`FEATURE-CATALOG.md` is the quick-lookup index across every feature on
this branch — one line of "what it does" per feature, then a components
table and an assets table, each with a one-line description and (for
assets) where they're used. It exists so someone can find "which file
implements X" or "what is this asset for" without opening every guide.
Add the new feature's entry following the existing ones as a template:

- One row in the top **Index** table (feature name, one-line description,
  **source branch** — step 1's source branch, e.g. `Jakob_module` — and
  link to its guide).
- A "Guide: ... · Source: `<branch>`" line at the top of the feature's own
  section, matching the Index row.
- If the feature introduced a genuinely generic building block (like
  `ar-button`), add it to the **Shared building blocks** table instead of
  under the feature section, with an "Introduced by" note naming which
  feature's port it was written during (and its source branch) — these
  blocks are usually written fresh/generalized during a port, not copied
  verbatim, so say that rather than implying they came from the source
  branch as-is — and update that block's "Used by" column for any *other*
  existing entry that also turns out to depend on it.
- A features section: one-line description, a components table (name,
  file, one-line description — mark non-component helper files, e.g. a
  `-shared.ts` factory or a `-unlock-audio.ts` utility, with `—` in the
  component-name column rather than omitting them), and an assets table
  (asset, which example/component uses it, one-line function) or "none."
- Cross-link related features that consume each other (as Mirror Shard and
  Liquid Texture do) in both directions.

Keep every description on this page to one line — it's an index, not a
guide; the linked `<FEATURE>-FEATURE-GUIDE.md` is where the detail belongs.

## 11. Check whether `QUICK_START_GUIDE.md` needs updating

Unlike `FEATURE-CATALOG.md`, this is **not** an every-feature update —
`QUICK_START_GUIDE.md` deliberately never names or lists individual
features (it points to `FEATURE-CATALOG.md` for that), so adding a routine
feature that fits the existing pattern (copy files, add lines to
`manifest.ts`, paste example markup into `ArModule.vue`) usually needs no
change there at all. Only revisit it if this feature (or the work around
it) changed something the guide asserts about the *template itself* —
e.g. a new top-level doc other artists should know about, a changed/added
`npm run` command, a change to what goes in `src/manifest.ts` or how
`ArModule.vue`/`examples/`/`src/assets/` are meant to be used, or a new
rule of thumb worth adding. That guide is written for non-programmers, so
if you do touch it: keep it short, avoid code detail, and don't let it
grow into a second feature list.

## 12. Check for incompatibilities — against *everything* already there

This has to be redone, in full, every time a feature is added to
`feature_template` — not just against the feature being added, but against
**every feature already on the branch and everything already in `main`**
(the image-target/`xrextras-play-video` example from the sound feature's
guide is exactly this: `main` had that before any feature work started, and
it turned out to matter). Concretely check:

- **A-Frame component name collisions.** The host (and
  `lib/host-runtime.ts`, which mirrors it) registers manifest components by
  name and **skips duplicates** — if two features (or two forks both using
  this template) register the same component name with *different*
  behavior, whichever mounts first silently wins for both, project-wide.
  Read `lib/host-runtime.ts`'s `registerManifestComponents` before assuming
  otherwise.
- **Shared global listeners/state.** Anything that adds `document`-level
  event listeners (pointer, click, keyboard, ...) or touches a page-wide
  singleton (the shared `THREE.AudioContext`, `document.activeElement`,
  etc.) needs to be checked against every other feature doing the same —
  do they filter their target tightly enough not to double-fire on each
  other's taps? Do they assume they're the only thing playing audio /
  reading input?
- **The shared `<a-camera>`.** `CAMERA_PROPS_FORBIDDEN` in
  `lib/manifest.types.ts` already blocks the worst case (a module
  relocating or hijacking input for the shared camera), but a feature can
  still *read* camera state in ways that assume it's the only one doing so
  — check for that.
- **Visual/interaction overlap.** Two features' interactive trigger zones
  (or a feature's zone and `main`'s existing tappable content) occupying
  the same screen space in a real scene — even without any code conflict,
  a single tap can satisfy both independently.
- **Don't assume — read the actual dependency source.** The
  `xrextras-play-video` finding in `SOUND-FEATURE-GUIDE.md` came from
  grepping `node_modules/@8thwall/xrextras/dist/xrextras.js` directly, not
  from guessing at what a bundled third-party component probably does.
  Do the same for any other vendored component a new feature might
  interact with.

Fold whatever this check finds into the new feature's own guide (step 9,
section 4) **and** go back and update any earlier feature's guide if the
new feature reveals a risk that also applies to it.

## 13. Commit

Only when explicitly asked. Stage exactly the feature's files — leave out
unrelated local/untracked clutter that happens to be sitting in the working
tree. Write a commit message that explains *why* the restructuring
happened (e.g. the generic/feature-specific split), not just a file list.
