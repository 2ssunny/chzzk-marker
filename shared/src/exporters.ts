import type { EditMarker, MarkerFile, VodInfo } from "./types";
import { SCHEMA_VERSION } from "./types";
import { formatTime } from "./time";
import { sortMarkers } from "./markers";

export const GENERATOR = "chzzk-edit-marker/0.1.0";

/** Time label used in the human-readable TXT: "5:18:48" or "5:43:00 ~ 6:43:00". */
export function txtTimeLabel(m: EditMarker): string {
  const f = (t: number) => formatTime(t, { compactHours: true });
  return m.type === "point" ? f(m.time) : `${f(m.start)} ~ ${f(m.end)}`;
}

function normalizeComment(comment: string): string {
  return comment
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

/**
 * Build the edit-guide TXT (paste-ready for Discord/Notion/messengers).
 *
 *   [Project title]
 *
 *   5:16:00
 *   comment line 1
 *   comment line 2
 *
 *   5:43:00 ~ 6:43:00
 *   ...
 */
export function buildTxt(projectTitle: string, markers: readonly EditMarker[]): string {
  const blocks: string[] = [];
  const title = projectTitle.trim();
  if (title) blocks.push(`[${title}]`);
  for (const m of sortMarkers(markers)) {
    const comment = normalizeComment(m.comment);
    blocks.push(comment ? `${txtTimeLabel(m)}\n${comment}` : txtTimeLabel(m));
  }
  return blocks.join("\n\n") + "\n";
}

export function buildMarkerFile(
  projectTitle: string,
  vod: VodInfo,
  markers: readonly EditMarker[],
  now = new Date(),
): MarkerFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectTitle,
    vod: { url: vod.url, title: vod.title, id: vod.id },
    markers: sortMarkers(markers).map(cleanMarker),
    exportedAt: now.toISOString(),
    generator: GENERATOR,
  };
}

/** Keep only schema fields, in a stable key order. */
function cleanMarker(m: EditMarker): EditMarker {
  const common = { comment: m.comment, createdAt: m.createdAt, ...(m.updatedAt ? { updatedAt: m.updatedAt } : {}) };
  return m.type === "point"
    ? { id: m.id, type: "point", time: m.time, pre: m.pre, post: m.post, ...common }
    : { id: m.id, type: "range", start: m.start, end: m.end, ...common };
}

export function serializeMarkerFile(file: MarkerFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

/** Filesystem-safe base name: "<title>_<vodId>". */
export function exportBaseName(projectTitle: string, vodId: string | null): string {
  const safe = projectTitle
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const parts = [safe || "chzzk-markers"];
  if (vodId) parts.push(vodId);
  return parts.join("_");
}
