/* ============================================================
   THE CANON CORE

   brain.js does not know what a browser is. It asks a host object for
   entries and a few ways of reading them — sentencesOf, mentionsOf,
   bestEntryFor, topicSummary, factsOf, entitiesIn — and answers
   questions from whatever comes back. The test suite has been proving
   that for a while now by running the whole understanding layer in Node
   with a hand-written stub.

   Which means the assistant was never tied to this website. It only
   ever needed somebody to hand it a canon.

   This file is that somebody, extracted so there is exactly one of it.
   Give it a function returning entries and it builds the host: the same
   retrieval, the same scoring, the same idea of which entry best
   describes a name. The app passes its own live DB. The reader's widget
   passes entries fetched from a share link. A Google Docs sidebar would
   pass the same. Three hosts, one implementation — because two copies of
   retrieval logic drift, and the day they disagree is the day the
   assistant answers one thing on your site and another in your draft.
   ============================================================ */
(function () {
"use strict";

/* Sentence splitting is the foundation everything else stands on: the
   brain quotes sentences, scores sentences, and reads statements out of
   them one at a time. */
function sentencesOf(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  const parts = t.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  return (parts && parts.length) ? parts.map(s => s.trim()) : (t ? [t] : []);
}

/* A sentence that makes a claim, as opposed to one that merely mentions
   somebody in passing. Used to prefer "Enyokia was the second daughter"
   over "and then Enyokia left". */
const DESCRIPTIVE = /\b(is|was|are|were|has|had|known|called|named|god|goddess|king|queen|house|city|kingdom|empire|born|died|ruler|rules?|leads?|founded|worship|magic|spell|the son|the daughter|married)\b/i;

/* "Status: dead" and its kin: the lines people write as declared facts
   rather than prose, which are worth reading as a table. */
const FACT_KEYS = /^(Status|Origin|Founded|Founder|Seat|Faction|Spirit Animal|Colors?|Colours?|Wealth|Military|Religion|Theme Song|House Words|Motto|Sigil|Words|Region|Capital|Population|Ruler|Type|Era|Alignment|Party|Allegiance|Rank|Title|Race|Age|Gender|Born|Died|Domain|Symbol|Element)\s*:/i;

const CANON_ORDER = ["Characters", "Noble Houses", "Maps & Locations", "Religion & Faith",
  "Magic System", "Timeline & History", "Culture & Fashion", "Books & Stories",
  "Reference & Lexicon", "Canon & Continuity"];

function factsOf(entry, limit) {
  limit = limit || 8;
  const facts = [];
  ((entry && entry.text) || "").split("\n").forEach(raw => {
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

/* The lowercased haystack every search runs against. Computed once per
   entry and cached on it, because doing it per question over 400,000
   words is the difference between an instant answer and a stutter. */
function hay(e) {
  if (!e._hay) e._hay = ((e.title || "") + " " + (e.text || "")).toLowerCase();
  return e._hay;
}
function readableByAI(e) { return e.aiRead !== false; }
function isEntry(e) { return e.type === "pdf" || e.type === "note"; }

/* One regex matching every known name at once. Capped, because a
   thousand-branch alternation is already at the edge of what a regex
   engine will do cheaply, and a canon can carry far more names than
   that. Longest first, so "House Patton" wins over "Patton". */
function entityRegex(names) {
  if (!names || !names.length) return null;
  const sorted = names.slice().sort((a, b) => b.length - a.length).slice(0, 1400);
  const pat = sorted.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  try { return new RegExp("\\b(" + pat + ")\\b", "g"); } catch (e) { return null; }
}

/* ---------- building a host ----------
   `getEntries` is a function rather than an array on purpose: the app's
   entries change as notes are added, and a host holding a stale array
   would answer from a canon that no longer exists. */
function host(getEntries, opts) {
  opts = opts || {};
  const entries = () => getEntries() || [];
  const names = () => (opts.getEntities ? opts.getEntities() : []) || [];

  /* The name regex is rebuilt only when the name list actually changes,
     which is rare, rather than on every question, which is not. */
  let cachedNames = null, cachedRe = null;
  function ent_re() {
    const list = names();
    if (list !== cachedNames) { cachedNames = list; cachedRe = entityRegex(list); }
    return cachedRe;
  }

  function entitiesIn(text) {
    const found = new Set();
    const re = ent_re();
    if (re) { re.lastIndex = 0; let m, c = 0; while ((m = re.exec(text)) && c < 500) { found.add(m[1]); c++; } }
    return found;
  }

  /* Where a name appears.

     When an entity index is available this is a lookup rather than a
     search: the rows were written when the note was saved. It also
     answers better than the search did, because a record's aliases
     resolve to the same id — an entry that only ever calls her "Kes"
     is an entry about Kestrel Amadi, and scanning for the canonical
     string would walk straight past it.

     The order and the filtering are deliberately identical to the scan
     below, so switching between them changes speed and reach and
     nothing else. Anything the index has never heard of — a common
     word, a phrase, a half-typed question — still falls through to the
     honest sweep. */
  function mentionsOf(name, excludeId, forAssistant) {
    const idx = opts.index;
    if (idx && idx.ready && idx.ready()) {
      const rec = idx.resolve(String(name));
      if (rec) {
        const ids = new Set(idx.notesMentioning(rec.id));
        if (ids.size) {
          return entries().filter(e => e.id !== excludeId && isEntry(e) &&
            ids.has(e.id) && (!forAssistant || readableByAI(e)));
        }
      }
    }
    const n = String(name).toLowerCase();
    return entries().filter(e => e.id !== excludeId && isEntry(e) &&
      hay(e).includes(n) && (!forAssistant || readableByAI(e)));
  }

  function bestEntryFor(name, forAssistant) {
    const n = String(name).toLowerCase();
    const pool = forAssistant ? entries().filter(readableByAI) : entries();
    const exact = pool.find(e => isEntry(e) && (e.title || "").toLowerCase() === n);
    if (exact) return exact;
    const houses = pool.find(e => isEntry(e) && (e.title || "").toLowerCase() === "house " + n);
    if (houses) return houses;
    const hits = mentionsOf(name, null, forAssistant);
    if (!hits.length) return null;
    /* An entry whose job is to track continuity mentions everybody and
       describes nobody, so it loses to a real one. */
    const metaPenalty = e => (e.category === "Canon & Continuity" || e.category === "Reference & Lexicon") ? 1 : 0;
    hits.sort((a, b) => metaPenalty(a) - metaPenalty(b) || (hay(b).split(n).length) - (hay(a).split(n).length));
    return hits[0];
  }

  function topicSummary(name, maxSent, forAssistant) {
    maxSent = maxSent || 4;
    const nl = String(name).toLowerCase();
    const lore = bestEntryFor(name, forAssistant);
    const cands = [];
    const consider = (e, boost) => {
      sentencesOf(e.text).forEach((s, idx) => {
        const sl = s.toLowerCase();
        if (sl.includes(nl) && s.length > 28 && s.length < 340) {
          let score = boost - idx * 0.015;
          if (idx < 3) score += 0.4;
          if (DESCRIPTIVE.test(s)) score += 0.7;
          try {
            if (new RegExp("^\\s*" + nl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(s)) score += 0.5;
          } catch (err) {}
          cands.push({ s: s.trim(), score });
        }
      });
    };
    if (lore) consider(lore, 3);
    mentionsOf(name, lore ? lore.id : null, forAssistant).slice(0, 6).forEach(e => consider(e, 1));
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

  return {
    get DB() { return { entries: entries(), entities: names() }; },
    CANON_ORDER: opts.CANON_ORDER || CANON_ORDER,
    sentencesOf, factsOf, entitiesIn, mentionsOf, bestEntryFor, topicSummary,
    catDot: opts.catDot || (() => ""),
    refresh: opts.refresh || (() => {}),
    /* A host with nowhere to write says so rather than pretending; the
       assistant checks this before offering to file anything. */
    addNote: opts.addNote || null,
    readOnly: !opts.addNote,
  };
}

/* ---------- names, harvested from writing ----------
   A workspace built from loose notes has no name index, because the
   index is made of entry titles. Pulling capitalised runs out of the
   prose gives the reader's widget something to list. */
const STOP = new Set(["The", "A", "An", "And", "But", "Or", "If", "When", "While", "After",
  "Before", "He", "She", "They", "It", "We", "You", "I", "His", "Her", "Their", "This",
  "That", "These", "Those", "There", "Then", "Now", "Here", "What", "Who", "Why", "How",
  "Chapter", "Book", "Part", "Page", "One", "Two", "Three", "Not", "No", "Yes", "So", "As",
  "At", "In", "On", "Of", "To", "For", "By", "With", "From", "Into", "Over", "Under"]);
function harvestNames(entries, limit) {
  const counts = Object.create(null);
  const re = /\b[A-Z][a-zà-öø-ÿ'’-]{2,}(?:\s+[A-Z][a-zà-öø-ÿ'’-]{2,}){0,2}\b/g;
  (entries || []).forEach(e => {
    const text = e.text || "";
    re.lastIndex = 0;
    let m, seen = 0;
    while ((m = re.exec(text)) && seen < 4000) {
      seen++;
      const raw = m[0].trim();
      const words = raw.split(/\s+/);
      if (STOP.has(words[0])) {
        if (words.length < 2) continue;
        words.shift();
      }
      const name = words.join(" ");
      if (!name || name.length < 3 || STOP.has(name)) continue;
      counts[name] = (counts[name] || 0) + 1;
    }
  });
  /* Named once anywhere is usually a stray capital at the start of a
     sentence; named twice is somebody. */
  return Object.keys(counts)
    .filter(n => counts[n] > 1)
    .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
    .slice(0, limit || 600);
}

/* ============================================================
   RANKING — BM25, lexical, and no embeddings anywhere

   A search that insists on every word is right when you type keywords
   and wrong when you ask a question. "What year did the chapel burn?"
   found nothing at all in a canon containing "the chapel burned in
   1147", because the word "year" appears nowhere in it and one missing
   term threw the whole query away.

   So: score instead of filter. BM25 is the standard for this and it
   suits invented proper nouns better than anything with embeddings in
   it — an embedding model has never seen Vane Hollow or Kestrel Amadi,
   while lexical matching handles them exactly. It also costs nothing,
   needs no network, and keeps the promise that nothing leaves the
   browser.

   Two departures from the textbook, both because this is a canon and
   not a web corpus. A hit in the title counts for much more than a hit
   in the body, because an entry named for the thing you asked about is
   usually the entry you want. And a rare word is worth far more than a
   common one, which is what IDF gives for free: in a world where every
   entry says "house", the entry that says "chapel" wins. */
const K1 = 1.4, B = 0.72;
function words(s) {
  return String(s || "").toLowerCase().match(/[a-z0-9à-öø-ÿ'’-]+/g) || [];
}
/* Crude, deliberately. "burn" must match "burned"; "archivist" must not
   become "archiv" and collide with something else. Only endings that
   are almost always inflection are removed, and never below four
   letters. */
function stem(w) {
  if (w.length < 5) return w;
  if (/(ies)$/.test(w)) return w.slice(0, -3) + "y";
  if (/(sses|shes|ches|xes)$/.test(w)) return w.slice(0, -2);
  if (/(ing)$/.test(w) && w.length > 6) return w.slice(0, -3);
  if (/(ed)$/.test(w) && w.length > 5) return w.slice(0, -2);
  if (/(s)$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
function bagOf(text) {
  const bag = Object.create(null);
  let n = 0;
  for (const w of words(text)) { const s = stem(w); bag[s] = (bag[s] || 0) + 1; n++; }
  return { bag, n };
}

/* `docs` are entries. Returns them scored, best first, dropping zeroes. */
function rank(query, docs, opts) {
  opts = opts || {};
  const qTerms = Array.from(new Set(words(query).map(stem)))
    .filter(t => t.length > 1 && !(opts.stop && opts.stop.has(t)));
  if (!qTerms.length || !docs.length) return [];

  const prepared = docs.map(d => {
    if (!d._bm || d._bmFor !== (d.text || "").length) {
      d._bm = bagOf((d.text || "") + " " + (d.title || ""));
      d._bmTitle = bagOf(d.title || "").bag;
      d._bmFor = (d.text || "").length;
    }
    return d;
  });
  const N = prepared.length;
  const avg = prepared.reduce((s, d) => s + d._bm.n, 0) / N || 1;

  const idf = Object.create(null);
  qTerms.forEach(t => {
    let n = 0;
    prepared.forEach(d => { if (d._bm.bag[t]) n++; });
    idf[t] = Math.log(1 + (N - n + 0.5) / (n + 0.5));
  });

  const out = [];
  prepared.forEach(d => {
    let score = 0, hits = 0;
    qTerms.forEach(t => {
      const f = d._bm.bag[t] || 0;
      if (!f) return;
      hits++;
      score += idf[t] * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d._bm.n / avg));
      // the title is the entry's own claim about what it is about
      if (d._bmTitle[t]) score += idf[t] * 2.2;
    });
    if (!hits) return;
    /* Matching three of the asked words beats matching one of them
       three times, which raw term frequency does not express. */
    score *= 1 + (hits - 1) * 0.35;
    out.push({ e: d, score, hits });
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}

window.CodexCanon = { host, sentencesOf, factsOf, entityRegex, harvestNames, rank, stem,
  CANON_ORDER, FACT_KEYS, DESCRIPTIVE };
})();
