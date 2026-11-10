// The tape (tape.jsonl in a run folder): everything that decides a run, in
// order: the size of every step (equal steps in a row as one line), every
// result when it arrives, results used while the clock waits for another one,
// failed jobs, commands that change the world, and a checksum with every write.
// The simulation itself is deterministic, so this gives the same run again, at
// any speed and without computing. The sandbox server writes it and plays it
// (--replay); the replay export (sandbox/replay-export.ts) plays it to a file.
import { readFileSync } from "node:fs";
import type { JobRequest, JobResult, Vec3, World } from "../sim/types";
import { addComment, addDrawing, addPhoto, applyJob, removeComment, removePhoto, setViewers, totalTriangles, updateFactor } from "../sim/world";

export type TapeEntry =
  | { s: number; n: number } // n steps of s calendar days
  | { r: JobResult } // a result arrived
  | { a: number[] } // these results were used while the clock waited
  | { d: number } // this job failed
  | { c: Record<string, unknown> } // a command, with its random parts resolved
  | { k: [number, number, number] }; // checksum: Eigenzeit, triangles, objects

export const checksum = (w: World): [number, number, number] => [w.eigen, totalTriangles(w), w.objects.length];

export const readTape = (file: string): TapeEntry[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

/** A command that changes the world (live, or from the tape). */
export function applyWorldCommand(w: World, cmd: Record<string, unknown>) {
  switch (cmd.type) {
    case "viewers": setViewers(w, w.viewers + Number(cmd.delta ?? 0)); break;
    case "addPhoto": addPhoto(w, cmd.pos as Vec3); break;
    case "addDrawing": addDrawing(w, cmd.pos as Vec3); break;
    case "block": removePhoto(w, String(cmd.photoId), "gesperrt"); break;
    case "delete": removePhoto(w, String(cmd.photoId), "gelöscht"); break;
    case "addComment": addComment(w, cmd.pos as Vec3, String(cmd.text)); break;
    case "blockComment": removeComment(w, String(cmd.commentId), "gesperrt"); break;
    case "deleteComment": removeComment(w, String(cmd.commentId), "gelöscht"); break;
    default: throw new Error(`unbekannter Befehl ${String(cmd.type)}`);
  }
  updateFactor(w); // devices, photos, drawings and comments count at once, not only at the next step
}

/** Plays a tape on a world: every result is in `ready` from the start and used at its due time as recorded. */
export class TapePlayer {
  private at = 0;
  private stepsLeft = 0;
  diverged = false;
  readonly totalStepDays: number;

  constructor(
    private readonly w: World,
    private readonly tape: TapeEntry[],
    private readonly ready: Map<number, JobResult>,
    private readonly on: { command(c: Record<string, unknown>): void; drop(job: JobRequest): void },
  ) {
    for (const e of tape) if ("r" in e) ready.set(e.r.jobId, e.r);
    this.totalStepDays = tape.reduce((t, e) => t + ("s" in e ? e.s * e.n : 0), 0);
  }

  /** Plays the tape up to the next step; returns its size, or null at the end. */
  next(): number | null {
    const w = this.w;
    for (; this.at < this.tape.length; this.at++) {
      const e = this.tape[this.at];
      if ("s" in e) {
        if (!this.stepsLeft) this.stepsLeft = e.n;
        return e.s;
      }
      if ("a" in e) for (const id of e.a) { const r = this.ready.get(id); if (r) { this.ready.delete(id); applyJob(w, r); } }
      else if ("d" in e) { const job = w.jobs.find((j) => j.id === e.d); if (job) this.on.drop(job); }
      else if ("c" in e) this.on.command(e.c);
      else if ("k" in e && !this.diverged && (Math.abs(e.k[0] - w.eigen) > 1e-9 || e.k[1] !== totalTriangles(w) || e.k[2] !== w.objects.length)) {
        this.diverged = true;
        console.warn(`⚠ Wiedergabe weicht ab bei Kalendertag ${w.calendar.toFixed(3)}: aufgezeichnet ${JSON.stringify(e.k)}, jetzt ${JSON.stringify(checksum(w))}`);
      }
    }
    return null;
  }

  /** The step `next` returned is done. */
  stepDone() {
    if (--this.stepsLeft === 0) this.at++;
  }
}
