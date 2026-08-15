/* The narrative tier in the running app.

   The model is intercepted rather than paid, but everything this side
   of the wire is the shipping code — including the guard, which is the
   only reason a model-found contradiction is worth showing at all.
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

const REAL = {
  findings: [{
    about: "whether she can fight",
    a: { n: 1, quote: "Kestrel Amadi had never held a sword in her life" },
    b: { n: 3, quote: "the sword was familiar in Kestrel Amadi's hand" },
    why: "She cannot both never have held a sword and be practised with one.",
  }],
};
const INVENTED = {
  findings: [{
    about: "her eyes",
    a: { n: 1, quote: "her eyes were grey as the winter sea" },
    b: { n: 2, quote: "her eyes were brown and always had been" },
    why: "Two eye colours.",
  }],
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  let reply = JSON.stringify(REAL);
  let sent = null;
  await page.route("https://stub.invalid/**", async route => {
    sent = JSON.parse(route.request().postData() || "{}");
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: reply } }] }) });
  });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|stub\.invalid)/, r => r.abort());

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

  /* ---------- with nothing connected ---------- */
  section("BEFORE A MODEL IS CONNECTED");
  await page.evaluate(async () => {
    await window.Codex.addNote("Kestrel Amadi",
      "Kestrel Amadi had never held a sword in her life, and said so to anyone who asked.\n\n" +
      "She kept the archive at Vane Hollow for eleven years without once leaving the grounds.\n\n" +
      "Kestrel Amadi read every book in it twice, and wrote in the margins of most.\n\n" +
      "Kestrel Amadi was not a soldier and never pretended to be one.", [], "My Notes");
    await window.Codex.addNote("The Ford",
      "At the ford, the sword was familiar in Kestrel Amadi's hand, as though she had carried one for years.",
      [], "My Notes");
    await new Promise(r => setTimeout(r, 900));
    location.hash = "#/index";
  });
  await page.waitForTimeout(1200);
  check("the prose reader is offered", await page.locator(".nq").count() === 1);
  check("  but disabled, and says why", await page.locator("#nqGo").isDisabled());
  check("  pointing at where to connect one",
    /connect your own key/i.test(await page.locator(".nq").innerText()),
    await page.locator(".nq").innerText());

  /* ---------- connect a model ---------- */
  section("A REAL CONTRADICTION IN PROSE");
  await page.evaluate(() => {
    window.CodexAI.setConf({ mode: "api", provider: "custom",
      base: "https://stub.invalid/v1/chat/completions", key: "k", model: "test" });
    location.hash = "#/";
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = "#/index"; });
  await page.waitForTimeout(900);
  check("with a model connected the button is live", !(await page.locator("#nqGo").isDisabled()));
  check("  and it names who is billed",
    /billed by them/i.test(await page.locator(".nq").innerText()), await page.locator(".nq").innerText());

  await page.selectOption("#nqWho", { label: /Kestrel Amadi/ }).catch(() => {});
  await page.click("#nqGo");
  await page.waitForTimeout(2000);
  const found = await page.locator("#nqOut").innerText();
  check("a contradiction no value comparison could catch is found",
    /never held a sword/.test(found) && /familiar/.test(found), found.slice(0, 240));
  check("  with each side attributed to its entry",
    /Kestrel Amadi/.test(found) && /The Ford/.test(found), found.slice(0, 240));
  check("  and neither side chosen", !/is right|is correct/i.test(found));

  /* Read the message itself: JSON.stringify escapes the quotes inside
     the passage tags, so matching the encoded body would pass whatever
     was actually sent. */
  const lastSent = () => (sent && sent.messages) ? sent.messages[sent.messages.length - 1].content : "";
  check("whole paragraphs were sent, not a truncated blob",
    /<passage n="1"/.test(lastSent()) && /never held a sword in her life/.test(lastSent()),
    lastSent().slice(0, 240));
  check("  and the model was told to quote word for word",
    sent && /word for word/i.test(JSON.stringify(sent)));

  /* ---------- THE GUARD ---------- */
  section("A QUOTE THAT IS NOT IN HER WRITING IS NOT SHOWN");
  reply = JSON.stringify(INVENTED);
  await page.click("#nqGo");
  await page.waitForTimeout(2000);
  const guarded = await page.locator("#nqOut").innerText();
  check("an invented contradiction never reaches the screen",
    !/eyes were grey/i.test(guarded) && !/brown/i.test(guarded), guarded.slice(0, 240));
  check("  and the discard is admitted rather than hidden",
    /not in your writing|discarded/i.test(guarded), guarded.slice(0, 240));

  /* ---------- nothing found ---------- */
  section("FINDING NOTHING IS A GOOD ANSWER");
  reply = JSON.stringify({ findings: [] });
  await page.click("#nqGo");
  await page.waitForTimeout(2000);
  const none = await page.locator("#nqOut").innerText();
  check("nothing found says how much was read",
    /passages about/i.test(none) && /\d/.test(none), none.slice(0, 200));

  /* ---------- the model failing must not break the page ---------- */
  section("WHEN THE REQUEST FAILS");
  reply = "not json at all, and not a finding either";
  await page.click("#nqGo");
  await page.waitForTimeout(2000);
  check("an unparseable answer is handled quietly",
    (await page.locator("#nqOut").innerText()).length > 0);
  check("  and the page still works", await page.locator("#nqGo").isEnabled());

  results.push("\nJS errors during the run: " + (errors.length ? errors.join(" | ") : "none"));
  if (errors.length) fail += errors.length;

  console.log(results.join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
