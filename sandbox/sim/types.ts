// The simulation's world state. Shaped like the documents the platform would
// later store, with metre coordinates (x east, z south, y up) instead of GPS.
import type { Params } from "../params";
import type { Pose } from "./pose";
import type { FusePost, HalvingRecipe } from "./recipes";

export type Vec3 = [number, number, number];

/** Keimling = copy phase, aktiv = may take photos (later: attract + fuse),
 *  verwelkend = halved, tot = lingers, then removed. */
export type ObjectState = "keimling" | "aktiv" | "verwelkend" | "tot";

export interface ModelVersion {
  /** File of this version; in the abstract mode just a label. */
  glb: string;
  triangles: number;
  /** Bounds in the model's own frame. */
  min: Vec3;
  max: Vec3;
}

export interface PlantObject extends ModelVersion {
  id: string;
  /** Model name of the origin object it descends from. */
  lineage: string;
  parent: string | null;
  generation: number; // 0 = planted origin object
  pos: Vec3;
  rotY: number; // radians
  state: ObjectState;
  grow: number; // 0…1, rising out of the ground
  /** Fraction of its size a Keimling starts at; it grows to full size while rising. */
  startScale: number;
  /** Scale right after its last fusion: from there it may grow slowly up to fusedGrowMax × this (null = never fused). */
  growBase: number | null;
  /** Lean about a pivot on the ground under the centre (later Keimling generations): angle and direction, radians. */
  tilt: { angle: number; dir: number } | null;
  busy: boolean; // a geometry job for this object is running
  /** Photo layer, projected from where the photo hangs; parts in its shadow keep their own texture. */
  photo: { photoId: string; since: number; frame: PhotoFrame } | null;
  crushLevel: number;
  nextCrushAt: number;
  deadSince: number | null;
  /** Reserved fusion partner — irrevocable once chosen. */
  pairedWith: string | null;
  /** How many fusions this object is made of. */
  fusions: number;
  /** How many halvings lie behind this object. */
  halvings: number;
  /** Emissive tint: pure colour (sRGB 0…1, brightest channel 1) and strength; null = none (origin objects). */
  tint: { color: Vec3; strength: number } | null;
  /** Fusions since the tint last faded out (or since birth): with 0 on both sides a fusion keeps at least tintMin. */
  tintFusions: number;
  /** The other half of its last halving: they push each other away from the descent on. */
  sibling: string | null;
  /** Planted origin object: copies itself, but stands outside the active
   *  ecosystem (no budget, no fusion, no photos) and only mirrors its state. */
  origin: boolean;
  originalTriangles: number;
  /** Uniform scale of the model (fusion: the smaller one grows to the larger one's height). */
  scale: number;
  /** Height of the object's underside above the ground (m); negative = sunk in. */
  lift: number;
  /** Full transform of the model into the world while it travels into a
   *  fusion pose (rotation about all axes); null = standing (pos, lift, rotY, scale). */
  pose: Pose | null;
  /** Voxel grid it was copied with (Keimling end stage), null = not voxelized. */
  voxelCells: number | null;
  /** Fast line: a Vorläufer, a Keimling that joined it by chance (fastKeimChance), or copied, fused or halved from one — grows, pairs and travels faster, halved likelier. */
  fast: boolean;
  /** One of the first Keimlinge (Vorläufer), or fused from one: makes no copies, waits for the opening. */
  pioneer: boolean;
  /** Scale when it began shrinking in the decay (it shrinks to decayShrinkMin × this); null = not yet. */
  shrinkBase: number | null;
  /** A compression could not make it smaller and it is too small to halve: it dies. */
  stuck: boolean;
  /** Height change still to come (m, negative = down), spread over time constant liftTau (Eigentage). */
  liftAdd: number;
  liftTau: number;
  /** Wind drift of a light splinter: current velocity and the direction it turns to (m per Eigentag); null = no wind. */
  wind: { v: Vec3; goal: Vec3 } | null;
  /** Its compressions are forced (it could hardly be compressed any more). */
  forceCompress: boolean;
  /** Jobs of it that failed. */
  failures: number;
  /** Dead: Eigentage it stays visible, and its underside at death (it sinks from there until its top is under the ground). */
  linger: number | null;
  sinkFrom: number | null;
  sinkTo: number | null;
}

/** History of an object, for counting: Keimling, untouched, fused n times, halved. */
export type ObjectKind = "ursprung" | "keimling" | "voxelkeimling" | "unveraendert" | "v1" | "v2" | "v3" | "v4" | "halbiert";

/** Two objects that have decided to fuse: B travels to A, the fused model is computed meanwhile. */
export interface Pair {
  a: string;
  b: string;
  /** The fusion job (its result is used on arrival). */
  jobId: number;
  /** The pose job (used at once: the journey starts). */
  poseJobId: number;
  /** Triangles the fused model is expected to have (for the rise before it is known). */
  expectedTriangles: number;
  /** One of the Vorläufer's opening fusions (no computing lead, faster, flatter curve). */
  opening?: boolean;
  /** Eigenzeit the journey began: once the fused model (and so B's pose in it) is known. */
  start: number | null;
  duration: number;
  /** Easing of the journey (fuseEaseK; flatter for the fast line's first fusion). */
  easeK: number;
  from: Pose | null;
  to: Pose | null;
  /** A's model frame now and after the fusion (risen, sunk or shrunk to the height limit). */
  aFrom: Pose | null;
  aTo: Pose | null;
  aLift: number;
  /** Underside of the model (model frame) A's final height was fitted to: the estimate from the pose. */
  aMinY: number;
  aScale: number;
  result: ModelVersion | null;
}

/** A photo's projection onto an object, in the model's own frame: it comes from
 *  `dir` (unit, towards the photo); `right` and `up` span the image, `min`/`max`
 *  its extent along them (the model's bounding box as seen from the photo). */
export interface PhotoFrame { dir: Vec3; right: Vec3; up: Vec3; min: [number, number]; max: [number, number] }

export interface Photo {
  id: string;
  pos: Vec3;
  createdAt: number; // calendar day
  lifetime: number;
  blocked: boolean;
  gone: boolean; // deleted, expired or blocked: no longer usable
}

export type DrawingMode = "frei" | "angezogen" | "ruhend";

export interface Drawing {
  id: string;
  pos: Vec3; // anchor
  points: Vec3[]; // relative to the anchor, at scale 1
  color: string;
  createdAt: number; // calendar day
  lifetime: number;
  gone: boolean;
  mode: DrawingMode;
  target: string | null;
  startDist: number;
  travelled: number;
  scale: number;
  overlapGoal: number;
  overlap: number;
  /** Texture inherited at rest: the model version it was taken from. */
  texture: { glb: string; fromObject: string } | null;
}

export interface Boost {
  kind: "foto" | "zeichnung";
  strength: number;
  start: number; // calendar day
  until: number;
}

/** pose: only where B goes inside the fused model (quick), before the fusion itself. */
export type JobKind = "copy" | "compress" | "split" | "crush" | "pose" | "fuse";

export interface JobRequest {
  id: number;
  kind: JobKind;
  objectId: string;
  /** Eigenzeit at which the result is used — never earlier, so a run does not depend on computing speed. */
  dueAt: number;
  /** copy/compress: keep at most this fraction of the triangles. */
  keep?: number;
  /** compress: an origin object's last compression, under the death limit whatever it takes (permissive, loose pieces dropped, largest triangles kept). */
  final?: boolean;
  /** compress: forced (permissive, loose pieces dropped, largest triangles kept if need be). */
  force?: boolean;
  /** crush: new crush level. */
  level?: number;
  /** split: seed for the plane. */
  seed?: number;
  /** copy: where the new object will stand (decided at request time, so a run stays deterministic). */
  spawn?: { pos: Vec3; rotY: number };
  /** split: horizontal direction the two halves move apart. */
  apart?: number;
  /** copy: generation of the new Keimling (its parent's, or the next one). */
  generation?: number;
  /** copy: voxelize with this many cells over the largest side instead of reducing. */
  voxelCells?: number;
  /** fuse: hart (exact union) or weich (rounded, slow). */
  fuseMode?: "hart" | "weich";
  /** Test track step this job carries out (see sim/recipes.ts): p2 … p13d, or "copy"/"reduce". */
  recipe?: string;
  /** fuse: accepted overlap (glb-fuse --overlap) and what follows the union. */
  overlap?: string;
  fusePost?: FusePost;
  /** split: what happens to the halves. */
  halving?: HalvingRecipe;
  /** fuse: the object that travels to objectId and merges into it. */
  partnerId?: string;
  /** fuse: scale of the partner after growing to the larger one's height. */
  /** copy: one of the first Keimlinge (Vorläufer), placed close to the others when it arrives. */
  pioneer?: boolean;
  /** copy: used as soon as it is ready, no computing lead (Vorläufer, first round of plain Keimlinge). */
  immediate?: boolean;
  /** copy, recipe p2: stylize to this many faces instead of STYLIZE_COPY.faces. */
  faces?: number;
}

export interface JobResult {
  jobId: number;
  outputs: ModelVersion[]; // split: two, all others: one
  /** fuse: where B's model ended up inside the result (column-major, B's file → result). */
  bMatrix?: number[];
}

export interface SimEvent {
  eigen: number;
  calendar: number;
  type: string;
  text: string;
  objectId?: string;
}

export interface Sample {
  eigen: number;
  calendar: number;
  triangles: number;
  factor: number;
  counts: Record<ObjectState, number>;
  /** Living objects only. */
  kinds: Record<ObjectKind, number>;
}

/** Something a scenario lets happen on a calendar day. */
export type ScheduledEntry =
  | { at: number; type: "foto"; id?: string; pos: Vec3; lifetime?: number }
  | { at: number; type: "zeichnung"; id?: string; pos: Vec3; lifetime?: number; color?: string }
  | { at: number; type: "sperren" | "loeschen"; photoId: string }
  | { at: number; type: "besucher"; count: number };

export interface Starter {
  name: string;
  model: ModelVersion;
  pos: Vec3;
  rotY?: number;
}

export interface Scenario {
  name: string;
  seed: number;
  starters: Starter[];
  timeline: ScheduledEntry[];
}

export interface World {
  scenarioName: string;
  params: Params;
  seed: number;
  rngState: number;
  eigen: number;
  calendar: number;
  objects: PlantObject[];
  photos: Photo[];
  drawings: Drawing[];
  boosts: Boost[];
  viewers: number;
  plantingPoint: Vec3;
  /** The descent's three magnetic points: corners of a triangle around the origin objects, fixed when planted. */
  gatherPoints: Vec3[];
  /** Polygon budget and the two thresholds, from the planted origin objects' triangles (params budget*). */
  budget: number;
  compressAt: number;
  halvingAt: number;
  plateauMax: number;
  phase: "wachstum" | "plateau" | "abstieg" | "verfall" | "ende";
  compressAccount: number;
  compressSpan: number;
  nextDescentCompressAt: number;
  nextHalvingAt: number | null;
  jobs: JobRequest[]; // requested, not yet applied
  /** Eigenzeit each origin line forms its next Keimling. */
  nextSpawnAt: Record<string, number>;
  /** Copies made per origin line and generation: "flamingo:4" → 2. */
  generationCounts: Record<string, number>;
  /** Eigenzeit the plateau was reached (null before). */
  plateauSince: number | null;
  /** Eigenzeit the voxel generations began: the count rose above halvingAt during growth (null before). */
  voxelSince: number | null;
  /** The first Keimlinge still to be requested: origin object, generation, Eigenzeit. */
  pioneerQueue: { origin: string; generation: number; at: number }[];
  /** Origin lines whose first plain Keimling has been requested (that one has no computing lead). */
  firstRoundDone: Record<string, boolean>;
  /** The Vorläufer's opening fusions: first pair, a second pair halfway through, then the first result with the last one. */
  opening: { stage: "warten" | "erstes" | "zweites" | "drittes" | "fertig"; first: number | null; firstA: string | null };
  /** Eigenzeit halving began (null before): its rate rises from there. */
  halvingSince: number | null;
  pairs: Pair[];
  /** How often each test track step was applied in this run. */
  stepsSeen: Record<string, number>;
  /** The object carried through the whole fusion chain (Phase 3 … 10), protected until done. */
  champion: string | null;
  nextChainAt: number;
  /** The piece carried through the whole halving chain (Phase 11 … 13, thirds); "fertig" once one has. */
  halvingChain: string | null;
  nextJobId: number;
  nextId: number;
  events: SimEvent[];
  samples: Sample[];
  nextSampleAt: number;
  /** Scenario entries still waiting for their calendar day. */
  scheduled: ScheduledEntry[];
  factor: number;
  /** Time factor of the fast line: the boosts act more strongly on it right after planting (fastEarly*, fastContent*). */
  fastFactor: number;
  factorParts: { inhalt: number; ereignisse: number; hinschauen: number };
  /** Calendar day a device was last in the radius; unwatchedPauseDays later all boosts pause. */
  lastWatched: number;
  boostsPaused: boolean;
  /** unwatchedSlowDays without a device: time factor unwatchedSlowFactor. */
  slowed: boolean;
}
