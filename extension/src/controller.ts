import type { EditMarker } from "../../shared/src/types";
import { formatTime } from "../../shared/src/time";
import { commentSummary, createPoint, createRange, markerAnchor } from "../../shared/src/markers";
import { buildMarkerFile, buildTxt, exportBaseName, serializeMarkerFile } from "../../shared/src/exporters";
import { parseMarkerFile } from "../../shared/src/validate";
import * as player from "./chzzk/playerAdapter";
import {
  DEFAULT_SETTINGS,
  ProjectRepository,
  applyVodMetadata,
  emptyProject,
  mergeImport,
  projectKey,
  removeMarker,
  setProjectTitle,
  upsertMarker,
  type Settings,
  type VodProject,
} from "./store";
import { MarkerEditor } from "./ui/editor";
import { Sidebar } from "./ui/sidebar";
import { STYLES } from "./ui/styles";
import { h } from "./ui/dom";

const HOST_ID = "chzzk-edit-marker-host";

function extensionAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export class Controller {
  private repo = new ProjectRepository();
  private host: HTMLElement | null = null;
  private editor = new MarkerEditor();
  private sidebar: Sidebar;
  private fab = h("button", { class: "fab", type: "button", title: "CHZZK Edit Marker (F9)" });
  private toastEl = h("div", { class: "toast", hidden: true, role: "status" });
  private toastTimer: number | undefined;

  private href = "";
  private vodId: string | null = null;
  private project: VodProject | null = null;
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private pendingRangeStart: number | null = null;
  private ready = false;

  constructor() {
    this.sidebar = new Sidebar({
      onSeek: (t) => {
        if (!player.seek(t)) this.toast("CHZZK player not found", true);
      },
      onEdit: (id) => this.editMarker(id),
      onDelete: (id) => void this.deleteMarker(id),
      onTitleChange: (title) => void this.mutate((p) => setProjectTitle(p, title), false),
      onCopyTxt: () => void this.copyTxt(),
      onDownloadTxt: () => this.downloadTxt(),
      onExportJson: () => this.exportJson(),
      onImportJson: (f) => void this.importJson(f),
      onCancelRange: () => {
        this.pendingRangeStart = null;
        this.refreshStatus();
      },
      onClose: () => this.setSidebar(false),
    });
    this.fab.addEventListener("click", () => this.setSidebar(!this.sidebar.isOpen));
  }

  // ---------------------------------------------------------------- lifecycle

  async init(): Promise<void> {
    if (this.ready) return;
    this.ready = true;
    this.mountUi();
    player.startObserving(() => this.refreshStatus());
    try {
      this.settings = await this.repo.loadSettings();
    } catch {
      /* defaults */
    }
    await this.handleNavigation();
    this.setSidebar(this.settings.sidebarOpen, false);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !this.vodId) return;
      const change = changes[projectKey(this.vodId)];
      if (change?.newValue) {
        this.project = change.newValue as VodProject;
        this.renderProject();
      }
    });
    document.addEventListener("fullscreenchange", () => this.placeHost());
    // SPA navigation: CHZZK uses history.pushState, which content scripts can't hook directly.
    window.setInterval(() => {
      if (location.href !== this.href) void this.handleNavigation();
      this.refreshStatus();
    }, 700);
  }

  private mountUi(): void {
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.append(style, h("div", { class: "root" }, this.sidebar.el, this.editor.el, this.fab, this.toastEl));
    this.host = host;
    this.placeHost();
  }

  /** Keep the overlay visible in fullscreen by moving it inside the fullscreen element. */
  private placeHost(): void {
    if (!this.host) return;
    const target = player.getFullscreenHost() ?? document.documentElement;
    if (this.host.parentNode !== target) target.appendChild(this.host);
  }

  private async handleNavigation(): Promise<void> {
    this.href = location.href;
    const vodId = player.getVodId();
    if (vodId === this.vodId) return;
    if (this.editor.isOpen) this.editor.close();
    this.vodId = vodId;
    this.pendingRangeStart = null;
    this.project = null;
    if (vodId) {
      try {
        this.project = await this.repo.load(vodId);
      } catch (e) {
        this.reportStorageError(e);
      }
    }
    this.renderProject();
  }

  // ---------------------------------------------------------------- keyboard

  /** Global key handler, registered on window in the capture phase at document_start. */
  onKey(e: KeyboardEvent): void {
    if (!this.ready) return;
    const inUi = !!this.host && e.composedPath().includes(this.host);
    if (inUi) {
      // Isolate typing in our panels from CHZZK's player shortcuts (space, arrows, f, m …).
      // Default actions (text input) still happen.
      e.stopImmediatePropagation();
      if (e.type !== "keydown") return;
      if (this.editor.handleKey(e)) return;
      if (e.key === "F9") {
        e.preventDefault();
        this.setSidebar(!this.sidebar.isOpen);
      }
      return;
    }
    if (e.type !== "keydown" || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "F8") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.shiftKey) this.toggleRange();
      else this.newPoint();
    } else if (e.key === "F9" && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.setSidebar(!this.sidebar.isOpen);
    }
  }

  // ---------------------------------------------------------------- actions

  private precheck(): number | null {
    if (!this.vodId) {
      this.toast("다시보기(VOD) 페이지에서만 마커를 찍을 수 있습니다", true);
      return null;
    }
    if (this.editor.isOpen) {
      this.editor.focus(); // never open a second editor
      return null;
    }
    const time = player.getCurrentTime();
    if (time === null) {
      this.toast("CHZZK player not found", true);
      return null;
    }
    return time;
  }

  newPoint(): void {
    const time = this.precheck();
    if (time === null) return;
    const wasPlaying = !player.isPaused();
    player.pause();
    const marker = createPoint(time, "", this.settings.defaultPre, this.settings.defaultPost);
    this.openCreateEditor(marker, wasPlaying);
  }

  toggleRange(): void {
    const time = this.precheck();
    if (time === null) return;
    if (this.pendingRangeStart === null) {
      this.pendingRangeStart = time;
      this.toast(`구간 시작 ${formatTime(time)} — Shift+F8로 끝 지정`);
      this.refreshStatus();
      return;
    }
    const start = this.pendingRangeStart;
    this.pendingRangeStart = null;
    const wasPlaying = !player.isPaused();
    player.pause();
    this.openCreateEditor(createRange(start, time, ""), wasPlaying);
    this.refreshStatus();
  }

  private openCreateEditor(marker: EditMarker, wasPlaying: boolean): void {
    this.editor.open({
      mode: "create",
      marker,
      wasPlaying,
      onSubmit: async (m, resume) => {
        await this.mutate((p) => upsertMarker(p, m));
        if (m.type === "point" && (m.pre !== this.settings.defaultPre || m.post !== this.settings.defaultPost)) {
          // Remember the last used context lengths for the next F8.
          this.settings = { ...this.settings, defaultPre: m.pre, defaultPost: m.post };
          void this.repo.saveSettings({ defaultPre: m.pre, defaultPost: m.post }).catch(() => {});
        }
        this.toast(`저장됨 ${formatTime(markerAnchor(m))}${commentSummary(m.comment) ? ` · ${commentSummary(m.comment, 30)}` : ""}`);
        if (resume) void player.play();
      },
      onCancel: () => {
        // Restore the previous playback state.
        if (wasPlaying) void player.play();
      },
    });
  }

  private editMarker(id: string): void {
    const m = this.project?.markers.find((x) => x.id === id);
    if (!m) return;
    if (this.editor.isOpen && this.editor.currentMarkerId !== id) {
      this.editor.focus();
      this.toast("편집 중인 마커를 먼저 저장하거나 취소하세요", true);
      return;
    }
    this.editor.open({
      mode: "edit",
      marker: m,
      wasPlaying: false,
      onSubmit: async (next) => {
        await this.mutate((p) => upsertMarker(p, next));
        this.toast("수정됨");
      },
      onCancel: () => {},
    });
  }

  private async deleteMarker(id: string): Promise<void> {
    const m = this.project?.markers.find((x) => x.id === id);
    if (!m) return;
    const label = m.type === "point" ? formatTime(m.time) : `${formatTime(m.start)} ~ ${formatTime(m.end)}`;
    if (!window.confirm(`이 마커를 삭제할까요?\n\n${label}\n${commentSummary(m.comment)}`)) return;
    if (this.editor.currentMarkerId === id) this.editor.close();
    await this.mutate((p) => removeMarker(p, id));
    this.toast("삭제됨");
  }

  /** Read-modify-write the current VOD project in storage. */
  private async mutate(fn: (p: VodProject) => VodProject, withMetadata = true): Promise<void> {
    const vodId = this.vodId;
    if (!vodId) throw new Error("Not on a VOD page");
    if (!extensionAlive()) {
      this.reportStorageError(new Error("Extension context invalidated"));
      throw new Error("확장 프로그램이 다시 로드되었습니다. 페이지를 새로고침하세요.");
    }
    const meta = player.getVodMetadata();
    const vod = { id: vodId, url: meta.url, title: meta.title };
    try {
      this.project = await this.repo.update(
        vodId,
        () => emptyProject(vod),
        (p) => fn(withMetadata ? applyVodMetadata(p, vod) : p),
      );
    } catch (e) {
      this.reportStorageError(e);
      throw e;
    }
    this.renderProject();
  }

  // ---------------------------------------------------------------- export / import

  private exportTitle(): string {
    return this.project?.projectTitle || this.project?.vodTitle || player.getVodMetadata().title || "CHZZK markers";
  }

  private txt(): string {
    return buildTxt(this.exportTitle(), this.project?.markers ?? []);
  }

  private async copyTxt(): Promise<void> {
    const text = this.txt();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for pages/contexts where the async clipboard API is blocked.
      const ta = h("textarea", { value: text });
      this.host?.shadowRoot?.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) return this.toast("클립보드 복사 실패", true);
    }
    this.toast(`TXT 복사됨 (${this.project?.markers.length ?? 0} markers)`);
  }

  private download(filename: string, content: string, mime: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = h("a", { href: url, download: filename });
    this.host?.shadowRoot?.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  private downloadTxt(): void {
    // BOM so that legacy Windows tools (e.g. old Notepad) detect UTF-8 Korean correctly.
    this.download(`${exportBaseName(this.exportTitle(), this.vodId)}.txt`, "﻿" + this.txt(), "text/plain;charset=utf-8");
    this.toast("TXT 다운로드");
  }

  private exportJson(): void {
    if (!this.project || !this.vodId) return;
    const meta = player.getVodMetadata();
    const file = buildMarkerFile(
      this.exportTitle(),
      { url: this.project.vodUrl || meta.url, title: this.project.vodTitle || meta.title, id: this.vodId },
      this.project.markers,
    );
    this.download(`${exportBaseName(this.exportTitle(), this.vodId)}.json`, serializeMarkerFile(file), "application/json");
    this.toast("JSON 내보내기 완료");
  }

  private async importJson(f: File): Promise<void> {
    if (!this.vodId) return;
    const res = parseMarkerFile(await f.text());
    if (!res.ok) {
      this.toast(`가져오기 실패: ${res.errors.join("; ")}`, true);
      return;
    }
    const { file, warnings } = res;
    if (file.vod.id && file.vod.id !== this.vodId) {
      const ok = window.confirm(
        `이 JSON은 다른 다시보기(${file.vod.id})의 마커입니다.\n현재 다시보기(${this.vodId})로 가져올까요?`,
      );
      if (!ok) return;
    }
    let summary = "";
    await this.mutate((p) => {
      const r = mergeImport(p, file);
      summary = `가져옴: ${r.added}개 추가, ${r.replaced}개 갱신`;
      return r.project;
    });
    this.toast(summary + (warnings.length ? ` (${warnings.length}개 무시됨)` : ""), warnings.length > 0);
    if (warnings.length) console.warn("[CHZZK Edit Marker] import warnings:", warnings);
  }

  // ---------------------------------------------------------------- rendering

  private setSidebar(open: boolean, persist = true): void {
    this.sidebar.setOpen(open);
    if (open) {
      this.renderProject();
      this.refreshStatus();
    }
    if (persist) {
      this.settings.sidebarOpen = open;
      if (extensionAlive()) void this.repo.saveSettings({ sidebarOpen: open }).catch(() => {});
    }
  }

  private renderProject(): void {
    this.sidebar.renderProject(this.project, this.vodId ? "vod" : "other");
    this.refreshStatus();
  }

  private refreshStatus(): void {
    const onVod = !!this.vodId;
    const video = onVod ? player.getVideoElement() : null;
    const n = this.project?.markers.length ?? 0;
    this.fab.hidden = !onVod || this.sidebar.isOpen;
    this.fab.classList.toggle("pending-range", this.pendingRangeStart !== null);
    this.fab.replaceChildren(
      this.pendingRangeStart !== null ? `● 구간 ${formatTime(this.pendingRangeStart)}~` : "✎ Markers",
      h("span", { class: "count" }, String(n)),
    );
    if (!this.sidebar.isOpen) return;
    this.sidebar.updateStatus({
      page: onVod ? "vod" : "other",
      playerFound: !!video,
      currentTime: video ? video.currentTime : null,
      duration: video && Number.isFinite(video.duration) ? video.duration : null,
      pendingRangeStart: this.pendingRangeStart,
    });
  }

  private toast(msg: string, error = false): void {
    this.toastEl.textContent = msg;
    this.toastEl.className = error ? "toast error" : "toast";
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), error ? 4000 : 1800);
  }

  private reportStorageError(e: unknown): void {
    const msg = String((e as Error)?.message ?? e);
    if (/context invalidated/i.test(msg) || !extensionAlive()) {
      this.toast("확장 프로그램이 다시 로드되었습니다. 페이지를 새로고침하세요.", true);
    } else {
      this.toast(`저장소 오류: ${msg}`, true);
    }
    console.error("[CHZZK Edit Marker]", e);
  }
}
