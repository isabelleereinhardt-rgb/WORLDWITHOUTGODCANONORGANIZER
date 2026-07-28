/* Every provider preset, checked without touching the network.
   `fetch` is stubbed, so this asserts on the exact request each one
   builds: the URL it goes to, the headers it carries, and the body
   shape, which differs between Anthropic, OpenAI and Gemini. */
"use strict";
const fs = require("fs");
const path = require("path");

global.window = globalThis;
const bag = {};
global.localStorage = {
  getItem: k => (k in bag ? bag[k] : null),
  setItem: (k, v) => { bag[k] = String(v); },
  removeItem: k => { delete bag[k]; },
};
window.CodexExtra = { settings: {} };

let captured = null;
let reply = { content: [{ text: "ok" }], choices: [{ message: { content: "ok" } }],
  candidates: [{ content: { parts: [{ text: "ok" }] } }] };
let status = 200;
global.fetch = async (url, init) => {
  captured = { url, init, body: init && init.body ? JSON.parse(init.body) : null };
  return { ok: status < 400, status, text: async () => JSON.stringify(reply) };
};

eval(fs.readFileSync(path.join(__dirname, "../site/js/ai.js"), "utf8"));
const AI = window.CodexAI;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (detail !== undefined ? " :: " + JSON.stringify(detail) : "")); }
};

const ENTRIES = [{ title: "Amara", category: "Characters", text: "Amara is the last archivist." }];
const HISTORY = [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }];

(async () => {
  const ids = Object.keys(AI.PROVIDERS);
  check("nine providers offered (" + ids.length + ")", ids.length >= 9, ids);

  // ---- every provider builds a request that goes somewhere sensible ----
  for (const id of ids) {
    const p = AI.PROVIDERS[id];
    AI.setConf({ mode: "api", provider: id, model: p.models[0] || "test-model",
      key: p.local ? "" : "test-key", base: p.base ? "" : "http://localhost:9999/v1/chat/completions" });

    check(id + ": reports connected", AI.on() === true, AI.state());

    const r = await AI.ask("who is Amara?", ENTRIES, { history: HISTORY });
    check(id + ": request succeeds", r.ok === true, r.why);
    check(id + ": went to a real URL", /^https?:\/\//.test(captured.url), captured.url);
    check(id + ": carries the passages",
      /PASSAGES FROM MY ENTRIES/.test(JSON.stringify(captured.body)));
    check(id + ": carries the grounding rule",
      /Answer ONLY from the passages/.test(JSON.stringify(captured.body)));
  }

  // ---- shape-specific expectations ----
  AI.setConf({ mode: "api", provider: "anthropic", model: "claude-sonnet-4-5", key: "sk-ant-x", base: "" });
  await AI.ask("q", ENTRIES, {});
  check("anthropic: system is its own field", typeof captured.body.system === "string");
  check("anthropic: browser opt-in header present",
    captured.init.headers["anthropic-dangerous-direct-browser-access"] === "true");

  AI.setConf({ mode: "api", provider: "google", model: "gemini-2.0-flash", key: "AIzaTest", base: "" });
  await AI.ask("q", ENTRIES, { history: HISTORY });
  check("gemini: model goes in the URL", /models\/gemini-2\.0-flash:generateContent$/.test(captured.url), captured.url);
  check("gemini: key travels as a header, not a query string",
    captured.init.headers["x-goog-api-key"] === "AIzaTest" && !/key=/.test(captured.url), captured.url);
  check("gemini: systemInstruction field used", !!(captured.body.systemInstruction &&
    captured.body.systemInstruction.parts));
  check("gemini: assistant turns renamed to 'model'",
    captured.body.contents.some(c => c.role === "model"), captured.body.contents.map(c => c.role));
  check("gemini: no OpenAI-style messages array", captured.body.messages === undefined);

  AI.setConf({ mode: "api", provider: "groq", model: "llama-3.3-70b-versatile", key: "gsk_x", base: "" });
  await AI.ask("q", ENTRIES, {});
  check("groq: OpenAI shape with a system message", captured.body.messages[0].role === "system");
  check("groq: bearer auth", /Bearer gsk_x/.test(captured.init.headers.authorization));

  // ---- local providers need no key ----
  for (const id of ["ollama", "lmstudio"]) {
    bag["codex.ai"] = JSON.stringify({ mode: "api", provider: id, model: "llama3.2", key: "", base: "" });
    check(id + ": connects with NO key at all", AI.on() === true);
    const r = await AI.ask("q", ENTRIES, {});
    check(id + ": reaches localhost", /localhost/.test(captured.url), captured.url);
    check(id + ": sends no authorization header",
      !captured.init.headers.authorization, captured.init.headers);
    check(id + ": marked local in state", AI.state().local === true);
  }

  // a stale key from another provider must never travel to a local server
  bag["codex.ai"] = JSON.stringify({ mode: "api", provider: "ollama", model: "llama3.2",
    key: "sk-leftover-openai-key", base: "" });
  await AI.ask("q", ENTRIES, {});
  check("local NEVER forwards a leftover key",
    !captured.init.headers.authorization &&
    !/sk-leftover/.test(JSON.stringify(captured.init.headers)), captured.init.headers);
  const leftoverList = await AI.listModels();
  check("  discovery does not forward it either",
    !/sk-leftover/.test(JSON.stringify(captured.init.headers)), captured.init.headers);

  // a paid provider with no key must NOT report connected
  AI.setConf({ mode: "api", provider: "openai", model: "gpt-4.1", key: "", base: "" });
  check("paid provider without a key stays off", AI.on() === false);

  // ---- model discovery ----
  AI.setConf({ mode: "api", provider: "groq", model: "", key: "gsk_x", base: "" });
  reply = { data: [{ id: "llama-3.3-70b-versatile" }, { id: "llama-3.1-8b-instant" }] };
  let list = await AI.listModels();
  check("discovery: lists OpenAI-shaped models", list.ok && list.models.length === 2, list);
  check("discovery: asks the /models endpoint", /\/models$/.test(captured.url), captured.url);

  AI.setConf({ mode: "api", provider: "anthropic", model: "", key: "sk-ant-x", base: "" });
  reply = { data: [{ id: "claude-sonnet-4-5" }] };
  list = await AI.listModels();
  check("discovery: anthropic /v1/models", list.ok && /\/v1\/models$/.test(captured.url), captured.url);

  AI.setConf({ mode: "api", provider: "google", model: "", key: "AIzaTest", base: "" });
  reply = { models: [{ name: "models/gemini-2.0-flash" }, { name: "models/gemini-1.5-pro" }] };
  list = await AI.listModels();
  check("discovery: gemini strips the 'models/' prefix",
    list.ok && list.models.indexOf("gemini-2.0-flash") > -1, list);

  // a local server that is not running must explain itself usefully
  bag["codex.ai"] = JSON.stringify({ mode: "api", provider: "ollama", model: "x", key: "", base: "" });
  const boom = global.fetch;
  global.fetch = async () => { throw new Error("connect ECONNREFUSED"); };
  const dead = await AI.ask("q", ENTRIES, {});
  check("local down: says to check the server, not the internet",
    /local server is running/i.test(dead.why), dead.why);
  const deadList = await AI.listModels();
  check("local down: discovery says the same", /local server/i.test(deadList.why), deadList.why);
  global.fetch = boom;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
