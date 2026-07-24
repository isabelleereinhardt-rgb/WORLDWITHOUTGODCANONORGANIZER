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

/* ---------- indexes (rebuildable, so imported notes fold in) ---------- */
const byId = {};
let entitySet = new Set(), sortedEntities = [], ENT_RE = null;
function buildIndexes() {
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
   ============================================================ */
async function loadNotes() {
  if (!window.CodexStore) return;
  await CodexStore.ready;
  const notes = (await CodexStore.all("notes")).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  // drop any previously-merged notes before re-merging
  for (let i = DB.entries.length - 1; i >= 0; i--) if (DB.entries[i]._user) DB.entries.splice(i, 1);
  notes.forEach(mergeNote);
  const cat = DB.categories.find(c => c.name === "My Notes");
  if (notes.length) { if (cat) cat.count = notes.length; else DB.categories.push({ name: "My Notes", count: notes.length }); }
  DB.stats.entries = DB.entries.length;
}
function mergeNote(n) {
  const text = n.text || "";
  const e = {
    id: n.id, title: n.title || "Untitled note", text,
    summary: text.replace(/\s+/g, " ").slice(0, 180),
    category: "My Notes", type: "note",
    wordcount: text.split(/\s+/).filter(Boolean).length,
    images: n.images || [], source: null, _user: true,
  };
  DB.entries.push(e);
  if (e.title && !DB.entities.includes(e.title)) DB.entities.push(e.title);
  return e;
}
async function addNote(title, text, images) {
  const note = {
    id: "note-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    title: title || "Untitled note", text: text || "", images: images || [],
  };
  await CodexStore.put("notes", note);
  mergeNote(note);
  const cat = DB.categories.find(c => c.name === "My Notes");
  if (cat) cat.count++; else DB.categories.push({ name: "My Notes", count: 1 });
  DB.stats.entries = DB.entries.length;
  buildIndexes(); buildNav();
  return note;
}
async function deleteNote(id) {
  await CodexStore.del("notes", id);
  const i = DB.entries.findIndex(e => e.id === id); if (i >= 0) DB.entries.splice(i, 1);
  const cat = DB.categories.find(c => c.name === "My Notes"); if (cat) cat.count = Math.max(0, cat.count - 1);
  buildIndexes(); buildNav();
}

/* ============================================================
   SIDEBAR
   ============================================================ */
function buildNav() {
  const nav = $("#nav");
  const cats = DB.categories.map(c =>
    `<div class="nav-item" data-route="#/browse/${encodeURIComponent(c.name)}">
       <span class="dot" style="background:${catColor(c.name)}"></span>
       <span>${esc(c.name)}</span><span class="count">${c.count}</span>
     </div>`).join("");
  nav.innerHTML = `
    <div class="nav-section">
      <div class="nav-item" data-route="#/">${svg("home")}<span>Home</span></div>
      <div class="nav-item" data-route="#/maps">${svg("atlas")}<span>Atlas &amp; Galleries</span></div>
      <div class="nav-item" data-route="#/index">${svg("index")}<span>Name Index</span></div>
    </div>
    <div class="nav-section">
      <div class="nav-title">The Canon</div>${cats}
    </div>
    <div class="nav-section">
      <div class="nav-title">Your Workspace</div>
      <div class="nav-item" data-route="#/docs">${svg("doc")}<span>Documents</span></div>
      <div class="nav-item" data-route="#/slides">${svg("slides")}<span>Slide Decks</span></div>
      <div class="nav-item" data-route="#/canvases">${svg("canvas")}<span>Canvases &amp; Mood Boards</span></div>
      <div class="nav-item" data-route="#/import">${svg("import")}<span>Import &amp; Add Lore</span></div>
    </div>
    <div class="nav-section">
      <div class="nav-title">Data</div>
      <div class="nav-item mini" id="navExport">${svg("backup")}<span>Back up my work</span></div>
      <div class="nav-item mini" id="navImport">${svg("restore")}<span>Restore backup</span></div>
    </div>`;
  $$("#nav .nav-item[data-route]").forEach(el =>
    el.onclick = () => { location.hash = el.dataset.route; if (innerWidth < 860) collapseSidebar(true); });
  $("#navExport").onclick = backupAll;
  $("#navImport").onclick = restoreAll;
  markActive();
}
function markActive() {
  const h = location.hash || "#/";
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
  const cards = DB.categories.map(c => `
    <a class="cat-card" href="#/browse/${encodeURIComponent(c.name)}">
      <span class="bar" style="background:${catColor(c.name)}"></span>
      <span class="cdot lg" style="background:${catColor(c.name)}"></span>
      <h3>${esc(c.name)}</h3>
      <div class="n">${c.count} ${c.count === 1 ? "entry" : "entries"}</div>
    </a>`).join("");
  view.innerHTML = `
    <div class="hero">
      <div class="page-kicker">Your worldbuilding codex</div>
      <h1>Everything you've built, calm and findable.</h1>
      <p>One quiet home for every character, house, map, and myth in <em>World Without God</em>.
         Search across it all, follow names wherever they lead, and write new lore right inside it.</p>
      <div class="hero-search">
        <input id="heroSearch" placeholder="Search a name, place, house, or idea…">
        <button class="btn" onclick="location.hash='#/docs'">New document</button>
      </div>
      <div class="stat-row">
        <div><b>${s.entries || 0}</b> entries</div>
        <div><b>${s.entities || 0}</b> cross-linked names</div>
        <div><b>${s.images || 0}</b> images &amp; maps</div>
        <div><b>${(DB.categories || []).length}</b> collections</div>
      </div>
    </div>
    <div class="cat-grid">${cards}</div>`;
  const hs = $("#heroSearch");
  hs.onkeydown = e => { if (e.key === "Enter" && hs.value.trim()) location.hash = "#/search/" + encodeURIComponent(hs.value.trim()); };
  hs.addEventListener("input", () => { if (hs.value.trim().length >= 2) openSearch(hs.value.trim()); });
}

function viewBrowse(cat) {
  const items = DB.entries.filter(e => e.category === cat).sort((a, b) => a.title.localeCompare(b.title));
  const cards = items.map(e => entryCard(e)).join("") || `<div class="empty-state">Nothing here yet.</div>`;
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${catDot(cat)} Collection</div>
    <h1>${esc(cat)}</h1>
    <p class="muted">${items.length} ${items.length === 1 ? "entry" : "entries"}</p>
    <div class="list-grid">${cards}</div>
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
  const noteControls = e._user ? `<button class="btn ghost sm" id="delNote">Delete note</button>` : "";

  view.innerHTML = `<div class="wrap">
    <div class="reading">
      <div class="entry-head"><div class="page-kicker" style="margin:0">${catDot(e.category)} ${esc(e.category)}</div></div>
      <h1>${esc(e.title)}</h1>
      <div class="entry-actions">
        <button class="btn sm" id="askAssistant">${svg("spark")} Ask the assistant about this</button>
        ${pdfLink}
        <button class="btn ghost sm" id="copyText">Copy text</button>
        ${noteControls}
      </div>
      ${body}
      ${relImgs}
      ${backHtml}
    </div>
  </div>`;

  $$(".xref", view).forEach(x => x.onclick = () => location.hash = "#/subject/" + encodeURIComponent(x.dataset.subject));
  bindGallery();
  $("#askAssistant").onclick = () => { openAssistant(); assistantLookup(e.title); };
  $("#copyText").onclick = () => { navigator.clipboard.writeText(e.text); toast("Copied to clipboard"); };
  if ($("#delNote")) $("#delNote").onclick = async () => { if (confirm("Delete this note?")) { await deleteNote(e.id); location.hash = "#/browse/" + encodeURIComponent("My Notes"); } };
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
function viewMaps() {
  const galleries = DB.entries.filter(e => e.type === "gallery");
  const mapDocs = DB.entries.filter(e => e.category === "Maps & Locations" && e.type === "pdf");
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${svg("atlas")} Atlas</div>
    <h1>Atlas &amp; Galleries</h1>
    <p class="muted">Maps, flags, and visual reference plates.</p>
    <div class="list-grid">
      ${galleries.map(e => `<a class="entry-card" href="#/entry/${e.id}"><h3>${esc(e.title)}</h3><p>${e.images.length} images</p>
        <div class="meta">Gallery</div></a>`).join("")}
      ${mapDocs.map(e => entryCard(e)).join("")}
    </div>
  </div>`;
}
function bindGallery() {
  $$(".gallery figure", view).forEach(f => f.onclick = () => {
    const lb = document.createElement("div"); lb.className = "lightbox";
    lb.innerHTML = `<img src="${f.dataset.full}">`; lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  });
}

/* ---------- name index ---------- */
function viewIndex() {
  const groups = {};
  DB.entities.forEach(n => { const L = (n[0] || "#").toUpperCase(); (groups[L] = groups[L] || []).push(n); });
  const letters = Object.keys(groups).sort();
  view.innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${svg("index")} Index</div>
    <h1>Name Index</h1>
    <p class="muted">Every cross-linked name in your world. Click any to gather its mentions and a summary.</p>
    ${letters.map(L => `<h3 style="font-family:var(--serif);margin-top:26px">${esc(L)}</h3>
      <div class="recog">${groups[L].sort().map(n => `<span class="chip" data-subject="${esc(n)}">${esc(n)}</span>`).join("")}</div>`).join("")}
  </div>`;
  $$(".chip[data-subject]", view).forEach(c => c.onclick = () => location.hash = "#/subject/" + encodeURIComponent(c.dataset.subject));
}

/* ---------- IMPORT / add lore ---------- */
function viewImport() {
  view.innerHTML = `<div class="wrap">
    <div class="page-kicker">${svg("import")} Import &amp; Add Lore</div>
    <h1>Add to your canon</h1>
    <p class="muted">Drop in text or Markdown files, paste writing directly, or add images. Text you add is
      indexed straight away — it becomes searchable, cross-linked, and the assistant reads it too. Everything
      you add here is stored privately in this browser (back it up from the sidebar).</p>

    <div class="dropzone" id="dropzone">
      <div class="dz-inner">
        <div class="dz-title">Drag files here, or click to choose</div>
        <div class="dz-sub">Text &amp; Markdown (.txt, .md) become searchable lore · images become a gallery ·
          a Codex <b>.json</b> backup is restored</div>
      </div>
      <input type="file" id="fileInput" multiple accept=".txt,.md,.markdown,.json,application/json,text/plain,text/markdown,image/*" hidden>
    </div>

    <h3 style="font-family:var(--serif);margin-top:34px">Or write / paste it in</h3>
    <input class="import-title" id="pasteTitle" placeholder="Title (e.g. a character, place, or note)">
    <textarea class="import-body" id="pasteBody" placeholder="Paste or type the lore here…"></textarea>
    <div style="margin-top:12px"><button class="btn" id="addPaste">Add to my canon</button></div>

    <div id="importLog" class="import-log"></div>
  </div>`;

  const dz = $("#dropzone"), fi = $("#fileInput");
  dz.onclick = () => fi.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); handleFiles(e.dataTransfer.files); };
  fi.onchange = () => handleFiles(fi.files);

  $("#addPaste").onclick = async () => {
    const t = $("#pasteTitle").value.trim(), b = $("#pasteBody").value.trim();
    if (!b) { toast("Nothing to add yet"); return; }
    const note = await addNote(t || ("Note " + new Date().toLocaleDateString()), b, []);
    logImport(`Added <b>${esc(note.title)}</b> to your canon.`);
    $("#pasteTitle").value = ""; $("#pasteBody").value = "";
    location.hash = "#/entry/" + note.id;
  };
}
function logImport(msg) { const l = $("#importLog"); if (l) l.innerHTML = `<div class="import-ok">✓ ${msg} <a href="#/browse/${encodeURIComponent("My Notes")}">See “My Notes” →</a></div>` + l.innerHTML; }

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const images = [];
  for (const f of files) {
    const name = f.name || "file";
    if (/^image\//.test(f.type)) {
      try { images.push(await window.CodexImg.fileToScaledDataURL(f)); } catch (e) { logImport(`Couldn't read image ${esc(name)}`); }
    } else if (/\.json$/i.test(name) || f.type === "application/json") {
      try {
        const txt = await f.text(); const data = JSON.parse(txt);
        if (data && data._codex) { await CodexStore.importAll(data); await loadNotes(); buildIndexes(); buildNav(); logImport(`Restored your Codex backup <b>${esc(name)}</b>.`); }
        else { const note = await addNote(name.replace(/\.json$/i, ""), txt, []); logImport(`Added <b>${esc(note.title)}</b>.`); }
      } catch (e) { logImport(`Couldn't read ${esc(name)}`); }
    } else {
      try {
        const txt = await f.text();
        const note = await addNote(name.replace(/\.(txt|md|markdown)$/i, ""), txt, []);
        logImport(`Added <b>${esc(note.title)}</b> (${note.text.split(/\s+/).filter(Boolean).length} words).`);
      } catch (e) { logImport(`Couldn't read ${esc(name)}`); }
    }
  }
  if (images.length) {
    const note = await addNote("Imported images · " + new Date().toLocaleDateString(), "", images);
    logImport(`Added ${images.length} image${images.length === 1 ? "" : "s"} as a gallery.`);
  }
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
  if (!q.trim()) { box.innerHTML = `<div class="sr-empty">Start typing to search your whole codex.</div>`; return; }
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

/* rich blurb: summary + facts + related + sources */
function blurbCard(name) {
  const e = bestEntryFor(name);
  if (!e) return `<div class="blurb"><div class="bt">${esc(name)}</div>
    <div class="bs faint">No canon entry yet — this name isn't in your lore.</div></div>`;
  const sents = topicSummary(name, 3);
  const summary = sents.length ? sents.join(" ") : (firstSentenceWith(e.text, name) || e.summary || "");
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

function assistantLookup(q) {
  const body = $("#assistantBody");
  q = (q || "").trim();
  if (!q) { assistantIdle(); return; }
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
function assistantIdle() {
  $("#assistantBody").innerHTML = `<div class="assistant-hint">
    ${svg("spark")} I read only what <b>you've</b> written.<br><br>
    Look up any name for an instant summary pulled from your canon, ask a question in plain words,
    or open a Document and I'll recognise names as you type.</div>`;
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
  // include tiny localStorage prefs too
  data.prefs = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("codex.")) data.prefs[k] = localStorage.getItem(k); }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "codex-backup-" + new Date().toISOString().slice(0, 10) + ".json";
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
        await loadNotes(); buildIndexes(); buildNav();
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
  else if (path === "docs") window.CodexEditor && CodexEditor.list(parts[1] || null);
  else if (path === "doc") window.CodexEditor && CodexEditor.open(parts[1]);
  else if (path === "slides") window.CodexEditor && CodexEditor.deckList(parts[1] || null);
  else if (path === "deck") window.CodexEditor && CodexEditor.deckOpen(parts[1]);
  else if (path === "canvases") window.CodexCanvas && CodexCanvas.list(parts[1] || null);
  else if (path === "canvas") window.CodexCanvas && CodexCanvas.open(parts[1]);
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
  try { if (window.CodexStore) { await CodexStore.ready; await loadNotes(); } } catch (e) { /* non-fatal */ }
  buildIndexes();
  buildNav();
  $("#app").classList.remove("loading");
  route();
  window.addEventListener("hashchange", route);

  const savedTheme = localStorage.getItem("codex.theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $("#themeToggle").onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    localStorage.setItem("codex.theme", t);
  };

  $("#sidebarToggle").onclick = () => collapseSidebar();
  if (innerWidth < 860) collapseSidebar(true);

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

window.Codex = { DB, byId, mentionsOf, bestEntryFor, SRC, topicSummary };
})();
