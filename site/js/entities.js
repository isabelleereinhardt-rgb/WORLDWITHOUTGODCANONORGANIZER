/* ============================================================
   ENTITIES — every named thing in the world, as a record

   Until now a "name" in this app was an entry title. That one decision
   is behind most of what is wrong with it: a character who is only ever
   written about inside a chapter is invisible; "Kes" and "Kestrel
   Amadi" are two unrelated strings; and renaming an entry silently
   breaks every cross-reference to it, because the links were keyed on
   the title and the title just changed.

   The fix is the shape AO3 arrived at after fifteen years of people
   tagging fiction, and it is smaller than it sounds.

   A name is a record with an id. The id never changes and never derives
   from the name, so renaming is a rename rather than a deletion and a
   creation. Alternative names are aliases on the same record, which is
   AO3's `merger_id` — one pointer, doing all the work that fuzzy
   matching would otherwise do badly.

   Their invariants are worth copying exactly, because each one exists
   because somebody broke it:
     · an alias may only alias a record of the same type — "Kestrel" the
       character cannot be an alias of "Vane Hollow" the place;
     · hierarchy only between confirmed records, never candidates;
     · nothing may be its own ancestor.

   And their performance trick, which is what makes this viable in a
   browser: resolve names when the writing is SAVED, not when it is
   read. Every mention becomes a row pointing at an entity id, so the
   Name Index, a subject page, "appears in N entries" and the
   assistant's retrieval are all an indexed lookup instead of a regex
   sweep over four hundred thousand words. That is `FilterTagging` with
   the scale problem deleted.

   Nothing here decides anything on its own. Names found in prose arrive
   as candidates and wait for a person to say what they are. AO3 has
   volunteers reading tags by hand at a scale of millions of works and
   chose that deliberately over automation; the shipped index in this
   repository, with "ATION" and "Abstinences" sitting among 750 real
   names, is what the other choice looks like.
   ============================================================ */
(function () {
"use strict";

const TYPES = ["character", "place", "house", "event", "object", "concept"];
const STATUS = ["confirmed", "candidate", "rejected"];

let entities = [];          // the records
let mentions = [];          // derived: where each one is named
let claims = [];            // derived: the "Age: 34" lines, by record
let byId = Object.create(null);
let ready = false;

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const a = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}
function now() { return Date.now(); }
const norm = s => String(s || "").trim().toLowerCase();

/* ---------- the records ---------- */
function make(patch) {
  const e = Object.assign({
    id: "ent-" + uid(),
    type: "concept",
    name: "",
    aliases: [],
    parentId: null,
    metaIds: [],
    fields: {},
    status: "candidate",
    seen: 0,
    created: now(), updated: now(),
  }, patch || {});
  e.name = String(e.name || "").trim();
  e.aliases = (e.aliases || []).map(a => String(a).trim()).filter(Boolean);
  if (TYPES.indexOf(e.type) < 0) e.type = "concept";
  if (STATUS.indexOf(e.status) < 0) e.status = "candidate";
  return e;
}

function index() {
  byId = Object.create(null);
  entities.forEach(e => { byId[e.id] = e; });
}

function all() { return entities.slice(); }
function confirmed() { return entities.filter(e => e.status === "confirmed"); }
function candidates() { return entities.filter(e => e.status === "candidate"); }
function get(id) { return byId[id] || null; }

/* Every name a record answers to, canonical first. */
function namesOf(e) { return [e.name].concat(e.aliases || []).filter(Boolean); }

/* ---------- resolution ----------
   The whole point of the exercise: a string in, a record out, with
   aliases treated as equal to the canonical name. */
function resolve(text, opts) {
  const n = norm(text);
  if (!n) return null;
  const pool = (opts && opts.includeCandidates) ? entities : entities.filter(e => e.status !== "rejected");
  let hit = pool.find(e => norm(e.name) === n);
  if (hit) return hit;
  hit = pool.find(e => (e.aliases || []).some(a => norm(a) === n));
  if (hit) return hit;
  /* "House Solis" asked of a canon that files it as "Solis", and the
     other way round. Kept from the old lookup because people type both. */
  const bare = n.replace(/^house\s+/, "");
  if (bare !== n) {
    hit = pool.find(e => norm(e.name) === bare || (e.aliases || []).some(a => norm(a) === bare));
    if (hit) return hit;
  }
  hit = pool.find(e => norm(e.name) === "house " + n);
  return hit || null;
}

/* ---------- the invariants, borrowed from otwarchive ---------- */
function checkAlias(entity, alias) {
  const a = String(alias || "").trim();
  if (!a) return "An alias needs some text.";
  if (norm(a) === norm(entity.name)) return "That is already its name.";
  if ((entity.aliases || []).some(x => norm(x) === norm(a))) return "It already answers to that.";
  const other = resolve(a, { includeCandidates: true });
  if (other && other.id !== entity.id) {
    /* AO3: "A tag can only be a synonym of a tag in the same category
       as itself." Letting a character absorb a place is how an index
       quietly becomes wrong. */
    if (kindOf(other) !== kindOf(entity)) {
      return "“" + a + "” is already a " + kindOf(other) + ", and this is a " + kindOf(entity) + ".";
    }
    return "MERGE:" + other.id;      // same type: the caller may merge them
  }
  return "";
}

function ancestors(id, seen) {
  seen = seen || new Set();
  const e = get(id);
  if (!e || seen.has(id)) return seen;
  seen.add(id);
  if (e.parentId) ancestors(e.parentId, seen);
  (e.metaIds || []).forEach(m => ancestors(m, seen));
  return seen;
}
function checkLink(childId, parentId) {
  const child = get(childId), parent = get(parentId);
  if (!child || !parent) return "One of those no longer exists.";
  if (childId === parentId) return "Nothing can contain itself.";
  // AO3: "Meta taggings can only exist between canonical tags."
  if (child.status !== "confirmed" || parent.status !== "confirmed") {
    return "Both need to be confirmed first.";
  }
  if (ancestors(parentId).has(childId)) return "That would make a loop.";
  return "";
}

/* ---------- writing ---------- */
let saveHook = null;         // set by the app so this module needs no store
function onSave(fn) { saveHook = fn; }
async function persist(e) {
  e.updated = now();
  if (!byId[e.id]) { entities.push(e); byId[e.id] = e; }
  if (saveHook) await saveHook("entities", e);
  return e;
}

async function create(patch) { return persist(make(patch)); }

/* A rename is a rename. The old name becomes an alias, so every
   sentence already written about her still resolves — which is the
   whole reason ids exist. */
async function rename(id, nextName) {
  const e = get(id);
  if (!e) return null;
  const next = String(nextName || "").trim();
  if (!next || norm(next) === norm(e.name)) return e;
  if (e.name && !(e.aliases || []).some(a => norm(a) === norm(e.name))) e.aliases.push(e.name);
  e.name = next;
  e.aliases = e.aliases.filter(a => norm(a) !== norm(next));
  return persist(e);
}

async function addAlias(id, alias) {
  const e = get(id);
  if (!e) return { ok: false, why: "No such record." };
  const problem = checkAlias(e, alias);
  if (problem.startsWith("MERGE:")) return { ok: false, mergeWith: problem.slice(6), why: "Already known." };
  if (problem) return { ok: false, why: problem };
  e.aliases.push(String(alias).trim());
  await persist(e);
  return { ok: true, entity: e };
}

/* Two records that turn out to be one person. The survivor keeps its
   id — so nothing that pointed at it breaks — and swallows the other's
   names, fields and mentions. */
async function merge(keepId, dropId) {
  const keep = get(keepId), drop = get(dropId);
  if (!keep || !drop || keep.id === drop.id) return { ok: false, why: "Nothing to merge." };
  if (keep.type !== drop.type) return { ok: false, why: "Those are different kinds of thing." };
  namesOf(drop).forEach(n => {
    if (norm(n) !== norm(keep.name) && !keep.aliases.some(a => norm(a) === norm(n))) keep.aliases.push(n);
  });
  Object.keys(drop.fields || {}).forEach(k => { if (!(k in keep.fields)) keep.fields[k] = drop.fields[k]; });
  mentions.forEach(m => { if (m.entityId === drop.id) m.entityId = keep.id; });
  entities.forEach(e => { if (e.parentId === drop.id) e.parentId = keep.id; });
  entities = entities.filter(e => e.id !== drop.id);
  index();
  await persist(keep);
  if (saveHook) await saveHook("delete-entity", drop);
  return { ok: true, entity: keep };
}

async function setStatus(id, status) {
  const e = get(id);
  if (!e || STATUS.indexOf(status) < 0) return null;
  e.status = status;
  return persist(e);
}
async function setType(id, type) {
  const e = get(id);
  if (!e || TYPES.indexOf(type) < 0) return null;
  e.type = type;
  /* Somebody decided this. Reading the prose must not quietly change it
     back — including when the decision was "concept", which is a real
     answer and not the absence of one. */
  e.typed = true;
  return persist(e);
}
async function remove(id) {
  const e = get(id);
  if (!e) return;
  entities = entities.filter(x => x.id !== id);
  mentions = mentions.filter(m => m.entityId !== id);
  index();
  if (saveHook) await saveHook("delete-entity", e);
}

/* ---------- mentions: resolved once, on write ----------
   One pass over the text per save. Longest names first, so "House
   Patton" wins over "Patton" and the shorter one does not eat the
   longer one's letters. */
function scan(noteId, text) {
  const out = [];
  const body = String(text || "");
  if (!body) return out;
  const claimed = new Array(body.length).fill(false);
  const pairs = [];
  entities.forEach(e => {
    if (e.status === "rejected") return;
    namesOf(e).forEach(n => { if (n.length > 1) pairs.push({ n, e }); });
  });
  pairs.sort((a, b) => b.n.length - a.n.length);
  for (const { n, e } of pairs) {
    let re;
    try { re = new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi"); }
    catch (err) { continue; }
    let m;
    while ((m = re.exec(body))) {
      const from = m.index, to = from + m[0].length;
      let free = true;
      for (let i = from; i < to; i++) if (claimed[i]) { free = false; break; }
      if (!free) continue;
      for (let i = from; i < to; i++) claimed[i] = true;
      out.push({ id: "men-" + uid(), entityId: e.id, noteId, offset: from,
                 length: m[0].length, matchedText: m[0] });
      if (out.length > 4000) return out;      // one note cannot flood the index
    }
  }
  return out;
}

/* ---------- declared facts ----------
   People write "Age: 34" and "Seat: Lajazer" in their own notes, and
   the app has always been able to read those lines; it has just never
   compared one entry's answer with another's. Attributing each to a
   record is what turns that into something checkable, and it is the
   groundwork the contradiction inbox stands on: two different values
   for one field of one record is a conflict found by a table scan,
   with no model involved and nothing to get creative about.

   Attribution is deliberately narrow. A fact line belongs to whoever
   the entry is about — the record its title resolves to — and to
   nobody else. A sheet headed "Kestrel Amadi" saying "Age: 34" is
   about Kestrel; the same line inside a chapter that merely mentions
   her is not safe to attribute and is left alone. */
const FACT_LINE = /^([A-Z][\w '’-]{1,24})\s*:\s*(.+)$/;
function factsIn(noteId, text, title) {
  /* Who the entry is about. A sheet is often filed under something
     other than its subject — the chapter it belongs to, the date it was
     written — and announces who it is about on its first line instead,
     which is how most of this canon is written. That heading is the
     entry's own statement of its subject, so it outranks the filename.

     It is trusted only when it is short enough to BE a heading and
     resolves exactly. A chapter opening "Kestrel Amadi rode out at
     dawn" resolves to nothing and falls through to the title, which is
     the point: a name in a sentence is a mention, not a subject. */
  const first = String(text || "").split("\n").map(l => l.trim()).find(Boolean) || "";
  let owner = null;
  if (first && first.length <= 60 && !/[:.!?]$/.test(first)) owner = resolve(first);
  if (!owner && title) owner = resolve(title);
  if (!owner) return [];
  const out = [];
  String(text || "").split("\n").forEach(raw => {
    const line = raw.trim();
    if (!line || line.length > 140) return;
    const m = FACT_LINE.exec(line);
    if (!m) return;
    const key = m[1].trim().toLowerCase();
    /* A label is a label: "Spirit Animal", "House Words", "Age". A whole
       clause ending in a colon is prose — "The Story Of Yanxi Palace:
       Princess Adventures…" was being filed as a field called "the
       story of yanxi palace", which is not a fact about anybody. */
    if (key.split(/\s+/).length > 3) return;
    const value = m[2].trim().replace(/[;.]+$/, "");
    if (!value || value.length > 90) return;
    if (out.some(c => c.field === key)) return;      // the first answer in an entry wins
    out.push({ entityId: owner.id, field: key, value, noteId, quote: line });
  });
  return out;
}
function claimsFor(entityId) { return claims.filter(c => c.entityId === entityId); }
function allClaims() { return claims.slice(); }

/* Replace everything known about one note in one go. Derived data is
   only ever rewritten wholesale; there is no partial state to get wrong. */
async function reindexNote(noteId, text, title) {
  mentions = mentions.filter(m => m.noteId !== noteId);
  claims = claims.filter(c => c.noteId !== noteId);
  const found = scan(noteId, text);
  mentions = mentions.concat(found);
  claims = claims.concat(factsIn(noteId, text, title));
  const counts = Object.create(null);
  mentions.forEach(m => { counts[m.entityId] = (counts[m.entityId] || 0) + 1; });
  entities.forEach(e => { e.seen = counts[e.id] || 0; });
  if (saveHook) await saveHook("mentions", { noteId, rows: found });
  return found.length;
}
async function forgetNote(noteId) {
  mentions = mentions.filter(m => m.noteId !== noteId);
  claims = claims.filter(c => c.noteId !== noteId);
  if (saveHook) await saveHook("mentions", { noteId, rows: [] });
}

function mentionsOf(entityId) { return mentions.filter(m => m.entityId === entityId); }
function notesMentioning(entityId) {
  const seen = new Set();
  mentions.forEach(m => { if (m.entityId === entityId) seen.add(m.noteId); });
  return Array.from(seen);
}
function inNote(noteId) {
  const seen = new Set();
  mentions.forEach(m => { if (m.noteId === noteId) seen.add(m.entityId); });
  return Array.from(seen).map(get).filter(Boolean);
}

/* ---------- proposing names, never committing them ----------
   Capitalised runs that are not sentence-initial-only, seen more than
   once, and not already known. Precision does not have to be high,
   because nothing here becomes real until somebody clicks. */
const STOP = new Set(["The", "A", "An", "And", "But", "Or", "If", "So", "As", "At", "In", "On",
  "Of", "To", "For", "By", "With", "From", "Into", "Over", "Under", "When", "While", "After",
  "Before", "Then", "Now", "Here", "There", "This", "That", "These", "Those", "He", "She",
  "They", "It", "We", "You", "I", "His", "Her", "Their", "Its", "Our", "My", "What", "Who",
  "Why", "How", "Where", "Chapter", "Book", "Part", "Page", "One", "Two", "Three", "Not",
  "No", "Yes", "Later", "Beside", "Behind", "Between", "Because", "Since", "Until", "Once",
  "Still", "Even", "Perhaps", "Maybe", "Instead", "Finally", "Suddenly", "Meanwhile",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "Status", "Origin", "Founded", "Founder", "Seat",
  "Age", "Born", "Died", "Region", "Capital", "Ruler", "Type", "Era", "Notes", "Summary"]);
/* Honorifics and sheet furniture. These are shifted off the front of a
   name rather than rejecting it — "King Benjaien Nefest" is Benjaien
   Nefest — but standing alone they are not anybody. */
const NOT_ALONE = new Set(["King", "Queen", "Lord", "Lady", "Prince", "Princess", "Emperor",
  "Empress", "Duke", "Duchess", "Count", "Countess", "Baron", "Baroness", "Saint", "Ser",
  "Sir", "Doctor", "Captain", "General", "Council", "Battle", "Siege", "War", "Order",
  "House", "Clan", "Name", "Date", "Location", "Magic", "Aliases", "Archetype", "Birth",
  "Build", "Childhood", "Education", "Impact", "Attire", "Typical", "Research", "Needed",
  "Unresolved", "Questions", "Them", "Would", "Family", "Sisters", "Brothers", "Tale",
  "Appearance", "Personality", "History", "Background", "Abilities", "Skills", "Weaknesses",
  "Relationships", "Motivation", "Goals", "Fears", "Secrets", "Voice", "Role", "Arc"]);
/* Words that suggest the thing beside them is a person or a house.
   Anchored to the same line: these documents are full of "House: X"
   field labels, and a newline between the cue and the candidate meant
   every heading that happened to follow one looked like a character. */
const CUE = /\b(?:brother|sister|mother|father|son|daughter|wife|husband|cousin|uncle|aunt|lord|lady|ser|sir|king|queen|prince|princess|emperor|empress|duke|duchess|count|countess|baron|saint|doctor|captain|house|clan|order)[ \t]+$/i;

function propose(text, opts) {
  opts = opts || {};
  const body = String(text || "");
  if (!body) return [];
  const found = Object.create(null);
  const re = /\b[A-Z][a-zà-öø-ÿ'’-]{2,}(?:\s+[A-Z][a-zà-öø-ÿ'’-]{2,}){0,2}\b/g;
  let m, guard = 0;
  while ((m = re.exec(body)) && guard++ < 8000) {
    let name = m[0].trim();
    const words = name.split(/\s+/);
    let trimmed = false;
    while ((STOP.has(words[0]) || NOT_ALONE.has(words[0])) && words.length > 1) {
      words.shift(); name = words.join(" "); trimmed = true;
    }
    if (STOP.has(words[0]) && words.length === 1) continue;
    if (!name || name.length < 3 || STOP.has(name)) continue;
    if (words.some(w => STOP.has(w)) && words.length === 1) continue;
    /* A word followed by a colon is a field label. Character sheets are
       made of them — "Typical Attire:", "Location:", "Research Needed:"
       — and they were two thirds of what the first honest run against
       real canon offered up as possible new characters. */
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 3);
    if (/^\s*:/.test(after)) continue;
    /* Titles are shifted off the front of a real name above; on their
       own they are a rank, not a person. */
    if (words.length === 1 && NOT_ALONE.has(words[0])) continue;
    if (words.every(w => NOT_ALONE.has(w))) continue;
    const before = body.slice(Math.max(0, m.index - 30), m.index);
    /* Sentence-initial capitals explain themselves — but only the FIRST
       one. "Later Morrow Chase would say" had its capital explained by
       "Later", and once that word is taken off the front the name is no
       longer at the start of anything. */
    const sentenceStart = !trimmed && /(?:^|[.!?]["'”’)\]]?\s+)$/.test(before);
    const rec = found[name] || (found[name] = { name, count: 0, mid: 0, cue: false, words: words.length });
    rec.count++;
    if (!sentenceStart) rec.mid++;
    if (CUE.test(before)) rec.cue = true;
  }
  const minCount = opts.minCount || 2;
  return Object.keys(found)
    .map(k => found[k])
    /* Position explains one capital, not two in a row. "Ilya Vantar"
       opening a sentence is still obviously a name, and in fiction
       characters open sentences constantly — requiring a mid-sentence
       sighting threw away most of the real cast and kept the rest. */
    .filter(r => (r.mid > 0 || r.cue || r.words >= 2) && (r.count >= minCount || r.cue))
    .filter(r => !resolve(r.name, { includeCandidates: true }))
    .sort((a, b) => (b.cue - a.cue) || (b.count - a.count) || a.name.localeCompare(b.name))
    .slice(0, opts.limit || 60);
}

/* ---------- loading, and the one-time migration ---------- */
function load(rows, mentionRows) {
  entities = (rows || []).map(make);
  mentions = (mentionRows || []).slice();
  claims = [];
  inferred = Object.create(null);
  index();
  ready = true;
}

/* Every entry title becomes a confirmed record, which preserves exactly
   what the app does today; the writer re-types them at leisure. The
   pre-extracted canon names come in as candidates instead, because that
   list is where "ATION" lives. */
async function migrate(noteTitles, canonNames) {
  const made = [];
  for (const t of (noteTitles || [])) {
    const name = String(t || "").trim();
    if (!name || resolve(name, { includeCandidates: true })) continue;
    made.push(await create({ name, status: "confirmed", type: guessType(name) }));
  }
  for (const n of (canonNames || [])) {
    const name = String(n || "").trim();
    if (!name || resolve(name, { includeCandidates: true })) continue;
    made.push(await create({ name, status: "confirmed", type: guessType(name) }));
  }
  return made;
}
/* What a name looks like, before anybody has read a word of the prose.
   Only the shapes that cannot really be anything else — the rest is
   left to the reading below, because guessing from a name alone is how
   an index fills up with confident nonsense. */
function guessType(name) {
  const n = String(name || "").trim();
  if (/^(house|clan|order)\b/i.test(n)) return "house";
  if (/^(?:the\s+)?(?:battle|war|siege|fall|sack|rebellion|massacre|conquest|purge|plague|uprising|crusade|treaty)\s+of\b/i.test(n)
      || /\b(?:war|rebellion|uprising|massacre|crusade)$/i.test(n)) return "event";
  if (/^(?:mount|lake|river|isle|isles|cape|port|bay|gulf|strait)\b/i.test(n)) return "place";
  return "concept";
}

/* ============================================================
   WHAT A NAME TURNS OUT TO BE

   Typing seven hundred names by hand is not work anybody is going to
   do, and a Kind column that says "concept" seven hundred times is
   worse than no column at all. So the kinds are READ, from the same
   place everything else here is read from: the prose, through the
   mention rows that already know where every name appears.

   The evidence is grammatical rather than lexical, because grammar is
   what actually separates the kinds. Things happen IN a place and never
   in a person. A title stands before a person and before nothing else.
   Battles are OF somewhere. One sighting proves nothing; forty of them
   in agreement is an answer.

   Like the mention rows, this is derived and never stored. A type the
   writer has set by hand is a decision and outranks any amount of
   reading; a type nobody has set is re-read from the writing every time
   the app opens, so it cannot drift away from the text it describes.
   ============================================================ */
let inferred = Object.create(null);          // id -> kind, derived

const A_TITLE = "lord|lady|king|queen|emperor|empress|prince|princess|ser|sir|saint|st\\.?|duke|duchess|count|countess|baron|baroness|master|mistress|priest|priestess|commander|general|captain|maester|archon";
const KIN = "sister|brother|mother|father|son|daughter|wife|husband|cousin|aunt|uncle|niece|nephew|grandmother|grandfather";
const SETTLEMENT = "city|kingdom|realm|province|region|village|town|island|isle|port|valley|castle|keep|fortress|capital|land|lands|territory|empire|court|palace|temple|holdfast";

const CUES = [
  /* kind, what to look at, pattern, weight */
  ["character", "before", new RegExp("\\b(?:" + A_TITLE + ")\\s+$", "i"), 6],
  ["character", "before", new RegExp("\\b(?:his|her|their|my|our)\\s+(?:" + KIN + ")[,\\s]+$", "i"), 6],
  ["character", "before", new RegExp("\\b(?:" + KIN + ")\\s*,\\s*$", "i"), 4],
  ["character", "after", /^\s*(?:said|says|replied|asked|answered|whispered|shouted|laughed|smiled|nodded|wept|knelt|rode|drew|turned|watched|married|was born|had been born)\b/i, 4],
  ["character", "after", /^[’'ʼ]s\b/, 1],
  ["character", "after", /^[^.!?]{0,90}\b(?:she|he|her|his|him|herself|himself)\b/i, 1],

  ["place", "before", /\b(?:in|at|near|from|within|across|throughout|outside|toward|towards|into|beyond)\s+$/i, 3],
  ["place", "before", new RegExp("\\b(?:" + SETTLEMENT + ")\\s+of\\s+$", "i"), 6],
  ["place", "before", /\b(?:born|died|raised|fled|travelled|traveled|returned|arrived|sailed|marched)\s+(?:in|at|to|for)\s+$/i, 4],
  ["place", "after", /^\s*(?:lies|sits|stands|borders|is located|was founded|fell to)\b/i, 3],

  /* "the Battle of GreyNest" names an event, and the event is that whole
     phrase — GreyNest is the fortress town it was fought over. Reading
     it the other way filed six towns in this canon as battles, which is
     the sort of tidy-looking mistake nobody checks. Battles, sieges and
     treaties are named after places, so it is evidence of a place. */
  ["place", "before", /\bthe\s+(?:battle|war|siege|fall|sack|rebellion|massacre|conquest|treaty|council)\s+of\s+$/i, 4],

  /* An event is normally called one in its own name — "The Long Winter",
     "Battle of Afera" — which the name shapes above already settle. What
     is left here is corroboration, never enough on its own. */
  ["event", "before", /\b(?:during|after|before|since|until)\s+the\s+$/i, 2],
  ["event", "after", /^\s*(?:broke out|began|ended|lasted)\b/i, 3],

  ["house", "before", /\bhouse\s+$/i, 6],
  ["house", "before", /\bof\s+house\s+$/i, 6],
  ["house", "after", /^\s*(?:family|line|bloodline|holds|rules)\b/i, 2],
];

const WINDOW = 110;          // characters either side: a clause, not a page
const PER_RECORD = 60;       // sightings after which the answer will not change
const PER_NOTE = 8;          // and no one entry may supply more than this
const STRONG = 4;            // a cue worth this much stands on its own
const REPEATS = 5;           // this many weak ones stop being a coincidence

/* getText(noteId) -> the entry's text, or "". Batched: it yields to the
   browser so a canon this size cannot lock the page. */
async function classify(getText, opts) {
  opts = opts || {};
  const read = typeof getText === "function" ? getText : () => "";
  const next = Object.create(null);
  /* Sightings are sampled ACROSS entries, not taken in the order they
     were indexed. A main character's first sixty appearances are all in
     her own character sheet — "Full Name:", "Age:", "Birth:" — which is
     a form, not a sentence, and answers nothing about what she is. The
     evidence lives in the chapters, so every entry that names her gets
     a say and no single one can fill the sample. */
  const byEntity = Object.create(null);
  for (const m of mentions) {
    const per = byEntity[m.entityId] || (byEntity[m.entityId] = { total: 0, byNote: Object.create(null) });
    const list = per.byNote[m.noteId] || (per.byNote[m.noteId] = []);
    if (list.length < PER_NOTE && per.total < PER_RECORD * 4) { list.push(m); per.total++; }
  }
  const sampleOf = per => {
    const lists = Object.keys(per.byNote).map(k => per.byNote[k]);
    const out = [];
    for (let i = 0; out.length < PER_RECORD; i++) {
      let added = false;
      for (const l of lists) if (i < l.length) { out.push(l[i]); added = true; if (out.length >= PER_RECORD) break; }
      if (!added) break;
    }
    return out;
  };
  const texts = Object.create(null);
  const textOf = id => (id in texts) ? texts[id] : (texts[id] = String(read(id) || ""));

  let n = 0;
  for (const e of entities) {
    if (e.status === "rejected") continue;
    /* A shape the name itself settles, or a kind somebody chose: both
       are already answers, and reading forty sentences to second-guess
       them would be work spent to get less certain. */
    if (e.type !== "concept") continue;
    const shape = guessType(e.name);
    if (shape !== "concept") { next[e.id] = shape; continue; }
    const per = byEntity[e.id];
    if (!per) continue;
    const rows = sampleOf(per);
    if (!rows.length) continue;
    const score = Object.create(null), best = Object.create(null), hits = Object.create(null);
    for (const m of rows) {
      const text = textOf(m.noteId);
      if (!text) continue;
      const before = text.slice(Math.max(0, m.offset - WINDOW), m.offset);
      const after = text.slice(m.offset + m.length, m.offset + m.length + WINDOW);
      for (const [kind, side, re, weight] of CUES) {
        if (re.test(side === "before" ? before : after)) {
          score[kind] = (score[kind] || 0) + weight;
          hits[kind] = (hits[kind] || 0) + 1;
          if (weight > (best[kind] || 0)) best[kind] = weight;
        }
      }
    }
    const ranked = Object.keys(score).sort((a, b) => score[b] - score[a]);
    const top = ranked[0], second = ranked[1];
    /* A margin, not a plurality: calling a character a place strips her
       family off her record, so a close call stays unanswered.

       And the evidence has to be worth something — either one cue that
       stands on its own, or a weak one that keeps happening. Both halves
       are needed. Requiring the strong cue alone lost most of the cast,
       because a name the narration follows for four hundred pages is
       rarely introduced as "Lady Vandrea" and is constantly "Vandrea's"
       and "she"; allowing accumulation alone filed a village as a battle
       off three vague sentences. */
    const enough = best[top] >= STRONG || hits[top] >= REPEATS;
    if (top && score[top] >= 5 && enough &&
        score[top] >= (second ? score[second] : 0) + 3) next[e.id] = top;
    if (++n % 60 === 0) await new Promise(r => setTimeout(r, 0));
  }
  inferred = next;
  return inferred;
}

/* The kind to show and to filter on: what the writer set, else what the
   prose said, else nothing claimed. */
function kindOf(e) {
  const rec = typeof e === "string" ? get(e) : e;
  if (!rec) return "concept";
  if (rec.typed) return rec.type || "concept";
  if (rec.type && rec.type !== "concept") return rec.type;
  return inferred[rec.id] || "concept";
}
/* True when nobody said so and the app worked it out. The difference
   matters on screen: a guess should look like one. */
function kindWasRead(e) {
  const rec = typeof e === "string" ? get(e) : e;
  return !!(rec && !rec.typed && (!rec.type || rec.type === "concept") && inferred[rec.id]);
}
/* Only the kinds actually present, so the filter never offers an empty
   answer. */
function kinds() {
  const seen = Object.create(null);
  entities.forEach(e => { if (e.status === "confirmed") seen[kindOf(e)] = true; });
  return TYPES.filter(t => seen[t]);
}

window.CodexEntities = {
  TYPES, STATUS,
  load, migrate, onSave, ready: () => ready,
  all, confirmed, candidates, get, namesOf, resolve,
  create, rename, addAlias, merge, setStatus, setType, remove,
  classify, kindOf, kindWasRead, kinds,
  checkAlias, checkLink, ancestors,
  scan, reindexNote, forgetNote, mentionsOf, notesMentioning, inNote,
  claimsFor, allClaims,
  propose,
  _mentions: () => mentions.slice(),
};
})();
