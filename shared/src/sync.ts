/**
 * 1-point sync math between the CHZZK VOD timeline and a Premiere sequence.
 *
 * Premiere expresses time as integer "ticks" (254,016,000,000 per second).
 * Large tick values (a 10h sequence is ~9.1e15 ticks) exceed Number's exact
 * integer range (2^53 ≈ 9.007e15), so all mapping is done with BigInt:
 *
 *   premiereTicks = premiereSyncTicks + (chzzkMarkerMs - chzzkSyncMs) * TICKS_PER_MS
 *
 * CHZZK times are millisecond-precision, so converting through integer ms is exact.
 */
import { toMs } from "./time";

export const TICKS_PER_SECOND = 254016000000n;
export const TICKS_PER_MS = 254016000n;

export function msToTicks(ms: number): bigint {
  return BigInt(Math.round(ms)) * TICKS_PER_MS;
}

export function secondsToTicks(seconds: number): bigint {
  return msToTicks(toMs(seconds));
}

/** Ticks → seconds (for display / range checks only; may lose sub-µs precision). */
export function ticksToSeconds(ticks: bigint): number {
  const whole = ticks / TICKS_PER_SECOND;
  const rest = ticks % TICKS_PER_SECOND;
  return Number(whole) + Number(rest) / Number(TICKS_PER_SECOND);
}

/** Parse a Premiere ticks string (TickTime.ticks). Throws on malformed input. */
export function parseTicks(ticks: string): bigint {
  if (!/^-?\d+$/.test(ticks.trim())) throw new Error(`Invalid ticks value: ${ticks}`);
  return BigInt(ticks.trim());
}

export interface SyncPoint {
  /** CHZZK VOD time (seconds) of the chosen reference moment. */
  chzzkTime: number;
  /** Premiere sequence time of the same moment, as a ticks string. */
  premiereTicks: string;
}

/** Map a CHZZK time (seconds) to Premiere sequence ticks. */
export function mapToPremiereTicks(sync: SyncPoint, chzzkTime: number): bigint {
  const deltaMs = toMs(chzzkTime) - toMs(sync.chzzkTime);
  return parseTicks(sync.premiereTicks) + msToTicks(deltaMs);
}

/** Map a CHZZK time (seconds) to Premiere sequence seconds. */
export function mapToPremiereSeconds(sync: SyncPoint, chzzkTime: number): number {
  return ticksToSeconds(mapToPremiereTicks(sync, chzzkTime));
}

/** offset = premiereSyncTime - chzzkSyncTime, in ticks. */
export function syncOffsetTicks(sync: SyncPoint): bigint {
  return parseTicks(sync.premiereTicks) - secondsToTicks(sync.chzzkTime);
}

/** Duration in seconds → ticks, exact at ms precision. */
export function durationTicks(seconds: number): bigint {
  return secondsToTicks(seconds);
}
