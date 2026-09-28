/**
 * Pure planning logic: CHZZK markers + sync point → Premiere marker specs.
 * No Premiere API calls here, so everything is unit-testable.
 *
 * Range policy (reported in the UI):
 *   - entirely before sequence start (end ≤ 0)       → skipped
 *   - partially before sequence start               → start clamped to 0, end kept
 *   - starts at/after sequence end (when end known)  → skipped
 *   - extends past sequence end                      → duration clamped to the end
 *   - CHZZK_MARKER_ID already present in sequence    → skipped as duplicate
 */
import type { EditMarker } from "../../shared/src/types";
import { commentSummary, markerDuration, markerInterval } from "../../shared/src/markers";
import { formatTime } from "../../shared/src/time";
import { mapToPremiereTicks, secondsToTicks, type SyncPoint } from "../../shared/src/sync";

export const ID_TAG = "CHZZK_MARKER_ID:";
const ID_RE = /CHZZK_MARKER_ID:\s*([^\s]+)/g;

export type PlanStatus = "add" | "clamped" | "duplicate" | "before-start" | "after-end";

export interface PlannedMarker {
  marker: EditMarker;
  status: PlanStatus;
  name: string;
  comments: string;
  /** Sequence ticks (only meaningful for "add" / "clamped"). */
  startTicks: bigint;
  durationTicks: bigint;
  note?: string;
}

export interface PlanOptions {
  /** Sequence end in ticks; null/0 = unknown (no after-end check). */
  sequenceEndTicks?: bigint | null;
  /** Ticks per frame for frame alignment; null = no alignment. */
  ticksPerFrame?: bigint | null;
  /** CHZZK marker ids already present in the sequence's marker comments. */
  existingIds?: ReadonlySet<string>;
}

export interface PlanSummary {
  total: number;
  toApply: number;
  clamped: number;
  duplicate: number;
  beforeStart: number;
  afterEnd: number;
}

/** Extract CHZZK marker ids from existing Premiere marker comments. */
export function extractMarkerIds(comments: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const c of comments) for (const m of c.matchAll(ID_RE)) ids.add(m[1]);
  return ids;
}

export function markerName(m: EditMarker): string {
  const summary = commentSummary(m.comment, 60);
  if (summary) return summary;
  return m.type === "point" ? `CHZZK ${formatTime(m.time)}` : `CHZZK ${formatTime(m.start)} ~ ${formatTime(m.end)}`;
}

/** Premiere marker comment: CHZZK timestamp, context info, full comment, id tag. */
export function markerComments(m: EditMarker): string {
  const f = (t: number) => formatTime(t, { ms: true });
  const head =
    m.type === "point"
      ? [`CHZZK: ${f(m.time)}`, `Pre: ${m.pre}s`, `Post: ${m.post}s`]
      : [`CHZZK: ${f(m.start)} ~ ${f(m.end)}`, `Duration: ${f(m.end - m.start)}`];
  const body = m.comment.replace(/\r\n?/g, "\n").trim();
  return [...head, "", ...(body ? [body, ""] : []), `${ID_TAG} ${m.id}`].join("\n");
}

function alignToFrame(ticks: bigint, tpf: bigint | null | undefined): bigint {
  if (!tpf || tpf <= 0n) return ticks;
  const neg = ticks < 0n;
  const abs = neg ? -ticks : ticks;
  const aligned = ((abs + tpf / 2n) / tpf) * tpf;
  return neg ? -aligned : aligned;
}

export function planMarkers(markers: readonly EditMarker[], sync: SyncPoint, opts: PlanOptions = {}): PlannedMarker[] {
  const end = opts.sequenceEndTicks && opts.sequenceEndTicks > 0n ? opts.sequenceEndTicks : null;
  const existing = opts.existingIds ?? new Set<string>();
  return markers.map((marker) => {
    const name = markerName(marker);
    const comments = markerComments(marker);
    const interval = markerInterval(marker);
    // Align start and duration (not end) so every marker keeps its exact length.
    let start = alignToFrame(mapToPremiereTicks(sync, interval.start), opts.ticksPerFrame);
    let stop = start + alignToFrame(secondsToTicks(markerDuration(marker)), opts.ticksPerFrame);
    const base = { marker, name, comments };

    if (existing.has(marker.id)) {
      return { ...base, status: "duplicate", startTicks: start, durationTicks: stop - start, note: "already imported" };
    }
    if (stop <= 0n && !(stop === 0n && start === 0n)) {
      return { ...base, status: "before-start", startTicks: start, durationTicks: stop - start, note: "before sequence start" };
    }
    if (end !== null && start >= end) {
      return { ...base, status: "after-end", startTicks: start, durationTicks: stop - start, note: "after sequence end" };
    }
    const notes: string[] = [];
    if (start < 0n) {
      start = 0n;
      notes.push("start clamped to sequence start");
    }
    if (end !== null && stop > end) {
      stop = end;
      notes.push("end clamped to sequence end");
    }
    return {
      ...base,
      status: notes.length ? "clamped" : "add",
      startTicks: start,
      durationTicks: stop > start ? stop - start : 0n,
      ...(notes.length ? { note: notes.join(", ") } : {}),
    };
  });
}

export function summarize(plan: readonly PlannedMarker[]): PlanSummary {
  const count = (s: PlanStatus) => plan.filter((p) => p.status === s).length;
  return {
    total: plan.length,
    toApply: count("add") + count("clamped"),
    clamped: count("clamped"),
    duplicate: count("duplicate"),
    beforeStart: count("before-start"),
    afterEnd: count("after-end"),
  };
}

export function isApplicable(p: PlannedMarker): boolean {
  return p.status === "add" || p.status === "clamped";
}
