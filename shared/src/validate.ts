/**
 * Dependency-free validator for marker.json (schemaVersion 1).
 * Mirrors shared/schema/marker-file.schema.json.
 *
 * File-level problems make the whole file invalid. Problems with a single
 * marker only drop that marker and are reported as warnings, so one bad entry
 * never blocks an import.
 */
import type { EditMarker, MarkerFile } from "./types";
import { SCHEMA_VERSION } from "./types";
import { roundMs } from "./time";

export type ParseResult =
  | { ok: true; file: MarkerFile; warnings: string[] }
  | { ok: false; errors: string[] };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isTime(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function parseMarker(raw: unknown, index: number): { marker?: EditMarker; error?: string } {
  const where = `markers[${index}]`;
  if (!isObj(raw)) return { error: `${where}: not an object` };
  if (typeof raw.id !== "string" || !raw.id) return { error: `${where}: missing id` };
  const base = {
    id: raw.id,
    comment: str(raw.comment),
    createdAt: str(raw.createdAt, new Date(0).toISOString()),
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
  };
  if (raw.type === "point") {
    if (!isTime(raw.time)) return { error: `${where} (${raw.id}): invalid time` };
    const pre = raw.pre === undefined ? 0 : raw.pre;
    const post = raw.post === undefined ? 0 : raw.post;
    if (!isTime(pre) || !isTime(post)) return { error: `${where} (${raw.id}): invalid pre/post` };
    return {
      marker: { ...base, type: "point", time: roundMs(raw.time), pre: roundMs(pre), post: roundMs(post) },
    };
  }
  if (raw.type === "range") {
    if (!isTime(raw.start) || !isTime(raw.end)) return { error: `${where} (${raw.id}): invalid start/end` };
    if (raw.end < raw.start) return { error: `${where} (${raw.id}): end is before start` };
    return { marker: { ...base, type: "range", start: roundMs(raw.start), end: roundMs(raw.end) } };
  }
  return { error: `${where} (${raw.id}): unknown type ${JSON.stringify(raw.type)}` };
}

/** Accepts the JSON text (BOM tolerated) or an already-parsed value. */
export function parseMarkerFile(input: string | unknown): ParseResult {
  let data: unknown = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input.replace(/^﻿/, ""));
    } catch (e) {
      return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
    }
  }
  if (!isObj(data)) return { ok: false, errors: ["Root must be an object"] };
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`Unsupported schemaVersion ${JSON.stringify(data.schemaVersion)} (expected ${SCHEMA_VERSION})`],
    };
  }
  if (!Array.isArray(data.markers)) return { ok: false, errors: ["markers must be an array"] };

  const vodRaw = isObj(data.vod) ? data.vod : {};
  const vodId = vodRaw.id;
  const file: MarkerFile = {
    schemaVersion: SCHEMA_VERSION,
    projectTitle: str(data.projectTitle),
    vod: {
      url: str(vodRaw.url),
      title: str(vodRaw.title),
      id: typeof vodId === "string" && vodId ? vodId : typeof vodId === "number" ? String(vodId) : null,
    },
    markers: [],
    ...(typeof data.exportedAt === "string" ? { exportedAt: data.exportedAt } : {}),
    ...(typeof data.generator === "string" ? { generator: data.generator } : {}),
  };

  const warnings: string[] = [];
  const seen = new Set<string>();
  data.markers.forEach((raw, i) => {
    const { marker, error } = parseMarker(raw, i);
    if (error) warnings.push(`Skipped ${error}`);
    else if (marker && seen.has(marker.id)) warnings.push(`Skipped markers[${i}]: duplicate id ${marker.id}`);
    else if (marker) {
      seen.add(marker.id);
      file.markers.push(marker);
    }
  });
  return { ok: true, file, warnings };
}
