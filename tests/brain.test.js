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

/* mirrors app.js exactly, including the fallback: a note with no full
   stop is still one sentence, and a stub that returned [] there hid a
   real answer behind a fixture bug */
const sentencesOf = t => {
  const x = String(t || "").replace(/\s+/g, " ").trim();
  const m = x.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  return (m && m.length) ? m.map(s => s.trim()) : (x ? [x] : []);
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


  // ---------------------------------------------------------------
  // A WORKSPACE STARTED FROM SCRATCH: no imported canon, one note,
  // and the person you are asking about exists only inside its text.
  // This is the shape of a real bug report: "who is lily" answered
  // "Nothing in your canon matches" while the note sat on screen.
  // ---------------------------------------------------------------
  const scratch = [{ id: "s1", title: "Untitled note", category: "My Notes", type: "note",
    wordcount: 17,
    text: "LILY IS SEVEN AND Friends with Max Steve Ivory But she does not like Adam or even" }];
  scratch.forEach(e => { e._hay = (e.title + " " + e.text).toLowerCase(); });
  const realDB = window.Codex.DB;
  const realTopic = window.Codex.topicSummary;
  const realMentions = window.Codex.mentionsOf;
  const realBest = window.Codex.bestEntryFor;
  window.Codex.DB = { entries: scratch, entities: ["Untitled note"] };   // names = titles only
  window.Codex.topicSummary = (n, k) => sentencesOf(scratch.map(e => e.text).join(" "))
    .filter(x => x.toLowerCase().includes(n.toLowerCase())).slice(0, k);
  window.Codex.mentionsOf = n => scratch.filter(e => e._hay.includes(n.toLowerCase()));
  window.Codex.bestEntryFor = n => scratch.find(e => e._hay.includes(n.toLowerCase())) || null;

  B.reset();
  let lily = ans("who is lily");
  const lilyText = lily ? lily.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "";
  check("scratch: 'who is lily' is answered at all", !!lily, "returned null");
  check("scratch: reads her age out of the note", /Lily is seven/i.test(lilyText), lilyText.slice(0, 200));
  check("scratch: reads who she is friends with", /friends with Max Steve Ivory/i.test(lilyText), lilyText.slice(0, 200));
  check("scratch: reads who she dislikes", /does not like Adam/i.test(lilyText), lilyText.slice(0, 200));
  check("scratch: does not swallow the trailing 'or even'",
    !/like Adam or even/i.test(lilyText.split("Where I read")[0]), lilyText.slice(0, 220));
  check("scratch: names her properly, not SHOUTED", /Lily/.test(lilyText) && lily.subject === "Lily", lily && lily.subject);
  check("scratch: says the reading came from the writer's own words",
    /own wording/i.test(lily.grounded || ""), lily && lily.grounded);

  // the failure that matters most: traits must not leak between people
  B.reset();
  const max = ans("tell me about Max");
  const maxText = max ? max.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "";
  /* Only the COMPOSED sentence is a claim; the quoted source underneath
     it is context and is expected to name everyone. */
  const leadOf = r => {
    const m = r && /<div class="bs lead">([\s\S]*?)<\/div>/.exec(r.html);
    return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
  };
  /* Max may be described THROUGH the relation Lily's sentence states,
     but must never inherit Lily's own attributes. */
  check("scratch: Max is not given Lily's age", !/seven/i.test(leadOf(max)), leadOf(max));
  check("scratch: Max is not said to be friends with himself",
    !/friends with Max/i.test(leadOf(max)), leadOf(max));
  check("scratch: Max is not said to dislike Adam",
    !/does not like Adam/i.test(leadOf(max)), leadOf(max));
  check("scratch: Lily's own claim IS composed", /^Lily is seven/.test(leadOf(lily)), leadOf(lily));
  B.reset();
  const adam = ans("who is Adam");
  const adamText = adam ? adam.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "";
  check("scratch: Adam is not said to dislike himself",
    !/Adam does not like|does not like Adam/i.test(leadOf(adam)), leadOf(adam));
  check("scratch: Adam is not given Lily's age", !/seven/i.test(leadOf(adam)), leadOf(adam));


  /* The handlers must not contradict one another. "who is Lily" saying
     she is seven while "how old is Lily" says it is not established is
     worse than either answer on its own. */
  B.reset();
  const howOld = ans("how old is lily");
  check("scratch: 'how old' agrees with 'who is'",
    !!howOld && /Lily is seven/i.test(howOld.html), howOld ? leadOf(howOld) : "returned null");
  B.reset();
  check("scratch: and still admits what is NOT written",
    /never|not established/i.test((ans("where is lily") || {}).html || ""), "");

  /* The other side of a relation. "Lily is friends with Max" says
     something about Max too, and the answer to "who is Max" should be
     about Max rather than a line about Lily with nothing drawn from it. */
  B.reset();
  const maxLead = leadOf(ans("who is Max"));
  check("scratch: reads the relation from Max's side", /^Max is a friend of Lily\.?$/.test(maxLead), maxLead);
  B.reset();
  check("scratch: and from Steve's", /^Steve is a friend of Lily\.?$/.test(leadOf(ans("who is Steve"))),
    leadOf(ans("who is Steve")));
  B.reset();
  check("scratch: a dislike inverts too, without reversing who dislikes whom",
    /^Adam is someone Lily does not like\.?$/.test(leadOf(ans("who is Adam"))), leadOf(ans("who is Adam")));
  B.reset();
  check("scratch: Lily is still not described as her own friend",
    !/friend of Lily/.test(leadOf(ans("who is lily"))), leadOf(ans("who is lily")));

  /* "Canon only" keeps to the built-in collections, which exclude My
     Notes. A workspace made entirely of notes must not be told its own
     entries do not exist. */
  B.reset();
  const canonScoped = B.answer("who is steve", { scope: "canon", length: "brief" });
  check("scratch: 'Canon only' does not blind it when every entry is a note",
    !!canonScoped && /Steve is a friend of Lily/.test(canonScoped.html),
    canonScoped ? leadOf(canonScoped) : "returned null");

  // a predicate is not a name
  B.reset();
  check("scratch: 'who is <a description>' is not treated as a name",
    ans("who is terrified of open water") === null);

  window.Codex.DB = realDB;
  window.Codex.topicSummary = realTopic;
  window.Codex.mentionsOf = realMentions;
  window.Codex.bestEntryFor = realBest;

  // back on the ordinary fixture, the plain question still works
  B.reset();
  const whoAmara = ans("who is Amara");
  check("'who is X' answers on a normal canon too", !!whoAmara &&
    /Amara/.test(whoAmara.html), whoAmara && whoAmara.html.slice(0, 120));


  // ---------------------------------------------------------------
  // THE EXPANDED VOCABULARY, and the traps a real canon set for it.
  // Every rejection below is a mistake this made on 422,000 words of
  // the writer's own material before it was tightened.
  // ---------------------------------------------------------------
  const vocab = [
    { id: "v1", title: "Kaeya", category: "Characters", type: "pdf", wordcount: 40,
      text: "Queen Kaeya of House Veren was born in 8,544 BR. She is the goddess of alchemy. " +
            "Kaeya founded House Veren and ruled Torad for thirty years. " +
            "Kaeya is also known as the Pale Queen. She was killed by Sevtor. " +
            "Kaeya is remembered for ending the long winter." },
    { id: "v2", title: "Sevtor", category: "Characters", type: "pdf", wordcount: 20,
      text: "Sevtor betrayed Kaeya at the gate. Sevtor is loyal to House Orana and serves Lord Dain." },
    { id: "v3", title: "Torad", category: "Maps & Locations", type: "pdf", wordcount: 20,
      text: "Torad is the capital of the western reach. Torad lies beside the river Vael." },
    // the shapes that produced nonsense before the guards went in
    { id: "v4", title: "Junk", category: "Canon & Continuity", type: "pdf", wordcount: 40,
      text: "Duri's ten rules that govern the faith are listed here. " +
            "Status by era Key Turning Points Accomplishments succession TBD. " +
            "Kaeya is a promise that was never kept. Kaeya is 5 of the twelve listed." },
  ];
  vocab.forEach(e => { e._hay = (e.title + " " + e.text).toLowerCase(); });
  window.Codex.DB = { entries: vocab,
    entities: ["Kaeya", "Sevtor", "Torad", "House Veren", "House Orana", "Dain", "Vael",
               "Duri", "Alpha", "Beta", "Gamma", "Delta"] };   // a real index (>= 10 names)
  window.Codex.topicSummary = (n, k) => sentencesOf(vocab.map(e => e.text).join(" "))
    .filter(x => x.toLowerCase().includes(n.toLowerCase())).slice(0, k);
  window.Codex.mentionsOf = n => vocab.filter(e => e._hay.includes(n.toLowerCase()));
  window.Codex.bestEntryFor = n => vocab.find(e => e.title.toLowerCase() === n.toLowerCase())
    || vocab.find(e => e._hay.includes(n.toLowerCase())) || null;

  B.reset();
  const kaeya = leadOf(ans("who is Kaeya"));
  check("vocab: reads a title from in front of the name", /\ba queen\b/i.test(kaeya), kaeya);
  check("vocab: reads a house allegiance from after it", /House Veren/.test(kaeya), kaeya);
  check("vocab: a year keeps its thousands separator", !/8,?54?4?\b/.test(kaeya) || /8,544/.test(kaeya), kaeya);
  B.reset();
  const kaeyaAll = ans("who is Kaeya").html;
  check("vocab: divinity is read", /goddess of alchemy/i.test(kaeyaAll), kaeya);
  check("vocab: founding is read", /founded House Veren/i.test(kaeyaAll), kaeya);
  check("vocab: an alias is read", /also known as the Pale Queen/i.test(kaeyaAll), kaeya);
  check("vocab: a death is read", /killed by Sevtor/i.test(kaeyaAll), kaeya);
  check("vocab: never both killed and killed-by the same person",
    !(/(?:^|[^n])\bkilled Sevtor/i.test(kaeyaAll) && /killed by Sevtor/i.test(kaeyaAll)), kaeya);

  B.reset();
  const sevtor = ans("who is Sevtor").html;
  const sevtorSaid = sevtor.split("Where I read")[0];   // the answer, not its sources
  check("vocab: loyalty is read", /loyal to House Orana/i.test(sevtorSaid), sevtorSaid.slice(0, 200));
  check("vocab: service is read", /serves\s+(?:Lord\s+)?Dain/i.test(sevtorSaid), sevtorSaid.slice(0, 200));
  B.reset();
  check("vocab: betrayal inverts onto its victim",
    /was betrayed by Sevtor/i.test(ans("who is Kaeya").html), "");

  B.reset();
  const torad = ans("who is Torad").html;
  check("vocab: a place reads as a place", /capital of/i.test(torad) && /lies beside/i.test(torad),
    leadOf(ans("who is Torad")));
  B.reset();
  check("vocab: rulership inverts onto the place", /ruled by Kaeya/i.test(ans("who is Torad").html), "");

  // the traps
  B.reset();
  const junk = ans("who is Kaeya").html;
  check("trap: a possessive noun is not a verb ('Duri's ten rules')",
    !/ruled that|ruled ten/i.test(junk), junk.slice(0, 200));
  check("trap: heading words are never treated as names",
    !/Key Turning|Accomplishments|TBD/i.test(leadOf(ans("who is Kaeya"))), leadOf(ans("who is Kaeya")));
  B.reset();
  check("trap: 'is a promise' is not a role", !/is a promise/i.test(leadOf(ans("who is Kaeya"))),
    leadOf(ans("who is Kaeya")));
  B.reset();
  check("trap: a bare number is not an age", !/\bis 5\b/.test(leadOf(ans("who is Kaeya"))),
    leadOf(ans("who is Kaeya")));
  B.reset();
  check("trap: the answer stays a readable length",
    leadOf(ans("who is Kaeya")).split(/\s+/).length < 40, leadOf(ans("who is Kaeya")));


  /* Statements do not travel between kinds of thing. */
  B.reset();
  check("kind: an entry filed under Characters is a person",
    B.typeOf("Kaeya", { scope: "everything" }) === "person", B.typeOf("Kaeya", { scope: "everything" }));
  check("kind: an entry filed under Maps is a place",
    B.typeOf("Torad", { scope: "everything" }) === "place", B.typeOf("Torad", { scope: "everything" }));
  check("kind: a name beginning 'House' is a house",
    B.typeOf("House Veren", { scope: "everything" }) === "house", B.typeOf("House Veren", { scope: "everything" }));
  B.reset();
  check("kind: a place is never given a spouse or an age",
    !/(?:has a wife|has a husband|is married|is \\d+ years old)/i.test(leadOf(ans("who is Torad"))),
    leadOf(ans("who is Torad")));
  B.reset();
  check("kind: a person is never said to have been founded",
    !/was founded (?:by|in)/i.test(leadOf(ans("who is Kaeya"))), leadOf(ans("who is Kaeya")));

  window.Codex.DB = realDB;
  window.Codex.topicSummary = realTopic;
  window.Codex.mentionsOf = realMentions;
  window.Codex.bestEntryFor = realBest;


  /* ---------------------------------------------------------------
     Two faults found by playing with it rather than testing it.
     --------------------------------------------------------------- */

  // A denial must never be read as an assertion.
  const denial = [{ id: "d1", title: "NOTE", category: "My Notes", type: "note", wordcount: 20,
    text: "Rhea is not a queen. Rhea never lived in Halden. Rhea does not like Doran." }];
  denial.forEach(e => { e._hay = (e.title + " " + e.text).toLowerCase(); });
  window.Codex.DB = { entries: denial, entities: ["Rhea", "Halden", "Doran"] };
  window.Codex.topicSummary = (n, k) => sentencesOf(denial.map(e => e.text).join(" "))
    .filter(x => x.toLowerCase().includes(String(n).toLowerCase())).slice(0, k);
  window.Codex.mentionsOf = n => denial.filter(e => e._hay.includes(String(n).toLowerCase()));
  window.Codex.bestEntryFor = n => denial.find(e => e._hay.includes(String(n).toLowerCase())) || null;

  B.reset();
  const rhea = leadOf(ans("who is Rhea"));
  check("negation: 'never lived in Halden' is not read as living there",
    !/lives in Halden/i.test(rhea), rhea);
  check("negation: 'is not a queen' is not read as being one",
    !/\bis a queen\b/i.test(rhea), rhea);
  check("negation: a pattern carrying its own 'not' still works",
    /does not like Doran/i.test(rhea) || rhea === "", rhea);

  /* The writer's own words must survive being remembered. "remember:
     Torad keeps its gates shut" was being stored as "... keeps House
     Patton's gates shut", because the pronoun resolver rewrote the
     statement using whatever had last been discussed. */
  B.reset();
  B.observe("what do you think of House Patton", "House Patton");
  const typed = "remember: Torad keeps its gates shut after dusk";
  check("memory: an instruction's wording is never rewritten",
    B.resolve(typed) === typed, B.resolve(typed));
  check("memory: but a QUESTION still resolves its pronouns",
    /House Patton/.test(B.resolve("where is it from?")), B.resolve("where is it from?"));

  window.Codex.DB = realDB;
  window.Codex.topicSummary = realTopic;
  window.Codex.mentionsOf = realMentions;
  window.Codex.bestEntryFor = realBest;

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
