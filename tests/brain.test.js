/* Runtime smoke test for site/js/brain.js: stub the app surface it
   consults, feed it questions, and make sure each intent answers (or
   correctly declines) without throwing. */
"use strict";
const fs = require("fs");
const path = require("path");

global.window = globalThis;

// ---------- fake canon ----------
const entries = [
  { id: "e1", title: "Amara", category: "Characters", type: "pdf", wordcount: 400,
    text: "Amara\nAge: 24\nBorn: 1204\nStatus: Alive\nAmara is the last archivist of Karyth. " +
      "She was born in 1204, three years after the Sundering ended. " +
      "Amara distrusts Veyra because the war took her brother. " +
      "Amara lives in Karyth, in the north of the Silver Reach." },
  { id: "e2", title: "Veyra", category: "Characters", type: "pdf", wordcount: 250,
    text: "Veyra\nStatus: Exiled\nVeyra led the host at the gates in 1201. " +
      "Veyra and Amara met once, at the signing of the Accord. " +
      "She was exiled to the south due to the burning of the archive." },
  { id: "e3", title: "Karyth", category: "Maps & Locations", type: "pdf", wordcount: 180,
    text: "Karyth\nRegion: Silver Reach\nKaryth is a walled city in the north. " +
      "The city sits above the river Vael. Karyth was founded in 987." },
  { id: "e4", title: "The Sundering", category: "Timeline & History", type: "pdf", wordcount: 220,
    text: "The Sundering\nEra: Second Age\nThe Sundering began in 1198 and ended in 1201. " +
      "It started because the twin crowns both claimed the archive. " +
      "As a result the old faith splintered." },
  { id: "e5", title: "Accord", category: "Reference & Lexicon", type: "pdf", wordcount: 90,
    text: "Accord\nThe Accord means the peace signed at Karyth in 1201, ending the Sundering." },
];
entries.forEach(e => { e._hay = (e.title + " " + e.text).toLowerCase(); });
const entities = ["Amara", "Veyra", "Karyth", "The Sundering", "Accord", "Silver Reach", "Vael"];

const sentencesOf = t => {
  const m = String(t || "").replace(/\s+/g, " ").match(/[^.!?]+[.!?]+(?=\s|$)/g);
  return m ? m.map(s => s.trim()) : [];
};
window.Codex = {
  DB: { entries, entities },
  CANON_ORDER: ["Characters", "Noble Houses", "Maps & Locations", "Religion & Faith",
    "Magic System", "Timeline & History", "Culture & Fashion", "Books & Stories",
    "Reference & Lexicon", "Canon & Continuity"],
  sentencesOf,
  entitiesIn: t => new Set(entities.filter(n => String(t || "").includes(n))),
  factsOf: (e, limit) => {
    const out = [];
    String(e.text || "").split("\n").forEach(l => {
      const m = l.match(/^([A-Z][\w ]{1,20}):\s*(.+)$/);
      if (m && out.length < (limit || 8)) out.push({ k: m[1].trim(), v: m[2].trim() });
    });
    return out;
  },
  topicSummary: (name, n) => sentencesOf(entries.filter(e => e._hay.includes(name.toLowerCase()))
    .map(e => e.text).join(" ")).filter(s => s.toLowerCase().includes(name.toLowerCase())).slice(0, n || 3),
  mentionsOf: (name, ex, fa) => entries.filter(e => e.id !== ex && e._hay.includes(name.toLowerCase())),
  bestEntryFor: (name) => entries.find(e => e.title.toLowerCase() === name.toLowerCase()) ||
    entries.find(e => e._hay.includes(name.toLowerCase())) || null,
  catDot: () => "",
  addNote: async (title, text) => { window.__savedNote = { title, text }; return { id: "n1" }; },
};

// load the brain
const src = fs.readFileSync(path.join(__dirname, "../site/js/brain.js"), "utf8");
eval(src);
const B = window.CodexBrain;

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (extra ? " :: " + extra : "")); }
}
const ans = q => B.answer(q, { scope: "everything", length: "brief" });

// small talk
check("hello", /assistant-hint|a-voice/.test((ans("hello") || {}).html || ""));
check("who are you", /archivist/.test((ans("who are you?") || {}).html || ""));
check("help", /Everything I can do/.test((ans("what can you do") || {}).html || ""));

// compare
let r = ans("compare Amara and Veyra");
check("compare", r && /cmp-table/.test(r.html) && /Amara/.test(r.html) && /Veyra/.test(r.html));
check("compare sources", r && r.sources.length >= 1, r && r.sources.length);

// relation
r = ans("relationship between Amara and Veyra");
check("relation", r && /connect/.test(r.html) && /Accord|distrusts/.test(r.html));

// when / timeline
r = ans("when was the Sundering");
check("when", r && /1198|1201/.test(r.html), r && r.html.slice(0, 120));
r = ans("timeline of Karyth");
check("timeline", r && /987/.test(r.html));

// where
r = ans("where is Amara");
check("where-person", r && /Karyth|north/.test(r.html));
r = ans("where is Karyth");
check("where-place", r && /walled city|Maps/.test(r.html));

// why
r = ans("why did the Sundering start");
check("why", r && /twin crowns|because/.test(r.html), r ? r.html.slice(0, 160) : "null");

// how old
r = ans("how old is Amara");
check("how-old", r && /24|1204/.test(r.html));

// define
r = ans("what does Accord mean");
check("define", r && /peace signed/.test(r.html));

// facts
r = ans("facts Amara");
check("facts", r && /Age/.test(r.html) && /24/.test(r.html));

// who appears in
r = ans("who appears in Amara");
check("who-appears", r && /Karyth|Veyra/.test(r.html));

// opinion
r = ans("what do you think of Amara");
check("opinion", r && /reasoning|numbers/i.test(r.html) && r.subject === "Amara");

// stats
r = ans("stats");
check("stats", r && /entries/.test(r.html) && /words/.test(r.html));

// random
r = ans("surprise me");
check("random", r && /blurb|entry/i.test(r.html));

// remember + memories
r = ans("remember: Amara fears deep water");
check("remember", r && /Remembered/.test(r.html));
setTimeout(() => {
  check("remember saved note", window.__savedNote && /fears deep water/.test(window.__savedNote.text));

  // fuzzy: one letter off
  r = ans("facts Amora");
  check("fuzzy", r && /Amara/.test(r.html) && /I read/.test(r.html), r ? r.html.slice(0, 100) : "null");

  // pronoun resolution
  B.reset();
  B.observe("tell me about Amara", "Amara");
  check("resolve-she", B.resolve("where is she from?") === "where is Amara from?", B.resolve("where is she from?"));
  check("resolve-her-poss", /Amara's brother/.test(B.resolve("who is her brother")), B.resolve("who is her brother"));
  check("resolve-what-about", /Veyra/.test(B.resolve("what about Veyra?")), B.resolve("what about Veyra?"));

  // guard rails: things the brain must NOT swallow
  check("skip list-cmd", ans("list all characters") === null);
  check("skip how-many", ans("how many houses are there") === null);
  check("skip summarize", ans("summarize this document") === null);
  check("skip consistency", ans("check consistency") === null);
  check("skip plain name", ans("Amara") === null);
  check("skip remember-when", ans("remember when the war started?") === null);

  // markdown
  const html = B.md("## Head\n\n**Bold** and *italic* and `code`.\n\n- one\n- two\n\n1. first\n2. second\n\n> a quote\n\n<script>alert(1)</script>");
  check("md-heading", /<h5 class="md-h">Head<\/h5>/.test(html));
  check("md-bold", /<strong>Bold<\/strong>/.test(html));
  check("md-list", /<ul><li>one<\/li><li>two<\/li><\/ul>/.test(html));
  check("md-ol", /<ol><li>first<\/li><li>second<\/li><\/ol>/.test(html));
  check("md-quote", /<blockquote>a quote<\/blockquote>/.test(html));
  check("md-escapes", !/<script>/.test(html));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 20);
