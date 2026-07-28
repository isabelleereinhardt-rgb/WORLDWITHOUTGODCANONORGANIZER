/* ============================================================
   READING SCANNED PAGES  (Google Cloud Vision)

   A PDF made by scanning paper carries pictures of words, not words.
   pdf.js returns nothing for those pages, so until now a scanned
   chapter imported as a gallery of images with no text at all: invisible
   to search, to the name index, and to the assistant. You could look at
   it and not find it.

   This sends only those pages to Google Cloud Vision and puts the
   returned text back where it belongs in the document. Three things
   shape the design:

   Vision takes a plain API key, unlike Vertex AI which wants an OAuth
   token. A key can be used straight from a browser — Google's servers
   allow the cross-origin call and answer it — so there is no server to
   run and nothing to deploy. That is what makes this usable on a static
   site.

   The free allowance is 1,000 pages a calendar month. Silently spending
   somebody's money is the worst thing a feature like this can do, so
   usage is counted here, the count resets with the month, and a request
   that would cross the line is refused rather than trimmed quietly.

   And it is off until switched on. The rest of this app reads your
   writing without sending it anywhere; OCR cannot, so it asks first and
   says plainly what leaves the machine.
   ============================================================ */
(function () {
"use strict";

const KEY = "codex.ocr";
const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
/* Google's free allowance per calendar month. One page is one unit. */
const FREE_UNITS = 1000;
/* Pages per request. Vision permits sixteen, but each page is a JPEG
   inflated by a third again in base64, and a smaller batch means the
   progress line moves and a failure costs less. */
const BATCH = 4;
/* A single page bigger than this is not a page of prose. */
const MAX_B64 = 7 * 1024 * 1024;
/* A page with fewer real characters than this had no text layer worth
   having; a scan often yields a stray ligature or a page number. */
const THIN = 24;

const DEF = { on: false, key: "", cap: FREE_UNITS, used: 0, month: "" };

/* Deliberately not scoped per account, exactly like the model key. A
   credential belongs to the browser it was typed into, not to whoever
   is signed in; scoping it would also put an "@name" suffix on the key
   name, and the backup writer excludes secrets by name. */
function storeKey() { return KEY; }
function monthNow() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function conf() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(storeKey()) || "{}") || {}; } catch (e) { raw = {}; }
  const c = Object.assign({}, DEF, raw);
  // a new month is a new allowance; the old count is meaningless
  if (c.month !== monthNow()) { c.month = monthNow(); c.used = 0; }
  return c;
}
function setConf(patch) {
  const next = Object.assign(conf(), patch || {});
  try { localStorage.setItem(storeKey(), JSON.stringify(next)); } catch (e) {}
  return next;
}
function clearKey() { setConf({ key: "" }); }

function usage() {
  const c = conf();
  const cap = Number(c.cap) > 0 ? Number(c.cap) : FREE_UNITS;
  return { month: c.month, used: c.used, cap, left: Math.max(0, cap - c.used) };
}
function spend(n) { const c = conf(); setConf({ used: c.used + n }); }

function configured() { const c = conf(); return !!(c.on && c.key); }

/* Does this page need reading? Punctuation and stray marks do not count
   as text, so the test is on letters and digits alone. */
function looksUnread(text) {
  return String(text || "").replace(/[^A-Za-z0-9]/g, "").length < THIN;
}

/* ---------- talking to Vision ---------- */
function payloadOf(dataUrl) {
  const at = String(dataUrl || "").indexOf(",");
  return at < 0 ? "" : dataUrl.slice(at + 1);
}
function reasonFor(status, message) {
  if (status === 400 && /API key not valid/i.test(message || "")) {
    return "That key was refused. Check it was copied whole, and that it has no website restriction that excludes this page.";
  }
  if (status === 403 && /has not been used|is disabled/i.test(message || "")) {
    return "The Cloud Vision API is not switched on for that project yet. Enable it in the Google Cloud console, then try again.";
  }
  if (status === 403) return "Google refused the key. " + (message || "");
  if (status === 429) return "Google is rate-limiting the requests. Wait a minute and try again.";
  if (status >= 500) return "Google's side is having trouble (" + status + "). Nothing was charged; try again shortly.";
  return message || ("Vision answered " + status + ".");
}

async function annotate(images, signal) {
  const body = {
    requests: images.map(src => ({
      image: { content: payloadOf(src) },
      features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
    })),
  };
  const res = await fetch(ENDPOINT + "?key=" + encodeURIComponent(conf().key), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch (e) {}
  if (!res.ok) {
    const msg = (json && json.error && (json.error.message || json.error)) || raw.slice(0, 200);
    return { ok: false, why: reasonFor(res.status, String(msg)) };
  }
  const out = (json && json.responses) || [];
  return {
    ok: true,
    texts: images.map((_, i) => {
      const r = out[i];
      if (!r || r.error) return "";
      return String((r.fullTextAnnotation && r.fullTextAnnotation.text) || "").trim();
    }),
  };
}

/* ---------- read a set of pages ----------
   `pages` is [{ at, image }]; `at` is whatever the caller uses to put
   the text back, and is handed straight back untouched. */
async function read(pages, onProgress) {
  const list = (pages || []).filter(p => p && p.image);
  if (!list.length) return { ok: true, results: [], used: 0 };
  if (!configured()) return { ok: false, why: "Reading scans is switched off.", results: [], used: 0 };

  const room = usage().left;
  if (room <= 0) {
    return { ok: false, results: [], used: 0,
      why: "This month's free allowance of " + usage().cap + " pages is spent. It resets on the 1st; " +
           "you can raise the limit in Settings if you would rather pay for the rest." };
  }
  if (list.length > room) {
    return { ok: false, results: [], used: 0,
      why: "That needs " + list.length + " pages but only " + room + " are left of this month's free " +
           "allowance. Import a smaller piece, or raise the limit in Settings." };
  }

  const oversize = list.filter(p => p.image.length > MAX_B64).length;
  const usable = list.filter(p => p.image.length <= MAX_B64);
  const results = [];
  let used = 0;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    for (let i = 0; i < usable.length; i += BATCH) {
      const slice = usable.slice(i, i + BATCH);
      if (onProgress) onProgress(Math.min(i + slice.length, usable.length), usable.length);
      const r = await annotate(slice.map(p => p.image), ctrl.signal);
      if (!r.ok) {
        /* Whatever came back before the failure is still worth keeping,
           and it has already been paid for. */
        if (used) spend(used);
        return { ok: false, why: r.why, results, used };
      }
      /* Google bills for every page it looked at, including the ones it
         found nothing on, so the count follows the request and not the
         result. */
      used += slice.length;
      slice.forEach((p, k) => { if (r.texts[k]) results.push({ at: p.at, text: r.texts[k] }); });
    }
  } catch (e) {
    if (used) spend(used);
    return { ok: false, results, used,
      why: (e && e.name === "AbortError")
        ? "Reading the scans took too long and was stopped."
        : "Could not reach Google Cloud Vision. " + ((e && e.message) || "") };
  } finally { clearTimeout(timer); }

  if (used) spend(used);
  return { ok: true, results, used, oversize };
}

/* One tiny image, to prove the key works before a real import leans on
   it. Costs a single unit, which is the honest price of certainty. */
async function test() {
  const c = conf();
  if (!c.key) return { ok: false, why: "Paste a key first." };
  const dot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  try {
    const r = await annotate([dot]);
    if (!r.ok) return { ok: false, why: r.why };
    spend(1);
    return { ok: true, why: "Google answered. Scanned pages will be read on import." };
  } catch (e) {
    return { ok: false, why: "Could not reach Google Cloud Vision. " + ((e && e.message) || "") };
  }
}

window.CodexOCR = {
  conf, setConf, clearKey, usage, configured, looksUnread, read, test,
  FREE_UNITS,
  // named so the backup code can be explicit about what it is skipping
  STORAGE_KEY: KEY,
};
})();
