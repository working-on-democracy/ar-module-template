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
  growDays: 0.67, // Eigentage until a new copy has fully risen out of the ground
  maxGeneration: 8, // copies of copies …, no further (with voxels from generation 3 the grid reaches a single cube at 8)
  keimRatePerDay: 1.5, // new Keimlinge per origin line and Eigentag, during the Keimling phase
  copyVariance: 0.5, // ± fraction of that interval, random
  copyShrink: 0.85, // a copy of a new generation has at most this fraction of its parent's triangles ("copies get worse")
  genAdvanceStart: 0.15, // chance that a new Keimling takes the next generation, right after planting …
  genAdvanceDays: 8, // … rising to certainty after this many Eigentage
  growthMaxDays: 16.7, // Eigentage: if the plateau is never reached, the Keimling phase ends here
  spreadBase: 0.4, // distance of a copy from its parent
  spreadPerGeneration: 0.2, // + per generation (growing radius)
  spreadJitter: 0.4, // + random 0…this
  // plateau: for this long new Keimlinge keep the count up near the budget; the descent begins after it
  plateauDays: 10.7, // Eigentage
  plateauRefillBelow: 0.93, // fraction of the budget: in the plateau, new Keimlinge only below it
  // the Keimlinge's last stage: from this generation on copies are voxelized,
  // every further generation with a coarser grid, down to a single cube
  voxelFromGeneration: 3,
  voxelCellsStart: 24, // grid cells over the largest side in the first voxel generation
  voxelCellsFactor: 0.5, // × per further generation (rounded, at least 1 cell): 24, 12, 6, 3, 2, 1
  voxelTargetDays: 5.3, // voxel generations begin once the count rises above the halving threshold (halvingAtShare); the last (single cube) this many Eigentage after that
  voxelCopiesPerGeneration: 1, // copies per line of every voxel generation; a fraction rounds up (1.5 → 2). Plain generations get many more, at the rate
  // the first Keimlinge (Vorläufer): one per origin object, randomly assigned, two per generation (1, 1, 2, 2, 3),
  // copied straight from the origin, staggered; they make no copies themselves. They and everything fused
  // or halved from them form the fast line: growing, pairing and travelling to a partner faster, halved likelier
  pioneerCount: 5, // 0 = none
  fastKeimChance: 0.04, // any other new Keimling joins the fast line by chance (its values and boost rules) and passes it on to its copies
  pioneerStaggerMinutes: 0.67, // Eigenminuten between two of them (0.67: 40 real seconds at factor 1); the first right at planting
  firstFuseSpeed: 16, // the Vorläufer's opening (their three fusions among themselves, used as soon as ready): × faster to the partner on top of fastFuseSpeed …
  firstFuseEaseK: 1, // … on a flatter curve (fuseEaseK otherwise): movement shows earlier
  pioneerOriginGap: 0.5, // m at least between their footprints and any origin object's
  pioneerGap: 0.2, // m at most between their footprint and the nearest other Vorläufer's
  // the fast line (Vorläufer, everything fused or halved from them, and Keimlinge that joined by chance)
  fastGrowSpeed: 2, // × faster rising out of the ground
  fastFuseSpeed: 2, // × the pairing rate and × faster to the partner, whenever one of the pair is of the fast line
  fastHalvingAffinity: 2, // × weight when choosing what is halved
  fastContentMaxItems: 20, // it counts up to this many photos and drawings for the continuous boost (contentBoostMaxItems for everything else) …
  fastContentMaxBoost: 21, // … and photos and drawings may add up to this (contentMaxBoost for everything else): it takes in more events before its cap
  fastEarlyContentMax: 30, // in the first earlyBoostHours that cap is this, fading back to fastContentMaxBoost …
  fastEarlyBoostFactor: 8, // … and all its boosts count this many times, devices too, fading back to once

  // --- computing: a result is used this long after its job was requested (the
  // clock keeps running meanwhile and only stops if it is not ready by then)
  jobLeadDays: 0.4, // the Vorläufer, every line's first plain Keimling and the Vorläufer's opening fusions have none (the clock waits for them)
  softFuseLeadDays: 2.5, // soft fusions take 30–100 s instead of ~5–15 s: a longer lead, so the clock rarely waits

  // --- fusion (active objects and grown Keimlinge; pairs are irrevocable)
  fusePerDay: 0.075, // chance per Eigentag that a free object picks the nearest free partner in its radius
  fuseTravelDays: 0.4, // Eigentage the smaller object needs to reach the larger one
  fuseEaseK: 7.42, // easing s(t) = (e^kt − 1)/(e^k − 1): half the way at 91 % of the time
  // every test track step at least once per lifecycle (sim/recipes.ts):
  requiredFusions: 5, // one object goes through this many fusions (Phase 3, 4, 7, 8, 10) …
  chainEveryDays: 0.67, // … pairing again at most this often (Eigentage), regardless of the rate
  requiredHalvings: 4, // one piece is halved this often (Phase 11/12, 13, 13, thirds)

  // --- size of the planted origin objects (longest side), scaled into this range when planted
  originMinSize: 0.2,
  originMaxSize: 0.6,
  // Keimlinge: the origin's size, a little varied and larger with every generation; the range above
  // may be left by keimSizeSlack, from generation 2 on upwards by keimSizeSlackPerGeneration more each
  keimSizeVariance: 0.15, // ± fraction, random per Keimling
  keimGrowPerGeneration: 0.15, // × (1 + this) per generation; after the first voxel generation halved with every further one (voxel gen 4: 0.075, 5: 0.0375 …)
  keimGrowStopGeneration: 6, // from this generation on no more growth: every generation is smaller than the one before instead (voxel cubes would look too big) …
  keimShrinkMin: 0.05, // … by a random fraction between this …
  keimShrinkMax: 0.3, // … and this, drawn anew per generation
  keimSizeSlack: 0.15, // m below the minimum / above the maximum
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
  maxGrowFactor: 4.0, // in a fusion the smaller partner grows to the larger one's height (only ever grows), at most by this factor
  // heights only ever go up, except at the height limit and in the wind (below): a fusion starts
  // from the higher of both partners and rises by riseStep; every compression lifts gradually
  riseStep: 0.3, // m an object rises with each fusion
  riseVariance: 0.5, // ± fraction, random
  halvingRise: 0.1, // m each half of a halving floats up (splinters float)
  compressRise: 0.06, // m per halving of the triangle count by a compression (fewer triangles, lighter) …
  compressRiseSpread: 1.6, // … × e^(random ±this): from about a fifth to five times
  liftEaseDays: 1.5, // Eigentage: a compression's rise is spread over about this long (time constant), never at once
  maxTop: 3, // m: no top edge above this (stays in view, not far above heads) …
  ceilingDropMin: 0.1, // … an object that reaches it drifts down again by a random amount between this …
  ceilingDropMax: 0.75, // … and this (m) …
  ceilingDriftDays: 3.5, // … slowly (time constant in Eigentage)
  maxWidth: 2.0, // m: an object wider than this (longer horizontal side) shrinks
  fusedGrowPerDay: 0.04, // a fused, active object not reserved for another fusion grows by this fraction of its size per Eigentag …
  fusedGrowMax: 1.5, // … up to this × its size right after the fusion (a new fusion starts it again); over the height limit it sinks instead, up to maxSink
  maxSink: 0.3, // an object too tall for that may sink this fraction of its height into the ground; beyond that it shrinks
  // floating: an object bobs upwards from where it stands (never below it), the fewer
  // triangles the more and the faster; already very slightly and slowly below swayFromTriangles
  swayFromTriangles: 20_000,
  swayAmplitude: 0.15, // m at a single triangle; × strength^1.5 (strength 0…1 on a log scale of the triangles)
  swaySlowSeconds: 18, // seconds per bob at the start …
  swayFastSeconds: 8, // … and at a single triangle
  swayGroundFactor: 0.1, // on the ground the bobbing is this much of it …
  swayPerMetre: 0.4, // … plus this per metre of height above the ground …
  swayMaxFactor: 1.2, // … at most
  // descent: every object not on its way to a fusion drifts slowly towards the planting point
  gatherPerDay: 0.04, // m per Eigentag (slower within the last metre)
  gatherStop: 0.65, // m from the planting point (plus half the object's width)
  halvingRepelPerDay: 0.07, // m per Eigentag: the two halves of a halving push each other away (added to the drift) …
  halvingRepelRange: 1.5, // … weaker with distance, none beyond this many metres
  // kinship: fused, active objects not on their way to a fusion drift slowly towards the nearest one
  // with the same number of fusions, until they almost touch or overlap a little; wilting ends it
  attractFromFusions: 1,
  attractPerDay: 0.06, // m per Eigentag (slower within the last 0.3 m)
  attractRange: 3, // m between their centres at most
  attractGapMin: -0.05, // m: they stop at a gap between this (overlapping) …
  attractGapMax: 0.05, // … and this, fixed per pair at random
  // wind: halved objects under windFromTriangles drift slowly in every direction, up and down too,
  // stronger the closer they get to deathTriangles; the direction changes now and then at random
  windFromTriangles: 500,
  windSpeedPerDay: 1.5, // m per Eigentag at deathTriangles (on a log scale from windFromTriangles)
  windVertical: 0.5, // up to this share of a direction points up or down
  windTurnPerDay: 1.5, // chance per Eigentag that the wind turns
  windEaseDays: 0.5, // Eigentage the drift takes to follow a turn (time constant)
  windRange: 4.5, // m from the planting point: further out, the next turn points back inwards
  // decay: the drift to the planting point stops, the halves push apart this many times as strongly,
  // and wilting objects shrink slowly, down to decayShrinkMin of their size
  decayRepelFactor: 2,
  decayShrinkPerDay: 0.0225, // fraction of their size at the start of the decay, per Eigentag
  decayShrinkMin: 0.7,

  // --- intensified compression (near the budget, accumulating time account)
  compressAtShare: 0.915, // of the budget: above this the account runs (also: the plateau is reached here)
  compressSpanDays: 1.0, // Eigentage the account must reach
  compressVariance: 0.2,
  compressKeep: 0.5, // the compressed object keeps this fraction of its triangles

  // --- steady compression during the descent
  descentCompressEveryDays: 0.53,
  descentCompressKeep: 0.75,

  // --- decay: only wilting objects are left, compression gets more frequent and stronger
  decayCompressEveryDays: 0.05,
  decayCompressKeep: 0.5,

  // --- halving (after the count has dropped somewhat from the plateau)
  halvingAtShare: 0.73, // of the budget: in the descent, halving begins below this
  halvingEveryDays: 0.5,
  halvingVariance: 0.3,
  halvingRateRisePerDay: 0.075, // the halving rate rises gradually: × (1 + this × Eigentage since halving began)
  minTrianglesToHalve: 800,
  smallWiltPerDay: 0.85, // in the descent, objects too small to halve wilt with this chance per Eigentag

  // --- wilting: texture crush, death
  crushEveryDays: 0.67, // a wilting object's crush level goes up this often
  maxCrushLevel: 1, // wilting texture crush (Phase 9) this often; halvings from the second on crush again (Phase 13)
  deathTriangles: 1, // a wilting object at or below this dies (as far down as it goes: forced compressions get anything there)
  stuckKeep: 0.95, // in the descent, a compression that keeps more than this share of an object too small to halve: from then on its compressions are forced (permissive, loose pieces dropped, largest triangles kept); if even that keeps more, it dies
  lingerDays: 1.33, // dead objects stay visible this long (Eigentage) …
  lingerVariance: 0.5, // … ± this, at random per object; meanwhile they sink steadily until their top is under the ground
  maxJobFailures: 3, // a wilting object (or an origin object at the end) whose jobs failed this often dies early

  // --- photos
  photoWaitDays: 1, // CALENDAR days before a photo can be taken (moderation time)
  photoTakePerDay: 0.5, // chance per Eigentag that an eligible photo is taken
  photoLifetimeDays: 14, // calendar

  // --- drawings
  objectRadiusBase: 2.0, // object radius = this + half the object's diagonal
  drawingAttractPerDay: 1.2, // chance per Eigentag
  drawingSpeed: 2.25, // metres per Eigentag
  drawingMinScale: 0.5,
  overlapMin: 0.08,
  overlapMax: 0.12,
  drawingLifetimeDays: 90, // calendar

  // --- space
  feedRadius: 15, // around the moving centre: watching + feeding
  exclusionRadius: 100, // around the planting point

  // --- time scale and boosts: factor = 1 + photos and drawings (capped) + devices (counted up to a number); the two never take from each other
  contentBoostPerItem: 0.05, // continuous: per photo/drawing in the feed radius
  contentBoostMaxItems: 10,
  eventBoost: 2, // a photo or drawing made in the feed radius, from the moment it is made
  eventBoostDays: 0.25, // calendar days, decays linearly
  firstViewerBoost: 3, // the first device in the feed radius (whichever it is), only while present …
  viewerBoost: 1.5, // … every further one
  viewerMaxDevices: 10, // no more devices counted than this
  earlyBoostHours: 0.5, // CALENDAR hours after planting with extra boosts: photos and drawings (content + events) count …
  earlyContentFactor: 2, // … this many times (for the fast line see fastEarly*)
  earlyFadeFromHours: 1 / 3, // CALENDAR hours: from here the extra boosts fade out linearly, gone at earlyBoostHours
  contentMaxBoost: 7, // photos and drawings (continuous + events) add at most this to the factor
  unwatchedPauseDays: 3, // CALENDAR days without a device in the radius: all boosts pause (factor exactly 1) until a device comes again
  unwatchedSlowDays: 7, // CALENDAR days without a device: the time factor drops to unwatchedSlowFactor (below 1, slower than real time) until a device comes again
  unwatchedSlowFactor: 0.5,
};

export type Params = typeof PARAMS;
