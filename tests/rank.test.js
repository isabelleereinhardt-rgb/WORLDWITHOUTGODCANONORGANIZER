/* Ranking, which exists because insisting on every word threw away
   questions the canon could answer. "What year did the chapel burn?"
   found nothing at all against an entry saying "the chapel burned in
   1147", because "year" appears nowhere in it.

   The other half of the job is refusing. Ranking will always return
   something — the least irrelevant entry — and handing that back as an
   answer is how an assistant starts making things up. */
"use strict";
const fs = require("fs");
const path = require("path");
global.window = globalThis;
eval(fs.readFileSync(path.join(__dirname, "../site/js/canon.js"), "utf8"));
const C = window.CodexCanon;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (detail !== undefined ? " :: " + JSON.stringify(detail) : "")); }
};

const docs = [
  { id: "1", title: "The Chapel at Vane Hollow", text: "The chapel at Vane Hollow burned in 1147. It was never rebuilt." },
  { id: "2", title: "Kestrel Amadi", text: "Kestrel Amadi is the last archivist. She kept the house records and the house seal." },
  { id: "3", title: "House Patton", text: "House Patton holds the cliff. The house is old. The house is proud. The house endures." },
  { id: "4", title: "Weather", text: "It rains in the north for most of the year, every year, all year." },
];
const top = (q, opts) => { const r = C.rank(q, docs, opts); return r.length ? r[0].e.title : "(none)"; };

/* ---------- the question that started it ---------- */
check("a missing word no longer throws the question away",
  top("what year did the chapel burn") === "The Chapel at Vane Hollow",
  C.rank("what year did the chapel burn", docs).map(r => r.e.title + ":" + r.score.toFixed(1)));

/* ---------- stemming ---------- */
check("burn matches burned", C.rank("burn", docs).some(r => r.e.id === "1"));
check("rains matches rain", C.rank("rain", docs).some(r => r.e.id === "4"));
check("  but short words are left alone", C.stem("seal") === "seal");
check("  and a real word is not chopped to a stump", C.stem("archivist") === "archivist");
check("  plurals fold together", C.stem("records") === C.stem("record"));

/* ---------- rarity beats repetition ---------- */
const houseHits = C.rank("house", docs);
check("a word in three entries still ranks them", houseHits.length >= 2, houseHits.map(r => r.e.title));
const rare = C.rank("archivist chapel", docs);
check("a rare word outranks a common one",
  rare[0].e.id === "1" || rare[0].e.id === "2", rare.map(r => r.e.title + ":" + r.score.toFixed(1)));

/* ---------- the title is the entry's own claim about itself ---------- */
check("a title match outranks a body match",
  top("Kestrel Amadi") === "Kestrel Amadi", C.rank("Kestrel Amadi", docs).map(r => r.e.title));

/* ---------- more of the question matched is worth more ---------- */
const two = C.rank("chapel 1147", docs);
check("matching two asked words beats matching one",
  two[0].e.id === "1" && two[0].hits === 2, two.map(r => r.e.title + ":" + r.hits));

/* ---------- refusing ---------- */
check("a word the canon has never seen scores nothing",
  C.rank("photocopier", docs).length === 0, C.rank("photocopier", docs));
check("  and a question made only of grammar scores nothing",
  C.rank("what is the", docs, { stop: new Set(["what", "is", "the"]) }).length === 0);

/* ---------- it must not be slow ---------- */
const many = [];
for (let i = 0; i < 3000; i++) {
  many.push({ id: "d" + i, title: "Entry " + i,
    text: "Some prose about house " + i + " and its people, repeated a few times over. ".repeat(8) });
}
let t0 = Date.now();
C.rank("who holds the house on the cliff", many);
const cold = Date.now() - t0;
t0 = Date.now();
C.rank("who founded the house", many);
const warm = Date.now() - t0;
check("3,000 entries rank quickly (" + cold + "ms cold, " + warm + "ms warm)", cold < 3000 && warm < 400,
  { cold, warm });

console.log("");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
