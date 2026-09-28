/**
 * Time helpers. Canonical unit is seconds (number) at millisecond precision.
 * Internally everything is converted to integer milliseconds before doing
 * arithmetic or formatting, so float noise (e.g. 19128.42 * 1000 = 19128419.999…)
 * never leaks into displayed or stored values.
 */

/** Seconds → integer milliseconds (rounded). */
export function toMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

/** Round seconds to millisecond precision. */
export function roundMs(seconds: number): number {
  return toMs(seconds) / 1000;
}

export interface FormatOptions {
  /** Append ".mmm". */
  ms?: boolean;
  /** Use "H:MM:SS" (no zero-padded hours) instead of "HH:MM:SS". */
  compactHours?: boolean;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Format seconds as HH:MM:SS (default), H:MM:SS (compactHours) and optionally .mmm.
 * Sub-second parts are truncated (like a player clock) unless `ms` is set.
 * Negative values get a leading "-".
 */
export function formatTime(seconds: number, opts: FormatOptions = {}): string {
  if (!Number.isFinite(seconds)) return "--:--:--";
  const totalMs = toMs(Math.abs(seconds));
  const sign = seconds < 0 && totalMs !== 0 ? "-" : "";
  const msPart = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hh = opts.compactHours ? String(h) : pad(h, 2);
  let out = `${sign}${hh}:${pad(m, 2)}:${pad(s, 2)}`;
  if (opts.ms) out += `.${pad(msPart, 3)}`;
  return out;
}

/** Signed format that always shows the sign: "+00:57:22" / "-04:21:26". */
export function formatSignedTime(seconds: number, opts: FormatOptions = {}): string {
  const body = formatTime(Math.abs(seconds), opts);
  return (seconds < 0 && toMs(seconds) !== 0 ? "-" : "+") + body;
}

const TIME_RE = /^(-)?(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/;

/**
 * Parse "H:MM:SS(.mmm)", "HH:MM:SS", "MM:SS", "SS(.mmm)" into seconds (ms precision).
 * When a larger unit is present, minutes/seconds must be < 60.
 * Returns null for invalid input.
 */
export function parseTime(input: string): number | null {
  const str = input.trim().replace(/\s+/g, "");
  if (!str) return null;
  const m = TIME_RE.exec(str);
  if (!m) return null;
  const [, neg, a, b, secStr] = m;
  let h = 0;
  let min = 0;
  if (a !== undefined && b !== undefined) {
    h = Number(a);
    min = Number(b);
  } else if (a !== undefined) {
    min = Number(a);
  }
  const sec = Number(secStr);
  const hasLarger = a !== undefined;
  if (hasLarger && sec >= 60) return null;
  if (a !== undefined && b !== undefined && min >= 60) return null;
  const total = roundMs(h * 3600 + min * 60 + sec);
  return neg ? -total : total;
}
