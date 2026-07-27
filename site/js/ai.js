/* ============================================================
   THE AI LAYER; on device by default, your own API key by choice

   Two ways to get an answer, and the app is never vague about which
   one you are getting:

   "device"  Everything the assistant already does: it searches your
             entries, pulls the passages that match, and assembles an
             answer from your own words. No request leaves the browser.
             This is the default and always will be.

   "api"     The same retrieval happens first; that part does not
             change; and the passages it found are then sent to a model
             you pay for, with your question, so the answer can be
             reasoned and written rather than assembled. This is off
             until you switch it on and paste a key.

   Three things this file is careful about, because they are the ones
   that would hurt if got wrong:

   1. THE KEY NEVER LEAVES THIS DEVICE. It lives in its own localStorage
      entry, is never written into the settings object, is never put in a
      store, and is deliberately excluded from backups; a backup file
      you email yourself must not carry a live credential.
   2. THE UI NEVER LIES ABOUT WHERE AN ANSWER CAME FROM. The chip in the
      rail names the actual model when this is on, and the grounding line
      says what was sent.
   3. A FAILED REQUEST FALLS BACK. If the provider is down, out of
      credit, or the key is wrong, you get the on-device answer and a
      plain explanation, never an error where an answer should be.
   ============================================================ */
(function () {
"use strict";

const KEY = "codex.ai";          // its own key, never merged into settings

const PROVIDERS = {
  anthropic: {
    label: "Anthropic",
    models: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
    base: "https://api.anthropic.com/v1/messages",
    keyHint: "sk-ant-…",
    /* Anthropic needs an explicit opt-in header before a browser is
       allowed to call it directly; without it the request is refused by
       CORS and looks, unhelpfully, like a network error. */
    headers: k => ({
      "content-type": "application/json",
      "x-api-key": k,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    }),
    body: (model, system, user, maxTokens) => ({
      model, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: user }],
    }),
    read: j => (j && j.content && j.content.map(c => c.text || "").join("").trim()) || "",
    error: j => (j && j.error && j.error.message) || "",
  },
  openai: {
    label: "OpenAI",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o"],
    base: "https://api.openai.com/v1/chat/completions",
    keyHint: "sk-…",
    headers: k => ({ "content-type": "application/json", authorization: "Bearer " + k }),
    body: (model, system, user, maxTokens) => ({
      model, max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    read: j => (j && j.choices && j.choices[0] && j.choices[0].message &&
      String(j.choices[0].message.content || "").trim()) || "",
    error: j => (j && j.error && j.error.message) || "",
  },
  /* Anything that speaks the OpenAI shape: a proxy, a company gateway,
     or a model running on your own machine through Ollama or LM Studio.
     Useful in its own right, and the only way to try this offline. */
  custom: {
    label: "Custom endpoint",
    models: [],
    base: "",
    keyHint: "optional",
    headers: k => Object.assign({ "content-type": "application/json" },
      k ? { authorization: "Bearer " + k } : {}),
    body: (model, system, user, maxTokens) => ({
      model, max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    read: j => {
      if (!j) return "";
      if (j.choices && j.choices[0]) {
        const m = j.choices[0].message || j.choices[0];
        return String((m && (m.content || m.text)) || "").trim();
      }
      if (j.content && j.content.map) return j.content.map(c => c.text || "").join("").trim();
      return String(j.text || j.output || "").trim();
    },
    error: j => (j && ((j.error && (j.error.message || j.error)) || j.message)) || "",
  },
};

const DEF = {
  mode: "device",            // "device" | "api"
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  base: "",                  // blank means the provider's own endpoint
  key: "",
  maxTokens: 1200,
  // how many of your entries may be sent as context for one question
  contextEntries: 6,
  contextChars: 2400,        // per entry, so one huge PDF can't crowd out the rest
};

function conf() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { raw = {}; }
  const out = Object.assign({}, DEF, typeof raw === "object" ? raw : {});
  if (!PROVIDERS[out.provider]) out.provider = DEF.provider;
  out.mode = out.mode === "api" ? "api" : "device";
  out.maxTokens = Math.max(200, Math.min(8000, Number(out.maxTokens) || DEF.maxTokens));
  out.contextEntries = Math.max(1, Math.min(24, Number(out.contextEntries) || DEF.contextEntries));
  return out;
}
function setConf(patch) {
  const next = Object.assign(conf(), patch || {});
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
function clearKey() { setConf({ key: "", mode: "device" }); }

/* "on" means: the user asked for it AND there is something to call with.
   A mode of "api" with no key is not on; it is a half-finished setup, and
   pretending otherwise would produce a confusing failure on every ask. */
function on() {
  const c = conf();
  if (c.mode !== "api") return false;
  const p = PROVIDERS[c.provider];
  const endpoint = c.base || (p && p.base);
  if (!endpoint) return false;
  return !!(c.key || c.provider === "custom");
}
function state() {
  const c = conf();
  const p = PROVIDERS[c.provider] || {};
  return {
    mode: c.mode, on: on(), provider: c.provider, providerLabel: p.label || c.provider,
    model: c.model, base: c.base || p.base || "", hasKey: !!c.key,
  };
}
/* what the rail chip should say; never "On device" when it isn't */
function label() {
  const s = state();
  if (!s.on) return "On device";
  return s.model || s.providerLabel;
}

/* ---------- the prompt ----------
   The model is given your passages and told, in as few words as leave no
   room for interpretation, that they are the only source. It is asked to
   say so when they do not answer the question, because a confident
   invention about your own canon is worse than an admission. */
const SYSTEM = [
  "You are a careful archivist for one writer's fictional world.",
  "Answer ONLY from the passages given to you below. They are the writer's own notes and manuscripts.",
  "If the passages do not contain the answer, say plainly that this is not established in the entries yet, and stop. Do not invent names, dates, relationships, or events.",
  "Do not add lore. Do not guess. Do not fill gaps with genre convention.",
  "Refer to entries by their titles when it helps the writer find them.",
  "Write in clear prose, British spelling, no bullet lists unless the question is a list.",
  "Be concise: a short paragraph or two unless asked for more.",
].join(" ");

function buildContext(entries, perEntry) {
  return entries.map((e, i) => {
    const body = String(e.text || e.body || "").replace(/\s+/g, " ").trim().slice(0, perEntry);
    return `[${i + 1}] ${e.title || "Untitled"} (${e.category || "unfiled"})\n${body}`;
  }).join("\n\n---\n\n");
}

/* ---------- one question ----------
   `entries` is what the local search already decided was relevant, so the
   API path is grounded in exactly the same retrieval as the device path.
   Resolves to { ok, text, why } and never throws. */
async function ask(question, entries, opts) {
  opts = opts || {};
  const c = conf();
  if (!on()) return { ok: false, text: "", why: "The assistant is set to answer on this device." };

  const p = PROVIDERS[c.provider];
  const endpoint = c.base || p.base;
  const use = (entries || []).slice(0, c.contextEntries);
  if (!use.length) {
    return { ok: false, text: "", why: "Nothing in your entries matched, so there was nothing to send." };
  }

  const ctx = buildContext(use, c.contextChars);
  const user = `PASSAGES FROM MY ENTRIES\n\n${ctx}\n\n---\n\nMY QUESTION: ${question}`;

  // A hung request must not leave a spinner forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 45000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: p.headers(c.key),
      body: JSON.stringify(p.body(c.model, SYSTEM, user, c.maxTokens)),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let json = null;
    try { json = JSON.parse(raw); } catch (e) {}
    if (!res.ok) {
      const msg = (json && p.error(json)) || raw.slice(0, 200) || ("HTTP " + res.status);
      return { ok: false, text: "", why: friendly(res.status, msg), sent: use.length };
    }
    const text = p.read(json);
    if (!text) return { ok: false, text: "", why: "The provider replied without any text.", sent: use.length };
    return { ok: true, text, sent: use.length, model: c.model };
  } catch (e) {
    const why = e && e.name === "AbortError"
      ? "The provider did not answer in time."
      : "Could not reach the provider. " + ((e && e.message) || "");
    return { ok: false, text: "", why, sent: use.length };
  } finally {
    clearTimeout(timer);
  }
}

/* turn the common HTTP failures into something a person can act on */
function friendly(status, msg) {
  if (status === 401 || status === 403) return "The provider refused the key. Check it in Settings, Assistant.";
  if (status === 404) return "That model name was not found at this provider.";
  if (status === 429) return "The provider is rate limiting, or the account is out of credit.";
  if (status >= 500) return "The provider is having trouble at its end.";
  return msg || ("The provider returned " + status + ".");
}

/* A one-shot check the Settings panel can run, so a wrong key is found
   when you paste it rather than the next time you ask a question. */
async function test() {
  if (!on()) return { ok: false, why: "Switch it on and paste a key first." };
  const r = await ask("Reply with the single word: ready.",
    [{ title: "Test", category: "test", text: "This is a connection test." }], { timeout: 20000 });
  return r.ok ? { ok: true, text: r.text } : { ok: false, why: r.why };
}

window.CodexAI = {
  PROVIDERS, conf, setConf, clearKey, on, state, label, ask, test,
  // named so the backup code can be explicit about what it is skipping
  STORAGE_KEY: KEY,
};
})();
