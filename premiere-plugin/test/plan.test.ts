import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractMarkerIds, markerComments, markerName, planMarkers, summarize } from "../src/plan";
import { parseMarkerFile } from "../../shared/src/validate";
import { TICKS_PER_SECOND, secondsToTicks, ticksToSeconds, type SyncPoint } from "../../shared/src/sync";
import { formatTime, parseTime } from "../../shared/src/time";
import type { MarkerFile } from "../../shared/src/types";

const res = parseMarkerFile(readFileSync(resolve(__dirname, "../../shared/fixtures/bangguseok-tour.json"), "utf8"));
if (!res.ok) throw new Error("fixture");
const file: MarkerFile = res.file;
const t = (s: string) => parseTime(s)!;
const ticks = (s: string) => secondsToTicks(t(s));
const tc = (x: bigint) => formatTime(ticksToSeconds(x));
const sync: SyncPoint = { chzzkTime: t("05:16:18"), premiereTicks: ticks("00:54:52").toString() };
const TPF_30 = TICKS_PER_SECOND / 30n;
const TPF_2997 = 8475667200n; // 29.97 fps (30000/1001)

describe("planMarkers with the fixture (sync 05:16:18 ↔ 00:54:52)", () => {
  const plan = planMarkers(file.markers, sync, { ticksPerFrame: TPF_30, sequenceEndTicks: ticks("03:00:00") });

  it("keeps relative spacing: marker point = mapped time, start = mapped(time - pre)", () => {
    const byTime = Object.fromEntries(plan.map((p) => [formatTime(p.marker.type === "point" ? p.marker.time : p.marker.start), p]));
    // 05:18:48 → 00:57:22; with 10s pre-roll the range marker starts at 00:57:12, lasts 30s.
    expect(tc(byTime["05:18:48"].startTicks)).toBe("00:57:12");
    expect(byTime["05:18:48"].durationTicks).toBe(30n * TICKS_PER_SECOND);
    expect(tc(byTime["05:16:18"].startTicks)).toBe("00:54:42");
    expect(tc(byTime["05:16:00"].startTicks)).toBe("00:54:24");
    expect(tc(byTime["05:41:30"].startTicks)).toBe("01:19:54");
    // Range 05:43:00 ~ 06:43:00 → 01:21:34, exactly 3600s.
    expect(tc(byTime["05:43:00"].startTicks)).toBe("01:21:34");
    expect(byTime["05:43:00"].durationTicks).toBe(3600n * TICKS_PER_SECOND);
    expect(plan.every((p) => p.status === "add")).toBe(true);
  });

  it("uses exact integer ticks (sync point maps back to the playhead exactly)", () => {
    const p = planMarkers(file.markers, sync, {}).find((x) => x.marker.id.endsWith("02"))!;
    // point 05:16:18 with 10s pre-roll
    expect(p.startTicks + 10n * TICKS_PER_SECOND).toBe(BigInt(sync.premiereTicks));
  });

  it("frame-aligns start and duration at 29.97fps without drifting", () => {
    const odd: SyncPoint = { chzzkTime: 19128.42, premiereTicks: (TPF_2997 * 103173n).toString() };
    const p2 = planMarkers(file.markers, odd, { ticksPerFrame: TPF_2997 });
    for (const p of p2) {
      expect(p.startTicks % TPF_2997).toBe(0n);
      expect(p.durationTicks % TPF_2997).toBe(0n);
    }
    const range = p2.find((p) => p.marker.type === "range")!;
    expect(Math.abs(ticksToSeconds(range.durationTicks) - 3600)).toBeLessThan(1 / 29.97);
  });

  it("summary for a clean import", () => {
    expect(summarize(plan)).toEqual({ total: 8, toApply: 8, clamped: 0, duplicate: 0, beforeStart: 0, afterEnd: 0 });
  });
});

describe("range safety", () => {
  it("skips markers entirely before sequence start and clamps partial ones", () => {
    // Sync so that CHZZK 05:16:18 = Premiere 00:00:05 → 05:16:00 point (window 05:15:50~05:16:20) maps to -00:00:23 ~ +00:00:07.
    const s: SyncPoint = { chzzkTime: t("05:16:18"), premiereTicks: ticks("00:00:05").toString() };
    const early = { ...file.markers[0], id: "early", time: t("05:10:00") }; // entirely before
    const plan = planMarkers([early, ...file.markers], s, {});
    expect(plan[0].status).toBe("before-start");
    const clamped = plan[1];
    expect(clamped.status).toBe("clamped");
    expect(clamped.startTicks).toBe(0n);
    expect(tc(clamped.durationTicks)).toBe("00:00:07");
    const sum = summarize(plan);
    expect(sum).toMatchObject({ total: 9, beforeStart: 1, toApply: 8 });
  });

  it("skips markers after sequence end and clamps ones running past it", () => {
    const plan = planMarkers(file.markers, sync, { sequenceEndTicks: ticks("01:30:00") });
    const range = plan.find((p) => p.marker.type === "range")!;
    expect(range.status).toBe("clamped"); // 01:21:34 + 1h > 01:30:00
    expect(range.startTicks + range.durationTicks).toBe(ticks("01:30:00"));
    const short = planMarkers(file.markers, sync, { sequenceEndTicks: ticks("01:00:00") });
    expect(summarize(short)).toMatchObject({ afterEnd: 3, toApply: 5 }) // 05:22:53→01:01:17, 05:41:30→01:19:54, range→01:21:34;
  });

  it("treats a 0 / unknown sequence end as 'no end check'", () => {
    expect(summarize(planMarkers(file.markers, sync, { sequenceEndTicks: 0n })).toApply).toBe(8);
    expect(summarize(planMarkers(file.markers, sync, { sequenceEndTicks: null })).toApply).toBe(8);
  });
});

describe("duplicates and marker text", () => {
  it("round-trips the id tag through comments", () => {
    const comments = file.markers.map(markerComments);
    const ids = extractMarkerIds(comments);
    expect([...ids]).toEqual(file.markers.map((m) => m.id));
    const plan = planMarkers(file.markers, sync, { existingIds: new Set([file.markers[3].id]) });
    expect(summarize(plan)).toMatchObject({ duplicate: 1, toApply: 7 });
  });

  it("formats the point marker comment with CHZZK timestamp, pre/post, comment, id", () => {
    const m = { ...file.markers[3], time: 19128.42 };
    expect(markerName(m)).toBe('빅헤드 "역이 없으면 어떻게 이동해요?"');
    expect(markerComments(m)).toBe(
      [
        "CHZZK: 05:18:48.420",
        "Pre: 10s",
        "Post: 20s",
        "",
        '빅헤드 "역이 없으면 어떻게 이동해요?"',
        "버스 / 걸어가나 / 소 타까지.",
        "",
        "CHZZK_MARKER_ID: 00000000-0000-4000-8000-000000000004",
      ].join("\n"),
    );
  });

  it("formats the range marker comment and falls back to a timestamp name", () => {
    const r = { ...file.markers[7], comment: "" };
    expect(markerName(r)).toBe("CHZZK 05:43:00 ~ 06:43:00");
    expect(markerComments(r)).toBe(
      ["CHZZK: 05:43:00.000 ~ 06:43:00.000", "Duration: 01:00:00.000", "", "CHZZK_MARKER_ID: 00000000-0000-4000-8000-000000000008"].join("\n"),
    );
  });
});
