import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { buildMarkerFile, buildTxt, exportBaseName, serializeMarkerFile } from "../src/exporters";
import { parseMarkerFile } from "../src/validate";
import { commentSummary, createPoint, createRange, markerInterval, sortMarkers } from "../src/markers";
import type { MarkerFile } from "../src/types";

const root = resolve(__dirname, "..");
const fixtureText = readFileSync(resolve(root, "fixtures/bangguseok-tour.json"), "utf8");
const fixture = JSON.parse(fixtureText) as MarkerFile;
const expectedTxt = readFileSync(resolve(root, "fixtures/bangguseok-tour.txt"), "utf8");
const schema = JSON.parse(readFileSync(resolve(root, "schema/marker-file.schema.json"), "utf8"));

describe("TXT export", () => {
  it("matches the expected edit guide for the fixture", () => {
    expect(buildTxt(fixture.projectTitle, fixture.markers)).toBe(expectedTxt);
  });

  it("sorts by timestamp regardless of input order", () => {
    const shuffled = [...fixture.markers].reverse();
    expect(buildTxt(fixture.projectTitle, shuffled)).toBe(expectedTxt);
  });

  it("normalizes CRLF and trailing whitespace, keeps Korean intact", () => {
    const m = createPoint(65, "  첫 줄 \r\n둘째 줄  \r\n");
    expect(buildTxt("", [m])).toBe("0:01:05\n첫 줄\n둘째 줄\n");
  });
});

describe("JSON export", () => {
  it("round-trips the fixture through export → parse", () => {
    const file = buildMarkerFile(fixture.projectTitle, fixture.vod, fixture.markers, new Date("2026-09-28T11:00:00.000Z"));
    const text = serializeMarkerFile(file);
    expect(text).toBe(fixtureText);
    const parsed = parseMarkerFile(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file).toEqual(fixture);
      expect(parsed.warnings).toEqual([]);
    }
  });

  it("keeps millisecond precision as numbers", () => {
    const m = createPoint(19128.42, "x");
    const file = buildMarkerFile("t", { url: "u", title: "t", id: "1" }, [m]);
    const back = JSON.parse(serializeMarkerFile(file)) as MarkerFile;
    expect(back.markers[0]).toMatchObject({ type: "point", time: 19128.42 });
  });

  it("fixture and exported files validate against the JSON Schema", () => {
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(schema);
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    const exported = buildMarkerFile("t", { url: "u", title: "t", id: null }, [createPoint(1, "a"), createRange(5, 2, "b")]);
    expect(validate(JSON.parse(serializeMarkerFile(exported))), JSON.stringify(validate.errors)).toBe(true);
  });

  it("file name is filesystem-safe", () => {
    expect(exportBaseName('a/b:c*?"<>|', "123")).toBe("a_b_c______" + "_123");
    expect(exportBaseName("  ", null)).toBe("chzzk-markers");
  });
});

describe("validation", () => {
  it("rejects wrong schemaVersion and bad JSON", () => {
    expect(parseMarkerFile({ ...fixture, schemaVersion: 2 }).ok).toBe(false);
    expect(parseMarkerFile("{").ok).toBe(false);
    expect(parseMarkerFile("[]").ok).toBe(false);
  });

  it("tolerates a UTF-8 BOM", () => {
    expect(parseMarkerFile("﻿" + fixtureText).ok).toBe(true);
  });

  it("drops only the broken markers, with warnings", () => {
    const res = parseMarkerFile({
      ...fixture,
      markers: [
        fixture.markers[0],
        { id: "bad1", type: "point", time: -1, pre: 0, post: 0, comment: "", createdAt: "" },
        { id: "bad2", type: "range", start: 10, end: 5, comment: "", createdAt: "" },
        { id: "bad3", type: "weird" },
        fixture.markers[0],
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.file.markers).toHaveLength(1);
      expect(res.warnings).toHaveLength(4);
    }
  });
});

describe("marker helpers", () => {
  it("point interval = [time - pre, time + post]", () => {
    expect(markerInterval(createPoint(19128, "", 10, 20))).toEqual({ start: 19118, end: 19148 });
  });

  it("range creation swaps reversed input", () => {
    const r = createRange(24180, 20580, "");
    expect([r.start, r.end]).toEqual([20580, 24180]);
  });

  it("sorts ascending with stable tie-breaks", () => {
    const a = createPoint(10, "a", 0, 0, new Date(1));
    const b = createPoint(5, "b", 0, 0, new Date(2));
    const c = createRange(10, 20, "c", new Date(0));
    expect(sortMarkers([a, b, c]).map((m) => m.comment)).toEqual(["b", "c", "a"]);
  });

  it("summary = first non-empty line, truncated", () => {
    expect(commentSummary("\n  역 없으면 어떻게 이동해요?  \n버스")).toBe("역 없으면 어떻게 이동해요?");
    expect(commentSummary("가".repeat(100), 10)).toBe("가".repeat(9) + "…");
    expect(commentSummary("   ")).toBe("");
  });
});
