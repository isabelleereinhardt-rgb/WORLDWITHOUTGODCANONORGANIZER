/* The narrative tier: a model reading prose for contradictions that no
   value comparison could catch.

   Almost all of this is about the guard. A model asked to find
   contradictions will find them whether or not they are there, and a
   confidently reported contradiction that is not in the text is worse
   than missing a real one — you would go looking for it, fail to find
   it, and stop trusting the tool. Nothing it says is shown until its
   quotes are located in the writer's own words.
*/
"use strict";
const fs = require("fs");
const path = require("path");
global.window = globalThis;

const bag = {};
global.localStorage = {
  getItem: k => (k in bag ? bag[k] : null),
  setItem: (k, v) => { bag[k] = String(v); },
  removeItem: k => { delete bag[k]; },
};

const sentencesOf = t => {
  const x = String(t || "").replace(/\s+/g, " ").trim();
  const m = x.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  return (m && m.length) ? m.map(s => s.trim()) : (x ? [x] : []);
};
const entries = [
  { id: "e1", title: "Kestrel Amadi", category: "Characters", type: "note", text:
    "Kestrel Amadi had never held a sword in her life, and said so to anyone who asked her about the war.\n\n" +
    "She kept the archive at Vane Hollow for eleven years without once leaving the grounds." },
  { id: "e2", title: "The Ford", category: "My Notes", type: "note", text:
    "At the ford, the sword was familiar in Kestrel Amadi's hand, as though she had carried one for years.\n\n" +
    "Nobody who saw her that day forgot it." },
];
entries.forEach(e => { e._hay = (e.title + " " + e.text).toLowerCase(); });

window.Codex = {
  DB: { entries, entities: ["Kestrel Amadi", "Vane Hollow"] },
  CANON_ORDER: [], sentencesOf, entitiesIn: () => new Set(), factsOf: () => [],
  topicSummary: () => [], mentionsOf: () => entries,
  bestEntryFor: () => entries[0], catDot: () => "", refresh: () => {},
};

eval(fs.readFileSync(path.join(__dirname, "../site/js/brain.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "../site/js/continuity.js"), "utf8"));
const K = window.CodexContinuity;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (detail !== undefined ? " :: " + JSON.stringify(detail) : "")); }
};

/* a model we can make say anything */
let reply = "", connected = true, asked = null;
window.CodexAI = {
  on: () => connected,
  ask: async (q, ents) => { asked = { q, ents }; return { ok: true, text: reply }; },
};

(async () => {
  /* ---------- gathering passages ---------- */
  const ps = K.passagesFor("Kestrel Amadi");
  check("passages are whole paragraphs that name her", ps.length === 3, ps.map(p => p.text.slice(0, 30)));
  check("  each labelled with the entry it came from",
    ps.every(p => p.entry && p.entryId), ps);
  check("  and numbered for the model to cite", ps[0].n === 1 && ps[1].n === 2);
  check("  a paragraph that never names her is left out",
    !ps.some(p => /Nobody who saw her that day forgot it\.$/.test(p.text) && !/Kestrel/.test(p.text)),
    ps.map(p => p.text.slice(0, 40)));

  /* ---------- the real finding ---------- */
  reply = JSON.stringify({ findings: [{
    about: "whether she can fight",
    a: { n: 1, quote: "Kestrel Amadi had never held a sword in her life" },
    b: { n: 3, quote: "the sword was familiar in Kestrel Amadi's hand" },
    why: "She cannot both never have held a sword and be practised with one.",
  }] });
  let r = await K.narrative("Kestrel Amadi");
  check("a real contradiction in prose is found", r.ok && r.findings.length === 1, r);
  check("  with both sides quoted from her own writing",
    /never held a sword/.test(r.findings[0].a.quote) && /familiar/.test(r.findings[0].b.quote), r.findings[0]);
  check("  and each side pointing at the entry it came from",
    r.findings[0].a.entry === "Kestrel Amadi" && r.findings[0].b.entry === "The Ford", r.findings[0]);
  check("  nothing was dropped", r.dropped === 0, r);

  /* ---------- THE GUARD ---------- */
  reply = JSON.stringify({ findings: [{
    about: "her eyes",
    a: { n: 1, quote: "Kestrel Amadi's eyes were grey as the sea in winter" },
    b: { n: 2, quote: "her eyes were brown, and always had been" },
    why: "Two eye colours.",
  }] });
  r = await K.narrative("Kestrel Amadi");
  check("a finding whose quotes are nowhere in the text is dropped",
    r.ok && r.findings.length === 0, r.findings);
  check("  and the drop is counted rather than hidden", r.claimed === 1 && r.dropped === 1, r);

  /* half-invented: one real side, one made up */
  reply = JSON.stringify({ findings: [{
    about: "the archive",
    a: { n: 1, quote: "She kept the archive at Vane Hollow for eleven years" },
    b: { n: 2, quote: "she left Vane Hollow every summer without fail" },
    why: "Both cannot be true.",
  }] });
  r = await K.narrative("Kestrel Amadi");
  check("one invented side is enough to drop the whole finding", r.findings.length === 0, r.findings);

  /* a paraphrase is an invention for this purpose */
  reply = JSON.stringify({ findings: [{
    about: "swords",
    a: { n: 1, quote: "Kestrel had never used a sword" },
    b: { n: 3, quote: "the sword felt familiar to her" },
    why: "Paraphrased, not quoted.",
  }] });
  r = await K.narrative("Kestrel Amadi");
  check("a tidied paraphrase does not count as a quote", r.findings.length === 0, r.findings);

  /* but re-wrapped whitespace is not a rewording */
  reply = JSON.stringify({ findings: [{
    about: "whether she can fight",
    a: { n: 1, quote: "Kestrel Amadi had never held\n  a sword   in her life" },
    b: { n: 3, quote: "the sword was familiar in Kestrel Amadi's hand" },
    why: "Same words, re-wrapped.",
  }] });
  r = await K.narrative("Kestrel Amadi");
  check("re-wrapped whitespace is still the same words", r.findings.length === 1, r.findings);

  /* a wrong passage number with a real quote is a slip, not a lie */
  reply = JSON.stringify({ findings: [{
    about: "whether she can fight",
    a: { n: 9, quote: "Kestrel Amadi had never held a sword in her life" },
    b: { n: 1, quote: "the sword was familiar in Kestrel Amadi's hand" },
    why: "Numbers swapped.",
  }] });
  r = await K.narrative("Kestrel Amadi");
  check("a misnumbered but real quote is kept, and re-attributed",
    r.findings.length === 1 && r.findings[0].a.entry === "Kestrel Amadi", r.findings);

  /* ---------- saying nothing is a good answer ---------- */
  reply = JSON.stringify({ findings: [] });
  r = await K.narrative("Kestrel Amadi");
  check("finding nothing is reported as nothing", r.ok && r.findings.length === 0 && r.claimed === 0, r);

  reply = "I could not find any contradictions in these passages.";
  r = await K.narrative("Kestrel Amadi");
  check("prose instead of JSON does not throw", r.ok && r.findings.length === 0, r);

  reply = "```json\n{\"findings\":[]}\n```";
  r = await K.narrative("Kestrel Amadi");
  check("a fenced answer is read", r.ok && r.findings.length === 0, r);

  reply = "{ findings: [ this is not json";
  r = await K.narrative("Kestrel Amadi");
  check("malformed JSON does not throw", r.ok && r.findings.length === 0, r);

  /* ---------- what it sends, and when it refuses to ---------- */
  reply = JSON.stringify({ findings: [] });
  await K.narrative("Kestrel Amadi");
  check("the model is told to quote exactly", /word for word/i.test(asked.q), asked.q.slice(0, 200));
  check("  and that finding nothing is fine", /empty answer is a good answer/i.test(asked.q));
  check("  and is sent whole paragraphs", asked.ents.length === 3, asked.ents.length);

  connected = false;
  r = await K.narrative("Kestrel Amadi");
  check("with no model connected it says so plainly, rather than failing",
    !r.ok && /needs a model/i.test(r.why), r);
  connected = true;

  r = await K.narrative("Nobody At All");
  check("somebody barely written about is not sent to a model at all",
    r.ok && r.findings.length === 0 && /not enough written/i.test(r.why || ""), r);

  console.log("");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
