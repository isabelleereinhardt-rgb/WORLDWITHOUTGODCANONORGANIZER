/* Answers arriving as they are written.

   `fetch` is stubbed with a real ReadableStream of server-sent frames,
   so this exercises the actual reader: frame splitting across arbitrary
   chunk boundaries, the three different delta shapes, mid-stream errors,
   and the rule that words already received are never thrown away. */
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

/* Serve a list of raw SSE chunks. They are handed over exactly as given,
   so a test can split a frame down the middle and prove the reader
   stitches it back together. */
let CHUNKS = [];
let STATUS = 200;
let BODYLESS = false;
let WHOLE = null;
let captured = null;
global.fetch = async (url, init) => {
  captured = { url, init, body: init && init.body ? JSON.parse(init.body) : null };
  if (STATUS >= 400) {
    return { ok: false, status: STATUS, text: async () => JSON.stringify({ error: { message: "nope" } }) };
  }
  if (BODYLESS) {   // a server that ignored the stream flag
    return { ok: true, status: 200, body: null, text: async () => JSON.stringify(WHOLE) };
  }
  const enc = new TextEncoder();
  const queue = CHUNKS.slice();
  const body = new ReadableStream({
    pull(controller) {
      if (!queue.length) { controller.close(); return; }
      controller.enqueue(enc.encode(queue.shift()));
    },
  });
  return { ok: true, status: 200, body, text: async () => "" };
};

eval(fs.readFileSync(path.join(__dirname, "../site/js/ai.js"), "utf8"));
const AI = window.CodexAI;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("PASS " + label); }
  else { fail++; console.log("FAIL " + label + (detail !== undefined ? " :: " + JSON.stringify(detail) : "")); }
};
const ENTRIES = [{ title: "Amara", category: "Characters", text: "Amara is the last archivist." }];
const sse = o => "data: " + JSON.stringify(o) + "\n\n";

(async () => {
  // ---------- OpenAI shape ----------
  AI.setConf({ mode: "api", provider: "openai", model: "gpt-4.1", key: "sk-x", base: "", stream: true });
  check("streaming reports available", AI.canStream() === true);

  CHUNKS = [
    sse({ choices: [{ delta: { content: "Amara " } }] }),
    sse({ choices: [{ delta: { content: "is the " } }] }),
    sse({ choices: [{ delta: { content: "last archivist." } }] }),
    "data: [DONE]\n\n",
  ];
  let seen = [];
  let r = await AI.askStream("who?", ENTRIES, {}, (piece, whole) => seen.push({ piece, whole }));
  check("openai: streams to completion", r.ok && r.text === "Amara is the last archivist.", r);
  check("  arrived in pieces, not one lump", seen.length === 3, seen.map(s => s.piece));
  check("  each callback carried the full text so far",
    seen[0].whole === "Amara " && seen[2].whole === "Amara is the last archivist.",
    seen.map(s => s.whole));
  check("  asked the provider to stream", captured.body.stream === true);

  // a frame split across chunk boundaries must still be understood
  const one = sse({ choices: [{ delta: { content: "Hello world" } }] });
  CHUNKS = [one.slice(0, 12), one.slice(12, 30), one.slice(30), "data: [DONE]\n\n"];
  seen = [];
  r = await AI.askStream("q", ENTRIES, {}, (p, w) => seen.push(p));
  check("openai: reassembles a frame split mid-way", r.ok && r.text === "Hello world", r);

  // several frames delivered in a single chunk
  CHUNKS = [
    sse({ choices: [{ delta: { content: "a" } }] }) +
    sse({ choices: [{ delta: { content: "b" } }] }) +
    sse({ choices: [{ delta: { content: "c" } }] }),
    "data: [DONE]\n\n",
  ];
  seen = [];
  r = await AI.askStream("q", ENTRIES, {}, p => seen.push(p));
  check("openai: several frames in one chunk", r.text === "abc" && seen.length === 3, seen);

  // ---------- Anthropic shape ----------
  AI.setConf({ mode: "api", provider: "anthropic", model: "claude-sonnet-4-5", key: "sk-ant-x", base: "" });
  CHUNKS = [
    "event: message_start\n" + sse({ type: "message_start" }),
    "event: content_block_delta\n" + sse({ type: "content_block_delta", delta: { type: "text_delta", text: "The " } }),
    "event: content_block_delta\n" + sse({ type: "content_block_delta", delta: { type: "text_delta", text: "archive." } }),
    "event: message_stop\n" + sse({ type: "message_stop" }),
  ];
  seen = [];
  r = await AI.askStream("q", ENTRIES, {}, p => seen.push(p));
  check("anthropic: reads content_block_delta", r.ok && r.text === "The archive.", r);
  check("  ignores the bookkeeping frames", seen.length === 2, seen);
  check("  asked to stream", captured.body.stream === true);

  // ---------- Gemini shape ----------
  AI.setConf({ mode: "api", provider: "google", model: "gemini-2.0-flash", key: "AIza", base: "" });
  CHUNKS = [
    sse({ candidates: [{ content: { parts: [{ text: "Karyth " }] } }] }),
    sse({ candidates: [{ content: { parts: [{ text: "stands." }] } }] }),
  ];
  seen = [];
  r = await AI.askStream("q", ENTRIES, {}, p => seen.push(p));
  check("gemini: reads candidate parts", r.ok && r.text === "Karyth stands.", r);
  check("  used the streaming verb in the URL",
    /:streamGenerateContent\?alt=sse$/.test(captured.url), captured.url);

  // ---------- things going wrong ----------
  AI.setConf({ mode: "api", provider: "openai", model: "gpt-4.1", key: "sk-x", base: "" });

  // a stream that dies after some words keeps the words
  CHUNKS = [sse({ choices: [{ delta: { content: "Half an ans" } }] })];
  const realFetch = global.fetch;
  global.fetch = async (u, i) => {
    captured = { url: u, init: i, body: JSON.parse(i.body) };
    const enc = new TextEncoder();
    let sent = false;
    return { ok: true, status: 200, body: new ReadableStream({
      pull(c) {
        if (!sent) { sent = true; c.enqueue(enc.encode(CHUNKS[0])); return; }
        c.error(new Error("connection reset"));
      },
    }) };
  };
  r = await AI.askStream("q", ENTRIES, {}, () => {});
  check("a broken stream keeps what arrived", r.ok === true && r.text === "Half an ans", r);
  check("  and says it was cut short", r.partial === true, r);
  global.fetch = realFetch;

  // an error frame arriving after a 200, before any words
  CHUNKS = [sse({ error: { message: "quota exceeded" } })];
  r = await AI.askStream("q", ENTRIES, {}, () => {});
  check("mid-stream error before any text is reported", r.ok === false && /quota/.test(r.why), r);

  // an HTTP error still reads like advice, not a status code
  STATUS = 401;
  r = await AI.askStream("q", ENTRIES, {}, () => {});
  check("401 while streaming explains the key", r.ok === false && /refused the key/i.test(r.why), r);
  STATUS = 200;

  // a server that ignored the stream flag and answered whole
  BODYLESS = true;
  WHOLE = { choices: [{ message: { content: "All at once." } }] };
  seen = [];
  r = await AI.askStream("q", ENTRIES, {}, (p, w) => seen.push(p));
  check("a non-streaming server still works", r.ok && r.text === "All at once.", r);
  check("  and its answer is delivered in one callback", seen.length === 1, seen);
  BODYLESS = false;

  // ---------- the switch ----------
  AI.setConf({ stream: false });
  check("turning it off disables streaming", AI.canStream() === false);
  CHUNKS = [sse({ choices: [{ delta: { content: "x" } }] }), "data: [DONE]\n\n"];
  BODYLESS = true;
  WHOLE = { choices: [{ message: { content: "Whole answer." } }] };
  r = await AI.askStream("q", ENTRIES, {}, () => {});
  check("  and askStream falls back to a normal request", r.ok && r.text === "Whole answer.", r);
  check("  which does not ask the provider to stream", !captured.body.stream, captured.body);
  BODYLESS = false;
  AI.setConf({ stream: true });

  // local providers stream too, without a key
  bag["codex.ai"] = JSON.stringify({ mode: "api", provider: "ollama", model: "llama3.2", key: "", base: "", stream: true });
  CHUNKS = [sse({ choices: [{ delta: { content: "local words" } }] }), "data: [DONE]\n\n"];
  r = await AI.askStream("q", ENTRIES, {}, () => {});
  check("a local model streams as well", r.ok && r.text === "local words", r);
  check("  still with no authorization header", !captured.init.headers.authorization, captured.init.headers);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
