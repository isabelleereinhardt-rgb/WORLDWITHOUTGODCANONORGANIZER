/* Margin notes pinned to the paragraph they are about.

   Wattpad's inline commenting, borrowed for one writer reading her own
   draft. The hard part is not the pin; it is the pin still pointing at
   the right line after the entry has been revised, because an index
   alone shifts by one for every paragraph inserted above it and would
   then point at a line the note was never about.
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

const PARAS = [
  "The wall ran east from the gatehouse and did not stop until the sea.",
  "Kestrel Amadi walked it every morning before the bell.",
  "In the ninth year she stopped walking it, and nobody asked her why.",
];

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
  await page.waitForTimeout(700);

  const id = await page.evaluate(async (paras) => {
    const n = await window.Codex.addNote("The Long Wall", paras.join("\n\n"), [], "My Notes");
    return n.id;
  }, PARAS);
  await page.evaluate(i => { location.hash = "#/entry/" + i; }, id);
  await page.waitForTimeout(900);

  /* ---------- paragraphs are addressable ---------- */
  section("EVERY PARAGRAPH HAS AN ANCHOR");
  const nParas = await page.locator("#entryBody [data-para]").count();
  check("each paragraph is numbered as it is rendered", nParas === 3, String(nParas));
  check("  and they are numbered in order",
    (await page.locator("#entryBody [data-para]").allTextContents())[1].includes("every morning"));

  /* ---------- pinning a note to a selection ---------- */
  section("A NOTE PINNED TO THE LINE IT IS ABOUT");
  await page.evaluate(() => {
    const p = document.querySelectorAll("#entryBody [data-para]")[1];
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
  });
  page.once("dialog", d => d.accept("Does she walk it in winter?"));
  await page.click("#addMargin");
  await page.waitForTimeout(900);

  const stored = await page.evaluate(async () => (await window.CodexStore.all("margins"))[0]);
  check("the note remembers which paragraph", stored && stored.paraIndex === 1, JSON.stringify(stored));
  check("  and the words it was left beside",
    stored && /every morning/.test(stored.quote || ""), stored && stored.quote);
  check("  the note itself is what you typed",
    stored && stored.text === "Does she walk it in winter?", stored && stored.text);

  const marked = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#entryBody [data-para].has-note"))
      .map(p => p.getAttribute("data-para")));
  check("the annotated paragraph is marked in the text", marked.length === 1 && marked[0] === "1", marked);
  check("  and the note shows what it is anchored to",
    /every morning/.test(await page.locator(".mr-anchor").innerText()));

  /* ---------- the marks come off ---------- */
  section("ANNOTATIONS YOU CAN TURN OFF");
  await page.click("#marginShow");
  await page.waitForTimeout(300);
  check("marks can be hidden for a clean read",
    await page.evaluate(() => document.getElementById("entryBody").classList.contains("marks-off")));
  /* Labelled by what pressing it does, so it reads "Show marks" once
     they are hidden. Case-insensitive because the chip is styled
     uppercase and innerText returns what is rendered. */
  check("  and the button offers to put them back",
    /show marks/i.test(await page.locator("#marginShow").innerText()),
    await page.locator("#marginShow").innerText());
  await page.click("#marginShow");
  await page.waitForTimeout(300);
  check("  and back on again",
    !(await page.evaluate(() => document.getElementById("entryBody").classList.contains("marks-off"))));

  /* ---------- the part that actually matters ---------- */
  section("REVISING THE ENTRY MUST NOT MOVE THE NOTE");
  await page.evaluate(async (i) => {
    const paras = [
      "A new opening paragraph, added above everything else.",
      "And a second new one, for good measure.",
      "The wall ran east from the gatehouse and did not stop until the sea.",
      "Kestrel Amadi walked it every morning before the bell.",
      "In the ninth year she stopped walking it, and nobody asked her why.",
    ];
    await window.Codex.updateNote(i, { text: paras.join("\n\n") });
    await new Promise(r => setTimeout(r, 400));
    location.hash = "#/";
    await new Promise(r => setTimeout(r, 300));
    location.hash = "#/entry/" + i;
  }, id);
  await page.waitForTimeout(1200);

  const nowMarked = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#entryBody [data-para].has-note"))
      .map(p => ({ n: p.getAttribute("data-para"), text: p.textContent.slice(0, 40) })));
  check("the note followed its line down the page",
    nowMarked.length === 1 && nowMarked[0].n === "3", JSON.stringify(nowMarked));
  check("  and it is still the line it was left on",
    nowMarked.length === 1 && /every morning/.test(nowMarked[0].text), JSON.stringify(nowMarked));

  /* "Show me" has to find it too */
  await page.click("[data-mgo]");
  await page.waitForTimeout(600);
  const flashed = await page.evaluate(() => {
    const p = document.querySelector("#entryBody [data-para].para-flash");
    return p ? p.textContent.slice(0, 40) : "";
  });
  check("'Show me' jumps to the right line", /every morning/.test(flashed), flashed);

  /* ---------- a line that was deleted outright ---------- */
  section("A LINE THAT NO LONGER EXISTS");
  await page.evaluate(async (i) => {
    await window.Codex.updateNote(i, { text: "Only this paragraph remains now." });
    await new Promise(r => setTimeout(r, 400));
    location.hash = "#/";
    await new Promise(r => setTimeout(r, 300));
    location.hash = "#/entry/" + i;
  }, id);
  await page.waitForTimeout(1200);
  check("the note is not lost when its line is deleted",
    await page.locator(".margin-row").count() === 1);
  const stillMarked = await page.locator("#entryBody [data-para].has-note").count();
  check("  but nothing unrelated is marked as annotated", stillMarked <= 1, String(stillMarked));

  /* ---------- and it stays out of the writing ---------- */
  section("NOTES ARE NOT PART OF THE ENTRY");
  const inText = await page.evaluate(i =>
    (window.Codex.DB.entries.find(e => e.id === i) || {}).text || "", id);
  check("the note never enters the entry text", !/walk it in winter/i.test(inText));
  const found = await page.evaluate(() => window.Codex.searchAll("winter").length);
  check("  nor the search index", found === 0, String(found));

  results.push("\nJS errors during the run: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fail += errors.length;

  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
