/* Views over the records. Most of this is the dates, because this canon
   counts backwards: 8,759 BR is EARLIER than 8,577 BR, and sorting the
   numbers would print the history of the world in reverse while looking
   entirely authoritative about it. */
"use strict";
const fs = require("fs");
const path = require("path");
global.window = globalThis;
eval(fs.readFileSync(path.join(__dirname, "../site/js/views.js"), "utf8"));
const V = window.CodexViews;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (detail !== undefined ? " :: " + JSON.stringify(detail) : "")); }
};

/* ---------- reading a year ---------- */
check("a plain year is read", V.dateIn("1204").value === 1204);
check("an era is read with it", V.dateIn("8,759 BR").value === 8759 && V.dateIn("8,759 BR").era === "BR");
check("  commas are thousands, not lists", V.dateIn("8,759 BR").value === 8759, V.dateIn("8,759 BR"));
check("a year inside a sentence is found",
  V.dateIn("died in 8,577 BR at the age of 79").value === 8577, V.dateIn("died in 8,577 BR at the age of 79"));
check("nothing is read out of prose with no year", V.dateIn("a long time ago") === null);
check("  or out of an empty field", V.dateIn("") === null);

/* THE ONE THAT MATTERS */
const early = V.dateIn("8,759 BR"), late = V.dateIn("8,577 BR");
check("BR counts down: the bigger number is the earlier date", early.abs < late.abs,
  { "8759 BR": early.abs, "8577 BR": late.abs });
check("  and AR counts up", V.dateIn("300 AR").abs < V.dateIn("900 AR").abs);
check("  with BR before AR on the same line", V.dateIn("1 BR").abs < V.dateIn("1 AR").abs);

/* ---------- picking a date field ---------- */
check("a founding date is preferred over an incidental year",
  V.dateFor([{ field: "notes", value: "seen in 400 AR" }, { field: "founded", value: "8,759 BR" }]).field === "founded");
check("  and something is better than nothing",
  V.dateFor([{ field: "notes", value: "seen in 400 AR" }]).value === 400);
check("  a record with no year at all has no date",
  V.dateFor([{ field: "seat", value: "Lajazer" }]) === null);

/* ---------- columns come from the rows on screen ---------- */
const houses = [
  { name: "House Patton", type: "house", seen: 40, aliases: [], claims: [
    { field: "seat", value: "Lajazer" }, { field: "founded", value: "8,759 BR" }, { field: "words", value: "x" } ] },
  { name: "House Vemer", type: "house", seen: 20, aliases: [], claims: [
    { field: "seat", value: "Norrow" }, { field: "founded", value: "8,265 BR" } ] },
  { name: "House Kulio", type: "house", seen: 9, aliases: [], claims: [
    { field: "seat", value: "Ash" }, { field: "founded", value: "7,100 BR" } ] },
];
const cols = V.columnsFor(houses);
check("columns are the fields these records actually carry",
  cols.indexOf("seat") > -1 && cols.indexOf("founded") > -1, cols);
check("  and a field only one of them has is left out", cols.indexOf("words") < 0, cols);

/* ---------- sorting ---------- */
let sorted = V.sortRows(houses, "when", "asc").map(r => r.name);
check("sorting by date puts the oldest house first",
  sorted[0] === "House Patton" && sorted[2] === "House Kulio", sorted);
sorted = V.sortRows(houses, "when", "desc").map(r => r.name);
check("  and reverses cleanly", sorted[0] === "House Kulio", sorted);
sorted = V.sortRows(houses, "seen", "desc").map(r => r.name);
check("sorting by mentions works on numbers, not strings", sorted[0] === "House Patton", sorted);
sorted = V.sortRows(houses, "seat", "asc").map(r => r.name);
check("sorting by a declared field is alphabetical", sorted[0] === "House Kulio", sorted);

const withGaps = houses.concat([{ name: "House Nothing", type: "house", seen: 1, aliases: [], claims: [] }]);
check("a record with no value sinks rather than sorting as blank",
  V.sortRows(withGaps, "seat", "asc").map(r => r.name).pop() === "House Nothing",
  V.sortRows(withGaps, "seat", "asc").map(r => r.name));
check("  and sinks in the other direction too",
  V.sortRows(withGaps, "when", "desc").map(r => r.name).pop() === "House Nothing",
  V.sortRows(withGaps, "when", "desc").map(r => r.name));

/* ---------- rendering ---------- */
const t = V.tableHtml(houses, { by: "name", dir: "asc" });
check("the table names every record", /House Patton/.test(t) && /House Kulio/.test(t));
check("  carries their declared values", /Lajazer/.test(t) && /Norrow/.test(t));
check("  links each to its subject page", /#\/subject\/House%20Patton/.test(t), t.slice(0, 300));
check("  and marks which column is sorted", /Name ▴/.test(t), t.slice(0, 400));

const line = V.timelineHtml(houses);
check("the line is in date order",
  line.indexOf("House Patton") < line.indexOf("House Vemer") &&
  line.indexOf("House Vemer") < line.indexOf("House Kulio"),
  [line.indexOf("House Patton"), line.indexOf("House Vemer"), line.indexOf("House Kulio")]);
check("  and says which field put them there", /founded/.test(line));
const someUndated = V.timelineHtml(withGaps);
check("undated records are counted rather than dropped silently",
  /1 other carr/.test(someUndated), someUndated.slice(-160));
check("a set with no dates at all explains how to give them one",
  /Founded: 8,759 BR/.test(V.timelineHtml([{ name: "X", type: "house", seen: 1, aliases: [], claims: [] }])));

/* ---------- silence is not an objection ----------
   The real canon is sixty filled-in house sheets and six hundred
   records that are pure prose. Letting the prose outvote the sheets
   deleted every column and left a table of names. */
const mixed = houses.concat(Array.from({ length: 60 }, (_, i) =>
  ({ name: "Someone " + i, type: "character", seen: 3, aliases: [], claims: [] })));
check("records that declare nothing do not veto the columns",
  V.columnsFor(mixed).indexOf("seat") >= 0, V.columnsFor(mixed));
check("  and nothing at all declared means no columns",
  V.columnsFor([{ name: "A", type: "x", seen: 1, aliases: [], claims: [] }]).length === 0);
const mixedTable = V.tableHtml(mixed, { by: "name", dir: "asc" });
check("  the table says why most of the cells are empty",
  /declare no fields/.test(mixedTable), mixedTable.slice(-260));
check("  and does not say it when everybody filled theirs in",
  !/declare no fields/.test(V.tableHtml(houses, { by: "name", dir: "asc" })));

/* ---------- the kind is a guess you can overrule ---------- */
window.CodexEntities = { TYPES: ["character", "place", "house", "event", "object", "concept"] };
const guessed = V.tableHtml([{ id: "e1", name: "Torad", type: "place", seen: 9, read: true, aliases: [], claims: [] }],
  { by: "name", dir: "asc" });
check("a kind the app read is offered as a control, not printed as fact",
  /data-kind-of="e1"/.test(guessed) && /class="vt-kind read"/.test(guessed), guessed.slice(0, 400));
check("  with the right one already chosen",
  /<option value="place" selected>/.test(guessed), guessed.slice(0, 500));
const chosen = V.tableHtml([{ id: "e2", name: "Torad", type: "place", seen: 9, read: false, aliases: [], claims: [] }],
  { by: "name", dir: "asc" });
check("  and a kind somebody chose is not dressed up as a guess",
  !/vt-kind read/.test(chosen));

/* ---------- markup safety ---------- */
const nasty = [{ name: '<img src=x onerror=alert(1)>', type: "house", seen: 1, aliases: [],
  claims: [{ field: "seat", value: "<script>alert(2)</script>" }] }];
const evil = V.tableHtml(nasty, { by: "name", dir: "asc" }) + V.timelineHtml(nasty);
check("a name that is markup is escaped", !/<img src=x/.test(evil) && !/<script>alert/.test(evil),
  evil.slice(0, 200));

console.log("");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
