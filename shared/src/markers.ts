import type { EditMarker, PointMarker, RangeMarker } from "./types";
import { DEFAULT_POST, DEFAULT_PRE } from "./types";
import { roundMs, toMs } from "./time";

/** The time a marker is anchored at on the CHZZK timeline (point time / range start). */
export function markerAnchor(m: EditMarker): number {
  return m.type === "point" ? m.time : m.start;
}

/** The edit-relevant interval [start, end] in CHZZK seconds. */
export function markerInterval(m: EditMarker): { start: number; end: number } {
  if (m.type === "point") {
    return { start: roundMs(m.time - m.pre), end: roundMs(m.time + m.post) };
  }
  return { start: m.start, end: m.end };
}

/** Exact duration in seconds (computed in integer ms). */
export function markerDuration(m: EditMarker): number {
  const { start, end } = markerInterval(m);
  return (toMs(end) - toMs(start)) / 1000;
}

/** Stable ascending order by CHZZK timestamp; ties broken by createdAt then id. */
export function compareMarkers(a: EditMarker, b: EditMarker): number {
  const d = toMs(markerAnchor(a)) - toMs(markerAnchor(b));
  if (d !== 0) return d;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortMarkers<T extends EditMarker>(markers: readonly T[]): T[] {
  return [...markers].sort(compareMarkers);
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback (RFC4122 v4 layout) for hosts without randomUUID.
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += hex[(Math.random() * 4) | 8];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}

export function createPoint(
  time: number,
  comment: string,
  pre = DEFAULT_PRE,
  post = DEFAULT_POST,
  now = new Date(),
): PointMarker {
  return {
    id: newId(),
    type: "point",
    time: roundMs(Math.max(0, time)),
    pre: roundMs(Math.max(0, pre)),
    post: roundMs(Math.max(0, post)),
    comment,
    createdAt: now.toISOString(),
  };
}

/** Creates a range; start/end are swapped if given in reverse order. */
export function createRange(start: number, end: number, comment: string, now = new Date()): RangeMarker {
  const a = roundMs(Math.max(0, Math.min(start, end)));
  const b = roundMs(Math.max(0, Math.max(start, end)));
  return { id: newId(), type: "range", start: a, end: b, comment, createdAt: now.toISOString() };
}

/** First non-empty line of the comment, trimmed and shortened. Used as Premiere marker name. */
export function commentSummary(comment: string, maxLength = 60): string {
  const line = comment
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  const chars = Array.from(line);
  return chars.length > maxLength ? chars.slice(0, maxLength - 1).join("") + "…" : line;
}
