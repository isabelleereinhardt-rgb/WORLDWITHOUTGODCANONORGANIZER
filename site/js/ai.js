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
    body: (model, system, messages, maxTokens) => ({
      model, max_tokens: maxTokens, system, messages,
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
    body: (model, system, messages, maxTokens) => ({
      model, max_tokens: maxTokens,
      messages: [{ role: "system", content: system }].concat(messages),
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
    body: (model, system, messages, maxTokens) => ({
      model, max_tokens: maxTokens,
      messages: [{ role: "system", content: system }].concat(messages),
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
const SYSTEM_BASE = [
  "You are a careful archivist for one writer's fictional world.",
  "Answer ONLY from the passages given to you. They are the writer's own notes and manuscripts.",
  "If the passages do not contain the answer, say plainly that this is not established in the entries yet, and stop. Do not invent names, dates, relationships, or events.",
  "Do not add lore. Do not guess. Do not fill gaps with genre convention.",
  "If the writer asks for your opinion, a judgement, or a recommendation, you may give one; ground it in the passages, explain your reasoning, and make clear it is your reading rather than established canon.",
  "Refer to entries by their titles when it helps the writer find them.",
  "Write in clear prose, British spelling, no bullet lists unless the question is a list.",
].join(" ");

/* The persona is Lucky's chosen one, the same voice the on-device brain
   speaks with, so switching the model on does not change who you are
   talking to. It colours phrasing only; the grounding rules above always
   win. Switched off in Settings, this contributes nothing. */
function personaLine() {
  try {
    const s = window.CodexExtra && CodexExtra.settings;
    if (s && s.aiVoice === false) return "";
    const L = window.CodexLucky;
    if (!L) return "";
    const p = L.persona();
    return "You have a light personality: you are " + L.name() + ", a cat archivist whose mood is \"" +
      p.name + "\" (" + p.moodLine + ") Let a small touch of that voice colour your answers; never let it change or obscure the facts.";
  } catch (e) { return ""; }
}

/* Standing instructions typed into Settings, Assistant. They used to be
   saved and then read by nothing; now every request carries them. */
function standingInstructions() {
  try {
    const s = window.CodexExtra && CodexExtra.settings;
    const t = s && String(s.aiInstr || "").trim();
    return t ? "The writer's standing instructions, which you should follow: " + t.slice(0, 1500) : "";
  } catch (e) { return ""; }
}

function systemFor(opts) {
  const parts = [SYSTEM_BASE];
  parts.push(opts && opts.length === "full"
    ? "The writer has asked for full answers: be thorough, and use everything relevant the passages hold."
    : "Be concise: a short paragraph or two unless asked for more.");
  const p = personaLine(); if (p) parts.push(p);
  const si = standingInstructions(); if (si) parts.push(si);
  return parts.join(" ");
}

function buildContext(entries, perEntry) {
  return entries.map((e, i) => {
    const body = String(e.text || e.body || "").replace(/\s+/g, " ").trim().slice(0, perEntry);
    return `[${i + 1}] ${e.title || "Untitled"} (${e.category || "unfiled"})\n${body}`;
  }).join("\n\n---\n\n");
}

/* Earlier turns of the conversation, sanitised: only user/assistant
   roles, capped in length, and consecutive same-role turns merged;
   Anthropic requires strict alternation and the others tolerate it. */
function cleanHistory(history) {
  const rows = [];
  (Array.isArray(history) ? history : []).forEach(m => {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return;
    const content = String(m.content || "").trim().slice(0, 4000);
    if (!content) return;
    const last = rows[rows.length - 1];
    if (last && last.role === m.role) last.content += "\n" + content;
    else rows.push({ role: m.role, content });
  });
  // the transcript must end just before the new user turn
  while (rows.length && rows[rows.length - 1].role === "user") rows.pop();
  while (rows.length && rows[0].role === "assistant") rows.shift();
  return rows.slice(-8);
}

/* ---------- one question ----------
   `entries` is what the local search already decided was relevant, so the
   API path is grounded in exactly the same retrieval as the device path.
   opts.history carries the earlier turns of this thread (plain text, no
   passages; the passages ride with the current question only, so a long
   conversation does not multiply the bill). opts.length is the rail's
   Brief/Full chip. Resolves to { ok, text, why } and never throws. */
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
  const messages = cleanHistory(opts.history).concat([{ role: "user", content: user }]);
  // a full-length answer needs room; a brief one should not pay for it
  const maxTokens = opts.length === "full" ? Math.min(8000, Math.max(c.maxTokens, 2400)) : c.maxTokens;

  // A hung request must not leave a spinner forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 45000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: p.headers(c.key),
      body: JSON.stringify(p.body(c.model, systemFor(opts), messages, maxTokens)),
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
