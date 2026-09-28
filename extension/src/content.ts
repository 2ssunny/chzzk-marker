/**
 * Content script entry (runs at document_start on https://chzzk.naver.com/*).
 *
 * Key listeners are registered immediately, in the capture phase on window,
 * so they run before any page handler: F8/Shift+F8/F9 are reliably ours, and
 * keystrokes typed in our panels are hidden from CHZZK's player shortcuts.
 */
import { Controller } from "./controller";

declare global {
  interface Window {
    __chzzkEditMarker?: boolean;
  }
}

if (!window.__chzzkEditMarker) {
  window.__chzzkEditMarker = true;
  const controller = new Controller();
  for (const type of ["keydown", "keyup", "keypress"] as const) {
    window.addEventListener(type, (e) => controller.onKey(e), true);
  }
  const start = () => void controller.init();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
