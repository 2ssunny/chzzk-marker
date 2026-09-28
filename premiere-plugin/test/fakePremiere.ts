/**
 * In-memory stand-in for the `premierepro` UXP module, shaped after the official
 * @adobe/premierepro typings (only the members PremiereBridge uses).
 * Used by unit tests and by the browser-based panel E2E test.
 */
export const TPS = 254016000000n;

export interface FakeMarker {
  name: string;
  type: string;
  start: string;
  duration: string;
  comments: string;
}

export interface FakeOptions {
  sequenceName?: string;
  endSeconds?: number;
  /** Ticks per frame as Premiere reports it (e.g. 8467200000 for 30fps). */
  ticksPerFrame?: number;
  playheadTicks?: bigint;
}

export function createFakePremiere(opts: FakeOptions = {}) {
  class FakeTickTime {
    constructor(readonly ticks: string) {}
    get ticksNumber() {
      return Number(this.ticks);
    }
    get seconds() {
      return Number(this.ticks) / Number(TPS);
    }
  }
  const TickTime = {
    createWithTicks: (t: string) => {
      if (!/^-?\d+$/.test(t)) throw new Error(`bad ticks ${t}`);
      return new FakeTickTime(t);
    },
    createWithSeconds: (s: number) => new FakeTickTime(String(Math.round(s * Number(TPS)))),
    TIME_ZERO: new FakeTickTime("0"),
  };

  const state = {
    markers: [] as FakeMarker[],
    playhead: opts.playheadTicks ?? 0n,
    transactions: [] as string[],
    /** Simulate a failing multi-action transaction (forces per-marker fallback). */
    failBatch: false,
    /** createAddMarkerAction throws for markers with this name. */
    throwOnName: null as string | null,
    hasSequence: true,
  };

  const markersObj = {
    getMarkers: () =>
      state.markers.map((m) => ({
        getName: () => m.name,
        getComments: () => m.comments,
        getType: () => m.type,
        getStart: () => new FakeTickTime(m.start),
        getDuration: () => new FakeTickTime(m.duration),
      })),
    createAddMarkerAction: (name: string, type: string, start: FakeTickTime, duration: FakeTickTime, comments: string) => {
      if (name === state.throwOnName) throw new Error(`cannot create ${name}`);
      return { apply: () => state.markers.push({ name, type, start: start.ticks, duration: duration.ticks, comments }) };
    },
  };

  const sequence = {
    name: opts.sequenceName ?? "Sequence 01",
    guid: { toString: () => "seq-guid-1" },
    getPlayerPosition: async () => new FakeTickTime(state.playhead.toString()),
    setPlayerPosition: async (t: FakeTickTime) => {
      state.playhead = BigInt(t.ticks);
      return true;
    },
    getEndTime: async () => new FakeTickTime((BigInt(Math.round((opts.endSeconds ?? 7200) * 1000)) * (TPS / 1000n)).toString()),
    getSettings: async () => ({
      getVideoFrameRate: () => ({ ticksPerFrame: opts.ticksPerFrame ?? 8467200000, value: Number(TPS) / (opts.ticksPerFrame ?? 8467200000) }),
    }),
  };

  const project = {
    getActiveSequence: async () => (state.hasSequence ? sequence : null),
    lockedAccess: (cb: () => void) => cb(),
    executeTransaction: (cb: (c: { addAction: (a: { apply: () => void }) => void }) => void, undo?: string) => {
      const actions: { apply: () => void }[] = [];
      cb({ addAction: (a) => actions.push(a) });
      if (state.failBatch && actions.length > 1) return false;
      actions.forEach((a) => a.apply());
      state.transactions.push(undo ?? "");
      return true;
    },
  };

  const module = {
    Project: { getActiveProject: async () => project },
    Markers: { getMarkers: async () => markersObj },
    Marker: { MARKER_TYPE_COMMENT: "Comment", MARKER_TYPE_CHAPTER: "Chapter" },
    TickTime,
  };
  return { module, state, sequence, project };
}
