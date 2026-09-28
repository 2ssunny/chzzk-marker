/** Panel state: loaded marker file, selected sync marker, and the 1-point sync. Pure + serializable. */
import type { EditMarker, MarkerFile } from "../../shared/src/types";
import { markerAnchor, sortMarkers } from "../../shared/src/markers";
import { parseMarkerFile } from "../../shared/src/validate";
import { syncOffsetTicks, ticksToSeconds, type SyncPoint } from "../../shared/src/sync";
import { planMarkers, type PlannedMarker } from "./plan";
import type { SequenceInfo } from "./ppro";

export interface SyncState extends SyncPoint {
  markerId: string;
  sequenceName: string;
  sequenceGuid: string | null;
}

interface Persisted {
  v: 1;
  fileName: string;
  fileText: string;
  selectedId: string | null;
  sync: SyncState | null;
}

export class ImportSession {
  file: MarkerFile | null = null;
  fileName = "";
  private fileText = "";
  warnings: string[] = [];
  selectedId: string | null = null;
  sync: SyncState | null = null;

  /** Load marker.json text. On success replaces the file and clears the sync. */
  load(text: string, fileName: string): { ok: true } | { ok: false; error: string } {
    const res = parseMarkerFile(text);
    if (!res.ok) return { ok: false, error: res.errors.join("; ") };
    this.file = { ...res.file, markers: sortMarkers(res.file.markers) };
    this.fileText = text;
    this.fileName = fileName;
    this.warnings = res.warnings;
    this.sync = null;
    this.selectedId = this.file.markers[0]?.id ?? null;
    return { ok: true };
  }

  get markers(): EditMarker[] {
    return this.file?.markers ?? [];
  }

  get selected(): EditMarker | null {
    return this.markers.find((m) => m.id === this.selectedId) ?? null;
  }

  select(id: string): void {
    if (this.markers.some((m) => m.id === id)) this.selectedId = id;
  }

  /** "Sync Here": the selected CHZZK marker corresponds to the given Premiere playhead. */
  setSync(playheadTicks: bigint, seq: SequenceInfo): SyncState {
    const m = this.selected;
    if (!m) throw new Error("Select a CHZZK marker first");
    this.sync = {
      chzzkTime: markerAnchor(m),
      premiereTicks: playheadTicks.toString(),
      markerId: m.id,
      sequenceName: seq.name,
      sequenceGuid: seq.guid,
    };
    return this.sync;
  }

  /** premiereSyncTime - chzzkSyncTime, in seconds. */
  get offsetSeconds(): number | null {
    return this.sync ? ticksToSeconds(syncOffsetTicks(this.sync)) : null;
  }

  /** Whether the stored sync was made on this sequence. */
  syncMatches(seq: SequenceInfo): boolean {
    if (!this.sync) return false;
    if (this.sync.sequenceGuid && seq.guid) return this.sync.sequenceGuid === seq.guid;
    return this.sync.sequenceName === seq.name;
  }

  plan(seq: SequenceInfo, existingIds: ReadonlySet<string>): PlannedMarker[] {
    if (!this.sync) throw new Error("Not synced");
    return planMarkers(this.markers, this.sync, {
      sequenceEndTicks: seq.endTicks,
      ticksPerFrame: seq.ticksPerFrame,
      existingIds,
    });
  }

  serialize(): string {
    const p: Persisted = { v: 1, fileName: this.fileName, fileText: this.fileText, selectedId: this.selectedId, sync: this.sync };
    return JSON.stringify(p);
  }

  static restore(json: string | null): ImportSession {
    const s = new ImportSession();
    if (!json) return s;
    try {
      const p = JSON.parse(json) as Persisted;
      if (p.v !== 1 || !p.fileText) return s;
      if (!s.load(p.fileText, p.fileName).ok) return s;
      if (p.selectedId) s.select(p.selectedId);
      if (p.sync && typeof p.sync.premiereTicks === "string") s.sync = p.sync;
    } catch {
      /* corrupt state → start fresh */
    }
    return s;
  }
}
