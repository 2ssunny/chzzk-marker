import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PremiereBridge, type PproModule } from "../src/ppro";
import { ImportSession } from "../src/session";
import { isApplicable, summarize } from "../src/plan";
import { createFakePremiere, TPS } from "./fakePremiere";
import { secondsToTicks, ticksToSeconds } from "../../shared/src/sync";
import { formatTime, parseTime } from "../../shared/src/time";

const fixtureText = readFileSync(resolve(__dirname, "../../shared/fixtures/bangguseok-tour.json"), "utf8");
const t = (s: string) => parseTime(s)!;
const tc = (ticks: string) => formatTime(ticksToSeconds(BigInt(ticks)));

async function setup(opts: Parameters<typeof createFakePremiere>[0] = {}) {
  const fake = createFakePremiere({ endSeconds: 3 * 3600, ...opts });
  const bridge = new PremiereBridge(fake.module as unknown as PproModule);
  const session = new ImportSession();
  expect(session.load(fixtureText, "bangguseok-tour.json")).toEqual({ ok: true });
  return { fake, bridge, session };
}

async function syncAndApply(fake: Awaited<ReturnType<typeof setup>>["fake"], bridge: PremiereBridge, session: ImportSession) {
  const ctx = (await bridge.getActive())!;
  const info = await bridge.getSequenceInfo(ctx.sequence);
  const plan = session.plan(info, await bridge.getExistingIds(ctx.sequence));
  const res = await bridge.addMarkers(ctx, plan.filter(isApplicable));
  return { ctx, info, plan, res };
}

describe("full import flow against a fake Premiere", () => {
  it("select 05:16:18, put playhead on 00:54:52, Sync Here, Apply → markers at correct relative positions", async () => {
    const { fake, bridge, session } = await setup();
    session.select("00000000-0000-4000-8000-000000000002"); // 05:16:18
    fake.state.playhead = secondsToTicks(t("00:54:52"));
    const ctx = (await bridge.getActive())!;
    const info = await bridge.getSequenceInfo(ctx.sequence);
    expect(info).toEqual({ name: "Sequence 01", guid: "seq-guid-1", endTicks: 3n * 3600n * TPS, ticksPerFrame: 8467200000n });
    session.setSync(await bridge.getPlayheadTicks(ctx.sequence), info);
    expect(formatTime(session.offsetSeconds!)).toBe("-04:21:26");

    const { res, plan } = await syncAndApply(fake, bridge, session);
    expect(summarize(plan).toApply).toBe(8);
    expect(res).toEqual({ added: plan.map((p) => p.marker.id), failed: [], mode: "batch" });
    expect(fake.state.transactions).toEqual(["Import CHZZK markers"]); // one undo step
    expect(fake.state.markers).toHaveLength(8);

    const byName = Object.fromEntries(fake.state.markers.map((m) => [m.name, m]));
    const m = byName['빅헤드 "역이 없으면 어떻게 이동해요?"'];
    expect(m.type).toBe("Comment");
    expect(tc(m.start)).toBe("00:57:12"); // 00:57:22 - 10s pre-roll
    expect(BigInt(m.duration)).toBe(30n * TPS);
    expect(m.comments).toContain("CHZZK: 05:18:48.000");
    expect(m.comments).toContain("CHZZK_MARKER_ID: 00000000-0000-4000-8000-000000000004");
    const range = byName["로드뷰 전국 탐험."];
    expect(tc(range.start)).toBe("01:21:34");
    expect(BigInt(range.duration)).toBe(3600n * TPS);
  });

  it("applying twice adds nothing (duplicate detection via marker comments)", async () => {
    const { fake, bridge, session } = await setup();
    fake.state.playhead = secondsToTicks(t("00:54:52"));
    session.select("00000000-0000-4000-8000-000000000002");
    const ctx = (await bridge.getActive())!;
    session.setSync(await bridge.getPlayheadTicks(ctx.sequence), await bridge.getSequenceInfo(ctx.sequence));
    await syncAndApply(fake, bridge, session);
    const second = await syncAndApply(fake, bridge, session);
    expect(summarize(second.plan)).toMatchObject({ toApply: 0, duplicate: 8 });
    expect(fake.state.markers).toHaveLength(8);
  });

  it("one bad marker does not fail the whole import", async () => {
    const { fake, bridge, session } = await setup();
    fake.state.throwOnName = "원주 인구수 / 이터널리턴 드립.";
    session.select("00000000-0000-4000-8000-000000000002");
    fake.state.playhead = secondsToTicks(t("00:54:52"));
    const ctx = (await bridge.getActive())!;
    session.setSync(await bridge.getPlayheadTicks(ctx.sequence), await bridge.getSequenceInfo(ctx.sequence));
    const { res } = await syncAndApply(fake, bridge, session);
    expect(res.added).toHaveLength(7);
    expect(res.failed).toEqual([{ id: "00000000-0000-4000-8000-000000000005", error: "cannot create 원주 인구수 / 이터널리턴 드립." }]);
    expect(fake.state.markers).toHaveLength(7);
  });

  it("falls back to per-marker transactions when the batch transaction fails", async () => {
    const { fake, bridge, session } = await setup();
    fake.state.failBatch = true;
    session.select("00000000-0000-4000-8000-000000000002");
    fake.state.playhead = secondsToTicks(t("00:54:52"));
    const ctx = (await bridge.getActive())!;
    session.setSync(await bridge.getPlayheadTicks(ctx.sequence), await bridge.getSequenceInfo(ctx.sequence));
    const { res } = await syncAndApply(fake, bridge, session);
    expect(res.mode).toBe("per-marker");
    expect(res.added).toHaveLength(8);
    expect(fake.state.markers).toHaveLength(8);
  });

  it("reports no active sequence", async () => {
    const { fake, bridge } = await setup();
    fake.state.hasSequence = false;
    expect(await bridge.getActive()).toBeNull();
  });

  it("setPlayheadTicks moves the playhead (Go to selected), never negative", async () => {
    const { fake, bridge } = await setup();
    const ctx = (await bridge.getActive())!;
    await bridge.setPlayheadTicks(ctx.sequence, 5n * TPS);
    expect(fake.state.playhead).toBe(5n * TPS);
    await bridge.setPlayheadTicks(ctx.sequence, -5n);
    expect(fake.state.playhead).toBe(0n);
  });
});

describe("ImportSession persistence", () => {
  it("restores file, selection and sync", async () => {
    const { session } = await setup();
    session.select("00000000-0000-4000-8000-000000000004");
    session.setSync(123456789n, { name: "Seq", guid: null, endTicks: null, ticksPerFrame: null });
    const restored = ImportSession.restore(session.serialize());
    expect(restored.markers).toHaveLength(8);
    expect(restored.selectedId).toBe("00000000-0000-4000-8000-000000000004");
    expect(restored.sync).toEqual(session.sync);
    expect(restored.syncMatches({ name: "Seq", guid: null, endTicks: null, ticksPerFrame: null })).toBe(true);
    expect(restored.syncMatches({ name: "Other", guid: null, endTicks: null, ticksPerFrame: null })).toBe(false);
  });

  it("ignores corrupt state", () => {
    expect(ImportSession.restore("{nope").file).toBeNull();
    expect(ImportSession.restore(null).file).toBeNull();
  });

  it("rejects invalid files without clobbering the loaded one", async () => {
    const { session } = await setup();
    expect(session.load('{"schemaVersion":2,"markers":[]}', "x.json").ok).toBe(false);
    expect(session.markers).toHaveLength(8);
  });
});
