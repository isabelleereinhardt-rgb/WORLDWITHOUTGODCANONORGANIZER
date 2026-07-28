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
  let p = db.entries.filter(e => (e.type === "pdf" || e.type === "note") && e.aiRead !== false);
  if (ctx && ctx.scope === "canon") {
    const order = C().CANON_ORDER || [];
    if (order.length) p = p.filter(e => order.includes(e.category));
  }
  return p;
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
  const rows = sentencesWith(name, TEMPORAL, ctx, S * 3);
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
   DISPATCH; first shape that matches, answers
   ============================================================ */
const HANDLERS = [
  hSmalltalk, hHelp, hMemories, hRemember, hStats, hRandom,
  hCompare, hRelation, hWhoAppears, hWhen, hWhere, hHowOld,
  hWhyHow, hDefine, hFacts, hOpinion,
];
function answer(q, ctx) {
  if (!C() || !C().DB) return null;
  ctx = ctx || {};
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
  answer, resolve, observe, reset, subject,
  md, greetingHtml, capabilitiesHtml,
};
})();
