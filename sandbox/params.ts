// Every number the simulation uses — speculative first values, meant to be
// changed between test runs (see the sandbox doc: "Platzhalter in der Sandbox").
// Time is in days: Eigenzeit (the ecosystem's own clock, runs faster with
// boosts) or calendar days (platform lifetimes, photo waiting time).
// Distances in metres, polygon counts in triangles.

export const PARAMS = {
  // --- polygon budget: adapts to the planted origin objects (their summed triangles):
  // budget = budgetBase + budgetSlope × (sum − budgetRefOrigins), within budgetMin…budgetMax
  budgetBase: 80_000, // 5 origin objects of 5 000 triangles each (25 000) …
  budgetRefOrigins: 25_000, // … give this budget
  budgetSlope: 0.4, // triangles of budget per triangle above/below that: 5 × 10 000 → 90 000
  budgetMin: 70_000,
  budgetMax: 90_000,
  originMaxTriangles: 7_500, // an origin object above this is reduced to it when planted (the budget formula stays: 5 × 7 500 → 85 000)

  // --- Keimlinge (copies)
  growDays: 1.0, // Eigentage until a new copy has fully risen out of the ground
  maxGeneration: 8, // copies of copies …, no further (with voxels from generation 3 the grid reaches a single cube at 8)
  keimRatePerDay: 1.0, // new Keimlinge per origin line and Eigentag, during the Keimling phase
  copyVariance: 0.5, // ± fraction of that interval, random
  copyShrink: 0.85, // a copy of a new generation has at most this fraction of its parent's triangles ("copies get worse")
  genAdvanceStart: 0.15, // chance that a new Keimling takes the next generation, right after planting …
  genAdvanceDays: 12, // … rising to certainty after this many Eigentage
  growthMaxDays: 25, // Eigentage: if the plateau is never reached, the Keimling phase ends here
  spreadBase: 0.4, // distance of a copy from its parent
  spreadPerGeneration: 0.2, // + per generation (growing radius)
  spreadJitter: 0.4, // + random 0…this
  // plateau: for this long new Keimlinge keep the count up near the budget; the descent begins after it
  plateauDays: 16, // Eigentage
  plateauRefillBelow: 0.93, // fraction of the budget: in the plateau, new Keimlinge only below it
  // the Keimlinge's last stage: from this generation on copies are voxelized,
  // every further generation with a coarser grid, down to a single cube
  voxelFromGeneration: 3,
  voxelCellsStart: 24, // grid cells over the largest side in the first voxel generation
  voxelCellsFactor: 0.5, // × per further generation (rounded, at least 1 cell): 24, 12, 6, 3, 2, 1
  voxelTargetDays: 8, // voxel generations begin once the count rises above the halving threshold (halvingAtShare); the last (single cube) this many Eigentage after that
  voxelCopiesPerGeneration: 1, // copies per line of every voxel generation; a fraction rounds up (1.5 → 2). Plain generations get many more, at the rate

  // --- computing: a result is used this long after its job was requested (the
  // clock keeps running meanwhile and only stops if it is not ready by then)
  jobLeadDays: 0.4,
  softFuseLeadDays: 2.5, // soft fusions take 30–100 s instead of ~5–15 s: a longer lead, so the clock rarely waits

  // --- fusion (active objects and grown Keimlinge; pairs are irrevocable)
  softAfterFirstFusion: 1, // 1 = an object's first fusion is hard, every fusion with an already fused partner soft (as in the test track: phase 3 hard, from phase 4 soft); 0 = all hard
  fusePerDay: 0.05, // chance per Eigentag that a free object picks the nearest free partner in its radius
  fuseTravelDays: 1.2, // Eigentage the smaller object needs to reach the larger one
  fuseEaseK: 6.92, // easing s(t) = (e^kt − 1)/(e^k − 1): half the way at 90 % of the time
  fuseGap: 0.5, // final distance between both centres, fraction of their summed footprint radii (overlap)
  // every test track step at least once per lifecycle (sim/recipes.ts):
  requiredFusions: 5, // one object goes through this many fusions (Phase 3, 4, 7, 8, 10) …
  chainEveryDays: 1.0, // … pairing again at most this often (Eigentage), regardless of the rate
  requiredHalvings: 4, // one piece is halved this often (Phase 11/12, 13, 13, thirds)

  // --- size of the planted origin objects (longest side), scaled into this range when planted
  originMinSize: 0.2,
  originMaxSize: 0.6,
  // Keimlinge: the origin's size, a little varied and larger with every generation; the range above
  // may be left by keimSizeSlack, from generation 2 on upwards by keimSizeSlackPerGeneration more each
  keimSizeVariance: 0.15, // ± fraction, random per Keimling
  keimGrowPerGeneration: 0.1, // × (1 + this) per generation; after the first voxel generation halved with every further one (voxel gen 4: 0.05, 5: 0.025 …)
  keimGrowStopGeneration: 6, // from this generation on no more growth (voxel cubes would look too big)
  keimSizeSlack: 0.1, // m below the minimum / above the maximum
  keimSizeSlackPerGeneration: 0.1, // m more above the maximum per further generation; halved like the growth after the first voxel generation, none from keimGrowStopGeneration on
  keimTiltPerGeneration: 3, // degrees: a Keimling leans at random up to this × (generation − 1), about a pivot on the ground under its centre
  // emissive tint: every Keimling (from Phase 2 = generation 1 on) gets a random pure colour (full
  // saturation and brightness); a fusion mixes both colours weighted by strength, back to full brightness
  tintStart: 0.02, // emissive strength in generation 1 …
  tintPerGeneration: 0.02, // … plus this per further generation
  tintFuseLoss: 0.01, // a fusion: mean of both strengths minus this …
  tintMin: 0.01, // … but in the first fusion never below this; from the second fusion on it may fade out completely, and an object whose colour faded out counts as unfused again
  tintMax: 0.12, // no object stronger than this
  keimStartScale: 0.5, // a Keimling rises out of the ground growing from this fraction of its size to its full size

  // --- height (side view): growing, rising, sinking, swaying
  fuseMatchHeight: 1, // 1 = the smaller partner grows to the larger one's height (only ever grows), 0 = keeps its size
  maxGrowFactor: 3.0, // it grows at most by this factor
  riseStep: 0.15, // m an object rises with each fusion
  riseVariance: 0.5, // ± fraction, random
  riseLowPolyRef: 4000, // below this triangle count it rises more: × ref / triangles …
  riseMaxMult: 3, // … at most this many times
  halvingRise: 0.1, // m each half of a halving floats up (splinters float)
  maxTop: 2.5, // m: no top edge above this (stays in view, not far above heads)
  maxWidth: 2.0, // m: an object wider than this (longer horizontal side) shrinks
  fusedGrowPerDay: 0.02, // a fused, active object not reserved for another fusion grows by this fraction of its size per Eigentag …
  fusedGrowMax: 1.2, // … up to this × its size right after the fusion (a new fusion starts it again); over the height limit it sinks instead, up to maxSink
  maxSink: 0.3, // an object too tall for that may sink this fraction of its height into the ground; beyond that it shrinks
  // floating: an object bobs upwards from where it stands (never below it), the fewer
  // triangles the more and the faster; already very slightly and slowly below swayFromTriangles
  swayFromTriangles: 20_000,
  swayAmplitude: 0.15, // m at a single triangle; × strength^1.5 (strength 0…1 on a log scale of the triangles)
  swaySlowSeconds: 9, // seconds per bob at the start …
  swayFastSeconds: 3, // … and at a single triangle
  swayGroundFactor: 0.4, // on the ground the bobbing is this much of it …
  swayPerMetre: 0.8, // … plus this per metre of height above the ground …
  swayMaxFactor: 2, // … at most
  // descent: every object not on its way to a fusion drifts slowly towards the planting point
  gatherPerDay: 0.06, // m per Eigentag (slower within the last metre)
  gatherStop: 0.3, // m from the planting point (plus half the object's width)
  halvingRepelPerDay: 0.04, // m per Eigentag: the two halves of a halving push each other away (added to the drift) …
  halvingRepelRange: 1.5, // … weaker with distance, none beyond this many metres
  // decay: everything sinks slowly back to the ground
  decaySinkPerDay: 0.1, // m per Eigentag

  // --- intensified compression (near the budget, accumulating time account)
  compressAtShare: 0.915, // of the budget: above this the account runs (also: the plateau is reached here)
  compressSpanDays: 1.5, // Eigentage the account must reach
  compressVariance: 0.2,
  compressKeep: 0.5, // the compressed object keeps this fraction of its triangles

  // --- steady compression during the descent
  descentCompressEveryDays: 0.8,
  descentCompressKeep: 0.75,

  // --- decay: only wilting objects are left, compression gets more frequent and stronger
  decayCompressEveryDays: 0.15,
  decayCompressKeep: 0.5,

  // --- halving (after the count has dropped somewhat from the plateau)
  halvingAtShare: 0.73, // of the budget: in the descent, halving begins below this
  halvingEveryDays: 1.5,
  halvingVariance: 0.3,
  minTrianglesToHalve: 600,
  smallWiltPerDay: 0.5, // in the descent, objects too small to halve wilt with this chance per Eigentag

  // --- wilting: texture crush, death
  crushEveryDays: 1.0, // a wilting object's crush level goes up this often
  maxCrushLevel: 1, // wilting texture crush (Phase 9) this often; halvings from the second on crush again (Phase 13)
  deathTriangles: 30, // a wilting object below this dies
  lingerDays: 2.0, // dead objects stay visible this long

  // --- photos
  photoWaitDays: 2, // CALENDAR days before a photo can be taken (moderation time)
  photoTakePerDay: 0.6, // chance per Eigentag that an eligible photo is taken
  photoLifetimeDays: 90, // calendar

  // --- drawings
  objectRadiusBase: 2.0, // object radius = this + half the object's diagonal
  drawingAttractPerDay: 0.8, // chance per Eigentag
  drawingSpeed: 1.5, // metres per Eigentag
  drawingMinScale: 0.5,
  overlapMin: 0.08,
  overlapMax: 0.12,
  drawingLifetimeDays: 90, // calendar

  // --- space
  feedRadius: 15, // around the moving centre: watching + feeding
  exclusionRadius: 100, // around the planting point

  // --- time scale and boosts (factor = 1 + boosts, capped)
  contentBoostPerItem: 0.05, // continuous: per photo/drawing in the feed radius
  contentBoostMaxItems: 10,
  eventBoost: 2, // texture inheritance photo→plant or plant→drawing
  eventBoostDays: 0.25, // calendar days, decays linearly
  viewerBoost: 1.5, // per device in the feed radius, only while present
  maxFactor: 8,
};

export type Params = typeof PARAMS;
