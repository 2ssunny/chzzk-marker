/**
 * Canonical data model shared by the Chrome extension and the Premiere plugin.
 *
 * All times are numbers in seconds (VOD timeline of the CHZZK replay),
 * rounded to millisecond precision. Display strings are never stored.
 */

export const SCHEMA_VERSION = 1 as const;

export type MarkerType = "point" | "range";

interface MarkerBase {
  /** Stable unique id (UUID). Also written into Premiere marker comments for duplicate detection. */
  id: string;
  comment: string;
  /** ISO8601 */
  createdAt: string;
  /** ISO8601, set when the marker is edited. */
  updatedAt?: string;
}

/** A key moment plus pre/post context in seconds. Interest window = [time - pre, time + post]. */
export interface PointMarker extends MarkerBase {
  type: "point";
  time: number;
  pre: number;
  post: number;
}

/** An explicit start~end range in seconds (end > start). */
export interface RangeMarker extends MarkerBase {
  type: "range";
  start: number;
  end: number;
}

export type EditMarker = PointMarker | RangeMarker;

export interface VodInfo {
  url: string;
  title: string;
  /** CHZZK video number from /video/{id}; null when it could not be derived. */
  id: string | null;
}

/** The official interchange format (marker.json). */
export interface MarkerFile {
  schemaVersion: typeof SCHEMA_VERSION;
  projectTitle: string;
  vod: VodInfo;
  markers: EditMarker[];
  /** ISO8601, informational. */
  exportedAt?: string;
  /** Tool that wrote the file, informational. */
  generator?: string;
}

export const DEFAULT_PRE = 10;
export const DEFAULT_POST = 20;
