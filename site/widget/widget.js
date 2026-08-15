/* ============================================================
   THE READER'S CANON  (embeddable)

   A standalone page that hosts the same assistant your organizer runs,
   for readers rather than for you. It is built to be dropped into a
   Google Sites page — or any page — with an iframe, which forces three
   rules it does not get to break:

   It stores nothing. No localStorage, no IndexedDB, no cookies. Inside
   somebody else's frame this is third-party storage: Chrome and Firefox
   partition it, Safari refuses it outright, and a widget that depended
   on it would work on your machine and quietly fail on a reader's.
   Everything here lives in memory for the length of a visit.

   It is read-only. There is no writing back, no account, no key. The
   share token in the address grants exactly what read_shared() returns
   and nothing else, and it can be revoked from the app in one click.

   It reports its own height. A cross-origin frame cannot resize itself,
   so it posts its height to whoever embedded it; a host that listens can
   fit the frame, and one that does not still gets a widget that scrolls
   inside a fixed box.

   The canon can come from a share link (?share=TOKEN), from a plain
   JSON file (?src=canon.json), or from the canon shipped with this
   repository (?src=canon), which is what makes it demonstrable with no
   setup at all.
   ============================================================ */
(function () {
"use strict";

const P = new URLSearchParams(location.search);
const root = document.getElementById("w");
const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* ---------- state, such as it is ---------- */
let ENTRIES = [];
let NAMES = [];
let TITLE = P.get("title") || "The Canon";
let openId = null;

/* ---------- height, for whoever framed us ---------- */
let lastH = 0;
function reportHeight() {
  const h = Math.ceil(document.documentElement.scrollHeight);
  if (h === lastH) return;
  lastH = h;
  try { parent.postMessage({ codexWidget: "height", height: h }, "*"); } catch (e) {}
}
window.addEventListener("resize", reportHeight);

/* ---------- loading a canon ---------- */
async function fromShare(token) {
  const cfg = window.CODEX_CLOUD || {};
  if (!cfg.url || !cfg.key) throw new Error("This copy has no cloud configured, so a share link cannot be opened.");
  if (!window.supabase) throw new Error("The cloud library did not load.");
  const c = window.supabase.createClient(cfg.url, cfg.key);
  const { data, error } = await c.rpc("read_shared", { share_token: token });
  if (error) throw new Error(error.message || "That link was refused.");
  const rows = data || [];
  if (!rows.length) throw new Error("That link is empty, or it has been revoked.");
  return rows
    .filter(r => r.store === "notes")
    .map(r => noteToEntry(r.data || {}, r.local_id));
}

async function fromJson(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error("Could not read that canon file (" + res.status + ").");
  const j = await res.json();
  /* Accepts the shape this repo ships, a backup file, or a bare list. */
  if (Array.isArray(j)) return j.map(normalise);
  if (j.entries) return j.entries.map(normalise);
  if (j.stores && j.stores.notes) return j.stores.notes.map(n => noteToEntry(n, n.id));
  throw new Error("That file does not look like a canon.");
}

function normalise(e) {
  const text = e.text || "";
  return {
    id: e.id || ("e-" + Math.random().toString(36).slice(2, 9)),
    title: e.title || "Untitled",
    text,
    category: e.category || "My Notes",
    type: e.type === "gallery" ? "gallery" : (e.type || "pdf"),
    wordcount: e.wordcount || text.split(/\s+/).filter(Boolean).length,
    images: e.images || [],
    summary: e.summary || e.brief || text.replace(/\s+/g, " ").slice(0, 180),
  };
}
function noteToEntry(n, id) {
  return normalise({
    id: id || n.id, title: n.title, text: n.text, category: n.category,
    type: "note", images: n.images, summary: n.brief,
  });
}

/* ---------- wiring the assistant to this canon ----------
   window.Codex is the name brain.js looks for. Everything it needs is
   built by canon.js from the entries; nothing else on the page is
   required, because every optional companion (the persona, the model,
   the action catalogue) is guarded at its call site. */
function mount() {
  ENTRIES.forEach(e => { e._hay = (e.title + " " + e.text).toLowerCase(); });
  NAMES = ENTRIES.map(e => e.title).filter(Boolean);
  const harvested = window.CodexCanon.harvestNames(ENTRIES, 400);
  harvested.forEach(n => { if (NAMES.indexOf(n) < 0) NAMES.push(n); });
  window.Codex = window.CodexCanon.host(() => ENTRIES, { getEntities: () => NAMES });
}

/* ---------- the page ---------- */
function shell() {
  return `
    <header class="w-head">
      <div class="w-title">${esc(TITLE)}</div>
      <div class="w-count">${ENTRIES.length} ${ENTRIES.length === 1 ? "entry" : "entries"} · ${NAMES.length} names</div>
    </header>
    <div class="w-ask">
      <input id="wq" placeholder="Ask about a character, a house, a place…" autocomplete="off"
        aria-label="Ask about the canon">
      <button class="btn sm" id="wgo">Ask</button>
    </div>
    <div class="w-suggest" id="wsug"></div>
    <div class="w-out" id="wout"></div>
    <div class="w-cols">
      <div class="w-names">
        <div class="w-lab">Names</div>
        <input id="wfilter" class="w-filter" placeholder="Filter…" aria-label="Filter names">
        <div id="wlist" class="w-list"></div>
      </div>
      <div class="w-read" id="wread"></div>
    </div>
    <footer class="w-foot">Read from the author's canon. Answers are assembled from these entries in your
      browser; nothing is sent anywhere.</footer>`;
}

/* Openers worth clicking. "Who is Shapeshifting?" is what you get from
   taking the first few names off an index that also holds concepts,
   maps and magic, so the people are found rather than assumed: whoever
   is named inside an entry filed under Characters is a person by
   construction. This canon has sixty-six houses and three character
   entries, so picking by category alone would only ever offer houses. */
let PEOPLE = null;
function peopleNames() {
  if (PEOPLE) return PEOPLE;
  const inChars = ENTRIES.filter(e => /character/i.test(e.category));
  const found = new Set();
  inChars.forEach(e => window.Codex.entitiesIn(e.text).forEach(n => found.add(n)));
  PEOPLE = Array.from(found).filter(n => !/^(house|clan|order)\b/i.test(n));
  return PEOPLE;
}
function suggestions() {
  const people = peopleNames();
  const pool = (people.length >= 4 ? people : ENTRIES.map(e => e.title)).filter(Boolean);
  const picks = [];
  const used = new Set();
  for (let i = 0; i < pool.length && picks.length < 4; i++) {
    const n = pool[Math.floor((i * 7919 + suggestions.seed) % pool.length)];
    if (!n || used.has(n) || n.length > 26) continue;
    used.add(n);
    picks.push(n);
  }
  suggestions.seed += 3;
  return picks.map(n => {
    const person = people.indexOf(n) > -1;
    const q = (person ? "who is " : "what is ") + n;
    return `<button class="chip" data-ask="${esc(q)}">${esc(person ? "Who is " : "What is ")}${esc(n)}?</button>`;
  }).join("");
}
suggestions.seed = 0;

/* Text extracted from PDFs leaves wreckage in the name index — headings
   that lost their spaces (CHAPTERBYCHAPTER), words broken across a line
   (INSPIR, ATION), a typo shouted in a note (STUPIDY). You can live with
   those in your own index because you know what they are; a reader
   cannot. Every real name in this canon is written in title case, so
   shouting is the tell. */
function junkName(n) {
  return /^[^a-z]+$/.test(n) && /[A-Z]{2}/.test(n);
}

function renderNames(filter) {
  const f = (filter || "").toLowerCase().trim();
  /* The shipped index carries the same name at more than one casing, so
     filtering for "Patton" listed Patton twice and looked like a bug. */
  const seen = new Set();
  const list = NAMES.filter(n => {
    if (f && !n.toLowerCase().includes(f)) return false;
    if (junkName(n)) return false;
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 300);
  const el = document.getElementById("wlist");
  el.innerHTML = list.length
    ? list.map(n => `<button class="w-name" data-name="${esc(n)}">${esc(n)}</button>`).join("")
    : `<div class="w-empty">No name matches “${esc(filter)}”.</div>`;
}

function openById(id) {
  const e = ENTRIES.find(x => x.id === id);
  if (e) showEntry(e); else openEntry(id);
}
function openEntry(name) {
  const e = window.Codex.bestEntryFor(name);
  if (!e) {
    document.getElementById("wread").innerHTML =
      `<div class="w-empty">Nothing in this canon describes “${esc(name)}”.</div>`;
    reportHeight();
    return;
  }
  showEntry(e);
}
function showEntry(e) {
  const el = document.getElementById("wread");
  openId = e.id;
  const facts = window.Codex.factsOf(e, 8);
  const body = window.Codex.sentencesOf(e.text).slice(0, 18).join(" ");
  el.innerHTML = `
    <div class="w-entry">
      <div class="w-cat">${esc(e.category)}</div>
      <h2>${esc(e.title)}</h2>
      ${facts.length ? `<dl class="sc-facts">${facts.map(f =>
        `<dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd>`).join("")}</dl>` : ""}
      <p class="w-body">${esc(body)}</p>
      ${e.text.length > body.length ? `<p class="w-more">…${e.wordcount} words in full.</p>` : ""}
    </div>`;
  reportHeight();
}

function ask(q) {
  const out = document.getElementById("wout");
  if (!q.trim()) return;
  let r = null;
  try { r = window.CodexBrain.answer(q, { scope: "all" }); }
  catch (err) { r = null; }
  window.CodexBrain.reset();
  out.innerHTML = `<div class="w-turn">
      <div class="w-you">${esc(q)}</div>
      <div class="w-them">${r && r.html ? r.html : `<div class="assistant-hint">I could not find anything about that in this canon.</div>`}</div>
    </div>`;
  /* Cross-links inside an answer point at the app's routes, which do not
     exist here; they become a lookup in this widget instead. */
  out.querySelectorAll("[data-subject], .xref").forEach(a => {
    a.addEventListener("click", ev => {
      ev.preventDefault();
      openEntry(a.dataset.subject || a.textContent.trim());
    });
  });
  /* "Open entry" links at the app's own routes. Here it opens the entry
     in the panel below rather than going nowhere, which is what a dead
     button in an answer would otherwise do. */
  out.querySelectorAll("a[href^='#/entry/']").forEach(a => {
    const id = decodeURIComponent(a.getAttribute("href").replace("#/entry/", ""));
    a.removeAttribute("href");
    a.style.cursor = "pointer";
    a.addEventListener("click", ev => { ev.preventDefault(); openById(id); });
  });
  out.querySelectorAll("a[href^='#/']").forEach(a => { a.removeAttribute("href"); a.classList.add("w-dead"); });
  document.getElementById("wsug").innerHTML = suggestions();
  bindChips();
  reportHeight();
}

function bindChips() {
  document.querySelectorAll("[data-ask]").forEach(b => {
    b.onclick = () => { document.getElementById("wq").value = b.dataset.ask; ask(b.dataset.ask); };
  });
}

function draw() {
  root.className = "w";
  root.innerHTML = shell();
  document.getElementById("wsug").innerHTML = suggestions();
  renderNames("");
  bindChips();
  const q = document.getElementById("wq");
  document.getElementById("wgo").onclick = () => ask(q.value);
  q.addEventListener("keydown", e => { if (e.key === "Enter") ask(q.value); });
  document.getElementById("wfilter").addEventListener("input", e => { renderNames(e.target.value); reportHeight(); });
  document.getElementById("wlist").addEventListener("click", e => {
    const b = e.target.closest("[data-name]");
    if (b) openEntry(b.dataset.name);
  });
  const start = P.get("ask");
  if (start) { q.value = start; ask(start); }
  reportHeight();
}

function fail(msg) {
  root.className = "w";
  root.innerHTML = `<div class="w-fail">
    <div class="w-fail-h">This canon could not be opened</div>
    <p>${esc(msg)}</p>
    <p class="w-fail-s">An embed needs one of <code>?share=…</code> (a share link made in the app),
      <code>?src=…</code> (a canon file), or <code>?src=canon</code> for the canon shipped here.</p>
  </div>`;
  reportHeight();
}

(async function start() {
  try {
    const share = P.get("share"), src = P.get("src");
    if (share) ENTRIES = await fromShare(share.trim());
    else if (src === "canon") {
      await new Promise((ok, no) => {
        const s = document.createElement("script");
        s.src = "../data/db.js?v=20260728e";
        s.onload = ok; s.onerror = () => no(new Error("The bundled canon did not load."));
        document.head.appendChild(s);
      });
      const db = window.WORLD_DB || {};
      ENTRIES = (db.entries || []).map(normalise);
      NAMES = db.entities || [];
      if (!TITLE || TITLE === "The Canon") TITLE = "World Without God";
    } else if (src) ENTRIES = await fromJson(src);
    else return fail("No canon was named in the address.");

    if (!ENTRIES.length) return fail("That canon came back empty.");
    const keep = NAMES.slice();
    mount();
    if (keep.length) { NAMES = keep; }        // the shipped canon has a real index; keep it
    draw();
  } catch (e) {
    fail((e && e.message) || "Something went wrong opening it.");
  }
})();
})();
