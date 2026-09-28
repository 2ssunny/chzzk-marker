/**
 * CHZZK Marker Import — Premiere Pro UXP panel.
 * UI wiring only; logic lives in session.ts / plan.ts, Premiere calls in ppro.ts.
 */
import type { premierepro } from "@adobe/premierepro";
import type { EditMarker } from "../../shared/src/types";
import { formatSignedTime, formatTime } from "../../shared/src/time";
import { markerAnchor, commentSummary } from "../../shared/src/markers";
import { mapToPremiereTicks, ticksToSeconds } from "../../shared/src/sync";
import { isApplicable, summarize, type PlannedMarker } from "./plan";
import { PremiereBridge, type ActiveContext, type SequenceInfo } from "./ppro";
import { ImportSession } from "./session";

declare const require: (id: string) => unknown;

interface UxpFile {
  name: string;
  read(opts?: unknown): Promise<string>;
}
interface UxpModule {
  storage: { localFileSystem: { getFileForOpening(opts: { types?: string[]; allowMultiple?: boolean }): Promise<UxpFile | UxpFile[] | null> } };
}

const ppro = require("premierepro") as premierepro;
const uxp = require("uxp") as UxpModule;
const bridge = new PremiereBridge(ppro);

const STORAGE_KEY = "chzzk-edit-marker/import-session/v1";
function loadState(): ImportSession {
  try {
    return ImportSession.restore(localStorage.getItem(STORAGE_KEY));
  } catch {
    return new ImportSession();
  }
}
let session = loadState();
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, session.serialize());
  } catch {
    /* storage unavailable: state is per-panel-session only */
  }
}

// ------------------------------------------------------------------ DOM helpers

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (el: HTMLElement, on: boolean) => (el.style.display = on ? "" : "none");
const tc = (sec: number) => formatTime(sec, { ms: true });
const tcTicks = (ticks: bigint) => tc(ticksToSeconds(ticks));

function setStatus(msg: string, kind: "info" | "error" | "ok" = "info") {
  const el = $("status");
  el.textContent = msg;
  el.className = `status ${kind}`;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function chzzkLabel(m: EditMarker): string {
  return m.type === "point" ? formatTime(m.time) : `${formatTime(m.start)} ~ ${formatTime(m.end)}`;
}

// ------------------------------------------------------------------ live Premiere state

let active: ActiveContext | null = null;
let seqInfo: SequenceInfo | null = null;
let playhead: bigint | null = null;
let seqInfoAt = 0;

async function poll() {
  try {
    const ctx = await bridge.getActive();
    active = ctx;
    if (!ctx) {
      playhead = null;
      seqInfo = null;
    } else {
      playhead = await bridge.getPlayheadTicks(ctx.sequence);
      const now = Date.now();
      if (!seqInfo || seqInfo.name !== ctx.sequence.name || now - seqInfoAt > 3000) {
        seqInfo = await bridge.getSequenceInfo(ctx.sequence);
        seqInfoAt = now;
      }
    }
  } catch {
    active = null;
    playhead = null;
  }
  renderLive();
}

async function requireActive(): Promise<{ ctx: ActiveContext; info: SequenceInfo }> {
  const ctx = await bridge.getActive();
  if (!ctx) throw new Error("활성 시퀀스가 없습니다. 타임라인에서 시퀀스를 열어주세요. (No active sequence)");
  const info = await bridge.getSequenceInfo(ctx.sequence);
  return { ctx, info };
}

// ------------------------------------------------------------------ rendering

function renderLive() {
  $("playhead").textContent = playhead === null ? "—" : tcTicks(playhead);
  $("sequence").textContent = active ? active.sequence.name : "No active sequence";
  const warn = session.sync && seqInfo && !session.syncMatches(seqInfo);
  $("syncWarn").textContent = warn ? `⚠ Sync was made on "${session.sync!.sequenceName}", active sequence differs.` : "";
  ($("syncHere") as HTMLButtonElement).disabled = !active || !session.selected;
}

function renderFile() {
  const f = session.file;
  show($("fileInfo"), !!f);
  show($("emptyHint"), !f);
  if (f) {
    $("projectTitle").textContent = f.projectTitle || f.vod.title || "(untitled)";
    $("fileName").textContent = session.fileName;
    $("markerCount").textContent = `${f.markers.length} markers loaded`;
    $("warnings").textContent = session.warnings.length ? `${session.warnings.length} invalid marker(s) skipped` : "";
  }
  renderList();
  renderSync();
}

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  for (const m of session.markers) {
    const row = el("div", `row${m.id === session.selectedId ? " selected" : ""}`);
    row.appendChild(el("span", "time", chzzkLabel(m)));
    if (m.type === "range") row.appendChild(el("span", "badge", "RANGE"));
    row.appendChild(el("span", "summary", commentSummary(m.comment, 40) || "(no comment)"));
    if (session.sync) row.appendChild(el("span", "mapped", "→ " + formatTime(ticksToSeconds(mapToPremiereTicks(session.sync, markerAnchor(m))))));
    row.addEventListener("click", () => {
      session.select(m.id);
      persist();
      renderList();
      renderSync();
    });
    list.appendChild(row);
  }
}

function renderSync() {
  const sel = session.selected;
  $("selTime").textContent = sel ? `${tc(markerAnchor(sel))}  ${commentSummary(sel.comment, 24)}` : "—";
  const s = session.sync;
  $("offset").textContent = s ? formatSignedTime(session.offsetSeconds!, { ms: true }) : "not synced";
  $("syncInfo").textContent = s ? `CHZZK ${tc(s.chzzkTime)}  ↔  Premiere ${tcTicks(BigInt(s.premiereTicks))}  (${s.sequenceName})` : "";
  ($("gotoSel") as HTMLButtonElement).disabled = !s || !sel;
  ($("apply") as HTMLButtonElement).disabled = !s || session.markers.length === 0;
  renderLive();
}

function describeSummary(plan: PlannedMarker[]): string {
  const s = summarize(plan);
  const parts = [`${s.total} markers`, `${s.toApply} to apply${s.clamped ? ` (${s.clamped} clamped)` : ""}`];
  if (s.duplicate) parts.push(`${s.duplicate} already imported (skipped)`);
  if (s.beforeStart) parts.push(`${s.beforeStart} skipped (before sequence start)`);
  if (s.afterEnd) parts.push(`${s.afterEnd} skipped (after sequence end)`);
  return parts.join("\n");
}

// ------------------------------------------------------------------ actions

async function onLoad() {
  try {
    const picked = await uxp.storage.localFileSystem.getFileForOpening({ types: ["json"], allowMultiple: false });
    const file = Array.isArray(picked) ? picked[0] : picked;
    if (!file) return;
    const text = await file.read();
    const res = session.load(String(text), file.name);
    if (!res.ok) return setStatus(`Load failed: ${res.error}`, "error");
    persist();
    hideConfirm();
    $("result").textContent = "";
    renderFile();
    setStatus(`Loaded ${session.markers.length} markers. 기준 마커를 선택하고 같은 장면에 playhead를 둔 뒤 Sync Here.`, "ok");
  } catch (e) {
    setStatus(`Load failed: ${(e as Error).message}`, "error");
  }
}

async function onSyncHere() {
  try {
    const { ctx, info } = await requireActive();
    const ticks = await bridge.getPlayheadTicks(ctx.sequence);
    const s = session.setSync(ticks, info);
    persist();
    renderList();
    renderSync();
    setStatus(`Synced: CHZZK ${tc(s.chzzkTime)} = Premiere ${tcTicks(ticks)}`, "ok");
  } catch (e) {
    setStatus((e as Error).message, "error");
  }
}

async function onGotoSelected() {
  try {
    const sel = session.selected;
    if (!session.sync || !sel) return;
    const { ctx } = await requireActive();
    const t = mapToPremiereTicks(session.sync, markerAnchor(sel));
    await bridge.setPlayheadTicks(ctx.sequence, t);
    setStatus(`Playhead → ${tcTicks(t)} (CHZZK ${tc(markerAnchor(sel))})`);
  } catch (e) {
    setStatus((e as Error).message, "error");
  }
}

let pending: { ctx: ActiveContext; plan: PlannedMarker[] } | null = null;

function hideConfirm() {
  pending = null;
  show($("confirm"), false);
}

async function onApply() {
  try {
    const { ctx, info } = await requireActive();
    const existing = await bridge.getExistingIds(ctx.sequence);
    const plan = session.plan(info, existing);
    const n = plan.filter(isApplicable).length;
    $("result").textContent = describeSummary(plan);
    if (n === 0) {
      hideConfirm();
      return setStatus("추가할 마커가 없습니다 (No markers to add).", "info");
    }
    pending = { ctx, plan };
    const mismatch = !session.syncMatches(info) ? `\n⚠ Sync was made on "${session.sync!.sequenceName}", not "${info.name}".` : "";
    $("confirmText").textContent = `${n} markers will be added to "${info.name}". Continue?${mismatch}`;
    show($("confirm"), true);
  } catch (e) {
    setStatus((e as Error).message, "error");
  }
}

async function onConfirm() {
  const p = pending;
  hideConfirm();
  if (!p) return;
  try {
    const items = p.plan.filter(isApplicable);
    const res = await bridge.addMarkers(p.ctx, items);
    const after = await bridge.getExistingIds(p.ctx.sequence).catch(() => null);
    const verified = after ? items.filter((i) => after.has(i.marker.id)).length : null;
    const lines = [describeSummary(p.plan), `${res.added.length} applied`];
    if (res.failed.length) lines.push(`${res.failed.length} failed: ${res.failed.map((f) => f.error).join("; ")}`);
    if (verified !== null) lines.push(`verified in sequence: ${verified}/${items.length}`);
    $("result").textContent = lines.join("\n");
    setStatus(
      res.failed.length ? `Applied ${res.added.length}, ${res.failed.length} failed.` : `Applied ${res.added.length} markers.${res.mode === "batch" ? " (Undo: Ctrl/Cmd+Z)" : ""}`,
      res.failed.length ? "error" : "ok",
    );
  } catch (e) {
    setStatus(`Apply failed: ${(e as Error).message}`, "error");
  }
}

function onClear() {
  session = new ImportSession();
  persist();
  hideConfirm();
  $("result").textContent = "";
  renderFile();
  setStatus("Cleared.");
}

// ------------------------------------------------------------------ boot

function boot() {
  $("load").addEventListener("click", () => void onLoad());
  $("clear").addEventListener("click", onClear);
  $("syncHere").addEventListener("click", () => void onSyncHere());
  $("gotoSel").addEventListener("click", () => void onGotoSelected());
  $("apply").addEventListener("click", () => void onApply());
  $("confirmYes").addEventListener("click", () => void onConfirm());
  $("confirmNo").addEventListener("click", () => {
    hideConfirm();
    setStatus("Cancelled.");
  });
  hideConfirm();
  renderFile();
  if (session.file) setStatus(`Restored ${session.fileName}${session.sync ? " (synced)" : ""}`);
  void poll();
  setInterval(() => void poll(), 500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
