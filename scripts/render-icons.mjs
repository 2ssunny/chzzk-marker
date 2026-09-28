// Renders extension/public/icons/icon.svg to the PNG sizes Chrome needs (one-off helper).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const svg = readFileSync("extension/public/icons/icon.svg", "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
for (const size of [16, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img width=${size} height=${size} src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`);
  await page.screenshot({ path: `extension/public/icons/icon${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("icons rendered");
