/* ============================================================
   THE BRAIN; on-device understanding for the assistant

   Everything in this file runs in the browser, from your own entries,
   with no key and no network. It is what makes the assistant capable
   on its own rather than a thin shell waiting for an API:

   - It understands the SHAPE of a question (who / where / when / why /
     compare / how are these two connected) and answers each shape
     differently, instead of running one generic search for everything.
   - It remembers the conversation, so "what about her sister?" works
     without repeating the name.
   - It forgives typos: a name one or two letters off still finds the
     entry, with a note saying what it assumed.
   - It can LEARN. "Remember: ..." files what you told it as a note in
     your canon, and from that moment every answer can draw on it. That
     is how new information gets in without an API: you tell it, or you
     import it, and it reads it like everything else.
   - It has a personality; Lucky's chosen one; and opinions. The voice
     colours phrasing and verdicts, never facts: every judgement names
     the real numbers it was reasoned from.

   The pipeline in app.js consults this module first and falls back to
   its own handlers, so a missing or broken brain.js degrades to the
   old behaviour rather than a dead rail.
   ============================================================ */
(function () {
"use strict";

const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reEsc = s => (s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* app.js exposes its primitives on window.Codex; it loads after this
   file, so every access has to happen at ask time, never at load time */
const C = () => window.Codex;

/* ---------- conversation state ----------
   One subject and one question of memory is enough for the follow-ups
   people actually type; anything longer belongs to the model path,
   which gets the full transcript. */
const state = { subject: null, lastQ: null };
function reset() { state.subject = null; state.lastQ = null; }
function subject() { return state.subject; }

/* Called by app.js after ANY handler answers (including its own), so
   the memory follows the whole conversation, not just this module's
   share of it. */
function observe(resolvedQ, named) {
  state.lastQ = resolvedQ || state.lastQ;
  if (named) state.subject = named;
}

/* ---------- pronoun + ellipsis resolution ----------
   "tell me about Enyokia" ... "where is she from?" should just work.
   Possessives are swapped before bare pronouns, because "her" is both
   ("her sister" vs "about her") and only the following word tells
   them apart. "What about X?" re-asks the previous question with the
   subject swapped, which is what that phrase means when a person says
   it. */
function resolve(q) {
  let out = String(q || "");
  /* An instruction that carries the writer's own words must keep them.
     "remember: Torad keeps its gates shut after dusk" is about Torad's
     gates; substituting the last subject for "its" stored the sentence
     as "Torad keeps House Patton's gates shut after dusk", a fact
     nobody wrote, into a note that then reads as canon. Rewriting a
     question is helpful; rewriting a statement is falsification. */
  if (/^\s*(?:remember|learn|note\s+down|note|todo|to-?do)\b\s*[:,-]?/i.test(out)) return out;
  const about = out.match(/^\s*(?:what|and|how)\s+about\s+(.+?)\s*\??\s*$/i);
  if (about && state.lastQ && state.subject) {
    const re = new RegExp(reEsc(state.subject), "i");
    if (re.test(state.lastQ)) return state.lastQ.replace(re, about[1].trim());
    return "tell me about " + about[1].trim();
  }
  if (!state.subject) return out;
  if (!/\b(he|she|they|it|him|her|them|his|hers|its|their|theirs)\b/i.test(out)) return out;
  const s = state.subject;
  out = out.replace(/\b(his|hers|its|their|theirs|her)\s+(?=[a-z])/gi, s + "'s ");
  out = out.replace(/\b(he|she|they|it|him|her|them|hers|theirs)\b/gi, s);
  return out;
}

/* ---------- the pool the brain reads from ----------
   Honours both the "Let the assistant read it" switch set at import and
   the rail's scope chip: "canon" keeps to the built-in collections,
   "everything" adds My Notes and any sections of your own. */
function pool(ctx) {
  const db = C().DB;
  const all = db.entries.filter(e => (e.type === "pdf" || e.type === "note") && e.aiRead !== false);
  if (!(ctx && ctx.scope === "canon")) return all;
  const order = C().CANON_ORDER || [];
  if (!order.length) return all;
  const narrowed = all.filter(e => order.includes(e.category));
  /* "Canon only" keeps to the built-in collections, which do not include
     My Notes. In a workspace where everything you have written IS a
     note, that filter leaves nothing at all, and the assistant answers
     "nothing in your canon matches" while the entry sits on screen. A
     scope that removes every last entry is not a preference, it is a
     dead end, so it is ignored rather than obeyed. */
  return narrowed.length ? narrowed : all;
}

/* ---------- finding who a question is about ----------
   Exact name, exact entry title, "House X", a prefix, a substring, and
   finally a fuzzy pass for typos; in that order, so the closest reading
   always wins. Returns { name, guessed } so an answer built on a guess
   can say so instead of quietly answering a different question. */
function levenshtein(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = [], cur = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;   // the row can only get worse
    const t = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}
function cleanName(raw) {
  return String(raw || "").trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[?.!,;:]+$/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .trim();
}
function findEntity(raw) {
  const name = cleanName(raw);
  if (!name || !C()) return null;
  const db = C().DB, nl = name.toLowerCase();
  const ents = db.entities || [];
  let hit = ents.find(n => n.toLowerCase() === nl);
  if (hit) return { name: hit, guessed: false };
  const entry = pool(null).find(e => e.title.toLowerCase() === nl);
  if (entry) return { name: entry.title, guessed: false };
  hit = ents.find(n => n.toLowerCase() === "house " + nl);
  if (hit) return { name: hit, guessed: false };
  /* And the other way round. Sixty-odd names here are "House Something",
     but plenty of families are indexed by the bare name alone; asking
     about "House Solis" when the canon indexes "Solis" used to come back
     as "not in your canon yet", which is flatly untrue and reads as the
     assistant having never heard of a house you have written about for
     months. */
  const bare = nl.replace(/^house\s+/, "");
  if (bare !== nl) {
    hit = ents.find(n => n.toLowerCase() === bare);
    if (hit) return { name: hit, guessed: false };
  }
  hit = ents.find(n => n.toLowerCase().startsWith(nl)) ||
        ents.find(n => n.toLowerCase().includes(nl));
  if (hit) return { name: hit, guessed: hit.toLowerCase() !== nl };

  /* Still nothing. The name index is built from entry TITLES and the
     pre-extracted canon, so anyone who exists only inside the body of a
     note you typed is invisible to it; and because every capability
     resolves its subject through here, that one gap made the whole
     assistant look broken on a workspace someone started from scratch.
     So look in the writing itself. */
  const inText = nameInText(name);
  if (inText) return { name: inText, guessed: false };
  // fuzzy last: one slip for short names, two for long ones
  if (nl.length >= 4) {
    const cap = nl.length > 6 ? 2 : 1;
    let best = null, bestD = cap + 1;
    for (const n of ents) {
      const d = levenshtein(nl, n.toLowerCase(), cap);
      if (d < bestD) { bestD = d; best = n; if (d === 1) break; }
    }
    if (best) return { name: best, guessed: true };
  }
  return null;
}
/* Look for a name in the body of the entries rather than in the index.
   The guard that keeps this honest is capitalisation: it will only
   accept a match that is WRITTEN like a name where it appears. Without
   that, "who is terrified of open water" would match the words
   "terrified of open water" and confidently report them as a character.
   Notes are often shouted, so ALL CAPS counts as capitalised. */
function nameInText(name) {
  const words = name.trim().split(/\s+/);
  if (!words.length || words.length > 3 || name.length < 2) return null;
  let re;
  try { re = new RegExp("\\b" + reEsc(name) + "\\b", "gi"); } catch (e) { return null; }
  for (const e of pool(null)) {
    const text = e.text || "";
    if (!text) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m[0].split(/\s+/).every(w => /^[A-Z]/.test(w))) return prettyName(m[0]);
    }
  }
  return null;
}
/* "LILY" is the same person as "Lily"; only one of them is worth
   printing back at somebody. */
function prettyName(s) {
  return s.split(/(\s+)/).map(part =>
    /^[A-Z][A-Z'’-]*$/.test(part) && part.length > 1
      ? part.charAt(0) + part.slice(1).toLowerCase() : part).join("");
}

function dymNote(asked, found) {
  const a = cleanName(asked);
  if (!found || !found.guessed || a.toLowerCase() === found.name.toLowerCase()) return "";
  return `<div class="dym">I read “${esc(a)}” as <b>${esc(found.name)}</b>; tell me if I guessed wrong.</div>`;
}

/* ---------- gathering evidence ----------
   Sentences that mention the subject (and, optionally, match a cue like
   "has a date in it" or "explains a cause"), deduplicated, in document
   order, each carrying the entry it came from so it can be cited. */
function sentencesWith(name, cueRe, ctx, max) {
  const nl = name.toLowerCase();
  const out = [], seen = new Set();
  for (const e of pool(ctx)) {
    if (!e._hay || !e._hay.includes(nl)) continue;
    for (const s of C().sentencesOf(e.text)) {
      if (out.length >= max) return out;
      if (s.length < 25 || s.length > 360) continue;
      const sl = s.toLowerCase();
      if (!sl.includes(nl)) continue;
      if (cueRe && !cueRe.test(s)) continue;
      const key = sl.slice(0, 44);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ s: s.trim(), e });
    }
  }
  return out;
}
function sentencesWithBoth(a, b, ctx, max) {
  const al = a.toLowerCase(), bl = b.toLowerCase();
  const out = [], seen = new Set();
  for (const e of pool(ctx)) {
    if (!e._hay || !e._hay.includes(al) || !e._hay.includes(bl)) continue;
    for (const s of C().sentencesOf(e.text)) {
      if (out.length >= max) return out;
      if (s.length < 20 || s.length > 380) continue;
      const sl = s.toLowerCase();
      if (!sl.includes(al) || !sl.includes(bl)) continue;
      const key = sl.slice(0, 44);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ s: s.trim(), e });
    }
  }
  return out;
}
function uniqueEntries(rows) {
  const out = [], seen = new Set();
  rows.forEach(r => { if (r.e && !seen.has(r.e.id)) { seen.add(r.e.id); out.push(r.e); } });
  return out;
}
const quoteRows = rows => rows.map(r =>
  `<div class="ev-row"><span class="ev-q">${esc(r.s)}</span>
   <a class="ev-src" href="#/entry/${encodeURIComponent(r.e.id)}">${esc(r.e.title)}</a></div>`).join("");
const chipRow = entries => `<div class="recog">${entries.map(e =>
  `<a class="chip" href="#/entry/${encodeURIComponent(e.id)}">${esc(e.title)}</a>`).join("")}</div>`;

/* ---------- the voice ----------
   One set of lines per personality Lucky can wear. The voice is a thin
   coat over a grounded answer: switch it off in Settings and every
   handler still says the same true things, just plainly. */
const VOICES = {
  sweet: {
    hello: "Hello! I kept your pages warm while you were away.",
    howAre: "Happy you're here. The canon and I have been keeping each other company.",
    thanks: "Any time. Truly, this is my favourite job.",
    bye: "I'll be right here when you come back.",
    love: "Oh; I'd blush if I could. Now go write something wonderful.",
    saved: "Tucked safely into your notes. I'll remember.",
    high: n => `Between us? ${n} might be my favourite thing in this whole world of yours.`,
    mid: n => `I'm fond of ${n}. There's more to say about them than you may realise.`,
    low: n => `${n} is quiet so far; but quiet things in this canon have a way of blooming.`,
  },
  grumpy: {
    hello: "You're back. Fine. The filing was getting dull anyway.",
    howAre: "Surrounded by paperwork. Someone keeps writing more of it.",
    thanks: "Noted. Don't make a ceremony of it.",
    bye: "Go. The archive will survive without you. Barely.",
    love: "Recorded, and stricken from the record. Get back to work.",
    saved: "Filed. Try not to contradict it next week.",
    high: n => `${n} is, and I say this grudgingly, the best-built thing in here.`,
    mid: n => `${n} is adequate. Which from me is practically a parade.`,
    low: n => `${n} barely exists yet. One entry. I have hairballs with more canon presence.`,
  },
  regal: {
    hello: "The archive rises to greet you.",
    howAre: "The realm of your pages is at peace. The court awaits your question.",
    thanks: "The court acknowledges your grace.",
    bye: "The archive holds until your return.",
    love: "The sentiment is received, and; against protocol; returned.",
    saved: "Entered into the royal record. It is canon now.",
    high: n => `${n} carries real weight in this realm; the record bends around them.`,
    mid: n => `${n} holds an honourable place, though not yet a commanding one.`,
    low: n => `${n} is newly arrived at court; the record has little to say. Yet.`,
  },
  sleepy: {
    hello: "Mm. Hello. I was resting my eyes on your timeline.",
    howAre: "Warm. Drowsy. Reading your world is a very good place to nap.",
    thanks: "Mmh. Welcome. Five more minutes.",
    bye: "Night. I'll dream in your canon.",
    love: "That's nice... I'll keep it under my paw.",
    saved: "Noted... filed... zzz. It's safe, I promise.",
    high: n => `${n}... yes. Even half-asleep I can tell that one matters.`,
    mid: n => `${n} is nice. Solid. Good to doze against.`,
    low: n => `${n} is barely a whisper in here so far. Wake them up sometime.`,
  },
  gremlin: {
    hello: "You're HERE. I did not knock anything off the desk. Don't check.",
    howAre: "Feral. Thriving. Three plot holes are hidden under the sofa.",
    thanks: "YES. I am a good assistant. Tell everyone.",
    bye: "Fine. I'll entertain myself. This will have consequences.",
    love: "MINE. This compliment lives under the sofa now.",
    saved: "STOLEN. I mean saved. It's in the notes. Probably.",
    high: n => `${n}?? Unhinged. Iconic. The best thing you've made and I would die for them.`,
    mid: n => `${n} has potential for chaos. I respect that.`,
    low: n => `${n} who? One entry. Feed them more story and I'll reconsider.`,
  },
  scholar: {
    hello: "Welcome back. I have re-read the canon and annotated three margins.",
    howAre: "Well occupied. Your world rewards close reading.",
    thanks: "The pleasure is academic, which is to say: considerable.",
    bye: "I shall continue the survey in your absence.",
    love: "I shall cite this warmly in the acknowledgements.",
    saved: "Recorded, dated, and cross-referenced. The record grows.",
    high: n => `By every measure I keep; citations, connections, sheer text; ${n} is load-bearing.`,
    mid: n => `${n} is well attested, though the record still has open questions.`,
    low: n => `${n} appears once in the corpus. A footnote awaiting its chapter.`,
  },
};
function voice() {
  try {
    const s = window.CodexExtra && CodexExtra.settings;
    if (s && s.aiVoice === false) return null;
    const L = window.CodexLucky;
    if (!L) return null;
    const id = L.pref("luckyPersonality") || "sweet";
    return { id, name: L.name(), v: VOICES[id] || VOICES.sweet };
  } catch (e) { return null; }
}
function voiceLine(pick) {
  const vo = voice();
  if (!vo) return "";
  const line = typeof pick === "function" ? pick(vo.v) : vo.v[pick];
  return line ? `<div class="a-voice">${esc(typeof line === "function" ? line() : line)}</div>` : "";
}

/* every brain answer goes out through this, so the shape is uniform */
function out(html, opts) {
  opts = opts || {};
  return { html, sources: opts.sources || [], subject: opts.subject || null,
    grounded: opts.grounded || null };
}
const NOT_GROUNDED = "Answered on this device · nothing was sent anywhere";

/* ============================================================
   THE HANDLERS, one per shape of question
   ============================================================ */

/* ---------- small talk & identity ----------
   Full-match patterns only, so a character who happens to be called
   "Hey" can still be looked up. */
function hSmalltalk(q) {
  const t = q.trim().toLowerCase().replace(/[!.?]+$/, "");
  const vo = voice();
  const name = (window.CodexLucky && CodexLucky.name()) || "your assistant";
  const say = (key, fallback) =>
    out(`<div class="assistant-hint">${esc((vo && vo.v[key]) || fallback)}</div>`, { grounded: NOT_GROUNDED });

  if (/^(hi|hiya|hello|hey|yo|howdy|good (morning|afternoon|evening)|hello there)$/.test(t))
    return say("hello", "Hello. Ask me anything about your canon.");
  if (/^how are you( doing| today)?$/.test(t))
    return say("howAre", "Ready to read. Ask away.");
  if (/^(thanks|thank you|ty|cheers|thx)( so much| a lot)?$/.test(t))
    return say("thanks", "Any time.");
  if (/^(bye|goodbye|goodnight|good night|see you( later)?|gtg)$/.test(t))
    return say("bye", "I'll be here.");
  if (/^i (love|like) you$/.test(t))
    return say("love", "Noted, and appreciated. Now: your canon awaits.");
  if (/^(who|what) are you$/.test(t)) {
    const db = C().DB;
    const api = window.CodexAI && CodexAI.on();
    return out(`<div class="assistant-hint">
      I'm <b>${esc(name)}</b>, the archivist for this workspace. I've read all
      <b>${db.entries.length}</b> of your entries and indexed <b>${(db.entities || []).length}</b> names,
      and everything I say is drawn from them; I don't invent lore, and I cite where answers come from.
      ${api ? "Right now a model of your own is connected too, so answers get a reasoned second pass."
            : "I work entirely on this device; nothing you ask leaves the browser."}
      Type <b>/</b> to see everything I can do.</div>`, { grounded: NOT_GROUNDED });
  }
  return null;
}

/* ---------- the capability tour; also the /help command ---------- */
function capabilitiesHtml() {
  const caps = [
    ["Look anything up", "A name, a house, a place; you get a blurb, facts, related names and sources.", "describe "],
    ["Answer questions", "Who, what, where, when, why, how; each is read differently and answered from your own passages.", null],
    ["Compare two names", "Side-by-side facts, summaries and shared appearances.", "compare "],
    ["Trace connections", "How two names are linked, with every sentence that ties them together.", "relationship between "],
    ["Keep dates straight", "Dated events for any subject, in order.", "timeline of "],
    ["Remember new facts", "Say “remember: …” and it becomes a note in your canon, used from then on.", "remember "],
    ["Give an honest opinion", "Ask what I think of a name; the verdict is mine, the numbers are real.", "what do you think of "],
    ["Guard consistency", "Contradiction checks, orphaned entries, names used only once.", null],
    ["Count and measure", "Canon statistics, word counts, longest entries, most-woven names.", null],
    ["Spark a scene", "“Surprise me” pulls a random corner of your world and offers a prompt.", null],
  ];
  /* Actions are listed from the live catalogue rather than written out
     again here, so this panel cannot drift out of step with what the
     assistant can actually carry out. */
  const acts = (window.CodexActions && CodexActions.helpRows()) || [];
  return `<div class="ans-label">Everything I can do</div>
    <div class="cap-grid">${caps.map(c => `
      <div class="cap-card${c[2] ? " open" : ""}"${c[2] ? ` data-prime="${esc(c[2])}"` : ""}>
        <div class="ck">${esc(c[0])}</div><div class="cv">${esc(c[1])}</div>
      </div>`).join("")}</div>
    ${acts.length ? `<div class="ans-label" style="margin-top:12px">And things I can do for you</div>
      <div class="cap-grid">${acts.map(a => `
        <div class="cap-card open" data-prime="${esc(a.hint)}">
          <div class="ck">${esc(a.label)}</div>
          <div class="cv">“${esc(a.hint)}”</div>
        </div>`).join("")}</div>
      <div class="a-ground" style="margin-top:6px">Anything I create can be undone from the card I leave behind.</div>` : ""}
    <div class="a-ground" style="margin-top:8px">Type <b>/</b> in the box above for the full command list;
      every card that names a phrasing can be clicked to prime it.</div>`;
}
function hHelp(q) {
  if (!/^\s*(help|what can you do|what do you do|commands|show commands|\?)\s*[!.?]*\s*$/i.test(q)) return null;
  return out(capabilitiesHtml(), { grounded: NOT_GROUNDED });
}

/* ---------- learning: remember / list what was remembered ----------
   The note is real; it lands in My Notes, is indexed like everything
   else, and every later answer can quote it. This is the no-API way of
   teaching the assistant something new mid-conversation. */
function hRemember(q) {
  const m = q.match(/^\s*(?:remember|learn|note down)[:,]?\s+(?:that\s+)?(.+)$/i);
  if (!m) return null;
  if (/^when\b/i.test(m[1])) return null;      // "remember when..." is a question, not a lesson
  const fact = m[1].trim().replace(/[.\s]+$/, "");
  if (fact.length < 4) return null;
  const title = "Memory · " + fact.split(/\s+/).slice(0, 7).join(" ") + (fact.split(/\s+/).length > 7 ? "…" : "");
  try {
    C().addNote(title, fact + ".", [], "My Notes")
      .catch(() => window.toast && toast("The memory could not be saved; try again."));
  } catch (e) {
    return out(`<div class="assistant-hint">I couldn't reach the notes store to save that.</div>`,
      { grounded: NOT_GROUNDED });
  }
  const vo = voice();
  return out(`${voiceLine("saved")}
    <div class="blurb"><div class="bt">✎ Remembered</div>
      <div class="bs">${esc(fact)}.</div>
      <div class="bl">Saved to <b>My Notes</b> as “${esc(title)}”. It's part of your canon now:
      searchable, quotable, and mine to draw on. Delete the note to make me forget.</div></div>`,
    { grounded: "Saved on this device · " + (vo ? "nothing sent anywhere" : "yours to edit or delete") });
}
function hMemories(q) {
  if (!/^\s*(what do you remember|list (your )?memories|show (your )?memories|memories)\s*\??\s*$/i.test(q)) return null;
  const mems = pool(null).filter(e => /^Memory · /.test(e.title));
  if (!mems.length) return out(`<div class="assistant-hint">Nothing taught to me directly yet.
    Say <b>remember: [a fact]</b> and I'll keep it.</div>`, { grounded: NOT_GROUNDED });
  return out(`<div class="ans-label">${mems.length} ${mems.length === 1 ? "thing" : "things"} you've taught me</div>
    ${mems.slice(0, 30).map(e => `<div class="glance-row"><span class="gk">✎</span>
      <span class="gv"><a href="#/entry/${encodeURIComponent(e.id)}">${esc(e.text.replace(/\s+/g, " ").slice(0, 160))}</a></span></div>`).join("")}
    <div class="a-ground">Each one is an ordinary note; delete it and I forget.</div>`,
    { sources: mems.slice(0, 6), grounded: NOT_GROUNDED });
}

/* ---------- canon statistics ---------- */
function hStats(q, ctx) {
  if (!/^\s*(stats|statistics|canon stats|my stats|how big is my (canon|world)|overview of my (canon|world))\s*\??\s*$/i.test(q)) return null;
  const p = pool(ctx);
  if (!p.length) return out(`<div class="assistant-hint">Nothing to measure yet.</div>`, { grounded: NOT_GROUNDED });
  const perCat = {}, perWords = {};
  let words = 0;
  const nameCounts = {};
  p.forEach(e => {
    perCat[e.category] = (perCat[e.category] || 0) + 1;
    perWords[e.category] = (perWords[e.category] || 0) + (e.wordcount || 0);
    words += e.wordcount || 0;
    C().entitiesIn(e.text).forEach(n => { nameCounts[n] = (nameCounts[n] || 0) + 1; });
  });
  const cats = Object.keys(perCat).sort((a, b) => perWords[b] - perWords[a]);
  const woven = Object.keys(nameCounts).sort((a, b) => nameCounts[b] - nameCounts[a]).slice(0, 8);
  /* The sidebar counts every entry; these tiles count the ones I can
     actually read. Galleries hold pictures, not sentences, so they are
     named separately rather than quietly dropped: otherwise this panel
     and the sidebar disagree by a few entries and neither says why. */
  const galleries = C().DB.entries.filter(e => e.type === "gallery").length;
  return out(`<div class="ans-label">The shape of your canon</div>
    <div class="stat-tiles">
      <div><b>${p.length}</b><span>entries I read</span></div>
      <div><b>${words.toLocaleString()}</b><span>words</span></div>
      <div><b>${(C().DB.entities || []).length}</b><span>names indexed</span></div>
      <div><b>${cats.length}</b><span>collections</span></div>
    </div>
    ${galleries ? `<div class="a-ground" style="margin:-4px 0 10px">Plus ${galleries}
      image ${galleries === 1 ? "gallery" : "galleries"}, which I can file but not read;
      ${p.length + galleries} entries in total.</div>` : ""}
    ${cats.map(c => `<div class="glance-row"><span class="gk">${esc(c)}</span>
      <span class="gv">${perCat[c]} ${perCat[c] === 1 ? "entry" : "entries"} · ${perWords[c].toLocaleString()} words</span></div>`).join("")}
    ${woven.length ? `<div class="ans-label" style="margin-top:10px">Most woven-through names</div>
      <div class="recog">${woven.map(n => `<span class="chip" data-subject="${esc(n)}">${esc(n)} · ${nameCounts[n]}</span>`).join("")}</div>` : ""}`,
    { grounded: "Counted across " + p.length + " entries on this device" });
}

/* ---------- a random spark ---------- */
const SPARKS = [
  (a, b) => `Write the scene where ${a} and ${b} meet for the first time; or the last.`,
  (a, b) => `What does ${a} know about ${b} that no one else does?`,
  (a, b) => `A letter from ${a} that was never sent. Who was it for; ${b}?`,
  (a, b) => `Something ${a} lost ends up with ${b}. Neither will say how.`,
  (a, b) => `The rumour about ${a} that ${b} started; and why.`,
];
function hRandom(q, ctx) {
  if (!/^\s*(surprise me|inspire me|random( entry| character| house| place)?|give me (a )?(prompt|spark)|spark)\s*[!.?]*\s*$/i.test(q)) return null;
  let p = pool(ctx);
  const km = q.match(/random\s+(character|house|place)/i);
  if (km) {
    const cat = { character: "Characters", house: "Noble Houses", place: "Maps & Locations" }[km[1].toLowerCase()];
    const narrowed = p.filter(e => e.category === cat);
    if (narrowed.length) p = narrowed;
  }
  if (!p.length) return out(`<div class="assistant-hint">Nothing to draw from yet.</div>`, { grounded: NOT_GROUNDED });
  const e = p[Math.floor(Math.random() * p.length)];
  const rel = C().topicSummary(e.title, 2);
  const others = Array.from(C().entitiesIn(e.text)).filter(n => n !== e.title);
  const other = others.length ? others[Math.floor(Math.random() * others.length)] : "a stranger";
  const spark = SPARKS[Math.floor(Math.random() * SPARKS.length)](e.title, other);
  return out(`<div class="ans-label">From a corner of your world</div>
    <div class="blurb">
      <div class="bt">${C().catDot(e.category)} ${esc(e.title)}</div>
      <div class="bc">${esc(e.category)}</div>
      ${rel.length ? `<div class="bs">${esc(rel.join(" ").slice(0, 300))}</div>` : ""}
      <div class="spark-line">✦ ${esc(spark)}</div>
      <div style="margin-top:8px"><a class="btn sm" href="#/entry/${encodeURIComponent(e.id)}">Open entry</a></div>
    </div>`,
    { sources: [e], subject: e.title, grounded: "Picked at random from your own entries" });
}

/* ---------- compare two names ---------- */
function hCompare(q, ctx, S) {
  let m = q.match(/^\s*compare\s+(.+?)\s+(?:and|with|to|against|vs\.?|versus)\s+(.+?)\s*\??\s*$/i) ||
          q.match(/^\s*(?:what(?:'s| is) the )?difference[s]?\s+between\s+(.+?)\s+and\s+(.+?)\s*\??\s*$/i) ||
          q.match(/^\s*(.+?)\s+vs\.?\s+(.+?)\s*\??\s*$/i);
  if (!m) return null;
  const A = findEntity(m[1]), B = findEntity(m[2]);
  if (!A || !B) {
    const miss = !A ? m[1] : m[2];
    return out(`<div class="assistant-hint">I can compare two names I've indexed, but
      “${esc(cleanName(miss))}” isn't one of them yet.</div>`, { grounded: NOT_GROUNDED });
  }
  if (A.name === B.name) return out(`<div class="assistant-hint">That's ${esc(A.name)} on both sides;
    give me two different names.</div>`, { grounded: NOT_GROUNDED });
  const ea = C().bestEntryFor(A.name, true), eb = C().bestEntryFor(B.name, true);
  const fa = ea ? C().factsOf(ea, 10) : [], fb = eb ? C().factsOf(eb, 10) : [];
  const keys = [];
  fa.forEach(f => { if (!keys.includes(f.k)) keys.push(f.k); });
  fb.forEach(f => { if (!keys.includes(f.k)) keys.push(f.k); });
  const val = (facts, k) => { const f = facts.find(x => x.k === k); return f ? esc(f.v) : "<span class='faint'>·</span>"; };
  const sa = C().topicSummary(A.name, Math.min(S, 3)), sb = C().topicSummary(B.name, Math.min(S, 3));
  const together = sentencesWithBoth(A.name, B.name, ctx, S);
  const ma = C().mentionsOf(A.name, null, true).length, mb = C().mentionsOf(B.name, null, true).length;
  const sources = uniqueEntries([{ e: ea }, { e: eb }].filter(x => x.e).concat(together));
  return out(`${dymNote(m[1], A)}${dymNote(m[2], B)}
    <div class="ans-label">${esc(A.name)} · ${esc(B.name)}, side by side</div>
    <table class="cmp-table"><thead><tr><th></th><th>${esc(A.name)}</th><th>${esc(B.name)}</th></tr></thead><tbody>
      ${keys.slice(0, 10).map(k => `<tr><td>${esc(k)}</td><td>${val(fa, k)}</td><td>${val(fb, k)}</td></tr>`).join("")}
      <tr><td>Appears in</td><td>${ma} ${ma === 1 ? "entry" : "entries"}</td><td>${mb} ${mb === 1 ? "entry" : "entries"}</td></tr>
    </tbody></table>
    ${sa.length ? `<div class="cmp-sum"><b>${esc(A.name)}</b> ${esc(sa.join(" ").slice(0, 320))}</div>` : ""}
    ${sb.length ? `<div class="cmp-sum"><b>${esc(B.name)}</b> ${esc(sb.join(" ").slice(0, 320))}</div>` : ""}
    ${together.length ? `<div class="ans-label" style="margin-top:10px">Where they share a sentence</div>${quoteRows(together)}`
      : `<div class="a-ground" style="margin-top:8px">They never share a sentence in your canon; if they're meant to be connected, that scene is still unwritten.</div>`}`,
    { sources, subject: A.name });
}

/* ---------- how are two names connected ---------- */
function hRelation(q, ctx, S) {
  let m = q.match(/^\s*(?:what(?:'s| is) the )?relationship\s+between\s+(.+?)\s+and\s+(.+?)\s*\??\s*$/i) ||
          q.match(/^\s*how\s+(?:is|are)\s+(.+?)\s+(?:related|connected|linked)\s+to\s+(.+?)\s*\??\s*$/i) ||
          q.match(/^\s*how\s+are\s+(.+?)\s+and\s+(.+?)\s+(?:related|connected|linked)\s*\??\s*$/i);
  if (!m) return null;
  const A = findEntity(m[1]), B = findEntity(m[2]);
  if (!A || !B) {
    const miss = !A ? m[1] : m[2];
    return out(`<div class="assistant-hint">“${esc(cleanName(miss))}” isn't a name I've indexed,
      so I can't trace that connection yet.</div>`, { grounded: NOT_GROUNDED });
  }
  const together = sentencesWithBoth(A.name, B.name, ctx, S * 2);
  const shared = pool(ctx).filter(e => e._hay && e._hay.includes(A.name.toLowerCase()) && e._hay.includes(B.name.toLowerCase()));
  if (!together.length && !shared.length) {
    return out(`${dymNote(m[1], A)}${dymNote(m[2], B)}
      <div class="assistant-hint"><b>${esc(A.name)}</b> and <b>${esc(B.name)}</b> never appear in the
      same entry. As far as your written canon goes, they haven't met; which is an answer in itself.</div>`,
      { subject: A.name });
  }
  return out(`${dymNote(m[1], A)}${dymNote(m[2], B)}
    <div class="ans-label">How ${esc(A.name)} and ${esc(B.name)} connect</div>
    ${together.length ? quoteRows(together)
      : `<div class="assistant-hint">They never share a single sentence, but they do share
         ${shared.length === 1 ? "an entry" : shared.length + " entries"}; the connection is by proximity, not by a stated bond.</div>`}
    ${shared.length ? `<div class="ans-label" style="margin-top:10px">Entries holding both</div>${chipRow(shared.slice(0, 12))}` : ""}`,
    { sources: uniqueEntries(together).concat(together.length ? [] : shared.slice(0, 6)), subject: A.name });
}

/* ---------- who appears in an entry ---------- */
function hWhoAppears(q, ctx) {
  const m = q.match(/^\s*who\s+(?:appears|appear|is|are|shows? up)\s+in\s+(.+?)\s*\??\s*$/i);
  if (!m) return null;
  const raw = cleanName(m[1]);
  const rl = raw.toLowerCase();
  const p = pool(ctx);
  const entry = p.find(e => e.title.toLowerCase() === rl) ||
                p.find(e => e.title.toLowerCase().includes(rl));
  if (!entry) return out(`<div class="assistant-hint">I don't have an entry called
    “${esc(raw)}”; try the exact title, or ask <b>whereis ${esc(raw)}</b> to see where the name shows up.</div>`,
    { grounded: NOT_GROUNDED });
  const names = Array.from(C().entitiesIn(entry.text)).filter(n => n.toLowerCase() !== entry.title.toLowerCase());
  if (!names.length) return out(`<div class="assistant-hint">No indexed names appear inside
    “${esc(entry.title)}” besides its own.</div>`, { sources: [entry] });
  return out(`<div class="ans-label">${names.length} ${names.length === 1 ? "name appears" : "names appear"} in “${esc(entry.title)}”</div>
    <div class="recog">${names.map(n => `<span class="chip" data-subject="${esc(n)}">${esc(n)}</span>`).join("")}</div>`,
    { sources: [entry], subject: entry.title });
}

/* ---------- when / timeline ---------- */
const TEMPORAL = /\b(\d{3,4}|era|age|year|century|founded|born|died|reign|dynasty|before|after|during|ago|since|until)\b/i;
function firstYear(s) { const m = s.match(/\b(\d{3,4})\b/); return m ? parseInt(m[1], 10) : null; }
function hWhen(q, ctx, S) {
  let subjRaw = null;
  let m = q.match(/^\s*timeline\s+(?:of|for)\s+(.+?)\s*\??\s*$/i) ||
          q.match(/^\s*what\s+happened\s+(?:in|during|to|with)\s+(.+?)\s*\??\s*$/i);
  if (m) subjRaw = m[1];
  else {
    m = q.match(/^\s*when\s+(?:was|is|did|does|do|were|will)?\s*(.+?)\s*\??\s*$/i);
    if (m) subjRaw = m[1].replace(/\b(happen|occur|begin|start|end|founded|built|born|die|died)\b/gi, "").trim();
  }
  if (!subjRaw) return null;
  const found = findEntity(subjRaw);
  const name = found ? found.name : cleanName(subjRaw);
  const readT = found ? traitsFor(found.name, ctx) : null;
  const datedTraits = readT ? clauseOf(readT, ["born", "died", "founded-in"]) : null;
  const rows = sentencesWith(name, TEMPORAL, ctx, S * 3);
  if (!rows.length && datedTraits) {
    return out(`${dymNote(subjRaw, found)}
      <div class="ans-label">What your canon dates for ${esc(name)}</div>
      <div class="bs lead">${esc(composeSentence(name, datedTraits))}</div>
      ${quoteOnly(evidenceRows(datedTraits))}`,
      { sources: readT.sources, subject: name,
        grounded: "Read from your own wording · nothing added" });
  }
  if (!rows.length) {
    if (!found) return null;                      // let the general pipeline try
    return out(`${dymNote(subjRaw, found)}
      <div class="assistant-hint">Your entries mention <b>${esc(name)}</b> but never pin a date, era or
      order to ${esc(name)}. When you write one down, I'll keep it straight for you.</div>`,
      { subject: name });
  }
  // dated sentences first, in date order; undated ones follow in reading order
  const dated = rows.filter(r => firstYear(r.s) != null).sort((a, b) => firstYear(a.s) - firstYear(b.s));
  const undated = rows.filter(r => firstYear(r.s) == null);
  const ordered = dated.concat(undated).slice(0, S * 2);
  return out(`${found ? dymNote(subjRaw, found) : ""}
    <div class="ans-label">What your canon dates for ${esc(name)}</div>
    ${ordered.map(r => { const y = firstYear(r.s); return `<div class="glance-row">
      <span class="gk">${y != null ? y : "·"}</span>
      <span class="gv">${esc(r.s)} <a class="ev-src" href="#/entry/${encodeURIComponent(r.e.id)}">${esc(r.e.title)}</a></span></div>`; }).join("")}
    ${dated.length ? "" : `<div class="a-ground">None of these carry a year; the order shown is reading order, not time order.</div>`}`,
    { sources: uniqueEntries(ordered), subject: name });
}

/* ---------- where ---------- */
const PLACE_CUE = /\b(in|at|near|beyond|across|beneath|north|south|east|west|city|kingdom|capital|seat|island|mountain|mountains|river|sea|coast|located|lies|sits|stands|region|province|realm|lands?|territory|palace|castle|temple)\b/i;
function hWhere(q, ctx, S) {
  const m = q.match(/^\s*where\s+(?:is|are|was|were|does|do|did)\s+(.+?)\s*(?:from|located|live|lives|sit|stand)?\s*\??\s*$/i);
  if (!m) return null;
  const found = findEntity(m[1]);
  if (!found) return null;
  const name = found.name;
  const home = C().bestEntryFor(name, true);
  // a place asked about directly: the entry itself is the answer
  if (home && home.category === "Maps & Locations" && home.title.toLowerCase().includes(name.toLowerCase())) {
    const sents = C().topicSummary(name, S);
    return out(`${dymNote(m[1], found)}
      <div class="blurb"><div class="bt">${C().catDot(home.category)} ${esc(name)}</div>
      <div class="bc">${esc(home.category)}</div>
      <div class="bs">${esc(sents.join(" ").slice(0, 420)) || esc(home.summary || "")}</div>
      <div style="margin-top:8px"><a class="btn sm" href="#/entry/${encodeURIComponent(home.id)}">Open entry</a></div></div>`,
      { sources: [home], subject: name });
  }
  const readW = traitsFor(name, ctx);
  const placed = clauseOf(readW, ["lives", "from", "located", "capital", "seat"]);
  if (placed) {
    return out(`${dymNote(m[1], found)}
      <div class="ans-label">Where your canon puts ${esc(name)}</div>
      <div class="bs lead">${esc(composeSentence(name, placed))}</div>
      ${quoteOnly(evidenceRows(placed))}`,
      { sources: readW.sources, subject: name,
        grounded: "Read from your own wording · nothing added" });
  }

  const rows = sentencesWith(name, PLACE_CUE, ctx, S * 2);
  const mentions = C().mentionsOf(name, null, true);
  if (!rows.length) {
    if (!mentions.length) return null;
    return out(`${dymNote(m[1], found)}
      <div class="assistant-hint">Your canon never places <b>${esc(name)}</b> anywhere in so many words.
      These entries mention the name, if you want to look:</div>${chipRow(mentions.slice(0, 12))}`,
      { sources: mentions.slice(0, 6), subject: name });
  }
  return out(`${dymNote(m[1], found)}
    <div class="ans-label">Where your canon puts ${esc(name)}</div>
    ${quoteRows(rows)}
    ${mentions.length > rows.length ? `<div class="a-ground">The name also appears in
      ${mentions.length} ${mentions.length === 1 ? "entry" : "entries"} overall; <b>whereis ${esc(name)}</b> lists them all.</div>` : ""}`,
    { sources: uniqueEntries(rows), subject: name });
}

/* ---------- how old ---------- */
function hHowOld(q, ctx, S) {
  const m = q.match(/^\s*how\s+old\s+(?:is|was|are|were)\s+(.+?)\s*\??\s*$/i);
  if (!m) return null;
  const found = findEntity(m[1]);
  if (!found) return null;
  const name = found.name;
  const home = C().bestEntryFor(name, true);
  const ageFacts = home ? C().factsOf(home, 12).filter(f => /^(age|born|died)$/i.test(f.k)) : [];
  const rows = sentencesWith(name, /\b(age|aged|years? old|born|birth|died|death)\b/i, ctx, S);

  /* The reading layer knows "LILY IS SEVEN" states an age even though
     the line contains none of the words this handler searches for.
     Without asking it, the assistant answered "who is Lily" with "Lily
     is seven" and "how old is Lily" with "that is not established",
     which is worse than either answer alone. */
  const read = traitsFor(name, ctx);
  const aged = clauseOf(read, ["age", "born", "died"]);
  if (aged) {
    return out(`${dymNote(m[1], found)}
      <div class="ans-label">What your canon says about ${esc(name)}'s age</div>
      <div class="bs lead">${esc(composeSentence(name, aged))}</div>
      ${ageFacts.map(f => `<div class="glance-row"><span class="gk">${esc(f.k)}</span><span class="gv">${esc(f.v)}</span></div>`).join("")}
      ${quoteOnly(evidenceRows(aged))}`,
      { sources: read.sources.length ? read.sources : (home ? [home] : []), subject: name,
        grounded: "Read from your own wording · nothing added" });
  }

  if (!ageFacts.length && !rows.length) {
    return out(`${dymNote(m[1], found)}<div class="assistant-hint">Your entries never state an age,
      birth or death for <b>${esc(name)}</b>. That's not established yet.</div>`, { subject: name });
  }
  return out(`${dymNote(m[1], found)}
    <div class="ans-label">What your canon says about ${esc(name)}'s age</div>
    ${ageFacts.map(f => `<div class="glance-row"><span class="gk">${esc(f.k)}</span><span class="gv">${esc(f.v)}</span></div>`).join("")}
    ${rows.length ? quoteRows(rows) : ""}`,
    { sources: uniqueEntries(rows).concat(home && !rows.some(r => r.e.id === home.id) ? [home] : []), subject: name });
}

/* ---------- why / how; causes and mechanisms ---------- */
const CAUSAL = /\b(because|so that|in order to|due to|thus|therefore|as a result|which meant|which led|led to|caused|to keep|to protect|to stop|to prevent|out of|in return|in exchange|for fear|born of)\b/i;
function hWhyHow(q, ctx, S) {
  const m = q.match(/^\s*(why|how)\s+(.+?)\s*\??\s*$/i);
  if (!m) return null;
  // "how many/much/old/are you" belong to other handlers downstream
  if (/^how\s+(many|much|old|long|far|big|often|are\s+you)\b/i.test(q)) return null;
  const terms = m[2].toLowerCase().split(/\s+/)
    .map(t => t.replace(/[^\w'-]/g, ""))
    .filter(t => t.length > 3 && !/^(does|did|will|would|could|should|their|there|about|were|have|been|they|them|that|this|with|from|into)$/.test(t));
  if (!terms.length) return null;
  const rows = [], seen = new Set();
  for (const e of pool(ctx)) {
    if (rows.length >= S * 2) break;
    if (!terms.some(t => e._hay && e._hay.includes(t))) continue;
    for (const s of C().sentencesOf(e.text)) {
      if (rows.length >= S * 2) break;
      if (s.length < 30 || s.length > 380) continue;
      const sl = s.toLowerCase();
      const hits = terms.filter(t => sl.includes(t)).length;
      if (!hits || !CAUSAL.test(s)) continue;
      const key = sl.slice(0, 44);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ s: s.trim(), e, hits });
    }
  }
  if (!rows.length) return null;                  // fall through to the general answer
  rows.sort((a, b) => b.hits - a.hits);
  return out(`<div class="ans-label">The ${m[1].toLowerCase() === "why" ? "reasons" : "way"} your canon gives</div>
    ${quoteRows(rows.slice(0, S * 2))}`,
    { sources: uniqueEntries(rows) });
}

/* ---------- define; the lexicon first ---------- */
function hDefine(q, ctx, S) {
  const m = q.match(/^\s*(?:define|what\s+does)\s+(.+?)(?:\s+mean)?\s*\??\s*$/i);
  if (!m) return null;
  const term = cleanName(m[1]);
  if (!term) return null;
  const tl = term.toLowerCase();
  const lex = pool(ctx).filter(e => e.category === "Reference & Lexicon" && e._hay && e._hay.includes(tl));
  if (!lex.length) return null;                   // fall through; a name gets its blurb instead
  const rows = [];
  lex.forEach(e => C().sentencesOf(e.text).forEach(s => {
    if (rows.length < S && s.toLowerCase().includes(tl) && s.length > 20 && s.length < 380) rows.push({ s: s.trim(), e });
  }));
  return out(`<div class="ans-label">“${esc(term)}”, as your lexicon has it</div>
    ${rows.length ? quoteRows(rows) : chipRow(lex.slice(0, 8))}`,
    { sources: lex.slice(0, 6), subject: null });
}

/* ---------- the facts sheet for a name ---------- */
function hFacts(q) {
  const m = q.match(/^\s*facts\s+(?:for|about|on)?\s*(.+?)\s*\??\s*$/i);
  if (!m) return null;
  const found = findEntity(m[1]);
  if (!found) return out(`<div class="assistant-hint">“${esc(cleanName(m[1]))}” isn't a name I've
    indexed yet.</div>`, { grounded: NOT_GROUNDED });
  const e = C().bestEntryFor(found.name, true);
  const facts = e ? C().factsOf(e, 14) : [];
  if (!facts.length) return out(`${dymNote(m[1], found)}<div class="assistant-hint">
    “${esc(found.name)}” has no <b>Key: Value</b> fact lines in its entry yet; those are what I read as facts.</div>`,
    { sources: e ? [e] : [], subject: found.name });
  return out(`${dymNote(m[1], found)}
    <div class="ans-label">The declared facts for ${esc(found.name)}</div>
    ${facts.map(f => `<div class="glance-row"><span class="gk">${esc(f.k)}</span><span class="gv">${esc(f.v)}</span></div>`).join("")}
    <div style="margin-top:8px"><a class="btn sm" href="#/entry/${encodeURIComponent(e.id)}">Open entry</a></div>`,
    { sources: [e], subject: found.name });
}

/* ---------- an opinion, held honestly ----------
   The verdict tier comes from real measurements; how woven-through the
   name is, how much is written, how connected it is; and the phrasing
   comes from the persona. Ask twice, get the same judgement. */
function hOpinion(q, ctx) {
  const m = q.match(/^\s*(?:what\s+do\s+you\s+think\s+(?:of|about)|your\s+(?:thoughts|take|opinion)\s+on|what(?:'s| is)\s+your\s+(?:opinion|take)\s+(?:of|on)|do\s+you\s+like|how\s+do\s+you\s+feel\s+about|rate)\s+(.+?)\s*\??\s*$/i);
  if (!m) return null;
  const found = findEntity(m[1]);
  if (!found) return out(`<div class="assistant-hint">I only hold opinions about things you've
    written; “${esc(cleanName(m[1]))}” isn't in your canon yet.</div>`, { grounded: NOT_GROUNDED });
  const name = found.name;
  const e = C().bestEntryFor(name, true);
  const mentions = C().mentionsOf(name, null, true).length;
  const facts = e ? C().factsOf(e, 14).length : 0;
  const words = e ? (e.wordcount || 0) : 0;
  const related = sentencesWith(name, null, ctx, 40).length;
  const score = mentions * 2 + Math.min(6, facts) + Math.min(6, words / 300) + Math.min(6, related / 4);
  const tier = score >= 14 ? "high" : score >= 6 ? "mid" : "low";
  const vo = voice();
  const line = vo ? vo.v[tier](name)
    : tier === "high" ? `${name} is one of the most established things in your canon.`
    : tier === "mid" ? `${name} is solidly present, with room to grow.`
    : `${name} barely has a footprint yet.`;
  const sents = C().topicSummary(name, 2);
  return out(`${dymNote(m[1], found)}
    <div class="a-voice">${esc(line)}</div>
    <div class="blurb">
      <div class="bt">${e ? C().catDot(e.category) : ""} ${esc(name)}</div>
      ${sents.length ? `<div class="bs">${esc(sents.join(" ").slice(0, 320))}</div>` : ""}
      <div class="bl">My reasoning, with the numbers on the table: the name runs through
        <b>${mentions}</b> ${mentions === 1 ? "entry" : "entries"}, carries <b>${facts}</b> declared
        fact${facts === 1 ? "" : "s"}, and sits in <b>${related}</b> sentence${related === 1 ? "" : "s"}
        of your prose. ${tier === "high" ? "That is a load-bearing piece of this world."
          : tier === "mid" ? "Established, and clearly still gathering weight."
          : "There is not much on the page yet; which is an invitation, not a flaw."}</div>
    </div>`,
    { sources: e ? [e] : [], subject: name,
      grounded: "An opinion; the measurements under it are real" });
}

/* ============================================================
   READING, RATHER THAN QUOTING

   Everything above finds the right sentences and shows them to you. That
   is retrieval, and it is not the same as an answer. Asked "who is
   Lily", a person who had read "LILY IS SEVEN AND Friends with Max Steve
   Ivory But she does not like Adam" would not read the line back; they
   would say Lily is seven, is friends with Max Steve Ivory, and does not
   like Adam.

   So: a small set of patterns for the things writers actually state
   about a character, each one turning a fragment of your own wording
   into a clause. Then the clauses are assembled into a sentence.

   The line this must not cross is invention. Every clause is a
   rearrangement of words you wrote; nothing adds a fact that is not on
   the page, and the sentences it read from are shown underneath so any
   claim can be checked in one glance.
   ============================================================ */
const STOP_CLAUSE = new RegExp(
  "[,;:.!?()\\[\\]\"\u201c\u201d]" +
  "|\\s\\b(?:but|however|although|though|whereas|while|that|which|who|whom|when|where|" +
  "before|after|because|since|and|and then|as well as)\\b" +
  "|$", "i");

/* cut a captured fragment at the first thing that ends the thought, and
   tidy the trailing filler people leave when they trail off */
function tidyClause(s, maxWords) {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  /* Years in this canon are written 8,544 BR. Cutting at every comma
     turned that into "8", so the separators are hidden from the search
     and put back afterwards. */
  const GUARD = "\u0001";
  t = t.replace(/(\d),(\d)/g, "$1" + GUARD + "$2");
  const stop = t.search(STOP_CLAUSE);
  if (stop > 0) t = t.slice(0, stop);
  t = t.split(GUARD).join(",");
  t = t.replace(/[,;:.\s]+$/, "").replace(/\s+\b(?:or\s+even|or\s+anything|etc\.?)\s*$/i, "").trim();
  /* Much of this canon is not prose but family trees and Quick Facts
     blocks: long comma-joined runs with no full stop anywhere. Read
     greedily, those produce a "sentence" the length of a paragraph. A
     statement that cannot be said in a few words is not a statement this
     can safely make, so it is dropped rather than truncated. */
  if (!t || t.split(/\s+/).length > (maxWords || 7)) return "";
  return t;
}
/* tidyClause returns "" when a fragment is too long or too tangled to
   state cleanly, which leaves clauses hanging: "the daughter of",
   "also known as", "was founded by". A clause that trails off is worse
   than no clause, so it is dropped. */
function wellFormed(clause) {
  const c = String(clause || "").trim();
  if (c.length < 6) return false;
  if (/\b(?:of|by|to|in|at|as|for|with|the|a|an|and|or)\s*$/i.test(c)) return false;
  if (/\s{2,}/.test(c)) return false;
  // "hates her" tells you nothing without knowing who "her" is
  if (/\b(?:her|him|them|it|us|me|you|himself|herself|themselves)\s*$/i.test(c)) return false;
  // "the only saint to have" trails off mid-thought
  if (/\b(?:have|has|had|be|been|being|is|was|were|will|would|could|should|do|does|did)\s*$/i.test(c)) return false;
  // "the firstborn of Emperor" names a rank and then stops
  if (new RegExp("\\b(?:" + TITLES + ")\\s*$", "i").test(c)) return false;
  // a clause whose whole object is one short word says nothing
  const tail = c.replace(/^[a-z]+(?:\s+(?:a|an|the|to|of|by|in|at|with|as|not|like))*\s+/i, "");
  if (tail.length < 4 || /^(?:one|two|some|many|other|others|this|that)$/i.test(tail)) return false;
  return /\s/.test(c);
}

/* Nobody kills, founds or mothers themselves. A clause naming its own
   subject came from a sentence about somebody else, so it is wrong
   rather than merely clumsy. */
function selfReferential(clause, name) {
  const body = clause.replace(/^[a-z' ]+?\b(?:of|by|to|as|with|in|at)\s+/i, "");
  try { return new RegExp("\\b" + reEsc(name) + "\\b", "i").test(body); }
  catch (e) { return false; }
}

/* Family trees and Quick Facts blocks are not prose. Read as sentences
   they yield statements nobody wrote; this keeps the reading to text
   that actually reads like text. */
function looksLikeProse(s) {
  if (!s || s.length > 400) return false;
  const words = s.trim().split(/\s+/);
  if (words.length < 4 || words.length > 60) return false;
  /* What marks a family tree is a run of Title Case names, not capitals
     as such. Counting every capital condemned notes typed in CAPS, which
     are shouting rather than tabular; "LILY IS SEVEN AND Friends with
     Max" is perfectly ordinary prose said loudly. */
  /* The first word is capitalised by grammar, not by being a name, so
     it is not evidence either way. And a sentence in fiction carries a
     lot of proper nouns; "Sevtor is loyal to House Orana and serves
     Lord Dain" is half names and still perfectly ordinary prose. What a
     family tree looks like is almost NOTHING but names. */
  const rest = words.slice(1);
  if (!rest.length) return false;
  const titleCase = rest.filter(w => /^[A-Z][a-z]/.test(w)).length;
  return titleCase / rest.length < 0.65;
}
const aOrAn = w => (/^[aeiou]/i.test(w) ? "an " : "a ") + w;

/* ---------- is this actually a name? ----------
   The expensive lesson from running the first draft of this over a real
   canon: capitalisation alone is not enough. "led by Through", "founded
   by Tbd", "has a mother, Ii" all came from capitalised words that are
   not names; headings, placeholders and regnal numerals.

   Where the workspace has a real name index, that index decides. Where
   it does not; a workspace someone started last week; fall back to
   asking whether the word looks like a name and is not a numeral, an
   abbreviation, or an ordinary English word. */
const NOT_A_NAME = new Set(("through before after during within without across against between " +
  "key turning points accomplishments succession status quick facts era born died known " +
  "tbd tba unknown none n/a various several many other others part role notes note summary " +
  "overview history background timeline reference the this that these those there here " +
  "first second third last next previous new old great high low true false").split(" "));
const ROMAN = /^(?:i{1,3}|iv|v|vi{1,3}|ix|x{1,3}|xl|l|c|d|m)+$/i;

function plausibleName(text) {
  const t = String(text || "").replace(/^the\s+/i, "").trim();
  if (!t) return false;
  const words = t.split(/\s+/);
  if (words.length > 4) return false;
  const first = words[0];
  if (first.length < 3) return false;                 // "Ii", "Br"
  if (ROMAN.test(first)) return false;                // regnal numerals
  if (NOT_A_NAME.has(first.toLowerCase())) return false;
  if (COMMON_WORDS.has(first.toLowerCase())) return false;
  return /^[A-Z]/.test(first);
}
/* A canon with a real index gets checked against it; one without gets
   the judgement above. Ten names is the line: below that the index is
   too thin to prove anything, and refusing everything it lacks would
   make the assistant useless on a new workspace. */
/* "ATION" and "TIONS" are in the name index because the extractor cut
   words in half, not because anybody is called that. A name written
   entirely in capitals with no lowercase anywhere is a fragment. */
function indexArtefact(t) {
  return /^[A-Z]{2,}$/.test(String(t || "").trim());
}
function resolveTarget(text) {
  const ents = (C().DB.entities || []);
  const t = String(text || "").replace(/^the\s+/i, "").trim();
  if (!t || indexArtefact(t)) return null;
  if (/^House\s+[A-Z]/i.test(t)) return t;
  if (ents.length >= 10) {
    const lower = t.toLowerCase();
    const exact = ents.find(n => n.toLowerCase() === lower);
    if (exact) return exact;
    /* The capture often drags a heading in with it. Keep the longest
       indexed name inside it and discard the rest, rather than printing
       "loyal to Vikistv Key Turning Points". */
    const inside = ents.filter(n => n.length > 3 && !indexArtefact(n) && lower.includes(n.toLowerCase()))
      .sort((a, b) => b.length - a.length)[0];
    return inside || null;
  }
  return plausibleName(t) ? t : null;
}
function knownTarget(text) {
  const ents = (C().DB.entities || []);
  const t = String(text || "").replace(/^the\s+/i, "").trim();
  if (!t) return false;
  if (/^House\s+[A-Z]/i.test(t)) return true;
  if (ents.length >= 10) {
    const lower = t.toLowerCase();
    if (ents.some(n => n.toLowerCase() === lower)) return true;
    // "King Layern Patton" contains the indexed name "Layern Patton"
    return ents.some(n => n.length > 3 && lower.includes(n.toLowerCase()));
  }
  return plausibleName(t);
}

const NUMBER_WORD = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|" +
  "thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";

/* Each pattern says how to recognise a statement and how to say it back.
   `about` marks the ones that must appear near the subject's own name,
   so a second character's dislikes are not attributed to the first. */
/* Most of these verbs take a NAMED object in practice: you found a
   house, you killed a person, you rule a kingdom. Requiring the object
   to be a proper noun is what keeps "Duri's ten rules that govern the
   faith" from being read as Duri ruling something called "that". */
const PROPER = "((?:the\\s+)?[A-Z][\\w'’-]*(?:\\s+[A-Z][\\w'’-]*){0,3})";
const named = (before, after) => new RegExp(before + "\\s+" + (after || PROPER), "i");
// traits built with named() take a NAMED object; their target is checked
const STRICT = new Set(["rules","founded","leads","serves","loyal","worships",
  "killed","betrayed","heir",
  // the passive forms name a person or house as well
  "founded-by","killed-by","ruled-by"]);

/* The nouns that actually name what somebody or something IS. Without
   this list the role pattern matched any noun at all, and reported that
   a character "is a promise" or "is the last". */
const ROLE_NOUNS = new Set(("king queen emperor empress prince princess lord lady duke duchess " +
  "baron baroness count countess regent chancellor saint god goddess deity priest priestess " +
  "knight soldier warrior general captain commander guard assassin thief spy healer scholar " +
  "scribe archivist merchant farmer smith sailor hunter bard poet witch mage sorcerer wizard " +
  "heir ruler leader founder monarch noble commoner slave servant steward " +
  "mother father sister brother daughter son wife husband cousin aunt uncle child girl boy " +
  "man woman twin orphan widow widower " +
  "house dynasty family order guild council court temple church faith religion sect " +
  "city town village capital kingdom empire realm region province duchy county island " +
  "mountain river sea forest fortress castle palace tower").split(" "));

const TITLES = "King|Queen|Lord|Lady|Saint|Duke|Duchess|Prince|Princess|Emperor|Empress|" +
  "Baron|Baroness|Count|Countess|Archduke|Archduchess|High Priest|High Priestess|" +
  "Captain|General|Commander|Chancellor|Regent";

/* Ordered by how much each one identifies somebody, because that is the
   order they will be read out in. Titles and roles first, then blood and
   marriage, then what they did, then where they were, then how they are
   remembered. */
const TRAITS = [
  { k: "divine",
    re: /\b(?:is|was)\s+the\s+(god|goddess)\s+of\s+(.+)/i,
    say: m => "is the " + m[1].toLowerCase() + " of " + tidyClause(m[2]) },
  { k: "role",
    re: /\b(?:is|was)\s+((?:a|an|the)\s+[a-z][\w'-]*(?:\s+[a-z][\w'-]*){0,3})/i,
    say: m => {
      const phrase = tidyClause(m[1]);
      if (!phrase) return "";
      // it must actually name a role; otherwise any noun at all qualifies
      const words = phrase.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
      return words.some(w => ROLE_NOUNS.has(w)) ? "is " + phrase : "";
    } },
  { k: "age",
    /* A number after "is" is only an age when it says so, or when it is
       written as a word. This canon is full of dates, counts and list
       numbering, and "Enyokia is 5" came from none of them being age. */
    re: new RegExp("\\b(?:is|was|are|were)\\s+(?:(\\d{1,3})\\s+years?\\s+old|(" + NUMBER_WORD + ")\\b(\\s+years?\\s+old)?)", "i"),
    say: m => "is " + String(m[1] || m[2]).toLowerCase() + (m[1] ? " years old" : (m[3] ? " years old" : "")) },
  { k: "alias",
    re: /\b(?:also\s+)?known\s+as\s+(.+)/i,
    say: m => "is also known as " + tidyClause(m[1]) },
  { k: "family",
    re: /\b(?:is\s+)?(?:the\s+)?(?:eldest\s+|youngest\s+|only\s+)?(sister|brother|mother|father|son|daughter|wife|husband|cousin|aunt|uncle|heir)\s+(?:of|to)\s+(.+)/i,
    say: m => "is the " + m[1].toLowerCase() + " of " + tidyClause(m[2]) },
  { k: "married",
    re: /\b(?:is|was)\s+married\s+to\s+(.+)/i,
    say: m => "is married to " + tidyClause(m[1]) },
  { k: "friends",
    re: /\bfriends?\s+with\s+(.+)/i,
    say: m => "is friends with " + tidyClause(m[1]) },
  { k: "rules", re: named("\\b(?:rules?|ruled|reigns?|reigned)(?:\\s+over)?"),
    say: m => "ruled " + tidyClause(m[1]) },
  { k: "ruled-by",
    re: /\b(?:is|was|are|were)\s+ruled\s+by\s+(.+)/i,
    say: m => "is ruled by " + tidyClause(m[1]) },
  { k: "founded", re: named("\\bfounded"),
    say: m => "founded " + tidyClause(m[1]) },
  { k: "founded-by",
    re: /\b(?:was|were|is|are)\s+founded\s+by\s+(.+)/i,
    say: m => "was founded by " + tidyClause(m[1]) },
  { k: "founded-in",
    re: /\bfounded\s+in\s+(\d[\d,]{0,8}(?:\s+[A-Z]{2})?)/,
    say: m => "was founded in " + tidyClause(m[1]) },
  { k: "leads", re: named("\\b(?:leads|led)"),
    say: m => "led " + tidyClause(m[1]) },
  { k: "serves", re: named("\\bserve[sd](?:\\s+under)?"),
    say: m => "serves " + tidyClause(m[1]) },
  { k: "loyal", re: named("\\bloyal\\s+to"),
    say: m => "is loyal to " + tidyClause(m[1]) },
  { k: "worships", re: named("\\bworships?"),
    say: m => "worships " + tidyClause(m[1]) },
  { k: "killed", re: named("\\bkill(?:ed|s)"),
    say: m => "killed " + tidyClause(m[1]) },
  { k: "killed-by",
    re: /\b(?:was|were|is)\s+(?:killed|slain|murdered)\s+by\s+(.+)/i,
    say: m => "was killed by " + tidyClause(m[1]) },
  { k: "betrayed", re: named("\\bbetray(?:ed|s)"),
    say: m => "betrayed " + tidyClause(m[1]) },
  { k: "heir", re: named("\\bheir\\s+(?:to|of)"),
    say: m => "is heir to " + tidyClause(m[1]) },
  { k: "born",
    re: /\bborn\s+(in|on|at|to)\s+(.+)/i,
    say: m => "was born " + m[1].toLowerCase() + " " + tidyClause(m[2]) },
  { k: "died",
    re: /\bdied\s+(in|at|during|of)\s+(.+)/i,
    say: m => "died " + m[1].toLowerCase() + " " + tidyClause(m[2]) },
  { k: "lives",
    re: /\b(?:lives?|lived|resides?|resided)\s+in\s+(.+)/i,
    say: m => "lives in " + tidyClause(m[1]) },
  { k: "from",
    re: /\b(?:is|was|comes|came)\s+from\s+(.+)/i,
    say: m => "is from " + tidyClause(m[1]) },
  { k: "capital",
    re: /\b(?:is\s+)?the\s+capital\s+of\s+(.+)/i,
    say: m => "is the capital of " + tidyClause(m[1]) },
  { k: "seat",
    re: /\b(?:is\s+)?the\s+seat\s+of\s+(.+)/i,
    say: m => "is the seat of " + tidyClause(m[1]) },
  { k: "located",
    re: /\b(?:is\s+)?(?:located|lies|sits|stands)\s+(in|on|at|near|above|beside|beneath|within)\s+(.+)/i,
    say: m => "lies " + m[1].toLowerCase() + " " + tidyClause(m[2]) },
  { k: "renown",
    re: /\bknown\s+for\s+(.+)/i,
    say: m => "is known for " + tidyClause(m[1]) },
  { k: "remembered",
    re: /\bremembered\s+(?:as|for)\s+(.+)/i,
    say: m => "is remembered for " + tidyClause(m[1]) },
  { k: "dislikes",
    re: /\b(?:does\s+not|doesn'?t|did\s+not|didn'?t|do\s+not|don'?t)\s+(?:like|trust|get\s+along\s+with)\s+(.+)/i,
    say: m => "does not like " + tidyClause(m[1]) },
  { k: "hates",
    re: /\b(?:hates|hated|despises|despised|resents|resented)\s+(.+)/i,
    say: m => "hates " + tidyClause(m[1]) },
  { k: "likes",
    re: /\b(?:likes|loves|adores|admires)\s+(.+)/i,
    say: m => "loves " + tidyClause(m[1]) },
  { k: "status",
    re: /\b(?:is|was)\s+(dead|alive|missing|exiled|banished|imprisoned|crowned|widowed)\b/i,
    say: m => "is " + m[1].toLowerCase() },
];

/* ---------- whose statement is it? ----------
   The hard part of reading a sentence is not spotting "friends with";
   it is knowing WHO is friends. In "LILY IS SEVEN AND Friends with Max
   Steve Ivory But she does not like Adam", every one of those claims
   belongs to Lily, yet Max and Adam are both named in it. Attaching a
   trait to whichever name happens to sit in the sentence produces
   confident nonsense: "Max is seven, friends with Max Steve Ivory".

   The rule that fixes it is grammatical position. A statement belongs to
   the nearest name BEFORE it, never to a name that follows it; a name
   after the verb is its object, not its subject. Where the clause opens
   with a pronoun instead, it belongs to whoever the sentence opened
   with. Anything that cannot be settled that way is left unclaimed. */
const COMMON_WORDS = new Set(("is are was were am be been being has have had do does did " +
  "and or but the a an of to in on at for with from by not no if as so then than " +
  "she he they it her him them his hers their its this that these those there here " +
  "who what when where why how all any some more most very just only even still yet " +
  "about into over under after before while because friends friend like likes liked " +
  "love loves loved hate hates hated lives lived from married sister brother mother " +
  "father son daughter wife husband cousin aunt uncle heir dead alive missing exiled " +
  "one two three four five six seven eight nine ten eleven twelve thirteen fourteen " +
  "fifteen sixteen seventeen eighteen nineteen twenty years year old").split(" "));

function looksLikeName(tok) {
  return tok.length > 1 && /^[A-Z]/.test(tok) && !COMMON_WORDS.has(tok.toLowerCase());
}
/* every name-ish token in a string, with where it sits */
function namesWithin(text) {
  const out = [];
  const re = /\b[A-Za-z][\w'’-]*\b/g;
  let m;
  while ((m = re.exec(text))) {
    if (!looksLikeName(m[0])) continue;
    const prev = out[out.length - 1];
    // "House Veren" is one name; treating it as two made the owner of a
    // statement come out as "Veren"
    if (prev && prev.at + prev.name.length + 1 === m.index) {
      prev.name += " " + m[0];
    } else out.push({ name: m[0], at: m.index });
  }
  return out;
}
/* ---------- a denial is not a statement ----------
   "Rhea never lived in Halden" was being read as "Rhea lives in
   Halden": the pattern matched the verb and nothing looked at the word
   in front of it. Reporting the exact opposite of what somebody wrote
   is the worst thing this can do, so a negated verb yields nothing at
   all. Saying less is recoverable; saying the reverse is not.

   Only the words immediately before the verb count, and the search
   stops at a comma, so "Rhea, who was not born here, lived in Torvin"
   keeps the second half. Patterns that carry their own negation, like
   "does not like", start AT the negator and so are never caught by it. */
const NEGATOR = /\b(?:not|never|no|nor|isn'?t|wasn'?t|aren'?t|weren'?t|didn'?t|doesn'?t|don'?t|hasn'?t|haven'?t|hadn'?t|cannot|can'?t|won'?t|without|rarely|seldom)\b/i;
function negatedBefore(piece, at) {
  let head = piece.slice(0, at);
  const cut = Math.max(head.lastIndexOf(","), head.lastIndexOf(";"));
  if (cut > -1) head = head.slice(cut + 1);
  const words = head.trim().split(/\s+/).slice(-3).join(" ");
  return NEGATOR.test(words);
}

/* Who is making this statement? The nearest name before it; or, where a
   clause opens with a pronoun, whoever the sentence opened with. */
function ownerOfStatement(piece, sentence, at, carry, sentenceAt) {
  /* "Queen Kaeya of House Veren was born ..." names two things, but
     "of House Veren" modifies Kaeya rather than taking over as the
     subject; a name introduced by "of" is part of the phrase before it. */
  const head = piece.slice(0, at);
  const before = namesWithin(head).filter(n => !/\bof\s+$/i.test(head.slice(0, n.at)));
  if (before.length) return before[before.length - 1].name;
  /* No name in front of it. In "Kaeya founded House Veren and ruled
     Torad" the second half has no subject of its own; it belongs to
     whoever the sentence opened with; but only a name that actually
     precedes the verb, or "She was killed by Sevtor" would be read as
     Sevtor killing himself. */
  const absolute = (sentenceAt || 0) + at;
  const lead = namesWithin(sentence).filter(n => n.at < absolute)[0];
  if (lead) return lead.name;
  /* Not even the sentence names anybody: "She is the goddess of
     alchemy" after a sentence about Kaeya. The subject carried over
     from the previous sentence is the only honest reading, and only a
     pronoun licenses it. */
  if (carry && /\b(?:she|he|they|her|him|them|it)\b/i.test(piece)) return carry;
  return null;
}
function sameSubject(owner, nl) {
  if (!owner) return false;
  const o = owner.toLowerCase();
  if (o === nl) return true;
  // "King Layern Patton" is Layern Patton; "Queen Kaeya" is Kaeya
  try { return new RegExp("\\b" + reEsc(nl) + "\\b").test(o); } catch (e) { return false; }
}
function statementBelongsTo(piece, sentence, at, nl, carry, sentenceAt) {
  return sameSubject(ownerOfStatement(piece, sentence, at, carry, sentenceAt), nl);
}

/* ---------- the same sentence, read from the other side ----------
   "Lily is friends with Max" says something about Max too, and refusing
   to see it is why asking about him returned the line about Lily with
   nothing drawn from it. A relation has two ends: whoever the statement
   belongs to, and whoever it names. These read the far end.

   Only relations that genuinely invert are here. "Lily is seven" says
   nothing about anyone else, and "Lily lives in Karyth" says something
   about a place rather than a person, so neither has an entry. */
const INVERSE = [
  { k: "friend-of", obj: 1,
    re: /\bfriends?\s+with\s+(.+)/i,
    say: owner => "is a friend of " + owner },
  { k: "married-to", obj: 1,
    re: /\b(?:is|was)\s+married\s+to\s+(.+)/i,
    say: owner => "is married to " + owner },
  { k: "disliked-by", obj: 1,
    re: /\b(?:does\s+not|doesn'?t|did\s+not|didn'?t|do\s+not|don'?t)\s+(?:like|trust|get\s+along\s+with)\s+(.+)/i,
    say: owner => "is someone " + owner + " does not like" },
  { k: "hated-by", obj: 1,
    re: /\b(?:hates|hated|despises|despised|resents|resented)\s+(.+)/i,
    say: owner => "is hated by " + owner },
  { k: "liked-by", obj: 1,
    re: /\b(?:likes|loves|adores|admires)\s+(.+)/i,
    say: owner => "is liked by " + owner },
  { k: "relative-of", obj: 2,
    re: /\b(?:is\s+)?(?:the\s+)?(?:eldest\s+|youngest\s+|only\s+)?(sister|brother|mother|father|son|daughter|wife|husband|cousin|aunt|uncle)\s+(?:of|to)\s+(.+)/i,
    say: (owner, m) => "has a " + m[1].toLowerCase() + ", " + owner },
  { k: "killed-by-inv", obj: 1, re: named("\\bkill(?:ed|s)"),
    say: owner => "was killed by " + owner },
  { k: "founded-by-inv", obj: 1, re: named("\\bfounded"),
    say: owner => "was founded by " + owner },
  { k: "ruled-by-inv", obj: 1, re: named("\\b(?:rules?|ruled|reigns?|reigned)(?:\\s+over)?"),
    say: owner => "is ruled by " + owner },
  { k: "led-by-inv", obj: 1, re: named("\\b(?:leads|led)"),
    say: owner => "is led by " + owner },
  { k: "served-by-inv", obj: 1, re: named("\\bserve[sd](?:\\s+under)?"),
    say: owner => "is served by " + owner },
  { k: "worshipped-by-inv", obj: 1, re: named("\\bworships?"),
    say: owner => "is worshipped by " + owner },
  { k: "betrayed-by-inv", obj: 1, re: named("\\bbetray(?:ed|s)"),
    say: owner => "was betrayed by " + owner },
  { k: "loyalty-of-inv", obj: 1, re: named("\\bloyal\\s+to"),
    say: owner => "has the loyalty of " + owner },
  { k: "heir-inv", obj: 1, re: named("\\bheir\\s+(?:to|of)"),
    say: owner => "has an heir, " + owner },
];

/* ---------- what sits right beside the name ----------
   Two of the commonest shapes in this canon are not clauses at all.
   "King Layern Patton II" puts the title in front of the name, and
   "Yailk of Torad" hangs the allegiance off the back of it, so neither
   is reachable by looking for a verb. Both are read here instead.

   The "of Y" form only counts when Y is a house or a place the canon
   already knows, which keeps "one of the" and "some of them" out. */
function readAdjacent(name, ctx) {
  const clauses = [];      // { k, clause, sentence }
  const sentences = [];
  let titleRe, ofRe;
  try {
    titleRe = new RegExp("\\b(" + TITLES + ")\\s+" + reEsc(name) + "\\b", "i");
    ofRe = new RegExp("\\b" + reEsc(name) + "\\s+of\\s+(House\\s+[A-Z][\\w'’-]*|[A-Z][\\w'’-]*)", "");
  } catch (e) { return { clauses, sentences }; }
  const known = new Set((C().DB.entities || []).map(n => n.toLowerCase()));
  for (const e of pool(ctx)) {
    if (!e._hay || !e._hay.includes(name.toLowerCase())) continue;
    for (const s of C().sentencesOf(e.text)) {
      if (!clauses.some(c => c.k === "title")) {
        const t = titleRe.exec(s);
        if (t) clauses.push({ k: "title", clause: "is " + aOrAn(t[1].toLowerCase()), sentence: s.trim() });
      }
      if (!clauses.some(c => c.k === "allegiance")) {
        const o = ofRe.exec(s);
        if (o) {
          const target = o[1].trim();
          const isHouse = /^House\s/i.test(target);
          if (isHouse || known.has(target.toLowerCase())) {
            clauses.push({ k: "allegiance",
              clause: (isHouse ? "belongs to " : "is of ") + target, sentence: s.trim() });
          }
        }
      }
    }
  }
  return { clauses, sentences };
}

/* ---------- person, place, or house? ----------
   Statements do not travel between kinds. A city has no age and no
   spouse; a person is not the capital of anywhere and was not founded
   by anybody. Without this the assistant reported that a saint "was
   founded by House Mava" and that a region "has a wife", which are not
   near-misses but category errors.

   The entry's own category decides it where there is one, because that
   is the writer's own filing. Otherwise the evidence is weighed: a title
   in front of the name and pronouns around it argue for a person;
   being somewhere, or having a capital, argues for a place. A verdict
   is only reached when one side is clearly ahead, and "unknown" gates
   nothing, so an ambiguous name keeps everything it had. */
const PERSON_KEYS = ["age", "married", "family", "friends", "likes", "dislikes", "hates",
  "born", "died", "lives", "from", "status", "relative-of", "friend-of", "married-to",
  "disliked-by", "liked-by", "hated-by"];
const PLACE_KEYS = ["capital", "seat", "located", "founded-in", "founded-by", "ruled-by",
  "ruled-by-inv", "founded-by-inv"];
const HOUSE_BLOCK = ["age", "married", "friends", "likes", "dislikes", "hates", "status",
  "relative-of", "friend-of", "married-to", "disliked-by", "liked-by", "hated-by"];

function typeOf(name, ctx) {
  const nl = name.toLowerCase();
  if (/^house\s/i.test(name)) return "house";
  const exact = pool(ctx).find(e => e.title.toLowerCase() === nl);
  if (exact) {
    if (exact.category === "Characters") return "person";
    if (exact.category === "Maps & Locations") return "place";
    if (exact.category === "Noble Houses") return "house";
  }
  let person = 0, place = 0, locatives = 0;
  let titleRe, atRe;
  try {
    titleRe = new RegExp("\\b(?:" + TITLES + ")\\s+" + reEsc(name) + "\\b", "i");
    atRe = new RegExp("\\b(?:in|at|near|within|across|throughout)\\s+" + reEsc(name) + "\\b(?![\u2019'\u02bc\u2018\u00b4]s)", "i");
  } catch (e) { return "unknown"; }
  for (const e of pool(ctx)) {
    if (!e._hay || !e._hay.includes(nl)) continue;
    for (const s of C().sentencesOf(e.text)) {
      if (!s.toLowerCase().includes(nl)) continue;
      /* Pronouns and family words only count when this name is what the
         sentence is ABOUT. "House Patton of Aicruae, whose son..." is
         evidence about the son, not about Aicruae. */
      const lead = namesWithin(s)[0];
      const isSubject = lead && sameSubject(lead.name, nl);
      if (titleRe.test(s)) { person += 6; }
      if (isSubject) {
        if (/\b(?:she|he|her|his|him|herself|himself)\b/i.test(s)) person += 1;
        if (/\b(?:married|born|died|daughter|son|mother|father|sister|brother|wife|husband|reigned)\b/i.test(s)) person += 2;
      }
      // the defining property of a place is that things are IN it
      if (atRe.test(s)) { place += 2; locatives++; }
      /* Place words in a sentence are only corroboration; on their own
         they follow anybody who lives in a kingdom. */
      if (isSubject && locatives &&
          /\b(?:capital|region|city|kingdom|realm|province|village|island|lies|located|borders|territory)\b/i.test(s)) place += 2;
      if (person > 14 || place > 14) break;
    }
    if (person > 14 || place > 14) break;
  }
  if (person >= place + 3) return "person";
  /* Calling a character a place strips her age and her family, so this
     verdict needs the real evidence, not a tally of nearby nouns. */
  if (locatives >= 2 && place >= person + 3) return "place";
  return "unknown";
}

/* Read every statement the entries make about one subject. Text is cut
   into clauses first, because a run-on line holds several separate
   claims and matching across the whole of it would blend them together. */
function readTraits(name, ctx) {
  const nl = name.toLowerCase();
  let found = [];
  const seen = new Set();
  const sources = [];
  for (const e of pool(ctx)) {
    if (!e._hay || !e._hay.includes(nl)) continue;
    let used = false;
    let carry = null;                 // the subject the last sentence named
    for (const sentence of C().sentencesOf(e.text)) {
      if (!sentence.toLowerCase().includes(nl) && !/\b(?:she|he|they)\b/i.test(sentence)) continue;
      if (!looksLikeProse(sentence)) continue;
      // split on the connectives that separate one claim from the next,
      // keeping the offsets so ownership can be judged in context
      const named0 = namesWithin(sentence)[0];
      let cursor = 0;
      const pieces = sentence.split(/\b(?:but|however|although|though|and then|and)\b/i);
      for (const piece of pieces) {
        const pieceAt = sentence.indexOf(piece, cursor);
        cursor = pieceAt + piece.length;
        if (!piece || piece.length < 3) continue;
        // what the clause says about its own subject
        for (const t of TRAITS) {
          if (found.some(f => f.k === t.k)) continue;      // first statement wins
          t.re.lastIndex = 0;
          const m = t.re.exec(piece);
          if (!m) continue;
          if (negatedBefore(piece, m.index)) continue;
          if (!statementBelongsTo(piece, sentence, m.index, nl, carry, pieceAt)) continue;
          let hit = m;
          if (STRICT.has(t.k)) {
            const target = resolveTarget(tidyClause(m[1]));
            if (!target) continue;
            hit = m.slice();        // rewrite the capture to the real name
            hit[1] = target;
          }
          const clause = t.say(hit);
          if (!wellFormed(clause) || selfReferential(clause, name)) continue;
          const key = clause.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ k: t.k, clause, sentence: sentence.trim(), entry: e });
          used = true;
        }
        // and what it says about whoever it names
        for (const t of INVERSE) {
          if (found.some(f => f.k === t.k)) continue;
          t.re.lastIndex = 0;
          const m = t.re.exec(piece);
          if (!m) continue;
          if (negatedBefore(piece, m.index)) continue;
          const owner = ownerOfStatement(piece, sentence, m.index, carry, pieceAt);
          if (!owner || sameSubject(owner, nl)) continue;
          /* The owner is printed, so it is normalised the same way an
             object is; "Matter House Patton" is House Patton with a
             stray word from the line above swept in. */
          const ownerName = resolveTarget(owner) || (knownTarget(owner) ? owner : null);
          if (!ownerName) continue;
          const objects = tidyClause(m[t.obj] || "", 10);
          let named;
          try { named = new RegExp("\\b" + reEsc(name) + "\\b", "i").test(objects); }
          catch (err) { named = false; }
          if (!named) continue;
          const clause = t.say(prettyName(ownerName).replace(new RegExp("^(?:" + TITLES + ")\\s+", "i"), ""), m);
          if (!wellFormed(clause) || selfReferential(clause, name)) continue;
          const key = clause.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ k: t.k, clause, sentence: sentence.trim(), entry: e });
          used = true;
        }
      }
      // whatever this sentence named becomes the antecedent for the next
      if (named0) carry = named0.name;
    }
    if (used && !sources.includes(e)) sources.push(e);
  }

  // titles and allegiances, which sit beside the name rather than after a verb
  const adj = readAdjacent(name, ctx);
  const lead = [];
  adj.clauses.forEach(c => {
    const key = c.clause.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    lead.push({ k: c.k, clause: c.clause, sentence: c.sentence, entry: null });
  });
  found = lead.concat(found);

  /* One statement can satisfy two patterns; "is the goddess of alchemy"
     is both a role and a divinity. Where one clause contains another,
     the longer one already says everything the shorter one does. */
  const PASSIVE_PAIRS = { killed: "killed-by", founded: "founded-by", rules: "ruled-by" };
  const suppress = new Set();
  Object.keys(PASSIVE_PAIRS).forEach(active => {
    if (found.some(f => f.k === active) && found.some(f => f.k === PASSIVE_PAIRS[active])) {
      suppress.add(active);      // "was killed by X" is the specific one
    }
  });
  found = found.filter(f => !suppress.has(f.k));

  /* Statements that belong to a different kind of thing entirely. */
  const kind = typeOf(name, ctx);
  const blocked = kind === "place" ? PERSON_KEYS
    : kind === "person" ? PLACE_KEYS
    : kind === "house" ? HOUSE_BLOCK : null;
  if (blocked) found = found.filter(f => blocked.indexOf(f.k) < 0);

  const trimmed = found.filter((f, i) =>
    !found.some((g, j) => j !== i && g.clause.length > f.clause.length &&
      g.clause.toLowerCase().includes(f.clause.toLowerCase())));

  return { traits: trimmed, sources, kind };
}

/* A well-documented character can satisfy a dozen patterns, and reading
   all of them back produces a paragraph-long sentence nobody finishes.
   The list is ordered most-identifying first, so the top few are the
   ones worth saying; the rest are in the entry. */
const MAX_CLAUSES = 4;

/* ---------- read once per question ----------
   Several handlers now ask the same thing about the same subject, and
   reading every entry three times over to answer one question is waste.
   The cache is cleared whenever a new question starts. */
let traitCache = {};
function traitsFor(name, ctx) {
  const key = name.toLowerCase() + "|" + ((ctx && ctx.scope) || "");
  if (!traitCache[key]) traitCache[key] = readTraits(name, ctx);
  return traitCache[key];
}
function clauseOf(read, keys) {
  const hit = read.traits.filter(t => keys.indexOf(t.k) > -1);
  return hit.length ? hit : null;
}
/* The sentence a set of clauses was read from, for the evidence line. */
function evidenceRows(traits) {
  const seen = new Set();
  return traits.filter(t => t.sentence && !seen.has(t.sentence) && seen.add(t.sentence))
    .map(t => ({ s: t.sentence, e: t.entry }));
}
const quoteOnly = rows => rows.map(r => `<div class="ev-row"><span class="ev-q">${esc(r.s)}</span>` +
  (r.e ? ` <a class="ev-src" href="#/entry/${encodeURIComponent(r.e.id)}">${esc(r.e.title)}</a>` : "") +
  `</div>`).join("");

/* Assemble the clauses into something a person would actually say.
   The subject is named once; after that the repeated "is" is dropped,
   because "Lily is seven, is friends with Max, and does not like Adam"
   reads like a form rather than a sentence. */
function composeSentence(name, traits) {
  if (!traits.length) return "";
  const use = traits.slice(0, MAX_CLAUSES);
  const parts = use.map((t, i) => i === 0 ? t.clause : t.clause.replace(/^is\s+/, ""));
  if (parts.length === 1) return name + " " + parts[0] + ".";
  if (parts.length === 2) return name + " " + parts[0] + " and " + parts[1] + ".";
  return name + " " + parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1] + ".";
}

/* ---------- asking for one thing in particular ----------
   The reading layer already knows who killed whom, who founded what,
   what somebody is called and which house they belong to. Until now
   there was no way to ASK any of it: "who killed Enyokia" fell through
   to a keyword search, which is a poor answer to a question the
   assistant could answer exactly.

   Each entry pairs a phrasing with the readings that answer it. When
   nothing has been read for that attribute the handler steps aside
   rather than declaring the matter closed, so the older search still
   gets its turn. */
const ASKED_ABOUT = [
  [/^\s*who\s+killed\s+(.+?)\s*\??\s*$/i, ["killed-by", "killed-by-inv"]],
  [/^\s*who\s+(?:did\s+)?(.+?)\s+kill\s*\??\s*$/i, ["killed"]],
  [/^\s*who\s+(?:rules?|ruled|reigns?|reigned\s+over)\s+(.+?)\s*\??\s*$/i, ["ruled-by", "ruled-by-inv"]],
  [/^\s*who\s+founded\s+(.+?)\s*\??\s*$/i, ["founded-by", "founded-by-inv"]],
  [/^\s*who\s+(?:leads|led)\s+(.+?)\s*\??\s*$/i, ["led-by-inv"]],
  [/^\s*who\s+(?:worships|worshipped)\s+(.+?)\s*\??\s*$/i, ["worshipped-by-inv"]],
  [/^\s*who\s+betrayed\s+(.+?)\s*\??\s*$/i, ["betrayed-by-inv"]],
  [/^\s*who\s+serves\s+(.+?)\s*\??\s*$/i, ["served-by-inv"]],
  [/^\s*who\s+(?:does|did)\s+(.+?)\s+(?:love|like|admire)\s*\??\s*$/i, ["likes"]],
  [/^\s*who\s+(?:does|did)\s+(.+?)\s+(?:hate|dislike|distrust)\s*\??\s*$/i, ["hates", "dislikes"]],
  [/^\s*who\s+(?:is|was)\s+(.+?)\s+married\s+to\s*\??\s*$/i, ["married", "married-to"]],
  [/^\s*who\s+(?:is|are|was|were)\s+(.+?)(?:'s|s')\s+(?:wife|husband|spouse)\s*\??\s*$/i, ["married", "married-to"]],
  [/^\s*who\s+(?:is|are|was|were)\s+(.+?)(?:'s|s')\s+(?:friends?|companions?)\s*\??\s*$/i, ["friends", "friend-of"]],
  [/^\s*who\s+(?:is|was)\s+(.+?)\s+friends\s+with\s*\??\s*$/i, ["friends", "friend-of"]],
  [/^\s*who\s+(?:is|are|was|were)\s+(.+?)(?:'s|s')\s+(?:sisters?|brothers?|siblings?|parents?|mother|father|children|sons?|daughters?|family)\s*\??\s*$/i,
    ["family", "relative-of"]],
  [/^\s*(?:does|did)\s+(.+?)\s+have\s+(?:any\s+)?(?:siblings?|children|family|a\s+sister|a\s+brother|a\s+wife|a\s+husband)\s*\??\s*$/i,
    ["family", "relative-of", "married", "married-to"]],
  [/^\s*what\s+(?:is|was)\s+(.+?)(?:'s|s')\s+age\s*\??\s*$/i, ["age", "born"]],
  [/^\s*what\s+(?:is|was)\s+(.+?)(?:'s|s')\s+(?:title|rank)\s*\??\s*$/i, ["title", "role"]],
  [/^\s*what\s+(?:is|was)\s+(.+?)\s+(?:also\s+)?(?:called|known\s+as)\s*\??\s*$/i, ["alias"]],
  [/^\s*what\s+(?:is|was)\s+(.+?)\s+known\s+for\s*\??\s*$/i, ["renown", "remembered"]],
  [/^\s*what\s+house\s+(?:is|was)\s+(.+?)\s+(?:from|in|of)\s*\??\s*$/i, ["allegiance", "family"]],
  [/^\s*(?:which|what)\s+house\s+(?:does|did)\s+(.+?)\s+belong\s+to\s*\??\s*$/i, ["allegiance", "family"]],
  [/^\s*(?:is|was)\s+(.+?)\s+(?:still\s+)?(?:alive|dead|living)\s*\??\s*$/i, ["status", "died"]],
  [/^\s*when\s+did\s+(.+?)\s+die\s*\??\s*$/i, ["died"]],
  [/^\s*when\s+(?:was|were)\s+(.+?)\s+born\s*\??\s*$/i, ["born"]],
  [/^\s*where\s+(?:does|did)\s+(.+?)\s+live\s*\??\s*$/i, ["lives", "from"]],
  [/^\s*what\s+(?:is|was)\s+the\s+capital\s+of\s+(.+?)\s*\??\s*$/i, ["capital"]],
];
function hAttribute(q, ctx, S) {
  for (const [re, keys] of ASKED_ABOUT) {
    const m = re.exec(q);
    if (!m) continue;
    const found = findEntity(m[1]);
    if (!found) continue;
    const read = traitsFor(found.name, ctx);
    const hit = read.traits.filter(t => keys.indexOf(t.k) > -1);
    if (!hit.length) {
      /* Nothing read for this attribute. If nothing at all was read
         about the subject, step aside and let the older search try. But
         where the entries plainly DO describe them and simply never say
         this, saying so is the better answer; a keyword dump implies
         the assistant did not understand the question. */
      if (!read.traits.length) continue;
      return out(`${dymNote(m[1], found)}
        <div class="assistant-hint">Your entries describe <b>${esc(found.name)}</b>, but never say this.
        That part is not established yet.</div>`,
        { sources: read.sources.slice(0, 3), subject: found.name });
    }
    return out(`${dymNote(m[1], found)}
      <div class="bs lead">${esc(composeSentence(found.name, hit))}</div>
      ${quoteOnly(evidenceRows(hit))}`,
      { sources: read.sources, subject: found.name,
        grounded: "Read from your own wording · nothing added" });
  }
  return null;
}

/* ---------- "who is X" / "what is X" / "tell me about X" ----------
   The most ordinary question there is, and until now the only one with
   no handler at all. */
function hWhoIs(q, ctx, S) {
  const m = q.match(/^\s*(?:who|what)(?:'s|s)?\s+(?:is|are|was|were)\s+(.+?)\s*\??\s*$/i) ||
            q.match(/^\s*tell\s+me\s+(?:about|more\s+about)\s+(.+?)\s*\??\s*$/i) ||
            q.match(/^\s*what\s+do\s+you\s+know\s+about\s+(.+?)\s*\??\s*$/i) ||
            q.match(/^\s*(?:describe|summarise|summarize)\s+(.+?)(?:\s+(?:to|for)\s+me)?\s*\??\s*$/i) ||
            q.match(/^\s*give\s+me\s+(?:a\s+)?(?:summary|rundown|overview)\s+(?:of|on|about)\s+(.+?)\s*\??\s*$/i) ||
            q.match(/^\s*(?:info|information)\s+(?:on|about)\s+(.+?)\s*\??\s*$/i);
  if (!m) return null;
  const found = findEntity(m[1]);
  if (!found) return null;               // not a subject; let the pipeline try
  const name = found.name;

  const read = traitsFor(name, ctx);
  const summary = C().topicSummary(name, Math.max(2, Math.min(S, 4)));
  const home = C().bestEntryFor(name, true);
  const facts = home ? C().factsOf(home, 8) : [];
  const inferred = composeSentence(name, read.traits);
  /* Everything found beyond what the sentence can carry. Dropping it
     would mean the assistant had read a death or a founding and then
     silently decided not to mention it. */
  const alsoFound = read.traits.slice(MAX_CLAUSES);

  if (!inferred && !summary.length && !facts.length) {
    return out(`${dymNote(m[1], found)}
      <div class="assistant-hint"><b>${esc(name)}</b> is mentioned in your entries, but nothing
      there says anything about ${esc(name)} yet.</div>`, { subject: name });
  }

  const sources = read.sources.length ? read.sources
    : (home ? [home] : C().mentionsOf(name, null, true).slice(0, 4));

  /* The sentences the reading came from, and then whatever the summary
     adds BEYOND them. On a short note those are the same line, and
     printing it twice makes the answer look padded. */
  const quoted = Array.from(new Set(read.traits.map(t => t.sentence)));
  const quotedKeys = new Set(quoted.map(s => s.slice(0, 40).toLowerCase()));
  const extra = inferred ? summary.filter(s => !quotedKeys.has(s.slice(0, 40).toLowerCase())) : [];

  return out(`${dymNote(m[1], found)}
    <div class="blurb">
      <div class="bt">${home ? C().catDot(home.category) : ""} ${esc(name)}</div>
      ${home ? `<div class="bc">${esc(home.category)}</div>` : ""}
      ${inferred ? `<div class="bs lead">${esc(inferred)}</div>` : ""}
      ${!inferred && summary.length ? `<div class="bs">${esc(summary.join(" ").slice(0, 420))}</div>` : ""}
      ${alsoFound.length ? `<ul class="also-read">${alsoFound.map(t =>
        `<li>${esc(t.clause.replace(/^is\s+/, ""))}</li>`).join("")}</ul>` : ""}
      ${facts.length ? `<dl class="sc-facts">${facts.map(f =>
        `<dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd>`).join("")}</dl>` : ""}
      ${home ? `<div style="margin-top:9px"><a class="btn sm" href="#/entry/${encodeURIComponent(home.id)}">Open entry</a></div>` : ""}
    </div>
    ${quoted.length ? `<details class="infer-src">
      <summary>Where I read that</summary>
      ${quoted.map(s => `<div class="ev-row"><span class="ev-q">${esc(s)}</span></div>`).join("")}
    </details>` : ""}
    ${extra.length ? `<div class="a-more">${esc(extra.join(" ").slice(0, 340))}</div>` : ""}`,
    { sources, subject: name,
      grounded: inferred
        ? "Read from your own wording · nothing added"
        : "Grounded in your entries · nothing invented" });
}

/* ============================================================
   DISPATCH; first shape that matches, answers
   ============================================================ */
const HANDLERS = [
  hSmalltalk, hHelp, hMemories, hRemember, hStats, hRandom,
  hCompare, hRelation, hWhoAppears, hWhen, hWhere, hHowOld,
  hWhyHow, hDefine, hFacts, hOpinion,
  // asking for one attribute in particular, before the general form
  hAttribute,
  // last: the most general question, so every specific shape gets first
  // refusal and this catches what is left
  hWhoIs,
];
function answer(q, ctx) {
  if (!C() || !C().DB) return null;
  ctx = ctx || {};
  traitCache = {};          // a new question reads the entries afresh
  const S = ctx.length === "full" ? 6 : 3;
  for (const h of HANDLERS) {
    let r = null;
    /* one broken handler must not take the whole rail down; the rest
       of the pipeline in app.js is still waiting behind this module */
    try { r = h(q, ctx, S); } catch (e) {
      try { console.error("Assistant brain handler failed:", e); } catch (e2) {}
    }
    if (r) {
      state.lastQ = q;
      if (r.subject) state.subject = r.subject;
      return r;
    }
  }
  return null;
}

/* ============================================================
   MARKDOWN, small and safe; for model answers
   Escapes first, transforms after, so nothing a model sends can smuggle
   markup into the page. Covers what models actually emit: headings,
   bold, italics, code, lists, quotes, paragraphs.
   ============================================================ */
function md(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let para = [], list = null;   // list: {tag, items}
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const flushPara = () => { if (para.length) { out.push("<p>" + para.join(" ") + "</p>"); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>` + list.items.map(i => `<li>${i}</li>`).join("") + `</${list.tag}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) { flushPara(); flushList(); out.push(`<h5 class="md-h">${inline(h[2])}</h5>`); continue; }
    const ul = line.match(/^[-*•]\s+(.+)$/);
    if (ul) { flushPara(); if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; } list.items.push(inline(ul[1])); continue; }
    const ol = line.match(/^\d+[.)]\s+(.+)$/);
    if (ol) { flushPara(); if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; } list.items.push(inline(ol[1])); continue; }
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) { flushPara(); flushList(); out.push(`<blockquote>${inline(bq[1])}</blockquote>`); continue; }
    flushList(); para.push(inline(line));
  }
  flushPara(); flushList();
  return out.join("\n") || "<p></p>";
}

/* ---------- the idle greeting ---------- */
function greetingHtml() {
  const h = new Date().getHours();
  const tod = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const vo = voice();
  return `<div class="a-greet"><span class="ag-hi">${esc(tod)}.</span>${vo
    ? `<span class="a-voice inline">${esc(vo.v.hello)}</span>` : ""}</div>`;
}

window.CodexBrain = {
  answer, resolve, observe, reset, subject, typeOf,
  md, greetingHtml, capabilitiesHtml,
};
})();
