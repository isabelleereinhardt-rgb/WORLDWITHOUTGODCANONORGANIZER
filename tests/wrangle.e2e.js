/* The entity model in the running app: the rename that used to break
   every cross-reference, and the wrangling queue that finally lets the
   Name Index learn a name it did not already know.

   Both were headline findings in the QA pass. Logic 3 (rename breaks
   references) and Logic 2 (name harvesting is circular — it can only
   find names already in the index).
*/
const { chromium } = require("playwright");

const SITE = "http://localhost:8321/index.html";

let pass = 0, fail = 0;
const results = [];
function check(label, cond, detail) {
  if (cond) { pass++; results.push("  PASS  " + label); }
  else { fail++; results.push("  FAIL  " + label + (detail ? "\n          got: " + String(detail).slice(0, 300) : "")); }
}
function section(t) { results.push("\n" + t); }

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem("codex.session", "guest");
    localStorage.setItem("codex.workspaces@guest", JSON.stringify([
      { id: "default", name: "My workspace", hasCanon: false, createdAt: Date.now() }]));
    localStorage.setItem("codex.activeWorkspace@guest", "default");
  });
  await page.goto(SITE + "#/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("loading"), { timeout: 30000 });
  await page.waitForFunction(() => window.CodexEntities && window.CodexEntities.ready(), { timeout: 30000 });
  await page.waitForTimeout(600);

  /* ---------- Logic 3: renaming must not break references ---------- */
  section("LOGIC 3 — A RENAME IS A RENAME, NOT A DELETION");
  const rename = await page.evaluate(async () => {
    const A = await window.Codex.addNote("Zephyrine Blackwood", "She held the ninth key.", [], "My Notes");
    await window.Codex.addNote("Referring Note",
      "The council feared Zephyrine Blackwood more than the winter.", [], "My Notes");
    await new Promise(r => setTimeout(r, 500));
    const E = window.CodexEntities;
    const before = E.resolve("Zephyrine Blackwood");
    const beforeNotes = before ? E.notesMentioning(before.id).length : -1;
    await window.Codex.updateNote(A.id, { title: "Zephyrine Ashgrove" });
    await new Promise(r => setTimeout(r, 500));
    const after = E.resolve("Zephyrine Blackwood");
    return {
      same: !!(before && after && before.id === after.id),
      newName: !!E.resolve("Zephyrine Ashgrove"),
      oldName: !!after,
      notesBefore: beforeNotes,
      notesAfter: after ? E.notesMentioning(after.id).length : -1,
      aliases: after ? after.aliases : [],
      stillLinked: window.Codex.DB.entities.indexOf("Zephyrine Blackwood") > -1,
    };
  });
  check("the record keeps its id through a rename", rename.same, JSON.stringify(rename));
  check("  the new name resolves", rename.newName);
  check("  and so does the old one, which is the whole point", rename.oldName);
  check("  the old title is kept as an alias", rename.aliases.indexOf("Zephyrine Blackwood") > -1, rename.aliases);
  check("  every reference to it survives", rename.notesAfter === rename.notesBefore && rename.notesAfter > 0,
    rename.notesBefore + " -> " + rename.notesAfter);
  check("  and prose written under the old name still cross-links", rename.stillLinked);

  /* ---------- Logic 2: the index can learn a name ---------- */
  section("LOGIC 2 — THE INDEX CAN LEARN A NAME IT DID NOT KNOW");
  await page.evaluate(async () => {
    await window.Codex.addNote("Chapter Four",
      "Ilya Vantar rode into the yard before dawn. Morrow Chase was waiting at the gate, " +
      "and said nothing at all. Ilya Vantar dismounted. Later Morrow Chase would claim he " +
      "had known all along. Her brother Bellamy Oke arrived at noon with the horses.",
      [], "My Notes");
    await new Promise(r => setTimeout(r, 500));
  });
  const knownBefore = await page.evaluate(() =>
    ["Ilya Vantar", "Morrow Chase", "Bellamy Oke"].filter(n => window.Codex.DB.entities.indexOf(n) > -1));
  check("names inside prose start out unknown, as before", knownBefore.length === 0, knownBefore);

  await page.evaluate(() => { location.hash = "#/index"; });
  await page.waitForTimeout(700);
  check("the index offers to look for names", await page.locator("#wqFind").count() === 1);
  await page.click("#wqFind");
  await page.waitForTimeout(2500);
  const offered = await page.locator(".wq-name").allInnerTexts();
  check("  and finds the ones in the chapter",
    offered.includes("Ilya Vantar") && offered.includes("Morrow Chase"), offered);
  check("  including one a kinship word points at", offered.includes("Bellamy Oke"), offered);
  check("  but nothing is in the canon yet", await page.evaluate(() =>
    window.Codex.DB.entities.indexOf("Ilya Vantar")) === -1);

  /* confirm one */
  const row = page.locator(".wq-row", { hasText: "Ilya Vantar" }).first();
  await row.locator("button", { hasText: "Character" }).first().click();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    inIndex: window.Codex.DB.entities.indexOf("Ilya Vantar") > -1,
    type: (window.CodexEntities.resolve("Ilya Vantar") || {}).type,
    mentions: (() => { const r = window.CodexEntities.resolve("Ilya Vantar");
      return r ? window.CodexEntities.notesMentioning(r.id).length : 0; })(),
  }));
  check("confirming one puts it in the Name Index", after.inIndex, JSON.stringify(after));
  check("  typed as what you said it was", after.type === "character", after.type);
  check("  and its mentions are indexed", after.mentions > 0, String(after.mentions));

  /* reject one, and it must stay rejected */
  const row2 = page.locator(".wq-row", { hasText: "Morrow Chase" }).first();
  await row2.locator("button", { hasText: "Not a name" }).first().click();
  await page.waitForTimeout(1200);
  await page.click("#wqFind");
  await page.waitForTimeout(2500);
  const offered2 = await page.locator(".wq-name").allInnerTexts();
  check("something rejected is never offered again", !offered2.includes("Morrow Chase"), offered2);
  check("  and never reaches the canon", await page.evaluate(() =>
    window.Codex.DB.entities.indexOf("Morrow Chase")) === -1);

  /* ---------- the assistant can now answer about it ---------- */
  section("AND THE ASSISTANT CAN USE IT");
  await page.click("#assistantToggle");
  await page.waitForTimeout(400);
  await page.fill("#assistantInput", "who is Ilya Vantar");
  await page.press("#assistantInput", "Enter");
  await page.waitForTimeout(1500);
  const answer = await page.evaluate(() => {
    const t = document.querySelector(".a-turn:last-child .a-them");
    return t ? t.innerText.replace(/\s+/g, " ").trim() : "";
  });
  check("a name only ever written inside a chapter is answerable",
    /Ilya Vantar/i.test(answer) && !/nothing in your canon/i.test(answer), answer.slice(0, 200));

  results.push("\nJS errors during the run: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fail += errors.length;

  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
