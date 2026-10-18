// The simulation's world state. Shaped like the documents the platform would
// later store, with metre coordinates (x east, z south, y up) instead of GPS.
import type { Params } from "../params";

export type Vec3 = [number, number, number];

/** Keimling = copy phase, aktiv = may take photos (later: attract + fuse),
 *  verwelkend = halved or carrying a photo, tot = lingers, then removed. */
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
  bornAt: number; // Eigenzeit
  grow: number; // 0…1, rising out of the ground
  copiesLeft: number;
  nextCopyAt: number;
  busy: boolean; // a geometry job for this object is running
  photo: { photoId: string; since: number; halvedSince: boolean } | null;
  crushLevel: number;
  nextCrushAt: number;
  deadSince: number | null;
  /** Reserved fusion partner — irrevocable once chosen. */
  pairedWith: string | null;
  /** How many fusions this object is made of. */
  fusions: number;
  /** How many halvings lie behind this object. */
  halvings: number;
  /** Planted origin object: copies itself, but stands outside the active
   *  ecosystem (no budget, no fusion, no photos) and only mirrors its state. */
  origin: boolean;
  originalTriangles: number;
  /** Uniform scale of the model (fusion: the smaller one grows to the larger one's height). */
  scale: number;
  /** Height of the object's underside above the ground (m); negative = sunk in. */
  lift: number;
}

/** History of an object, for counting: Keimling, untouched, fused n times, halved. */
export type ObjectKind = "ursprung" | "keimling" | "unveraendert" | "v1" | "v2" | "v3" | "v4" | "halbiert";

/** Two objects that have decided to fuse: B travels to A, the fused model is computed meanwhile. */
export interface Pair {
  a: string;
  b: string;
  jobId: number;
  start: number; // Eigenzeit
  duration: number;
  from: Vec3;
  to: Vec3;
  result: ModelVersion | null;
}

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

export type JobKind = "copy" | "compress" | "split" | "crush" | "fuse";

export interface JobRequest {
  id: number;
  kind: JobKind;
  objectId: string;
  /** copy/compress: keep at most this fraction of the triangles. */
  keep?: number;
  /** crush: new crush level. */
  level?: number;
  /** split: seed for the plane. */
  seed?: number;
  /** copy: where the new object will stand (decided at request time, so a run stays deterministic). */
  spawn?: { pos: Vec3; rotY: number };
  /** split: horizontal direction the two halves move apart. */
  apart?: number;
  /** fuse: the object that travels to objectId and merges into it. */
  partnerId?: string;
  /** fuse: scale of the partner after growing to the larger one's height. */
  partnerScale?: number;
}

export interface JobResult {
  jobId: number;
  outputs: ModelVersion[]; // split: two, all others: one
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
  plateauMax: number;
  phase: "wachstum" | "plateau" | "abstieg" | "verfall" | "ende";
  compressAccount: number;
  compressSpan: number;
  nextDescentCompressAt: number;
  nextHalvingAt: number | null;
  jobs: JobRequest[]; // requested, not yet applied
  pairs: Pair[];
  nextJobId: number;
  nextId: number;
  events: SimEvent[];
  samples: Sample[];
  nextSampleAt: number;
  /** Scenario entries still waiting for their calendar day. */
  scheduled: ScheduledEntry[];
  factor: number;
  factorParts: { inhalt: number; ereignisse: number; hinschauen: number };
}
