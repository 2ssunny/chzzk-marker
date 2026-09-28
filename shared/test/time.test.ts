import { describe, expect, it } from "vitest";
import { formatSignedTime, formatTime, parseTime, roundMs, toMs } from "../src/time";

describe("formatTime", () => {
  it.each([
    [0, "00:00:00"],
    [65, "00:01:05"],
    [3600, "01:00:00"],
    [19128, "05:18:48"],
    [36000 + 59 * 60 + 59, "10:59:59"],
  ])("%s → %s", (sec, expected) => {
    expect(formatTime(sec)).toBe(expected);
  });

  it("preserves milliseconds", () => {
    expect(formatTime(19128.42, { ms: true })).toBe("05:18:48.420");
    expect(formatTime(19128.001, { ms: true })).toBe("05:18:48.001");
    expect(formatTime(0.999, { ms: true })).toBe("00:00:00.999");
    // float noise: 19128.42 * 1000 === 19128419.999999996
    expect(toMs(19128.42)).toBe(19128420);
  });

  it("truncates sub-seconds without ms option", () => {
    expect(formatTime(19128.999)).toBe("05:18:48");
  });

  it("compact hours for TXT", () => {
    expect(formatTime(18960, { compactHours: true })).toBe("5:16:00");
    expect(formatTime(24180, { compactHours: true })).toBe("6:43:00");
    expect(formatTime(65, { compactHours: true })).toBe("0:01:05");
  });

  it("negative and signed", () => {
    expect(formatTime(-15686)).toBe("-04:21:26");
    expect(formatSignedTime(-15686)).toBe("-04:21:26");
    expect(formatSignedTime(3442)).toBe("+00:57:22");
    expect(formatSignedTime(0)).toBe("+00:00:00");
  });

  it("non-finite", () => {
    expect(formatTime(NaN)).toBe("--:--:--");
  });
});

describe("parseTime", () => {
  it.each([
    ["05:18:48", 19128],
    ["5:18:48", 19128],
    ["05:18:48.420", 19128.42],
    ["5:18:48.42", 19128.42],
    ["18:48", 1128],
    ["65", 65],
    ["1.5", 1.5],
    ["0:00:00", 0],
    [" 6:43:00 ", 24180],
    ["100:00:00", 360000],
  ])("%s → %s", (input, expected) => {
    expect(parseTime(input)).toBe(expected);
  });

  it.each(["", "abc", "1:60", "1:60:00", "1:00:60", "1::00", "1:2:3:4", "-"])("rejects %j", (input) => {
    expect(parseTime(input)).toBeNull();
  });

  it("round-trips with formatTime at ms precision", () => {
    for (const t of [0, 0.001, 59.999, 3599.5, 19128.42, 24180, 35999.999]) {
      expect(parseTime(formatTime(t, { ms: true }))).toBe(roundMs(t));
    }
  });
});
