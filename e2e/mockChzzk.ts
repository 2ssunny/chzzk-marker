/**
 * Mock CHZZK VOD page for E2E tests. Served at the real https://chzzk.naver.com/video/{id}
 * URL via request interception, so the extension's content script match pattern applies.
 * Markup mirrors the parts of CHZZK that playerAdapter.ts relies on.
 */
import type { BrowserContext, Route } from "playwright-core";

/** Silent 8-bit mono WAV of the given length (small sample rate keeps it light). */
export function silentWav(seconds: number, sampleRate = 4000): Buffer {
  const dataLen = seconds * sampleRate;
  const buf = Buffer.alloc(44 + dataLen, 0x80);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate, 28); // byte rate
  buf.writeUInt16LE(1, 32); // block align
  buf.writeUInt16LE(8, 34); // bits
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

export const VOD_TITLE = "방구석 스트리머들의 전국투어";

function page(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${VOD_TITLE} - CHZZK</title>
<style>body{margin:0;background:#000;color:#fff;font-family:sans-serif} .pzp-pc{width:960px;height:540px;background:#111}
video{width:100%;height:100%} .ad{width:2px;height:2px}</style></head><body>
<div id="root">
  <header style="height:60px">CHZZK</header>
  <main>
    <div class="player_container__x1"><div class="pzp-pc"><div class="pzp-pc__video">
      <video class="webplayer-internal-video" src="/__e2e/media.wav" preload="auto"></video>
    </div></div></div>
    <video class="ad" src="/__e2e/ad.wav" preload="auto"></video>
    <h2 class="video_information_title__AbCd1">${VOD_TITLE}</h2>
    <div class="video_information_name__zz"><span class="name_text__qq">치킨쿤</span></div>
    <input id="chat" placeholder="page input">
    <button id="fs" onclick="document.querySelector('.pzp-pc').requestFullscreen()">fullscreen</button>
  </main>
</div>
<script>
  // Simulate CHZZK player shortcuts: space toggles play/pause on document keydown.
  window.__pageKeys = [];
  document.addEventListener('keydown', e => {
    window.__pageKeys.push(e.key);
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      const v = document.querySelector('video.webplayer-internal-video');
      v.paused ? v.play() : v.pause();
    }
  });
  // Simulate SPA navigation that re-creates the <video> element.
  window.__spaNavigate = (id) => {
    history.pushState({}, '', '/video/' + id);
    const wrap = document.querySelector('.pzp-pc__video');
    wrap.innerHTML = '<video class="webplayer-internal-video" src="/__e2e/media.wav?v=' + id + '" preload="auto"></video>';
    document.querySelector('h2').textContent = 'Second VOD ' + id;
    document.title = 'Second VOD ' + id + ' - CHZZK';
  };
</script></body></html>`;
}

function fulfillRange(route: Route, body: Buffer, contentType: string) {
  const range = route.request().headers()["range"];
  const m = range && /bytes=(\d+)-(\d*)/.exec(range);
  if (!m) {
    return route.fulfill({ status: 200, body, headers: { "Content-Type": contentType, "Accept-Ranges": "bytes" } });
  }
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), body.length - 1) : body.length - 1;
  return route.fulfill({
    status: 206,
    body: body.subarray(start, end + 1),
    headers: {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${body.length}`,
    },
  });
}

export async function installMockChzzk(context: BrowserContext, vodSeconds = 1800) {
  const media = silentWav(vodSeconds);
  const ad = silentWav(5);
  await context.route("https://chzzk.naver.com/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__e2e/media.wav") return fulfillRange(route, media, "audio/wav");
    if (url.pathname === "/__e2e/ad.wav") return fulfillRange(route, ad, "audio/wav");
    if (url.pathname.startsWith("/video/") || url.pathname === "/") {
      return route.fulfill({ status: 200, body: page(), headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return route.fulfill({ status: 404, body: "" });
  });
}
