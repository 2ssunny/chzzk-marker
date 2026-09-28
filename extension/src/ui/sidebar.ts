import type { EditMarker } from "../../../shared/src/types";
import { formatTime } from "../../../shared/src/time";
import { markerAnchor } from "../../../shared/src/markers";
import type { VodProject } from "../store";
import { h } from "./dom";

export interface SidebarCallbacks {
  onSeek: (time: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTitleChange: (title: string) => void;
  onCopyTxt: () => void;
  onDownloadTxt: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onCancelRange: () => void;
  onClose: () => void;
}

export interface SidebarStatus {
  /** "vod" = on a /video/{id} page; "other" = anywhere else on CHZZK. */
  page: "vod" | "other";
  playerFound: boolean;
  currentTime: number | null;
  duration: number | null;
  pendingRangeStart: number | null;
}

const t = (s: number) => formatTime(s);

function timeLabel(m: EditMarker): string {
  return m.type === "point" ? t(m.time) : `${t(m.start)} ~ ${t(m.end)}`;
}

export class Sidebar {
  readonly el: HTMLDivElement;
  private titleInput = h("input", { class: "sb-project", type: "text", placeholder: "Project title", spellcheck: false });
  private countEl = h("span");
  private playerEl = h("span", { class: "mono" });
  private pendingEl = h("div", { class: "pending", hidden: true });
  private list = h("div", { class: "list" });
  private fileInput = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  private buttons: HTMLButtonElement[] = [];
  private markers: EditMarker[] = [];
  private titleTimer: number | undefined;

  constructor(private cb: SidebarCallbacks) {
    const btn = (label: string, onClick: () => void, cls = "") => {
      const b = h("button", { type: "button", class: cls, onclick: onClick }, label);
      this.buttons.push(b);
      return b;
    };
    this.titleInput.addEventListener("input", () => {
      clearTimeout(this.titleTimer);
      this.titleTimer = window.setTimeout(() => cb.onTitleChange(this.titleInput.value), 300);
    });
    this.titleInput.addEventListener("change", () => {
      clearTimeout(this.titleTimer);
      cb.onTitleChange(this.titleInput.value);
    });
    this.fileInput.addEventListener("change", () => {
      const f = this.fileInput.files?.[0];
      this.fileInput.value = "";
      if (f) cb.onImportJson(f);
    });

    this.el = h(
      "div",
      { class: "sidebar", hidden: true },
      h(
        "div",
        { class: "sb-head" },
        h(
          "div",
          { class: "sb-title-row" },
          h("strong", {}, "CHZZK Edit Marker"),
          h("button", { type: "button", class: "icon", title: "Close (F9)", onclick: () => cb.onClose() }, "✕"),
        ),
        this.titleInput,
        h("div", { class: "sb-status" }, this.countEl, this.playerEl),
        this.pendingEl,
      ),
      this.list,
      h("div", { class: "hint" }, "F8 포인트 · Shift+F8 구간 시작/끝 · F9 사이드바"),
      h(
        "div",
        { class: "sb-foot" },
        btn("Copy TXT", () => cb.onCopyTxt()),
        btn("Download TXT", () => cb.onDownloadTxt()),
        btn("Export JSON", () => cb.onExportJson()),
        btn("Import JSON", () => this.fileInput.click()),
        this.fileInput,
      ),
    );
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  setOpen(open: boolean): void {
    this.el.hidden = !open;
  }

  /** Re-render the project (title + list). */
  renderProject(project: VodProject | null, page: "vod" | "other"): void {
    this.markers = project?.markers ?? [];
    if (!this.titleInput.matches(":focus")) {
      this.titleInput.value = project?.projectTitle ?? "";
    }
    this.titleInput.disabled = page !== "vod";
    for (const b of this.buttons.slice(0, 3)) b.disabled = this.markers.length === 0;
    this.buttons[3].disabled = page !== "vod";
    const n = this.markers.length;
    this.countEl.textContent = page === "vod" ? `${n} marker${n === 1 ? "" : "s"}` : "다시보기(VOD) 페이지가 아닙니다";

    if (page !== "vod") {
      this.list.replaceChildren(h("div", { class: "empty" }, "chzzk.naver.com/video/… 다시보기 페이지에서 사용하세요."));
      return;
    }
    if (n === 0) {
      this.list.replaceChildren(h("div", { class: "empty" }, "아직 마커가 없습니다.", h("br"), "F8로 현재 시점에 포인트를 추가하세요."));
      return;
    }
    this.list.replaceChildren(...this.markers.map((m) => this.renderItem(m)));
  }

  private renderItem(m: EditMarker): HTMLElement {
    const actions = h(
      "div",
      { class: "item-actions" },
      h("button", { type: "button", title: "Seek to marker", onclick: () => this.cb.onSeek(markerAnchor(m)) }, "▶"),
      m.type === "point" && m.pre > 0
        ? h("button", { type: "button", title: `Seek to pre-roll (-${m.pre}s)`, onclick: () => this.cb.onSeek(Math.max(0, m.time - m.pre)) }, `▶-${m.pre}s`)
        : null,
      h("button", { type: "button", onclick: () => this.cb.onEdit(m.id) }, "Edit"),
      h("button", { type: "button", class: "danger", onclick: () => this.cb.onDelete(m.id) }, "Delete"),
    );
    return h(
      "div",
      { class: "item", dataset: { id: m.id } },
      h(
        "div",
        { class: "item-time mono" },
        timeLabel(m),
        m.type === "range"
          ? h("span", { class: "badge range" }, "RANGE")
          : h("span", { class: "ctx" }, `-${m.pre}s / +${m.post}s`),
      ),
      m.comment.trim() ? h("div", { class: "item-comment" }, m.comment.trim()) : h("div", { class: "item-comment muted" }, "(no comment)"),
      actions,
    );
  }

  /** Cheap per-second status refresh (does not rebuild the list). */
  updateStatus(s: SidebarStatus): void {
    if (s.page !== "vod") this.playerEl.textContent = "";
    else if (!s.playerFound) {
      this.playerEl.textContent = "CHZZK player not found";
      this.playerEl.className = "mono warn";
    } else {
      this.playerEl.className = "mono";
      this.playerEl.textContent = `${t(s.currentTime ?? 0)}${s.duration ? ` / ${t(s.duration)}` : ""}`;
    }
    if (s.pendingRangeStart !== null) {
      this.pendingEl.hidden = false;
      this.pendingEl.replaceChildren(
        h("span", { class: "mono" }, `구간 시작 ${t(s.pendingRangeStart)} → Shift+F8로 끝 지정`),
        h("button", { type: "button", class: "icon", title: "Cancel range", onclick: () => this.cb.onCancelRange() }, "✕"),
      );
    } else {
      this.pendingEl.hidden = true;
    }
    // Highlight the last marker at or before the playhead.
    if (s.currentTime !== null && this.markers.length) {
      let current: string | null = null;
      for (const m of this.markers) if (markerAnchor(m) <= s.currentTime + 0.001) current = m.id;
      for (const item of this.list.querySelectorAll<HTMLElement>(".item")) item.classList.toggle("current", item.dataset.id === current);
    }
  }
}
