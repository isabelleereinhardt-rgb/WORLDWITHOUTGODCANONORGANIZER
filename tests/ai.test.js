/* Verifies the request ai.js now builds: history rides along sanitised,
   the system prompt carries standing instructions and the persona, and
   the provider body shapes stay valid for Anthropic and OpenAI. */
"use strict";
const fs = require("fs");
const path = require("path");
global.window = globalThis;

// localStorage stub
const bag = {};
global.localStorage = {
  getItem: k => (k in bag ? bag[k] : null),
  setItem: (k, v) => { bag[k] = String(v); },
  removeItem: k => { delete bag[k]; },
};
// the settings + persona surfaces ai.js consults
window.CodexExtra = { settings: { aiInstr: "Prefer my own terminology.", aiVoice: true } };
window.CodexLucky = {
  name: () => "Lucky",
  persona: () => ({ name: "Scholar", moodLine: "He has read your canon twice and has notes." }),
};

let captured = null;
global.fetch = async (url, init) => {
  captured = { url, init, body: JSON.parse(init.body) };
  return {
    ok: true, status: 200,
    text: async () => JSON.stringify({ content: [{ text: "ready." }] }),
  };
};

eval(fs.readFileSync(path.join(__dirname, "../site/js/ai.js"), "utf8"));
const AI = window.CodexAI;

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (extra ? " :: " + JSON.stringify(extra) : "")); }
};

(async () => {
  AI.setConf({ mode: "api", provider: "anthropic", model: "claude-sonnet-4-5", key: "sk-ant-test" });
  check("on()", AI.on() === true);

  const entries = [{ title: "Amara", category: "Characters", text: "Amara is the last archivist." }];
  const history = [
    { role: "user", content: "who is Amara?" },
    { role: "assistant", content: "Amara is the last archivist of Karyth." },
    { role: "user", content: "dangling user turn that must be dropped" },
  ];
  const r = await AI.ask("where is she from?", entries, { history, length: "full" });
  check("ask ok", r.ok === true, r);
  const b = captured.body;
  check("anthropic shape", b.model === "claude-sonnet-4-5" && typeof b.system === "string" && Array.isArray(b.messages));
  check("system: grounding", /Answer ONLY from the passages/.test(b.system));
  check("system: opinions allowed", /your reading rather than established canon/.test(b.system));
  check("system: persona", /Lucky, a cat archivist.*Scholar/.test(b.system), b.system);
  check("system: standing instructions", /Prefer my own terminology\./.test(b.system));
  check("system: full length", /be thorough/.test(b.system));
  check("full length raises tokens", b.max_tokens >= 2400, b.max_tokens);
  check("history rides along", b.messages.length === 3 &&
    b.messages[0].role === "user" && b.messages[1].role === "assistant" && b.messages[2].role === "user",
    b.messages.map(m => m.role));
  check("dangling user turn dropped", !/dangling/.test(JSON.stringify(b.messages.slice(0, -1))));
  check("passages in final turn", /PASSAGES FROM MY ENTRIES/.test(b.messages[2].content) &&
    /where is she from\?/.test(b.messages[2].content));
  check("alternation after merge", (() => {
    const msgs = b.messages;
    for (let i = 1; i < msgs.length; i++) if (msgs[i].role === msgs[i - 1].role) return false;
    return true;
  })());

  // voice off strips the persona but keeps the rest
  window.CodexExtra.settings.aiVoice = false;
  await AI.ask("test", entries, {});
  check("voice off: no persona", !/cat archivist/.test(captured.body.system));
  check("voice off: instructions stay", /Prefer my own terminology/.test(captured.body.system));
  check("brief keeps concise line", /Be concise/.test(captured.body.system));

  // openai body shape
  AI.setConf({ provider: "openai", model: "gpt-4.1", key: "sk-test" });
  await AI.ask("test", entries, { history: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] });
  const ob = captured.body;
  check("openai shape", ob.messages[0].role === "system" && ob.messages[ob.messages.length - 1].role === "user",
    ob.messages.map(m => m.role));
  check("openai history present", ob.messages.some(m => m.role === "assistant" && m.content === "b"));

  // messy history: consecutive same-role turns get merged
  await AI.ask("test", entries, { history: [
    { role: "assistant", content: "orphan lead" },
    { role: "user", content: "one" }, { role: "user", content: "two" },
    { role: "assistant", content: "three" },
  ] });
  const mb = captured.body.messages.filter(m => m.role !== "system");
  check("merge consecutive users", mb[0].role === "user" && /one\ntwo/.test(mb[0].content), mb);
  check("drop leading assistant", !/orphan lead/.test(JSON.stringify(mb)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
