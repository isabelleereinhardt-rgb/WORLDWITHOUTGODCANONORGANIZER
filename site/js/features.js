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
window.CodexSettings = { save: () => saveSettings() };

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

/* ============================================================
   SETTINGS — one screen, nine panels.
   Every panel edits something real and saves to this device only.
   ============================================================ */
const SET_TABS = [
  ["appearance", "Appearance", "✦"],
  ["avatar", "Your avatar", "✧"],
  ["typography", "Typography", "✧"],
  ["sound", "Sound & atmosphere", "✦"],
  ["lucky", "Lucky", "✧"],
  ["assistant", "Assistant", "❖"],
  ["sections", "Sections", "✧"],
  ["restore", "Restore", "✦"],
  ["backup", "Workspaces & backup", "❖"],
];
let setTab = "appearance";

function viewSettings(tab) {
  if (tab) setTab = tab;
  if (!SET_TABS.some(t => t[0] === setTab)) setTab = "appearance";
  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Settings</div>
    <h1 class="display">Settings</h1>
    <p class="muted">Make it yours; changes apply instantly and are remembered on this device.</p>
    <div class="set-shell">
      <nav class="set-nav">
        ${SET_TABS.map(([id, label, glyph]) => `
          <button class="set-tab${setTab === id ? " on" : ""}" data-settab="${id}">
            <span class="st-glyph">${glyph}</span>${esc(label)}</button>`).join("")}
        <div class="set-note">
          <div class="k">Saved on this device</div>
          <div>Nothing here is uploaded. A backup is the only copy that leaves this machine.</div>
        </div>
      </nav>
      <div class="set-panel" id="setPanel"></div>
    </div>
  </div>`;
  $$("[data-settab]").forEach(b => b.onclick = () => viewSettings(b.dataset.settab));
  renderSetPanel();
}

function renderSetPanel() {
  const el = $("#setPanel");
  ({
    appearance: panelAppearance, avatar: panelAvatar, typography: panelTypography,
    sound: panelSound, lucky: panelLucky, assistant: panelAssistant,
    sections: panelSections, restore: panelRestore, backup: panelBackup,
  })[setTab](el);
}

/* ---------- Appearance ---------- */
function panelAppearance(el) {
  const s = Extra.settings;
  const accents = ["#f6ccd5", "#d4869c", "#b06a8f", "#c9a15c", "#8e7cc3", "#7c9a76", "#c2603f", "#3f6f8f"];
  const bgs = ["#241b1e", "#f7f0ea", "#fbe9ee", "#221d2e", "#efe3d2", "#1b1a1d", "#17151a", "#f6f3ec"];
  el.innerHTML = `
    <div class="rule-head"><span class="k">Accent colour</span><span class="hr"></span></div>
    <p class="faint set-help">The whole site follows it; links, active nav, buttons.</p>
    <div class="swatch-row">
      ${accents.map(c => `<button class="swatch" style="background:${c}" data-accent="${c}" title="${c}"></button>`).join("")}
      <label class="swatch wheel" title="Any colour"><input type="color" id="accentPicker" value="${s.accent || "#f6ccd5"}"></label>
      <button class="btn ghost sm" id="accentReset">Reset</button>
    </div>

    <div class="rule-head mt"><span class="k">Background colour</span><span class="hr"></span></div>
    <p class="faint set-help">Any colour you like; text contrast adjusts to stay readable.</p>
    <div class="swatch-row">
      ${bgs.map(c => `<button class="swatch" style="background:${c}" data-bg="${c}" title="${c}"></button>`).join("")}
      <label class="swatch wheel" title="Any colour"><input type="color" id="bgPicker" value="${s.bg || "#241b1e"}"></label>
      <button class="btn ghost sm" id="bgReset">Theme default</button>
    </div>

    <div class="rule-head mt"><span class="k">Text</span><span class="hr"></span></div>
    <div class="set-row"><label>Base font size <b id="fsVal">${s.fontSize}px</b>
      <em>Everything scales from here.</em></label>
      <input type="range" id="fontSize" min="13" max="20" step="1" value="${s.fontSize}"></div>
    <div class="set-row"><label>Interface font<em>${FONT_LIST.length} in the library.</em></label>
      <select id="uiFont">${FONT_LIST.map(f => `<option ${f === s.uiFont ? "selected" : ""}>${f}</option>`).join("")}</select></div>
    <div class="set-row"><label>Reading / heading font<em>The default for headings and reading text.</em></label>
      <select id="readFont">${FONT_LIST.map(f => `<option ${f === s.readFont ? "selected" : ""}>${f}</option>`).join("")}</select></div>`;

  $$(".swatch[data-accent]", el).forEach(b => b.onclick = () => { Extra.settings.accent = b.dataset.accent; $("#accentPicker").value = b.dataset.accent; saveSettings(); });
  $("#accentPicker", el).oninput = e => { Extra.settings.accent = e.target.value; saveSettings(); };
  $("#accentReset", el).onclick = () => { Extra.settings.accent = ""; saveSettings(); toast("Accent reset"); };
  $$(".swatch[data-bg]", el).forEach(b => b.onclick = () => { Extra.settings.bg = b.dataset.bg; $("#bgPicker").value = b.dataset.bg; saveSettings(); });
  $("#bgPicker", el).oninput = e => { Extra.settings.bg = e.target.value; saveSettings(); };
  $("#bgReset", el).onclick = () => { Extra.settings.bg = ""; saveSettings(); toast("Background reset to theme default"); };
  $("#fontSize", el).oninput = e => { Extra.settings.fontSize = +e.target.value; $("#fsVal").textContent = e.target.value + "px"; saveSettings(); };
  $("#uiFont", el).onchange = e => { Extra.settings.uiFont = e.target.value; saveSettings(); };
  $("#readFont", el).onchange = e => { Extra.settings.readFont = e.target.value; saveSettings(); };
}

/* ---------- Your avatar ---------- */
function panelAvatar(el) {
  if (!window.CodexAvatarBuilder) { el.innerHTML = `<p class="faint">The avatar builder didn't load.</p>`; return; }
  el.innerHTML = `<div class="rule-head"><span class="k">Your avatar</span><span class="hr"></span></div>
    <p class="faint set-help">Drawn here, not downloaded. It greets you on the Desk.</p>
    <div id="avBuilderRoot"></div>`;
  CodexAvatarBuilder.view($("#avBuilderRoot", el));
}

/* ---------- Typography ---------- */
function panelTypography(el) {
  const s = Extra.settings;
  if (!s.typography) s.typography = defaultTypography();
  el.innerHTML = `
    <div class="rule-head"><span class="k">Every text style</span><span class="hr"></span></div>
    <p class="faint set-help">Font, size and colour for each style, independently. These are the same styles you pick
      while writing a document, so a Heading 1 there looks exactly like this.</p>
    <div class="typo-table">
      <div class="typo-head"><span>Style</span><span>Font</span><span>Size</span><span>Colour</span><span>Preview</span></div>
      ${TYPO_STYLES.map(st => {
        const t = (s.typography && s.typography[st.key]) || { font: st.defFont, size: st.defSize, color: "" };
        return `<div class="typo-row" data-key="${st.key}">
          <span class="typo-label">${esc(st.label)}</span>
          <select class="typo-font" data-key="${st.key}">${FONT_LIST.map(f => `<option ${f === t.font ? "selected" : ""}>${f}</option>`).join("")}</select>
          <input class="typo-size" type="number" min="9" max="72" step="0.5" data-key="${st.key}" value="${t.size}">
          <input class="typo-color" type="color" data-key="${st.key}" value="${t.color || "#f4e8e7"}">
          <span class="typo-preview ty-${st.key}" id="typoPreview-${st.key}" style="${t.color ? "color:" + esc(t.color) : ""}">${esc(st.label)}</span>
        </div>`;
      }).join("")}
    </div>
    <button class="btn ghost sm" id="typoReset" style="margin-top:14px">Reset typography to defaults</button>`;

  const touchTypo = key => {
    const row = $(`.typo-row[data-key="${key}"]`, el);
    const font = row.querySelector(".typo-font").value;
    const size = +row.querySelector(".typo-size").value;
    const color = row.querySelector(".typo-color").value;
    s.typography[key] = { font, size, color };
    const preview = document.getElementById("typoPreview-" + key);
    if (preview) { preview.style.fontFamily = fontStack(font); preview.style.fontSize = size + "px"; preview.style.color = color; }
    saveSettings();
  };
  $$(".typo-font", el).forEach(x => x.onchange = () => touchTypo(x.dataset.key));
  $$(".typo-size", el).forEach(x => x.oninput = () => touchTypo(x.dataset.key));
  $$(".typo-color", el).forEach(x => x.oninput = () => touchTypo(x.dataset.key));
  $("#typoReset", el).onclick = () => { s.typography = defaultTypography(); saveSettings(); renderSetPanel(); };
}

/* ---------- Sound & atmosphere ---------- */
function panelSound(el) {
  if (!window.CodexSound) { el.innerHTML = `<p class="faint">The sound engine didn't load.</p>`; return; }
  const L = window.CodexLucky;
  const amb = L.pref("ambience"), vol = L.pref("volume");
  const sfx = Object.assign({ click: false, page: false, bell: true, chime: false }, Extra.settings.sfx || {});
  el.innerHTML = `
    <div class="rule-head"><span class="k">Sound &amp; atmosphere</span><span class="hr"></span></div>
    <p class="faint set-help">All of it is generated here on your machine, nothing is downloaded, and everything is
      off until you switch it on. Browsers only allow sound after you click, so the first sound you hear will be one you asked for.</p>

    <div class="rule-head mt"><span class="k">Ambience while you write</span><span class="hr"></span></div>
    <div class="amb-grid">
      ${CodexSound.AMBIENCES.map(([id, name, note, glyph]) => `
        <button class="amb-card${amb === id ? " on" : ""}" data-setamb="${id}">
          <span class="ac-glyph">${glyph}</span>
          <span><span class="ac-name">${esc(name)}</span><span class="ac-note">${esc(note)}</span></span>
        </button>`).join("")}
    </div>
    <p class="faint set-help">Ambience starts automatically when a sprint begins and stops when it ends.</p>

    <div class="rule-head mt"><span class="k">Interface sounds</span><span class="hr"></span></div>
    ${CodexSound.SFX.map(([key, label, note]) => `
      <div class="sfx-row">
        <span class="sfx-label">${esc(label)}<em>${esc(note)}</em></span>
        <button class="btn ghost sm" data-hear="${key}">Hear it</button>
        <button class="switch${sfx[key] ? " on" : ""}" data-sfx="${key}" role="switch" aria-checked="${!!sfx[key]}"><span></span></button>
      </div>`).join("")}

    <div class="rule-head mt"><span class="k">Volume · <span id="volLab">${vol}%</span></span><span class="hr"></span></div>
    <input type="range" id="volRange" min="0" max="100" value="${vol}" style="width:100%">`;

  $$("[data-setamb]", el).forEach(b => b.onclick = () => {
    CodexSound.ambience(b.dataset.setamb);
    $$("[data-setamb]", el).forEach(x => x.classList.toggle("on", x === b));
  });
  $$("[data-hear]", el).forEach(b => b.onclick = () => {
    const k = b.dataset.hear;
    if (k === "click") CodexSound.click(false);
    else if (k === "page") CodexSound.page();
    else if (k === "bell") CodexSound.bell();
    else CodexSound.click(true);
  });
  $$("[data-sfx]", el).forEach(b => b.onclick = () => {
    const k = b.dataset.sfx;
    sfx[k] = !sfx[k];
    Extra.settings.sfx = sfx;
    saveSettings();
    b.classList.toggle("on", sfx[k]);
    b.setAttribute("aria-checked", String(!!sfx[k]));
  });
  $("#volRange", el).oninput = e => { $("#volLab", el).textContent = e.target.value + "%"; CodexSound.setVolume(+e.target.value); };
}

/* ---------- Lucky ---------- */
function panelLucky(el) {
  const L = window.CodexLucky;
  if (!L) { el.innerHTML = `<p class="faint">Lucky didn't load.</p>`; return; }
  const skin = L.skin(), acc = L.pref("luckyAcc"), pers = L.pref("luckyPersonality");
  el.innerHTML = `
    <div class="rule-head"><span class="k">Lucky: your assistant's cat</span><span class="hr"></span></div>
    <p class="faint set-help">Pick his coat. Five pets earns him a treat.</p>
    <div class="lucky-skins">
      ${L.SKINS.map(([id, name, note]) => `
        <button class="lucky-skin${skin === id ? " on" : ""}" data-lskin="${id}" data-skin="${id}">
          <span class="ls-face">${L.face(30)}</span>
          <span><span class="ls-name">${esc(name)}</span><span class="ls-note">${esc(note)}</span></span>
        </button>`).join("")}
    </div>

    <div class="rule-head mt"><span class="k">His name</span><span class="hr"></span></div>
    <input class="import-title" id="luckyNameInput" value="${esc(L.name())}" style="max-width:260px">
    <p class="faint set-help">He answers to it in the assistant, too.</p>

    <div class="rule-head mt"><span class="k">What he's wearing</span><span class="hr"></span></div>
    <div class="av-chips">${L.ACCESSORIES.map(([id, label]) => `
      <button class="av-chip${acc === id ? " on" : ""}" data-lacc="${id}">${esc(label)}</button>`).join("")}</div>

    <div class="rule-head mt"><span class="k">How he talks</span><span class="hr"></span></div>
    <div class="pers-grid">${Object.keys(L.PERSONAS).map(id => {
      const p = L.PERSONAS[id];
      return `<button class="pers-card${pers === id ? " on" : ""}" data-lpers="${id}">
        <span class="pc-glyph">${p.glyph}</span>
        <span><span class="pc-name">${esc(p.name)}</span><span class="pc-sample">${esc(p.moodLine)}</span></span>
      </button>`;
    }).join("")}</div>

    <div class="rule-head mt"><span class="k">His habits</span><span class="hr"></span></div>
    <div class="sfx-row"><span class="sfx-label">Walk along the bottom of the window<em>Turn it off for a completely still page.</em></span>
      <button class="switch${L.pref("luckyWalks") ? " on" : ""}" data-lhab="luckyWalks" role="switch" aria-checked="${!!L.pref("luckyWalks")}"><span></span></button></div>
    <div class="sfx-row"><span class="sfx-label">Nap on the sprint clock<em>He curls up on the timer while you write.</em></span>
      <button class="switch${L.pref("luckyNaps") ? " on" : ""}" data-lhab="luckyNaps" role="switch" aria-checked="${!!L.pref("luckyNaps")}"><span></span></button></div>`;

  $$("[data-lskin]", el).forEach(b => b.onclick = () => { L.setSkin(b.dataset.lskin); renderSetPanel(); });
  $$("[data-lacc]", el).forEach(b => b.onclick = () => { L.setAcc(b.dataset.lacc); renderSetPanel(); });
  $$("[data-lpers]", el).forEach(b => b.onclick = () => { L.setPersonality(b.dataset.lpers); renderSetPanel(); });
  $$("[data-lhab]", el).forEach(b => b.onclick = () => {
    const k = b.dataset.lhab, next = !L.pref(k);
    if (k === "luckyWalks") L.setWalks(next); else L.setPref(k, next);
    b.classList.toggle("on", next);
    b.setAttribute("aria-checked", String(next));
  });
  const ni = $("#luckyNameInput", el);
  ni.onchange = () => { L.setName(ni.value.trim() || "Lucky"); toast("He answers to " + (ni.value.trim() || "Lucky") + " now"); };
}

/* ---------- Assistant ---------- */
function panelAssistant(el) {
  const s = Extra.settings;
  el.innerHTML = `
    <div class="rule-head"><span class="k">How the assistant works</span><span class="hr"></span></div>
    <p class="faint set-help">Every answer is worked out in this browser from entries you wrote. There is no account,
      no API key and no request to any server, which is why it can only ever tell you what your own canon says —
      and why it cannot invent a fact it has not read.</p>

    <div class="rule-head mt"><span class="k">Standing instructions</span><span class="hr"></span></div>
    <p class="faint set-help">Extra guidance on how it should read and answer. Saved with your work.</p>
    <textarea class="import-body" id="aiInstr" placeholder="e.g. Prefer my own terminology. When I ask who someone is, give a short blurb in my voice, not a raw quote.">${esc(s.aiInstr || "")}</textarea>
    <div style="margin-top:10px"><button class="btn sm" id="saveAiInstr">Save instructions</button></div>`;
  $("#saveAiInstr", el).onclick = () => { Extra.settings.aiInstr = $("#aiInstr", el).value; saveSettings(); toast("Saved"); };
}

/* ---------- Sections ---------- */
function panelSections(el) {
  const cats = Extra.cats;
  el.innerHTML = `
    <div class="rule-head"><span class="k">Your own sections</span><span class="hr"></span></div>
    <p class="faint set-help">Sections you add sit alongside the built-in collections everywhere: the sidebar, the
      filing dropdown on Add lore, and the move menu on any entry.</p>
    <div class="ws-new"><input id="newSectionName" placeholder="New section name…">
      <button class="btn sm" id="addSection">Add</button></div>
    ${cats.length ? `<div class="sect-list">${cats.map(c => `
      <div class="sect-row"><span class="sect-name">${esc(c.name)}</span>
        <button class="btn ghost sm" data-delsect="${esc(c.id)}">Remove</button></div>`).join("")}</div>`
    : `<p class="faint" style="margin-top:14px">No sections of your own yet.</p>`}`;

  const add = async () => {
    const v = $("#newSectionName", el).value.trim();
    if (!v) return;
    await Extra.addCat(v);
    window.Codex && Codex.refresh();
    viewSettings("sections");
  };
  $("#addSection", el).onclick = add;
  $("#newSectionName", el).onkeydown = e => { if (e.key === "Enter") add(); };
  $$("[data-delsect]", el).forEach(b => b.onclick = async () => {
    await Extra.delCat(b.dataset.delsect);
    window.Codex && Codex.refresh();
    viewSettings("sections");
  });
}

/* ---------- Restore ---------- */
function panelRestore(el) {
  const hiddenCount = Extra.hidden.size, excludedCount = Extra.excludedNames.size;
  el.innerHTML = `
    <div class="rule-head"><span class="k">Deleted entries</span><span class="hr"></span></div>
    <p class="faint set-help">Anything you delete from a collection is hidden, not destroyed.</p>
    ${hiddenCount ? `<button class="btn ghost sm" id="restoreAll">Restore all ${hiddenCount} hidden ${hiddenCount === 1 ? "entry" : "entries"}</button>
      <div class="hidden-list" id="hiddenList"></div>` : `<p class="faint">Nothing deleted.</p>`}

    <div class="rule-head mt"><span class="k">Removed from the Name Index</span><span class="hr"></span></div>
    <p class="faint set-help">Removed names stop being cross-linked in your text; nothing about them is deleted.</p>
    ${excludedCount ? `<button class="btn ghost sm" id="restoreNamesAll">Restore all ${excludedCount} name${excludedCount === 1 ? "" : "s"}</button>
      <div class="recog" style="margin-top:10px">${Array.from(Extra.excludedNames).map(n => `<span class="chip" data-restorename="${esc(n)}" style="cursor:pointer">${esc(n)} ✕</span>`).join("")}</div>`
    : `<p class="faint">Nothing removed.</p>`}`;

  if (hiddenCount) {
    const list = $("#hiddenList", el);
    const items = Array.from(Extra.hidden).map(id => (window.Codex && Codex.byId[id])).filter(Boolean).slice(0, 60);
    list.innerHTML = items.map(e => `<div class="hidden-item"><span>${esc(e.title)} <span class="faint">· ${esc(e.category)}</span></span>
      <button class="btn ghost sm" data-restore="${e.id}">Restore</button></div>`).join("");
    $$("[data-restore]", list).forEach(b => b.onclick = async () => { await Extra.unhide(b.dataset.restore); window.Codex && Codex.refresh(); viewSettings("restore"); });
    $("#restoreAll", el).onclick = async () => { await Extra.unhideAll(); window.Codex && Codex.refresh(); toast("Restored"); viewSettings("restore"); };
  }
  if (excludedCount) {
    $("#restoreNamesAll", el).onclick = async () => { await Extra.unexcludeAllNames(); window.Codex && Codex.refresh(); toast("Restored"); viewSettings("restore"); };
    $$("[data-restorename]", el).forEach(x => x.onclick = async () => { await Extra.unexcludeName(x.dataset.restorename); window.Codex && Codex.refresh(); viewSettings("restore"); });
  }
}

/* ---------- Workspaces & backup ---------- */
function panelBackup(el) {
  const W = window.CodexWorkspaces;
  const list = W ? W.list() : [];
  const activeId = W ? W.activeId() : null;
  el.innerHTML = `
    <div class="rule-head"><span class="k">Workspaces</span><span class="hr"></span></div>
    <p class="faint set-help">Each workspace is a separate project with its own documents, notes and canvases.
      The assistant only ever looks at whichever one is active.</p>
    <div class="sect-list">${list.map(w => `
      <div class="sect-row">
        <span class="sect-name">${esc(w.name)}${w.id === activeId ? ` <span class="cur-tag">Current</span>` : ""}</span>
        ${w.id === activeId ? "" : `<button class="btn sm" data-wsgo="${esc(w.id)}">Switch</button>`}
      </div>`).join("")}</div>
    <div class="ws-new"><input id="newWsName" placeholder="New workspace name…">
      <button class="btn sm" id="addWs">Create</button></div>

    <div class="rule-head mt"><span class="k">Back up my work</span><span class="hr"></span></div>
    <p class="faint set-help">A backup is the only copy that leaves this machine. It restores everything —
      entries, documents, canvases, timelines and settings — on any device, by dropping the file onto Add lore.</p>
    <button class="btn" id="doBackup">Download full backup (.json)</button>`;

  $$("[data-wsgo]", el).forEach(b => b.onclick = () => W && W.switchTo(b.dataset.wsgo));
  const create = () => {
    const v = $("#newWsName", el).value.trim();
    if (!v || !W) return;
    W.create(v);
  };
  $("#addWs", el).onclick = create;
  $("#newWsName", el).onkeydown = e => { if (e.key === "Enter") create(); };
  $("#doBackup", el).onclick = () => window.Codex && Codex.backup ? Codex.backup() : document.getElementById("navExport") && document.getElementById("navExport").click();
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
