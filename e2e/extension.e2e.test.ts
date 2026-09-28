/**
 * End-to-end test of the Chrome extension in real Chromium (unpacked MV3 extension).
 * The CHZZK page is a local mock served at the real URL (see mockChzzk.ts).
 *
 * Run: npm run test:e2e   (builds extension/dist first)
 */
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { installMockChzzk, VOD_TITLE } from "./mockChzzk";
import { parseMarkerFile } from "../shared/src/validate";

const EXT = resolve(__dirname, "../extension/dist");
const ARTIFACTS = resolve(__dirname, ".artifacts");
const VOD_URL = "https://chzzk.naver.com/video/1234567";
const FIXTURE = resolve(__dirname, "../shared/fixtures/bangguseok-tour.json");
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";

let context: BrowserContext;
let page: Page;
const dialogs: string[] = [];

const video = (fn: string) => page.evaluate(`(() => { const v = document.querySelector('video.webplayer-internal-video'); return ${fn}; })()`);
const isPaused = () => video("v.paused") as Promise<boolean>;
const currentTime = () => video("v.currentTime") as Promise<number>;
async function seek(t: number) {
  await page.evaluate(
    (t) =>
      new Promise<void>((res) => {
        const v = document.querySelector<HTMLVideoElement>("video.webplayer-internal-video")!;
        v.addEventListener("seeked", () => res(), { once: true });
        v.currentTime = t;
      }),
    t,
  );
}
const editor = () => page.locator(".editor");
const textarea = () => page.locator(".editor textarea");
const items = () => page.locator(".sidebar .item");
const itemTimes = () => page.locator(".sidebar .item .item-time").allInnerTexts();
const toastText = () => page.locator(".toast").innerText();
const activeInShadow = () =>
  page.evaluate(() => document.getElementById("chzzk-edit-marker-host")?.shadowRoot?.activeElement?.tagName ?? null);

beforeAll(async () => {
  mkdirSync(ARTIFACTS, { recursive: true });
  context = await chromium.launchPersistentContext("", {
    executablePath: CHROMIUM,
    headless: true,
    acceptDownloads: true,
    // Chrome on Linux drops non-ASCII download names unless the locale is UTF-8.
    env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" },
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--autoplay-policy=no-user-gesture-required"],
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://chzzk.naver.com" });
  await installMockChzzk(context);
  page = await context.newPage();
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  await page.goto(VOD_URL);
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("video.webplayer-internal-video");
    return !!v && v.readyState >= 1 && v.duration > 1000;
  });
  await page.waitForSelector("#chzzk-edit-marker-host", { state: "attached" });
}, 60_000);

afterAll(async () => {
  await context?.close();
});

describe("CHZZK Edit Marker extension (E2E)", () => {
  it("F8 while playing: pauses, opens editor with focused textarea and current time", async () => {
    await seek(1128); // 00:18:48
    await video("v.play()");
    await page.waitForFunction(() => !document.querySelector<HTMLVideoElement>("video.webplayer-internal-video")!.paused);
    await page.keyboard.press("F8");
    await expect.poll(isPaused).toBe(true);
    await expect(editor().isVisible()).resolves.toBe(true);
    expect(await activeInShadow()).toBe("TEXTAREA");
    const shown = await page.locator(".editor .timebig").inputValue();
    expect(shown).toMatch(/^00:18:4[89]\.\d{3}$/);
    expect(await page.locator(".editor .badge").innerText()).toBe("POINT");
    expect(await page.locator('.editor input[aria-label="Pre-roll seconds"]').inputValue()).toBe("10");
    expect(await page.locator('.editor input[aria-label="Post-roll seconds"]').inputValue()).toBe("20");
    await page.screenshot({ path: resolve(ARTIFACTS, "01-editor.png") });
  });

  it("F8 again does not open a second editor", async () => {
    await page.keyboard.press("F8");
    expect(await page.locator(".editor").count()).toBe(1);
    expect(await activeInShadow()).toBe("TEXTAREA");
  });

  it("typing (incl. space/Enter) goes to the textarea, not to CHZZK shortcuts; Ctrl+Enter saves & resumes", async () => {
    await page.evaluate(() => ((window as unknown as { __pageKeys: string[] }).__pageKeys.length = 0));
    await page.keyboard.type("역 없으면 어떻게 이동해요?");
    await page.keyboard.press("Enter"); // newline, must not submit
    await page.keyboard.type("버스 / 걸어가나 / 소 타까지");
    expect(await editor().isVisible()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __pageKeys: string[] }).__pageKeys)).toEqual([]);
    expect(await isPaused()).toBe(true); // space did not toggle playback
    await page.keyboard.press("Control+Enter");
    await expect.poll(() => editor().isVisible()).toBe(false);
    await expect.poll(isPaused).toBe(false); // resumed
  });

  it("F9 opens the sidebar showing the saved marker", async () => {
    await page.keyboard.press("F9");
    await expect.poll(() => page.locator(".sidebar").isVisible()).toBe(true);
    expect(await items().count()).toBe(1);
    expect(await page.locator(".sidebar .item-comment").first().innerText()).toBe("역 없으면 어떻게 이동해요?\n버스 / 걸어가나 / 소 타까지");
    expect(await page.locator(".sb-project").inputValue()).toBe(VOD_TITLE);
  });

  it("repeat: marker while paused, Ctrl+Shift+Enter saves without resuming; ms precision kept", async () => {
    await video("v.pause()");
    await seek(976.42); // 00:16:16.420
    await page.keyboard.press("F8");
    expect(await page.locator(".editor .timebig").inputValue()).toBe("00:16:16.420");
    await page.keyboard.type("치킨쿤: 초등학교 이야기");
    await page.keyboard.press("Control+Shift+Enter");
    await expect.poll(() => editor().isVisible()).toBe(false);
    expect(await isPaused()).toBe(true);
    await expect.poll(() => items().count()).toBe(2);
  });

  it("Esc cancels without saving and restores playback", async () => {
    await video("v.play()");
    await page.keyboard.press("F8");
    await expect.poll(isPaused).toBe(true);
    await page.keyboard.type("버릴 메모");
    await page.keyboard.press("Escape");
    await expect.poll(() => editor().isVisible()).toBe(false);
    await expect.poll(isPaused).toBe(false);
    expect(await items().count()).toBe(2);
  });

  it("Shift+F8 twice creates a range marker", async () => {
    await video("v.pause()");
    await seek(600); // 00:10:00
    await page.keyboard.press("Shift+F8");
    await expect.poll(() => page.locator(".pending").isVisible()).toBe(true);
    expect(await page.locator(".pending").innerText()).toContain("00:10:00");
    await seek(900); // 00:15:00
    await page.keyboard.press("Shift+F8");
    await expect.poll(() => editor().isVisible()).toBe(true);
    expect(await page.locator(".editor .badge").innerText()).toBe("RANGE");
    expect(await page.locator('.editor input[aria-label="Range start"]').inputValue()).toBe("00:10:00.000");
    expect(await page.locator('.editor input[aria-label="Range end"]').inputValue()).toBe("00:15:00.000");
    await page.keyboard.type("로드뷰 전국 탐험");
    await page.keyboard.press("Control+Enter");
    await expect.poll(() => items().count()).toBe(3);
    expect(await page.locator(".pending").isVisible()).toBe(false);
  });

  it("lists markers in ascending timestamp order", async () => {
    const times = await itemTimes();
    expect(times[0]).toMatch(/^00:10:00 ~ 00:15:00/);
    expect(times[1]).toMatch(/^00:16:16/);
    expect(times[2]).toMatch(/^00:18:4[89]/);
    await page.screenshot({ path: resolve(ARTIFACTS, "02-sidebar.png") });
  });

  it("Korean IME: Ctrl+Enter during composition waits for compositionend", async () => {
    await video("v.pause()");
    await seek(1500); // 00:25:00
    await page.keyboard.press("F8");
    await expect.poll(() => editor().isVisible()).toBe(true);
    await page.evaluate(() => {
      const ta = document.getElementById("chzzk-edit-marker-host")!.shadowRoot!.querySelector("textarea")!;
      ta.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, composed: true }));
      ta.value = "소 ㅌ";
      ta.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Process", code: "Enter", keyCode: 229, ctrlKey: true, isComposing: true, bubbles: true, composed: true } as KeyboardEventInit),
      );
    });
    expect(await editor().isVisible()).toBe(true); // not submitted mid-composition
    await page.evaluate(() => {
      const ta = document.getElementById("chzzk-edit-marker-host")!.shadowRoot!.querySelector("textarea")!;
      ta.value = "소 타";
      ta.dispatchEvent(new CompositionEvent("compositionend", { data: "타", bubbles: true, composed: true }));
    });
    await expect.poll(() => editor().isVisible()).toBe(false);
    await expect.poll(() => items().count()).toBe(4);
    expect(await page.locator(".sidebar .item-comment").last().innerText()).toBe("소 타");
  });

  it("Edit changes time/comment and re-sorts; ▶ seeks", async () => {
    const last = items().last();
    await last.locator("button", { hasText: "Edit" }).click();
    await expect.poll(() => editor().isVisible()).toBe(true);
    await page.locator(".editor .timebig").fill("0:05:00");
    await textarea().fill("수정된 코멘트");
    await page.locator(".editor button", { hasText: /^Save$/ }).click();
    await expect.poll(() => editor().isVisible()).toBe(false);
    const times = await itemTimes();
    expect(times[0]).toMatch(/^00:05:00/);
    expect(await page.locator(".sidebar .item-comment").first().innerText()).toBe("수정된 코멘트");
    await items().nth(1).locator("button", { hasText: /^▶$/ }).click();
    await expect.poll(currentTime).toBeCloseTo(600, 1);
  });

  it("Copy TXT puts a readable edit guide on the clipboard", async () => {
    await page.locator(".sidebar button", { hasText: "Copy TXT" }).click();
    await expect.poll(toastText).toContain("TXT");
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.startsWith(`[${VOD_TITLE}]\n\n0:05:00\n수정된 코멘트\n\n0:10:00 ~ 0:15:00\n로드뷰 전국 탐험\n\n0:16:16\n치킨쿤: 초등학교 이야기\n\n0:18:4`)).toBe(true);
    expect(clip).toContain("역 없으면 어떻게 이동해요?\n버스 / 걸어가나 / 소 타까지\n");
  });

  it("Download TXT is UTF-8 with Korean intact", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".sidebar button", { hasText: "Download TXT" }).click()]);
    const path = resolve(ARTIFACTS, dl.suggestedFilename());
    await dl.saveAs(path);
    expect(dl.suggestedFilename()).toBe(`${VOD_TITLE}_1234567.txt`);
    const text = readFileSync(path, "utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain("로드뷰 전국 탐험");
  });

  it("Export JSON produces a valid schemaVersion 1 file with ms-precision numbers", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".sidebar button", { hasText: "Export JSON" }).click()]);
    const path = resolve(ARTIFACTS, "exported.json");
    await dl.saveAs(path);
    const res = parseMarkerFile(readFileSync(path, "utf8"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings).toEqual([]);
    expect(res.file.vod).toEqual({ url: VOD_URL, title: VOD_TITLE, id: "1234567" });
    expect(res.file.markers.map((m) => m.type)).toEqual(["point", "range", "point", "point"]);
    const p = res.file.markers[2];
    expect(p.type === "point" && p.time).toBe(976.42);
    const r = res.file.markers[1];
    expect(r.type === "range" && [r.start, r.end]).toEqual([600, 900]);
  });

  it("Delete asks for confirmation and removes the marker", async () => {
    dialogs.length = 0;
    await items().first().locator("button", { hasText: "Delete" }).click();
    await expect.poll(() => items().count()).toBe(3);
    expect(dialogs[0]).toContain("00:05:00");
  });

  it("markers survive a page reload (persisted in storage.local)", async () => {
    await page.reload();
    await page.waitForSelector("#chzzk-edit-marker-host", { state: "attached" });
    await expect.poll(() => page.locator(".sidebar").isVisible()).toBe(true); // sidebar open state persisted
    await expect.poll(() => items().count()).toBe(3);
  });

  it("Import JSON merges the fixture (same VOD id → no confirmation)", async () => {
    dialogs.length = 0;
    await page.locator('.sidebar input[type="file"]').setInputFiles(FIXTURE);
    await expect.poll(() => items().count()).toBe(11);
    expect(dialogs).toEqual([]);
    const times = await itemTimes();
    expect(times[times.length - 1]).toMatch(/^05:43:00 ~ 06:43:00/);
  });

  it("SPA navigation isolates projects per VOD and picks up the re-created <video>", async () => {
    await page.evaluate(() => (window as unknown as { __spaNavigate: (id: string) => void }).__spaNavigate("2222"));
    await expect.poll(() => page.locator(".sb-status").innerText()).toContain("0 markers");
    await page.waitForFunction(() => document.querySelector<HTMLVideoElement>("video.webplayer-internal-video")!.readyState >= 1);
    await seek(42);
    await page.keyboard.press("F8");
    await expect.poll(() => editor().isVisible()).toBe(true);
    expect(await page.locator(".editor .timebig").inputValue()).toBe("00:00:42.000");
    await page.keyboard.type("second vod");
    await page.keyboard.press("Control+Enter");
    await expect.poll(() => items().count()).toBe(1);
    expect(await page.locator(".sb-project").inputValue()).toBe("Second VOD 2222");
    // Importing another VOD's JSON asks first.
    dialogs.length = 0;
    await page.locator('.sidebar input[type="file"]').setInputFiles(FIXTURE);
    await expect.poll(() => items().count()).toBe(9);
    expect(dialogs[0]).toContain("다른 다시보기(1234567)");
    await page.evaluate(() => history.pushState({}, "", "/video/1234567"));
    await expect.poll(() => items().count()).toBe(11);
  });

  it("fullscreen: overlay moves into the fullscreen player and F8 still works", async () => {
    await page.click("#fs"); // user gesture
    await page.waitForFunction(() => !!document.fullscreenElement);
    await expect
      .poll(() => page.evaluate(() => document.getElementById("chzzk-edit-marker-host")?.parentElement?.className))
      .toBe("pzp-pc");
    await page.keyboard.press("F8");
    await expect.poll(() => editor().isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.exitFullscreen());
    await expect
      .poll(() => page.evaluate(() => document.getElementById("chzzk-edit-marker-host")?.parentElement === document.documentElement))
      .toBe(true);
  });

  it("shows 'CHZZK player not found' when there is no video", async () => {
    await page.evaluate(() => document.querySelectorAll("video").forEach((v) => v.remove()));
    await page.keyboard.press("F8");
    await expect.poll(toastText).toBe("CHZZK player not found");
    await expect.poll(() => page.locator(".sb-status").innerText()).toContain("CHZZK player not found");
    expect(await editor().isVisible()).toBe(false);
  });

  it("non-VOD pages: no marker creation, helpful message", async () => {
    await page.goto("https://chzzk.naver.com/");
    await page.waitForSelector("#chzzk-edit-marker-host", { state: "attached" });
    await page.keyboard.press("F8");
    await expect.poll(toastText).toContain("VOD");
    await page.screenshot({ path: resolve(ARTIFACTS, "03-non-vod.png") });
  });
});
