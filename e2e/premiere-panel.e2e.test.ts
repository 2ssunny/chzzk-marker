/**
 * Runs the BUILT Premiere panel (premiere-plugin/dist/index.html) in Chromium with
 * fake `premierepro` / `uxp` modules injected as a global `require`.
 * This verifies the panel's UI wiring and the full Load → Select → Sync → Apply flow.
 * It is not a substitute for testing inside Premiere Pro (UXP ≠ Chromium).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright-core";

const DIST = resolve(__dirname, "../premiere-plugin/dist/index.html");
const FIXTURE = readFileSync(resolve(__dirname, "../shared/fixtures/bangguseok-tour.json"), "utf8");
const TPS = 254016000000n;
const ticks = (h: number, m: number, s: number) => (BigInt(h * 3600 + m * 60 + s) * TPS).toString();

let browser: Browser;
let page: Page;

type FakeWindow = { __fake: { state: { markers: { name: string; start: string; duration: string; comments: string }[]; playhead: bigint } } };
const fakeState = () =>
  page.evaluate(() => {
    const s = (window as unknown as FakeWindow).__fake.state;
    return { markers: s.markers, playhead: s.playhead.toString() };
  });

beforeAll(async () => {
  const fakeBundle = await build({
    stdin: {
      contents: `
        import { createFakePremiere } from "./premiere-plugin/test/fakePremiere";
        const fake = createFakePremiere({ endSeconds: 3 * 3600 });
        window.__fake = fake;
        window.require = (id) => {
          if (id === "premierepro") return fake.module;
          if (id === "uxp") return { storage: { localFileSystem: { getFileForOpening: async () => ({ name: "bangguseok-tour.json", read: async () => window.__fixtureText }) } } };
          throw new Error("unknown module " + id);
        };`,
      resolveDir: resolve(__dirname, ".."),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  await page.addInitScript(`window.__fixtureText = ${JSON.stringify(FIXTURE)};`);
  await page.addInitScript(fakeBundle.outputFiles[0].text);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(DIST).href);
  await page.waitForSelector("#load");
  expect(errors).toEqual([]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe("Premiere panel (built bundle, fake Premiere)", () => {
  it("shows live playhead and active sequence", async () => {
    await page.evaluate((t) => ((window as unknown as FakeWindow).__fake.state.playhead = BigInt(t)), ticks(0, 54, 52));
    await expect.poll(() => page.locator("#playhead").innerText()).toBe("00:54:52.000");
    expect(await page.locator("#sequence").innerText()).toBe("Sequence 01");
  });

  it("loads marker.json and lists markers sorted", async () => {
    await page.click("#load");
    await expect.poll(() => page.locator("#list .row").count()).toBe(8);
    expect(await page.locator("#projectTitle").innerText()).toBe("방구석 스트리머들의 전국투어");
    expect(await page.locator("#markerCount").innerText()).toBe("8 markers loaded");
    const first = await page.locator("#list .row .time").first().innerText();
    expect(first).toBe("05:16:00");
  });

  it("Apply / Go to selected are disabled (and inert) before syncing", async () => {
    expect(await page.locator("#apply").getAttribute("class")).toContain("disabled");
    expect(await page.locator("#gotoSel").getAttribute("class")).toContain("disabled");
    await page.click("#apply");
    expect(await page.locator("#confirm").isVisible()).toBe(false);
  });

  it("select 05:16:18 + Sync Here → offset -04:21:26 and mapped times", async () => {
    await page.locator("#list .row", { hasText: "05:16:18" }).click();
    expect(await page.locator("#selTime").innerText()).toContain("05:16:18.000");
    await page.click("#syncHere");
    await expect.poll(() => page.locator("#offset").innerText()).toBe("-04:21:26.000");
    expect(await page.locator("#list .row", { hasText: "05:18:48" }).locator(".mapped").innerText()).toBe("→ 00:57:22");
    expect(await page.locator("#list .row", { hasText: "05:43:00" }).locator(".mapped").innerText()).toBe("→ 01:21:34");
  });

  it("Go to selected moves the Premiere playhead to the mapped time", async () => {
    await page.locator("#list .row", { hasText: "05:18:48" }).click();
    await page.click("#gotoSel");
    await expect.poll(async () => (await fakeState()).playhead).toBe(ticks(0, 57, 22));
  });

  it("Apply All Markers asks for confirmation, then creates markers", async () => {
    await page.click("#apply");
    await expect.poll(() => page.locator("#confirm").isVisible()).toBe(true);
    expect(await page.locator("#confirmText").innerText()).toBe('8 markers will be added to "Sequence 01". Continue?');
    expect((await fakeState()).markers).toHaveLength(0); // nothing before confirming
    await page.click("#confirmYes");
    await expect.poll(async () => (await fakeState()).markers.length).toBe(8);
    const result = await page.locator("#result").innerText();
    expect(result).toContain("8 markers");
    expect(result).toContain("8 applied");
    expect(result).toContain("verified in sequence: 8/8");
    const m = (await fakeState()).markers.find((x) => x.name.startsWith("빅헤드"))!;
    expect(m.start).toBe(ticks(0, 57, 12));
    expect(m.duration).toBe((30n * TPS).toString());
    expect(m.comments.split("\n")[0]).toBe("CHZZK: 05:18:48.000");
    await page.screenshot({ path: resolve(__dirname, ".artifacts/premiere-panel.png"), fullPage: true });
    // Typical docked panel size: content must stay usable (page scrolls instead of clipping).
    await page.setViewportSize({ width: 320, height: 420 });
    await page.screenshot({ path: resolve(__dirname, ".artifacts/premiere-panel-small.png") });
    await page.setViewportSize({ width: 380, height: 900 });
  });

  it("applying again is blocked by duplicate detection", async () => {
    await page.click("#apply");
    await expect.poll(() => page.locator("#status").innerText()).toContain("No markers to add");
    expect(await page.locator("#result").innerText()).toContain("8 already imported (skipped)");
    expect(await page.locator("#confirm").isVisible()).toBe(false);
    expect((await fakeState()).markers).toHaveLength(8);
  });

  it("restores the loaded file and sync after a panel reload", async () => {
    await page.reload();
    await expect.poll(() => page.locator("#list .row").count()).toBe(8);
    expect(await page.locator("#offset").innerText()).toBe("-04:21:26.000");
    expect(await page.locator("#status").innerText()).toContain("(synced)");
  });
});
