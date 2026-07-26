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

/* ============================================================
   SETTINGS data — fonts + typography (defined before Extra, since
   Extra's initial value calls defaultSettings() immediately)
   ============================================================ */
/* the full font library — loaded via the Google Fonts link in index.html,
   plus a few system fonts that need no loading at all */
const FONT_LIST = [
  "Fraunces", "Inter", "Lora", "Cormorant Garamond", "Cormorant", "Playfair Display", "EB Garamond",
  "Crimson Text", "Crimson Pro", "Libre Baskerville", "Merriweather", "Spectral", "Vollkorn",
  "Source Serif 4", "PT Serif", "Bitter", "Domine", "Alegreya", "Cardo", "Marcellus", "Cinzel",
  "Cinzel Decorative", "Diplomata SC", "Almendra", "IM Fell English", "Old Standard TT", "Abril Fatface",
  "Josefin Sans", "Raleway", "Montserrat", "Poppins", "Nunito", "Quicksand", "Work Sans", "Karla",
  "Space Grotesk", "Jost", "Georgia", "Times New Roman", "Verdana", "System UI",
];
function fontStack(name) {
  if (name === "Georgia") return "Georgia,serif";
  if (name === "Times New Roman") return "'Times New Roman',Times,serif";
  if (name === "Verdana") return "Verdana,Geneva,sans-serif";
  if (name === "System UI") return "system-ui,-apple-system,sans-serif";
  const serifish = !/Sans|Work Sans|Raleway|Montserrat|Poppins|Nunito|Quicksand|Karla|Grotesk|Jost|Inter/.test(name);
  return `'${name}',${serifish ? "Georgia,serif" : "system-ui,sans-serif"}`;
}

/* every text style you can pick a font/size/colour for, and where it applies.
   Defaults follow the romantasy design: Cormorant Garamond for display
   levels, Crimson Pro for body and captions. */
const TYPO_STYLES = [
  { key: "title", label: "Title", tag: "h1", defFont: "Cormorant Garamond", defSize: 42, defColor: "" },
  { key: "subtitle", label: "Subtitle", tag: "h2", defFont: "Cormorant Garamond", defSize: 22, defColor: "" },
  { key: "h1", label: "Heading 1", tag: "h1", defFont: "Cormorant Garamond", defSize: 32, defColor: "" },
  { key: "h2", label: "Heading 2", tag: "h2", defFont: "Cormorant Garamond", defSize: 26, defColor: "" },
  { key: "h3", label: "Heading 3", tag: "h3", defFont: "Cormorant Garamond", defSize: 21, defColor: "" },
  { key: "h4", label: "Heading 4", tag: "h4", defFont: "Cormorant Garamond", defSize: 19, defColor: "" },
  { key: "h5", label: "Heading 5", tag: "h5", defFont: "Cormorant Garamond", defSize: 17, defColor: "" },
  { key: "h6", label: "Heading 6", tag: "h6", defFont: "Cormorant Garamond", defSize: 15, defColor: "" },
  { key: "h7", label: "Heading 7", tag: "div", defFont: "Cormorant Garamond", defSize: 13, defColor: "" },
  { key: "body", label: "Normal Text", tag: "p", defFont: "Crimson Pro", defSize: 15, defColor: "" },
  { key: "caption", label: "Caption", tag: "p", defFont: "Crimson Pro", defSize: 12, defColor: "" },
];
function defaultTypography() {
  const t = {};
  TYPO_STYLES.forEach(s => { t[s.key] = { font: s.defFont, size: s.defSize, color: s.defColor }; });
  return t;
}
/* bumped whenever the shipped design defaults change; a saved settings
   blob from an older design gets its *untouched* font fields migrated
   forward (see ready()), so the revamp actually shows up instead of the
   previous defaults being restored over it */
const DESIGN_VERSION = 2;
function defaultSettings() {
  return { accent: "", bg: "", fontSize: 15, uiFont: "Crimson Pro", readFont: "Cormorant Garamond",
    typography: defaultTypography(), designVersion: DESIGN_VERSION };
}

/* ---------- shared caches (read synchronously by app.js) ---------- */
const Extra = {
  hidden: new Set(),      // soft-deleted source-entry ids
  cats: [],               // custom sections [{id,name}]
  excludedNames: new Set(), // names removed from the Name Index / cross-linking
  settings: defaultSettings(),
  async ready() {
    await S().ready;
    const h = await S().all("hidden"); this.hidden = new Set(h.map(x => x.id));
    this.cats = (await S().all("cats")).sort((a, b) => (a.created || 0) - (b.created || 0));
    const x = await S().all("excludedNames"); this.excludedNames = new Set(x.map(r => r.id));
    const saved = localStorage.getItem("codex.settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.settings = Object.assign(defaultSettings(), parsed);
        // A blob saved before the revamp carries the OLD font defaults, which
        // would be re-applied over the new design. Migrate any font field the
        // user never deliberately changed (i.e. still equal to a previous
        // default) up to the current one; anything genuinely customised is
        // left alone.
        if ((parsed.designVersion || 1) < DESIGN_VERSION) {
          const stale = { uiFont: ["Inter"], readFont: ["Fraunces"] };
          Object.keys(stale).forEach(k => {
            if (stale[k].includes(parsed[k])) this.settings[k] = defaultSettings()[k];
          });
          const defTypo = defaultTypography();
          const oldTypoFonts = ["Fraunces", "Inter"];
          Object.keys(defTypo).forEach(key => {
            const cur = this.settings.typography && this.settings.typography[key];
            if (cur && oldTypoFonts.includes(cur.font)) this.settings.typography[key] = defTypo[key];
          });
          this.settings.designVersion = DESIGN_VERSION;
          localStorage.setItem("codex.settings", JSON.stringify(this.settings));
        }
      } catch (e) {}
    }
    applySettings(this.settings);
  },
  async hide(ids) { for (const id of ids) { this.hidden.add(id); await S().put("hidden", { id }); } logFeed("Deleted", ids.length + " item" + (ids.length === 1 ? "" : "s")); },
  async unhide(id) { this.hidden.delete(id); await S().del("hidden", id); },
  async unhideAll() { for (const id of Array.from(this.hidden)) await S().del("hidden", id); this.hidden.clear(); },
  async addCat(name) { const c = { id: uid("cat"), name: name.trim(), created: Date.now() }; await S().put("cats", c); this.cats.push(c); return c; },
  async delCat(id) { await S().del("cats", id); this.cats = this.cats.filter(c => c.id !== id); },
  async excludeNames(names) { for (const n of names) { this.excludedNames.add(n); await S().put("excludedNames", { id: n }); } logFeed("Removed from Name Index", names.length + " name" + (names.length === 1 ? "" : "s")); },
  async unexcludeName(n) { this.excludedNames.delete(n); await S().del("excludedNames", n); },
  async unexcludeAllNames() { for (const n of Array.from(this.excludedNames)) await S().del("excludedNames", n); this.excludedNames.clear(); },
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
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}
function mix(hex, withHex, amt) {
  const a = hexToRgb(hex), b = hexToRgb(withHex); if (!a || !b) return hex;
  const c = k => Math.round(a[k] + (b[k] - a[k]) * amt);
  return `rgb(${c("r")},${c("g")},${c("b")})`;
}
function luminance(hex) {
  const c = hexToRgb(hex); if (!c) return 1;
  const ch = [c.r, c.g, c.b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function applySettings(s) {
  const root = document.documentElement.style;
  if (s.accent) {
    root.setProperty("--accent", s.accent);
    root.setProperty("--accent-ink", mix(s.accent, "#000000", 0.28));
    root.setProperty("--accent-soft", mix(s.accent, "#ffffff", 0.82));
  } else {
    root.removeProperty("--accent"); root.removeProperty("--accent-ink"); root.removeProperty("--accent-soft");
  }
  if (s.bg) {
    const dark = luminance(s.bg) < 0.5;
    const ink = dark ? "#f0ece0" : "#2c2a26";
    root.setProperty("--bg", s.bg);
    root.setProperty("--bg-raised", mix(s.bg, "#ffffff", dark ? 0.10 : 0.6));
    root.setProperty("--bg-sunken", mix(s.bg, "#000000", dark ? 0.2 : 0.05));
    root.setProperty("--ink", ink);
    root.setProperty("--ink-soft", dark ? "#c9c2b0" : "#6a655c");
    root.setProperty("--ink-faint", dark ? "#8c8574" : "#9c968a");
    root.setProperty("--line", mix(s.bg, ink, dark ? 0.2 : 0.12));
    root.setProperty("--line-strong", mix(s.bg, ink, dark ? 0.32 : 0.22));
  } else {
    ["--bg", "--bg-raised", "--bg-sunken", "--ink", "--ink-soft", "--ink-faint", "--line", "--line-strong"].forEach(p => root.removeProperty(p));
  }
  root.setProperty("--sans", fontStack(s.uiFont || "Inter"));
  root.setProperty("--serif", fontStack(s.readFont || "Fraunces"));
  document.body && (document.body.style.fontSize = (s.fontSize || 15) + "px");
  applyTypography(s.typography || defaultTypography());
}

/* inject one <style> block covering every Title/Heading/Caption style, so
   the same look applies both in the document editor and in the rendered
   reading view — this is what makes "pick Georgia for Heading 1 in Settings"
   actually show up when you type a Heading 1 in a document. */
function applyTypography(typo) {
  let styleEl = document.getElementById("typographyStyle");
  if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "typographyStyle"; document.head.appendChild(styleEl); }
  // !important: these are explicit per-style overrides from Settings, and
  // need to beat existing tag-based rules like ".doc-editor h1{font-size:...}"
  // which otherwise out-specificity a plain ".ty-h1" class selector
  const css = TYPO_STYLES.map(s => {
    const t = typo[s.key] || {};
    const font = fontStack(t.font || s.defFont);
    const size = (t.size || s.defSize) + "px";
    const color = t.color ? `color:${t.color} !important;` : "";
    return `.ty-${s.key}{font-family:${font} !important;font-size:${size} !important;${color}}`;
  }).join("\n");
  styleEl.textContent = css;
}
function saveSettings() { localStorage.setItem("codex.settings", JSON.stringify(Extra.settings)); applySettings(Extra.settings); }

function viewSettings() {
  const s = Extra.settings;
  const swatches = ["#7c5cff", "#c2603f", "#d0699a", "#3f8f6b", "#b8893b", "#3f6f8f", "#9a6bd0", "#d98b2b", "#2f9e8f", "#e0577d"];
  const bgSwatches = ["#f6f3ec", "#17151a", "#fbe9ee", "#eaf3ec", "#eef1fb", "#fff6e0", "#f1e6f7", "#2a2438"];
  const hiddenCount = Extra.hidden.size;
  const excludedCount = Extra.excludedNames.size;
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
      <h3>Background colour</h3>
      <p class="faint" style="margin:2px 0 12px">Not feeling black-and-white or the usual light/dark? Pick any background —
        text colour adjusts automatically to stay readable on it.</p>
      <div class="swatch-row">
        ${bgSwatches.map(c => `<button class="swatch" style="background:${c}" data-bg="${c}" title="${c}"></button>`).join("")}
        <label class="swatch wheel" title="Custom colour"><input type="color" id="bgPicker" value="${s.bg || "#f6f3ec"}"></label>
        <button class="btn ghost sm" id="bgReset">Reset to theme default</button>
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
        <select id="uiFont">${FONT_LIST.map(f => `<option ${f === s.uiFont ? "selected" : ""}>${f}</option>`).join("")}</select>
      </div>
      <div class="set-row">
        <label>Reading / heading font (default)</label>
        <select id="readFont">${FONT_LIST.map(f => `<option ${f === s.readFont ? "selected" : ""}>${f}</option>`).join("")}</select>
      </div>
    </section>

    <section class="set-block">
      <h3>Typography — every text style</h3>
      <p class="faint" style="margin:2px 0 12px">Font, size, and colour for each style, independently — mix and match
        (Georgia for Heading 1, Lora for body, whatever you want). These are exactly the styles you can pick when
        writing in a Document — write a Heading 1 there and it looks like this.</p>
      <div class="typo-table">
        <div class="typo-head"><span>Style</span><span>Font</span><span>Size</span><span>Colour</span><span>Preview</span></div>
        ${TYPO_STYLES.map(st => {
          const t = (s.typography && s.typography[st.key]) || { font: st.defFont, size: st.defSize, color: "" };
          return `<div class="typo-row" data-key="${st.key}">
            <span class="typo-label">${esc(st.label)}</span>
            <select class="typo-font" data-key="${st.key}">${FONT_LIST.map(f => `<option ${f === t.font ? "selected" : ""}>${f}</option>`).join("")}</select>
            <input class="typo-size" type="number" min="9" max="72" step="0.5" data-key="${st.key}" value="${t.size}">
            <input class="typo-color" type="color" data-key="${st.key}" value="${t.color || "#2c2a26"}">
            <span class="typo-preview ty-${st.key}" id="typoPreview-${st.key}" style="${t.color ? "color:" + esc(t.color) : ""}">${esc(st.label)}</span>
          </div>`;
        }).join("")}
      </div>
      <button class="btn ghost sm" id="typoReset" style="margin-top:12px">Reset typography to defaults</button>
    </section>

    <section class="set-block">
      <h3>Deleted entries</h3>
      <p class="faint" style="margin:2px 0 10px">Anything you batch-delete from a collection is hidden, not destroyed — restore it here.</p>
      ${hiddenCount ? `<button class="btn ghost sm" id="restoreAll">Restore all ${hiddenCount} hidden ${hiddenCount === 1 ? "entry" : "entries"}</button>
        <div class="hidden-list" id="hiddenList"></div>` : `<p class="faint">Nothing deleted.</p>`}
    </section>

    <section class="set-block">
      <h3>Removed from Name Index</h3>
      <p class="faint" style="margin:2px 0 10px">Names you've removed from the Name Index stop being cross-linked in your text, but nothing about them is deleted — restore any of them here.</p>
      ${excludedCount ? `<button class="btn ghost sm" id="restoreNamesAll">Restore all ${excludedCount} name${excludedCount === 1 ? "" : "s"}</button>
        <div class="recog" style="margin-top:10px">${Array.from(Extra.excludedNames).map(n => `<span class="chip" data-restorename="${esc(n)}" style="cursor:pointer">${esc(n)} ✕</span>`).join("")}</div>`
        : `<p class="faint">Nothing removed.</p>`}
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
  $$(".swatch[data-bg]").forEach(b => b.onclick = () => { Extra.settings.bg = b.dataset.bg; $("#bgPicker").value = b.dataset.bg; saveSettings(); });
  $("#bgPicker").oninput = e => { Extra.settings.bg = e.target.value; saveSettings(); };
  $("#bgReset").onclick = () => { Extra.settings.bg = ""; saveSettings(); toast("Background reset to theme default"); };
  $("#fontSize").oninput = e => { Extra.settings.fontSize = +e.target.value; $("#fsVal").textContent = e.target.value + "px"; saveSettings(); };
  $("#uiFont").onchange = e => { Extra.settings.uiFont = e.target.value; saveSettings(); };
  $("#readFont").onchange = e => { Extra.settings.readFont = e.target.value; saveSettings(); };
  $("#saveAiInstr") && ($("#saveAiInstr").onclick = () => { Extra.settings.aiInstr = $("#aiInstr").value; saveSettings(); toast("Saved"); });

  if (!s.typography) s.typography = defaultTypography();
  const touchTypo = key => {
    const row = $(`.typo-row[data-key="${key}"]`);
    const font = row.querySelector(".typo-font").value;
    const size = +row.querySelector(".typo-size").value;
    const color = row.querySelector(".typo-color").value;
    s.typography[key] = { font, size, color };
    const preview = document.getElementById("typoPreview-" + key);
    if (preview) { preview.style.fontFamily = fontStack(font); preview.style.fontSize = size + "px"; preview.style.color = color; }
    saveSettings();
  };
  $$(".typo-font").forEach(el => el.onchange = () => touchTypo(el.dataset.key));
  $$(".typo-size").forEach(el => el.oninput = () => touchTypo(el.dataset.key));
  $$(".typo-color").forEach(el => el.oninput = () => touchTypo(el.dataset.key));
  $("#typoReset").onclick = () => { s.typography = defaultTypography(); saveSettings(); viewSettings(); };

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
  if (excludedCount) {
    $("#restoreNamesAll").onclick = async () => { await Extra.unexcludeAllNames(); window.Codex && Codex.refresh && Codex.refresh(); toast("Restored"); viewSettings(); };
    $$("[data-restorename]").forEach(el => el.onclick = async () => { await Extra.unexcludeName(el.dataset.restorename); window.Codex && Codex.refresh && Codex.refresh(); viewSettings(); });
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
   A small fixed mini-player appears whenever something is being
   read, with Pause/Resume and Stop — and reading always stops the
   moment you navigate to a different page, so it never keeps
   talking about a section you've left.
   ============================================================ */
const Speech = {
  reading: false,
  paused: false,
  read(text) {
    if (!("speechSynthesis" in window)) { toast("Speech not supported here"); return; }
    speechSynthesis.cancel();
    if (!text || !text.trim()) { toast("Nothing to read — select some text first, or open an entry."); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onend = () => { Speech.reading = false; Speech.paused = false; hidePlayer(); };
    u.onerror = () => { Speech.reading = false; Speech.paused = false; hidePlayer(); };
    Speech.reading = true; Speech.paused = false;
    speechSynthesis.speak(u);
    showPlayer();
  },
  readSelection() {
    const sel = (window.getSelection && String(window.getSelection())) || "";
    this.read(sel);
  },
  pause() { if ("speechSynthesis" in window && this.reading) { speechSynthesis.pause(); this.paused = true; updatePlayer(); } },
  resume() { if ("speechSynthesis" in window && this.reading) { speechSynthesis.resume(); this.paused = false; updatePlayer(); } },
  toggle() { this.paused ? this.resume() : this.pause(); },
  stop() { if ("speechSynthesis" in window) speechSynthesis.cancel(); this.reading = false; this.paused = false; hidePlayer(); },
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

/* ---------- floating mini-player ---------- */
function showPlayer() {
  let el = document.getElementById("speechPlayer");
  if (!el) {
    el = document.createElement("div");
    el.id = "speechPlayer";
    el.className = "speech-player";
    el.innerHTML = `<button id="speechToggle" title="Pause / resume"></button>
      <span class="speech-label">Reading aloud…</span>
      <button id="speechStop" title="Stop">Stop</button>`;
    document.body.appendChild(el);
    document.getElementById("speechToggle").onclick = () => Speech.toggle();
    document.getElementById("speechStop").onclick = () => Speech.stop();
  }
  el.hidden = false;
  updatePlayer();
}
function updatePlayer() {
  const el = document.getElementById("speechPlayer"); if (!el) return;
  const btn = document.getElementById("speechToggle");
  const label = el.querySelector(".speech-label");
  if (btn) btn.textContent = Speech.paused ? "▶" : "❚❚";
  if (label) label.textContent = Speech.paused ? "Paused" : "Reading aloud…";
}
function hidePlayer() { const el = document.getElementById("speechPlayer"); if (el) el.hidden = true; }

/* stop reading the instant you navigate away — nothing should keep
   talking about a page you've already left */
window.addEventListener("hashchange", () => { if (Speech.reading) Speech.stop(); });

/* global read-aloud button (reads current selection) */
function readSelectionGlobal() { Speech.readSelection(); }
window.CodexReadAloud = readSelectionGlobal;

window.CodexUI = { viewSettings, viewTasks, viewFeed };
window.CodexTypo = { STYLES: TYPO_STYLES, FONT_LIST, fontStack };
})();
