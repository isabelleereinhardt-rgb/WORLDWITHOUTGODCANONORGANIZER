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
    if (other.type !== entity.type) {
      return "“" + a + "” is already a " + other.type + ", and this is a " + entity.type + ".";
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

/* Replace everything known about one note in one go. Derived data is
   only ever rewritten wholesale; there is no partial state to get wrong. */
async function reindexNote(noteId, text) {
  mentions = mentions.filter(m => m.noteId !== noteId);
  const found = scan(noteId, text);
  mentions = mentions.concat(found);
  const counts = Object.create(null);
  mentions.forEach(m => { counts[m.entityId] = (counts[m.entityId] || 0) + 1; });
  entities.forEach(e => { e.seen = counts[e.id] || 0; });
  if (saveHook) await saveHook("mentions", { noteId, rows: found });
  return found.length;
}
async function forgetNote(noteId) {
  mentions = mentions.filter(m => m.noteId !== noteId);
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
function guessType(name) {
  if (/^(house|clan|order)\b/i.test(name)) return "house";
  return "concept";
}

window.CodexEntities = {
  TYPES, STATUS,
  load, migrate, onSave, ready: () => ready,
  all, confirmed, candidates, get, namesOf, resolve,
  create, rename, addAlias, merge, setStatus, setType, remove,
  checkAlias, checkLink, ancestors,
  scan, reindexNote, forgetNote, mentionsOf, notesMentioning, inNote,
  propose,
  _mentions: () => mentions.slice(),
};
})();
