/* The QA pass of 14 August 2026, turned into tests so the findings
   cannot come back.

   Every claim here was reproduced in a real browser before it was
   fixed — the layout ones by measuring, not by reading CSS. They are
   measured the same way now.
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem("codex.session", "guest");
    localStorage.setItem("codex.workspaces@guest", JSON.stringify([
      { id: "default", name: "My workspace", hasCanon: false, createdAt: Date.now() }]));
    localStorage.setItem("codex.activeWorkspace@guest", "default");
  });
  /* A URL that differs only by its hash is a same-document navigation,
     so the page is not reloaded and focus survives from whatever was
     clicked last. Reload deliberately, or the tab-order check measures
     the previous test's leftovers. */
  const go = async hash => {
    await page.goto(SITE + hash, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.getElementById("app").classList.contains("loading"), { timeout: 25000 });
    await page.waitForTimeout(800);
  };

  /* ---------- Bug 1 & 2: the app on a phone ---------- */
  section("BUG 1 & 2 — THE APP ON THE DEVICE WRITERS CARRY");
  await go("#/import");
  const m = await page.evaluate(() => ({
    cls: document.getElementById("app").className,
    view: Math.round(document.getElementById("view").getBoundingClientRect().width),
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  check("the sidebar auto-collapses at 390px (the state that broke it)", /sidebar-collapsed/.test(m.cls), m.cls);
  check("  the content pane still has the full width", m.view >= 380, m.view + "px");
  check("  and the page does not overflow sideways", m.over === 0, m.over + "px");

  for (const w of [320, 480, 768, 859, 861, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      view: Math.round(document.getElementById("view").getBoundingClientRect().width),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    check("  at " + w + "px: content " + r.view + "px, overflow " + r.over + "px",
      r.view > w * 0.4 && r.over <= 1, JSON.stringify(r));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  /* every route, not just the one */
  for (const route of ["#/", "#/index", "#/timeline", "#/settings", "#/help", "#/browse/My%20Notes"]) {
    await go(route);
    const r = await page.evaluate(() => ({
      view: Math.round(document.getElementById("view").getBoundingClientRect().width),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    check("  " + route + " renders on a phone", r.view >= 380 && r.over <= 1, JSON.stringify(r));
  }

  /* ---------- Logic 7: ids that collide ---------- */
  section("LOGIC 7 — IDS THAT SILENTLY OVERWRITE EACH OTHER");
  await go("#/import");
  const ids = await page.evaluate(async () => {
    const seen = new Set();
    const now = Date.now;
    Date.now = () => 1755000000000;          // freeze the clock, as the report did
    for (let i = 0; i < 50000; i++) seen.add("note-" + window.Codex._newId());
    Date.now = now;
    return { made: 50000, unique: seen.size };
  }).catch(() => null);
  check("50,000 ids in one millisecond are all distinct",
    ids && ids.unique === ids.made, ids ? JSON.stringify(ids) : "helper not exposed");

  /* ---------- Logic 5: the draft you have not saved ---------- */
  section("LOGIC 5 — UNSAVED WRITING MUST SURVIVE A MISCLICK");
  await go("#/import");
  await page.fill("#pasteTitle", "Chapter Nine");
  await page.fill("#pasteBody", "The rain came sideways off the sea for three days and nobody spoke of it.");
  await page.waitForTimeout(700);
  await page.evaluate(() => { location.hash = "#/index"; });
  await page.waitForTimeout(600);
  await page.evaluate(() => { location.hash = "#/import"; });
  await page.waitForTimeout(800);
  check("navigating away and back keeps what you typed",
    (await page.inputValue("#pasteBody")).includes("sideways off the sea"),
    await page.inputValue("#pasteBody"));
  check("  including the title", (await page.inputValue("#pasteTitle")) === "Chapter Nine");
  await go("#/import");
  check("  and a full reload keeps it too",
    (await page.inputValue("#pasteBody")).includes("sideways off the sea"));

  /* ---------- Logic 4: the same thing filed twice ---------- */
  section("LOGIC 4 — THE SAME TEXT FILED TWICE");
  await page.fill("#pasteTitle", "Chapel Burning");
  await page.fill("#pasteBody", "Kestrel Amadi burned the last chapel at Vane Hollow, and nobody stopped her.");
  await page.click("#addPaste");
  await page.waitForTimeout(1200);
  await go("#/import");
  let asked = false;
  page.once("dialog", d => { asked = true; d.dismiss(); });
  await page.fill("#pasteTitle", "Chapel Burning");
  await page.fill("#pasteBody", "Kestrel Amadi burned the last chapel at Vane Hollow, and nobody stopped her.");
  await page.click("#addPaste");
  await page.waitForTimeout(1200);
  check("filing identical text again asks first", asked);
  const count = await page.evaluate(() =>
    window.Codex.DB.entries.filter(e => /Chapel Burning/i.test(e.title)).length);
  check("  and declining does not file it", count === 1, String(count));

  /* ---------- Logic 6: untitled imports ---------- */
  section("LOGIC 6 — TWO UNTITLED NOTES MUST NOT BE THE SAME ROW");
  /* The title must be cleared explicitly: the draft keeper restores
     whatever was last typed, which is the feature working. */
  await go("#/import");
  await page.fill("#pasteTitle", "");
  await page.fill("#pasteBody", "Vaun Torrick searched nine years for his sister and found a grave.");
  await page.click("#addPaste");
  await page.waitForTimeout(1000);
  await go("#/import");
  await page.fill("#pasteTitle", "");
  await page.fill("#pasteBody", "The Ash Order kept no records after the fire at Vane Hollow.");
  await page.click("#addPaste");
  await page.waitForTimeout(1000);
  const titles = await page.evaluate(() =>
    window.Codex.DB.entries.filter(e => e.type === "note").map(e => e.title));
  const dated = titles.filter(t => /^Note \d/.test(t));
  check("untitled notes are named from what they say, not the date",
    dated.length === 0, JSON.stringify(titles.slice(0, 6)));
  check("  and the two are told apart", new Set(titles).size === titles.length, JSON.stringify(titles));

  /* ---------- Bug 8: the wrong complaint ---------- */
  section("BUG 8 — SAY WHAT IS ACTUALLY MISSING");
  await go("#/import");
  await page.fill("#pasteTitle", "A title and nothing else");
  await page.click("#addPaste");
  await page.waitForTimeout(500);
  const t1 = await page.locator(".toast .tmsg").first().innerText();
  check("a title with no body is not 'nothing to add yet'", !/nothing to add/i.test(t1), t1);

  /* ---------- Bug 7: toasts that pile up ---------- */
  section("BUG 7 — THE SAME COMPLAINT, FOUR TIMES");
  await go("#/import");
  for (let i = 0; i < 4; i++) { await page.click("#addPaste"); await page.waitForTimeout(150); }
  const toasts = await page.locator(".toast").count();
  check("clicking save four times on an empty box gives one toast", toasts === 1, String(toasts));
  const live = await page.getAttribute("#toastStack", "aria-live");
  check("  and a screen reader is told about it", live === "polite", String(live));

  /* ---------- Bugs 3 & 4: text that will not wrap ---------- */
  section("BUGS 3 & 4 — TEXT THAT REFUSES TO WRAP");
  await go("#/import");
  const cap = await page.getAttribute("#pasteTitle", "maxlength");
  check("the title has a length limit", cap === "200", String(cap));
  await page.fill("#pasteBody", "x".repeat(4000));
  await page.fill("#pasteTitle", "A very long title " + "y".repeat(300));
  await page.click("#addPaste");
  await page.waitForTimeout(1500);
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("a 4,000-character unbroken word does not run off the page", over <= 1, over + "px");

  /* ---------- accessibility ---------- */
  section("ACCESSIBILITY — THE FOCUS RING YOU CAN SEE");
  await go("#/import");
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el.tagName, cls: el.className, text: (el.textContent || "").trim().slice(0, 30) };
  });
  check("the first tab stop is the skip link", /skip-link/.test(first.cls), JSON.stringify(first));
  await page.focus("#pasteBody");
  const ring = await page.evaluate(() => {
    const el = document.getElementById("pasteBody");
    el.focus();
    const cs = getComputedStyle(el);
    return { w: cs.outlineWidth, c: cs.outlineColor, style: cs.outlineStyle };
  });
  check("  a focused textarea has a real outline, not a tinted border",
    parseFloat(ring.w) >= 2 && ring.style !== "none", JSON.stringify(ring));
  const labelled = await page.evaluate(() => ["pasteTitle", "pasteBody", "fileInput"].map(id => {
    const el = document.getElementById(id);
    const lab = document.querySelector('label[for="' + id + '"]');
    return { id, named: !!(lab || el.getAttribute("aria-label")) };
  }));
  check("  every import control has an accessible name",
    labelled.every(l => l.named), JSON.stringify(labelled));

  results.push("\nJS errors during the run: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fail += errors.length;

  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
