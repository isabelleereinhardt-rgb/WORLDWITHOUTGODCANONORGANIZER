/* ============================================================
   World Without God — Canon Organizer
   Extra features: Settings (theme colour + fonts), Task manager,
   soft-delete + custom sections data layer, and speech (read-aloud
   + dictation). Kept in one module to stay tidy.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const uid = (p) => (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const S = () => window.CodexStore;

/* ---------- shared caches (read synchronously by app.js) ---------- */
const Extra = {
  hidden: new Set(),      // soft-deleted source-entry ids
  cats: [],               // custom sections [{id,name}]
  settings: defaultSettings(),
  async ready() {
    await S().ready;
    const h = await S().all("hidden"); this.hidden = new Set(h.map(x => x.id));
    this.cats = (await S().all("cats")).sort((a, b) => (a.created || 0) - (b.created || 0));
    const saved = localStorage.getItem("codex.settings");
    if (saved) { try { this.settings = Object.assign(defaultSettings(), JSON.parse(saved)); } catch (e) {} }
    applySettings(this.settings);
  },
  async hide(ids) { for (const id of ids) { this.hidden.add(id); await S().put("hidden", { id }); } logFeed("Deleted", ids.length + " item" + (ids.length === 1 ? "" : "s")); },
  async unhide(id) { this.hidden.delete(id); await S().del("hidden", id); },
  async unhideAll() { for (const id of Array.from(this.hidden)) await S().del("hidden", id); this.hidden.clear(); },
  async addCat(name) { const c = { id: uid("cat"), name: name.trim(), created: Date.now() }; await S().put("cats", c); this.cats.push(c); return c; },
  async delCat(id) { await S().del("cats", id); this.cats = this.cats.filter(c => c.id !== id); },
};
window.CodexExtra = Extra;

/* ---------- activity feed logging ---------- */
async function logFeed(action, detail) {
  try { await S().put("feed", { id: uid("f"), action, detail, at: Date.now() }); } catch (e) {}
}
window.CodexFeed = { log: logFeed };

/* ============================================================
   SETTINGS  — theme colour, fonts, restore deleted
   ============================================================ */
function defaultSettings() {
  return { accent: "", fontSize: 15, uiFont: "Inter", readFont: "Fraunces" };
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}
function mix(hex, withHex, amt) {
  const a = hexToRgb(hex), b = hexToRgb(withHex); if (!a || !b) return hex;
  const c = k => Math.round(a[k] + (b[k] - a[k]) * amt);
  return `rgb(${c("r")},${c("g")},${c("b")})`;
}
const UI_FONTS = { Inter: "'Inter',system-ui,sans-serif", System: "system-ui,-apple-system,sans-serif", Georgia: "Georgia,serif", Verdana: "Verdana,Geneva,sans-serif", Mono: "'Courier New',monospace" };
const READ_FONTS = { Fraunces: "'Fraunces',Georgia,serif", Georgia: "Georgia,serif", Inter: "'Inter',sans-serif", System: "system-ui,sans-serif" };

function applySettings(s) {
  const root = document.documentElement.style;
  if (s.accent) {
    root.setProperty("--accent", s.accent);
    root.setProperty("--accent-ink", mix(s.accent, "#000000", 0.28));
    root.setProperty("--accent-soft", mix(s.accent, "#ffffff", 0.82));
  } else {
    root.removeProperty("--accent"); root.removeProperty("--accent-ink"); root.removeProperty("--accent-soft");
  }
  root.setProperty("--sans", UI_FONTS[s.uiFont] || UI_FONTS.Inter);
  root.setProperty("--serif", READ_FONTS[s.readFont] || READ_FONTS.Fraunces);
  document.body && (document.body.style.fontSize = (s.fontSize || 15) + "px");
}
function saveSettings() { localStorage.setItem("codex.settings", JSON.stringify(Extra.settings)); applySettings(Extra.settings); }

function viewSettings() {
  const s = Extra.settings;
  const swatches = ["#7c5cff", "#c2603f", "#d0699a", "#3f8f6b", "#b8893b", "#3f6f8f", "#9a6bd0", "#d98b2b", "#2f9e8f", "#e0577d"];
  const hiddenCount = Extra.hidden.size;
  view().innerHTML = `<div class="wrap">
    <div class="page-kicker">Settings</div>
    <h1>Settings</h1>
    <p class="muted">Make it yours. Changes apply instantly and are remembered on this device.</p>

    <section class="set-block">
      <h3>Accent colour</h3>
      <p class="faint" style="margin:2px 0 12px">Pick any colour — the whole site follows it. Light and dark mode both still work.</p>
      <div class="swatch-row">
        ${swatches.map(c => `<button class="swatch" style="background:${c}" data-accent="${c}" title="${c}"></button>`).join("")}
        <label class="swatch wheel" title="Custom colour"><input type="color" id="accentPicker" value="${s.accent || "#7c5cff"}"></label>
        <button class="btn ghost sm" id="accentReset">Reset</button>
      </div>
    </section>

    <section class="set-block">
      <h3>Text</h3>
      <div class="set-row">
        <label>Base font size <b id="fsVal">${s.fontSize}px</b></label>
        <input type="range" id="fontSize" min="13" max="20" step="1" value="${s.fontSize}">
      </div>
      <div class="set-row">
        <label>Interface font</label>
        <select id="uiFont">${Object.keys(UI_FONTS).map(f => `<option ${f === s.uiFont ? "selected" : ""}>${f}</option>`).join("")}</select>
      </div>
      <div class="set-row">
        <label>Reading / heading font</label>
        <select id="readFont">${Object.keys(READ_FONTS).map(f => `<option ${f === s.readFont ? "selected" : ""}>${f}</option>`).join("")}</select>
      </div>
    </section>

    <section class="set-block">
      <h3>Deleted entries</h3>
      <p class="faint" style="margin:2px 0 10px">Anything you batch-delete from a collection is hidden, not destroyed — restore it here.</p>
      ${hiddenCount ? `<button class="btn ghost sm" id="restoreAll">Restore all ${hiddenCount} hidden ${hiddenCount === 1 ? "entry" : "entries"}</button>
        <div class="hidden-list" id="hiddenList"></div>` : `<p class="faint">Nothing deleted.</p>`}
    </section>

    <section class="set-block">
      <h3>AI behaviour</h3>
      <p class="faint" style="margin:2px 0 10px">Extra instructions for how the assistant should read and reason about your world. Saved with your work.</p>
      <textarea class="import-body" id="aiInstr" placeholder="e.g. Prefer my own terminology. When I ask who someone is, give a short blurb in my voice, not a raw quote.">${esc(s.aiInstr || "")}</textarea>
      <div style="margin-top:8px"><button class="btn sm" id="saveAiInstr">Save instructions</button></div>
    </section>
  </div>`;

  $$(".swatch[data-accent]").forEach(b => b.onclick = () => { Extra.settings.accent = b.dataset.accent; $("#accentPicker").value = b.dataset.accent; saveSettings(); });
  $("#accentPicker").oninput = e => { Extra.settings.accent = e.target.value; saveSettings(); };
  $("#accentReset").onclick = () => { Extra.settings.accent = ""; saveSettings(); toast("Accent reset"); };
  $("#fontSize").oninput = e => { Extra.settings.fontSize = +e.target.value; $("#fsVal").textContent = e.target.value + "px"; saveSettings(); };
  $("#uiFont").onchange = e => { Extra.settings.uiFont = e.target.value; saveSettings(); };
  $("#readFont").onchange = e => { Extra.settings.readFont = e.target.value; saveSettings(); };
  $("#saveAiInstr") && ($("#saveAiInstr").onclick = () => { Extra.settings.aiInstr = $("#aiInstr").value; saveSettings(); toast("Saved"); });

  if (hiddenCount) {
    renderHidden();
    $("#restoreAll").onclick = async () => { await Extra.unhideAll(); window.Codex && Codex.refresh && Codex.refresh(); toast("Restored"); viewSettings(); };
  }
  function renderHidden() {
    const el = $("#hiddenList"); if (!el) return;
    const items = Array.from(Extra.hidden).map(id => (window.Codex && Codex.byId[id])).filter(Boolean).slice(0, 60);
    el.innerHTML = items.map(e => `<div class="hidden-item"><span>${esc(e.title)} <span class="faint">· ${esc(e.category)}</span></span>
      <button class="btn ghost sm" data-restore="${e.id}">Restore</button></div>`).join("");
    $$("[data-restore]", el).forEach(b => b.onclick = async () => { await Extra.unhide(b.dataset.restore); window.Codex && Codex.refresh && Codex.refresh(); viewSettings(); });
  }
}

/* ============================================================
   TASK MANAGER  — a real-time to-do list
   ============================================================ */
async function viewTasks() {
  await S().ready;
  const tasks = (await S().all("tasks")).sort((a, b) => (a.done - b.done) || (b.created - a.created));
  const open = tasks.filter(t => !t.done).length;
  view().innerHTML = `<div class="wrap">
    <div class="page-kicker">Workspace</div>
    <h1>Task Manager</h1>
    <p class="muted">${open} open · ${tasks.length} total. Cross things off as you go — it saves as you type.</p>
    <div class="task-add"><input id="taskInput" placeholder="Add a task and press Enter…" autocomplete="off">
      <button class="btn" id="taskAddBtn">Add</button></div>
    <div class="task-list" id="taskList">
      ${tasks.length ? tasks.map(taskRow).join("") : `<div class="empty-state">No tasks yet. What do you need to do?</div>`}
    </div>
  </div>`;
  const input = $("#taskInput");
  const add = async () => { const t = input.value.trim(); if (!t) return; await S().put("tasks", { id: uid("t"), text: t, done: false, created: Date.now() }); input.value = ""; logFeed("Added task", t.slice(0, 60)); viewTasks(); };
  $("#taskAddBtn").onclick = add;
  input.onkeydown = e => { if (e.key === "Enter") add(); };
  input.focus();
  bindTaskRows();
}
function taskRow(t) {
  return `<div class="task-item ${t.done ? "done" : ""}" data-id="${t.id}">
    <button class="task-check" data-toggle="${t.id}" aria-label="Toggle">${t.done ? "✓" : ""}</button>
    <span class="task-text" contenteditable="true" data-edit="${t.id}">${esc(t.text)}</span>
    <button class="task-del" data-del="${t.id}" title="Delete">✕</button>
  </div>`;
}
function bindTaskRows() {
  $$("[data-toggle]").forEach(b => b.onclick = async () => {
    const t = await S().get("tasks", b.dataset.toggle); if (!t) return; t.done = !t.done; await S().put("tasks", t); viewTasks();
  });
  $$("[data-del]").forEach(b => b.onclick = async () => { await S().del("tasks", b.dataset.del); viewTasks(); });
  $$("[data-edit]").forEach(el => el.addEventListener("blur", async () => {
    const t = await S().get("tasks", el.dataset.edit); if (!t) return; t.text = el.textContent.trim(); await S().put("tasks", t);
  }));
}

/* ============================================================
   ACTIVITY FEED
   ============================================================ */
async function viewFeed() {
  await S().ready;
  const items = (await S().all("feed")).sort((a, b) => b.at - a.at).slice(0, 200);
  const fmt = t => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  view().innerHTML = `<div class="wrap">
    <div class="page-kicker">Updates</div>
    <h1>Activity Feed</h1>
    <p class="muted">Everything you've changed lately, newest first.</p>
    ${items.length ? `<div class="feed-list">${items.map(i => `<div class="feed-item">
      <span class="feed-when">${fmt(i.at)}</span>
      <span class="feed-what"><b>${esc(i.action)}</b> ${esc(i.detail || "")}</span></div>`).join("")}</div>`
      : `<div class="empty-state">No activity yet.</div>`}
  </div>`;
}

/* ============================================================
   SPEECH  — read-aloud (TTS) + dictation (STT)
   ============================================================ */
const Speech = {
  reading: false,
  read(text) {
    if (!("speechSynthesis" in window)) { toast("Speech not supported here"); return; }
    speechSynthesis.cancel();
    if (!text || !text.trim()) { toast("Select some text first"); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.onend = () => { Speech.reading = false; };
    Speech.reading = true; speechSynthesis.speak(u);
  },
  readSelection() {
    const sel = (window.getSelection && String(window.getSelection())) || "";
    this.read(sel);
  },
  stop() { if ("speechSynthesis" in window) speechSynthesis.cancel(); this.reading = false; },
  dictate(onText, onStop) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("Dictation not supported in this browser"); return null; }
    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    let finalText = "";
    rec.onresult = e => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " "; else interim += r[0].transcript;
      }
      onText(finalText, interim);
    };
    rec.onerror = () => { onStop && onStop(); };
    rec.onend = () => { onStop && onStop(); };
    try { rec.start(); } catch (e) {}
    return rec;
  },
};
window.CodexSpeech = Speech;

/* global read-aloud button (reads current selection) */
function readSelectionGlobal() { Speech.readSelection(); }
window.CodexReadAloud = readSelectionGlobal;

window.CodexUI = { viewSettings, viewTasks, viewFeed };
})();
