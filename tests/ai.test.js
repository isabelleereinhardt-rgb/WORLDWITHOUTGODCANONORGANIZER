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
  check("system: grounding", /Answer only from the passages/.test(b.system));
  check("system: never splice two passages into one claim",
    /Never combine words from two different passages/.test(b.system));
  check("system: never shorten a proper noun",
    /never .Vane./.test(b.system), b.system.slice(0, 200));
  check("system: contradictions outrank everything else",
    /CONTRADICTIONS\. This rule outranks every other instruction/.test(b.system));
  check("system: say what was looked for when nothing is found",
    /which name or term you looked for/.test(b.system));
  check("system: opinions allowed", /your reading rather than established canon/.test(b.system));
  check("system: persona", /Lucky, a cat archivist.*Scholar/.test(b.system), b.system);
  check("system: standing instructions", /Prefer my own terminology\./.test(b.system));
  check("system: full length", /be thorough/.test(b.system));
  check("full length raises tokens", b.max_tokens >= 2400, b.max_tokens);
  check("history rides along", b.messages.length === 3 &&
    b.messages[0].role === "user" && b.messages[1].role === "assistant" && b.messages[2].role === "user",
    b.messages.map(m => m.role));
  check("dangling user turn dropped", !/dangling/.test(JSON.stringify(b.messages.slice(0, -1))));
  check("passages in final turn", /<canon>/.test(b.messages[2].content) &&
    /where is she from\?/.test(b.messages[2].content));
  check("  each passage names the entry it came from",
    /<passage n="1" entry="Amara"/.test(b.messages[2].content), b.messages[2].content.slice(0, 200));
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

  /* ---------- what the model is told about disagreements ----------
     The prompt obliges it to report a contradiction. This makes sure it
     is handed the ones already worked out, rather than being left to
     notice them for itself. */
  window.CodexContinuity = {
    canonConflicts: () => ([{
      id: "x:age", entityId: "x", name: "Amara", field: "age",
      claims: [{ value: "24", noteId: "e1", quote: "Age: 24" },
               { value: "51", noteId: "e2", quote: "was 51 years old" }],
    }]),
  };
  await AI.ask("how old is Amara?", [
    { id: "e1", title: "Amara", category: "Characters", text: "Amara\nAge: 24\nShe kept the archive." },
    { id: "e2", title: "The Burning", category: "My Notes", text: "Amara was 51 years old then." },
  ], {});
  /* Read the user turn, not the whole request: the system prompt names
     <known_conflicts> in the rule about it, so matching the body would
     pass whether or not any conflict was actually sent. */
  const lastTurn = b2 => b2.messages[b2.messages.length - 1].content;
  let sent = lastTurn(captured.body);
  check("conflicts already worked out are handed to the model", /known_conflicts/.test(sent), sent.slice(0, 300));
  check("  naming both answers", /24/.test(sent) && /51/.test(sent));
  check("  and the entries they came from", /The Burning/.test(sent));
  check("  marked unresolved, not decided", /unresolved/.test(sent));

  // an unrelated question must not drag every argument in the canon along
  await AI.ask("what is the weather like?", [
    { id: "e9", title: "Weather", category: "My Notes", text: "It rains in the north." },
  ], {});
  check("a question about something else carries no conflicts",
    !/known_conflicts/.test(lastTurn(captured.body)), lastTurn(captured.body).slice(0, 200));
  delete window.CodexContinuity;

  /* ---------- passages cut at a paragraph, not a character ---------- */
  const long = "First paragraph, whole and complete.\n\nSecond paragraph, also whole.\n\n" + "x".repeat(4000);
  await AI.ask("anything?", [{ id: "L", title: "Long", category: "My Notes", text: long }], {});
  const body = captured.body.messages[captured.body.messages.length - 1].content;
  check("a long entry keeps whole paragraphs", /First paragraph, whole and complete\./.test(body));
  check("  and says how much was left out", /truncated=/.test(body), body.slice(0, 260));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
