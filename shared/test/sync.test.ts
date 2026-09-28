import { describe, expect, it } from "vitest";
import {
  TICKS_PER_SECOND,
  mapToPremiereSeconds,
  mapToPremiereTicks,
  secondsToTicks,
  syncOffsetTicks,
  ticksToSeconds,
  type SyncPoint,
} from "../src/sync";
import { formatSignedTime, formatTime, parseTime } from "../src/time";
import { markerDuration } from "../src/markers";
import type { RangeMarker } from "../src/types";

const t = (s: string) => {
  const v = parseTime(s);
  if (v === null) throw new Error(s);
  return v;
};

describe("1-point sync", () => {
  const sync: SyncPoint = { chzzkTime: t("05:16:18"), premiereTicks: secondsToTicks(t("00:54:52")).toString() };

  it("maps CHZZK 05:18:48 to Premiere 00:57:22", () => {
    expect(formatTime(mapToPremiereSeconds(sync, t("05:18:48")))).toBe("00:57:22");
    expect(mapToPremiereTicks(sync, t("05:18:48"))).toBe(secondsToTicks(t("00:57:22")));
  });

  it("maps the sync point itself exactly", () => {
    expect(mapToPremiereTicks(sync, sync.chzzkTime).toString()).toBe(sync.premiereTicks);
  });

  it("computes offset = premiere - chzzk", () => {
    const offset = ticksToSeconds(syncOffsetTicks(sync));
    expect(offset).toBe(t("00:54:52") - t("05:16:18"));
    expect(formatSignedTime(offset)).toBe("-04:21:26");
  });

  it("maps times before the sync point to earlier Premiere times (may go negative)", () => {
    expect(formatTime(mapToPremiereSeconds(sync, t("05:16:00")))).toBe("00:54:34");
    expect(mapToPremiereSeconds(sync, t("04:00:00"))).toBeLessThan(0);
  });

  it("preserves ms and does not accumulate float error", () => {
    const s: SyncPoint = { chzzkTime: 19128.42, premiereTicks: "874536979200000" }; // arbitrary non-frame playhead
    // Map 10,000 consecutive ms steps and check every result is exact integer ticks.
    for (let i = 0; i < 10000; i++) {
      const chzzk = 19128.42 + i / 1000;
      const got = mapToPremiereTicks(s, chzzk);
      expect(got - 874536979200000n).toBe(BigInt(i) * (TICKS_PER_SECOND / 1000n));
    }
  });

  it("stays exact beyond 2^53 ticks (long sequences)", () => {
    const big: SyncPoint = { chzzkTime: 0, premiereTicks: (36000n * TICKS_PER_SECOND).toString() }; // 10h
    const got = mapToPremiereTicks(big, 0.001);
    expect(got).toBe(36000n * TICKS_PER_SECOND + TICKS_PER_SECOND / 1000n);
    expect(got > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});

describe("range", () => {
  it("05:43:00 ~ 06:43:00 has duration exactly 3600s", () => {
    const r: RangeMarker = {
      id: "r",
      type: "range",
      start: t("05:43:00"),
      end: t("06:43:00"),
      comment: "",
      createdAt: "",
    };
    expect(markerDuration(r)).toBe(3600);
    expect(secondsToTicks(markerDuration(r))).toBe(3600n * TICKS_PER_SECOND);
  });
});
