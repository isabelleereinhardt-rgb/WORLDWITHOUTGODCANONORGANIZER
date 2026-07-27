/* ============================================================
   The Codex; core app
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
  read:   '<path d="M10 5.6C8.4 4.4 6 4.2 3.6 4.6v10.2c2.4-.4 4.8-.2 6.4 1 1.6-1.2 4-1.4 6.4-1V4.6c-2.4-.4-4.8-.2-6.4 1z"/><path d="M10 5.6v11"/>',
  clock:  '<circle cx="10" cy="10" r="6.6"/><path d="M10 6.4V10l2.6 1.6"/>',
  book:   '<path d="M4.5 4h7a2 2 0 0 1 2 2v10H6.5a2 2 0 0 0-2 2z"/><path d="M13.5 6a2 2 0 0 1 2-2v12"/>',
  people: '<circle cx="7.6" cy="8" r="2.6"/><path d="M3.4 16c0-2.3 1.9-4.2 4.2-4.2s4.2 1.9 4.2 4.2"/><circle cx="14" cy="8.6" r="2"/><path d="M13 12c2 0 3.6 1.6 3.6 3.6"/>',
};
function svg(name) {
  return `<svg class="ic-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ""}</svg>`;
}

/* ---------- category colours (markers are coloured dots, not emoji)
   Muted, dusty hues chosen to sit inside the rose/antique palette; bright
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
  // Guarded: this runs while the module is still evaluating, so a
  // corrupt or truncated value here would stop app.js loading at all
  // and leave the shell stuck on "Opening…" with an empty sidebar.
  recent: (() => {
    try {
      const v = JSON.parse(localStorage.getItem("codex.recent") || "[]");
      if (Array.isArray(v)) return v.filter(x => typeof x === "string");
    } catch (e) {}
    // rewrite the bad value now, so it cannot trip anything else up later
    try { localStorage.setItem("codex.recent", "[]"); } catch (e) {}
    return [];
  })(),
  pushRecent(id) {
    this.recent = [id, ...this.recent.filter(x => x !== id)].slice(0, 8);
    try { localStorage.setItem("codex.recent", JSON.stringify(this.recent)); } catch (e) {}
  }
};

/* ============================================================
   IMPORTED NOTES  (user-added canon, indexed like everything else)
   Entries are rebuilt from ORIG_ENTRIES + notesCache on every
   refresh, minus whatever's in CodexExtra.hidden; this is what
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
    // a brief written at import time wins over the raw first line
    summary: n.brief || text.replace(/\s+/g, " ").slice(0, 180),
    brief: n.brief || "",
    category: n.category || "My Notes", type: "note",
    wordcount: text.split(/\s+/).filter(Boolean).length,
    images: n.images || [], links: n.links || [], source: null, _user: true,
    // false when "Let the assistant read it" was switched off at import
    aiRead: n.aiRead === false ? false : true,
    // filed for its names alone: contributes to the Name Index and
    // cross-linking, but is not a browsable entry
    namesOnly: !!n.namesOnly,
  };
}
/* A short brief written once at import: the most descriptive sentences
   from the top of the text, not a truncation of its first line. */
function briefOf(text) {
  const sents = sentencesOf(text || "").filter(s => s.length > 40 && s.length < 300);
  if (!sents.length) return "";
  const scored = sents.slice(0, 25).map((s, i) => ({
    s: s.trim(), score: (DESCRIPTIVE.test(s) ? 1.5 : 0) - i * 0.03,
  })).sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(x => x.s).join(" ");
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
  const visibleNotes = noteEntries.filter(e => !hidden.has(e.id) && !e.namesOnly);
  DB.entries = base.filter(e => !hidden.has(e.id)).concat(visibleNotes);
  DB.entities = baseEntities.slice();
  visibleNotes.forEach(e => { if (e.title && !DB.entities.includes(e.title)) DB.entities.push(e.title); });
  // names-only imports never become entries, but their names still count
  noteEntries.filter(e => e.namesOnly && !hidden.has(e.id)).forEach(e => {
    entitiesIn(e.text).forEach(n => { if (!DB.entities.includes(n)) DB.entities.push(n); });
  });
  const excludedNames = window.CodexExtra ? CodexExtra.excludedNames : new Set();
  if (excludedNames.size) DB.entities = DB.entities.filter(n => !excludedNames.has(n));
  DB.stats.entries = DB.entries.length;
  DB.stats.entities = DB.entities.length;
  DB.stats.images = hasCanon ? (window.WORLD_DB && window.WORLD_DB.stats && window.WORLD_DB.stats.images) || 0 : 0;
}
async function addNote(title, text, images, category, opts) {
  opts = opts || {};
  const note = {
    id: "note-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    title: title || "Untitled note", text: text || "", images: images || [], category: category || "My Notes",
    created: Date.now(), updated: Date.now(),
  };
  if (opts.summarize) note.brief = briefOf(note.text);
  if (opts.aiRead === false) note.aiRead = false;
  if (opts.namesOnly) note.namesOnly = true;
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

  // The Community Space is a place, not a page: publishing, readers and
  // comments have nothing to do with the filing cabinet, and mixing them
  // into one sidebar made both harder to read. In that mode the whole
  // left rail changes, with one way back out at the top.
  if (inSpace()) { buildSpaceNav(nav); return; }

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
      <div class="nav-item" data-route="#/docs">${svg("doc")}<span>Books</span></div>
      <div class="nav-item" data-route="#/read">${svg("read")}<span>Read Through</span></div>
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
    toast("Section added; file notes into it from Add Lore");
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
  window.CodexSound && CodexSound.onPage();
  if (!h.startsWith("#/doc/")) setAssistantContext(null);
  $$("#nav .nav-item[data-route]").forEach(el =>
    el.classList.toggle("active", el.dataset.route === h ||
      (el.dataset.route !== "#/" && h.startsWith(el.dataset.route))));
}

/* ============================================================
   TEXT UTILITIES; sentences, summaries, facts, relationships
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
      facts.push(`<dt>${esc(k)}</dt><dd>${v ? crossLink(esc(v)) : "<span class='faint'>·</span>"}</dd>`); continue;
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
function mentionsOf(name, excludeId, forAssistant) {
  const n = name.toLowerCase();
  return DB.entries.filter(e => e.id !== excludeId && (e.type === "pdf" || e.type === "note") &&
    e._hay.includes(n) && (!forAssistant || readableByAI(e)));
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
  renderBrowse(canonicalCat(cat));
}
/* A hand-typed or older bookmark may differ only in case ("#/browse/characters"),
   which would otherwise render a real collection as empty. Match the stored
   spelling when one exists and keep the argument as-is when it doesn't. */
function canonicalCat(cat) {
  if (!cat) return cat;
  const want = cat.toLowerCase();
  const hit = DB.entries.find(e => e.category && e.category.toLowerCase() === want);
  return hit ? hit.category : cat;
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

/* ---------- writing a note ----------
   A note you just made had nowhere to type: the entry page is a reading
   view, and nothing on it edited the title or the body. So a brand new
   note opened as a blank page with a Delete button and no way in.
   Notes you wrote now have an editor, and an empty one opens straight
   into it; there is nothing to read yet. */
let entryEditing = null;

function noteEditor(e) {
  const cats = categoriesList();
  return `<div class="note-edit">
    <div class="page-kicker">${e.title && e.text ? "Editing" : "A new note"}</div>
    <input class="note-edit-title" id="neTitle" value="${esc(e.title === "Untitled note" ? "" : e.title)}"
      placeholder="Give it a title" maxlength="200">
    <textarea class="note-edit-body" id="neBody" rows="18"
      placeholder="Write whatever this is. Any name you use more than once becomes a cross reference automatically.">${esc(e.text || "")}</textarea>
    <div class="note-edit-row">
      <label class="ne-field"><span>Section</span>
        <select class="folder-select" id="neCat">
          ${cats.map(c => `<option value="${esc(c.name)}" ${e.category === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select></label>
      <label class="ne-field grow"><span>Links, one per line</span>
        <textarea class="note-edit-links" id="neLinks" rows="2"
          placeholder="https://…">${esc((e.links || []).join("\n"))}</textarea></label>
    </div>
    <div class="note-edit-acts">
      <button class="btn" id="neSave">Save note</button>
      <button class="btn ghost" id="neCancel">Cancel</button>
      <span class="ne-count" id="neCount"></span>
    </div>
    <p class="faint" style="margin:10px 0 0">Saved to this browser as you confirm.
      Nothing is uploaded.</p>
  </div>`;
}

function bindNoteEditor(e) {
  const title = $("#neTitle"), body = $("#neBody"), count = $("#neCount");
  const tally = () => {
    const n = (body.value || "").trim().split(/\s+/).filter(Boolean).length;
    count.textContent = n ? n.toLocaleString() + (n === 1 ? " word" : " words") : "";
  };
  body.oninput = tally; tally();
  (title.value ? body : title).focus();

  // Ctrl/Cmd+S and Ctrl/Cmd+Enter both save, because both are muscle memory
  const maybeSave = ev => {
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "s" || ev.key === "Enter")) { ev.preventDefault(); save(); }
  };
  title.onkeydown = body.onkeydown = maybeSave;

  const save = async () => {
    const t = title.value.trim(), b = body.value;
    if (!t && !b.trim()) { toast("Give it a title or something to say"); return; }
    await updateNote(e.id, {
      title: t || "Untitled note",
      text: b,
      category: $("#neCat").value,
      links: $("#neLinks").value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 20),
      updated: Date.now(),
      wordcount: b.trim() ? b.trim().split(/\s+/).filter(Boolean).length : 0,
    });
    entryEditing = null;
    toast("Note saved");
    viewEntry(e.id);
  };
  $("#neSave").onclick = save;
  $("#neCancel").onclick = () => {
    entryEditing = null;
    // an untouched blank note has nothing worth keeping a page for
    if (!e.text && (!e.title || e.title === "Untitled note")) { location.hash = "#/browse/" + encodeURIComponent(e.category); return; }
    viewEntry(e.id);
  };
}

function viewEntry(id) {
  const e = byId[id];
  if (!e) { view.innerHTML = `<div class="wrap"><p>Entry not found.</p></div>`; return; }
  store.pushRecent(id);
  if (e.type === "gallery") return viewGallery(e);

  // your own note, empty or explicitly being edited, gets the editor
  const blank = e._user && !String(e.text || "").trim() && (!e.title || e.title === "Untitled note");
  if (e._user && (entryEditing === id || blank)) {
    entryEditing = id;
    view.innerHTML = `<div class="wrap">${noteEditor(e)}</div>`;
    bindNoteEditor(e);
    return;
  }

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

  const facts = factsOf(e, 8);
  const flags = entryFlags(e);
  const banner = (e._user && e.banner) || null;
  view.innerHTML = `<div class="entry-page">
    <div class="entry-banner${banner ? " has" : ""}" id="entryBanner">
      ${banner ? `<img src="${esc(banner)}" alt="">` : `<span class="eb-hint">Drop a banner image</span>`}
      <input type="file" id="entryBannerFile" accept="image/*" hidden>
    </div>
    <div class="entry-top">
      <div>
        <div class="page-kicker">${catDot(e.category)} ${esc(e.category)}</div>
        <h1 class="display entry-title">${esc(e.title)}</h1>
      </div>
      <div class="entry-when">${e.wordcount ? e.wordcount.toLocaleString() + " words" : ""}${
        backs.length ? ` · ${backs.length} cross-reference${backs.length === 1 ? "" : "s"}` : ""}</div>
    </div>
    <div class="entry-actions">
      ${e._user ? `<button class="btn sm" id="editEntry">Edit this note</button>` : ""}
      <button class="btn ${e._user ? "ghost " : ""}sm" id="askAssistant">✦ Ask about this</button>
      ${pdfLink}${fileLink}
      <button class="btn ghost sm" id="copyText">Copy text</button>
      <button class="btn ghost sm" id="readAloud">Read aloud</button>
      ${catSelector}
      <button class="btn ghost sm" id="delEntry">Delete</button>
    </div>

    <div class="entry-grid">
      <div class="entry-main reading">
        ${body}
        ${linksHtml}
        ${(e.images || []).length ? `<div class="rule-head mt"><span class="k">Plates</span><span class="hr"></span>
          <span class="meta">${e.images.length}</span></div>${relImgs}` : relImgs}
      </div>
      <aside class="entry-side">
        ${facts.length ? `<div class="gold-card">
          <div class="gold-card-head">✦ At a glance ✦</div>
          ${facts.map(f => `<div class="glance-row"><span class="gk">${esc(f.k)}</span>
            <span class="gv">${crossLink(esc(f.v))}</span></div>`).join("")}
        </div>` : ""}

        ${flags.length ? `<div class="flag-card">
          <div class="rule-head"><span class="k">Continuity flags · ${flags.length}</span><span class="hr"></span></div>
          ${flags.map(f => `<div class="flag-row"><span class="fw">${esc(f.what)}</span>
            <span class="fwhere">${esc(f.where)}</span></div>`).join("")}
          <button class="a-chip" id="flagCheck">Check this entry</button>
        </div>` : ""}

        <div class="margin-card">
          <div class="rule-head"><span class="k">Your margin notes</span><span class="hr"></span>
            <button class="a-chip" id="addMargin">+ Note</button></div>
          <div id="marginList"></div>
          <p class="faint margin-foot">Notes stay out of the entry itself, and out of exports.</p>
        </div>

        ${backs.length ? `<div>
          <div class="rule-head"><span class="k">Mentioned in</span><span class="hr"></span>
            <span class="meta">${backs.length}</span></div>
          ${backs.slice(0, 12).map(b => `<a class="back-row" href="#/entry/${b.id}">
            <span class="br-glyph">✧</span>
            <span class="br-body">${esc(b.title)}<span class="br-where">${esc(b.category)}</span></span></a>`).join("")}
        </div>` : ""}
      </aside>
    </div>
  </div>`;

  $$(".xref", view).forEach(x => x.onclick = () => location.hash = "#/subject/" + encodeURIComponent(x.dataset.subject));
  bindGallery();
  bindBanner(e);
  renderMargins(e.id);
  $("#addMargin").onclick = () => addMargin(e.id);
  if ($("#flagCheck")) $("#flagCheck").onclick = () => { openAssistant(); askAssistant("check consistency for " + e.title); };
  $("#askAssistant").onclick = () => { openAssistant(); assistantLookup(e.title); };
  if ($("#editEntry")) $("#editEntry").onclick = () => { entryEditing = e.id; viewEntry(e.id); };
  $("#copyText").onclick = () => { navigator.clipboard.writeText(e.text); toast("Copied to clipboard"); };
  $("#readAloud").onclick = () => { window.CodexSpeech ? CodexSpeech.read(e.text || e.title) : toast("Speech not supported here"); };
  $("#delEntry").onclick = async () => {
    if (!confirm(`Delete "${e.title}"? You can restore it anytime from Settings → Deleted entries.`)) return;
    if (e._user) await deleteNote(e.id); else { await CodexExtra.hide([e.id]); refresh(); }
    location.hash = "#/browse/" + encodeURIComponent(e.category);
  };
  if ($("#entryCatMove")) $("#entryCatMove").onchange = async ev => { await updateNote(e.id, { category: ev.target.value }); toast("Moved to " + ev.target.value); };
}

/* subject hub; now leads with a synthesized summary */
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
function galleryHtml(images, variant) {
  return `<div class="gallery${variant ? " " + variant : ""}">` + images.map(p =>
    `<figure data-full="${imgSrc(p)}">
       <img loading="lazy" src="${imgSrc(p)}" alt="${esc((p.split('/').pop() || '').slice(0, 60))}">
       <figcaption>${esc(p.split('/').pop() || "image")}</figcaption>
     </figure>`).join("") + `</div>`;
}
/* A banner belongs to an entry you wrote; the shipped canon is read-only
   so there is nowhere to keep one. */
function bindBanner(e) {
  const box = $("#entryBanner"), input = $("#entryBannerFile");
  if (!box) return;
  if (!e._user) { box.remove(); return; }
  const take = async (file) => {
    if (!file) return;
    try {
      const url = await window.CodexImg.fileToScaledDataURL(file, 1600, 0.82);
      await updateNote(e.id, { banner: url });
      toast("Banner set");
      viewEntry(e.id);
    } catch (err) { toast("Couldn't read that image"); }
  };
  box.onclick = () => input.click();
  input.onchange = () => take(input.files[0]);
  box.ondragover = ev => { ev.preventDefault(); box.classList.add("over"); };
  box.ondragleave = () => box.classList.remove("over");
  box.ondrop = ev => { ev.preventDefault(); box.classList.remove("over"); take(ev.dataTransfer.files[0]); };
}

/* ---------- continuity flags on an entry ----------
   Cheap, specific checks that can be stated plainly. Anything vaguer
   than this belongs to the assistant's full consistency pass, which
   the button beside the list opens. */
function entryFlags(e) {
  const out = [];
  const text = e.text || "";

  // Collect every "Key: value" line, then decide whether this entry is
  // about one subject or is a compendium. A roster of fifty characters
  // legitimately repeats Born and Died fifty times; calling that a
  // contradiction would bury the real ones in noise.
  const byKey = {};
  text.split("\n").forEach(line => {
    if (!FACT_LINE.test(line)) return;
    const i = line.indexOf(":");
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (!v) return;
    (byKey[k] = byKey[k] || []).push(v);
  });
  const isCompendium = Object.keys(byKey).some(k => byKey[k].length > 2);
  if (!isCompendium) {
    Object.keys(byKey).forEach(k => {
      const vals = Array.from(new Set(byKey[k]));
      if (vals.length > 1) out.push({ what: `Two values given for "${k}"`, where: vals.slice(0, 2).join(" / ") });
    });
  }
  // a year written both BR and AR for the same event line
  const eras = text.match(/\b\d{1,4}\s?(BR|AR)\b/gi) || [];
  const byYear = {};
  eras.forEach(tok => {
    const y = tok.match(/\d+/)[0], era = /AR/i.test(tok) ? "AR" : "BR";
    if (byYear[y] && byYear[y] !== era) out.push({ what: `Year ${y} appears as both eras`, where: "BR and AR" });
    else byYear[y] = era;
  });
  return out.slice(0, 4);
}

/* ---------- margin notes ----------
   Kept in their own store so they never enter the entry text, search
   index, exports, or anything the assistant reads. */
async function loadMargins(entryId) {
  if (!window.CodexStore) return [];
  try {
    return (await CodexStore.all("margins")).filter(m => m.entryId === entryId).sort((a, b) => a.at - b.at);
  } catch (err) { return []; }
}
async function renderMargins(entryId) {
  const el = $("#marginList");
  if (!el) return;
  const list = await loadMargins(entryId);
  el.innerHTML = list.length ? list.map((m, i) => `<div class="margin-row${m.done ? " done" : ""}">
    <div class="mr-top"><span class="mr-n">${i + 1}</span><span class="mr-text">${esc(m.text)}</span></div>
    <div class="mr-foot"><span class="mr-when">${new Date(m.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
      <span class="hr"></span>
      <button class="a-chip" data-mdone="${esc(m.id)}">${m.done ? "Reopen" : "Resolve"}</button>
      <button class="a-chip" data-mdel="${esc(m.id)}">Remove</button></div>
  </div>`).join("") : `<p class="faint" style="font-size:13px">Nothing noted yet.</p>`;
  $$("[data-mdone]", el).forEach(b => b.onclick = async () => {
    const m = await CodexStore.get("margins", b.dataset.mdone);
    if (m) { m.done = !m.done; await CodexStore.put("margins", m); renderMargins(entryId); }
  });
  $$("[data-mdel]", el).forEach(b => b.onclick = async () => {
    await CodexStore.del("margins", b.dataset.mdel);
    renderMargins(entryId);
  });
}
async function addMargin(entryId) {
  const text = prompt("A note to yourself about this entry:");
  if (!text || !text.trim()) return;
  await CodexStore.put("margins", {
    id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    entryId, text: text.trim(), at: Date.now(), done: false,
  });
  renderMargins(entryId);
}

function viewGallery(e) {
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${catDot(e.category)} Gallery</div>
    <h1>${esc(e.title)}</h1><p class="muted">${e.images.length} images</p>
    ${galleryHtml(e.images, "atlas")}
  </div>`;
  bindGallery();
}
let mapsSelectMode = false, mapsSelected = new Set();
function viewMaps() {
  mapsSelectMode = false; mapsSelected = new Set();
  renderMaps();
}
const ATLAS_FILTERS = ["Everything", "Galleries", "Maps", "Flags & sigils"];
let atlasFilter = "Everything";

function renderMaps() {
  const galleries = DB.entries.filter(e => e.type === "gallery");
  const mapDocs = DB.entries.filter(e => e.category === "Maps & Locations" && e.type === "pdf");
  let items = galleries.concat(mapDocs);
  // filters read the plate's own words, so they stay right as the atlas grows
  if (atlasFilter === "Galleries") items = items.filter(e => e.type === "gallery");
  else if (atlasFilter === "Maps") items = items.filter(e => /\bmap\b|\batlas\b|\bregion\b/i.test(e.title));
  else if (atlasFilter === "Flags & sigils") items = items.filter(e => /\bflag|sigil|banner|crest|arms\b/i.test(e.title + " " + (e.summary || "")));
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

  const plates = items.reduce((n, e) => n + (e.type === "gallery" ? e.images.length : 1), 0);
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Maps, flags &amp; visual reference · ${plates} plate${plates === 1 ? "" : "s"}</div>
    <h1 class="display">The Atlas</h1>
    <div class="atlas-bar">
      ${ATLAS_FILTERS.map(f => `<button class="a-chip${atlasFilter === f ? " on" : ""}" data-afilter="${esc(f)}">${esc(f)}</button>`).join("")}
      <span class="hr"></span>
      ${items.length ? `<button class="a-chip" id="toggleSelect">${mapsSelectMode ? "Cancel" : "Select"}</button>` : ""}
      <button class="a-chip" id="atlasAdd">+ Add plates</button>
    </div>
    ${mapsSelectMode ? `<div class="select-bar">
      <label class="sel-all"><input type="checkbox" id="selAll" ${items.length && mapsSelected.size === items.length ? "checked" : ""}> Select all</label>
      <span class="faint" id="selCount">${mapsSelected.size} selected</span>
      <button class="btn danger sm" id="deleteSelected" ${mapsSelected.size ? "" : "disabled"}>Delete selected</button>
    </div>` : ""}
    <div class="list-grid">${cards || `<div class="empty-state">Nothing here yet. Drop maps and plates in from Add lore.</div>`}</div>
  </div>`;
  $$("[data-afilter]", view).forEach(b => b.onclick = () => { atlasFilter = b.dataset.afilter; renderMaps(); });
  $("#atlasAdd").onclick = () => location.hash = "#/import";
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
  // every section is a valid filing destination; the built-in canon collections,
  // "My Notes", and any custom sections you've made with the + button
  const allCats = categoriesList().map(c => c.name);
  const custom = customCats();
  const recent = notesCache.slice(0, 5);
  view.innerHTML = `<div class="wrap wide add-lore">
    <div class="page-kicker">Import PDF · Word · Markdown · paste · dictate</div>
    <h1 class="display">Add lore</h1>

    <div class="dropzone" id="dropzone">
      <div class="dz-inner">
        <div class="ornament">✦ ✧ ✦</div>
        <div class="dz-title">Drop files here</div>
        <div class="dz-sub">PDFs come in with both their text and page images · .docx · .txt · .md · images
          · a backup <b>.json</b> restores everything</div>
        <div class="dz-actions">
          <button class="btn sm" id="chooseFiles">Choose files</button>
          <button class="btn ghost sm" id="dictateLore">✧ Dictate instead</button>
        </div>
      </div>
      <input type="file" id="fileInput" multiple accept=".txt,.md,.markdown,.json,.pdf,.docx,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,image/*" hidden>
    </div>
    <div class="import-progress" id="importProgress" hidden></div>

    <div class="lore-grid">
      <div>
        <div class="rule-head"><span class="k">Or paste writing</span><span class="hr"></span></div>
        <input class="import-title" id="pasteTitle" placeholder="Give it a title; a character, a place, a note">
        <textarea class="import-body" id="pasteBody" placeholder="Paste a chapter, a note, a scrap of dialogue. It is indexed the moment you save it; searchable, cross-linked, and readable by the assistant."></textarea>
      </div>
      <div class="lore-side">
        <div class="rule-head"><span class="k">File it under</span><span class="hr"></span></div>
        <select class="folder-select" id="pasteCat" title="Which section this gets filed under">
          ${allCats.map(c => `<option value="${esc(c)}" ${c === "My Notes" ? "selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
        <div class="rule-head mt"><span class="k">On import</span><span class="hr"></span></div>
        <label class="lore-opt"><input type="checkbox" id="optSummarize" checked>
          <span>Write a brief<em>Three telling sentences, kept at the top of the entry.</em></span></label>
        <label class="lore-opt"><input type="checkbox" id="optAiRead" checked>
          <span>Let the assistant read it<em>Off keeps it out of answers. It stays searchable either way.</em></span></label>
        <label class="lore-opt"><input type="checkbox" id="optNamesOnly">
          <span>Names only<em>Harvest the names for the Name Index and cross-linking, without adding a
            browsable entry. Good for a cast list or a glossary dump.</em></span></label>
        <button class="btn" id="addPaste" style="width:100%;margin-top:14px">Save &amp; index</button>
        ${custom.length ? "" : `<p class="faint" style="margin-top:10px;font-size:12px">Want a section of your own?
          Use the <b>+</b> beside "The Canon" in the sidebar; it appears in this list too.</p>`}
      </div>
    </div>

    <div id="importLog" class="import-log"></div>

    ${recent.length ? `<div class="rule-head mt"><span class="k">Recent imports</span><span class="hr"></span>
      <span class="meta">${notesCache.length} added in this workspace</span></div>
      <div class="recent-imports">${recent.map(n => {
        const words = (n.text || "").split(/\s+/).filter(Boolean).length;
        return `<a class="ri-row" href="#/entry/${encodeURIComponent(n.id)}">
          <span class="ri-kind">${esc(n.category || "My Notes")}</span>
          <span class="ri-name">${esc(n.title || "Untitled")}</span>
          <span class="ri-meta">${words.toLocaleString()} words${n.brief ? " · brief written" : ""}${n.aiRead === false ? " · assistant off" : ""}</span>
          <span class="ri-open">Open</span></a>`;
      }).join("")}</div>` : ""}
  </div>`;

  const dz = $("#dropzone"), fi = $("#fileInput");
  const openPicker = e => { e && e.stopPropagation(); fi.click(); };
  dz.onclick = openPicker;
  $("#chooseFiles").onclick = openPicker;
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); handleFiles(e.dataTransfer.files); };
  fi.onchange = () => handleFiles(fi.files);

  $("#dictateLore").onclick = e => {
    e.stopPropagation();
    if (!window.CodexSpeech || !CodexSpeech.dictate) return toast("Dictation isn't supported in this browser");
    const btn = $("#dictateLore"), body = $("#pasteBody");
    btn.classList.add("active");
    body.focus();
    CodexSpeech.dictate(
      text => { body.value = (body.value + " " + text).trim(); },
      () => btn.classList.remove("active"));
  };

  $("#addPaste").onclick = async () => {
    const t = $("#pasteTitle").value.trim(), b = $("#pasteBody").value.trim(), c = $("#pasteCat").value;
    if (!b) { toast("Nothing to add yet"); return; }
    const namesOnly = $("#optNamesOnly").checked;
    const note = await addNote(t || ("Note " + new Date().toLocaleDateString()), b, [], c,
      { summarize: !namesOnly && $("#optSummarize").checked,
        aiRead: namesOnly ? false : $("#optAiRead").checked,
        namesOnly });
    if (namesOnly) {
      const found = Array.from(entitiesIn(b)).length;
      logImport(`Harvested names from <b>${esc(note.title)}</b>; ${found} recognised, no entry filed.`, c);
      $("#pasteTitle").value = ""; $("#pasteBody").value = "";
      refresh();
      return;
    }
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
    importProgress(`Reading ${file.name}; page ${i} of ${maxPages}…`);
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

/* Word (.docx) import via mammoth; pulls text and any embedded images. */
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
      <h3>${esc(e.title)}</h3><p>${e.type === "gallery" ? e.images.length + " images" : snippet(e.text, q.split(/\s+/)[0], 200)}</p>
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
/* "Let the assistant read it", switched off at import, has to hold on
   every path into an entry; not just full-text search. These helpers
   take forAssistant so the same lookups can stay complete for the
   pages you browse while staying closed to the assistant. */
function readableByAI(e) { return e.aiRead !== false; }
/* the one pool every assistant answer is built from */
function aiEntries() { return DB.entries.filter(readableByAI); }
function aiBlockedTitles() {
  const s = new Set();
  DB.entries.forEach(e => { if (e.aiRead === false) s.add(e.title.toLowerCase()); });
  return s;
}

function matchNamedSubject(q, forAssistant) {
  const ql = q.trim().toLowerCase();
  const pool = forAssistant ? DB.entries.filter(readableByAI) : DB.entries;
  const entry = pool.find(e => (e.type === "pdf" || e.type === "note") && e.title.toLowerCase() === ql);
  if (entry) return entry.title;
  const blocked = forAssistant ? aiBlockedTitles() : null;
  const ent = DB.entities.find(n => n.toLowerCase() === ql && !(blocked && blocked.has(n.toLowerCase())));
  if (ent) return ent;
  // "House X" convenience
  const h = pool.find(e => e.title.toLowerCase() === "house " + ql);
  if (h) return h.title;
  return null;
}

/* ============================================================
   GLOBAL SEARCH (overlay)
   ============================================================ */
function snippet(text, q, len = 160) {
  const t = (text || "").replace(/\s+/g, " ");
  const i = t.toLowerCase().indexOf((q || "").toLowerCase());
  if (i < 0) return esc(trimToWords(t.slice(0, len), false, len < t.length));
  let start = Math.max(0, i - len / 3 | 0);
  const seg = trimToWords(t.slice(start, start + len), start > 0, start + len < t.length);
  return esc(seg).replace(new RegExp("(" + (q || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
}
/* Slicing a string at a character offset lands mid-word and reads as a
   typo, so snap both ends to whitespace and mark where text was cut. */
function trimToWords(seg, cutHead, cutTail) {
  if (cutHead) { const s = seg.indexOf(" "); if (s > -1 && s < 24) seg = seg.slice(s + 1); }
  if (cutTail) { const e = seg.lastIndexOf(" "); if (e > seg.length - 24) seg = seg.slice(0, e); }
  return (cutHead ? "…" : "") + seg.trim() + (cutTail ? "…" : "");
}
/* Search reaches everything; the assistant only reads what you let it.
   Passing forAssistant=true honours the "Let the assistant read it"
   switch set when the entry was imported. */
function searchAll(q, forAssistant) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const terms = q.split(/\s+/); const res = [];
  const pool = forAssistant ? DB.entries.filter(e => e.aiRead !== false) : DB.entries;
  for (const e of pool) {
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
  if (!q.trim()) {
    box.innerHTML = `<div class="sr-empty">Start typing. Every entry, note, document and caption is searched at once.</div>`;
    searchList = []; return;
  }
  const results = searchAll(q);
  if (!results.length) {
    box.innerHTML = `<div class="sr-empty">Nothing in the canon mentions “${esc(q)}” yet.
      It will appear here the moment you write it.</div>`;
    searchList = []; return;
  }

  /* The Brief sits above the results: what your own passages say about
     this, assembled before you have to open anything. */
  const brief = briefTextFor(q, results);
  let html = brief ? `<div class="sr-brief">
      <div class="sr-brief-k">✦ Brief</div>
      <p>${brief}</p>
      <a class="sr-fulllink" href="#/search/${encodeURIComponent(q)}">Open full results →</a>
    </div>` : "";

  const flat = [];
  const term = q.trim().split(/\s+/)[0];
  results.forEach(e => {
    const idx = flat.length; flat.push(e);
    const matches = countMatches(e, q);
    html += `<a class="sr-item" data-i="${idx}" href="#/entry/${e.id}">
      <span class="sr-kind">${esc(e.category)}</span>
      <span class="sr-body">
        <span class="sr-title">${esc(e.title)}</span>
        <span class="sr-snip">${e.type === "gallery" ? e.images.length + " images" : snippet(e.text, term, 150)}</span>
        <span class="sr-matches">${matches} mention${matches === 1 ? "" : "s"}${e.aiRead === false ? " · assistant off" : ""}</span>
      </span></a>`;
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

/* how many times the query actually appears in an entry */
function countMatches(e, q) {
  const hay = e._hay || "";
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  return Math.max(...terms.map(t => hay.split(t).length - 1));
}

/* Plain sentences for the Brief band. Reuses the summary machinery but
   returns text, since the band has its own frame. */
function briefTextFor(q, results) {
  const named = matchNamedSubject(q);
  if (named) {
    const sents = topicSummary(named, 3);        // returns sentences, not a string
    if (sents.length) return esc(sents.join(" "));
  }
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const cands = [];
  results.slice(0, 8).forEach((e, ei) => {
    sentencesOf(e.text).forEach((s, idx) => {
      const sl = s.toLowerCase();
      const hit = terms.filter(t => sl.includes(t)).length;
      if (hit && s.length > 30 && s.length < 320) {
        cands.push({ s: s.trim(), score: hit * 2 - ei * 0.2 - idx * 0.01 + (DESCRIPTIVE.test(s) ? 0.5 : 0) });
      }
    });
  });
  cands.sort((a, b) => b.score - a.score);
  const out = [], seen = new Set();
  for (const c of cands) {
    const k = c.s.slice(0, 44).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(c.s);
    if (out.length >= 3) break;
  }
  return out.length ? esc(out.join(" ")) : "";
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
   ASSISTANT; local canon retrieval + summaries + Q&A
   ============================================================ */
function bestEntryFor(name, forAssistant) {
  const n = name.toLowerCase();
  const pool = forAssistant ? DB.entries.filter(readableByAI) : DB.entries;
  let exact = pool.find(e => (e.type === "pdf" || e.type === "note") && e.title.toLowerCase() === n);
  if (exact) return exact;
  let houses = pool.find(e => (e.type === "pdf" || e.type === "note") && e.title.toLowerCase() === "house " + n);
  if (houses) return houses;
  const hits = mentionsOf(name, null, forAssistant);
  if (!hits.length) return null;
  const metaPenalty = e => (e.category === "Canon & Continuity" || e.category === "Reference & Lexicon") ? 1 : 0;
  hits.sort((a, b) => metaPenalty(a) - metaPenalty(b) || (b._hay.split(n).length) - (a._hay.split(n).length));
  return hits[0];
}

/* rich blurb: a natural-reading answer (not a raw source quote), + facts + related + sources */
function blurbCard(name) {
  const e = bestEntryFor(name, true);
  if (!e) return `<div class="blurb"><div class="bt">${esc(name)}</div>
    <div class="bs faint">No canon entry yet; this name isn't in your lore.</div></div>`;
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
  const others = mentionsOf(name, e.id, true).length;
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
  const results = searchAll(q, true);
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
  // strip trailing filler that isn't actually a topic; "how many houses ARE THERE", "characters DO I HAVE"
  after = after.replace(/\s*(are there|is there|do i have|does it have|exist|are in my canon|do you have|are in the canon|are there\?)\s*$/i, "").trim();
  const filterTerm = after;
  let pool = aiEntries().filter(e => e.category === kind.cat && (e.type === "pdf" || e.type === "note"));
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
  const pool = aiEntries().filter(e => e.category === kind.cat && (e.type === "pdf" || e.type === "note"));
  if (!pool.length) return `<div class="assistant-hint">I don't have any ${esc(kind.label)} entries to pick from yet.</div>`;
  const scored = pool.map(e => ({ e, score: mentionsOf(e.title, e.id, true).length + (e.wordcount || 0) / 200 }));
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0].e;
  const sents = topicSummary(pick.title, 2);
  return `<div class="ans-label">My pick, going by what's most woven through your canon</div>
    <div class="blurb">
      <div class="bt">${catDot(pick.category)} ${esc(pick.title)}</div>
      <div class="bs">${esc(sents.join(" ")) || esc(pick.summary || "")}</div>
      <div class="bl">Reasoning: <b>${esc(pick.title)}</b> turns up across ${scored[0].score >= 1 ? Math.round(scored[0].score) : "several"} other entries; more cross-referenced than the rest of your ${esc(kind.label)} entries, which usually means it's load-bearing for the story.</div>
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
  // canon-audit/reference docs that mention it; NOT every entry that
  // happens to name-drop it in passing, which would compare apples to oranges
  const sl = subject.toLowerCase();
  const pool = subject
    ? aiEntries().filter(e => (e.type === "pdf" || e.type === "note") &&
        (e.title.toLowerCase().includes(sl) ||
         ((e.category === "Canon & Continuity" || e.category === "Reference & Lexicon") && e._hay.includes(sl))))
    : aiEntries().filter(e => e.type === "pdf" || e.type === "note");
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
    return `<div class="assistant-hint">${svg("spark")} Checked ${uniq.length} ${uniq.length === 1 ? "entry" : "entries"}${subject ? ` touching "${esc(subject)}"` : ""};
      no entries declare different values for the same fact. That doesn't guarantee consistency (I can only compare
      facts written as "Key: Value" lines), but nothing obvious conflicts.</div>`;
  }
  return `<div class="ans-label">Possible inconsistenc${conflicts.length === 1 ? "y" : "ies"}; ${conflicts.length} fact${conflicts.length === 1 ? "" : "s"} where entries disagree</div>
    ${conflicts.slice(0, 8).map(list => `<div class="blurb">
      <div class="bt">${esc(list[0].k)}</div>
      ${list.map(x => `<div class="bl"><b>${esc(x.v)}</b>; <a href="#/entry/${x.entry.id}">${esc(x.entry.title)}</a></div>`).join("")}
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
  if (words.length < 8) return `<div class="assistant-hint">Not much written yet; give it a few more sentences and ask again.</div>`;
  const sents = sentencesOf(text).filter(s => s.length > 15);
  const scored = sents.map((s, i) => ({ s, score: (i < 3 ? 1 : 0) + (DESCRIPTIVE.test(s) ? 0.6 : 0) + Math.min(3, entitiesIn(s).size) * 0.3 }));
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, 4).map(x => x.s);
  const names = Array.from(entitiesIn(text)).slice(0, 8);
  return `<div class="ans-label">Summary of “${esc(cur.title() || "this document")}”; ${words.length} words</div>
    <div class="blurb"><div class="bs">${picked.map(esc).join(" ")}</div>
    ${names.length ? `<div class="brel">${names.map(n => `<span class="chip" data-subject="${esc(n)}">${esc(n)}</span>`).join("")}</div>` : ""}
    </div>`;
}

/* Works out an answer and hands back the pieces the rail needs to
   frame it: the answer body, the entries it leaned on, a plain-English
   grounding note, and follow-ups that are actually answerable.
   Called with structured=false it keeps the old behaviour of writing
   straight into the panel, which the in-document scanner still uses. */
function assistantLookup(q, structured) {
  const body = $("#assistantBody");
  q = (q || "").trim();
  if (!q) { if (!structured) assistantIdle(); return null; }
  assistantHistory.push(q);

  let html = null;
  // reports first: they are explicit commands, so they should win over a
  // name that happens to look similar
  const rep = tryReport(q); if (rep) html = rep;
  if (!html) { const sum = trySummarizeDoc(q); if (sum) html = sum; }
  if (!html) { const con = tryConsistency(q); if (con) html = con; }
  if (!html) { const cmd = tryCommand(q); if (cmd) html = cmd; }
  if (!html) { const op = tryOpinion(q); if (op) html = op; }
  if (!html) {
    const named = matchNamedSubject(q, true) || partialEntity(q, true);
    if (named) html = blurbCard(named);
  }
  if (!html && q.split(/\s+/).length >= 2) html = assistantAnswer(q);
  if (!html && searchAll(q, true).length) html = assistantAnswer(q);
  if (!html) {
    html = `<div class="assistant-hint">Nothing in your canon matches “${esc(q)}” yet.<br>Try a character, house, place, or a question.</div>`;
  }

  if (!structured) { body.innerHTML = html; bindAssistantLinks(body); return null; }

  const hits = searchAll(q, true);
  const sources = hits.slice(0, rail.length === "brief" ? 3 : 6);
  const grounded = hits.length
    ? `Grounded in ${hits.length} of your own ${hits.length === 1 ? "entry" : "entries"} · nothing invented`
    : `No matching entries · nothing invented`;
  return { html, sources, grounded, follows: followUpsFor(q, hits) };
}
function partialEntity(q, forAssistant) {
  const ql = q.toLowerCase();
  const blocked = forAssistant ? aiBlockedTitles() : null;
  const m = DB.entities.find(n => n.toLowerCase().includes(ql) && !(blocked && blocked.has(n.toLowerCase())));
  return m || null;
}
const QUICK_ACTIONS = [
  { label: "List characters", q: "list all characters" },
  { label: "List noble houses", q: "list all houses" },
  { label: "Favourite house", q: "favourite house" },
  { label: "Check consistency", q: "check consistency" },
  { label: "Summarize this document", q: "summarize this document" },
];

/* The slash commands the rail advertises. Each maps onto a phrasing
   the parser above already understands, so the menu is a shortcut to
   real behaviour rather than a second, parallel language. */
const COMMANDS = [
  { cmd: "/consistency", what: "Flag facts that disagree across entries", q: "check consistency" },
  { cmd: "/summarize", what: "Brief on this entry or open document", q: "summarize this document" },
  { cmd: "/who", what: "Everyone who appears in a subject", q: "who appears in ", open: true },
  { cmd: "/list", what: "Live list; characters in a place, houses, dates", q: "list all ", open: true },
  { cmd: "/namecheck", what: "Is this name already used?", q: "namecheck ", open: true },
  { cmd: "/whereis", what: "Every entry that mentions a name", q: "whereis ", open: true },
  { cmd: "/describe", what: "A blurb on any name in your canon", q: "describe ", open: true },
  { cmd: "/orphans", what: "Entries nothing else refers to", q: "orphans" },
  { cmd: "/unused", what: "Names indexed but used only once", q: "unused names" },
  { cmd: "/longest", what: "Your biggest entries, by words", q: "longest entries" },
  { cmd: "/recent", what: "What you touched most recently", q: "recent entries" },
  { cmd: "/wordcount", what: "Words per collection, and the total", q: "wordcount" },
];

/* ---------- reports computed here, from your own entries ----------
   Every one of these is arithmetic over what you have already written,
   which is why they work with no key, no account and no network. They
   are the questions a writer asks about the shape of a canon rather than
   its contents: what is dangling, what did I only use once, where has
   the weight gone. */
const REPORT_TRIGGER = /^\s*(whereis|where is|describe|orphans?|unused names?|unused|longest( entries)?|recent( entries)?|wordcount|word count)\b/i;

function tryReport(q) {
  const m = REPORT_TRIGGER.exec(q);
  if (!m) return null;
  const head = m[1].toLowerCase().replace(/\s+/g, " ");
  const arg = q.slice(m.index + m[0].length).replace(/^[\s:,-]+/, "").replace(/[?.!]+$/, "").trim();
  const pool = aiEntries().filter(e => !e.namesOnly);

  const chips = list => `<div class="recog">${list.map(e =>
    `<a class="chip" href="#/entry/${e.id}">${esc(e.title)}</a>`).join("")}</div>`;
  const rows = list => list.map(r => `<div class="glance-row"><span class="gk">${esc(r.k)}</span>
    <span class="gv">${esc(r.v)}</span></div>`).join("");

  if (head === "whereis" || head === "where is") {
    if (!arg) return `<div class="assistant-hint">Give me a name: <b>/whereis Enyokia</b>.</div>`;
    const hits = mentionsOf(arg, null, true);
    if (!hits.length) return `<div class="assistant-hint">Nothing mentions “${esc(arg)}” yet.</div>`;
    return `<div class="ans-label" style="margin-bottom:6px">“${esc(arg)}” appears in ${hits.length}
      ${hits.length === 1 ? "entry" : "entries"}</div>${chips(hits.slice(0, 40))}`;
  }

  if (head === "describe") {
    if (!arg) return `<div class="assistant-hint">Give me a name: <b>/describe House Solis</b>.</div>`;
    const named = matchNamedSubject(arg, true) || partialEntity(arg, true);
    return named ? blurbCard(named)
      : `<div class="assistant-hint">“${esc(arg)}” isn't a name I've indexed yet.</div>`;
  }

  if (head === "orphans" || head === "orphan") {
    // nothing in the canon refers to these by title
    const lonely = pool.filter(e => mentionsOf(e.title, e.id, true).length === 0);
    if (!lonely.length) return `<div class="assistant-hint">Every entry is referred to somewhere else. Tidy canon.</div>`;
    return `<div class="ans-label" style="margin-bottom:6px">${lonely.length}
      ${lonely.length === 1 ? "entry is" : "entries are"} never mentioned anywhere else</div>
      ${chips(lonely.slice(0, 40))}
      <div class="a-ground">Not a fault; a note can stand alone. It is where loose threads tend to hide.</div>`;
  }

  if (head === "unused" || head === "unused name" || head === "unused names") {
    const once = DB.entities.filter(n => mentionsOf(n, null, true).length <= 1);
    if (!once.length) return `<div class="assistant-hint">Every indexed name turns up more than once.</div>`;
    return `<div class="ans-label" style="margin-bottom:6px">${once.length}
      ${once.length === 1 ? "name appears" : "names appear"} in only one place</div>
      <div class="recog">${once.slice(0, 60).map(n =>
        `<a class="chip" href="#/subject/${encodeURIComponent(n)}">${esc(n)}</a>`).join("")}</div>
      <div class="a-ground">Either they are waiting for their scene, or they were a passing mention.</div>`;
  }

  if (head === "longest" || head === "longest entries") {
    const top = pool.slice().sort((a, b) => (b.wordcount || 0) - (a.wordcount || 0)).slice(0, 12);
    if (!top.length) return `<div class="assistant-hint">Nothing written yet.</div>`;
    return `<div class="ans-label" style="margin-bottom:6px">Your longest entries</div>
      ${rows(top.map(e => ({ k: e.title, v: (e.wordcount || 0).toLocaleString() + " words" })))}`;
  }

  if (head === "recent" || head === "recent entries") {
    const ids = (window.Codex && Codex.recentIds()) || [];
    const seen = ids.map(id => byId[id]).filter(Boolean);
    if (!seen.length) return `<div class="assistant-hint">Nothing opened yet this session.</div>`;
    return `<div class="ans-label" style="margin-bottom:6px">What you opened most recently</div>${chips(seen)}`;
  }

  if (head === "wordcount" || head === "word count") {
    const per = {};
    pool.forEach(e => { per[e.category] = (per[e.category] || 0) + (e.wordcount || 0); });
    const total = Object.keys(per).reduce((n, k) => n + per[k], 0);
    if (!total) return `<div class="assistant-hint">Nothing written yet.</div>`;
    const sorted = Object.keys(per).sort((a, b) => per[b] - per[a]);
    return `<div class="ans-label" style="margin-bottom:6px">${total.toLocaleString()} words across
      ${pool.length} entries</div>
      ${rows(sorted.map(c => ({ k: c, v: per[c].toLocaleString() + " words" })))}`;
  }
  return null;
}

/* ---------- the rail's own state ---------- */
const rail = { scope: "canon", length: "brief", turns: 0 };

function assistantIdle() {
  const hist = assistantHistory.list();
  $("#assistantBody").innerHTML = `
    <div class="assistant-hint">
      I answer from your own entries and nothing else. Look up a name, ask a question in plain
      words, give me a task, or type <b>/</b> for commands.
    </div>
    <div class="a-sect">
      <div class="a-sect-k">Try one</div>
      <div class="a-chiprow">${QUICK_ACTIONS.map(a =>
        `<button class="follow-chip" data-quick="${esc(a.q)}">${esc(a.label)}</button>`).join("")}</div>
    </div>
    ${hist.length ? `<div class="a-sect">
      <div class="a-sect-k">Recent lookups</div>
      <div class="recent-list">${hist.map(h =>
        `<button class="recent-row" data-recent="${esc(h)}"><span class="rr-glyph">✧</span>${esc(h)}</button>`).join("")}</div>
    </div>` : ""}
    ${luckyLedgerHtml()}`;
  bindAssistantChips($("#assistantBody"));
}

/* Lucky's ledger, shown at the foot of the rail. Every number is a
   real count; the mood line is his voice, not a claim. */
function luckyLedgerHtml() {
  if (!window.CodexLucky) return "";
  const p = CodexLucky.persona();
  return `<div class="lucky-ledger" data-skin="${esc(CodexLucky.skin())}">
    <div class="ll-head">
      <span class="k">${esc(CodexLucky.name())}'s journal</span>
      <span class="hr"></span>
      <span class="ll-mood">${esc(p.mood)}</span>
    </div>
    <div class="ll-grid">${CodexLucky.ledger().map(l =>
      `<div><div class="ll-n">${l.n}</div><div class="ll-lab">${esc(l.label)}</div></div>`).join("")}</div>
    <div class="ll-line">${esc(p.moodLine)}</div>
  </div>`;
}

function bindAssistantChips(root) {
  $$("[data-quick]", root).forEach(c => c.onclick = () => askAssistant(c.dataset.quick));
  $$("[data-recent]", root).forEach(c => c.onclick = () => askAssistant(c.dataset.recent));
  $$("[data-follow]", root).forEach(c => c.onclick = () => askAssistant(c.dataset.follow));
}

/* ---------- one question, one answer, appended as a turn ---------- */
function askAssistant(q) {
  q = (q || "").trim();
  if (!q) return;
  const input = $("#assistantInput");
  if (input) input.value = "";
  hideCommands();
  const body = $("#assistantBody");
  if (!rail.turns) body.innerHTML = "";
  rail.turns++;

  const answer = assistantLookup(q, true);
  const turn = document.createElement("div");
  turn.className = "a-turn";
  turn.innerHTML = `
    <div class="a-you">${esc(q)}</div>
    <div class="a-them">
      ${answer.html}
      ${answer.sources.length ? `<div class="a-cites">${answer.sources.map((s, i) =>
        `<a class="a-cite" href="#/entry/${encodeURIComponent(s.id)}">
          <span class="ac-n">${i + 1}</span>
          <span class="ac-body"><span class="ac-title">${esc(s.title)}</span>
          <span class="ac-quote">${snippet(s._hay || s.body || "", q, 110) || esc(s.category)}</span></span></a>`).join("")}</div>` : ""}
      <div class="a-actions">
        <button class="a-act" data-act="copy">Copy</button>
        <button class="a-act" data-act="insert">Insert into document</button>
        <button class="a-act" data-act="read">Read aloud</button>
      </div>
      <div class="a-ground">${answer.grounded}</div>
    </div>
    ${answer.follows.length ? `<div class="a-follows">
      <div class="a-sect-k">Ask next</div>
      ${answer.follows.map(f => `<button class="follow-chip wide" data-follow="${esc(f)}">${esc(f)}</button>`).join("")}
    </div>` : ""}`;
  body.appendChild(turn);
  bindAssistantLinks(turn);
  bindAssistantChips(turn);
  bindAnswerActions(turn);
  turn.scrollIntoView({ block: "start", behavior: "smooth" });

  // With a model connected, the on-device answer above is shown at once
  // and then reasoned over: same retrieval, same citations, better prose.
  // The local answer is never thrown away, so a failure downgrades
  // instead of breaking.
  if (window.CodexAI && CodexAI.on()) enrichWithModel(turn, q, answer);
}

/* ---------- the model pass ---------- */
async function enrichWithModel(turn, q, local) {
  const them = turn.querySelector(".a-them");
  if (!them) return;
  const pending = document.createElement("div");
  pending.className = "a-model pending";
  pending.innerHTML = `<div class="am-head"><span class="am-glyph">✦</span>
    <span class="am-who">${esc(CodexAI.label())}</span>
    <span class="am-state">reading your entries…</span></div>`;
  them.insertBefore(pending, them.querySelector(".a-actions"));

  const r = await CodexAI.ask(q, local.sources || []);
  if (!turn.isConnected) return;                  // thread was cleared mid-flight

  if (!r.ok) {
    pending.className = "a-model failed";
    pending.innerHTML = `<div class="am-head"><span class="am-glyph">✧</span>
      <span class="am-who">${esc(CodexAI.label())} could not answer</span></div>
      <div class="am-why">${esc(r.why)} The answer above was worked out on this device instead.</div>`;
    return;
  }
  pending.className = "a-model";
  pending.innerHTML = `<div class="am-head"><span class="am-glyph">✦</span>
    <span class="am-who">${esc(r.model || CodexAI.label())}</span>
    <span class="am-state">from ${r.sent} of your entries</span></div>
    <div class="am-text">${esc(r.text).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")
      .replace(/^/, "<p>").replace(/$/, "</p>")}</div>`;
  // the local answer stays, folded away, so you can always compare
  const localBlock = them.querySelector(".a-local-wrap");
  if (!localBlock) {
    const parts = Array.from(them.children).filter(el =>
      !el.classList.contains("a-model") && !el.classList.contains("a-actions") &&
      !el.classList.contains("a-cites") && !el.classList.contains("a-ground"));
    if (parts.length) {
      const wrap = document.createElement("details");
      wrap.className = "a-local-wrap";
      const sum = document.createElement("summary");
      sum.textContent = "What this device found on its own";
      wrap.appendChild(sum);
      parts.forEach(p => wrap.appendChild(p));
      them.insertBefore(wrap, pending);
    }
  }
}

function bindAnswerActions(turn) {
  const text = () => (turn.querySelector(".a-them").innerText || "").trim();
  $$("[data-act]", turn).forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    if (act === "copy") {
      navigator.clipboard ? navigator.clipboard.writeText(text()).then(() => toast("Answer copied")) : toast("Copying isn't available here");
    } else if (act === "insert") {
      const ed = document.getElementById("docEditor");
      if (!ed) return toast("Open a document first, then insert.");
      ed.focus();
      document.execCommand("insertText", false, text());
      toast("Inserted into your document");
    } else if (act === "read") {
      window.CodexSpeech ? CodexSpeech.read(text()) : toast("Read-aloud isn't available here");
    }
  });
}

/* Follow-ups have to be answerable, so they are built from what the
   answer actually found rather than from a fixed list. Imported
   entries can carry very long headline-ish titles, which make an
   unreadable question; only a short, name-like subject is used. */
function followUpsFor(q, sources) {
  const out = [];
  const subj = usableSubject(matchNamedSubject(q, true)) ||
               // the first result whose title is short enough to read as a name
               (sources.map(s => usableSubject(s.title)).filter(Boolean)[0] || null);
  if (subj) {
    out.push(`Who appears alongside ${subj}?`);
    out.push(`Check consistency for ${subj}`);
  }
  if (!/consistency/i.test(q)) out.push("Check my canon for contradictions");
  if (!/\bcharacters?\b/i.test(q)) out.push("List all characters");
  if (!/\bhouses?\b/i.test(q)) out.push("List all noble houses");
  if (document.getElementById("docEditor")) out.push("Summarize this document");
  return out.slice(0, 3);
}
function usableSubject(s) {
  s = (s || "").trim();
  if (!s || s.length > 34 || s.split(/\s+/).length > 4) return null;
  return s;
}
function assistantScan(text) {
  const found = [], seen = new Set();
  if (ENT_RE) { ENT_RE.lastIndex = 0; let m; while ((m = ENT_RE.exec(text)) && found.length < 12) { const w = m[1]; if (!seen.has(w)) { seen.add(w); found.push(w); } } }
  const body = $("#assistantBody");
  if (!found.length) { body.innerHTML = `<div class="assistant-hint">Keep writing; as you mention names from your world, their summaries appear here.</div>`; return; }
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

/* ---------- the slash-command menu ---------- */
function showCommands(typed) {
  const menu = $("#assistantCommands");
  const term = typed.slice(1).toLowerCase();
  const hits = COMMANDS.filter(c => c.cmd.slice(1).startsWith(term));
  if (!hits.length) return hideCommands();
  menu.hidden = false;
  menu.innerHTML = `<div class="ac-head">Commands</div>` + hits.map((c, i) =>
    `<button class="ac-row${i === 0 ? " on" : ""}" data-cmd="${esc(c.cmd)}">
      <span class="ac-cmd">${esc(c.cmd)}</span><span class="ac-what">${esc(c.what)}</span></button>`).join("");
  $$("[data-cmd]", menu).forEach(b => b.onclick = () => pickCommand(b.dataset.cmd));
}
function hideCommands() { const m = $("#assistantCommands"); if (m) { m.hidden = true; m.innerHTML = ""; } }

/* A command that needs a subject leaves the input primed and waiting
   rather than firing a half-formed question. */
function pickCommand(cmd) {
  const c = COMMANDS.find(x => x.cmd === cmd);
  if (!c) return;
  hideCommands();
  const input = $("#assistantInput");
  if (c.open) { input.value = c.q; input.focus(); return; }
  askAssistant(c.q);
}

/* Enter either completes a bare command or asks the question as typed. */
function runAssistantInput(v) {
  v = (v || "").trim();
  if (!v) return;
  if (v.startsWith("/")) {
    const exact = COMMANDS.find(c => v === c.cmd);
    if (exact) return pickCommand(exact.cmd);
    const partial = COMMANDS.find(c => v.startsWith(c.cmd + " "));
    if (partial) return askAssistant(partial.q.trim() + " " + v.slice(partial.cmd.length).trim());
    const first = COMMANDS.find(c => c.cmd.startsWith(v));
    if (first) return pickCommand(first.cmd);
  }
  askAssistant(v);
}

/* The context pill: what the assistant is looking at right now. */
function setAssistantContext(label, href) {
  const el = $("#assistantContext");
  if (!el) return;
  if (!label) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = `<span class="ctx-glyph">❖</span>
    <span class="ctx-text">Reading <a href="${href || "#"}">${esc(label)}</a></span>
    <button class="ctx-x" title="Stop using this as context">✕</button>`;
  el.querySelector(".ctx-x").onclick = () => setAssistantContext(null);
}
/* The chip is the app's claim about where answers come from, so it is
   derived from the live setting rather than written once into the HTML. */
function refreshModelChip() {
  const chip = $("#assistantModel"), name = $("#assistantModelName");
  if (!chip || !name) return;
  const ai = window.CodexAI;
  const live = ai && ai.on();
  name.textContent = ai ? ai.label() : "On device";
  chip.classList.toggle("live", !!live);
  chip.title = live
    ? "Your matching entries are sent to " + ai.state().providerLabel +
      " to answer. You are billed by them. Change this in Settings, Assistant."
    : "Answers are worked out in this browser from your own entries. Nothing is sent anywhere.";
}

window.CodexAssistant = { scan: assistantScan, lookup: assistantLookup, open: openAssistant,
  ask: askAssistant, context: setAssistantContext, refreshModelChip };
function openAssistant() {
  $("#app").classList.add("assist-open");
  $("#assistant").hidden = false;
  refreshModelChip();
  // the header portrait is Lucky's, so it has to follow his chosen coat
  const face = $("#assistantFace");
  if (face && window.CodexLucky) {
    face.setAttribute("data-skin", CodexLucky.skin());
    face.innerHTML = CodexLucky.face(30);
    $("#assistantName").textContent = CodexLucky.name();
  }
  // the ledger counts pets and entries, both of which move while the
  // rail is closed, so an untouched thread is re-rendered on open
  if (!rail.turns) {
    if (window.CodexLucky) CodexLucky.refreshFacts().then(assistantIdle);
    else assistantIdle();
  }
  const input = $("#assistantInput");
  if (input) setTimeout(() => input.focus(), 60);
}
function closeAssistant() { $("#app").classList.remove("assist-open"); $("#assistant").hidden = true; }

/* ============================================================
   BACKUP / RESTORE  (now covers docs, decks, canvases, folders, notes)
   ============================================================ */
async function backupAll() {
  let data;
  if (window.CodexStore) data = await CodexStore.exportAll();
  else { data = { _codex: true, stores: {} }; }
  data._codex = true;
  /* Include the small localStorage prefs too; but NEVER a credential.
     A backup is the one file that leaves this machine: it gets emailed to
     yourself, dropped in cloud storage, kept for years. An API key inside
     it is a live secret in all of those places, so the AI settings are
     skipped outright rather than filtered field by field. */
  const SECRET_KEYS = [window.CodexAI ? CodexAI.STORAGE_KEY : "codex.ai"];
  data.prefs = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("codex.")) continue;
    if (SECRET_KEYS.indexOf(k) > -1) continue;
    data.prefs[k] = localStorage.getItem(k);
  }
  data._skipped = "AI provider settings and API key are never included in a backup.";
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
/* ============================================================
   THE COMMUNITY SPACE
   A separate place with its own home, its own sections, and one door
   back to the workspace. Everything outward-facing lives here.
   ============================================================ */
const SPACE_ROUTES = ["space", "work", "community"];
function inSpace(hash) {
  const h = hash || location.hash || "#/";
  const path = h.replace(/^#\//, "").split("/")[0];
  return SPACE_ROUTES.indexOf(path) > -1;
}
function buildSpaceNav(nav) {
  const here = (location.hash || "").replace(/^#\//, "").split("/")[0];
  const item = (route, icon, label, match) =>
    `<div class="nav-item${here === (match || route.replace(/^#\//, "").split("/")[0]) ? " active" : ""}"
       data-route="${route}">${svg(icon)}<span>${label}</span></div>`;
  const name = window.CodexWorkspaces ? CodexWorkspaces.current().name : "your workspace";

  nav.innerHTML = `
    <button class="space-back" id="spaceBack">
      <span class="sb-arrow">←</span>
      <span class="sb-text"><span class="sb-k">Return to</span>
      <span class="sb-n">${esc(name)}</span></span>
    </button>

    <div class="ws-card space-card">
      <div class="legend">You are in</div>
      <div class="name">Community Space</div>
      <div class="meta">Publishing &amp; readers</div>
    </div>

    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">The Space</div></div>
      ${item("#/space", "home", "Space home")}
      ${item("#/work", "book", "My Works")}
      ${item("#/community", "people", "Reading Room")}
    </div>

    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">Your shelf</div></div>
      <div class="nav-item" data-route="#/community/shelf">${svg("read")}<span>Saved to read</span></div>
      <div class="nav-item" data-route="#/community/chat">${svg("people")}<span>Notes &amp; replies</span></div>
    </div>

    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">Account</div></div>
      <div class="nav-item" data-route="#/settings">${svg("settings")}<span>Settings</span></div>
    </div>

    <div class="nav-section">
      <div class="ornament" style="margin-top:20px">✦✧✦</div>
    </div>`;

  $$("#nav .nav-item[data-route]").forEach(el =>
    el.onclick = () => { location.hash = el.dataset.route; if (innerWidth < 860) collapseSidebar(true); });
  const back = $("#spaceBack");
  if (back) back.onclick = () => { location.hash = "#/"; };
}

/* Every navigation gets a number. Views that finish rendering
   asynchronously; the Desk reads the day log, the editor reads a
   document; must check they are still the page the user is on before
   writing to #view. Without this, a slow view that has been navigated
   away from lands anyway and paints over whatever replaced it: creating
   a note dropped you on the Desk, because the Desk render started, the
   note page drew synchronously, and then the Desk arrived late and won. */
let routeGen = 0;
function currentGen() { return routeGen; }
function isStale(gen) { return gen !== routeGen; }

function route() {
  routeGen++;
  const h = location.hash || "#/";
  // a reading link is somebody else's view of one work: no sidebar,
  // no assistant, none of the workspace furniture
  // Lucky's stage is a child of <body>, not of #app, so the reader-mode
  // class has to be on both for him to be hidden from a reading link.
  const reader = h.startsWith("#/shared/");
  document.getElementById("app").classList.toggle("reader-mode", reader);
  document.body.classList.toggle("reader-mode", reader);
  // entering or leaving the Space swaps the whole left rail
  const space = inSpace(h);
  const app = document.getElementById("app");
  if (space !== app.classList.contains("space-mode")) {
    app.classList.toggle("space-mode", space);
    buildNav();
  }
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
  else if (path === "read") window.CodexPages && CodexPages.read(parts[1] || "");
  else if (path === "space") window.CodexCommunity && CodexCommunity.spaceHome();
  else if (path === "work") window.CodexPublish && CodexPublish.work(parts[1] || "");
  else if (path === "community") window.CodexCommunity && CodexCommunity.view(parts[1] || "");
  else if (path === "shared") window.CodexPublish && CodexPublish.shared(parts[1] || "");
  else if (path === "history") window.CodexPages && CodexPages.history(parts[1] || "");
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

/* Something failed during start-up. Say so where it can be seen and
   copied, rather than leaving a blank page and no explanation. The
   app carries on around it wherever it can. */
const bootProblems = [];
function bootTrouble(doing, err) {
  const detail = (err && (err.stack || err.message)) || String(err);
  bootProblems.push({ doing, detail });
  try { console.error("Beep Beep Organizer; trouble " + doing + ":", err); } catch (e) {}
  let bar = document.getElementById("bootTrouble");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "bootTrouble";
    bar.className = "boot-trouble";
    document.body.appendChild(bar);
  }
  const first = bootProblems[0];
  bar.innerHTML = `
    <div class="bt-body">
      <strong>Something went wrong ${esc(first.doing)}.</strong>
      Your writing is safe; this is a display problem, not a data one.
      <code>${esc(String(first.detail).split("\n")[0].slice(0, 200))}</code>
    </div>
    <div class="bt-acts">
      <button class="btn ghost sm" id="btCopy">Copy details</button>
      <button class="btn ghost sm" id="btReload">Reload</button>
      <button class="btn ghost sm" id="btHide">Dismiss</button>
    </div>`;
  bar.querySelector("#btCopy").onclick = () => {
    const text = bootProblems.map(p => "While " + p.doing + ":\n" + p.detail).join("\n\n")
      + "\n\nPage: " + location.href + "\nBrowser: " + navigator.userAgent;
    navigator.clipboard ? navigator.clipboard.writeText(text).then(() => toast("Details copied; paste them to me"))
      : window.prompt("Copy this:", text);
  };
  bar.querySelector("#btReload").onclick = () => location.reload();
  bar.querySelector("#btHide").onclick = () => bar.remove();
}

async function init() {
  if (isNarrow()) collapseSidebar(true);
  try {
    if (window.CodexStore) {
      // a cloud account's first open on this device: adopt its workspaces
      // from the cloud (or seed the starter template) before anything reads
      if (window.CodexAccount && CodexAccount.ensureCloudSpace) {
        try { await CodexAccount.ensureCloudSpace(); } catch (e) {}
      }
      // if the last-active workspace isn't the default one, redirect storage
      // to that workspace's own isolated database before loading anything
      const wsId = window.CodexWorkspaces ? CodexWorkspaces.activeId() : "default";
      if (wsId !== "default") await CodexStore.switchWorkspace(wsId);
      else await CodexStore.ready;
      // a brand-new account's first open: replicate the starter template
      // into their workspace before anything reads from it
      if (window.CodexAccount && CodexAccount.ensureTemplate) {
        const seeded = await CodexAccount.ensureTemplate();
        if (seeded && window.toast) toast("Welcome! Your starter workspace is ready; everything in it is yours to edit.");
      }
      await loadNotes();
    }
    if (window.CodexExtra) await CodexExtra.ready();
    // the sidebar's Projects section renders from this cache
    if (window.CodexFolders) await CodexFolders.ensureCache(true);
  } catch (e) { bootTrouble("loading your work", e); }

  // Each of these is fenced off on its own. A fault in one must not
  // leave the whole shell sitting on "Opening…" with an empty sidebar,
  // which is exactly what used to happen.
  try { buildIndexes(); } catch (e) { bootTrouble("indexing your canon", e); }
  try { buildNav(); } catch (e) { bootTrouble("building the sidebar", e); }
  try { if (window.CodexWorkspaces) CodexWorkspaces.updateBrandLabel(); } catch (e) {}

  // Cleared unconditionally: whatever else went wrong, the app is as
  // ready as it is going to get and the person needs to see it.
  $("#app").classList.remove("loading");

  try { route(); } catch (e) { bootTrouble("opening that page", e); }
  window.addEventListener("hashchange", () => {
    try { route(); } catch (e) { bootTrouble("opening that page", e); }
  });

  if ($("#wsSwitchOpen")) $("#wsSwitchOpen").onclick = () => window.CodexWorkspaces && CodexWorkspaces.openSwitcher();
  if (window.CodexAccount && CodexAccount.mountChip) { try { CodexAccount.mountChip(); } catch (e) {} }

  const savedTheme = localStorage.getItem("codex.theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $("#themeToggle").onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    localStorage.setItem("codex.theme", t);
    // Colour tokens partly come from inline styles on :root, which outrank
    // the stylesheet's theme block; so flipping the attribute alone left
    // half the palette belonging to the theme we just left.
    if (window.CodexSettings && CodexSettings.reapply) CodexSettings.reapply();
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
  $("#assistantNew").onclick = () => { rail.turns = 0; assistantIdle(); $("#assistantInput").focus(); };
  $("#assistantHistory").onclick = () => { rail.turns = 0; assistantIdle(); };
  $("#assistantScope").onclick = () => {
    rail.scope = rail.scope === "canon" ? "everything" : "canon";
    $("#assistantScope").textContent = (rail.scope === "canon" ? "Canon only" : "Canon + notes") + " ▾";
    toast(rail.scope === "canon" ? "Reading canon entries only" : "Reading canon entries and your notes");
  };
  $("#assistantLength").onclick = () => {
    rail.length = rail.length === "brief" ? "full" : "brief";
    $("#assistantLength").textContent = (rail.length === "brief" ? "Brief" : "Full") + " ▾";
  };
  $("#assistantDictate").onclick = () => {
    if (!window.CodexSpeech || !CodexSpeech.dictate) return toast("Dictation isn't supported in this browser");
    const btn = $("#assistantDictate");
    btn.classList.add("on");
    CodexSpeech.dictate(
      text => { const i = $("#assistantInput"); i.value = (i.value + " " + text).trim(); },
      () => btn.classList.remove("on"));
  };
  assistantIdle();

  const ai = $("#assistantInput");
  ai.addEventListener("input", () => {
    const v = ai.value;
    if (v.startsWith("/")) showCommands(v); else hideCommands();
  });
  ai.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); runAssistantInput(ai.value); }
    if (e.key === "Escape") hideCommands();
  });

  $("#searchOpen").onclick = () => openSearch("");
  $("#searchEsc").onclick = closeSearch;
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

/* A last line of defence: if init itself dies, or a script that runs
   after it throws, the shell must still come out of its loading state. */
window.addEventListener("error", e => {
  const app = $("#app");
  if (app && app.classList.contains("loading")) {
    app.classList.remove("loading");
    bootTrouble("starting up", e.error || e.message);
  }
});
function boot() {
  init().catch(e => {
    const app = $("#app");
    if (app) app.classList.remove("loading");
    bootTrouble("starting up", e);
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else init();

async function reloadWorkspace() { await loadNotes(); refresh(); }
window.Codex = { DB, byId, mentionsOf, bestEntryFor, SRC, topicSummary, refresh, addNote, updateNote, deleteNote, categoriesList, factsOf, sentencesOf, visibleEntries, reloadWorkspace, entitiesIn, snippet, searchAll, svg, catColor, catDot,
  recentCount: () => store.recent.length, recentIds: () => store.recent.slice(), backup: backupAll,
  currentGen, isStale };
})();
