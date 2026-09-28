import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ProjectRepository,
  applyVodMetadata,
  emptyProject,
  mergeImport,
  removeMarker,
  setProjectTitle,
  upsertMarker,
  type KV,
} from "../src/store";
import { createPoint, createRange } from "../../shared/src/markers";
import { parseMarkerFile } from "../../shared/src/validate";

function memoryKV(): KV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(k) {
      return structuredClone(data.get(k));
    },
    async set(k, v) {
      data.set(k, structuredClone(v));
    },
  };
}

const vod = { id: "1234567", url: "https://chzzk.naver.com/video/1234567", title: "방구석 스트리머들의 전국투어" };

describe("project operations", () => {
  it("keeps markers sorted by timestamp on insert and edit", () => {
    let p = emptyProject(vod);
    const a = createPoint(19128, "a");
    const b = createPoint(18960, "b");
    const r = createRange(20580, 24180, "r");
    p = upsertMarker(upsertMarker(upsertMarker(p, a), r), b);
    expect(p.markers.map((m) => m.comment)).toEqual(["b", "a", "r"]);
    p = upsertMarker(p, { ...a, time: 30000, comment: "a2" }); // edit moves it
    expect(p.markers.map((m) => m.comment)).toEqual(["b", "r", "a2"]);
    expect(p.markers).toHaveLength(3);
    p = removeMarker(p, b.id);
    expect(p.markers.map((m) => m.comment)).toEqual(["r", "a2"]);
  });

  it("does not overwrite a user-edited title with detected metadata", () => {
    let p = emptyProject({ ...vod, title: "" });
    p = applyVodMetadata(p, vod);
    expect(p.projectTitle).toBe(vod.title);
    p = setProjectTitle(p, "내 제목");
    p = applyVodMetadata(p, { ...vod, title: "다른 제목" });
    expect(p.projectTitle).toBe("내 제목");
    expect(p.vodTitle).toBe("다른 제목");
  });

  it("imports a JSON file by merging on marker id", () => {
    const text = readFileSync(resolve(__dirname, "../../shared/fixtures/bangguseok-tour.json"), "utf8");
    const parsed = parseMarkerFile(text);
    if (!parsed.ok) throw new Error("fixture invalid");
    let p = emptyProject(vod);
    const own = createPoint(100, "mine");
    p = upsertMarker(p, own);
    p = upsertMarker(p, { ...parsed.file.markers[0], comment: "old" });
    const r = mergeImport(p, parsed.file);
    expect(r.added).toBe(7);
    expect(r.replaced).toBe(1);
    expect(r.project.markers).toHaveLength(9);
    expect(r.project.markers[0].comment).toBe("mine");
    expect(r.project.markers[1].comment).toContain("원주 토크 시작");
  });
});

describe("repository", () => {
  it("persists immediately and re-reads before each update (multi-tab safe)", async () => {
    const kv = memoryKV();
    const tab1 = new ProjectRepository(kv);
    const tab2 = new ProjectRepository(kv);
    const fb = () => emptyProject(vod);
    await tab1.update(vod.id, fb, (p) => upsertMarker(p, createPoint(1, "from tab1")));
    await tab2.update(vod.id, fb, (p) => upsertMarker(p, createPoint(2, "from tab2")));
    const stored = await tab1.load(vod.id);
    expect(stored?.markers.map((m) => m.comment)).toEqual(["from tab1", "from tab2"]);
  });

  it("isolates projects per VOD id", async () => {
    const repo = new ProjectRepository(memoryKV());
    await repo.update("1", () => emptyProject({ ...vod, id: "1" }), (p) => upsertMarker(p, createPoint(1, "one")));
    await repo.update("2", () => emptyProject({ ...vod, id: "2" }), (p) => upsertMarker(p, createPoint(1, "two")));
    expect((await repo.load("1"))?.markers.map((m) => m.comment)).toEqual(["one"]);
    expect((await repo.load("2"))?.markers.map((m) => m.comment)).toEqual(["two"]);
    expect(await repo.load("3")).toBeNull();
  });

  it("merges settings with defaults", async () => {
    const repo = new ProjectRepository(memoryKV());
    expect(await repo.loadSettings()).toEqual({ defaultPre: 10, defaultPost: 20, sidebarOpen: false });
    await repo.saveSettings({ defaultPre: 5 });
    expect(await repo.loadSettings()).toEqual({ defaultPre: 5, defaultPost: 20, sidebarOpen: false });
  });
});
