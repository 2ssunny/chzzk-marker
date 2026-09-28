/**
 * Marker editor panel (create on F8 / Shift+F8, or edit from the sidebar).
 *
 * Keyboard (handled by the controller's global key handler → handleKey):
 *   Ctrl/Cmd+Enter        Save & Resume
 *   Ctrl/Cmd+Shift+Enter  Save (stay paused)
 *   Esc                   Cancel
 * Plain Enter inserts a newline in the comment (never submits).
 * Korean IME: a Ctrl+Enter pressed mid-composition is deferred until compositionend
 * so the last syllable is not lost.
 */
import type { EditMarker } from "../../../shared/src/types";
import { formatTime, parseTime, roundMs } from "../../../shared/src/time";
import { h } from "./dom";

export interface EditorOpenOptions {
  mode: "create" | "edit";
  marker: EditMarker;
  /** Whether "Save & Resume" should resume playback (video was playing when F8 was pressed). */
  wasPlaying: boolean;
  onSubmit: (marker: EditMarker, resume: boolean) => void | Promise<void>;
  onCancel: () => void;
}

const fmt = (t: number) => formatTime(t, { ms: true });

export class MarkerEditor {
  readonly el: HTMLDivElement;
  private opts: EditorOpenOptions | null = null;
  private composing = false;
  private pendingSubmit: boolean | null = null; // resume flag waiting for compositionend
  private submitting = false;

  private titleEl = h("span", { class: "badge" });
  private headingEl = h("span", { class: "brand" }, "CHZZK Edit Marker");
  private body = h("div");
  private errorEl = h("div", { class: "error" });
  private textarea = h("textarea", { placeholder: "Comment (Enter = 줄바꿈)", rows: 4, spellcheck: false });
  private timeInput = h("input", { class: "timebig mono", type: "text", "aria-label": "Time" });
  private startInput = h("input", { class: "timebig mono", type: "text", "aria-label": "Range start" });
  private endInput = h("input", { class: "timebig mono", type: "text", "aria-label": "Range end" });
  private preInput = h("input", { type: "number", min: 0, step: 1, "aria-label": "Pre-roll seconds" });
  private postInput = h("input", { type: "number", min: 0, step: 1, "aria-label": "Post-roll seconds" });
  private resumeBtn = h("button", { class: "primary", type: "button" }, "Save & Resume");
  private saveBtn = h("button", { type: "button" }, "Save");
  private cancelBtn = h("button", { type: "button" }, "Cancel");

  constructor() {
    this.el = h(
      "div",
      { class: "editor", hidden: true, role: "dialog", "aria-label": "CHZZK Edit Marker" },
      h("header", {}, this.headingEl, this.titleEl),
      this.body,
      this.textarea,
      this.errorEl,
      h("div", { class: "actions" }, this.resumeBtn, this.saveBtn, this.cancelBtn),
      h("div", { class: "kbd" }, "Ctrl+Enter 저장 후 재생 · Ctrl+Shift+Enter 저장 · Esc 취소"),
    );
    this.resumeBtn.addEventListener("click", () => void this.submit(true));
    this.saveBtn.addEventListener("click", () => void this.submit(false));
    this.cancelBtn.addEventListener("click", () => this.cancel());
    this.textarea.addEventListener("compositionstart", () => (this.composing = true));
    this.textarea.addEventListener("compositionend", () => {
      this.composing = false;
      if (this.pendingSubmit !== null) {
        const resume = this.pendingSubmit;
        this.pendingSubmit = null;
        setTimeout(() => void this.submit(resume), 0);
      }
    });
  }

  get isOpen(): boolean {
    return this.opts !== null;
  }

  get currentMarkerId(): string | null {
    return this.opts?.marker.id ?? null;
  }

  open(opts: EditorOpenOptions): void {
    this.opts = opts;
    this.submitting = false;
    this.pendingSubmit = null;
    const m = opts.marker;
    this.headingEl.textContent = opts.mode === "create" ? "CHZZK Edit Marker" : "Edit marker";
    this.titleEl.textContent = m.type === "point" ? "POINT" : "RANGE";
    this.titleEl.className = m.type === "point" ? "badge" : "badge range";
    this.errorEl.textContent = "";
    this.body.replaceChildren();
    if (m.type === "point") {
      this.timeInput.value = fmt(m.time);
      this.preInput.value = String(m.pre);
      this.postInput.value = String(m.post);
      this.body.append(
        this.timeInput,
        h(
          "div",
          { class: "row" },
          h("label", {}, "Pre-roll", this.preInput, "sec"),
          h("label", {}, "Post-roll", this.postInput, "sec"),
        ),
      );
    } else {
      this.startInput.value = fmt(m.start);
      this.endInput.value = fmt(m.end);
      this.body.append(h("div", { class: "range-times" }, this.startInput, h("span", { class: "muted" }, "~"), this.endInput));
    }
    this.textarea.value = m.comment;
    this.resumeBtn.hidden = opts.mode === "edit";
    this.saveBtn.className = opts.mode === "edit" ? "primary" : "";
    this.el.hidden = false;
    this.focus();
  }

  focus(): void {
    this.textarea.focus();
    const end = this.textarea.value.length;
    this.textarea.setSelectionRange(end, end);
  }

  close(): void {
    this.opts = null;
    this.pendingSubmit = null;
    this.el.hidden = true;
  }

  cancel(): void {
    const o = this.opts;
    this.close();
    o?.onCancel();
  }

  /** Returns true if the key was consumed by the editor. Called only for events originating inside our UI. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.opts) return false;
    const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
    const composing = e.isComposing || e.keyCode === 229 || this.composing;
    if (isEnter && (e.ctrlKey || e.metaKey)) {
      const resume = !e.shiftKey && this.opts.mode === "create";
      if (composing) {
        // Let the IME commit first; submit on compositionend.
        this.pendingSubmit = resume;
        return true;
      }
      e.preventDefault();
      void this.submit(resume);
      return true;
    }
    if (isEnter && !composing && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      this.textarea.focus();
      return true;
    }
    if (e.key === "Escape" && !composing) {
      e.preventDefault();
      this.cancel();
      return true;
    }
    if (e.key === "F8") {
      e.preventDefault();
      this.focus();
      return true;
    }
    return false;
  }

  private readMarker(): EditMarker | string {
    const o = this.opts!;
    const base = o.marker;
    const comment = this.textarea.value;
    const updatedAt = o.mode === "edit" ? new Date().toISOString() : undefined;
    if (base.type === "point") {
      const time = parseTime(this.timeInput.value);
      if (time === null || time < 0) return "시간 형식이 올바르지 않습니다 (예: 05:18:48 또는 5:18:48.420)";
      const pre = Number(this.preInput.value);
      const post = Number(this.postInput.value);
      if (!Number.isFinite(pre) || pre < 0 || !Number.isFinite(post) || post < 0) return "Pre/Post는 0 이상의 숫자여야 합니다";
      return { ...base, time, pre: roundMs(pre), post: roundMs(post), comment, ...(updatedAt ? { updatedAt } : {}) };
    }
    const a = parseTime(this.startInput.value);
    const b = parseTime(this.endInput.value);
    if (a === null || b === null || a < 0 || b < 0) return "시간 형식이 올바르지 않습니다 (예: 05:43:00)";
    return { ...base, start: Math.min(a, b), end: Math.max(a, b), comment, ...(updatedAt ? { updatedAt } : {}) };
  }

  private async submit(resume: boolean): Promise<void> {
    const o = this.opts;
    if (!o || this.submitting) return;
    const marker = this.readMarker();
    if (typeof marker === "string") {
      this.errorEl.textContent = marker;
      return;
    }
    this.submitting = true;
    try {
      await o.onSubmit(marker, resume && o.wasPlaying);
      this.close();
    } catch (err) {
      this.errorEl.textContent = `저장 실패: ${(err as Error).message}`;
    } finally {
      this.submitting = false;
    }
  }
}
