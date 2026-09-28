/**
 * CHZZK player adapter.
 *
 * This is the ONLY module that knows about CHZZK's DOM/URL structure.
 * If CHZZK changes its markup, update the selectors below and nothing else.
 *
 * CHZZK has no public player API, so we work with the HTMLVideoElement directly
 * (read currentTime, seek, play/pause). We never touch cookies, auth or
 * private network APIs.
 */

/** Selectors, most specific first. Hashed CSS-module classes are matched by prefix. */
const SELECTORS = {
  /** Main VOD player <video>. `webplayer-internal-video` / `.pzp-pc__video` are Naver "pzp" player classes. */
  video: ["video.webplayer-internal-video", ".pzp-pc__video video", ".pzp-pc video", "video"],
  /** VOD title element on the /video/{id} page. */
  title: ['[class*="video_information_title"]', '[class*="video_title"]'],
  /** Channel (streamer) name. */
  channel: ['[class*="video_information_name"] [class*="name_text"]', '[class*="video_information_name"]'],
} as const;

const VOD_PATH_RE = /^\/video\/(\d+)(?:\/|$)/;

export interface VodMetadata {
  id: string | null;
  /** Canonical URL (https://chzzk.naver.com/video/{id}) when possible. */
  url: string;
  title: string;
  channel: string;
}

let cachedVideo: HTMLVideoElement | null = null;
let cacheDirty = true;
let observer: MutationObserver | null = null;

/** Watch DOM changes so a re-created <video> (SPA navigation, player reload) is picked up. */
export function startObserving(onChange?: () => void): void {
  if (observer || typeof MutationObserver === "undefined") return;
  let timer: number | undefined;
  observer = new MutationObserver((records) => {
    const touchesVideo = records.some((r) =>
      [...r.addedNodes, ...r.removedNodes].some(
        (n) => n instanceof Element && (n.tagName === "VIDEO" || n.querySelector?.("video")),
      ),
    );
    if (!touchesVideo) return;
    cacheDirty = true;
    if (onChange) {
      clearTimeout(timer);
      timer = window.setTimeout(onChange, 200);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function getVodId(href: string = location.href): string | null {
  try {
    const u = new URL(href);
    if (!/(^|\.)chzzk\.naver\.com$/.test(u.hostname)) return null;
    return VOD_PATH_RE.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isVodPage(href: string = location.href): boolean {
  return getVodId(href) !== null;
}

function visibleArea(el: Element): number {
  const r = el.getBoundingClientRect();
  return Math.max(0, r.width) * Math.max(0, r.height);
}

/**
 * Score a candidate <video>. Prefers: CHZZK player class, has media, long
 * duration (the VOD itself rather than a short ad clip), visible, large.
 */
function scoreVideo(v: HTMLVideoElement, selectorRank: number): number {
  if (!v.isConnected) return -Infinity;
  let score = (SELECTORS.video.length - selectorRank) * 10;
  if (v.currentSrc || v.src || v.srcObject) score += 20;
  if (v.readyState > 0) score += 10;
  if (Number.isFinite(v.duration) && v.duration > 0) score += 10 + Math.min(40, v.duration / 60); // hours-long VOD wins over ads
  const area = visibleArea(v);
  if (area > 0) score += 20 + Math.min(20, area / 20000);
  return score;
}

function isUsable(v: HTMLVideoElement | null): v is HTMLVideoElement {
  return !!v && v.isConnected && (v.readyState > 0 || !!v.currentSrc);
}

/** Find the currently playing VOD <video>, or null if the player isn't loaded. */
export function getVideoElement(): HTMLVideoElement | null {
  if (!cacheDirty && isUsable(cachedVideo) && visibleArea(cachedVideo) > 0) return cachedVideo;
  let best: HTMLVideoElement | null = null;
  let bestScore = -Infinity;
  const seen = new Set<HTMLVideoElement>();
  for (const [rank, sel] of SELECTORS.video.entries()) {
    for (const v of document.querySelectorAll<HTMLVideoElement>(sel)) {
      if (seen.has(v)) continue;
      seen.add(v);
      const s = scoreVideo(v, rank);
      if (s > bestScore) {
        best = v;
        bestScore = s;
      }
    }
  }
  cachedVideo = best;
  cacheDirty = false;
  return isUsable(best) ? best : null;
}

export function getCurrentTime(): number | null {
  const v = getVideoElement();
  return v && Number.isFinite(v.currentTime) ? v.currentTime : null;
}

export function getDuration(): number | null {
  const v = getVideoElement();
  return v && Number.isFinite(v.duration) ? v.duration : null;
}

export function isPaused(): boolean {
  return getVideoElement()?.paused ?? true;
}

export function seek(time: number): boolean {
  const v = getVideoElement();
  if (!v) return false;
  const max = Number.isFinite(v.duration) ? v.duration : Infinity;
  v.currentTime = Math.min(Math.max(0, time), max);
  return true;
}

export function pause(): boolean {
  const v = getVideoElement();
  if (!v) return false;
  v.pause();
  return true;
}

export async function play(): Promise<boolean> {
  const v = getVideoElement();
  if (!v) return false;
  try {
    await v.play();
    return true;
  } catch {
    return false;
  }
}

function firstText(selectors: readonly string[]): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

/** Best-effort metadata. Never throws; missing fields are empty strings. */
export function getVodMetadata(href: string = location.href): VodMetadata {
  const id = getVodId(href);
  let title = "";
  let channel = "";
  try {
    title = firstText(SELECTORS.title);
    if (!title) {
      // document.title is "<title> - CHZZK" on VOD pages; og:title may be stale after SPA navigation.
      title = document.title.replace(/\s*[-|]\s*CHZZK\s*$/i, "").trim();
      if (/^CHZZK$/i.test(title) || title === "치지직") title = "";
    }
    channel = firstText(SELECTORS.channel);
  } catch {
    /* metadata is optional */
  }
  return { id, url: id ? `https://chzzk.naver.com/video/${id}` : href, title, channel };
}

/** Where our overlay should live while in fullscreen (otherwise it would be hidden). */
export function getFullscreenHost(): Element | null {
  const fs = document.fullscreenElement;
  if (!fs) return null;
  // A bare <video> cannot host children; our UI stays hidden in native video fullscreen.
  return fs.tagName === "VIDEO" ? null : fs;
}
