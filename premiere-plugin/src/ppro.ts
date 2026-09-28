/**
 * Thin bridge over the Premiere Pro UXP API (`require("premierepro")`, Premiere 25.6+).
 * This is the only module that talks to Premiere; everything else is pure logic.
 *
 * APIs used (all documented in the official Premiere UXP reference, since 25.6):
 *   Project.getActiveProject(), project.getActiveSequence(), project.lockedAccess(),
 *   project.executeTransaction(), sequence.getPlayerPosition()/setPlayerPosition(),
 *   sequence.getEndTime(), sequence.getSettings() → getVideoFrameRate().ticksPerFrame,
 *   Markers.getMarkers(sequence), markers.getMarkers(), marker.getComments(),
 *   markers.createAddMarkerAction(name, type, start, duration, comments),
 *   Marker.MARKER_TYPE_COMMENT, TickTime.createWithTicks().
 */
import type { premierepro, Project, Sequence } from "@adobe/premierepro";
import { extractMarkerIds, type PlannedMarker } from "./plan";
import { parseTicks } from "../../shared/src/sync";

export type PproModule = Pick<premierepro, "Project" | "Markers" | "Marker" | "TickTime">;

export interface ActiveContext {
  project: Project;
  sequence: Sequence;
}

export interface SequenceInfo {
  name: string;
  guid: string | null;
  endTicks: bigint | null;
  ticksPerFrame: bigint | null;
}

export interface ApplyResult {
  added: string[];
  failed: { id: string; error: string }[];
  /** "batch" = one undoable transaction; "per-marker" = fallback after a batch failure. */
  mode: "batch" | "per-marker";
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class PremiereBridge {
  constructor(private ppro: PproModule) {}

  /** Active project + sequence, or null when either is missing. */
  async getActive(): Promise<ActiveContext | null> {
    const project = await this.ppro.Project.getActiveProject();
    if (!project) return null;
    const sequence = await project.getActiveSequence();
    if (!sequence) return null;
    return { project, sequence };
  }

  async getPlayheadTicks(sequence: Sequence): Promise<bigint> {
    const pos = await sequence.getPlayerPosition();
    return parseTicks(pos.ticks);
  }

  async setPlayheadTicks(sequence: Sequence, ticks: bigint): Promise<boolean> {
    return sequence.setPlayerPosition(this.ppro.TickTime.createWithTicks((ticks < 0n ? 0n : ticks).toString()));
  }

  async getSequenceInfo(sequence: Sequence): Promise<SequenceInfo> {
    let guid: string | null = null;
    let endTicks: bigint | null = null;
    let ticksPerFrame: bigint | null = null;
    try {
      guid = sequence.guid?.toString() ?? null;
    } catch {
      /* optional */
    }
    try {
      endTicks = parseTicks((await sequence.getEndTime()).ticks);
    } catch {
      /* unknown end → no after-end check */
    }
    try {
      const tpf = (await sequence.getSettings()).getVideoFrameRate().ticksPerFrame;
      if (Number.isFinite(tpf) && tpf > 0) ticksPerFrame = BigInt(Math.round(tpf));
    } catch {
      /* no frame alignment */
    }
    return { name: sequence.name, guid, endTicks, ticksPerFrame };
  }

  /** CHZZK marker ids already imported into this sequence (read from marker comments). */
  async getExistingIds(sequence: Sequence): Promise<Set<string>> {
    const markers = await this.ppro.Markers.getMarkers(sequence);
    const comments: string[] = [];
    for (const m of markers.getMarkers()) {
      try {
        comments.push(m.getComments());
      } catch {
        /* ignore unreadable marker */
      }
    }
    return extractMarkerIds(comments);
  }

  /**
   * Add markers to the sequence. Tries one undoable transaction first; if that
   * fails, falls back to one transaction per marker so a single bad marker
   * cannot block the rest.
   */
  async addMarkers(ctx: ActiveContext, items: readonly PlannedMarker[]): Promise<ApplyResult> {
    const { project, sequence } = ctx;
    const { Marker, TickTime } = this.ppro;
    const markers = await this.ppro.Markers.getMarkers(sequence);
    const makeAction = (p: PlannedMarker) =>
      markers.createAddMarkerAction(
        p.name,
        Marker.MARKER_TYPE_COMMENT,
        TickTime.createWithTicks(p.startTicks.toString()),
        TickTime.createWithTicks(p.durationTicks.toString()),
        p.comments,
      );

    const result: ApplyResult = { added: [], failed: [], mode: "batch" };
    const creationFailed = new Map<string, string>();
    let batchOk = false;
    try {
      project.lockedAccess(() => {
        batchOk = project.executeTransaction((compound) => {
          for (const p of items) {
            try {
              compound.addAction(makeAction(p));
            } catch (e) {
              creationFailed.set(p.marker.id, errMsg(e));
            }
          }
        }, "Import CHZZK markers");
      });
    } catch {
      batchOk = false;
    }

    if (batchOk) {
      for (const p of items) {
        const err = creationFailed.get(p.marker.id);
        if (err) result.failed.push({ id: p.marker.id, error: err });
        else result.added.push(p.marker.id);
      }
      return result;
    }

    result.mode = "per-marker";
    // Never double-add if the failed batch still left some markers behind.
    let present = new Set<string>();
    try {
      present = await this.getExistingIds(sequence);
    } catch {
      /* best effort */
    }
    for (const p of items) {
      if (present.has(p.marker.id)) {
        result.added.push(p.marker.id);
        continue;
      }
      try {
        let ok = false;
        project.lockedAccess(() => {
          ok = project.executeTransaction((compound) => compound.addAction(makeAction(p)), `Add CHZZK marker: ${p.name}`);
        });
        if (ok) result.added.push(p.marker.id);
        else result.failed.push({ id: p.marker.id, error: "transaction failed" });
      } catch (e) {
        result.failed.push({ id: p.marker.id, error: errMsg(e) });
      }
    }
    return result;
  }
}
