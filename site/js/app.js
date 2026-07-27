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
  library:'<path d="M4 16.5V4.8c0-.7.5-1.2 1.2-1.2h1.6v13H5.2c-.7 0-1.2-.4-1.2-.1z"/><path d="M7.5 3.6h2.2v12.9H7.5z"/><path d="M11.3 4.3l2.1-.6 3.2 12.4-2.1.6z"/>',
};
function svg(name) {
  return `<svg class="ic-svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ""}</svg>`;
}

/* ---------- category colours (markers are coloured dots, not emoji) ---------- */
const CAT = {
  "Characters":         "#7c5cff",
  "Noble Houses":       "#b8893b",
  "Maps & Locations":   "#3f8f6b",
  "Religion & Faith":   "#c2603f",
  "Magic System":       "#5c8fff",
  "Timeline & History": "#9a6bd0",
  "Culture & Fashion":  "#d0699a",
  "Books & Stories":    "#6b8f3f",
  "Reference & Lexicon":"#6a655c",
  "Canon & Continuity": "#3f6f8f",
  "My Notes":           "#4d8f7b",
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

/* ---------- state (keys namespaced per account via account.js) ---------- */
const acctKey = (base) => window.CodexAccount ? CodexAccount.storeKey(base) : base;
const store = {
  recent: JSON.parse(localStorage.getItem(acctKey("codex.recent")) || "[]"),
  pushRecent(id) {
    this.recent = [id, ...this.recent.filter(x => x !== id)].slice(0, 8);
    localStorage.setItem(acctKey("codex.recent"), JSON.stringify(this.recent));
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
  const cats = categoriesList()
    .filter(c => !(window.CodexExtra && CodexExtra.hiddenCats.has(c.name)))
    .map(c => {
      const canRemove = c.name !== "My Notes"; // the catch-all bucket stays pinned
      const title = c.custom ? "Delete this section" : "Hide this section from the sidebar";
      return `<div class="nav-item ${c.custom ? "nav-custom" : ""}" data-route="#/browse/${encodeURIComponent(c.name)}">
       <span class="dot" style="background:${catColor(c.name)}"></span>
       <span>${esc(c.name)}</span><span class="count">${c.count}</span>
       ${canRemove ? `<button class="nav-del" data-delcat="${esc(c.name)}" data-custom="${c.custom ? "1" : "0"}" title="${title}">✕</button>` : ""}
     </div>`;
    }).join("");
  nav.innerHTML = `
    <div class="nav-section">
      <div class="nav-item" data-route="#/">${svg("home")}<span>Home</span></div>
      <div class="nav-item" data-route="#/maps">${svg("atlas")}<span>Atlas &amp; Galleries</span></div>
      <div class="nav-item" data-route="#/index">${svg("index")}<span>Name Index</span></div>
    </div>
    <div class="nav-section">
      <div class="nav-title-row"><div class="nav-title">The Canon</div>
        <button class="nav-plus" id="navAddCat" title="Add a section">+</button></div>
      ${cats}
    </div>
    <div class="nav-section">
      <div class="nav-title">Your Workspace</div>
      <div class="nav-item" data-route="#/library">${svg("library")}<span>Library &amp; Stories</span></div>
      <div class="nav-item" data-route="#/docs">${svg("doc")}<span>Documents</span></div>
      <div class="nav-item" data-route="#/slides">${svg("slides")}<span>Slide Decks</span></div>
      <div class="nav-item" data-route="#/canvases">${svg("canvas")}<span>Canvases &amp; Mood Boards</span></div>
      <div class="nav-item" data-route="#/mindmaps">${svg("mindmap")}<span>Mind Maps</span></div>
      <div class="nav-item" data-route="#/sheets">${svg("sheet")}<span>Sheets</span></div>
      <div class="nav-item" data-route="#/study">${svg("cards")}<span>Flashcards &amp; Quiz</span></div>
      <div class="nav-item" data-route="#/timeline">${svg("timeline")}<span>Timeline</span></div>
      <div class="nav-item" data-route="#/tasks">${svg("check")}<span>Task Manager</span></div>
      <div class="nav-item" data-route="#/import">${svg("import")}<span>Import &amp; Add Lore</span></div>
      <div class="nav-item" data-route="#/feed">${svg("feed")}<span>Activity Feed</span></div>
    </div>
    <div class="nav-section">
      <div class="nav-title">Data</div>
      <div class="nav-item" data-route="#/settings">${svg("settings")}<span>Settings</span></div>
      <div class="nav-item mini" id="navExport">${svg("backup")}<span>Back up my work</span></div>
      <div class="nav-item mini" id="navImport">${svg("restore")}<span>Restore backup</span></div>
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
    toast("Section added; file notes into it from Import & Add Lore");
  };
  $$("#nav .nav-del[data-delcat]").forEach(btn => btn.onclick = (ev) => {
    ev.stopPropagation(); ev.preventDefault();
    if (btn.dataset.custom === "1") deleteCustomSection(btn.dataset.delcat);
    else hideBuiltinSection(btn.dataset.delcat);
  });
  markActive();
}
/* hide a built-in Canon section (Characters, Noble Houses, etc.) from the sidebar.
   Unlike a custom section, a built-in one isn't a deletable object; it's sourced
   from the imported canon; so "delete" here means delist from nav/browse, never
   touching the entries themselves. Fully reversible from Settings. */
async function hideBuiltinSection(name, onDone) {
  if (!confirm(`Hide the section "${name}"?\n\nIts entries stay exactly as they are; searchable, linkable, still in your canon; they just won't show in this sidebar list. Restore it anytime from Settings.`)) return;
  await CodexExtra.hideCat(name);
  refresh();
  toast(`"${name}" hidden from the sidebar; restore it from Settings anytime`);
  if (onDone) onDone();
}
/* delete a user-added Canon section; its notes move to "My Notes" (never destroyed) */
async function deleteCustomSection(name, onDone) {
  const cat = (window.CodexExtra ? CodexExtra.cats : []).find(c => c.name === name);
  if (!cat) return;
  const inHere = notesCache.filter(n => n.category === name);
  const msg = inHere.length
    ? `Delete the section "${name}"?\n\n${inHere.length} note${inHere.length === 1 ? "" : "s"} filed here will move to "My Notes"; nothing is deleted.`
    : `Delete the empty section "${name}"?`;
  if (!confirm(msg)) return;
  for (const n of inHere) { n.category = "My Notes"; await CodexStore.put("notes", n); }  // rehome, don't destroy
  await CodexExtra.delCat(cat.id);
  refresh();
  toast(inHere.length ? `Deleted; ${inHere.length} note${inHere.length === 1 ? "" : "s"} moved to My Notes` : `Section "${name}" deleted`);
  if (onDone) onDone();
}
function markActive() {
  const h = location.hash || "#/";
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
      <p>One quiet home for every character, house, map, and myth in <em>${esc(window.CodexWorkspaces ? CodexWorkspaces.current().name : "World Without God")}</em>.
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
    <div id="homeLibStrip"></div>
    <div class="cat-grid">${cards}</div>`;
  if (window.CodexLibrary) CodexLibrary.homeStrip($("#homeLibStrip"));
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
  const isCustomSection = customCats().includes(cat);
  const isBuiltinSection = CANON_ORDER.includes(cat);
  const isNotesLike = cat === "My Notes" || isCustomSection;
  const cards = items.map(e => entryCardSelectable(e)).join("") ||
    `<div class="empty-state">Nothing here yet.${isNotesLike ? " Add one below, or from Import &amp; Add Lore." : ""}</div>`;
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${catDot(cat)} Collection</div>
    <div class="browse-head">
      <h1>${esc(cat)}</h1>
      <div class="browse-actions">
        ${isNotesLike ? `<button class="btn sm" id="quickAddNote">New note</button>` : ""}
        ${items.length ? `<button class="btn ghost sm" id="toggleSelect">${browseSelectMode ? "Cancel" : "Select"}</button>` : ""}
        ${isCustomSection ? `<button class="btn ghost sm" id="deleteSection" style="color:var(--danger)">Delete section</button>` : ""}
        ${isBuiltinSection ? `<button class="btn ghost sm" id="hideSection" style="color:var(--danger)">Hide section</button>` : ""}
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
  if ($("#deleteSection")) $("#deleteSection").onclick = () => deleteCustomSection(cat, () => { location.hash = "#/"; });
  if ($("#hideSection")) $("#hideSection").onclick = () => hideBuiltinSection(cat, () => { location.hash = "#/"; });
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
  // every section is a valid filing destination; the built-in canon collections,
  // "My Notes", and any custom sections you've made with the + button
  const allCats = categoriesList().map(c => c.name);
  const custom = customCats();
  view.innerHTML = `<div class="wrap">
    <div class="page-kicker">${svg("import")} Import &amp; Add Lore</div>
    <h1>Add to your canon</h1>
    <p class="muted">Drop in <b>PDFs</b> (text and page images both come in, like Notion), <b>Word documents</b>
      (.docx), text or Markdown files, or add images directly. Everything is indexed straight away; searchable,
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
      Click the <b>+</b> next to "The Canon" in the sidebar to create one; it'll show up in this list too.</p>`}

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
/* filler/question words to ignore when deciding whether an entry "matches" a
   query; without this, a natural question like "who is Zephyrine" silently
   required the literal words "who" and "is" to also appear in the target
   document, so an imported document that only ever mentions a name in
   passing (never given its own dedicated entry) would never be found by
   anything but typing that exact bare name. */
const SEARCH_STOPWORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","who","whom","whose","what","which",
  "when","where","why","how","does","do","did","done","doing","tell","me","about","of","in","on",
  "at","to","for","and","or","this","that","these","those","my","your","our","their","his","her",
  "its","it","i","you","he","she","they","we","find","search","look","looking","exist","exists",
  "existed","character","characters","person","someone","anyone","named","name","called","mentioned",
  "mention","story","canon","world","please","can","could","would","should",
]);
function searchAll(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const rawTerms = q.split(/\s+/);
  let terms = rawTerms.filter(t => !SEARCH_STOPWORDS.has(t));
  if (!terms.length) terms = rawTerms; // don't turn an all-stopword query into a match-everything search
  const res = [];
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

/* ============================================================
   AI; bring-your-own-key, grounded in your own canon. Three providers
   are supported (Google Gemini, DeepSeek, Groq); each keeps its own key
   and model choice in localStorage so switching providers never loses
   another one's saved key. Keys live ONLY in this browser: never
   uploaded, never in a backup. Answers fire on Enter (not per
   keystroke) so a key is never spammed. With no key, everything
   falls back to the local synthesis above.
   ============================================================ */
const AI_DEAD_MODELS = new Set(["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"]);
/* every non-Gemini provider is OpenAI-compatible and follows the same
   localStorage-key-per-provider pattern; add a new one here plus one
   entry in AI_OPENAI_COMPAT_URLS and it's wired everywhere automatically */
const AI_PROVIDERS = {
  gemini:   { label: "Gemini" },
  deepseek: { label: "DeepSeek", keyStore: "codex.deepseekKey", modelStore: "codex.deepseekModel", defaultModel: "deepseek-v4-flash" },
  groq:     { label: "Groq", keyStore: "codex.groqKey", modelStore: "codex.groqModel", defaultModel: "llama-3.3-70b-versatile" },
  xai:      { label: "Grok (xAI)", keyStore: "codex.xaiKey", modelStore: "codex.xaiModel", defaultModel: "grok-4" },
};
const AI = {
  get provider() { return localStorage.getItem("codex.aiProvider") || "gemini"; },
  get key() {
    const p = AI_PROVIDERS[this.provider];
    return p && p.keyStore ? (localStorage.getItem(p.keyStore) || "") : (localStorage.getItem("codex.aiKey") || "");
  },
  get model() {
    const p = AI_PROVIDERS[this.provider];
    if (p && p.modelStore) return localStorage.getItem(p.modelStore) || p.defaultModel;
    const m = localStorage.getItem("codex.aiModel");
    // remap models that Google has retired for new accounts to the always-current alias
    return (!m || AI_DEAD_MODELS.has(m)) ? "gemini-flash-latest" : m;
  },
  get on()    { return !!this.key; },
  get label() { return (AI_PROVIDERS[this.provider] || {}).label || "AI"; },
  instr()     { try { return (window.CodexExtra && CodexExtra.settings && CodexExtra.settings.aiInstr) || ""; } catch (e) { return ""; } },
};

/* pull the most relevant passages from the active workspace's canon */
function gatherContext(query, maxEntries) {
  const seen = new Set(), picked = [];
  const named = matchNamedSubject(query) || partialEntity(query);
  if (named) {
    const lore = bestEntryFor(named);
    if (lore) { seen.add(lore.id); picked.push(lore); }
    mentionsOf(named, lore ? lore.id : null).forEach(m => { if (!seen.has(m.id)) { seen.add(m.id); picked.push(m); } });
  }
  searchAll(query).forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); picked.push(e); } });
  const usable = picked.filter(e => e.type === "pdf" || e.type === "note").slice(0, maxEntries);
  let context = ""; const budget = 16000;
  for (const e of usable) {
    const chunk = `### ${e.title}; ${e.category}\n${(e.text || "").replace(/\s+/g, " ").trim().slice(0, 1800)}\n\n`;
    if (context.length + chunk.length > budget) break;
    context += chunk;
  }
  return { results: usable, context };
}

/* tiny, safe markdown renderer for streamed answers (escapes first) */
function renderMarkdownLite(t) {
  const e2 = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const inline = s => e2(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\*)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  let html = "", inList = false;
  for (const raw of (t || "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (/^#{1,6}\s+/.test(line))     { if (inList) { html += "</ul>"; inList = false; } html += `<h4 class="ai-h">${inline(line.replace(/^#{1,6}\s+/, ""))}</h4>`; continue; }
    if (/^\s*[-*+]\s+/.test(line))   { if (!inList) { html += "<ul class='ai-ul'>"; inList = true; } html += `<li>${inline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`; continue; }
    if (/^\s*\d+[.)]\s+/.test(line)) { if (!inList) { html += "<ul class='ai-ul'>"; inList = true; } html += `<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`; continue; }
    if (!line.trim())                { if (inList) { html += "</ul>"; inList = false; } continue; }
    if (inList) { html += "</ul>"; inList = false; }
    html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

/* stream a completion from the connected provider directly from the browser (BYO key).
   Gemini and DeepSeek use different request shapes and SSE event shapes, so this
   dispatches to one of two small per-provider parsers that both feed the same
   onDelta(fullTextSoFar) callback and resolve to the final full text. */
const AI_OPENAI_COMPAT_URLS = {
  deepseek: "https://api.deepseek.com/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
};
async function callAIStream(system, userContent, onDelta, opts) {
  opts = opts || {};
  const url = AI_OPENAI_COMPAT_URLS[AI.provider];
  return url
    ? callOpenAICompatStream(url, system, userContent, onDelta, opts)
    : callGeminiStream(system, userContent, onDelta, opts);
}
async function callGeminiStream(system, userContent, onDelta, opts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(AI.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(AI.key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: opts.maxTokens || 2048 },
    }),
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = (e.error && e.error.message) || msg; } catch (e) {}
    throw new Error(msg);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
      if (ev.error) throw new Error(ev.error.message || "stream error");
      const parts = ev.candidates && ev.candidates[0] && ev.candidates[0].content && ev.candidates[0].content.parts;
      if (parts) { for (const p of parts) if (p.text) full += p.text; onDelta(full); }
    }
  }
  return full;
}
/* DeepSeek and Groq both speak the same OpenAI-compatible chat completions
   shape: POST /chat/completions with a Bearer key, SSE lines shaped like
   {"choices":[{"delta":{"content":"..."}}]}, terminated by a literal
   "data: [DONE]" line rather than a JSON payload; only the base URL and
   model differ per provider. */
async function callOpenAICompatStream(url, system, userContent, onDelta, opts) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${AI.key}` },
    body: JSON.stringify({
      model: AI.model,
      messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
      stream: true,
      temperature: 0.4,
      max_tokens: opts.maxTokens || 2048,
    }),
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    // error.message covers DeepSeek/Groq's {error:{message}} shape; xAI instead
    // sends {error:"a plain string"}; check both instead of assuming one
    try { const e = await res.json(); msg = (e.error && e.error.message) || e.error || msg; } catch (e) {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
      if (ev.error) throw new Error(ev.error.message || "stream error");
      const delta = ev.choices && ev.choices[0] && ev.choices[0].delta && ev.choices[0].delta.content;
      if (delta) { full += delta; onDelta(full); }
    }
  }
  return full;
}

/* Google's "-pro" Gemini models return this exact shape when the connected
   key has no billing enabled; a permanent block on that model, not a
   transient rate limit, so the fix is switching models, not waiting. */
function aiIsProQuotaError(err) {
  const msg = (err && err.message) || String(err || "");
  return AI.provider === "gemini" && /free_tier/i.test(msg) && /limit:\s*0/i.test(msg);
}
/* DeepSeek is pay-as-you-go, not free; an empty key balance returns this
   exact message, and it won't clear up by waiting or retrying either. */
function aiIsDeepSeekBalanceError(err) {
  const msg = (err && err.message) || String(err || "");
  return AI.provider === "deepseek" && /insufficient balance/i.test(msg);
}
/* Groq's free tier is generous but not infinite; a burst of requests can
   still hit a per-minute rate limit. This is transient, unlike the Gemini
   Pro / DeepSeek balance cases, so the message says "wait" not "switch". */
function aiIsGroqRateLimit(err) {
  const msg = (err && err.message) || String(err || "");
  return AI.provider === "groq" && /rate.?limit/i.test(msg);
}
/* xAI teams start with zero credits/licenses until you add a payment method;
   this exact message comes back as a clean, identifiable permission error. */
function aiIsXaiNoCredits(err) {
  const msg = (err && err.message) || String(err || "");
  return AI.provider === "xai" && /credits|licenses|permission-denied/i.test(msg);
}
function aiErrorHtml(err) {
  if (aiIsProQuotaError(err)) {
    return `⚠️ <b>${esc(AI.model)}</b> has no free-tier quota; "Pro" Gemini models require billing enabled on your Google account; this won't clear up by waiting.
      <button class="btn sm" id="aiSwitchFlashBtn" style="margin-left:8px">Switch to Flash &amp; retry</button>`;
  }
  if (aiIsDeepSeekBalanceError(err)) {
    return `⚠️ Your DeepSeek key has no balance; DeepSeek is pay-as-you-go, not free. Add funds at <a href="https://platform.deepseek.com/usage" target="_blank" rel="noopener">platform.deepseek.com</a>, then ask again.`;
  }
  if (aiIsGroqRateLimit(err)) {
    return `⚠️ Groq's free tier hit its per-minute rate limit; this clears up on its own after a short wait, then try again.`;
  }
  if (aiIsXaiNoCredits(err)) {
    return `⚠️ Your xAI team has no credits yet; Grok is pay-as-you-go, not free. Add a payment method at <a href="https://console.x.ai" target="_blank" rel="noopener">console.x.ai</a>, then ask again.`;
  }
  return `⚠️ ${esc(AI.label)} couldn't answer: <b>${esc((err && err.message) || String(err))}</b><br><span class="faint">Check your key in <b>Settings → Assistant</b>.</span>`;
}
function aiWireRetry(retry) {
  const btn = document.getElementById("aiSwitchFlashBtn");
  if (!btn) return;
  btn.onclick = () => { localStorage.setItem("codex.aiModel", "gemini-flash-latest"); toast("Switched to Gemini Flash; retrying…"); retry(); };
}

async function aiAnswer(query, deep) {
  const body = $("#assistantBody");
  const { results, context } = gatherContext(query, deep ? 14 : 10);
  const sys =
    "You are the Canon Assistant for a personal worldbuilding project. Answer using ONLY the canon excerpts the user provides; their own notes and lore. " +
    "Never invent names, houses, events, or facts the excerpts don't support; if the answer isn't there, say so plainly and suggest what to search for. " +
    "Use the world's own terms and spellings. Write in clear, direct prose; no throat-clearing, no \"based on the excerpts\". " +
    (deep ? "This is a deep-research request: be thorough and well organised, with short markdown headings (## Overview, ## Key facts, ## Relationships, ## Timeline if any, ## Open questions)."
          : "Keep it as long as the question needs and no longer. Light markdown (short headings, bold, bullet lists) is welcome.") +
    (AI.instr() ? "\n\nThe author's standing instructions (follow them): " + AI.instr() : "");
  const user = context
    ? (deep ? `Write a thorough research dossier on: ${query}\n\nCanon excerpts:\n${context}`
            : `Question: ${query}\n\nCanon excerpts:\n${context}`)
    : `Question: ${query}\n\n(There are no matching excerpts in the canon. Say so, and suggest what the author could search for or add.)`;
  body.innerHTML = `<div class="ans-answer ai">
      <div class="ans-a-label">${svg("spark")} ${deep ? "Deep research" : "Answer"} · ${AI.label}</div>
      <div class="ans-a-text ai-stream" id="aiStream"><div class="ai-thinking">Reading your canon<span class="ai-dots"><i></i><i></i><i></i></span></div></div>
    </div><div class="ans-sources" id="aiSources"></div>`;
  const streamEl = $("#aiStream");
  try {
    // Gemini's newer models spend a real, variable chunk of the token budget on internal
    // "thinking" before writing anything; leave generous headroom so the visible answer
    // never gets starved (measured 300-2000+ thinking tokens even on simple questions).
    const full = await callAIStream(sys, user, text => { streamEl.innerHTML = renderMarkdownLite(text) + `<span class="ai-cursor">▍</span>`; }, { maxTokens: deep ? 5000 : 2600 });
    streamEl.innerHTML = renderMarkdownLite(full) || `<p class="faint">No answer came back; try rephrasing.</p>`;
    const src = results.slice(0, 6).map(e => `<a class="ans-source" href="#/entry/${e.id}">${catDot(e.category)} ${esc(e.title)}</a>`).join("");
    $("#aiSources").innerHTML = src ? `<div class="ans-label">Grounded in your canon</div>${src}` : "";
    bindAssistantLinks(body);
  } catch (err) {
    body.innerHTML = `<div class="assistant-hint" style="text-align:left">${aiErrorHtml(err)}<br>
      <span class="faint">Here's a local result instead:</span></div>${assistantAnswer(query)}`;
    aiWireRetry(() => aiAnswer(query, deep));
    bindAssistantLinks(body);
  }
}

/* "favourite house / coolest character" etc.; a genuine opinion question, not a lookup.
   The strict fact-only prompt in aiAnswer() would refuse these ("no excerpt for that"), so
   this uses a separate, permissive prompt that explicitly invites Gemini to pick a favourite
   and say why, using real details from the category's own entries. */
async function aiOpinion(query) {
  const body = $("#assistantBody");
  const kind = findKind(query);
  const pool = (kind ? DB.entries.filter(e => e.category === kind.cat) : DB.entries)
    .filter(e => (e.type === "pdf" || e.type === "note") && !isHidden(e));
  if (!pool.length) { body.innerHTML = tryOpinion(query) || `<div class="assistant-hint">Nothing in your canon to pick a favourite from yet.</div>`; bindAssistantLinks(body); return; }
  const sample = pool.slice(0, 16);
  let context = "";
  for (const e of sample) { const chunk = `### ${e.title}; ${e.category}\n${(e.text || "").replace(/\s+/g, " ").trim().slice(0, 900)}\n\n`; if (context.length + chunk.length > 14000) break; context += chunk; }
  // The excerpts above are truncated to the first ~900 chars per source;
  // fine when a category is one-entry-per-item, but Characters especially
  // can be just a handful of huge documents (one over 200,000 chars), so
  // most named people never appear in that truncated head at all. Scan the
  // FULL untruncated text of the whole pool for recognized names so the
  // model has a real roster to choose from, not just whoever is mentioned
  // first; this is what was causing "no character entries to pick from"
  // even when specific characters were clearly described elsewhere.
  const nameCounts = {};
  pool.forEach(e => entitiesIn(e.text).forEach(n => { nameCounts[n] = (nameCounts[n] || 0) + 1; }));
  const candidateNames = Object.keys(nameCounts).sort((a, b) => nameCounts[b] - nameCounts[a]).slice(0, 40);
  const namesLine = candidateNames.length
    ? `\n\nNames that actually appear across these ${kind ? kind.label : "canon"} sources; pick from here if the excerpts above don't cover enough on their own: ${candidateNames.join(", ")}.`
    : "";
  // match the actual direction of the question; a hardcoded "pick a favourite" prompt
  // fighting a "who's your LEAST favourite" question produced confused, hedging answers
  const least = OPINION_NEGATIVE.test(query);
  const pickWord = least ? "least favourite (the one that appeals to you least)" : "favourite";
  const sys =
    "The author is asking for YOUR personal opinion about something in their OWN fictional world; not a factual lookup. This is playful and " +
    `subjective, not a request that needs textual proof. Pick one genuine ${pickWord} from the excerpts provided, and explain why in 2-4 warm, ` +
    `first-person sentences ('My ${least ? "least favourite is" : "favourite is..."}', ${least ? "" : "'I love...', "}) using specific, concrete details drawn from the excerpts. ` +
    "Never invent details that aren't in the excerpts, but DO have and state a preference; do not say you can't have favourites, and do not " +
    "say there's no excerpt for that; a subjective pick grounded in real details from the excerpts is exactly what's being asked for. " +
    "Pick one SPECIFIC named person/place/thing, never a document or source title; if a names list is provided separately from the excerpts, " +
    "that's exactly the roster to pick a specific name from, even if the excerpts above don't happen to cover them in detail." +
    (AI.instr() ? "\n\nThe author's standing instructions (follow them): " + AI.instr() : "");
  const user = `The author asked: "${query}"\n\nPick a genuine ${pickWord} from these and say why:\n\n${context}${namesLine}`;
  body.innerHTML = `<div class="ans-answer ai">
      <div class="ans-a-label">${svg("spark")} My take · ${AI.label}</div>
      <div class="ans-a-text ai-stream" id="aiStream"><div class="ai-thinking">Weighing your canon<span class="ai-dots"><i></i><i></i><i></i></span></div></div>
    </div><div class="ans-sources" id="aiSources"></div>`;
  const streamEl = $("#aiStream");
  try {
    const full = await callAIStream(sys, user, text => { streamEl.innerHTML = renderMarkdownLite(text) + `<span class="ai-cursor">▍</span>`; }, { maxTokens: 2200 });
    streamEl.innerHTML = renderMarkdownLite(full) || `<p class="faint">No answer came back; try asking again.</p>`;
    const src = sample.slice(0, 6).map(e => `<a class="ans-source" href="#/entry/${e.id}">${catDot(e.category)} ${esc(e.title)}</a>`).join("");
    $("#aiSources").innerHTML = src ? `<div class="ans-label">Considered from</div>${src}` : "";
    bindAssistantLinks(body);
  } catch (err) {
    body.innerHTML = `<div class="assistant-hint" style="text-align:left">${aiErrorHtml(err)}<br>
      <span class="faint">Here's a local pick instead:</span></div>${tryOpinion(query) || ""}`;
    aiWireRetry(() => aiOpinion(query));
    bindAssistantLinks(body);
  }
}
/* Groq's and xAI's exact current model lineups shift over time (same lesson
   learned the hard way with Gemini's model names earlier); rather than
   hardcode a guess, fetch the account's actual available models live once a
   key is entered, so Settings always offers real, currently-working choices. */
const AI_MODELS_LIST_URLS = {
  groq: "https://api.groq.com/openai/v1/models",
  xai: "https://api.x.ai/v1/models",
};
async function fetchOpenAICompatModels(provider, key) {
  const url = AI_MODELS_LIST_URLS[provider];
  const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) { let msg = `HTTP ${res.status}`; try { const e = await res.json(); msg = (e.error && e.error.message) || e.error || msg; } catch (e) {} throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg)); }
  const data = await res.json();
  return (data.data || []).map(m => m.id).sort();
}

window.CodexAI = {
  answer: aiAnswer,
  get on() { return AI.on; },
  get model() { return AI.model; },
  get label() { return AI.label; },
  // one-shot completion (collects the stream); used by flashcards & slide generation
  complete: (system, user, opts) => callAIStream(system, user, () => {}, opts),
  context: gatherContext,
  errorHtml: aiErrorHtml,
  wireRetry: aiWireRetry,
  fetchModels: fetchOpenAICompatModels,
};

/* ============================================================
   SLASH COMMANDS + hotbar; type "/" in the assistant to see them.
   /ask and /research use Gemini when connected (else local).
   ============================================================ */
const ASSIST_CMDS = [
  { key: "find",     aliases: ["f"],     hint: "Find every mention of a name or term",   ex: "/find Solis" },
  { key: "ask",      aliases: ["a"],     hint: "Ask a question; a short, direct answer", ex: "/ask who rules Solis?" },
  { key: "research", aliases: ["r"],     hint: "Deep dive; a full dossier on a subject", ex: "/research Solis" },
  { key: "summary",  aliases: ["s"],     hint: "A quick summary of a name or topic",      ex: "/summary House Vane" },
  { key: "list",     aliases: ["l"],     hint: "List everything in a collection",         ex: "/list characters" },
  { key: "help",     aliases: ["h", "?"], hint: "List everything I can do",                ex: "/help" },
];
const CMD_NEEDS_ARG = new Set(["find", "ask", "research", "summary", "list"]);
function findCmd(name) { name = (name || "").toLowerCase(); return ASSIST_CMDS.find(c => c.key === name || c.aliases.includes(name)) || null; }

let cmdSel = 0, cmdVisible = [];
let assistLookupTimer = null; // debounce timer for the free local-preview on keystroke
function renderCmdMenu(partial) {
  const menu = $("#assistCmdMenu"); if (!menu) return;
  const q = (partial || "").toLowerCase();
  cmdVisible = ASSIST_CMDS.filter(c => !q || c.key.startsWith(q) || c.aliases.some(a => a.startsWith(q)) || (q.length >= 2 && c.hint.toLowerCase().includes(q)));
  if (!cmdVisible.length) cmdVisible = ASSIST_CMDS.slice();
  if (cmdSel >= cmdVisible.length) cmdSel = 0;
  menu.innerHTML = `<div class="cmd-menu-hint">Commands · ↑↓ choose · Tab to pick</div>` +
    cmdVisible.map((c, i) => `<div class="cmd-item ${i === cmdSel ? "sel" : ""}" data-i="${i}">
      <span class="cmd-key">/${esc(c.key)}</span><span class="cmd-hint">${esc(c.hint)}</span></div>`).join("");
  menu.hidden = false;
  $$(".cmd-item", menu).forEach(el => {
    el.onmouseenter = () => { cmdSel = +el.dataset.i; hiCmd(); };
    el.onclick = () => pickCmd(cmdVisible[+el.dataset.i]);
  });
}
function hiCmd() { $$("#assistCmdMenu .cmd-item").forEach((el, i) => el.classList.toggle("sel", i === cmdSel)); }
function hideCmdMenu() { const m = $("#assistCmdMenu"); if (m) { m.hidden = true; m.innerHTML = ""; } cmdSel = 0; cmdVisible = []; }
function pickCmd(c) {
  if (!c) return;
  const inp = $("#assistantInput");
  inp.value = CMD_NEEDS_ARG.has(c.key) ? "/" + c.key + " " : "/" + c.key;
  hideCmdMenu(); inp.focus();
  if (CMD_NEEDS_ARG.has(c.key)) {
    $("#assistantBody").innerHTML = `<div class="assistant-hint">${esc(c.hint)}.<br><span class="faint">e.g. <b>${esc(c.ex)}</b>; then press Enter.</span></div>`;
  } else execAssist(inp.value);
}
function onAssistMenu(val) {
  if (val.startsWith("/")) { const tok = val.match(/^\/(\S*)$/); if (tok) renderCmdMenu(tok[1]); else hideCmdMenu(); }
  else hideCmdMenu();
}
function execAssist(val) {
  // Cancel the pending free local-preview debounce (see the "input" listener in init()).
  // Without this, that ~160ms timer can fire AFTER a real dispatch has already started;
  // e.g. an in-flight AI stream; and silently overwrite it with a stale local render.
  clearTimeout(assistLookupTimer);
  val = (val || "").trim();
  const inp = $("#assistantInput");
  if (val.startsWith("/")) {
    const full = val.match(/^\/(\S+)\s+([\s\S]+)$/);
    if (full) { const c = findCmd(full[1]); if (inp) inp.value = ""; if (c) { runAssistCommand(c.key, full[2].trim()); return; }
      $("#assistantBody").innerHTML = `<div class="assistant-hint">No command <b>/${esc(full[1])}</b>. Type <b>/</b> to see the list, or <b>/help</b>.</div>`; return; }
    const bare = val.match(/^\/(\S+)\s*$/);
    if (bare) { const c = findCmd(bare[1]); if (c && !CMD_NEEDS_ARG.has(c.key)) { if (inp) inp.value = ""; runAssistCommand(c.key, ""); return; } }
    return; // still typing a command; the hotbar is guiding, don't clear what they're composing
  }
  // a real question/lookup is about to be dispatched; clear the box now (like any chat
  // send box) so the NEXT keystroke starts a fresh question instead of appending to this
  // one. Previously nothing ever cleared the input, so a second question typed without
  // manually selecting-all first got silently concatenated onto the first; which is why
  // the assistant looked like it kept "answering the previous question".
  if (inp) inp.value = "";
  // not a command; try the deterministic local tools first (these should never
  // go to the AI even when connected: consistency checks, doc summaries, etc.)
  const body = $("#assistantBody");
  const sum = trySummarizeDoc(val); if (sum) { assistantHistory.push(val); body.innerHTML = sum; bindAssistantLinks(body); return; }
  const con = tryConsistency(val); if (con) { assistantHistory.push(val); body.innerHTML = con; bindAssistantLinks(body); return; }
  const cmd = tryCommand(val); if (cmd) { assistantHistory.push(val); body.innerHTML = cmd; bindAssistantLinks(body); return; }
  // an opinion/preference question ("favourite house", "coolest character") gets a
  // dedicated, permissive prompt; the strict fact-grounded prompt below would refuse it
  if (OPINION_TRIGGER.test(val)) {
    assistantHistory.push(val);
    if (AI.on) aiOpinion(val); else { body.innerHTML = tryOpinion(val) || assistantAnswer(val); bindAssistantLinks(body); }
    return;
  }
  // otherwise: Gemini when connected, else the local lookup
  if (AI.on) { assistantHistory.push(val); aiAnswer(val, false); }
  else assistantLookup(val);
}
function onAssistKeydown(e) {
  const menu = $("#assistCmdMenu");
  if (menu && !menu.hidden && cmdVisible.length) {
    if (e.key === "ArrowDown") { e.preventDefault(); cmdSel = Math.min(cmdSel + 1, cmdVisible.length - 1); hiCmd(); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); cmdSel = Math.max(cmdSel - 1, 0); hiCmd(); return; }
    if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); pickCmd(cmdVisible[cmdSel]); return; }
    if (e.key === "Escape")    { e.preventDefault(); hideCmdMenu(); return; }
  }
  if (e.key === "Enter") { e.preventDefault(); const v = e.target.value.trim(); if (v) execAssist(v); }
}
function runAssistCommand(key, arg) {
  const body = $("#assistantBody");
  if (key === "help") { body.innerHTML = cmdHelpHtml(); bindCmdHelp(body); return; }
  if (CMD_NEEDS_ARG.has(key) && !arg) {
    body.innerHTML = `<div class="assistant-hint">Add something after <b>/${esc(key)}</b>; e.g. <b>${esc(findCmd(key).ex)}</b>.</div>`;
    return;
  }
  if (key === "ask") {
    if (OPINION_TRIGGER.test(arg)) { AI.on ? aiOpinion(arg) : (body.innerHTML = tryOpinion(arg) || assistantAnswer(arg), bindAssistantLinks(body)); return; }
    AI.on ? aiAnswer(arg, false) : (body.innerHTML = assistantAnswer(arg), bindAssistantLinks(body)); return;
  }
  if (key === "research") { AI.on ? aiAnswer(arg, true)  : (body.innerHTML = assistantAnswer(arg), bindAssistantLinks(body)); return; }
  if (key === "summary")  { const s = matchNamedSubject(arg) || partialEntity(arg) || arg; body.innerHTML = blurbCard(s); bindAssistantLinks(body); return; }
  if (key === "find")     { body.innerHTML = cmdFind(arg); bindAssistantLinks(body); return; }
  if (key === "list")     { body.innerHTML = tryCommand("list all " + arg) || assistantAnswer(arg); bindAssistantLinks(body); return; }
}
function cmdFind(term) {
  const hits = searchAll(term);
  if (!hits.length) return `<div class="assistant-hint">No mentions of “${esc(term)}” in your canon yet.</div>`;
  const list = hits.slice(0, 16).map(e => `<a class="assist-mention" href="#/entry/${e.id}">
      <span class="am-t">${catDot(e.category)} ${esc(e.title)}</span>
      <span class="am-s">${e.type === "gallery" ? (e.images.length + " images") : snippet(e.text, term.split(/\s+/)[0] || term, 150)}</span></a>`).join("");
  const more = hits.length > 16 ? `<a class="btn ghost sm" href="#/search/${encodeURIComponent(term)}" style="margin-top:10px">See all ${hits.length} results →</a>` : "";
  return `<div class="ans-answer"><div class="ans-a-label">${svg("search")} Found “${esc(term)}”</div>
    <p class="ans-a-text" style="font-size:14px">${hits.length} ${hits.length === 1 ? "entry mentions" : "entries mention"} this.</p></div>
    <div class="assist-section-title">Where it appears</div>${list}${more}`;
}
function cmdHelpHtml() {
  return `<div class="assist-section-title">What I can do; type <b>/</b> anytime</div>
    <div class="cmd-help-list">${ASSIST_CMDS.map(c => `<div class="cmd-help-row" data-ex="${esc(CMD_NEEDS_ARG.has(c.key) ? "/" + c.key + " " : "/" + c.key)}">
      <div class="chr-key">/${esc(c.key)}${c.aliases.length ? ` <span class="faint" style="font-weight:400">or /${esc(c.aliases[0])}</span>` : ""}</div>
      <div class="chr-hint">${esc(c.hint)}</div>
      <div class="chr-ex">${esc(c.ex)}</div>
    </div>`).join("")}</div>
    <div class="ai-idle-note">${AI.on ? `✦ ${AI.label} is connected; /ask and /research write real answers.` : "Connect Gemini or DeepSeek in Settings so /ask and /research can reason for you."}</div>`;
}
function bindCmdHelp(root) {
  $$(".cmd-help-row", root).forEach(el => el.onclick = () => {
    const inp = $("#assistantInput"); inp.value = el.dataset.ex; inp.focus(); onAssistMenu(inp.value);
    if (!/\s$/.test(inp.value)) execAssist(inp.value);
  });
}

/* ---------- assistant recent-lookup history (per account) ---------- */
const assistantHistory = {
  get key() { return acctKey("codex.assistant.history"); },
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
  let pool = DB.entries.filter(e => e.category === kind.cat && (e.type === "pdf" || e.type === "note"));
  if (filterTerm) pool = pool.filter(e => e._hay.includes(filterTerm.toLowerCase()));
  pool = pool.sort((a, b) => a.title.localeCompare(b.title));
  const label = filterTerm ? `${kind.cat} in "${filterTerm}"` : kind.cat;
  if (!pool.length) return `<div class="assistant-hint">I couldn't find any ${esc(label)} in your canon.${filterTerm ? " Try dropping the “" + esc(filterTerm) + "” part and just asking for all of them." : ""}</div>`;
  return `<div class="ans-label" style="margin-bottom:6px">Found ${pool.length} in ${esc(label)}</div>
    <div class="recog">${pool.map(e => `<a class="chip" href="#/entry/${e.id}">${esc(e.title)}</a>`).join("")}</div>`;
}

/* ---------- opinion mode: "what's your favourite character" ---------- */
const OPINION_TRIGGER = /\b(favou?rite|best|worst|least|coolest|most interesting|most powerful|most important|top)\b/i;
const OPINION_NEGATIVE = /\b(least|worst|less)\b/i;
function tryOpinion(q) {
  if (!OPINION_TRIGGER.test(q)) return null;
  const kind = findKind(q);
  if (!kind) return null;
  const pool = DB.entries.filter(e => e.category === kind.cat && (e.type === "pdf" || e.type === "note"));
  if (!pool.length) return `<div class="assistant-hint">I don't have any ${esc(kind.label)} entries to pick from yet.</div>`;
  const least = OPINION_NEGATIVE.test(q);
  // Some categories are one-entry-per-item (66 separate Noble Houses, each
  // its own entry) but others; Characters especially; are just a handful
  // of huge source documents that each mention MANY individual names.
  // Picking "the top entry" in that case surfaces a DOCUMENT TITLE
  // ("Historical Figures") as if it were a person's name. When the pool
  // doesn't look granular, scan the full (untruncated) text of every entry
  // for recognized names instead, and pick one of those.
  if (pool.length < 8) {
    const nameCounts = {};
    pool.forEach(e => entitiesIn(e.text).forEach(n => { nameCounts[n] = (nameCounts[n] || 0) + 1; }));
    const names = Object.keys(nameCounts).sort((a, b) => least ? nameCounts[a] - nameCounts[b] : nameCounts[b] - nameCounts[a]);
    if (names.length) {
      const name = names[0];
      const home = bestEntryFor(name) || pool[0];
      const sents = topicSummary(name, 2);
      const label = least ? "My pick for least central; going by who's least mentioned" : "My pick, going by who's most woven through your canon";
      const reason = least
        ? `Reasoning: <b>${esc(name)}</b> barely turns up across your ${esc(kind.label)} sources; the lightest footprint of anyone named there.`
        : `Reasoning: <b>${esc(name)}</b> turns up ${nameCounts[name]} time${nameCounts[name] === 1 ? "" : "s"} across your ${esc(kind.label)} sources; more than anyone else mentioned there.`;
      return `<div class="ans-label">${label}</div>
        <div class="blurb">
          <div class="bt">${catDot(home.category)} ${esc(name)}</div>
          <div class="bs">${esc(sents.join(" ")) || ""}</div>
          <div class="bl">${reason}</div>
          <div style="margin-top:8px"><a class="btn sm" href="#/entry/${home.id}">Open source</a></div>
        </div>`;
    }
  }
  const scored = pool.map(e => ({ e, score: mentionsOf(e.title, e.id).length + (e.wordcount || 0) / 200 }));
  scored.sort((a, b) => least ? a.score - b.score : b.score - a.score);
  const pick = scored[0].e;
  const sents = topicSummary(pick.title, 2);
  const label = least ? "My pick for least central; going by what's least woven through your canon" : "My pick, going by what's most woven through your canon";
  const reason = least
    ? `Reasoning: <b>${esc(pick.title)}</b> barely turns up elsewhere in your canon; the lightest footprint of your ${esc(kind.label)} entries, for whatever that's worth.`
    : `Reasoning: <b>${esc(pick.title)}</b> turns up across ${scored[0].score >= 1 ? Math.round(scored[0].score) : "several"} other entries; more cross-referenced than the rest of your ${esc(kind.label)} entries, which usually means it's load-bearing for the story.`;
  return `<div class="ans-label">${label}</div>
    <div class="blurb">
      <div class="bt">${catDot(pick.category)} ${esc(pick.title)}</div>
      <div class="bs">${esc(sents.join(" ")) || esc(pick.summary || "")}</div>
      <div class="bl">${reason}</div>
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
    </div>${histHtml}
    <div class="ai-idle-note">${AI.on
      ? `✦ <b>${esc(AI.label)} is connected.</b> Type a question and press <b>Enter</b> for a written, reasoned answer; grounded in your canon.`
      : `Want real AI answers? <span class="ai-connect-link" id="aiConnectLink">Connect Gemini or DeepSeek</span> in Settings; then press <b>Enter</b> on any question.`}</div>`;
  $$('[data-recent]', $("#assistantBody")).forEach(c => c.onclick = () => { $("#assistantInput").value = c.dataset.recent; assistantLookup(c.dataset.recent); });
  $$('[data-quick]', $("#assistantBody")).forEach(c => c.onclick = () => { $("#assistantInput").value = c.dataset.quick; assistantLookup(c.dataset.quick); });
  const cl = $("#aiConnectLink"); if (cl) cl.onclick = () => { location.hash = "#/settings"; };
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
  // include tiny localStorage prefs, but NEVER the private AI key
  data.prefs = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("codex.") && k !== "codex.aiKey") data.prefs[k] = localStorage.getItem(k); }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "world-without-god-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
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

/* ---------- toast ---------- */
let toastT;
function toast(msg) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast";
    el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:20px;font-size:13px;z-index:300;box-shadow:var(--shadow);transition:opacity .3s";
    document.body.appendChild(el); }
  el.textContent = msg; el.style.opacity = "1";
  clearTimeout(toastT); toastT = setTimeout(() => el.style.opacity = "0", 1800);
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
  if (h === "#/" || path === "") viewHome();
  else if (path === "browse") viewBrowse(arg);
  else if (path === "entry") viewEntry(parts[1]);
  else if (path === "subject") viewSubject(arg);
  else if (path === "search") viewSearchPage(arg);
  else if (path === "maps") viewMaps();
  else if (path === "index") viewIndex();
  else if (path === "import") viewImport();
  else if (path === "library") window.CodexLibrary && CodexLibrary.list();
  else if (path === "story") window.CodexLibrary && CodexLibrary.story(parts[1]);
  else if (path === "read") window.CodexLibrary && CodexLibrary.read(parts[1], parts[2]);
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
  else if (path === "tasks") window.CodexUI && CodexUI.viewTasks();
  else if (path === "feed") window.CodexUI && CodexUI.viewFeed();
  else if (path === "settings") window.CodexUI && CodexUI.viewSettings();
  else viewHome();
  markActive();
}

/* ============================================================
   INIT
   ============================================================ */
function collapseSidebar(force) {
  const app = $("#app");
  if (force === true) app.classList.add("sidebar-collapsed");
  else if (force === false) app.classList.remove("sidebar-collapsed");
  else app.classList.toggle("sidebar-collapsed");
}

async function init() {
  // IndexedDB can in principle stall waiting on another open tab (a
  // versionchange request blocks behind a stale connection that's slow to
  // close); openDB()/Extra.ready() are written to always resolve, but never
  // trust a storage layer to leave the user staring at "Opening..." forever.
  // A hard timeout guarantees the UI unblocks either way; if storage was
  // just slow rather than actually stuck, it finishes in the background and
  // refresh() picks up the real data once it lands.
  const storageInit = (async () => {
    if (window.CodexStore) {
      // if the last-active workspace isn't the default one, redirect storage
      // to that workspace's own isolated database before loading anything
      const wsId = window.CodexWorkspaces ? CodexWorkspaces.activeId() : "default";
      if (wsId !== "default") await CodexStore.switchWorkspace(wsId);
      else await CodexStore.ready;
      // a brand-new account's first open: replicate the starter template
      // into their workspace before anything reads from it
      if (window.CodexAccount) {
        const seeded = await CodexAccount.ensureTemplate();
        if (seeded) toast("Welcome! Your starter workspace is ready; everything in it is yours to edit.");
      }
      await loadNotes();
    }
    if (window.CodexExtra) await CodexExtra.ready();
  })();
  let timedOut = false;
  try {
    await Promise.race([
      storageInit,
      new Promise(resolve => setTimeout(() => { timedOut = true; resolve(); }, 6000)),
    ]);
  } catch (e) { /* non-fatal */ }
  buildIndexes();
  buildNav();
  if (window.CodexWorkspaces) CodexWorkspaces.updateBrandLabel();
  $("#app").classList.remove("loading");
  route();
  window.addEventListener("hashchange", route);
  if (timedOut) {
    toast("Still finishing loading your data; if it doesn't appear shortly, close any other tabs of this site and refresh.");
    storageInit.then(() => refresh()).catch(() => {});
  }

  if ($("#wsSwitchOpen")) $("#wsSwitchOpen").onclick = () => window.CodexWorkspaces && CodexWorkspaces.openSwitcher();
  if (window.CodexAccount) CodexAccount.mountChip();

  const savedTheme = localStorage.getItem("codex.theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $("#themeToggle").onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    localStorage.setItem("codex.theme", t);
    // A custom background/text colour is an inline override that hides the light/dark switch.
    // Clear those overrides so the toggle always visibly works (custom accent is kept).
    const ex = window.CodexExtra;
    if (ex && ex.settings && (ex.settings.bg || ex.settings.inkColor)) {
      ex.settings.bg = ""; ex.settings.inkColor = "";
      localStorage.setItem(acctKey("codex.settings"), JSON.stringify(ex.settings));
      if (window.CodexUI && CodexUI.applySettings) CodexUI.applySettings(ex.settings);
      toast(`${t === "dark" ? "Dark" : "Light"} mode; custom background cleared (re-pick it in Settings if you want it)`);
    } else {
      toast(t === "dark" ? "Dark mode" : "Light mode");
    }
  };

  $("#sidebarToggle").onclick = () => collapseSidebar();
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
  // keystrokes: show the "/" hotbar instantly, and preview local lookups; but never
  // fire a command or an AI call on keystroke. Enter (or picking a command) runs it.
  $("#assistantInput").addEventListener("input", e => {
    const v = e.target.value;
    onAssistMenu(v);
    clearTimeout(assistLookupTimer);
    if (v.startsWith("/")) return;                 // commands wait for Enter
    assistLookupTimer = setTimeout(() => assistantLookup(v), 160); // free, instant local preview
  });
  $("#assistantInput").addEventListener("keydown", onAssistKeydown);
  $("#assistantInput").addEventListener("blur", () => setTimeout(hideCmdMenu, 150));

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
window.Codex = { DB, byId, mentionsOf, bestEntryFor, SRC, topicSummary, refresh, addNote, updateNote, deleteNote, categoriesList, factsOf, sentencesOf, visibleEntries, reloadWorkspace, deleteCustomSection, hideBuiltinSection, CANON_ORDER };
})();
