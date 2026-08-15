/* The views in the running app, against the real canon — 743 records
   and 2,496 declared facts, which is where a table either works or
   falls over. */
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
      { id: "default", name: "World Without God", hasCanon: true, createdAt: Date.now() }]));
    localStorage.setItem("codex.activeWorkspace@guest", "default");
  });
  await page.goto(SITE + "#/index", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("loading"), { timeout: 40000 });
  await page.waitForFunction(() => window.CodexEntities && window.CodexEntities._mentions().length > 20000, { timeout: 60000 });
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForTimeout(300);
  await page.evaluate(() => { location.hash = "#/index"; });
  await page.waitForTimeout(1200);

  section("THE DEFAULT DOES NOT CHANGE");
  check("the chip list is still what you land on",
    await page.locator(".chip[data-subject]").count() > 100,
    String(await page.locator(".chip[data-subject]").count()));
  check("  with the three views offered", await page.locator("[data-vmode]").count() === 3);

  section("A TABLE OF 743 RECORDS");
  const t0 = Date.now();
  await page.click('[data-vmode="table"]');
  await page.waitForSelector(".vt", { timeout: 20000 });
  const drew = Date.now() - t0;
  check("the table draws quickly (" + drew + "ms)", drew < 6000, String(drew));
  check("  the chip list gives way to it", await page.locator(".chip[data-subject]").count() === 0);
  const cols = await page.locator(".vt thead th").allInnerTexts();
  check("  columns come from what the records carry", cols.length > 3, cols);
  const rows = await page.locator(".vt tbody tr").count();
  check("  and it lists records (" + rows + ")", rows > 20, String(rows));

  section("SORTING");
  const firstBy = async () => (await page.locator(".vt tbody tr td").first().innerText()).trim();
  /* Away first, then back: the table lands sorted by name, so clicking
     Name straight away turns it round rather than sorting it, and a
     test that did not know that would read the two directions the
     wrong way about. */
  await page.locator('.vt [data-sort="type"]').click();
  await page.waitForTimeout(600);
  await page.locator('.vt [data-sort="name"]').click();
  await page.waitForTimeout(600);
  const asc = await firstBy();
  check("  a fresh column sorts ascending", /^[A-Za-z]/.test(asc) || asc.length > 0, asc);
  await page.locator('.vt [data-sort="name"]').click();
  await page.waitForTimeout(600);
  const desc = await firstBy();
  check("clicking a column sorts by it, and again reverses it",
    asc !== desc && asc.localeCompare(desc) < 0, { asc, desc });
  await page.locator('.vt [data-sort="seen"]').click();
  await page.waitForTimeout(600);
  const counts = await page.locator(".vt tbody tr td:nth-child(3)").allInnerTexts();
  const nums = counts.slice(0, 12).map(Number);
  check("  sorting by mentions is numeric, not alphabetical",
    nums.every((n, i) => i === 0 || nums[i - 1] <= n), nums);

  section("WHAT EACH NAME TURNED OUT TO BE");
  const offered = await page.locator("#vType option").allInnerTexts();
  check("the canon is not one undifferentiated kind of thing",
    offered.length >= 4, offered);
  const spot = await page.evaluate(() => {
    const E = window.CodexEntities, out = {};
    ["Enyokia", "Vandrea", "Isenaylini", "Solis", "Torad", "Gherci", "Vikistv", "House Patton",
     "Academy", "GreyNest"]
      .forEach(n => { const e = E.resolve(n); out[n] = e ? E.kindOf(e) : "(none)"; });
    return out;
  });
  check("the sisters are read as people", spot.Enyokia === "character" &&
    spot.Vandrea === "character" && spot.Isenaylini === "character", spot);
  check("  the places they travel to are read as places",
    spot.Torad === "place" && spot.Gherci === "place" && spot.Vikistv === "place", spot);
  check("  Emperor Solis is a man, not the empire named after him",
    spot.Solis === "character", spot.Solis);
  check("  and a house is still a house", spot["House Patton"] === "house", spot["House Patton"]);
  /* The town the Battle of GreyNest was fought over is a town, and the
     Academy — possessive, spoken about, surrounded by "she" — is not a
     person, because nobody writes "the Vandrea". */
  check("  a town six battles are named after is not an event",
    spot.GreyNest === "place", spot.GreyNest);
  check("  and a thing that always takes 'the' is not a person",
    spot.Academy !== "character", spot.Academy);

  section("FILTERING BY KIND");
  await page.selectOption("#vType", "house").catch(() => {});
  await page.waitForTimeout(800);
  const kinds = await page.$$eval(".vt tbody tr .vt-kind", els => els.map(e => e.value));
  check("filtering to houses shows only houses",
    kinds.length > 0 && kinds.every(k => k === "house"), kinds.slice(0, 6));

  section("A KIND THE APP GUESSED CAN BE OVERRULED");
  await page.selectOption("#vType", "character").catch(() => {});
  await page.waitForTimeout(800);
  const who = await page.$eval(".vt tbody tr .vt-kind", e => e.dataset.kindOf);
  check("a read kind is shown as a guess, not a fact",
    await page.locator(".vt-kind.read").count() > 0);
  await page.selectOption(`[data-kind-of="${who}"]`, "object");
  await page.waitForTimeout(500);
  const stuck = await page.evaluate(id => {
    const E = window.CodexEntities;
    return { kind: E.kindOf(id), read: E.kindWasRead(id) };
  }, who);
  check("  choosing one settles it", stuck.kind === "object" && stuck.read === false, stuck);
  await page.evaluate(() => window.CodexEntities.classify(() => ""));
  const survived = await page.evaluate(id => window.CodexEntities.kindOf(id), who);
  check("  and re-reading the prose does not undo it", survived === "object", survived);
  await page.selectOption("#vType", "all").catch(() => {});
  await page.waitForTimeout(700);

  section("THE LINE, WHICH RUNS BACKWARDS");
  await page.click('[data-vmode="line"]');
  await page.waitForTimeout(1200);
  const whens = await page.locator(".vl-when").allInnerTexts();
  check("dated records are placed on a line", whens.length > 0, whens.slice(0, 6));
  if (whens.length > 1) {
    /* BR counts down, so a correct line has the BIGGEST BR numbers
       first. Sorting the numbers the obvious way would print the
       history of the world in reverse. */
    const br = whens.map(w => /BR/i.test(w) ? Number(String(w).replace(/[^\d]/g, "")) : null)
      .filter(n => n !== null);
    check("  the oldest BR year comes first",
      br.length < 2 || br.every((n, i) => i === 0 || br[i - 1] >= n), br.slice(0, 10));
  }
  check("  and each says which field dated it", await page.locator(".vl-what em").count() > 0);

  section("BACK WHERE WE STARTED");
  await page.click('[data-vmode="chips"]');
  await page.waitForTimeout(900);
  check("the chip list comes back", await page.locator(".chip[data-subject]").count() > 100);
  check("  and the table is gone", await page.locator(".vt").count() === 0);

  section("ON A PHONE");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-vmode="table"]');
  await page.waitForTimeout(900);
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("a wide table scrolls inside itself rather than the page", over <= 1, over + "px");

  results.push("\nJS errors during the run: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fail += errors.length;

  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
