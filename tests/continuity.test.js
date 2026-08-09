/* The continuity checker: a draft read against a canon, with the same
   parser doing both sides.

   Most of these are about NOT crying wolf. A checker that flags things
   which are fine gets switched off within a day, and then it catches
   nothing at all, so the silences here matter as much as the catches. */
"use strict";
const fs = require("fs");
const path = require("path");

global.window = globalThis;

const sentencesOf = t => {
  const x = String(t || "").replace(/\s+/g, " ").trim();
  const m = x.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  return (m && m.length) ? m.map(s => s.trim()) : (x ? [x] : []);
};

const canon = [
  { id: "c1", title: "Lily", category: "Characters", type: "pdf", wordcount: 40,
    text: "Lily is seven years old. Lily lives in Halden with her mother. " +
          "Lily is friends with Max. Lily was born in 1204." },
  { id: "c2", title: "Vex", category: "Characters", type: "pdf", wordcount: 30,
    text: "Vex was killed by Doran at the ford. Vex was the captain of the guard." },
  { id: "c3", title: "Halden", category: "Maps & Locations", type: "pdf", wordcount: 25,
    text: "Halden is a walled city in the north. Halden was founded in 987." },
  { id: "c4", title: "Mera", category: "Characters", type: "pdf", wordcount: 25,
    text: "Mera protects the orphans and heals the wounded. Mera is from Torad." },
];
canon.forEach(e => { e._hay = (e.title + " " + e.text).toLowerCase(); });
const entities = ["Lily", "Vex", "Doran", "Halden", "Max", "Mera", "Torad"];

window.Codex = {
  DB: { entries: canon, entities },
  CANON_ORDER: ["Characters", "Maps & Locations"],
  sentencesOf,
  entitiesIn: t => new Set(entities.filter(n => String(t || "").includes(n))),
  factsOf: () => [],
  topicSummary: (n, k) => sentencesOf(canon.map(e => e.text).join(" "))
    .filter(s => s.toLowerCase().includes(String(n).toLowerCase())).slice(0, k),
  mentionsOf: n => canon.filter(e => e._hay.includes(String(n).toLowerCase())),
  bestEntryFor: n => canon.find(e => e.title.toLowerCase() === String(n).toLowerCase())
    || canon.find(e => e._hay.includes(String(n).toLowerCase())) || null,
  catDot: () => "", refresh: () => {},
};

eval(fs.readFileSync(path.join(__dirname, "../site/js/brain.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "../site/js/continuity.js"), "utf8"));
const K = window.CodexContinuity;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (detail !== undefined ? " :: " + JSON.stringify(detail) : "")); }
};
const run = t => { window.CodexBrain.reset(); return K.check(t); };
const kinds = r => r.findings.map(f => f.kind + ":" + f.name);
const about = (r, n) => r.findings.filter(f => f.name === n).map(f => f.about);

/* ---------- the catches ---------- */
let r = run("Lily was nine years old that winter, and she did not care who knew it.");
check("an age that disagrees is caught",
  r.findings.some(f => f.kind === "contradiction" && f.name === "Lily" && f.about === "age"),
  kinds(r));
check("  and it quotes the line from the draft",
  (r.findings[0] || {}).quote && /nine years old/.test(r.findings[0].quote), r.findings[0]);
check("  and says what the canon said instead",
  /seven/.test((r.findings[0] || {}).canon || ""), (r.findings[0] || {}).canon);

r = run("Vex drew his sword and said the ford was already lost.");
check("the dead speaking is caught",
  r.findings.some(f => f.kind === "dead" && f.name === "Vex"), kinds(r));

r = run("Lily lives in Torad now, in a house by the water.");
check("a moved character is caught",
  r.findings.some(f => f.name === "Lily" && f.about === "where they live"), kinds(r));

/* ---------- the silences, which matter more ---------- */
r = run("Lily is seven years old and lives in Halden.");
check("a draft that agrees says nothing", r.findings.length === 0, kinds(r));

r = run("Lily walked the length of the wall and counted the gulls.");
check("a draft that states no facts says nothing", r.findings.length === 0, kinds(r));

r = run("Lily lives in the city of Halden, above the river.");
check("a longer way of saying the same place is not a contradiction",
  !r.findings.some(f => f.about === "where they live"), kinds(r));

r = run("Mera knelt by the fire and did not speak for a long while.");
check("somebody the canon never buried may act freely", r.findings.length === 0, kinds(r));

r = run("Mera protects the orphans. Mera also teaches the youngest to read.");
check("two true deeds are not a contradiction", r.findings.length === 0, kinds(r));

r = run("Doran remembered the ford, and what he had done there.");
check("the killer may still walk around",
  !r.findings.some(f => f.kind === "dead"), kinds(r));

r = run("");
check("an empty draft is not an error", r.ok && r.findings.length === 0);

r = run("The rain came sideways off the sea for three days.");
check("prose with no names in it is not an error", r.ok && r.findings.length === 0, kinds(r));

/* ---------- names it has never seen ---------- */
r = run("Lilly ran ahead of the others.");
check("a misspelled name is reported as unknown",
  r.unknown.some(u => u.name === "Lilly"), r.unknown);
check("  with the near miss beside it",
  (r.unknown.find(u => u.name === "Lilly") || {}).near === "Lily", r.unknown);

r = run("Corwin arrived at dusk with no explanation at all.");
check("a genuinely new name is reported without a false near miss",
  r.unknown.some(u => u.name === "Corwin" && !u.near), r.unknown);

r = run("Vex was killed by Doran, as everyone in Halden knew.");
check("restating a death is not a contradiction with it",
  !r.findings.some(f => f.kind === "dead"), kinds(r));

/* ---------- the false alarms real canon produced ---------- */
r = run("House Vex still stands at the ford and will not move for anyone.");
check("a house is not the person it was named for",
  !r.findings.some(f => f.kind === "dead"), kinds(r));

r = run("Heraldry: Crest. A shield upon which stands a golden ostrich, quartered green " +
  "and yellow, with Vex in the upper canton and the words beneath. Colours: green, yellow, " +
  "white. Founder: unknown. Seat: the ford. Status: extant. Era: second. Notes: the crest " +
  "was granted after the battle and has not changed since, though the tinctures have.");
check("a heraldry block is not a scene, whatever words are in it",
  !r.findings.some(f => f.kind === "dead"), kinds(r));

r = run("Corwin arrived at dusk.");
check("a short draft reports a new name seen only once",
  r.unknown.some(u => u.name === "Corwin"), r.unknown);

const long = "The wall ran east. " .repeat(90) + " Corwin arrived at dusk.";
r = run(long);
check("  but a chapter needs to name somebody twice before saying so",
  !r.unknown.some(u => u.name === "Corwin"), r.unknown);
r = run(long + " Corwin did not stay.");
check("  and twice is enough", r.unknown.some(u => u.name === "Corwin"), r.unknown);

r = run("Beside her stood Corwin Ashgrove, who had not spoken. Corwin watched the door. " +
        "Later Corwin Ashgrove left without a word to anyone at all.");
check("a word that is capitalised for starting a sentence is not a character",
  !r.unknown.some(u => /^(Beside|Later)$/.test(u.name)), r.unknown);
check("  and one person named two ways is listed once, in full",
  r.unknown.filter(u => /Corwin/.test(u.name)).length === 1 &&
  r.unknown.some(u => u.name === "Corwin Ashgrove"), r.unknown);

/* ---------- the comparison rule on its own ---------- */
check("numbers: seven vs nine disagree", K.disagrees("is nine", "is seven"));
check("numbers: seven vs seven agree", !K.disagrees("is seven", "is seven years old"));
check("words: overlapping places agree", !K.disagrees("lives in Halden", "lives in the city of Halden"));
check("words: different places disagree", K.disagrees("lives in Torad", "lives in Halden"));
check("one side with a number and one without is not a disagreement",
  !K.disagrees("is a child", "is seven"));

/* ---------- it must not be slow enough to be annoying ---------- */
const chapter = ("Lily walked with Max along the wall of Halden while Mera watched from the tower. " +
  "They spoke of Vex and of Doran and of the ford. ").repeat(60);
const t0 = Date.now();
r = run(chapter);
const ms = Date.now() - t0;
check("a chapter-sized draft checks quickly (" + ms + "ms)", ms < 2500, ms);
check("  and still returns something usable", r.ok && Array.isArray(r.findings));

console.log("");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
