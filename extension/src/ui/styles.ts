/** Scoped (Shadow DOM) styles. Dark, compact, no animations. */
export const STYLES = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }
/* Author display rules would otherwise override the hidden attribute. */
[hidden] { display: none !important; }
.root {
  --bg: #16181c; --bg2: #1f2228; --bg3: #2a2e36; --fg: #e8eaed; --muted: #9aa0a6;
  /* Same palette as the Premiere panel. */
  --primary: #2d6fd6; --primary-hover: #3a7ee6; --accent: #7ab4ff; --danger: #ff5c5c; --range: #a9b4ff; --border: #343944;
  font: 13px/1.45 "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
  color: var(--fg);
}
button { font: inherit; color: var(--fg); background: var(--bg3); border: 1px solid var(--border);
  border-radius: 6px; padding: 5px 10px; cursor: pointer; }
button:hover { border-color: #4a5160; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button.primary { background: var(--primary); color: #fff; border-color: var(--primary); font-weight: 700; }
button.primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
button.danger { color: var(--danger); }
button.icon { padding: 2px 8px; min-width: 30px; }
input, textarea { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--border);
  border-radius: 6px; padding: 5px 8px; }
textarea { width: 100%; resize: vertical; min-height: 84px; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }
.kbd { font-size: 11px; color: var(--muted); }

/* ---------- editor ---------- */
.editor { position: fixed; top: 72px; left: 24px; width: 360px; max-width: calc(100vw - 48px);
  background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,.5); z-index: 2147483646; }
.editor header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.editor .brand { font-size: 11px; letter-spacing: .04em; color: var(--muted); }
.badge { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: var(--bg3); color: var(--accent); }
.badge.range { color: var(--range); }
.timebig { font-size: 26px; font-weight: 700; width: 100%; text-align: center; background: transparent;
  border: 1px solid transparent; letter-spacing: .02em; padding: 2px 4px; }
.timebig:hover, .timebig:focus { border-color: var(--border); background: var(--bg); }
.range-times { display: flex; align-items: center; gap: 6px; }
.range-times .timebig { font-size: 20px; }
.row { display: flex; gap: 12px; align-items: center; margin: 8px 0; }
.row label { display: flex; align-items: center; gap: 6px; color: var(--muted); }
.row input[type=number] { width: 64px; }
.actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.error { color: var(--danger); font-size: 12px; min-height: 1em; margin-top: 4px; }

/* ---------- sidebar ---------- */
.sidebar { position: fixed; top: 60px; right: 0; bottom: 0; width: 340px; max-width: 100vw;
  background: var(--bg); border-left: 1px solid var(--border); z-index: 2147483645;
  display: flex; flex-direction: column; box-shadow: -6px 0 20px rgba(0,0,0,.35); }
.sb-head { padding: 10px 12px 8px; border-bottom: 1px solid var(--border); }
.sb-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sb-title-row strong { font-size: 13px; }
.sb-project { width: 100%; margin-top: 8px; font-weight: 600; }
.sb-status { margin-top: 6px; font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; }
.sb-status .warn { color: #ffb74d; }
.pending { margin-top: 6px; padding: 4px 8px; border-radius: 6px; background: #1d2a3d; color: var(--range);
  display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.list { flex: 1; overflow-y: auto; padding: 4px 0; }
.empty { padding: 24px 16px; color: var(--muted); text-align: center; }
.item { padding: 8px 12px; border-bottom: 1px solid #22262d; }
.item:hover { background: #1a1d22; }
.item.current { box-shadow: inset 3px 0 0 var(--primary); }
.item-time { display: flex; align-items: center; gap: 6px; font-weight: 700; }
.item-time .ctx { font-weight: 400; font-size: 11px; color: var(--muted); }
.item-comment { white-space: pre-wrap; word-break: break-word; margin: 3px 0 6px; max-height: 5.8em; overflow: hidden; }
.item-actions { display: flex; gap: 4px; }
.item-actions button { padding: 1px 8px; font-size: 12px; }
.sb-foot { border-top: 1px solid var(--border); padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 6px; }
.sb-foot button { flex: 1 1 45%; }
.hint { padding: 0 12px 8px; font-size: 11px; color: var(--muted); }

/* ---------- floating toggle + toast ---------- */
.fab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483645; border-radius: 18px;
  padding: 6px 12px; background: var(--bg2); border: 1px solid var(--border); font-weight: 700; font-size: 12px;
  box-shadow: 0 4px 14px rgba(0,0,0,.4); }
.fab .count { color: var(--accent); margin-left: 4px; }
.fab.pending-range { border-color: var(--range); }
.toast { position: fixed; left: 50%; bottom: 70px; transform: translateX(-50%); z-index: 2147483647;
  background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px;
  box-shadow: 0 6px 20px rgba(0,0,0,.5); pointer-events: none; }
.toast.error { border-color: var(--danger); }
`;
