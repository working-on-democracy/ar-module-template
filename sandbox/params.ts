// Every number the simulation uses — speculative first values, meant to be
// changed between test runs (see the sandbox doc: "Platzhalter in der Sandbox").
// Time is in days: Eigenzeit (the ecosystem's own clock, runs faster with
// boosts) or calendar days (platform lifetimes, photo waiting time).
// Distances in metres, polygon counts in triangles.

export const PARAMS = {
  // --- polygon budget and plateau
  budget: 80_000,

  // --- Keimlinge (copies)
  growDays: 0.5, // Eigentage until a new copy has fully risen out of the ground
  copiesPerObject: 3, // limited number of copies per origin object or Keimling
  maxGeneration: 2, // copies of copies, no further
  copyEveryDays: 1.2, // Eigentage between two copies of one object
  copyVariance: 0.3, // ± fraction of that interval, random
  copyShrink: 0.8, // a copy has at most this fraction of its parent's triangles ("copies get worse")
  spreadBase: 1.5, // distance of a copy from its parent
  spreadPerGeneration: 1.0, // + per generation (growing radius)
  spreadJitter: 1.0, // + random 0…this

  // --- fusion (active objects and grown Keimlinge; pairs are irrevocable)
  fusePerDay: 0.1, // chance per Eigentag that a free object picks the nearest free partner in its radius
  fuseTravelDays: 1.0, // Eigentage the smaller object needs to reach the larger one
  fuseEaseK: 6.92, // easing s(t) = (e^kt − 1)/(e^k − 1): half the way at 90 % of the time
  fuseGap: 0.5, // final distance between both centres, fraction of their summed footprint radii (overlap)
  fuseKeepStart: 0.9, // first fusion keeps this fraction of both triangle counts together
  fuseKeepStep: 0.1, // every fusion already inside the two objects compresses this much more
  fuseKeepMin: 0.4,

  // --- size of the planted origin objects (y), scaled into this range when planted; their copies inherit the scale
  originMinHeight: 0.3,
  originMaxHeight: 1.5,

  // --- height (side view): growing, rising, sinking, swaying
  fuseMatchHeight: 1, // 1 = the smaller partner grows to the larger one's height (only ever grows), 0 = keeps its size
  maxGrowFactor: 4, // it grows at most by this factor
  riseStep: 0.15, // m an object rises with each fusion
  riseVariance: 0.5, // ± fraction, random
  riseLowPolyRef: 4000, // below this triangle count it rises more: × ref / triangles …
  riseMaxMult: 3, // … at most this many times
  halvingRise: 0.1, // m each half of a halving floats up (splinters float)
  maxTop: 2.5, // m: no top edge above this (stays in view, not far above heads)
  maxSink: 0.3, // an object too tall for that may sink this fraction of its height into the ground; beyond that it shrinks
  swayBelowTriangles: 400, // below this count objects sway …
  swayAmplitude: 0.15, // … up to this many metres

  // --- intensified compression (near the budget, accumulating time account)
  compressThreshold: 0.9, // fraction of the budget
  compressSpanDays: 1.5, // Eigentage the account must reach
  compressVariance: 0.2,
  compressKeep: 0.5, // the compressed object keeps this fraction of its triangles

  // --- steady compression during the descent
  descentCompressEveryDays: 1.0,
  descentCompressKeep: 0.8,

  // --- decay: only wilting objects are left, compression gets more frequent and stronger
  decayCompressEveryDays: 0.3,
  decayCompressKeep: 0.65,

  // --- halving (after the count has dropped somewhat from the plateau)
  halvingThreshold: 0.8, // fraction of the plateau's highest count
  halvingEveryDays: 1.5,
  halvingVariance: 0.2,
  minTrianglesToHalve: 400,

  // --- wilting: texture crush, death
  crushEveryDays: 1.0, // a wilting object's crush level goes up this often
  maxCrushLevel: 5,
  deathTriangles: 150, // a wilting object below this dies
  lingerDays: 1.0, // dead objects stay visible this long

  // --- photos
  photoWaitDays: 2, // CALENDAR days before a photo can be taken (moderation time)
  photoTakePerDay: 0.6, // chance per Eigentag that an eligible photo is taken
  photoLifetimeDays: 90, // calendar

  // --- drawings
  objectRadiusBase: 2.0, // object radius = this + half the object's diagonal
  drawingAttractPerDay: 0.8, // chance per Eigentag
  drawingSpeed: 1.5, // metres per Eigentag
  drawingMinScale: 0.5,
  overlapMin: 0.02,
  overlapMax: 0.06,
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
