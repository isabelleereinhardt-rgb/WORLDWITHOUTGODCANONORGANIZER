/* ============================================================
   The Codex — core app
   Router, global search, cross-referencing, reading view,
   galleries, imported notes, summaries, and the canon assistant.
   ============================================================ */
(function () {
"use strict";

const DB = window.WORLD_DB || { entries: [], entities: [], categories: [], stats: {} };
const SRC = "../source/";               // image + pdf base path for the original files
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const imgSrc = (p) => /^(data:|https?:)/.test(p) ? p : SRC + encodeURI(p);

/* ---------- clean line icons (no emoji) ---------- */
const IC = {
  home:   '<path d="M4 10l6-5 6 5"/><path d="M6 9v6h8V9"/>',
  atlas:  '<path d="M4 6l4-2 4 2 4-2v10l-4 2-4-2-4 2z"/><path d="M8 4v10M12 6v10"/>',
  index:  '<path d="M7 6h9M7 10h9M7 14h9"/><circle cx="4" cy="6" r=".9"/><circle cx="4" cy="10" r=".9"/><circle cx="4" cy="14" r=".9"/>',
  doc:    '<path d="M6 3h5l3 3v11H6z"/><path d="M11 3v3.5h3"/><path d="M8 10.5h4M8 13h4"/>',
  slides: '<rect x="3.5" y="4.5" width="13" height="9" rx="1"/><path d="M8 16.2h4M10 13.5v2.7"/>',
  canvas: '<rect x="3.5" y="3.5" width="13" height="13" rx="1.6"/><path d="M3.5 8.5h13M9 8.5V16.5"/>',
  import: '<path d="M10 13V4"/><path d="M6.5 7.5 10 4l3.5 3.5"/><path d="M4 13.5v2.5h12v-2.5"/>',
  backup: '<path d="M10 4v9"/><path d="M6.5 9.5 10 13l3.5-3.5"/><path d="M4 15.5v.5h12v-.5"/>',
  restore:'<path d="M4.5 10a5.5 5.5 0 1 1 1.7 4"/><path d="M4 14.5V11h3.5"/>',
  search: '<circle cx="9" cy="9" r="5"/><path d="M16 16l-3.2-3.2"/>',
  spark:  '<path d="M10 3.2l1.6 4.8 4.8 1.6-4.8 1.6L10 16l-1.6-4.8L3.6 9.6l4.8-1.6z"/>',
  link:   '<path d="M8 12l4-4"/><path d="M11 6.5l1-1a3 3 0 0 1 4.2 4.2l-1.6 1.6"/><path d="M9 13.5l-1 1A3 3 0 0 1 3.8 10.3l1.6-1.6"/>',
  check:  '<rect x="3.5" y="3.5" width="13" height="13" rx="2.5"/><path d="M6.5 10l2.3 2.3L14 7.5"/>',
  feed:   '<path d="M4 4v12h12"/><path d="M7 13l3-4 2.5 2.5L16 7"/>',
  settings:'<circle cx="10" cy="10" r="2.6"/><path d="M10 3.5v2M10 14.5v2M16.5 10h-2M5.5 10h-2M14.8 5.2l-1.4 1.4M6.6 13.4l-1.4 1.4M14.8 14.8l-1.4-1.4M6.6 6.6L5.2 5.2"/>',
  mic:    '<rect x="8" y="3" width="4" height="8" rx="2"/><path d="M5.5 9.5a4.5 4.5 0 0 0 9 0"/><path d="M10 14v3"/>',
  speaker:'<path d="M4 8v4h3l4 3V5L7 8z"/><path d="M13.5 8a3 3 0 0 1 0 4"/>',
  timer:  '<circle cx="10" cy="11" r="6.2"/><path d="M10 7.5V11l3 1.6"/><path d="M8 3h4"/>',
  table:  '<rect x="3.5" y="4" width="13" height="12" rx="1"/><path d="M3.5 8.3h13M3.5 12.6h13M9 4v12"/>',
  mindmap:'<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M8.6 6.2L5.9 13.2M11.4 6.2l2.7 7M6.5 15h7"/>',
  sheet:  '<rect x="3.5" y="3.5" width="13" height="13" rx="1"/><path d="M3.5 8.2h13M3.5 12.8h13M8.5 3.5v13"/>',
  cards:  '<rect x="4" y="6" width="10" height="12" rx="1.4" transform="rotate(-8 9 12)"/><rect x="6" y="4" width="10" height="12" rx="1.4"/>',
  timeline:'<path d="M3.5 10h13"/><circle cx="6" cy="10" r="1.6"/><circle cx="10.5" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/><path d="M6 10V5.5M15 10v4.5"/>',
  draw:   '<path d="M4.5 15.5l1-4L13.5 3.5a1.6 1.6 0 0 1 2.2 2.2L7.7 13.7l-4 1z"/><path d="M11.5 5.5l3 3"/>',
  help:   '<circle cx="10" cy="10" r="6.6"/><path d="M8.2 8a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4"/><path d="M10 13.6h.01"/>',
};
function svg(name) {
  return `<svg class="ic-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ""}</svg>`;
}

/* ---------- category colours (markers are coloured dots, not emoji)
   Muted, dusty hues chosen to sit inside the rose/antique palette — bright
   primaries fight the page and stop reading as a quiet index. ---------- */
const CAT = {
  "Characters":         "#b8788f",
  "Noble Houses":       "#c9a15c",
  "Maps & Locations":   "#6f8f7a",
  "Religion & Faith":   "#c07a5e",
  "Magic System":       "#8189ab",
  "Timeline & History": "#9c7a9e",
  "Culture & Fashion":  "#d19aac",
  "Books & Stories":    "#8d9270",
  "Reference & Lexicon":"#9a8b86",
  "Canon & Continuity": "#7b8b9b",
  "My Notes":           "#7fa093",
};
const catColor = c => CAT[c] || "var(--accent)";
const catDot = c => `<span class="cdot" style="background:${catColor(c)}"></span>`;
const CANON_ORDER = ["Characters", "Noble Houses", "Maps & Locations", "Religion & Faith",
  "Magic System", "Timeline & History", "Culture & Fashion", "Books & Stories",
  "Reference & Lexicon", "Canon & Continuity"];

/* soft-deleted (hidden) entries + custom sections */
function isHidden(e) { return window.CodexExtra && CodexExtra.hidden.has(e.id); }
function visibleEntries() { return DB.entries.filter(e => !isHidden(e)); }
function customCats() { return (window.CodexExtra ? CodexExtra.cats : []).map(c => c.name); }
function categoriesList() {
  const counts = {};
  visibleEntries().forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });
  const list = [];
  CANON_ORDER.forEach(n => { if (counts[n]) list.push({ name: n, count: counts[n] }); });
  list.push({ name: "My Notes", count: counts["My Notes"] || 0 });          // always present
  customCats().forEach(n => { if (n !== "My Notes" && !CANON_ORDER.includes(n)) list.push({ name: n, count: counts[n] || 0, custom: true }); });
  Object.keys(counts).forEach(n => { if (!CANON_ORDER.includes(n) && n !== "My Notes" && !customCats().includes(n)) list.push({ name: n, count: counts[n] }); });
  return list;
}
function refresh() { buildIndexes(); buildNav(); route(); }

/* ---------- indexes (rebuildable, so imported notes fold in) ---------- */
const byId = {};
let entitySet = new Set(), sortedEntities = [], ENT_RE = null;
function buildIndexes() {
  if (typeof rebuildEntries === "function") rebuildEntries();
  Object.keys(byId).forEach(k => delete byId[k]);
  DB.entries.forEach(e => { byId[e.id] = e; e._hay = (e.title + " " + e.text).toLowerCase(); });
  entitySet = new Set(DB.entities);
  sortedEntities = DB.entities.slice().sort((a, b) => b.length - a.length);
  ENT_RE = null;
  if (sortedEntities.length) {
    const pat = sortedEntities.slice(0, 1400).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    try { ENT_RE = new RegExp("\\b(" + pat + ")\\b", "g"); } catch (e) { ENT_RE = null; }
  }
}

/* ---------- state ---------- */
const store = {
  recent: JSON.parse(localStorage.getItem("codex.recent") || "[]"),
  pushRecent(id) {
    this.recent = [id, ...this.recent.filter(x => x !== id)].slice(0, 8);
    localStorage.setItem("codex.recent", JSON.stringify(this.recent));
  }
};

/* ============================================================
   IMPORTED NOTES  (user-added canon, indexed like everything else)
   Entries are rebuilt from ORIG_ENTRIES + notesCache on every
   refresh, minus whatever's in CodexExtra.hidden — this is what
   makes soft-delete/restore work uniformly for canon AND notes,
   and what keeps "My Notes" always present even at zero items.
   ============================================================ */
const ORIG_ENTRIES = DB.entries.slice();
const ORIG_ENTITIES = DB.entities.slice();
let notesCache = [];

async function loadNotes() {
  if (!window.CodexStore) return;
  await CodexStore.ready;
  notesCache = (await CodexStore.all("notes")).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
function noteToEntry(n) {
  const text = n.text || "";
  return {
    id: n.id, title: n.title || "Untitled note", text,
    summary: text.replace(/\s+/g, " ").slice(0, 180),
    category: n.category || "My Notes", type: "note",
    wordcount: text.split(/\s+/).filter(Boolean).length,
    images: n.images || [], links: n.links || [], source: null, _user: true,
  };
}
function rebuildEntries() {
  const hidden = window.CodexExtra ? CodexExtra.hidden : new Set();
  // only the workspace(s) flagged hasCanon=true ship with the pre-extracted
  // World Without God source material; every other workspace starts blank
  // and only ever contains what you've written into it yourself
  const hasCanon = !window.CodexWorkspaces || CodexWorkspaces.activeHasCanon();
  const base = hasCanon ? ORIG_ENTRIES : [];
  const baseEntities = hasCanon ? ORIG_ENTITIES : [];
  const noteEntries = notesCache.map(noteToEntry);
  DB.entries = base.filter(e => !hidden.has(e.id)).concat(noteEntries.filter(e => !hidden.has(e.id)));
  DB.entities = baseEntities.slice();
  noteEntries.forEach(e => { if (e.title && !DB.entities.includes(e.title)) DB.entities.push(e.title); });
  const excludedNames = window.CodexExtra ? CodexExtra.excludedNames : new Set();
  if (excludedNames.size) DB.entities = DB.entities.filter(n => !excludedNames.has(n));
  DB.stats.entries = DB.entries.length;
  DB.stats.entities = DB.entities.length;
  DB.stats.images = hasCanon ? (window.WORLD_DB && window.WORLD_DB.stats && window.WORLD_DB.stats.images) || 0 : 0;
}
async function addNote(title, text, images, category) {
  const note = {
    id: "note-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    title: title || "Untitled note", text: text || "", images: images || [], category: category || "My Notes",
  };
  await CodexStore.put("notes", note);
  notesCache.unshift(note);
  refresh();
  window.CodexFeed && CodexFeed.log("Added note", note.title);
  return note;
}
async function updateNote(id, patch) {
  const note = notesCache.find(n => n.id === id); if (!note) return;
  Object.assign(note, patch);
  await CodexStore.put("notes", note);
  refresh();
}
async function deleteNote(id) {
  await CodexStore.del("notes", id);
  notesCache = notesCache.filter(n => n.id !== id);
  refresh();
}

/* ============================================================
   SIDEBAR
   ============================================================ */
function buildNav() {
  const nav = $("#nav");
  const cats = categoriesList().map(c =>
    `<div class="nav-item" data-route="#/browse/${encodeURIComponent(c.name)}">
       <span class="dot" style="background:${catColor(c.name)}"></span>
       <span>${esc(c.name)}</span><span class="count">${c.count}</span>
     </div>`).join("");
  // Projects = the folders feature; Pinned = recently-opened entries
  const folders = (window.CodexFolders && CodexFolders._cache) || [];
  const projects = folders.map(f => {
    const n = DB.entries.filter(e => e.folder === f.id).length;
    return `<div class="nav-item" data-route="#/docs/${f.id}">
       <span class="dot" style="background:var(--blush2)"></span>
       <span>${esc(f.name)}</span><span class="count">${n || ""}</span></div>`;
  }).join("") || `<div class="nav-item mini faint" style="cursor:default">No projects yet</div>`;
  const pinned = store.recent.map(id => byId[id]).filter(Boolean).slice(0, 5).map(e =>
    `<div class="nav-item mini" data-route="#/entry/${e.id}">
       <span style="width:13px;text-align:center;font-size:9px;color:var(--gold)">✧</span>
       <span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(e.title)}</span>
     </div>`).join("") || `<div class="nav-item mini faint" style="cursor:default">Nothing opened yet</div>`;

  const wsName = window.CodexWorkspaces ? CodexWorkspaces.current().name : "Workspace";
  const wsMeta = `${DB.entries.length} entries · ${DB.entities.length} names`;

  nav.innerHTML = `
    <div class="ws-card">
      <div class="legend">Workspace</div>
      <div class="name">${esc(wsName)}</div>
      <div class="meta">${esc(wsMeta)}</div>
    </div>
    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">The Canon</div>
        <button class="nav-plus" id="navAddCat" title="Add a section">+</button></div>
      ${cats}
    </div>
    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">Workroom</div></div>
      <div class="nav-item" data-route="#/">${svg("home")}<span>The Desk</span></div>
      <div class="nav-item" data-route="#/docs">${svg("doc")}<span>Documents</span></div>
      <div class="nav-item" data-route="#/slides">${svg("slides")}<span>Slide Decks</span></div>
      <div class="nav-item" data-route="#/canvases">${svg("canvas")}<span>Canvases</span></div>
      <div class="nav-item" data-route="#/mindmaps">${svg("mindmap")}<span>Mind Maps</span></div>
      <div class="nav-item" data-route="#/sheets">${svg("sheet")}<span>Sheets</span></div>
      <div class="nav-item" data-route="#/study">${svg("cards")}<span>Flashcards &amp; Quiz</span></div>
      <div class="nav-item" data-route="#/timeline">${svg("timeline")}<span>Timeline</span></div>
      <div class="nav-item" data-route="#/maps">${svg("atlas")}<span>Atlas</span></div>
      <div class="nav-item" data-route="#/index">${svg("index")}<span>Name Index</span></div>
      <div class="nav-item" data-route="#/tasks">${svg("check")}<span>Tasks</span></div>
      <div class="nav-item" data-route="#/import">${svg("import")}<span>Add Lore</span></div>
      <div class="nav-item" data-route="#/feed">${svg("feed")}<span>Activity</span></div>
      <div class="nav-item" data-route="#/help">${svg("help")}<span>Help</span></div>
    </div>
    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">Projects</div>
        <button class="nav-plus" id="navAddFolder" title="New project">+</button></div>
      ${projects}
    </div>
    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">Pinned</div></div>
      ${pinned}
    </div>
    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">Data</div></div>
      <div class="nav-item" data-route="#/settings">${svg("settings")}<span>Settings</span></div>
      <div class="nav-item mini" id="navExport">${svg("backup")}<span>Back up my work</span></div>
      <div class="nav-item mini" id="navImport">${svg("restore")}<span>Restore backup</span></div>
    </div>
    <div class="nav-section">
      <button class="nav-cta" id="navNewNote">+ New note</button>
      <div class="ornament" style="margin-top:20px">✦✧✦</div>
    </div>`;
  $$("#nav .nav-item[data-route]").forEach(el =>
    el.onclick = () => { location.hash = el.dataset.route; if (innerWidth < 860) collapseSidebar(true); });
  $("#navExport").onclick = backupAll;
  $("#navImport").onclick = restoreAll;
  $("#navAddCat").onclick = async (ev) => {
    ev.stopPropagation();
    const name = prompt("Name this new section (it'll appear under The Canon):");
    if (!name || !name.trim()) return;
    await CodexExtra.addCat(name.trim());
    buildNav();
    toast("Section added — file notes into it from Add Lore");
  };
  $("#navAddFolder").onclick = async (ev) => {
    ev.stopPropagation();
    const name = prompt("Name this project:");
    if (!name || !name.trim()) return;
    await CodexStore.put("folders", { id: "f" + Date.now().toString(36), name: name.trim() });
    if (window.CodexFolders) await CodexFolders.ensureCache(true);
    buildNav();
    toast(`Project “${name.trim()}” created`);
  };
  $("#navNewNote").onclick = async () => {
    const note = await addNote("", "", [], "My Notes");
    location.hash = "#/entry/" + note.id;
  };
  markActive();
}
function markActive() {
  const h = location.hash || "#/";
  if (isNarrow()) collapseSidebar(true);
  $$("#nav .nav-item[data-route]").forEach(el =>
    el.classList.toggle("active", el.dataset.route === h ||
      (el.dataset.route !== "#/" && h.startsWith(el.dataset.route))));
}

/* ============================================================
   TEXT UTILITIES — sentences, summaries, facts, relationships
   ============================================================ */
function sentencesOf(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  const parts = t.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  return (parts && parts.length) ? parts.map(s => s.trim()) : (t ? [t] : []);
}
const DESCRIPTIVE = /\b(is|was|are|were|has|had|known|called|named|god|goddess|king|queen|house|city|kingdom|empire|born|died|ruler|rules?|leads?|founded|worship|magic|spell|the son|the daughter|married)\b/i;

/* pull the best few sentences describing a subject, across the whole canon */
function topicSummary(name, maxSent = 4) {
  const nl = name.toLowerCase();
  const lore = bestEntryFor(name);
  const cands = [];
  const consider = (e, boost) => {
    sentencesOf(e.text).forEach((s, idx) => {
      const sl = s.toLowerCase();
      if (sl.includes(nl) && s.length > 28 && s.length < 340) {
        let score = boost - idx * 0.015;
        if (idx < 3) score += 0.4;
        if (DESCRIPTIVE.test(s)) score += 0.7;
        if (new RegExp("^\\s*" + nl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(s)) score += 0.5;
        cands.push({ s: s.trim(), score });
      }
    });
  };
  if (lore) consider(lore, 3);
  mentionsOf(name, lore ? lore.id : null).slice(0, 6).forEach(e => consider(e, 1));
  cands.sort((a, b) => b.score - a.score);
  const out = [], seen = new Set();
  for (const c of cands) {
    const key = c.s.slice(0, 44).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); out.push(c.s);
    if (out.length >= maxSent) break;
  }
  return out;
}

const FACT_KEYS = /^(Status|Origin|Founded|Founder|Seat|Faction|Spirit Animal|Colors?|Colours?|Wealth|Military|Religion|Theme Song|House Words|Motto|Sigil|Words|Region|Capital|Population|Ruler|Type|Era|Alignment|Party|Allegiance|Rank|Title|Race|Age|Gender|Born|Died|Domain|Symbol|Element)\s*:/i;
function factsOf(entry, limit = 8) {
  const facts = [];
  (entry.text || "").split("\n").forEach(raw => {
    const line = raw.trim();
    if (facts.length >= limit) return;
    if (FACT_KEYS.test(line) && line.length < 120 && line.includes(":")) {
      const i = line.indexOf(":");
      const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
      if (v) facts.push({ k, v });
    }
  });
  return facts;
}

function entitiesIn(text) {
  const found = new Set();
  if (ENT_RE) { ENT_RE.lastIndex = 0; let m, c = 0; while ((m = ENT_RE.exec(text)) && c < 500) { found.add(m[1]); c++; } }
  return found;
}
function relatedNames(name, limit = 10) {
  const nl = name.toLowerCase(); const counts = {};
  mentionsOf(name, null).slice(0, 14).forEach(e => {
    entitiesIn(e.text).forEach(n => { if (n.toLowerCase() !== nl) counts[n] = (counts[n] || 0) + 1; });
  });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, limit);
}

/* a reusable "what your canon says about X" panel */
function summaryBlockHtml(name, opts) {
  opts = opts || {};
  const sents = topicSummary(name, opts.maxSent || 4);
  const lore = bestEntryFor(name);
  const facts = lore ? factsOf(lore, 6) : [];
  const rel = relatedNames(name, opts.relLimit || 8);
  const count = mentionsOf(name, null).length;
  if (!sents.length && !facts.length) {
    return `<div class="summary-card"><div class="sc-label">Summary</div>
      <p class="faint">Nothing in your canon describes “${esc(name)}” yet.</p></div>`;
  }
  return `<div class="summary-card">
    <div class="sc-label">${svg("spark")} Summary${count ? ` · compiled from ${count} ${count === 1 ? "entry" : "entries"}` : ""}</div>
    ${sents.length ? `<p class="sc-text">${sents.map(esc).join(" ")}</p>` : ""}
    ${facts.length ? `<dl class="sc-facts">${facts.map(f => `<dt>${esc(f.k)}</dt><dd>${crossLink(esc(f.v))}</dd>`).join("")}</dl>` : ""}
    ${rel.length ? `<div class="sc-rel"><span class="sc-rel-label">Related</span>
      ${rel.map(n => `<span class="chip" data-subject="${esc(n)}">${esc(n)}</span>`).join("")}</div>` : ""}
  </div>`;
}
function bindSummaryChips(root) {
  $$(".summary-card .chip[data-subject], .summary-card .xref[data-subject]", root || document)
    .forEach(c => c.onclick = () => location.hash = "#/subject/" + encodeURIComponent(c.dataset.subject));
}

/* ============================================================
   READING VIEW
   ============================================================ */
const HEADERS = /^(Quick Facts|Status By Era|Why They Matter|Heraldry|History|Overview|Backstory|Background|Relationships|Notable Members|Members|Appearance|Personality|Abilities|Powers|Culture|Beliefs|Practices|Geography|Economy|Politics|Military|Notes|Summary|Legacy|Family|Lineage|Significance|Description|Keywords|References|Weaknesses|Strengths|Vulnerabilities|Timeline|Origins?|Faith|Worship|Death|Funeral|Fashion|Attire|Locations?)\s*:?\s*$/i;
const FACT_LINE = FACT_KEYS;

function crossLink(html) {
  if (!ENT_RE) return html;
  ENT_RE.lastIndex = 0;
  return html.replace(ENT_RE, m => `<span class="xref" data-subject="${esc(m)}">${m}</span>`);
}

function renderBody(entry) {
  const lines = entry.text.split("\n");
  let out = [], facts = [], para = [], titleSeen = 0;
  const flushPara = () => { if (para.length) { const t = para.join(" ").trim(); if (t) out.push(`<p>${crossLink(esc(t))}</p>`); para = []; } };
  const flushFacts = () => { if (facts.length) { out.push(`<dl class="facts">${facts.join("")}</dl>`); facts = []; } };
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); continue; }
    if (/^\d{1,3}$/.test(line)) continue;
    if (titleSeen < 2 && line.toLowerCase() === entry.title.toLowerCase()) { titleSeen++; continue; }
    if (/^[“"'].{4,}["”']$/.test(line) && out.length < 3) {
      flushPara(); flushFacts();
      out.push(`<div class="motto">${esc(line.replace(/^["“']|["”']$/g, ""))}</div>`); continue;
    }
    if (HEADERS.test(line) && line.length < 40) { flushPara(); flushFacts(); out.push(`<h3>${esc(line.replace(/:\s*$/, ""))}</h3>`); continue; }
    const fm = line.match(FACT_LINE);
    if (fm && line.length < 120) {
      flushPara();
      const idx = line.indexOf(":"); const k = line.slice(0, idx).trim(), v = line.slice(idx + 1).trim();
      facts.push(`<dt>${esc(k)}</dt><dd>${v ? crossLink(esc(v)) : "<span class='faint'>—</span>"}</dd>`); continue;
    }
    flushFacts(); para.push(line);
  }
  flushPara(); flushFacts();
  return out.join("\n");
}

function subjectsOf(entry) {
  const subs = new Set([entry.title]);
  const m = entry.title.match(/^House\s+(.+)/);
  if (m) subs.add(m[1]);
  entry.title.split(/\s+/).forEach(w => { if (entitySet.has(w)) subs.add(w); });
  return Array.from(subs);
}
function mentionsOf(name, excludeId) {
  const n = name.toLowerCase();
  return DB.entries.filter(e => e.id !== excludeId && (e.type === "pdf" || e.type === "note") && e._hay.includes(n));
}

/* ============================================================
   VIEWS
   ============================================================ */
const view = $("#view");

function viewHome() {
  const s = DB.stats;
  const catList = categoriesList();
  const cards = catList.map(c => `
    <a class="cat-card" href="#/browse/${encodeURIComponent(c.name)}">
      <span class="bar" style="background:${catColor(c.name)}"></span>
      <span class="cdot lg" style="background:${catColor(c.name)}"></span>
      <h3>${esc(c.name)}</h3>
      <div class="n">${c.count} ${c.count === 1 ? "entry" : "entries"}</div>
    </a>`).join("");
  view.innerHTML = `
    <div class="hero">
      <div class="page-kicker">Your worldbuilding organizer</div>
      <h1>Everything you've built, calm and findable.</h1>
      <p>One quiet home for every character, house, map, and myth in <em>World Without God</em>.
         Search across it all, follow names wherever they lead, and write new lore right inside it.</p>
      <div class="hero-search">
        <input id="heroSearch" placeholder="Search a name, place, house, or idea…">
        <button class="btn" onclick="location.hash='#/docs'">New document</button>
      </div>
      <div class="stat-row">
        <div><b>${DB.entries.length || 0}</b> entries</div>
        <div><b>${s.entities || 0}</b> cross-linked names</div>
        <div><b>${s.images || 0}</b> images &amp; maps</div>
        <div><b>${catList.length}</b> collections</div>
      </div>
    </div>
    <div class="cat-grid">${cards}</div>`;
  const hs = $("#heroSearch");
  hs.onkeydown = e => { if (e.key === "Enter" && hs.value.trim()) location.hash = "#/search/" + encodeURIComponent(hs.value.trim()); };
  hs.addEventListener("input", () => { if (hs.value.trim().length >= 2) openSearch(hs.value.trim()); });
}

let browseSelectMode = false, browseSelected = new Set();
function viewBrowse(cat) {
  browseSelectMode = false; browseSelected = new Set();
  renderBrowse(cat);
}
function renderBrowse(cat) {
  const items = DB.entries.filter(e => e.category === cat).sort((a, b) => a.title.localeCompare(b.title));
  const isNotesLike = cat === "My Notes" || customCats().includes(cat);
  const cards = items.map(e => entryCardSelectable(e)).join("") ||
    `<div class="empty-state">Nothing here yet.${isNotesLike ? " Add one below, or from Import &amp; Add Lore." : ""}</div>`;
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${catDot(cat)} Collection</div>
    <div class="browse-head">
      <h1>${esc(cat)}</h1>
      <div class="browse-actions">
        ${isNotesLike ? `<button class="btn sm" id="quickAddNote">New note</button>` : ""}
        ${items.length ? `<button class="btn ghost sm" id="toggleSelect">${browseSelectMode ? "Cancel" : "Select"}</button>` : ""}
      </div>
    </div>
    <p class="muted">${items.length} ${items.length === 1 ? "entry" : "entries"}</p>
    ${browseSelectMode ? `<div class="select-bar">
      <label class="sel-all"><input type="checkbox" id="selAll" ${items.length && browseSelected.size === items.length ? "checked" : ""}> Select all</label>
      <span class="faint" id="selCount">${browseSelected.size} selected</span>
      <button class="btn danger sm" id="deleteSelected" ${browseSelected.size ? "" : "disabled"}>Delete selected</button>
    </div>` : ""}
    <div class="list-grid">${cards}</div>
  </div>`;

  if ($("#toggleSelect")) $("#toggleSelect").onclick = () => { browseSelectMode = !browseSelectMode; if (!browseSelectMode) browseSelected.clear(); renderBrowse(cat); };
  if ($("#quickAddNote")) $("#quickAddNote").onclick = async () => {
    const note = await addNote("", "", [], cat === "My Notes" ? "My Notes" : cat);
    location.hash = "#/entry/" + note.id;
  };
  if (browseSelectMode) {
    $("#selAll").onchange = e => { browseSelected = e.target.checked ? new Set(items.map(i => i.id)) : new Set(); renderBrowse(cat); };
    $$(".entry-card.selectable", view).forEach(card => {
      const cb = card.querySelector(".ec-check");
      const toggle = () => {
        if (cb.checked) browseSelected.add(card.dataset.id); else browseSelected.delete(card.dataset.id);
        $("#selCount").textContent = browseSelected.size + " selected";
        $("#deleteSelected").disabled = !browseSelected.size;
        card.classList.toggle("checked", cb.checked);
      };
      cb.onchange = toggle;
      card.onclick = e => { if (e.target === cb) return; cb.checked = !cb.checked; toggle(); };
    });
    $("#deleteSelected").onclick = async () => {
      if (!browseSelected.size) return;
      if (!confirm(`Delete ${browseSelected.size} item${browseSelected.size === 1 ? "" : "s"} from "${cat}"? You can restore them anytime from Settings → Deleted entries.`)) return;
      await CodexExtra.hide(Array.from(browseSelected));
      browseSelected.clear(); browseSelectMode = false;
      refresh();
    };
  }
}
function entryCardSelectable(e) {
  const preview = e.type === "gallery" ? `${e.images.length} images` : esc((e.summary || "").slice(0, 160));
  if (!browseSelectMode) return entryCard(e);
  const checked = browseSelected.has(e.id);
  return `<div class="entry-card selectable ${checked ? "checked" : ""}" data-id="${e.id}">
    <input type="checkbox" class="ec-check" ${checked ? "checked" : ""}>
    <h3>${esc(e.title)}</h3>
    <p>${preview}</p>
    <div class="meta">${catDot(e.category)} ${esc(e.category)}${e.type === "pdf" || e.type === "note" ? " · " + (e.wordcount || 0) + " words" : ""}</div>
  </div>`;
}

function entryCard(e) {
  const preview = e.type === "gallery" ? `${e.images.length} images` : esc((e.summary || "").slice(0, 160));
  return `<a class="entry-card" href="#/entry/${e.id}">
    <h3>${esc(e.title)}</h3>
    <p>${preview}</p>
    <div class="meta">${catDot(e.category)} ${esc(e.category)}${e.type === "pdf" || e.type === "note" ? " · " + (e.wordcount || 0) + " words" : ""}</div>
  </a>`;
}

function viewEntry(id) {
  const e = byId[id];
  if (!e) { view.innerHTML = `<div class="wrap"><p>Entry not found.</p></div>`; return; }
  store.pushRecent(id);
  if (e.type === "gallery") return viewGallery(e);

  const body = renderBody(e);
  const seen = new Set(); let backs = [];
  subjectsOf(e).forEach(sname => mentionsOf(sname, e.id).forEach(m => { if (!seen.has(m.id)) { seen.add(m.id); backs.push(m); } }));
  backs = backs.slice(0, 30);
  const backHtml = backs.length ? `
    <div class="backlinks">
      <h4>Mentioned in ${backs.length} other ${backs.length === 1 ? "entry" : "entries"}</h4>
      ${backs.map(b => `<a href="#/entry/${b.id}">${catDot(b.category)} ${esc(b.title)} <span class="faint">· ${esc(b.category)}</span></a>`).join("")}
    </div>` : "";
  const relImgs = (e.images || []).length ? galleryHtml(e.images) : "";
  const pdfLink = e.source && e.source.endsWith(".pdf")
    ? `<a class="btn ghost sm" href="${imgSrc(e.source)}" target="_blank">Original PDF</a>` : "";
  const fileLink = (e._user && e.fileHref) ? `<a class="btn ghost sm" href="${e.fileHref}" target="_blank">Open original file</a>` : "";
  const linksHtml = (e.links && e.links.length) ? `<div class="note-links">
    <div class="sc-rel-label">Links</div>
    ${e.links.map(l => `<a class="note-link" href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}
  </div>` : "";
  const catSelector = e._user ? `<select class="folder-select" id="entryCatMove" title="Move to a section">
    ${categoriesList().map(c => `<option value="${esc(c.name)}" ${e.category === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
  </select>` : "";

  view.innerHTML = `<div class="wrap">
    <div class="reading">
      <div class="entry-head"><div class="page-kicker" style="margin:0">${catDot(e.category)} ${esc(e.category)}</div>${catSelector}</div>
      <h1>${esc(e.title)}</h1>
      <div class="entry-actions">
        <button class="btn sm" id="askAssistant">${svg("spark")} Ask the assistant about this</button>
        ${pdfLink}${fileLink}
        <button class="btn ghost sm" id="copyText">Copy text</button>
        <button class="btn ghost sm" id="readAloud">${svg("speaker")} Read aloud</button>
        <button class="btn ghost sm" id="delEntry">Delete</button>
      </div>
      ${body}
      ${linksHtml}
      ${relImgs}
      ${backHtml}
    </div>
  </div>`;

  $$(".xref", view).forEach(x => x.onclick = () => location.hash = "#/subject/" + encodeURIComponent(x.dataset.subject));
  bindGallery();
  $("#askAssistant").onclick = () => { openAssistant(); assistantLookup(e.title); };
  $("#copyText").onclick = () => { navigator.clipboard.writeText(e.text); toast("Copied to clipboard"); };
  $("#readAloud").onclick = () => { window.CodexSpeech ? CodexSpeech.read(e.text || e.title) : toast("Speech not supported here"); };
  $("#delEntry").onclick = async () => {
    if (!confirm(`Delete "${e.title}"? You can restore it anytime from Settings → Deleted entries.`)) return;
    if (e._user) await deleteNote(e.id); else { await CodexExtra.hide([e.id]); refresh(); }
    location.hash = "#/browse/" + encodeURIComponent(e.category);
  };
  if ($("#entryCatMove")) $("#entryCatMove").onchange = async ev => { await updateNote(e.id, { category: ev.target.value }); toast("Moved to " + ev.target.value); };
}

/* subject hub — now leads with a synthesized summary */
function viewSubject(name) {
  const hits = mentionsOf(name, null);
  hits.sort((a, b) => {
    const at = a.title.toLowerCase().includes(name.toLowerCase()) ? 0 : 1;
    const bt = b.title.toLowerCase().includes(name.toLowerCase()) ? 0 : 1;
    return at - bt || (b._hay.split(name.toLowerCase()).length - a._hay.split(name.toLowerCase()).length);
  });
  const primary = hits.find(h => h.title.toLowerCase() === name.toLowerCase());
  const cards = hits.map(h => {
    const snip = snippet(h.text, name, 240);
    return `<a class="entry-card" href="#/entry/${h.id}" style="min-height:auto">
      <h3>${esc(h.title)}</h3><p>…${snip}…</p>
      <div class="meta">${catDot(h.category)} ${esc(h.category)}</div>
    </a>`;
  }).join("");
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${svg("link")} Cross-reference</div>
    <h1>${esc(name)}</h1>
    ${summaryBlockHtml(name)}
    <p class="muted">Found in ${hits.length} ${hits.length === 1 ? "entry" : "entries"} across your canon.
      ${primary ? `<a href="#/entry/${primary.id}">Open the main entry →</a>` : ""}</p>
    <div class="list-grid">${cards || `<div class="empty-state">No mentions found.</div>`}</div>
  </div>`;
  bindSummaryChips(view);
}

/* ---------- galleries / atlas ---------- */
function galleryHtml(images) {
  return `<div class="gallery">` + images.map(p =>
    `<figure data-full="${imgSrc(p)}">
       <img loading="lazy" src="${imgSrc(p)}" alt="${esc((p.split('/').pop() || '').slice(0, 60))}">
       <figcaption>${esc(p.split('/').pop() || "image")}</figcaption>
     </figure>`).join("") + `</div>`;
}
function viewGallery(e) {
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${catDot(e.category)} Gallery</div>
    <h1>${esc(e.title)}</h1><p class="muted">${e.images.length} images</p>
    ${galleryHtml(e.images)}
  </div>`;
  bindGallery();
}
let mapsSelectMode = false, mapsSelected = new Set();
function viewMaps() {
  mapsSelectMode = false; mapsSelected = new Set();
  renderMaps();
}
function renderMaps() {
  const galleries = DB.entries.filter(e => e.type === "gallery");
  const mapDocs = DB.entries.filter(e => e.category === "Maps & Locations" && e.type === "pdf");
  const items = galleries.concat(mapDocs);
  const cards = items.map(e => {
    if (!mapsSelectMode) {
      return e.type === "gallery"
        ? `<a class="entry-card" href="#/entry/${e.id}"><h3>${esc(e.title)}</h3><p>${e.images.length} images</p><div class="meta">Gallery</div></a>`
        : entryCard(e);
    }
    const checked = mapsSelected.has(e.id);
    const preview = e.type === "gallery" ? `${e.images.length} images` : esc((e.summary || "").slice(0, 160));
    return `<div class="entry-card selectable ${checked ? "checked" : ""}" data-id="${e.id}">
      <input type="checkbox" class="ec-check" ${checked ? "checked" : ""}>
      <h3>${esc(e.title)}</h3><p>${preview}</p>
      <div class="meta">${e.type === "gallery" ? "Gallery" : catDot(e.category) + " " + esc(e.category)}</div>
    </div>`;
  }).join("");

  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${svg("atlas")} Atlas</div>
    <div class="browse-head">
      <h1>Atlas &amp; Galleries</h1>
      <div class="browse-actions">
        ${items.length ? `<button class="btn ghost sm" id="toggleSelect">${mapsSelectMode ? "Cancel" : "Select"}</button>` : ""}
      </div>
    </div>
    <p class="muted">Maps, flags, and visual reference plates.</p>
    ${mapsSelectMode ? `<div class="select-bar">
      <label class="sel-all"><input type="checkbox" id="selAll" ${items.length && mapsSelected.size === items.length ? "checked" : ""}> Select all</label>
      <span class="faint" id="selCount">${mapsSelected.size} selected</span>
      <button class="btn danger sm" id="deleteSelected" ${mapsSelected.size ? "" : "disabled"}>Delete selected</button>
    </div>` : ""}
    <div class="list-grid">${cards || `<div class="empty-state">Nothing here yet.</div>`}</div>
  </div>`;
  bindGallery();

  if ($("#toggleSelect")) $("#toggleSelect").onclick = () => { mapsSelectMode = !mapsSelectMode; if (!mapsSelectMode) mapsSelected.clear(); renderMaps(); };
  if (mapsSelectMode) {
    $("#selAll").onchange = e => { mapsSelected = e.target.checked ? new Set(items.map(i => i.id)) : new Set(); renderMaps(); };
    $$(".entry-card.selectable", view).forEach(card => {
      const cb = card.querySelector(".ec-check");
      const toggle = () => {
        if (cb.checked) mapsSelected.add(card.dataset.id); else mapsSelected.delete(card.dataset.id);
        $("#selCount").textContent = mapsSelected.size + " selected";
        $("#deleteSelected").disabled = !mapsSelected.size;
        card.classList.toggle("checked", cb.checked);
      };
      cb.onchange = toggle;
      card.onclick = e => { if (e.target === cb) return; cb.checked = !cb.checked; toggle(); };
    });
    $("#deleteSelected").onclick = async () => {
      if (!mapsSelected.size) return;
      if (!confirm(`Delete ${mapsSelected.size} item${mapsSelected.size === 1 ? "" : "s"} from the Atlas? You can restore them anytime from Settings → Deleted entries.`)) return;
      await CodexExtra.hide(Array.from(mapsSelected));
      mapsSelected.clear(); mapsSelectMode = false;
      refresh();
    };
  }
}
function bindGallery() {
  $$(".gallery figure", view).forEach(f => f.onclick = () => {
    const lb = document.createElement("div"); lb.className = "lightbox";
    lb.innerHTML = `<img src="${f.dataset.full}">`; lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  });
}

/* ---------- name index ---------- */
let indexSelectMode = false, indexSelected = new Set();
function viewIndex() {
  indexSelectMode = false; indexSelected = new Set();
  renderIndex();
}
function renderIndex() {
  const groups = {};
  DB.entities.forEach(n => { const L = (n[0] || "#").toUpperCase(); (groups[L] = groups[L] || []).push(n); });
  const letters = Object.keys(groups).sort();
  const total = DB.entities.length;
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${svg("index")} Index</div>
    <div class="browse-head">
      <h1>Name Index</h1>
      <div class="browse-actions">
        ${total ? `<button class="btn ghost sm" id="toggleSelect">${indexSelectMode ? "Cancel" : "Select"}</button>` : ""}
      </div>
    </div>
    <p class="muted">Every cross-linked name in your world. Click any to gather its mentions and a summary.</p>
    ${indexSelectMode ? `<div class="select-bar">
      <label class="sel-all"><input type="checkbox" id="selAll" ${total && indexSelected.size === total ? "checked" : ""}> Select all</label>
      <span class="faint" id="selCount">${indexSelected.size} selected</span>
      <button class="btn danger sm" id="deleteSelected" ${indexSelected.size ? "" : "disabled"}>Remove from index</button>
    </div>` : ""}
    ${letters.map(L => `<h3 style="font-family:var(--serif);margin-top:26px">${esc(L)}</h3>
      <div class="recog">${groups[L].sort().map(n => indexSelectMode
        ? `<label class="chip index-chip ${indexSelected.has(n) ? "checked" : ""}"><input type="checkbox" class="ic-check" data-name="${esc(n)}" ${indexSelected.has(n) ? "checked" : ""}>${esc(n)}</label>`
        : `<span class="chip" data-subject="${esc(n)}">${esc(n)}</span>`).join("")}</div>`).join("")}
  </div>`;

  if ($("#toggleSelect")) $("#toggleSelect").onclick = () => { indexSelectMode = !indexSelectMode; if (!indexSelectMode) indexSelected.clear(); renderIndex(); };
  if (!indexSelectMode) { $$(".chip[data-subject]", view).forEach(c => c.onclick = () => location.hash = "#/subject/" + encodeURIComponent(c.dataset.subject)); return; }

  $("#selAll").onchange = e => { indexSelected = e.target.checked ? new Set(DB.entities) : new Set(); renderIndex(); };
  $$(".ic-check", view).forEach(cb => cb.onchange = () => {
    if (cb.checked) indexSelected.add(cb.dataset.name); else indexSelected.delete(cb.dataset.name);
    cb.closest(".index-chip").classList.toggle("checked", cb.checked);
    $("#selCount").textContent = indexSelected.size + " selected";
    $("#deleteSelected").disabled = !indexSelected.size;
  });
  $("#deleteSelected").onclick = async () => {
    if (!indexSelected.size) return;
    if (!confirm(`Remove ${indexSelected.size} name${indexSelected.size === 1 ? "" : "s"} from the index? They'll stop being cross-linked in your text. You can restore them anytime from Settings.`)) return;
    await CodexExtra.excludeNames(Array.from(indexSelected));
    indexSelected.clear(); indexSelectMode = false;
    refresh();
  };
}

/* ---------- IMPORT / add lore ---------- */
function viewImport() {
  // every section is a valid filing destination — the built-in canon collections,
  // "My Notes", and any custom sections you've made with the + button
  const allCats = categoriesList().map(c => c.name);
  const custom = customCats();
  view.innerHTML = `<div class="wrap">
    <div class="page-kicker">${svg("import")} Import &amp; Add Lore</div>
    <h1>Add to your canon</h1>
    <p class="muted">Drop in <b>PDFs</b> (text and page images both come in, like Notion), <b>Word documents</b>
      (.docx), text or Markdown files, or add images directly. Everything is indexed straight away — searchable,
      cross-linked, and readable by the assistant. It's stored privately in this browser (back it up from the sidebar).</p>

    <div class="dropzone" id="dropzone">
      <div class="dz-inner">
        <div class="dz-title">Drag files here, or click to choose</div>
        <div class="dz-sub">PDF · Word (.docx) · Text &amp; Markdown · Images · a backup <b>.json</b> restores everything</div>
      </div>
      <input type="file" id="fileInput" multiple accept=".txt,.md,.markdown,.json,.pdf,.docx,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/*" hidden>
    </div>
    <div class="import-progress" id="importProgress" hidden></div>

    <h3 style="font-family:var(--serif);margin-top:34px">Or write / paste it in</h3>
    <input class="import-title" id="pasteTitle" placeholder="Title (e.g. a character, place, or note)">
    <textarea class="import-body" id="pasteBody" placeholder="Paste or type the lore here…"></textarea>
    <div class="import-row">
      <select class="folder-select" id="pasteCat" title="Which section this gets filed under">
        ${allCats.map(c => `<option value="${esc(c)}" ${c === "My Notes" ? "selected" : ""}>${esc(c)}</option>`).join("")}
      </select>
      <button class="btn" id="addPaste">Add to my canon</button>
    </div>
    ${custom.length ? "" : `<p class="faint" style="margin-top:8px;font-size:12px">Want a section of your own (not one of the built-in ones)?
      Click the <b>+</b> next to "The Canon" in the sidebar to create one — it'll show up in this list too.</p>`}

    <div id="importLog" class="import-log"></div>
  </div>`;

  const dz = $("#dropzone"), fi = $("#fileInput");
  dz.onclick = () => fi.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); handleFiles(e.dataTransfer.files); };
  fi.onchange = () => handleFiles(fi.files);

  $("#addPaste").onclick = async () => {
    const t = $("#pasteTitle").value.trim(), b = $("#pasteBody").value.trim(), c = $("#pasteCat").value;
    if (!b) { toast("Nothing to add yet"); return; }
    const note = await addNote(t || ("Note " + new Date().toLocaleDateString()), b, [], c);
    logImport(`Added <b>${esc(note.title)}</b> to <b>${esc(c)}</b>.`, c);
    $("#pasteTitle").value = ""; $("#pasteBody").value = "";
    location.hash = "#/entry/" + note.id;
  };
}
function logImport(msg, cat) { const l = $("#importLog"); if (l) l.innerHTML = `<div class="import-ok">✓ ${msg} <a href="#/browse/${encodeURIComponent(cat || "My Notes")}">See “${esc(cat || "My Notes")}” →</a></div>` + l.innerHTML; }
function importProgress(msg) { const p = $("#importProgress"); if (!p) return; p.hidden = false; p.textContent = msg; }

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const cat = ($("#pasteCat") && $("#pasteCat").value) || "My Notes";
  const images = [];
  for (const f of files) {
    const name = f.name || "file";
    importProgress(`Reading ${name}…`);
    if (/^image\//.test(f.type)) {
      try { images.push(await window.CodexImg.fileToScaledDataURL(f)); } catch (e) { logImport(`Couldn't read image ${esc(name)}`); }
    } else if (/\.pdf$/i.test(name) || f.type === "application/pdf") {
      try { await importPdf(f, cat); logImport(`Imported <b>${esc(name.replace(/\.pdf$/i, ""))}</b> (text + page images).`, cat); }
      catch (e) { logImport(`Couldn't read PDF ${esc(name)}: ${esc(e.message || "")}`); }
    } else if (/\.docx$/i.test(name)) {
      try { await importDocx(f, cat); logImport(`Imported <b>${esc(name.replace(/\.docx$/i, ""))}</b>.`, cat); }
      catch (e) { logImport(`Couldn't read Word file ${esc(name)}: ${esc(e.message || "")}`); }
    } else if (/\.json$/i.test(name) || f.type === "application/json") {
      try {
        const txt = await f.text(); const data = JSON.parse(txt);
        if (data && data._codex) {
          await CodexStore.importAll(data); await loadNotes();
          if (window.CodexExtra) await CodexExtra.ready();
          buildIndexes(); buildNav(); logImport(`Restored your backup <b>${esc(name)}</b>.`);
        } else { const note = await addNote(name.replace(/\.json$/i, ""), txt, [], cat); logImport(`Added <b>${esc(note.title)}</b>.`, cat); }
      } catch (e) { logImport(`Couldn't read ${esc(name)}`); }
    } else {
      try {
        const txt = await f.text();
        const note = await addNote(name.replace(/\.(txt|md|markdown)$/i, ""), txt, [], cat);
        logImport(`Added <b>${esc(note.title)}</b> (${note.text.split(/\s+/).filter(Boolean).length} words).`, cat);
      } catch (e) { logImport(`Couldn't read ${esc(name)}`); }
    }
  }
  if (images.length) {
    const note = await addNote("Imported images · " + new Date().toLocaleDateString(), "", images, cat);
    logImport(`Added ${images.length} image${images.length === 1 ? "" : "s"} as a gallery.`, cat);
  }
  const p = $("#importProgress"); if (p) p.hidden = true;
}

/* PDF import: extract text AND render every page to an image, Notion-style,
   so the visuals come across, not just the words. */
async function importPdf(file, cat) {
  if (!window.pdfjsLib) throw new Error("PDF reader not loaded");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  const images = [];
  const maxPages = Math.min(pdf.numPages, 60);
  for (let i = 1; i <= maxPages; i++) {
    importProgress(`Reading ${file.name} — page ${i} of ${maxPages}…`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n\n";
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.82));
  }
  const title = file.name.replace(/\.pdf$/i, "");
  await addNote(title, text.trim(), images, cat);
}

/* Word (.docx) import via mammoth — pulls text and any embedded images. */
async function importDocx(file, cat) {
  if (!window.mammoth) throw new Error("Word reader not loaded");
  const buf = await file.arrayBuffer();
  const images = [];
  const result = await mammoth.convertToHtml({ arrayBuffer: buf }, {
    convertImage: mammoth.images.imgElement(async (el) => {
      const b64 = await el.read("base64");
      const url = "data:" + el.contentType + ";base64," + b64;
      images.push(url);
      return { src: url };
    })
  });
  const div = document.createElement("div"); div.innerHTML = result.value;
  const text = div.textContent || "";
  const title = file.name.replace(/\.docx$/i, "");
  await addNote(title, text.trim(), images, cat);
}

/* ---------- full-page search results (roomy, with overview) ---------- */
function viewSearchPage(q) {
  const results = searchAll(q);
  const overview = queryOverviewHtml(q, results);
  const groups = {};
  results.forEach(e => (groups[e.category] = groups[e.category] || []).push(e));
  const body = Object.keys(groups).map(cat => `
    <div class="sr-group">${catDot(cat)} ${esc(cat)}</div>
    <div class="list-grid">${groups[cat].map(e => `<a class="entry-card" href="#/entry/${e.id}" style="min-height:auto">
      <h3>${esc(e.title)}</h3><p>${e.type === "gallery" ? e.images.length + " images" : "…" + snippet(e.text, q.split(/\s+/)[0], 200) + "…"}</p>
      <div class="meta">${catDot(e.category)} ${esc(e.category)}</div></a>`).join("")}</div>`).join("");
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${svg("search")} Search</div>
    <h1>“${esc(q)}”</h1>
    <p class="muted">${results.length} ${results.length === 1 ? "result" : "results"} across your canon.</p>
    ${overview}
    ${results.length ? body : `<div class="empty-state">No matches. Try another name or term.</div>`}
  </div>`;
  bindSummaryChips(view);
}

/* build the synthesized "brief summary of the topic" above search results */
function queryOverviewHtml(q, results) {
  if (!results.length) return "";
  // If the query names a known entity/entry, use the topic summary machinery.
  const named = matchNamedSubject(q);
  if (named) return summaryBlockHtml(named);
  // Otherwise synthesize from the top matching passages.
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const cands = [];
  results.slice(0, 8).forEach((e, ei) => {
    sentencesOf(e.text).forEach((s, idx) => {
      const sl = s.toLowerCase();
      const hit = terms.filter(t => sl.includes(t)).length;
      if (hit && s.length > 30 && s.length < 320) {
        let score = hit * 2 - ei * 0.2 - idx * 0.01;
        if (DESCRIPTIVE.test(s)) score += 0.5;
        cands.push({ s: s.trim(), score });
      }
    });
  });
  cands.sort((a, b) => b.score - a.score);
  const out = [], seen = new Set();
  for (const c of cands) { const k = c.s.slice(0, 44).toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(c.s); if (out.length >= 4) break; }
  const cats = Array.from(new Set(results.map(r => r.category)));
  const rel = topEntitiesAcross(results.slice(0, 8), terms, 8);
  if (!out.length) return "";
  return `<div class="summary-card">
    <div class="sc-label">${svg("spark")} Summary · from ${results.length} ${results.length === 1 ? "entry" : "entries"} in ${cats.length} ${cats.length === 1 ? "collection" : "collections"}</div>
    <p class="sc-text">${out.map(esc).join(" ")}</p>
    ${rel.length ? `<div class="sc-rel"><span class="sc-rel-label">Related</span>
      ${rel.map(n => `<span class="chip" data-subject="${esc(n)}">${esc(n)}</span>`).join("")}</div>` : ""}
  </div>`;
}
function topEntitiesAcross(entries, terms, limit) {
  const counts = {};
  entries.forEach(e => entitiesIn(e.text).forEach(n => {
    if (!terms.includes(n.toLowerCase())) counts[n] = (counts[n] || 0) + 1;
  }));
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, limit);
}
function matchNamedSubject(q) {
  const ql = q.trim().toLowerCase();
  const entry = DB.entries.find(e => (e.type === "pdf" || e.type === "note") && e.title.toLowerCase() === ql);
  if (entry) return entry.title;
  const ent = DB.entities.find(n => n.toLowerCase() === ql);
  if (ent) return ent;
  // "House X" convenience
  const h = DB.entries.find(e => e.title.toLowerCase() === "house " + ql);
  if (h) return h.title;
  return null;
}

/* ============================================================
   GLOBAL SEARCH (overlay)
   ============================================================ */
function snippet(text, q, len = 160) {
  const t = (text || "").replace(/\s+/g, " ");
  const i = t.toLowerCase().indexOf((q || "").toLowerCase());
  if (i < 0) return esc(t.slice(0, len));
  const start = Math.max(0, i - len / 3 | 0);
  const seg = t.slice(start, start + len);
  return esc(seg).replace(new RegExp("(" + (q || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
}
function searchAll(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const terms = q.split(/\s+/); const res = [];
  for (const e of DB.entries) {
    const hay = e._hay, title = e.title.toLowerCase(); let score = 0;
    for (const t of terms) {
      if (!hay.includes(t)) { score = -1; break; }
      if (title.includes(t)) score += 10;
      if (title.startsWith(t)) score += 8;
      score += Math.min(5, (hay.split(t).length - 1));
    }
    if (score > 0) res.push({ e, score });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, 50).map(r => r.e);
}
let searchSel = 0, searchList = [];
function renderSearch(q) {
  const box = $("#searchResults");
  if (!q.trim()) { box.innerHTML = `<div class="sr-empty">Start typing to search your whole canon.</div>`; return; }
  const results = searchAll(q);
  if (!results.length) { box.innerHTML = `<div class="sr-empty">No matches for “${esc(q)}”.</div>`; return; }
  const overview = queryOverviewHtml(q, results);
  const groups = {};
  results.forEach(e => (groups[e.category] = groups[e.category] || []).push(e));
  let html = overview ? `<div class="sr-overview">${overview}
    <a class="sr-fulllink" href="#/search/${encodeURIComponent(q)}">Open full results →</a></div>` : "", flat = [];
  Object.keys(groups).forEach(cat => {
    html += `<div class="sr-group">${catDot(cat)} ${esc(cat)}</div>`;
    groups[cat].forEach(e => {
      const idx = flat.length; flat.push(e);
      html += `<a class="sr-item" data-i="${idx}" href="#/entry/${e.id}">
        <div><span class="t">${esc(e.title)}</span></div>
        <div class="s">${e.type === "gallery" ? e.images.length + " images" : snippet(e.text, q.split(/\s+/)[0], 150)}</div>
      </a>`;
    });
  });
  searchList = flat; searchSel = 0;
  box.innerHTML = html;
  $$(".sr-item", box).forEach(it => {
    it.onclick = () => closeSearch();
    it.onmouseenter = () => { searchSel = +it.dataset.i; hiSearch(); };
  });
  bindSummaryChips(box);
  hiSearch();
}
function hiSearch() { $$(".sr-item").forEach((it, i) => it.classList.toggle("sel", i === searchSel)); }
function openSearch(prefill) {
  window.CodexHelp && CodexHelp.markMilestone("searched");
  $("#searchOverlay").hidden = false;
  const inp = $("#searchInput");
  if (prefill != null) inp.value = prefill;
  inp.focus(); inp.select();
  renderSearch(inp.value);
}
function closeSearch() { $("#searchOverlay").hidden = true; }

/* ============================================================
   ASSISTANT — local canon retrieval + summaries + Q&A
   ============================================================ */
function bestEntryFor(name) {
  const n = name.toLowerCase();
  let exact = DB.entries.find(e => (e.type === "pdf" || e.type === "note") && e.title.toLowerCase() === n);
  if (exact) return exact;
  let houses = DB.entries.find(e => (e.type === "pdf" || e.type === "note") && e.title.toLowerCase() === "house " + n);
  if (houses) return houses;
  const hits = mentionsOf(name, null);
  if (!hits.length) return null;
  const metaPenalty = e => (e.category === "Canon & Continuity" || e.category === "Reference & Lexicon") ? 1 : 0;
  hits.sort((a, b) => metaPenalty(a) - metaPenalty(b) || (b._hay.split(n).length) - (a._hay.split(n).length));
  return hits[0];
}

/* rich blurb: a natural-reading answer (not a raw source quote), + facts + related + sources */
function blurbCard(name) {
  const e = bestEntryFor(name);
  if (!e) return `<div class="blurb"><div class="bt">${esc(name)}</div>
    <div class="bs faint">No canon entry yet — this name isn't in your lore.</div></div>`;
  const sents = topicSummary(name, 3);
  let summary = sents.length ? sents.join(" ") : (firstSentenceWith(e.text, name) || e.summary || "");
  // if nothing we found actually opens with the subject, lead with a plain-spoken frame so it
  // reads as an answer to "who/what is X", not a quote dropped in from the middle of a document.
  const opensWithName = sents.length && new RegExp("^\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(sents[0]);
  if (summary && !opensWithName) {
    const lede = e.category === "Noble Houses" ? `${name} is a noble house in your canon.`
      : e.category === "Religion & Faith" ? `${name} figures into the religion of your world.`
      : e.category === "Maps & Locations" ? `${name} is a place in your world.`
      : `${name} appears in your ${e.category.toLowerCase()}.`;
    summary = lede + " " + summary;
  }
  const rel = relatedNames(name, 6);
  const others = mentionsOf(name, e.id).length;
  return `<div class="blurb">
    <div class="bt">${catDot(e.category)} ${esc(name)}</div>
    <div class="bc">${esc(e.category)}</div>
    <div class="bs">${esc(summary.slice(0, 420))}${summary.length > 420 ? "…" : ""}</div>
    ${rel.length ? `<div class="brel">${rel.map(n => `<span class="chip" data-subject="${esc(n)}">${esc(n)}</span>`).join("")}</div>` : ""}
    <div class="bl"><b>Source:</b> ${esc(e.title)}${others ? ` · also in <b>${others}</b> other ${others === 1 ? "entry" : "entries"}` : ""}</div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      <a class="btn sm" href="#/entry/${e.id}">Open entry</a>
      <a class="btn ghost sm" href="#/subject/${encodeURIComponent(name)}">All mentions &amp; summary</a>
    </div>
  </div>`;
}
function firstSentenceWith(text, name) {
  const t = (text || "").replace(/\s+/g, " ");
  const i = t.toLowerCase().indexOf(name.toLowerCase());
  if (i < 0) return null;
  let start = t.lastIndexOf(".", i); start = start < 0 ? Math.max(0, i - 40) : start + 1;
  let end = t.indexOf(".", i + name.length); end = end < 0 ? Math.min(t.length, i + 220) : end + 1;
  return t.slice(start, end).trim();
}

/* answer a free-text question by synthesizing across passages */
function assistantAnswer(q) {
  const results = searchAll(q);
  if (!results.length) return `<div class="assistant-hint">Nothing in your canon matches “${esc(q)}” yet.</div>`;
  const overview = queryOverviewHtml(q, results);
  const sources = results.slice(0, 6).map(e =>
    `<a class="ans-source" href="#/entry/${e.id}">${catDot(e.category)} ${esc(e.title)}</a>`).join("");
  return `${overview || ""}
    <div class="ans-sources"><div class="ans-label">Drawn from</div>${sources}</div>`;
}

/* ---------- assistant recent-lookup history ---------- */
const assistantHistory = { key: "codex.assistant.history",
  list() { try { return JSON.parse(localStorage.getItem(this.key) || "[]"); } catch (e) { return []; } },
  push(q) {
    const h = this.list().filter(x => x.toLowerCase() !== q.toLowerCase());
    h.unshift(q);
    localStorage.setItem(this.key, JSON.stringify(h.slice(0, 10)));
  },
};

/* ---------- shared category-keyword map, used by both task and opinion parsing ---------- */
const KIND_WORDS = [
  [/\bcharacters?\b/i, "Characters", "character"],
  [/\bhouses?\b/i, "Noble Houses", "house"],
  [/\bgoddesses?\b/i, "Religion & Faith", "goddess"],
  [/\bgods?\b/i, "Religion & Faith", "god"],
  [/\bplaces?\b/i, "Maps & Locations", "place"],
  [/\blocations?\b/i, "Maps & Locations", "location"],
  [/\bbooks?\b|\bstories\b/i, "Books & Stories", "book"],
  [/\bmagic\b/i, "Magic System", "magic entry"],
  [/\btimeline\b|\bhistory\b/i, "Timeline & History", "historical entry"],
  [/\bculture\b|\bfashion\b/i, "Culture & Fashion", "culture entry"],
  [/\bcanon\b|\bcontinuity\b/i, "Canon & Continuity", "canon entry"],
  [/\breference\b|\blexicon\b|\bterms?\b/i, "Reference & Lexicon", "reference entry"],
  [/\bnotes?\b/i, "My Notes", "note"],
];
function findKind(q) { for (const k of KIND_WORDS) { const m = q.match(k[0]); if (m) return { cat: k[1], label: k[2], match: m }; } return null; }

/* ---------- task/command parsing: "list all characters in <book>", "how many houses", etc. ---------- */
const TASK_TRIGGER = /\b(list|show|display|enumerate|find all|find every|get all|get me|pull up|tell me|give me|what are|who are|which|name all|name every|how many)\b/i;
function tryCommand(q) {
  if (!TASK_TRIGGER.test(q)) return null;
  const kind = findKind(q);
  if (!kind) return null;
  let after = q.slice(kind.match.index + kind.match[0].length);
  after = after.replace(/^\s*(in|from|of|about|within|that are in|that are from|named|called|that)\s*/i, "").trim().replace(/[?.!]+$/, "");
  // strip trailing filler that isn't actually a topic — "how many houses ARE THERE", "characters DO I HAVE"
  after = after.replace(/\s*(are there|is there|do i have|does it have|exist|are in my canon|do you have|are in the canon|are there\?)\s*$/i, "").trim();
  const filterTerm = after;
  let pool = DB.entries.filter(e => e.category === kind.cat && (e.type === "pdf" || e.type === "note"));
  if (filterTerm) pool = pool.filter(e => e._hay.includes(filterTerm.toLowerCase()));
  pool = pool.sort((a, b) => a.title.localeCompare(b.title));
  const label = filterTerm ? `${kind.cat} in "${filterTerm}"` : kind.cat;
  if (!pool.length) return `<div class="assistant-hint">I couldn't find any ${esc(label)} in your canon.${filterTerm ? " Try dropping the “" + esc(filterTerm) + "” part and just asking for all of them." : ""}</div>`;
  return `<div class="ans-label" style="margin-bottom:6px">Found ${pool.length} in ${esc(label)}</div>
    <div class="recog">${pool.map(e => `<a class="chip" href="#/entry/${e.id}">${esc(e.title)}</a>`).join("")}</div>`;
}

/* ---------- opinion mode: "what's your favourite character" ---------- */
const OPINION_TRIGGER = /\b(favou?rite|best|coolest|most interesting|most powerful|most important|top)\b/i;
function tryOpinion(q) {
  if (!OPINION_TRIGGER.test(q)) return null;
  const kind = findKind(q);
  if (!kind) return null;
  const pool = DB.entries.filter(e => e.category === kind.cat && (e.type === "pdf" || e.type === "note"));
  if (!pool.length) return `<div class="assistant-hint">I don't have any ${esc(kind.label)} entries to pick from yet.</div>`;
  const scored = pool.map(e => ({ e, score: mentionsOf(e.title, e.id).length + (e.wordcount || 0) / 200 }));
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0].e;
  const sents = topicSummary(pick.title, 2);
  return `<div class="ans-label">My pick, going by what's most woven through your canon</div>
    <div class="blurb">
      <div class="bt">${catDot(pick.category)} ${esc(pick.title)}</div>
      <div class="bs">${esc(sents.join(" ")) || esc(pick.summary || "")}</div>
      <div class="bl">Reasoning: <b>${esc(pick.title)}</b> turns up across ${scored[0].score >= 1 ? Math.round(scored[0].score) : "several"} other entries — more cross-referenced than the rest of your ${esc(kind.label)} entries, which usually means it's load-bearing for the story.</div>
      <div style="margin-top:8px"><a class="btn sm" href="#/entry/${pick.id}">Open entry</a></div>
    </div>`;
}

/* ---------- consistency check: does more than one entry disagree about the same fact? ---------- */
const CONSISTENCY_TRIGGER = /\b(check consistency|consistency check|check for contradictions|check contradictions|any contradictions|is .* consistent)\b/i;
function tryConsistency(q) {
  if (!CONSISTENCY_TRIGGER.test(q)) return null;
  const m = q.match(/\b(?:for|on|about|in|with|is)\s+([a-z][\w' -]{1,60}?)(?:\s+consistent)?\??$/i);
  const subject = m ? m[1].trim() : "";
  // scoped tightly to entries actually ABOUT the subject (by title) plus
  // canon-audit/reference docs that mention it — NOT every entry that
  // happens to name-drop it in passing, which would compare apples to oranges
  const sl = subject.toLowerCase();
  const pool = subject
    ? DB.entries.filter(e => (e.type === "pdf" || e.type === "note") &&
        (e.title.toLowerCase().includes(sl) ||
         ((e.category === "Canon & Continuity" || e.category === "Reference & Lexicon") && e._hay.includes(sl))))
    : DB.entries.filter(e => e.type === "pdf" || e.type === "note");
  const uniq = Array.from(new Set(pool)).filter(e => e && (e.type === "pdf" || e.type === "note")).slice(0, 40);
  if (!uniq.length) return `<div class="assistant-hint">I couldn't find anything to check${subject ? ` for "${esc(subject)}"` : ""}.</div>`;
  // gather every entry's own declared facts, grouped by fact key
  const byKey = {};
  uniq.forEach(e => {
    factsOf(e, 10).forEach(f => {
      const key = f.k.toLowerCase();
      (byKey[key] = byKey[key] || []).push({ entry: e, k: f.k, v: f.v });
    });
  });
  const conflicts = Object.values(byKey).filter(list => {
    const distinctVals = new Set(list.map(x => x.v.toLowerCase().trim()));
    return distinctVals.size > 1 && new Set(list.map(x => x.entry.id)).size > 1;
  });
  if (!conflicts.length) {
    return `<div class="assistant-hint">${svg("spark")} Checked ${uniq.length} ${uniq.length === 1 ? "entry" : "entries"}${subject ? ` touching "${esc(subject)}"` : ""} —
      no entries declare different values for the same fact. That doesn't guarantee consistency (I can only compare
      facts written as "Key: Value" lines), but nothing obvious conflicts.</div>`;
  }
  return `<div class="ans-label">Possible inconsistenc${conflicts.length === 1 ? "y" : "ies"} — ${conflicts.length} fact${conflicts.length === 1 ? "" : "s"} where entries disagree</div>
    ${conflicts.slice(0, 8).map(list => `<div class="blurb">
      <div class="bt">${esc(list[0].k)}</div>
      ${list.map(x => `<div class="bl"><b>${esc(x.v)}</b> — <a href="#/entry/${x.entry.id}">${esc(x.entry.title)}</a></div>`).join("")}
    </div>`).join("")}`;
}

/* ---------- summarize the document currently open in the editor ---------- */
const SUMMARIZE_DOC_TRIGGER = /\b(summarize this( document)?|summarise this( document)?|tl;?dr this|summary of this)\b/i;
function trySummarizeDoc(q) {
  if (!SUMMARIZE_DOC_TRIGGER.test(q)) return null;
  const cur = window.CodexEditor && CodexEditor.getCurrentDoc();
  if (!cur || !document.body.contains(cur.editor)) {
    return `<div class="assistant-hint">Open a document first, then ask me to summarize it.</div>`;
  }
  const text = cur.editor.innerText || "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 8) return `<div class="assistant-hint">Not much written yet — give it a few more sentences and ask again.</div>`;
  const sents = sentencesOf(text).filter(s => s.length > 15);
  const scored = sents.map((s, i) => ({ s, score: (i < 3 ? 1 : 0) + (DESCRIPTIVE.test(s) ? 0.6 : 0) + Math.min(3, entitiesIn(s).size) * 0.3 }));
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, 4).map(x => x.s);
  const names = Array.from(entitiesIn(text)).slice(0, 8);
  return `<div class="ans-label">Summary of “${esc(cur.title() || "this document")}” — ${words.length} words</div>
    <div class="blurb"><div class="bs">${picked.map(esc).join(" ")}</div>
    ${names.length ? `<div class="brel">${names.map(n => `<span class="chip" data-subject="${esc(n)}">${esc(n)}</span>`).join("")}</div>` : ""}
    </div>`;
}

function assistantLookup(q) {
  const body = $("#assistantBody");
  q = (q || "").trim();
  if (!q) { assistantIdle(); return; }
  assistantHistory.push(q);
  const sum = trySummarizeDoc(q); if (sum) { body.innerHTML = sum; bindAssistantLinks(body); return; }
  const con = tryConsistency(q); if (con) { body.innerHTML = con; bindAssistantLinks(body); return; }
  const cmd = tryCommand(q); if (cmd) { body.innerHTML = cmd; bindAssistantLinks(body); return; }
  const op = tryOpinion(q); if (op) { body.innerHTML = op; bindAssistantLinks(body); return; }
  const named = matchNamedSubject(q) || partialEntity(q);
  if (named) { body.innerHTML = blurbCard(named); bindAssistantLinks(body); return; }
  // multi-word / question → synthesize an answer
  if (q.split(/\s+/).length >= 2) { body.innerHTML = assistantAnswer(q); bindAssistantLinks(body); return; }
  // single unknown word → try a search
  const results = searchAll(q);
  if (results.length) { body.innerHTML = assistantAnswer(q); bindAssistantLinks(body); return; }
  body.innerHTML = `<div class="assistant-hint">Nothing in your canon matches “${esc(q)}” yet.<br>Try a character, house, place, or a question.</div>`;
}
function partialEntity(q) {
  const ql = q.toLowerCase();
  const m = DB.entities.find(n => n.toLowerCase().includes(ql));
  return m || null;
}
const QUICK_ACTIONS = [
  { label: "List characters", q: "list all characters" },
  { label: "List noble houses", q: "list all houses" },
  { label: "Favourite house", q: "favourite house" },
  { label: "Check consistency", q: "check consistency" },
  { label: "Summarize this document", q: "summarize this document" },
];
function assistantIdle() {
  const hist = assistantHistory.list();
  const histHtml = hist.length ? `<div style="margin-top:14px">
    <div class="sc-rel-label">Recent</div>
    <div class="recog">${hist.map(h => `<span class="chip" data-recent="${esc(h)}">${esc(h)}</span>`).join("")}</div>
  </div>` : "";
  $("#assistantBody").innerHTML = `<div class="assistant-hint">
    ${svg("spark")} I read only what <b>you've</b> written.<br><br>
    Look up any name for an instant summary, ask a question in plain words, give me a task
    ("list all characters in Aicruae"), ask my opinion ("favourite house"), check your canon for
    contradictions, summarize the document you're writing, or open a Document and I'll recognise
    names as you type.</div>
    <div style="margin-top:14px">
      <div class="sc-rel-label">Quick actions</div>
      <div class="recog">${QUICK_ACTIONS.map(a => `<span class="chip" data-quick="${esc(a.q)}">${esc(a.label)}</span>`).join("")}</div>
    </div>${histHtml}`;
  $$('[data-recent]', $("#assistantBody")).forEach(c => c.onclick = () => { $("#assistantInput").value = c.dataset.recent; assistantLookup(c.dataset.recent); });
  $$('[data-quick]', $("#assistantBody")).forEach(c => c.onclick = () => { $("#assistantInput").value = c.dataset.quick; assistantLookup(c.dataset.quick); });
}
function assistantScan(text) {
  const found = [], seen = new Set();
  if (ENT_RE) { ENT_RE.lastIndex = 0; let m; while ((m = ENT_RE.exec(text)) && found.length < 12) { const w = m[1]; if (!seen.has(w)) { seen.add(w); found.push(w); } } }
  const body = $("#assistantBody");
  if (!found.length) { body.innerHTML = `<div class="assistant-hint">Keep writing — as you mention names from your world, their summaries appear here.</div>`; return; }
  body.innerHTML = `<div class="faint" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Recognised in your text</div>
    <div class="recog">${found.map(n => `<span class="chip" data-name="${esc(n)}">${esc(n)}</span>`).join("")}</div>
    <div id="assistantFocus"></div>`;
  $$(".recog .chip", body).forEach(c => c.onclick = () => { $("#assistantFocus").innerHTML = blurbCard(c.dataset.name); bindAssistantLinks(body); });
  $("#assistantFocus").innerHTML = blurbCard(found[found.length - 1]);
  bindAssistantLinks(body);
}
function bindAssistantLinks(root) {
  $$(".chip[data-subject]", root).forEach(c => c.onclick = () => location.hash = "#/subject/" + encodeURIComponent(c.dataset.subject));
}
window.CodexAssistant = { scan: assistantScan, lookup: assistantLookup, open: openAssistant };
function openAssistant() { $("#app").classList.add("assist-open"); $("#assistant").hidden = false; }
function closeAssistant() { $("#app").classList.remove("assist-open"); $("#assistant").hidden = true; }

/* ============================================================
   BACKUP / RESTORE  (now covers docs, decks, canvases, folders, notes)
   ============================================================ */
async function backupAll() {
  let data;
  if (window.CodexStore) data = await CodexStore.exportAll();
  else { data = { _codex: true, stores: {} }; }
  data._codex = true;
  // include tiny localStorage prefs too
  data.prefs = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("codex.")) data.prefs[k] = localStorage.getItem(k); }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "beep-beep-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  window.CodexHelp && CodexHelp.markMilestone("backup");
  toast("Backup downloaded");
}
function restoreAll() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "application/json";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const data = JSON.parse(r.result);
        if (data.prefs) Object.keys(data.prefs).forEach(k => localStorage.setItem(k, data.prefs[k]));
        if (window.CodexStore && data.stores) await CodexStore.importAll(data);
        else if (data && !data.stores) Object.keys(data).forEach(k => { if (k.startsWith("codex.")) localStorage.setItem(k, data[k]); });
        await loadNotes();
        if (window.CodexExtra) await CodexExtra.ready();
        buildIndexes(); buildNav();
        toast("Backup restored"); route();
      } catch (e) { toast("Could not read that file"); }
    };
    r.readAsText(f);
  };
  inp.click();
}

/* ---------- toast ----------
   Bottom-right gold-framed panel with a ✦ glyph, ~5s auto-dismiss and a
   manual ✕. Toasts stack rather than replacing one another, so a burst
   (e.g. importing several files) doesn't swallow all but the last. */
function toast(msg) {
  let stack = $("#toastStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toastStack"; stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="tglyph">✦</span><span class="tmsg"></span>
    <button class="tx" title="Dismiss" aria-label="Dismiss">✕</button>`;
  el.querySelector(".tmsg").textContent = msg;   // textContent: messages can carry user text
  let done = false;
  const dismiss = () => {
    if (done) return; done = true;
    clearTimeout(t);
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 260);
  };
  el.querySelector(".tx").onclick = dismiss;
  const t = setTimeout(dismiss, 5000);
  stack.appendChild(el);
  // keep the stack from growing without bound in a long burst
  while (stack.children.length > 4) stack.firstChild.remove();
}
window.toast = toast;

/* ============================================================
   ROUTER
   ============================================================ */
function route() {
  const h = location.hash || "#/";
  const parts = h.replace(/^#\//, "").split("/");
  const path = parts[0];
  const arg = decodeURIComponent(parts.slice(1).join("/") || "");
  view.scrollTop = 0;
  if (h === "#/" || path === "") viewDesk();
  else if (path === "browse") viewBrowse(arg);
  else if (path === "entry") viewEntry(parts[1]);
  else if (path === "subject") viewSubject(arg);
  else if (path === "search") viewSearchPage(arg);
  else if (path === "maps") viewMaps();
  else if (path === "index") viewIndex();
  else if (path === "import") viewImport();
  else if (path === "docs") window.CodexEditor && CodexEditor.list(parts[1] || null);
  else if (path === "doc") window.CodexEditor && CodexEditor.open(parts[1]);
  else if (path === "slides") window.CodexEditor && CodexEditor.deckList(parts[1] || null);
  else if (path === "deck") window.CodexEditor && CodexEditor.deckOpen(parts[1]);
  else if (path === "canvases") window.CodexCanvas && CodexCanvas.list(parts[1] || null);
  else if (path === "canvas") window.CodexCanvas && CodexCanvas.open(parts[1]);
  else if (path === "mindmaps") window.CodexMindmap && CodexMindmap.list(parts[1] || null);
  else if (path === "mindmap") window.CodexMindmap && CodexMindmap.open(parts[1]);
  else if (path === "sheets") window.CodexSheets && CodexSheets.list(parts[1] || null);
  else if (path === "sheet") window.CodexSheets && CodexSheets.open(parts[1]);
  else if (path === "study") window.CodexStudy && CodexStudy.view();
  else if (path === "timeline") window.CodexTimeline && CodexTimeline.view();
  else if (path === "help") window.CodexHelp && CodexHelp.view();
  else if (path === "tasks") window.CodexUI && CodexUI.viewTasks();
  else if (path === "feed") window.CodexUI && CodexUI.viewFeed();
  else if (path === "settings") window.CodexUI && CodexUI.viewSettings();
  else viewDesk();
  markActive();
}
/* The Desk is the home screen; viewHome is the pre-Desk fallback, kept so a
   missing desk.js degrades to a working page rather than a blank one. */
function viewDesk() { window.CodexDesk ? CodexDesk.view() : viewHome(); }

/* ============================================================
   INIT
   ============================================================ */
function collapseSidebar(force) {
  const app = $("#app");
  if (force === true) app.classList.add("sidebar-collapsed");
  else if (force === false) app.classList.remove("sidebar-collapsed");
  else app.classList.toggle("sidebar-collapsed");
}

/* Below 860px the sidebar is an overlay drawer, so leaving it open on a
   narrow screen would bury the page behind it. Start it closed there, and
   close it again whenever a nav link is followed. */
function isNarrow() { return window.matchMedia("(max-width:860px)").matches; }

async function init() {
  if (isNarrow()) collapseSidebar(true);
  try {
    if (window.CodexStore) {
      // if the last-active workspace isn't the default one, redirect storage
      // to that workspace's own isolated database before loading anything
      const wsId = window.CodexWorkspaces ? CodexWorkspaces.activeId() : "default";
      if (wsId !== "default") await CodexStore.switchWorkspace(wsId);
      else await CodexStore.ready;
      await loadNotes();
    }
    if (window.CodexExtra) await CodexExtra.ready();
    // the sidebar's Projects section renders from this cache
    if (window.CodexFolders) await CodexFolders.ensureCache(true);
  } catch (e) { /* non-fatal */ }
  buildIndexes();
  buildNav();
  if (window.CodexWorkspaces) CodexWorkspaces.updateBrandLabel();
  $("#app").classList.remove("loading");
  route();
  window.addEventListener("hashchange", route);

  if ($("#wsSwitchOpen")) $("#wsSwitchOpen").onclick = () => window.CodexWorkspaces && CodexWorkspaces.openSwitcher();

  const savedTheme = localStorage.getItem("codex.theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $("#themeToggle").onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    localStorage.setItem("codex.theme", t);
  };

  $("#sidebarToggle").onclick = () => collapseSidebar();
  // crossing the 860px boundary changes the sidebar from a column into an
  // overlay, so its open/closed default has to change with it
  let wasNarrow = isNarrow();
  window.addEventListener("resize", () => {
    const now = isNarrow();
    if (now !== wasNarrow) { wasNarrow = now; collapseSidebar(now); }
  });
  if (innerWidth < 860) collapseSidebar(true);

  // export menu
  $("#exportOpen").onclick = () => { $("#exportMenu").hidden = false; };
  $("#exportClose").onclick = () => { $("#exportMenu").hidden = true; };
  $("#exportMenu").addEventListener("click", e => { if (e.target.id === "exportMenu") $("#exportMenu").hidden = true; });
  $("#exportPagePrint").onclick = () => {
    const orient = $("#exportOrientation").value;
    let styleEl = document.getElementById("printOrientStyle");
    if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "printOrientStyle"; document.head.appendChild(styleEl); }
    styleEl.textContent = `@media print { @page { size: ${orient}; margin: 14mm; } }`;
    $("#exportMenu").hidden = true;
    setTimeout(() => window.print(), 80);
  };
  $("#exportSiteJson").onclick = () => { backupAll(); $("#exportMenu").hidden = true; };

  $("#assistantToggle").onclick = () => $("#assistant").hidden ? openAssistant() : closeAssistant();
  $("#assistantClose").onclick = closeAssistant;
  assistantIdle();
  let aT;
  $("#assistantInput").addEventListener("input", e => { clearTimeout(aT); aT = setTimeout(() => assistantLookup(e.target.value), 160); });

  $("#searchOpen").onclick = () => openSearch("");
  const si = $("#searchInput"); let sT;
  si.addEventListener("input", () => { clearTimeout(sT); sT = setTimeout(() => renderSearch(si.value), 90); });
  si.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); searchSel = Math.min(searchSel + 1, searchList.length - 1); hiSearch(); scrollSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); searchSel = Math.max(searchSel - 1, 0); hiSearch(); scrollSel(); }
    else if (e.key === "Enter") {
      const e2 = searchList[searchSel];
      if (e2) { location.hash = "#/entry/" + e2.id; closeSearch(); }
      else if (si.value.trim()) { location.hash = "#/search/" + encodeURIComponent(si.value.trim()); closeSearch(); }
    }
    else if (e.key === "Escape") closeSearch();
  });
  $("#searchOverlay").addEventListener("click", e => { if (e.target.id === "searchOverlay") closeSearch(); });

  window.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); openSearch(""); }
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F") && !isEditing(e.target)) { e.preventDefault(); openSearch(""); }
    if (e.key === "Escape") { closeSearch(); $$(".lightbox").forEach(l => l.remove()); }
  });
}
function scrollSel() { const el = $$(".sr-item")[searchSel]; if (el) el.scrollIntoView({ block: "nearest" }); }
function isEditing(t) { return t && (t.isContentEditable || /input|textarea/i.test(t.tagName)); }

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

async function reloadWorkspace() { await loadNotes(); refresh(); }
window.Codex = { DB, byId, mentionsOf, bestEntryFor, SRC, topicSummary, refresh, addNote, updateNote, deleteNote, categoriesList, factsOf, sentencesOf, visibleEntries, reloadWorkspace, entitiesIn, snippet, searchAll, svg, catColor, catDot,
  recentCount: () => store.recent.length, recentIds: () => store.recent.slice() };
})();
