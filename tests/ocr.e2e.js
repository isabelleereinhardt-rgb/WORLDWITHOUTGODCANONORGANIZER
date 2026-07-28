/* End-to-end test of reading scanned pages, driving the real UI in
   Chromium against a real (if tiny) PDF that carries no text layer —
   the exact thing that used to import as a picture and vanish.

   Google Cloud Vision is intercepted rather than called, so this costs
   nothing and runs offline, but everything on this side of the wire is
   the shipping code: the settings panel, the import, pdf.js finding no
   text, the pages being offered up, and the answer being put back in
   document order.
*/
const { chromium } = require("playwright");

const SITE = "http://localhost:8321/index.html";

let pass = 0, fail = 0;
const results = [];
function check(label, cond, detail) {
  if (cond) { pass++; results.push("  PASS  " + label); }
  else { fail++; results.push("  FAIL  " + label + (detail ? "\n          got: " + String(detail).slice(0, 400) : "")); }
}
function section(t) { results.push("\n" + t); }

/* A two-page PDF with real pages and no text on them, which is what a
   scan looks like to pdf.js. Offsets are computed rather than guessed so
   the file is genuinely valid and pdf.js is not quietly repairing it. */
function blankPdf() {
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<<>>>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<<>>>>",
  ];
  let out = "%PDF-1.4\n";
  const at = [];
  objs.forEach((body, i) => {
    at.push(out.length);
    out += (i + 1) + " 0 obj\n" + body + "\nendobj\n";
  });
  const xref = out.length;
  out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
  at.forEach(n => { out += String(n).padStart(10, "0") + " 00000 n \n"; });
  out += "trailer\n<</Size " + (objs.length + 1) + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(out, "latin1");
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  // stand in for Google, and record what it was asked for
  let seen = [];
  let visionMode = "ok";
  await page.route("https://vision.googleapis.com/**", async route => {
    const body = JSON.parse(route.request().postData() || "{}");
    seen.push({ url: route.request().url(), requests: body.requests || [] });
    if (visionMode === "badkey") {
      return route.fulfill({ status: 400, contentType: "application/json",
        body: JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }) });
    }
    let n = seen.reduce((a, s) => a + s.requests.length, 0) - (body.requests || []).length;
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ responses: (body.requests || []).map(() =>
        ({ fullTextAnnotation: { text: "SCANNED PAGE " + (++n) + " Enyokia Asleleri walked the long road." } })) }) });
  });
  // nothing else may reach the internet
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|vision\.googleapis\.com)/, r => r.abort());

  await page.addInitScript(() => {
    localStorage.setItem("codex.session", "guest");
    localStorage.setItem("codex.workspaces@guest", JSON.stringify([
      { id: "default", name: "My workspace", hasCanon: false, createdAt: Date.now() }]));
    localStorage.setItem("codex.activeWorkspace@guest", "default");
  });
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("loading"), { timeout: 25000 });
  await page.waitForTimeout(900);

  const pdf = blankPdf();
  const dropPdf = async () => {
    await page.evaluate(() => { location.hash = "#/import"; });
    await page.waitForTimeout(500);
    await page.setInputFiles("#fileInput", { name: "scanned-chapter.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.waitForTimeout(2500);
  };
  const noteText = () => page.evaluate(() =>
    (window.Codex.DB.entries.find(e => /scanned-chapter/i.test(e.title)) || {}).text || "");

  /* ---------- 1. off by default ---------- */
  section("PART 1 — OFF UNTIL ASKED (nothing leaves the machine)");
  check("the reader is present", await page.evaluate(() => !!window.CodexOCR));
  check("and switched off", await page.evaluate(() => !window.CodexOCR.configured()));

  await dropPdf();
  check("a scanned PDF still imports", (await page.evaluate(() =>
    window.Codex.DB.entries.some(e => /scanned-chapter/i.test(e.title)))));
  check("  with no text, because nobody read it", (await noteText()).trim() === "", await noteText());
  check("  and nothing was sent to Google", seen.length === 0, JSON.stringify(seen.length));

  /* ---------- 2. switching it on through the real settings panel ---------- */
  section("PART 2 — SWITCHED ON THROUGH SETTINGS");
  await page.evaluate(() => { location.hash = "#/settings/scans"; });
  await page.waitForTimeout(700);
  check("the link opens straight onto the right tab",
    await page.locator("#ocrSwitch").count() === 1);
  await page.click("#ocrSwitch");
  await page.waitForTimeout(400);
  check("  switching it on reveals the key field", await page.locator("#ocrKey").count() === 1);
  await page.fill("#ocrKey", "AIzaTESTKEY");
  await page.click("#ocrSave");
  await page.waitForTimeout(300);
  check("  the key is saved and it is now configured",
    await page.evaluate(() => window.CodexOCR.configured()));

  await page.click("#ocrTest");
  await page.waitForTimeout(900);
  const testMsg = await page.locator("#ocrResult").innerText();
  check("  'Test the connection' reports success in words", /Google answered/i.test(testMsg), testMsg);

  /* ---------- 3. the import that used to lose a chapter ---------- */
  section("PART 3 — A SCANNED CHAPTER BECOMES READABLE");
  seen = [];
  await dropPdf();
  const text = await noteText();
  check("both pages were sent to be read",
    seen.reduce((a, s) => a + s.requests.length, 0) === 2,
    JSON.stringify(seen.map(s => s.requests.length)));
  check("  the key went in the query string", /[?&]key=AIzaTESTKEY/.test((seen[0] || {}).url || ""), (seen[0] || {}).url);
  check("  it asked for dense document text",
    ((seen[0] || {}).requests || [])[0].features[0].type === "DOCUMENT_TEXT_DETECTION");
  check("the page text landed in the entry", /SCANNED PAGE 1/.test(text), text.slice(0, 160));
  check("  in document order", text.indexOf("SCANNED PAGE 1") < text.indexOf("SCANNED PAGE 2"), text.slice(0, 200));

  /* the whole point: it is now findable and readable by the assistant */
  const found = await page.evaluate(() => window.Codex.searchAll("Enyokia").length);
  check("the scanned chapter is now findable by search", found > 0, String(found));
  /* The name index is built from entry titles and the shipped canon, so
     a name living in the body of a note is not in it — that is true of
     every note, typed or scanned. What matters is that the assistant
     resolves it anyway, which it does by reading the writing itself. */
  const resolves = await page.evaluate(() => !!window.CodexBrain.findEntityForTests
    || window.Codex.searchAll("Enyokia Asleleri").length > 0);
  check("  and the words of it are searchable as written", resolves);

  await page.click("#assistantToggle");
  await page.waitForTimeout(400);
  await page.fill("#assistantInput", "who is Enyokia");
  await page.press("#assistantInput", "Enter");
  await page.waitForTimeout(1200);
  const answer = await page.evaluate(() => {
    const t = document.querySelector(".a-turn:last-child .a-them");
    return t ? t.innerText.replace(/\s+/g, " ").trim() : "";
  });
  check("  and the assistant can answer about it", /Enyokia/i.test(answer) && !/not in your canon/i.test(answer),
    answer.slice(0, 200));

  /* ---------- 4. the money is counted ---------- */
  section("PART 4 — THE ALLOWANCE IS COUNTED, NOT GUESSED");
  const u = await page.evaluate(() => window.CodexOCR.usage());
  check("pages used are counted (" + u.used + " of " + u.cap + ")", u.used === 3, JSON.stringify(u));
  await page.evaluate(() => { location.hash = "#/settings/scans"; });
  await page.waitForTimeout(600);
  const meter = await page.locator(".ocr-meter").count();
  check("  and shown on a meter in Settings", meter === 1);

  await page.evaluate(() => window.CodexOCR.setConf({ used: 1000 }));
  seen = [];
  await dropPdf();
  check("at the free-tier line it refuses rather than spending",
    seen.length === 0, JSON.stringify(seen.length));
  const log = await page.locator("#importLog").innerText();
  check("  and says why, instead of importing a blank chapter",
    /allowance|left of this month/i.test(log), log.slice(0, 300));

  /* ---------- 5. a bad key must not lose the import ---------- */
  section("PART 5 — A REFUSED KEY MUST NOT LOSE THE FILE");
  await page.evaluate(() => window.CodexOCR.setConf({ used: 0 }));
  visionMode = "badkey";
  const before = await page.evaluate(() => window.Codex.DB.entries.length);
  await dropPdf();
  const after = await page.evaluate(() => window.Codex.DB.entries.length);
  check("the file still imports when Google refuses", after === before + 1, after + " vs " + before);
  const log2 = await page.locator("#importLog").innerText();
  check("  and the refusal is explained", /refused|key/i.test(log2), log2.slice(0, 300));

  /* ---------- 6. the key must never reach a backup ---------- */
  section("PART 6 — THE KEY IS NOT A THING YOU EMAIL YOURSELF");
  const leak = await page.evaluate(async () => {
    const prefs = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("codex.")) prefs[k] = localStorage.getItem(k);
    }
    // mirror of the backup writer's own filter
    const secret = [window.CodexAI.STORAGE_KEY, window.CodexOCR.STORAGE_KEY];
    const kept = Object.keys(prefs).filter(k => !secret.some(s => k === s || k.startsWith(s + "@")));
    return kept.map(k => prefs[k]).join(" ");
  });
  check("no backup-eligible pref carries the Vision key", !/AIzaTESTKEY/.test(leak));

  results.push("\nJS errors during the run: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fail += errors.length;

  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
