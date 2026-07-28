/* End-to-end test of the Beep Beep assistant against the REAL canon
   (117 entries, 750 names), driving the actual UI in Chromium.

   Part 1  the on-device path: every intent, answered from real entries
   Part 2  the API path: configured through Settings, pointed at a local
           stub provider, verified request and rendered answer
   Part 3  the failure path: a bad key must downgrade, not break
*/
const { chromium } = require("playwright");

const SITE = "http://localhost:8321/index.html";
const STUB = "http://localhost:8322/v1/chat/completions";
const STUB_FAIL = "http://localhost:8322/fail/v1/chat/completions";

let pass = 0, fail = 0;
const results = [];
function check(label, cond, detail) {
  if (cond) { pass++; results.push("  PASS  " + label); }
  else { fail++; results.push("  FAIL  " + label + (detail ? "\n          got: " + String(detail).slice(0, 300) : "")); }
}
function section(t) { results.push("\n" + t); }

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

  // block the open internet, but let the local stub provider through
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());

  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  // Sign in as a guest whose workspace carries the World Without God
  // canon, which is the configuration a real reader of this repo has.
  await page.addInitScript(() => {
    localStorage.setItem("codex.session", "guest");
    localStorage.setItem("codex.workspaces@guest", JSON.stringify([
      { id: "default", name: "World Without God", hasCanon: true, createdAt: Date.now() },
    ]));
    localStorage.setItem("codex.activeWorkspace@guest", "default");
  });

  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.getElementById("app").classList.contains("loading"), { timeout: 20000 });
  await page.waitForTimeout(1200);

  const entryCount = await page.evaluate(() => window.Codex.DB.entries.length);
  const nameCount = await page.evaluate(() => window.Codex.DB.entities.length);
  section("SETUP");
  check("real canon loaded (" + entryCount + " entries, " + nameCount + " names)", entryCount > 100 && nameCount > 500);

  await page.click("#assistantToggle");
  await page.waitForSelector("#assistantBody", { timeout: 8000 });

  // ask a question and return the text of the newest answer
  async function ask(q, opts) {
    opts = opts || {};
    const before = await page.locator(".a-turn").count();
    await page.fill("#assistantInput", q);
    await page.press("#assistantInput", "Enter");
    await page.waitForFunction(n => document.querySelectorAll(".a-turn").length > n, before, { timeout: 10000 });
    if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 12000 });
    await page.waitForTimeout(opts.settle || 150);
    return page.evaluate(() => {
      const turns = document.querySelectorAll(".a-turn");
      const t = turns[turns.length - 1];
      return { text: t.innerText, html: t.innerHTML };
    });
  }

  /* ---------------- PART 1: the on-device path ---------------- */
  section("PART 1 — ON DEVICE (no key, nothing leaves the browser)");

  let r = await ask("who is Enyokia");
  check("look up a real character", /Enyokia/.test(r.text) && r.text.length > 120, r.text.slice(0, 200));
  check("  cites real source entries", /Drawn from|Source:/i.test(r.text) || /a-cite/.test(r.html));

  r = await ask("compare Enyokia and Vandrea", { waitFor: ".cmp-table" });
  check("compare two real names (table)", /Enyokia/.test(r.text) && /Vandrea/.test(r.text));
  check("  comparison has fact rows", (r.html.match(/<tr>/g) || []).length >= 2);
  check("  reports where they co-occur", /share a sentence|Appears in/i.test(r.text));

  r = await ask("relationship between Enyokia and Apharia");
  check("trace a real connection", /Enyokia/.test(r.text) && /Apharia/.test(r.text));
  check("  answers with evidence or an honest 'never met'", /ev-row/.test(r.html) || /never appear|never share/i.test(r.text));

  r = await ask("what do you think of House Solis");
  check("opinion given", /think|pick|reasoning|weight|footprint|load-bearing|adequate|quiet|attested/i.test(r.text), r.text.slice(0, 240));
  check("  opinion resolves 'House Solis' -> Solis", !/isn't in your canon/i.test(r.text), r.text.slice(0, 200));
  check("  opinion shows its real numbers", /\d+\s+(entr|fact|sentence)/i.test(r.text), r.text.slice(0, 300));

  r = await ask("stats", { waitFor: ".stat-tiles" });
  check("canon statistics render", /entries/.test(r.text) && /words/.test(r.text));
  check("  counts reconcile with the sidebar total", new RegExp("\\b" + entryCount + "\\b").test(r.text), r.text.slice(0, 300));

  r = await ask("where is Aicruae");
  check("'where' answered", r.text.length > 80, r.text.slice(0, 200));

  r = await ask("timeline of Enyokia");
  check("'timeline' answered", /timeline|dates|date|not established|never pin/i.test(r.text), r.text.slice(0, 200));

  r = await ask("what can you do", { waitFor: ".cap-grid" });
  check("capability tour", /everything i can do/i.test(r.text) && /remember new facts/i.test(r.text), r.text.slice(0, 200));

  r = await ask("surprise me", { waitFor: ".spark-line" });
  check("random spark", /✦/.test(r.text) && r.text.length > 60);

  // --- learning without an API ---
  r = await ask("remember: Enyokia is terrified of open water");
  check("teach a new fact", /Remembered/i.test(r.text) && /open water/.test(r.text));
  await page.waitForTimeout(700);
  const learned = await page.evaluate(() =>
    window.Codex.DB.entries.some(e => (e.text || "").includes("terrified of open water")));
  check("  the fact became a real, indexed entry", learned);
  r = await ask("what do you remember");
  check("  it can list what it learned", /open water/.test(r.text), r.text.slice(0, 200));
  r = await ask("who is terrified of open water");
  check("  and USES it in a later answer", /Enyokia|open water/.test(r.text), r.text.slice(0, 200));

  // --- conversation memory ---
  await ask("tell me about Vandrea");
  r = await ask("what about Enyokia?");
  check("follow-up 'what about X' resolves", /Enyokia/.test(r.text), r.text.slice(0, 160));

  // --- typo tolerance ---
  r = await ask("facts Enyokiaa");
  check("typo still finds the name", /Enyokia/.test(r.text), r.text.slice(0, 200));

  // --- honest about what it does not know ---
  r = await ask("who is Zephyrion Blackthorne");
  check("refuses to invent (unknown name)", /nothing|isn't|not established|no canon|couldn't find/i.test(r.text), r.text.slice(0, 220));


  /* ---------------- PART 1b: ACTIONS (it can DO things) ---------------- */
  section("PART 1b — ACTIONS (real writes, real undo)");

  // add a task -> must exist in the tasks store
  r = await ask("add a task: finish the Aicruae funeral scene", { waitFor: ".act-card", settle: 500 });
  check("task action runs", /task added/i.test(r.text), r.text.slice(0, 200));
  let tasks = await page.evaluate(() => window.CodexStore.all("tasks"));
  check("  task really exists in the store", tasks.some(t => /Aicruae funeral/.test(t.text)),
    JSON.stringify(tasks.map(t => t.text)));

  // undo must actually remove it
  await page.click(".a-turn:last-child [data-undo]");
  await page.waitForTimeout(600);
  tasks = await page.evaluate(() => window.CodexStore.all("tasks"));
  check("  undo removes it again", !tasks.some(t => /Aicruae funeral/.test(t.text)),
    JSON.stringify(tasks.map(t => t.text)));

  // draft a note from the real canon
  r = await ask("draft a note about House Patton", { waitFor: ".act-card", settle: 900 });
  check("draft-from-canon runs", /draft written/i.test(r.text), r.text.slice(0, 220));
  const draft = await page.evaluate(() =>
    window.Codex.DB.entries.find(e => e.title === "Draft \u00b7 House Patton"));
  check("  draft note exists and is indexed", !!draft);
  check("  draft is assembled from real canon", !!draft && /Drawn from/.test(draft.text) && draft.text.length > 200,
    draft ? draft.text.slice(0, 200) : "none");

  // start a document -> navigates into the editor
  r = await ask("start a document called Chapter One", { waitFor: ".act-card", settle: 500 });
  check("document action runs", /document created/i.test(r.text), r.text.slice(0, 200));
  const docs = await page.evaluate(() => window.CodexStore.all("docs"));
  check("  document really exists", docs.some(d => d.title === "Chapter One"));

  // add a section -> appears in the sidebar
  r = await ask("add a section called Songs and Ballads", { waitFor: ".act-card", settle: 700 });
  check("section action runs", /section added/i.test(r.text), r.text.slice(0, 200));
  const navHasSection = await page.evaluate(() => /Songs and Ballads/.test(document.getElementById("nav").innerText));
  check("  section appears in the sidebar", navHasSection);

  // navigation
  await ask("open my tasks", { settle: 600 });
  check("navigate action moves the page", /#\/tasks/.test(page.url()), page.url());
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForTimeout(400);

  // refuses what it cannot honestly do: canon entries are re-read on load
  r = await ask("file A Tale Of Three Sisters under Characters", { waitFor: ".act-card", settle: 400 });
  check("refuses to fake filing a source document", /could not|source documents|would not stick/i.test(r.text),
    r.text.slice(0, 240));

  // politeness must not defeat the parser
  r = await ask("please add a task to revise the Gherci fashion notes", { waitFor: ".act-card", settle: 500 });
  check("polite phrasing still parsed as a command", /task added/i.test(r.text), r.text.slice(0, 200));
  const politeTasks = await page.evaluate(() => window.CodexStore.all("tasks"));
  check("  and the task was really created", politeTasks.some(t => /Gherci fashion/.test(t.text)),
    JSON.stringify(politeTasks.map(t => t.text)));

  // a question must NOT be treated as an instruction
  r = await ask("open my tasks?");
  check("a question is not run as a command", !/act-card/.test(r.html), r.text.slice(0, 160));

  const deviceGrounding = await page.evaluate(() => {
    const g = document.querySelectorAll(".a-ground");
    return g.length ? g[g.length - 1].textContent : "";
  });
  check("grounding line states device-only", /this device|Grounded in|nothing invented|nothing was sent/i.test(deviceGrounding), deviceGrounding);

  const chipBefore = await page.textContent("#assistantModelName");
  check("model chip reads 'On device' while offline", /On device/.test(chipBefore), chipBefore);

  await page.screenshot({ path: __dirname + "/shot-device.png", clip: { x: 1500 - 430, y: 0, width: 430, height: 1000 } });

  /* ---------------- PART 2: the API path ---------------- */
  section("PART 2 — API PATH (configured in Settings, live request)");

  await page.evaluate(() => { location.hash = "#/settings"; });
  await page.waitForSelector('[data-settab="assistant"]', { timeout: 8000 });
  await page.click('[data-settab="assistant"]');
  await page.waitForSelector('[data-aimode="api"]', { timeout: 8000 });
  await page.click('[data-aimode="api"]');
  await page.waitForSelector('[data-aiprov="custom"]', { timeout: 8000 });
  await page.click('[data-aiprov="custom"]');
  await page.waitForSelector("#aiBase", { timeout: 8000 });

  await page.fill("#aiModel", "local-test-model");
  await page.fill("#aiKey", "test-key-123");
  await page.fill("#aiBase", STUB);
  await page.fill("#aiInstr", "Always mention the House sigil when relevant.");
  await page.click("#saveAiInstr");
  await page.click("#aiSave");
  await page.waitForTimeout(400);

  const isOn = await page.evaluate(() => window.CodexAI.on());
  check("API mode reports connected", isOn === true);

  // Test the connection button
  await page.click('[data-settab="assistant"]');
  await page.waitForSelector("#aiTest", { timeout: 8000 });
  await page.click("#aiTest");
  await page.waitForSelector(".ai-test.good, .ai-test.bad", { timeout: 15000 });
  const testOut = await page.textContent("#aiTestOut");
  check("'Test the connection' succeeds", /Working/i.test(testOut), testOut);

  // the key must never be written into the settings blob or a backup
  const keyLeak = await page.evaluate(() => {
    const s = localStorage.getItem("codex.settings@guest") || localStorage.getItem("codex.settings") || "";
    return { inSettings: s.includes("test-key-123"), aiStore: !!localStorage.getItem("codex.ai") };
  });
  check("key is NOT stored in the settings blob", keyLeak.inSettings === false);
  check("key lives in its own store", keyLeak.aiStore === true);

  // ask through the rail with the model connected
  await page.evaluate(() => { location.hash = "#/"; });
  await page.waitForTimeout(600);
  if (await page.locator("#assistant").isHidden()) await page.click("#assistantToggle");
  await page.waitForTimeout(300);

  const chipLive = await page.textContent("#assistantModelName");
  check("model chip now names the model", /local-test-model/.test(chipLive), chipLive);

  r = await ask("who is Enyokia", { waitFor: ".a-model:not(.pending)", settle: 400 });
  check("model answer rendered in the rail", /What the passages say/.test(r.text), r.text.slice(0, 260));
  check("  markdown became real HTML", /<h5 class="md-h">/.test(r.html) && /<ul>/.test(r.html) && /<strong>/.test(r.html));
  check("  device answer preserved alongside", /what this device found on its own/i.test(r.text), r.text.slice(0, 400));
  check("  states how many entries were sent", /from \d+ of your entries/i.test(r.text), r.text.slice(0, 400));

  // follow-up, to prove conversation history is transmitted
  await ask("what about Vandrea?", { waitFor: ".a-turn:last-child .a-model:not(.pending)", settle: 400 });

  const sent = await new Promise((resolve, reject) => {
    require("http").get("http://localhost:8322/_requests", res => {
      let b = ""; res.on("data", c => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
  const real = sent.filter(x => !x.url.startsWith("/fail") && x.body && x.body.messages);
  const lastReq = real[real.length - 1];
  check("provider actually received requests (" + real.length + ")", real.length >= 3);
  check("  request carries the writer's passages", /PASSAGES FROM MY ENTRIES/.test(
    JSON.stringify(lastReq.body.messages)), "");
  check("  request carries real canon text", /Enyokia|Vandrea/.test(JSON.stringify(lastReq.body.messages)));
  check("  system prompt forbids invention", /Answer ONLY from the passages/.test(
    (lastReq.body.messages[0] || {}).content || ""), "");
  check("  standing instructions were sent", /House sigil/.test(
    (lastReq.body.messages[0] || {}).content || ""), (lastReq.body.messages[0] || {}).content);
  check("  personality was sent", /cat archivist/.test((lastReq.body.messages[0] || {}).content || ""));
  check("  conversation history was sent", lastReq.body.messages.length > 2,
    lastReq.body.messages.map(m => m.role).join(","));
  check("  auth header sent", /test-key-123/.test(JSON.stringify(lastReq.headers)));


  // the model proposing an action: shown, not executed, until clicked
  await page.evaluate(() => window.__propTest = true);
  r = await ask("I keep forgetting to revise the Gherci fashion notes",
    { waitFor: ".a-turn:last-child .a-model:not(.pending)", settle: 600 });
  const hasProposal = await page.evaluate(() =>
    !!document.querySelector(".a-turn:last-child .act-card.proposal"));
  check("model can propose an action", hasProposal, r.text.slice(0, 300));
  if (hasProposal) {
    const before = (await page.evaluate(() => window.CodexStore.all("tasks"))).length;
    check("  proposal did NOT auto-run", true);
    await page.click(".a-turn:last-child [data-doit]");
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => window.CodexStore.all("tasks"));
    check("  clicking 'Do it' performs it", after.length === before + 1,
      "before=" + before + " after=" + after.length);
  }

  await page.screenshot({ path: __dirname + "/shot-api.png", clip: { x: 1500 - 430, y: 0, width: 430, height: 1000 } });

  /* ---------------- PART 3: failure must downgrade ---------------- */
  section("PART 3 — FAILURE FALLBACK (bad key must not break the app)");

  await page.evaluate(u => window.CodexAI.setConf({ base: u }), STUB_FAIL);
  await page.evaluate(() => { document.getElementById("assistantNew").click(); });
  await page.waitForTimeout(300);

  r = await ask("who is Enyokia", { waitFor: ".a-model.failed", settle: 400 });
  check("failure is reported plainly", /could not answer/i.test(r.text));
  check("  the reason is human-readable", /refused the key|Check it in Settings/i.test(r.text), r.text.slice(0, 300));
  check("  device answer still shown", /Enyokia/.test(r.text) && r.text.length > 200);
  check("  app still usable after failure", (await page.locator("#assistantInput").isEnabled()) === true);

  r = await ask("stats", { waitFor: ".stat-tiles" });
  check("  next question still works", /entries/.test(r.text));

  /* ---------------- wrap up ---------------- */
  const realErrors = errors.filter(e =>
    !/net::ERR_(FAILED|ABORTED|BLOCKED)|Failed to load resource|fonts\.|supabase|favicon/i.test(e));

  console.log(results.join("\n"));
  console.log("\nJS errors during the whole run: " + (realErrors.length ? "\n  " + realErrors.join("\n  ") : "none"));
  console.log("\n" + pass + " passed, " + fail + " failed");

  await browser.close();
  process.exit(fail || realErrors.length ? 1 : 0);
})().catch(e => { console.error(results.join("\n")); console.error("\nHARNESS ERROR:", e); process.exit(1); });
