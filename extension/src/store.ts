/**
 * Per-VOD marker projects persisted in chrome.storage.local.
 *
 * Every mutation is a read-modify-write against storage so that two tabs of the
 * same VOD don't silently drop each other's markers, and it is written
 * immediately (no batching) so a crash or tab close loses nothing.
 */
import type { EditMarker, MarkerFile, VodInfo } from "../../shared/src/types";
import { sortMarkers } from "../../shared/src/markers";

export const PROJECT_SCHEMA_VERSION = 1;

export interface VodProject {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  vodId: string;
  vodUrl: string;
  vodTitle: string;
  projectTitle: string;
  /** True once the user typed a title; auto-detected VOD titles then stop overwriting it. */
  titleEdited: boolean;
  markers: EditMarker[];
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  defaultPre: number;
  defaultPost: number;
  sidebarOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = { defaultPre: 10, defaultPost: 20, sidebarOpen: false };

export const projectKey = (vodId: string) => `project:${vodId}`;
const SETTINGS_KEY = "settings";

/** Minimal async key-value interface (chrome.storage.local compatible) so logic is testable. */
export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const chromeKV: KV = {
  async get(key) {
    const res = await chrome.storage.local.get(key);
    return res[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
};

export function emptyProject(vod: VodInfo & { id: string }, now = new Date()): VodProject {
  const iso = now.toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    vodId: vod.id,
    vodUrl: vod.url,
    vodTitle: vod.title,
    projectTitle: vod.title,
    titleEdited: false,
    markers: [],
    createdAt: iso,
    updatedAt: iso,
  };
}

// ---- pure operations -------------------------------------------------------

export function upsertMarker(p: VodProject, marker: EditMarker, now = new Date()): VodProject {
  const others = p.markers.filter((m) => m.id !== marker.id);
  return { ...p, markers: sortMarkers([...others, marker]), updatedAt: now.toISOString() };
}

export function removeMarker(p: VodProject, id: string, now = new Date()): VodProject {
  return { ...p, markers: p.markers.filter((m) => m.id !== id), updatedAt: now.toISOString() };
}

export function setProjectTitle(p: VodProject, title: string, now = new Date()): VodProject {
  return { ...p, projectTitle: title, titleEdited: true, updatedAt: now.toISOString() };
}

/** Refresh auto-detected VOD metadata without clobbering a user-edited title. */
export function applyVodMetadata(p: VodProject, vod: VodInfo): VodProject {
  const title = vod.title || p.vodTitle;
  const next = { ...p, vodUrl: vod.url || p.vodUrl, vodTitle: title };
  if (!p.titleEdited && !p.projectTitle && title) next.projectTitle = title;
  return next;
}

/** Merge an imported file: markers with the same id are replaced, others added. */
export function mergeImport(
  p: VodProject,
  file: MarkerFile,
  now = new Date(),
): { project: VodProject; added: number; replaced: number } {
  const existing = new Set(p.markers.map((m) => m.id));
  let added = 0;
  let replaced = 0;
  for (const m of file.markers) existing.has(m.id) ? replaced++ : added++;
  const incoming = new Set(file.markers.map((m) => m.id));
  const markers = sortMarkers([...p.markers.filter((m) => !incoming.has(m.id)), ...file.markers]);
  const next: VodProject = { ...p, markers, updatedAt: now.toISOString() };
  if (file.projectTitle && (!p.titleEdited || !p.projectTitle)) {
    next.projectTitle = file.projectTitle;
    next.titleEdited = true;
  }
  return { project: next, added, replaced };
}

function isProject(v: unknown): v is VodProject {
  return typeof v === "object" && v !== null && Array.isArray((v as VodProject).markers) && typeof (v as VodProject).vodId === "string";
}

// ---- repository -----------------------------------------------------------

export class ProjectRepository {
  constructor(private kv: KV = chromeKV) {}

  async load(vodId: string): Promise<VodProject | null> {
    const v = await this.kv.get(projectKey(vodId));
    return isProject(v) ? v : null;
  }

  async save(p: VodProject): Promise<void> {
    await this.kv.set(projectKey(p.vodId), p);
  }

  /**
   * Read the latest stored project (or `fallback` if none), apply `fn`, persist.
   * Returns the saved project.
   */
  async update(vodId: string, fallback: () => VodProject, fn: (p: VodProject) => VodProject): Promise<VodProject> {
    const current = (await this.load(vodId)) ?? fallback();
    const next = fn(current);
    await this.save(next);
    return next;
  }

  async loadSettings(): Promise<Settings> {
    const v = await this.kv.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(typeof v === "object" && v ? (v as Partial<Settings>) : {}) };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.loadSettings()), ...patch };
    await this.kv.set(SETTINGS_KEY, next);
    return next;
  }
}
