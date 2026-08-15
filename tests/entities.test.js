/* The entity model: ids that survive a rename, aliases that resolve,
   the three invariants borrowed from otwarchive, and mentions resolved
   on write.

   The test that matters most is the rename one. Keying relationships on
   a title meant renaming a character silently broke every reference to
   her — routine in a worldbuilding tool, and invisible when it happened.
*/
"use strict";
const fs = require("fs");
const path = require("path");

global.window = globalThis;   // node already provides globalThis.crypto

eval(fs.readFileSync(path.join(__dirname, "../site/js/entities.js"), "utf8"));
const E = window.CodexEntities;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (detail !== undefined ? " :: " + JSON.stringify(detail) : "")); }
};

(async () => {
  E.load([], []);

  /* ---------- records and resolution ---------- */
  const kes = await E.create({ name: "Kestrel Amadi", type: "character", status: "confirmed" });
  const vane = await E.create({ name: "Vane Hollow", type: "place", status: "confirmed" });
  await E.create({ name: "House Amadi", type: "house", status: "confirmed" });

  check("a record gets a stable id", /^ent-/.test(kes.id));
  check("its name resolves", E.resolve("Kestrel Amadi") === kes);
  check("  case-insensitively", E.resolve("kestrel amadi") === kes);
  check("  and with surrounding space", E.resolve("  Kestrel Amadi ") === kes);
  check("an unknown name resolves to nothing", E.resolve("Nobody At All") === null);

  /* ---------- aliases ---------- */
  let r = await E.addAlias(kes.id, "Kes");
  check("an alias can be added", r.ok, r);
  check("  and resolves to the same record", E.resolve("Kes") === kes);
  r = await E.addAlias(kes.id, "the last archivist");
  check("  more than one", r.ok && E.resolve("the last archivist") === kes);

  r = await E.addAlias(kes.id, "Kestrel Amadi");
  check("its own name is not an alias", !r.ok, r);
  r = await E.addAlias(kes.id, "Kes");
  check("the same alias twice is refused", !r.ok, r);

  /* AO3's rule: same category only. */
  r = await E.addAlias(kes.id, "Vane Hollow");
  check("a character cannot absorb a place", !r.ok && /place/.test(r.why), r);

  /* ---------- the rename that used to break everything ---------- */
  const before = E.resolve("Kestrel Amadi");
  await E.rename(kes.id, "Kestrel Ashgrove");
  check("after a rename the id is unchanged", E.get(kes.id) === before);
  check("  the new name resolves", E.resolve("Kestrel Ashgrove") === kes);
  check("  THE OLD NAME STILL RESOLVES", E.resolve("Kestrel Amadi") === kes);
  check("  and the aliases survive", E.resolve("Kes") === kes);
  check("  the new name is not left as its own alias",
    !E.get(kes.id).aliases.some(a => a.toLowerCase() === "kestrel ashgrove"),
    E.get(kes.id).aliases);

  /* ---------- hierarchy invariants ---------- */
  const ash = await E.create({ name: "the Ash Order", type: "concept", status: "confirmed" });
  const cand = await E.create({ name: "Corwin", type: "character", status: "candidate" });
  check("nothing may contain itself", E.checkLink(kes.id, kes.id) !== "");
  check("a candidate may not be linked", E.checkLink(cand.id, ash.id) !== "", E.checkLink(cand.id, ash.id));
  E.get(kes.id).parentId = ash.id;
  check("a confirmed link is allowed", E.checkLink(ash.id, kes.id) !== "" , "expected a loop refusal");
  check("  and the loop it would create is named",
    /loop/i.test(E.checkLink(ash.id, kes.id)), E.checkLink(ash.id, kes.id));
  E.get(kes.id).parentId = null;

  /* ---------- merging two records that are one person ---------- */
  const dupe = await E.create({ name: "K. Ashgrove", type: "character", status: "confirmed" });
  await E.reindexNote("n-merge", "K. Ashgrove walked the wall.");
  check("the duplicate is mentioned before the merge",
    E.notesMentioning(dupe.id).length === 1, E.notesMentioning(dupe.id));
  r = await E.merge(kes.id, dupe.id);
  check("two records merge", r.ok, r);
  check("  the survivor keeps its id", E.get(kes.id) === kes);
  check("  and answers to the loser's name", E.resolve("K. Ashgrove") === kes);
  check("  the loser is gone", E.get(dupe.id) === null);
  check("  and its mentions moved across",
    E.notesMentioning(kes.id).indexOf("n-merge") > -1, E.notesMentioning(kes.id));

  /* ---------- mentions, resolved on write ---------- */
  E.load([], []);
  const lily = await E.create({ name: "Lily", type: "character", status: "confirmed", aliases: ["Lils"] });
  const halden = await E.create({ name: "Halden", type: "place", status: "confirmed" });
  const hp = await E.create({ name: "House Patton", type: "house", status: "confirmed" });
  await E.create({ name: "Patton", type: "character", status: "confirmed" });

  let n = await E.reindexNote("n1", "Lily walked to Halden. Lils did not look back. Halden was quiet.");
  check("mentions are found on write", n === 4, n);
  check("  the alias counts as the same person",
    E.mentionsOf(lily.id).length === 2, E.mentionsOf(lily.id).length);
  check("  and the place is separate", E.mentionsOf(halden.id).length === 2);

  /* "House Patton holds the cliff" names the house and not the man it
     was named for; the letters can only be claimed once. */
  await E.reindexNote("n2", "House Patton holds the cliff.");
  check("the longer name wins over the shorter one inside it",
    E.mentionsOf(hp.id).length === 1 &&
    E.mentionsOf(E.resolve("Patton").id).length === 0, {
      house: E.mentionsOf(hp.id).length,
      person: E.mentionsOf(E.resolve("Patton").id).length,
    });
  await E.reindexNote("n3", "Patton himself never went there.");
  check("  but the bare name on its own is still the person",
    E.mentionsOf(E.resolve("Patton").id).length === 1 && E.mentionsOf(hp.id).length === 1,
    { person: E.mentionsOf(E.resolve("Patton").id).length, house: E.mentionsOf(hp.id).length });

  check("which notes name somebody is a lookup, not a search",
    JSON.stringify(E.notesMentioning(lily.id)) === JSON.stringify(["n1"]),
    E.notesMentioning(lily.id));
  check("and who is in a note, likewise",
    E.inNote("n1").map(e => e.name).sort().join(",") === "Halden,Lily",
    E.inNote("n1").map(e => e.name));

  await E.reindexNote("n1", "Nobody at all is here now.");
  check("re-saving a note replaces its mentions rather than adding to them",
    E.mentionsOf(lily.id).length === 0, E.mentionsOf(lily.id).length);
  await E.forgetNote("n2");
  check("deleting a note forgets its mentions", E.mentionsOf(hp.id).length === 0);

  /* ---------- proposing, never committing ---------- */
  E.load([], []);
  await E.create({ name: "Halden", type: "place", status: "confirmed" });
  const text =
    "Ilya Vantar rode into Halden before dawn. Morrow Chase was waiting at the gate. " +
    "Ilya Vantar said nothing. Later Morrow Chase would say he had known all along. " +
    "The rain did not stop. Her brother Bellamy Oke arrived at noon.";
  const props = E.propose(text);
  const names = props.map(p => p.name);
  check("names in prose are proposed", names.indexOf("Ilya Vantar") > -1 && names.indexOf("Morrow Chase") > -1, names);
  check("  one named once is still proposed if a kinship word points at it",
    names.indexOf("Bellamy Oke") > -1, names);
  check("  a name already known is not proposed again", names.indexOf("Halden") < 0, names);
  check("  and sentence-openers are not people",
    !names.some(x => /^(The|Later|Her)$/.test(x)), names);
  check("nothing proposed is real yet", E.confirmed().length === 1, E.confirmed().map(e => e.name));

  /* A field label in a character sheet is not a character. Two thirds
     of the first honest run against real canon was this. */
  const sheet = "Typical Attire: a grey coat. Location: Halden. Research Needed: the date.\n" +
                "House: Amadi\nUnresolved Questions: several.";
  const sheetProps = E.propose(sheet).map(p => p.name);
  check("a field label is not proposed as a character",
    !sheetProps.some(n => /Attire|Location|Research|Questions/.test(n)), sheetProps);

  /* Rejecting once must be for ever, or the queue hands back the same
     rubbish every time it is opened. */
  const junk = await E.create({ name: "Morrow Chase", type: "concept", status: "rejected" });
  const again = E.propose(text).map(p => p.name);
  check("something rejected is never offered again", again.indexOf("Morrow Chase") < 0, again);
  check("  and it does not resolve for readers either", E.resolve("Morrow Chase") === null);
  check("  though it is still on file, so it stays rejected",
    E.get(junk.id) && E.get(junk.id).status === "rejected");

  const chosen = await E.create({ name: "Ilya Vantar", type: "character", status: "candidate" });
  check("a candidate does not count as confirmed", E.confirmed().length === 1);
  await E.setStatus(chosen.id, "confirmed");
  check("  until it is confirmed", E.confirmed().length === 2);
  check("  and then it resolves like anything else", E.resolve("Ilya Vantar") === chosen);

  /* ---------- migration keeps today's behaviour ---------- */
  E.load([], []);
  const made = await E.migrate(["Kestrel Amadi", "House Patton", "Kestrel Amadi"], ["Vane Hollow"]);
  check("every existing title becomes a record", made.length === 3, made.map(m => m.name));
  check("  duplicates are not made twice", E.all().length === 3);
  check("  and houses are typed as houses", E.resolve("House Patton").type === "house");
  check("  all of them confirmed, as they are today",
    E.all().every(e => e.status === "confirmed"));

  /* ---------- declared facts, and conflicts between them ---------- */
  E.load([], []);
  eval(require("fs").readFileSync(require("path").join(__dirname, "../site/js/continuity.js"), "utf8"));
  const K = window.CodexContinuity;
  await E.create({ name: "Kestrel Amadi", type: "character", status: "confirmed" });
  await E.create({ name: "Vane Hollow", type: "place", status: "confirmed" });

  await E.reindexNote("f1", "Kestrel Amadi\nAge: 34\nAllegiance: the Ash Order\nShe kept the archive.",
    "Kestrel Amadi");
  check("declared facts are attributed to the record the entry is about",
    E.claimsFor(E.resolve("Kestrel Amadi").id).length === 2,
    E.claimsFor(E.resolve("Kestrel Amadi").id));
  check("  and prose lines are not mistaken for facts",
    !E.claimsFor(E.resolve("Kestrel Amadi").id).some(c => /kept the archive/i.test(c.value)));

  check("one entry alone is not a conflict", K.canonConflicts().length === 0, K.canonConflicts());

  await E.reindexNote("f2", "Kestrel Amadi\nAge: 51\nShe was gone by then.", "Kestrel Amadi");
  let conf = K.canonConflicts();
  check("two entries disagreeing about an age is a conflict",
    conf.length === 1 && conf[0].field === "age", conf);
  check("  both answers are carried, and neither is chosen",
    conf[0].claims.length === 2 &&
    conf[0].claims.some(c => c.value === "34") && conf[0].claims.some(c => c.value === "51"),
    conf[0].claims);
  check("  with the line each came from", conf[0].claims.every(c => /Age:/.test(c.quote)), conf[0].claims);

  await E.reindexNote("f3", "Kestrel Amadi\nAge: 34\nAnother telling.", "Kestrel Amadi");
  conf = K.canonConflicts();
  check("a third entry agreeing with the first does not add a third answer",
    conf.length === 1 && conf[0].claims.length === 2, conf[0] && conf[0].claims);

  check("a conflict the writer has settled stops firing",
    K.canonConflicts({ settled: { [conf[0].id]: true } }).length === 0);

  /* a fact line under an entry that merely MENTIONS her is not hers */
  await E.reindexNote("f4", "Vane Hollow\nAge: 900\nKestrel Amadi was seen here.", "Vane Hollow");
  const kesFields = E.claimsFor(E.resolve("Kestrel Amadi").id).map(c => c.value);
  check("a fact in somebody else's entry is not attributed to her",
    kesFields.indexOf("900") < 0, kesFields);
  check("  it belongs to whoever that entry is about",
    E.claimsFor(E.resolve("Vane Hollow").id).some(c => c.value === "900"));

  /* ---------- it must not be slow ---------- */
  E.load([], []);
  for (let i = 0; i < 750; i++) {
    await E.create({ name: "Name" + i + " Surname" + i, type: "character", status: "confirmed" });
  }
  const chapter = "Name7 Surname7 walked with Name300 Surname300 through the hall. ".repeat(400);
  const t0 = Date.now();
  const found = await E.reindexNote("big", chapter);
  const ms = Date.now() - t0;
  check("750 names over a 25,000-word chapter indexes quickly (" + ms + "ms, " + found + " mentions)",
    ms < 4000 && found > 0, { ms, found });

  console.log("");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
