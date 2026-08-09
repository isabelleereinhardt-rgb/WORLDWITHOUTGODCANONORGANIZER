/* The reader's canon widget, in a real browser — including the case it
   exists for: running inside somebody else's iframe, the way Google
   Sites embeds it.

   The rules it must not break are storage (none, because a third-party
   frame's storage is partitioned or refused) and reach (read-only, no
   account, no key). Both are asserted here rather than assumed.
*/
const { chromium } = require("playwright");
const http = require("http");

const SITE = "http://localhost:8321";
const HOST_PORT = 8323;      // stands in for the page doing the embedding

let pass = 0, fail = 0;
const results = [];
function check(label, cond, detail) {
  if (cond) { pass++; results.push("  PASS  " + label); }
  else { fail++; results.push("  FAIL  " + label + (detail ? "\n          got: " + String(detail).slice(0, 300) : "")); }
}
function section(t) { results.push("\n" + t); }

/* A page that embeds the widget cross-origin: 127.0.0.1 and localhost
   are different origins to a browser, which is exactly what we want. */
const HOST_PAGE = `<!doctype html><title>Host</title>
<body style="margin:0">
<h1>A page that embedded the canon</h1>
<iframe id="f" src="http://127.0.0.1:8321/widget/index.html?src=canon"
        style="width:100%;height:400px;border:0"></iframe>
<script>
  window.heard = null;
  addEventListener("message", e => { if (e.data && e.data.codexWidget === "height") {
    window.heard = e.data.height;
    document.getElementById("f").style.height = e.data.height + "px";
  }});
</script>`;

(async () => {
  const hostServer = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(HOST_PAGE);
  }).listen(HOST_PORT);

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  /* Part 6 asks for a file that is deliberately not there, so the 404 it
     provokes is the test working rather than the widget failing. */
  let expecting404 = false;
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => {
    if (m.type() !== "error") return;
    if (expecting404 && /404|Failed to load resource/i.test(m.text())) return;
    errors.push("console: " + m.text());
  });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());

  /* ---------- 1. standing on its own ---------- */
  section("PART 1 — THE WIDGET ON ITS OWN");
  await page.goto(SITE + "/widget/index.html?src=canon", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".w-ask", { timeout: 25000 });
  await page.waitForTimeout(700);

  const head = await page.locator(".w-count").innerText();
  check("the real canon loads (" + head + ")", /11\d entries · 7\d\d names/i.test(head), head);

  check("it offers openers", await page.locator("[data-ask]").count() >= 3);
  const chips = await page.locator("[data-ask]").allInnerTexts();
  check("  phrased as a question about a real subject",
    chips.every(c => /^(who|what) is .+\?$/i.test(c.trim())), chips.join(" | "));

  /* ---------- 2. the assistant, hosted somewhere new ---------- */
  section("PART 2 — THE SAME ASSISTANT, A DIFFERENT HOST");
  await page.fill("#wq", "who is Enyokia");
  await page.click("#wgo");
  await page.waitForTimeout(1200);
  const ans = (await page.locator(".w-them").innerText()).replace(/\s+/g, " ");
  check("it answers from the canon", /Enyokia/.test(ans) && ans.length > 60, ans.slice(0, 200));
  check("  reading real statements, not a raw dump",
    /(is|has|was|betrayed|daughter|mother)/i.test(ans), ans.slice(0, 200));
  check("  and cites where it read them", await page.locator(".w-them .ev-row, .w-them .a-ground").count() > 0);

  const dead = await page.locator(".w-them a[href^='#/']").count();
  check("no answer link points at a route this page does not have", dead === 0, String(dead));

  await page.locator(".w-them .btn").first().click();
  await page.waitForTimeout(600);
  check("'Open entry' opens the entry here", await page.locator(".w-entry h2").count() === 1,
    await page.locator("#wread").innerText());

  /* a question with no answer must say so rather than throw */
  await page.fill("#wq", "who is Qqzzx Nobodyson");
  await page.click("#wgo");
  await page.waitForTimeout(900);
  const none = await page.locator(".w-them").innerText();
  check("an unknown name is refused politely", none.length > 10 && !/undefined|\[object/i.test(none), none.slice(0, 160));

  /* ---------- 3. browsing ---------- */
  section("PART 3 — BROWSING THE NAMES");
  await page.fill("#wfilter", "Patton");
  await page.waitForTimeout(400);
  const names = await page.locator(".w-name").allInnerTexts();
  check("filtering narrows the index", names.length > 0 && names.length < 20, names.join(", "));
  check("  with no name listed twice",
    new Set(names.map(n => n.toLowerCase())).size === names.length, names.join(", "));
  await page.locator(".w-name", { hasText: "House Patton" }).first().click();
  await page.waitForTimeout(500);
  check("picking a name opens its entry",
    /House Patton/.test(await page.locator(".w-entry h2").innerText()));
  check("  with its declared facts", await page.locator(".w-entry .sc-facts dt").count() > 0);

  /* ---------- 4. the rules of being embedded ---------- */
  section("PART 4 — WHAT AN EMBED MAY NOT DO");
  const stored = await page.evaluate(() => {
    let ls = -1; try { ls = localStorage.length; } catch (e) { ls = "blocked"; }
    return { ls, dbs: typeof indexedDB.databases === "function" };
  });
  check("it wrote nothing to localStorage", stored.ls === 0, JSON.stringify(stored));
  const idb = await page.evaluate(async () => {
    if (typeof indexedDB.databases !== "function") return "unknown";
    return (await indexedDB.databases()).length;
  });
  check("  and opened no database", idb === 0 || idb === "unknown", String(idb));
  const cookies = await page.context().cookies();
  check("  and set no cookie", cookies.length === 0, JSON.stringify(cookies).slice(0, 200));

  /* ---------- 5. actually embedded, cross-origin ---------- */
  section("PART 5 — INSIDE SOMEBODY ELSE'S PAGE");
  await page.goto("http://localhost:" + HOST_PORT + "/", { waitUntil: "domcontentloaded" });
  const frame = page.frameLocator("#f");
  await frame.locator(".w-ask").waitFor({ timeout: 25000 });
  await page.waitForTimeout(900);
  check("the widget renders inside the frame",
    (await frame.locator(".w-count").innerText()).length > 0);

  await frame.locator("#wq").fill("who is Vandrea");
  await frame.locator("#wgo").click();
  await page.waitForTimeout(1200);
  const framedAns = (await frame.locator(".w-them").innerText()).replace(/\s+/g, " ");
  check("  and answers there too", /Vandrea/i.test(framedAns), framedAns.slice(0, 180));

  const heard = await page.evaluate(() => window.heard);
  check("it tells the host page how tall it is", typeof heard === "number" && heard > 200, String(heard));
  const framedLs = await frame.locator("body").evaluate(() => {
    try { return localStorage.length; } catch (e) { return "blocked"; }
  });
  check("  and still stores nothing where storage is partitioned",
    framedLs === 0 || framedLs === "blocked", String(framedLs));

  /* ---------- 6. a canon it cannot open ---------- */
  section("PART 6 — WHEN THERE IS NO CANON");
  expecting404 = true;
  await page.goto(SITE + "/widget/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".w-fail", { timeout: 15000 });
  const failMsg = await page.locator(".w-fail").innerText();
  check("an address with no canon explains itself", /share|src/i.test(failMsg), failMsg.slice(0, 200));
  await page.goto(SITE + "/widget/index.html?src=nope.json", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".w-fail", { timeout: 15000 });
  check("  and so does a file that is not there",
    /could not read/i.test(await page.locator(".w-fail").innerText()));

  results.push("\nJS errors during the run: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fail += errors.length;

  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  await browser.close();
  hostServer.close();
  process.exit(fail ? 1 : 0);
})();
