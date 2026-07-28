/* Reading scanned pages through Google Cloud Vision, checked without
   touching the network. `fetch` is stubbed, so this asserts on the exact
   request built, on where the returned text is put back, and — the part
   that matters most — on the counting that stops the free allowance
   being overspent without anyone noticing. */
"use strict";
const fs = require("fs");
const path = require("path");

global.window = globalThis;
const bag = {};
global.localStorage = {
  getItem: k => (k in bag ? bag[k] : null),
  setItem: (k, v) => { bag[k] = String(v); },
  removeItem: k => { delete bag[k]; },
  get length() { return Object.keys(bag).length; },
  key: i => Object.keys(bag)[i],
};

let calls = [];
let mode = "ok";                 // ok | badkey | disabled | boom | empty
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body, headers: init.headers });
  if (mode === "badkey") {
    return { ok: false, status: 400, text: async () => JSON.stringify(
      { error: { message: "API key not valid. Please pass a valid API key." } }) };
  }
  if (mode === "disabled") {
    return { ok: false, status: 403, text: async () => JSON.stringify(
      { error: { message: "Cloud Vision API has not been used in project 12 before or it is disabled." } }) };
  }
  if (mode === "boom") throw new Error("network down");
  return { ok: true, status: 200, text: async () => JSON.stringify({
    responses: body.requests.map((_, i) =>
      mode === "empty" ? {} : { fullTextAnnotation: { text: "page text " + i } }),
  }) };
};

eval(fs.readFileSync(path.join(__dirname, "../site/js/ocr.js"), "utf8"));
const OCR = window.CodexOCR;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (detail !== undefined ? " :: " + JSON.stringify(detail) : "")); }
};
const img = n => "data:image/jpeg;base64," + Buffer.from("x".repeat(n || 40)).toString("base64");
const pagesOf = n => Array.from({ length: n }, (_, i) => ({ at: i, image: img() }));
const fresh = (patch) => {
  Object.keys(bag).forEach(k => delete bag[k]);
  OCR.setConf(Object.assign({ on: true, key: "AIzaTEST" }, patch || {}));
  calls = [];
};

(async () => {

  /* ---------- which pages even need reading ---------- */
  check("a page with prose on it is left alone",
    !OCR.looksUnread("Enyokia stood at the gate and would not move aside for anyone."));
  check("a page with nothing on it is offered up", OCR.looksUnread(""));
  check("a scan yielding a page number only is offered up", OCR.looksUnread("   14 "));
  check("punctuation is not text", OCR.looksUnread("— . , ‘ ’ · —"));

  /* ---------- off by default ---------- */
  fresh({ on: false });
  check("off until switched on", !OCR.configured());
  let r = await OCR.read(pagesOf(2));
  check("  and reads nothing while off", !r.ok && !calls.length, r.why);
  fresh({ key: "" });
  check("switched on but keyless is still not configured", !OCR.configured());

  /* ---------- the request ---------- */
  fresh();
  check("switched on with a key is configured", OCR.configured());
  r = await OCR.read(pagesOf(3));
  check("it answered", r.ok, r.why);
  check("  the key travels in the query, not a header",
    /[?&]key=AIzaTEST/.test(calls[0].url) &&
    !Object.keys(calls[0].headers).some(h => /^authorization$/i.test(h)),
    { url: calls[0].url, headers: calls[0].headers });
  check("  it asks for dense document text, not a caption",
    calls[0].body.requests[0].features[0].type === "DOCUMENT_TEXT_DETECTION",
    calls[0].body.requests[0].features);
  check("  the data: prefix is stripped before sending",
    !/^data:/.test(calls[0].body.requests[0].image.content),
    calls[0].body.requests[0].image.content.slice(0, 20));

  /* ---------- the text goes back where it came from ---------- */
  fresh();
  r = await OCR.read([{ at: 7, image: img() }, { at: 2, image: img() }]);
  check("each page keeps the position it came from",
    r.results.length === 2 && r.results.some(x => x.at === 7) && r.results.some(x => x.at === 2),
    r.results);

  /* ---------- batching ---------- */
  fresh();
  r = await OCR.read(pagesOf(9));
  check("a long document is sent in batches, not one huge request",
    calls.length > 1 && calls.every(c => c.body.requests.length <= 8),
    calls.map(c => c.body.requests.length));
  check("  and every page still comes back", r.results.length === 9, r.results.length);

  /* ---------- the money ---------- */
  fresh();
  await OCR.read(pagesOf(5));
  check("pages read are counted against the allowance", OCR.usage().used === 5, OCR.usage());
  fresh();
  mode = "empty";
  await OCR.read(pagesOf(4));
  check("a page Google found nothing on is still counted, because it is still billed",
    OCR.usage().used === 4, OCR.usage());
  mode = "ok";

  fresh({ used: 998 });
  r = await OCR.read(pagesOf(5));
  check("a job that would overrun the allowance is refused, not silently trimmed",
    !r.ok && !calls.length && /only 2 are left/.test(r.why), r.why);
  check("  and nothing was spent declining it", OCR.usage().used === 998, OCR.usage());

  fresh({ used: 1000 });
  r = await OCR.read(pagesOf(1));
  check("at the line it stops and says so", !r.ok && /allowance/.test(r.why), r.why);

  fresh({ used: 400, cap: 5000 });
  r = await OCR.read(pagesOf(3));
  check("raising the limit past the free tier is honoured", r.ok && OCR.usage().used === 403, OCR.usage());

  fresh({ used: 900 });
  OCR.setConf({ month: "1999-01" });
  check("a new month restores the whole allowance", OCR.usage().used === 0, OCR.usage());

  /* ---------- when it goes wrong ---------- */
  fresh();
  mode = "badkey";
  r = await OCR.read(pagesOf(2));
  check("a bad key is explained in words, not a status code",
    !r.ok && /refused/i.test(r.why) && !/^\d/.test(r.why), r.why);
  check("  and a refused request costs nothing", OCR.usage().used === 0, OCR.usage());

  fresh();
  mode = "disabled";
  r = await OCR.read(pagesOf(2));
  check("an API that was never switched on says which switch to find",
    !r.ok && /not switched on|Google Cloud console/i.test(r.why), r.why);

  fresh();
  mode = "boom";
  r = await OCR.read(pagesOf(2));
  check("a dead network fails softly", !r.ok && /Could not reach/i.test(r.why), r.why);

  /* A failure halfway through must keep what was already read and paid
     for; throwing it away would charge for pages twice. */
  fresh();
  let n = 0;
  mode = "ok";
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    n++;
    if (n > 1) return { ok: false, status: 500, text: async () => "{}" };
    return realFetch(url, init);
  };
  r = await OCR.read(pagesOf(8));
  check("a failure part-way keeps the pages already read",
    !r.ok && r.results.length > 0, { ok: r.ok, got: r.results.length, why: r.why });
  check("  and counts only the pages actually sent",
    OCR.usage().used > 0 && OCR.usage().used < 8, OCR.usage());
  global.fetch = realFetch;

  /* ---------- an oversized page ---------- */
  fresh();
  mode = "ok";
  r = await OCR.read([{ at: 0, image: img() }, { at: 1, image: "data:image/jpeg;base64," + "A".repeat(8e6) }]);
  check("a page too big to send is skipped, not fatal",
    r.ok && r.results.length === 1 && r.oversize === 1, { n: r.results.length, over: r.oversize });

  /* ---------- the connection test ---------- */
  fresh();
  const t = await OCR.test();
  check("the test says plainly that it worked", t.ok && /Google answered/.test(t.why), t.why);
  check("  and admits it cost one page", OCR.usage().used === 1, OCR.usage());
  fresh({ key: "" });
  const t2 = await OCR.test();
  check("the test asks for a key before spending anything", !t2.ok && /Paste a key/.test(t2.why), t2.why);

  console.log("");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
