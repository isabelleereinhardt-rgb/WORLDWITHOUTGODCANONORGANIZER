/* ============================================================
   CONTINUITY

   Reads a draft the way the assistant reads the canon, then puts the
   two side by side and reports where they disagree. "This scene has
   Lily at nine; your canon says seven." "Vex speaks here; your canon
   says Doran killed him."

   This is the whole reason to put the organizer inside a word
   processor. Looking a fact up is convenient; being told, while you
   write, that you have just contradicted something you wrote eleven
   months ago is the thing no amount of care replaces — and on four
   hundred thousand words it is not a thing a person can do by
   remembering.

   Both sides of every comparison come from brain.js. The draft is
   handed to it as a single entry, so the trait patterns, the subject
   attribution and the negation guard all apply to a chapter exactly as
   they apply to an entry. A second, cheaper parser for drafts would
   disagree with the first one eventually, and then the warnings could
   not be trusted.

   The bar for reporting is deliberately high. A checker that cries
   wolf gets switched off within a day, so anything ambiguous is
   dropped rather than guessed at: only facts that are single-valued
   (you have one age, one birthplace, one mother) are compared, only
   when both sides state one plainly, and never when the draft is
   simply silent.
   ============================================================ */
(function () {
"use strict";

/* Traits where two different answers is a contradiction rather than
   two true things. "Kicks dogs" and "protects orphans" can both be
   true of one person; two different ages cannot. */
const SINGLE = {
  age: "age",
  born: "birth",
  died: "death",
  from: "where they are from",
  lives: "where they live",
  married: "marriage",
  capital: "capital",
  seat: "seat",
  "founded-in": "founding",
  "ruled-by": "ruler",
  "founded-by": "founder",
  "killed-by": "death",
};

/* Someone the canon says is dead, speaking or acting in the draft. The
   most useful check there is, and the easiest to get wrong, so it only
   fires on a plain statement of death. */
const DEAD = /^(?:was\s+)?(?:killed|died|dead|slain|executed|murdered)\b/i;
const ALIVE_VERB = /\b(says?|said|asks?|asked|replies|replied|whispers?|whispered|shouts?|shouted|laughs?|laughed|smiles?|smiled|walks?|walked|rides?|rode|draws?|drew|stands?|stood|turns?|turned)\b/i;

/* Whether a line is a scene at all.

   Run against the real canon, the first version of the dead check
   reported four contradictions and every one was wrong. The cause was
   the same each time: much of this canon is not prose but character
   sheets and heraldry blocks, which carry no full stops, so one
   "sentence" runs for three hundred words. Somewhere inside it sits a
   dead person's name, and somewhere else the word "stands" — describing
   an ostrich on a crest. Merely containing both proves nothing.

   A scene is short, mostly lower case, and puts its verb after the
   person doing it. */
function isScene(s) {
  if (s.length > 300) return false;
  const words = s.trim().split(/\s+/);
  if (words.length < 4) return false;
  const capped = words.slice(1).filter(w => /^[A-Z]/.test(w)).length;
  return capped / words.length < 0.4;
}
/* "House Caraen" is not Caraen. The canon buried the man; the house he
   founded goes on standing in front of the city, and reading one as the
   other reported a contradiction in a sentence that had none. */
const STRUCTURAL = /(?:^|\s)(?:house|clan|order|saint|the\s+house\s+of)\s*$/i;
function actsInScene(s, name) {
  if (!isScene(s)) return false;
  const low = s.toLowerCase(), nl = name.toLowerCase();
  let at = low.indexOf(nl);
  while (at > -1) {
    if (!STRUCTURAL.test(s.slice(Math.max(0, at - 12), at))) {
      /* The verb has to follow the name closely enough to be that
         person's verb rather than somebody else's later in the line. */
      if (ALIVE_VERB.test(s.slice(at + name.length, at + name.length + 90))) return true;
    }
    at = low.indexOf(nl, at + 1);
  }
  return false;
}

function numbersIn(s) { return (String(s).match(/\d[\d,]*/g) || []).map(n => n.replace(/,/g, "")); }

/* Two clauses disagree when both name a value and the values differ.
   Numbers are compared as numbers, because "7" and "seven" and "8,544
   BR" are all things this canon writes; words are compared on their
   content, so "in Halden" and "in the city of Halden" agree. */
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function valueOf(clause) {
  const nums = numbersIn(clause);
  if (nums.length) return { kind: "n", v: nums.join("/") };
  const w = String(clause).toLowerCase().match(/\b([a-z]+)\b/g) || [];
  for (const x of w) if (WORDS[x] != null) return { kind: "n", v: String(WORDS[x]) };
  return null;
}
const NOISE = new Set(["is", "was", "were", "are", "the", "a", "an", "of", "in", "at", "on",
  "to", "by", "from", "with", "and", "her", "his", "their", "its", "city", "town", "house",
  "old", "years", "year", "age", "aged", "born", "died", "lives", "living"]);
function contentWords(clause) {
  return String(clause).toLowerCase().split(/[^a-z0-9’'-]+/)
    .filter(w => w.length > 2 && !NOISE.has(w));
}
function disagrees(a, b) {
  const va = valueOf(a), vb = valueOf(b);
  if (va && vb) return va.v !== vb.v;
  if (va || vb) return false;              // one states a number, the other does not
  const wa = contentWords(a), wb = contentWords(b);
  if (!wa.length || !wb.length) return false;
  /* Any shared content word means they are talking about the same
     thing and agreeing enough; no overlap at all is the disagreement. */
  return !wa.some(w => wb.indexOf(w) > -1);
}

/* ---------- the check ---------- */
function check(draftText, opts) {
  opts = opts || {};
  const B = window.CodexBrain, C = window.Codex;
  if (!B || !C || !B.read) return { ok: false, why: "The reading layer is not loaded.", findings: [] };
  const text = String(draftText || "").trim();
  if (!text) return { ok: true, findings: [], checked: 0, names: [] };

  /* The draft, dressed as an entry so brain.js will read it. */
  const draft = { id: "__draft", title: opts.title || "This draft", category: "My Notes",
    type: "note", text, wordcount: text.split(/\s+/).length };
  draft._hay = (draft.title + " " + text).toLowerCase();
  const ctx = { entries: [draft] };

  /* Who is in it. Names already in the canon are the ones worth
     comparing; a name that appears nowhere else is reported separately
     as possibly new or possibly a typo. */
  const known = new Set((C.DB.entities || []).map(n => n.toLowerCase()));
  const inDraft = [];
  (B.namesIn(text) || []).forEach(n => {
    const nm = n.name || n;
    if (!inDraft.some(x => x.toLowerCase() === String(nm).toLowerCase())) inDraft.push(nm);
  });

  const findings = [];
  const compared = [];
  const limit = opts.limit || 40;

  for (const name of inDraft.slice(0, limit)) {
    if (!known.has(name.toLowerCase())) continue;
    let draftRead, canonRead;
    try {
      draftRead = B.read(name, ctx);
      canonRead = B.read(name, null);
    } catch (e) { continue; }
    if (!draftRead || !canonRead || !canonRead.traits.length) continue;
    compared.push(name);

    /* the single-valued facts, stated on both sides */
    Object.keys(SINGLE).forEach(k => {
      const d = draftRead.traits.find(t => t.k === k);
      const c = canonRead.traits.find(t => t.k === k);
      if (!d || !c) return;
      if (!disagrees(d.clause, c.clause)) return;
      findings.push({
        kind: "contradiction", about: SINGLE[k], name,
        draft: d.clause, canon: c.clause,
        quote: d.sentence, source: (c.entry && c.entry.title) || "your canon",
      });
    });

    /* somebody the canon buried, up and about */
    const dead = canonRead.traits.find(t => DEAD.test(t.clause));
    if (dead) {
      const acting = C.sentencesOf(text).find(s => actsInScene(s, name));
      if (acting) {
        findings.push({
          kind: "dead", about: "death", name,
          draft: acting.trim(), canon: dead.clause,
          quote: acting.trim(), source: (dead.entry && dead.entry.title) || "your canon",
        });
      }
    }
  }

  /* Names the canon has never heard of. Nearly always one of two
     things: somebody new, or the same person misspelled. Saying which
     is not this checker's job, but putting the near-miss beside it is. */
  const fresh = [];
  const counted = {};
  for (const name of inDraft) {
    if (known.has(name.toLowerCase())) continue;
    if (!couldBeName(name)) continue;
    counted[name] = countOf(text, name);
  }
  /* Named once in a chapter is usually a capital that wandered in from
     a heading; named twice is somebody. Ordered by how often, and
     capped, because a list of thirty maybes is a list nobody reads —
     the first honest run against real chapters produced twenty-seven
     per chapter, which is the same as producing none.

     That rule only makes sense at length, though. Check a paragraph you
     have just written and a new character will quite reasonably be in
     it once, so a short draft takes every name it finds. */
  const short = text.split(/\s+/).length < 120;
  let picked = Object.keys(counted)
    .filter(n => short || counted[n] > 1)
    .sort((a, b) => counted[b] - counted[a] || a.localeCompare(b));
  /* "Corwin" and "Corwin Ashgrove" are one person mentioned two ways.
     Listing both reads as two new characters, so the fuller name — the
     one that tells you more — stands for both. */
  picked = picked.filter(n => !picked.some(other =>
    other !== n && other.length > n.length &&
    new RegExp("(^|\\s)" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)").test(other)));
  picked.slice(0, opts.maxUnknown || 12)
    .forEach(name => fresh.push({
      kind: "unknown", name, seen: counted[name],
      near: nearest(name, C.DB.entities || []) || "",
    }));

  return { ok: true, findings, unknown: fresh, checked: compared.length, names: inDraft };
}

/* The headings a writer's own reference documents are full of. These
   are capitalised, repeated, and not people, and reporting them as
   possible new characters is how the list becomes unreadable. */
const HEADING = new Set(["Status", "Origin", "Founded", "Founder", "Seat", "Faction", "Wealth",
  "Military", "Religion", "Motto", "Sigil", "Words", "Region", "Capital", "Population",
  "Ruler", "Type", "Era", "Alignment", "Party", "Allegiance", "Rank", "Title", "Race",
  "Age", "Gender", "Born", "Died", "Domain", "Symbol", "Element", "Chapter", "Book", "Part",
  "Level", "Magic", "Division", "Combat", "Weaknesses", "Abilities", "Skills", "Notes",
  "Summary", "Overview", "Appearance", "Personality", "History", "Background", "Family",
  "Quick", "Facts", "Key", "Where", "What", "Why", "How", "Other", "Talents", "Values",
  "Beliefs", "Political", "Moral", "Code", "Specific", "Turning", "Points", "Draft", "TBD"]);

/* Words that begin sentences in prose and are capitalised for that
   reason alone. "Beside her stood Corwin" offered up Beside as a
   possible new character, which is the kind of suggestion that makes a
   reader stop trusting the list. */
const OPENER = new Set(["Beside", "Behind", "Beneath", "Below", "Above", "Across", "Around",
  "Beyond", "Inside", "Outside", "Toward", "Towards", "Within", "Without", "Against",
  "Between", "During", "Through", "Throughout", "Upon", "Under", "Over", "Along", "Among",
  "Then", "After", "Before", "While", "When", "Where", "Though", "Although", "Because",
  "Since", "Until", "Once", "Still", "Even", "Perhaps", "Maybe", "Instead", "Later",
  "Finally", "Suddenly", "Meanwhile", "Afterward", "Afterwards", "Nothing", "Nobody",
  "Everyone", "Someone", "Anything", "Everything", "Something", "Together", "Neither",
  "Either", "Never", "Always", "Often", "Sometimes", "Yesterday", "Tomorrow", "Tonight",
  "Outside", "Everywhere", "Nowhere", "Somewhere", "Whatever", "Whenever", "Whoever"]);

/* Something worth showing as a possible new character: written the way
   a name is written, and not a section heading in disguise. */
function couldBeName(raw) {
  const name = String(raw || "").trim();
  if (name.length < 3) return false;
  const words = name.split(/\s+/);
  if (words.length > 3) return false;
  if (/^[^a-z]+$/.test(name)) return false;                 // SHOUTED, so extraction wreckage
  if (words.some(w => HEADING.has(w))) return false;
  if (OPENER.has(words[0])) return false;
  // Title Case throughout: "Corwin", "Lady Vex"; not "Political Stance" (caught above)
  return words.every(w => /^[A-Z][a-zà-öø-ÿ'’-]+$/.test(w));
}
function countOf(text, name) {
  let re;
  try { re = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"); }
  catch (e) { return 1; }
  return (String(text).match(re) || []).length;
}

/* One edit away for a short name, two for a long one; the same rule the
   assistant uses when you mistype a name at it. */
function nearest(name, list) {
  const n = name.toLowerCase();
  if (n.length < 4) return "";
  const cap = n.length > 6 ? 2 : 1;
  let best = "", bestD = cap + 1;
  for (const other of list) {
    const o = other.toLowerCase();
    if (Math.abs(o.length - n.length) > cap) continue;
    const d = lev(n, o, cap);
    if (d < bestD) { bestD = d; best = other; if (d === 1) break; }
  }
  return best;
}
function lev(a, b, cap) {
  if (a === b) return 0;
  let prev = new Array(b.length + 1), cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}

window.CodexContinuity = { check, disagrees, SINGLE };
})();
