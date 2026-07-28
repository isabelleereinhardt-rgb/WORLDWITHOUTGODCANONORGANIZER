/* ============================================================
   THINGS THE ASSISTANT CAN DO, not just say

   Up to here the assistant could read your canon and answer questions
   about it. This file lets it act on the workspace: make a note, add a
   task, start a document, file something into a section, draft a page
   from what your own entries already say, open a page for you.

   Three rules run through all of it, and they are the reason this is a
   separate file rather than a handful of if-statements in the rail:

   1. EVERY ACTION IS REAL AND REVERSIBLE. Each one writes to the same
      stores the rest of the app writes to, and each one hands back an
      undo. Nothing here is a simulation of doing the thing.
   2. NOTHING IS DESTROYED. There is no delete action, by design. The
      assistant can create and file; removing things stays a deliberate
      act you perform yourself, where the confirmation lives.
   3. WHO ASKED DECIDES HOW IT RUNS. When YOU type "add a task: ...",
      the intent is unambiguous, so it runs at once and offers an undo.
      When a MODEL proposes an action, it is shown as a proposal with a
      button, because a model is a guess about your intent and a wrong
      guess should cost a glance, not a cleanup.

   The same catalogue serves both paths, so a model can never invoke
   anything you could not have typed yourself.
   ============================================================ */
(function () {
"use strict";

const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uid = p => (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const C = () => window.Codex;
const S = () => window.CodexStore;

/* ---------- where "open X" can go ---------- */
const PLACES = [
  [/\b(desk|home|dashboard)\b/i, "#/", "the Desk"],
  [/\b(tasks?|to-?dos?)\b/i, "#/tasks", "Tasks"],
  [/\b(documents?|books?|manuscripts?)\b/i, "#/docs", "Books"],
  [/\b(timelines?)\b/i, "#/timeline", "the Timeline"],
  [/\b(atlas|maps?)\b/i, "#/maps", "the Atlas"],
  [/\b(name index|index)\b/i, "#/index", "the Name Index"],
  [/\b(settings?|preferences?|options?)\b/i, "#/settings", "Settings"],
  [/\b(activity|feed)\b/i, "#/feed", "Activity"],
  [/\b(help)\b/i, "#/help", "Help"],
  [/\b(add lore|import)\b/i, "#/import", "Add Lore"],
  [/\b(mind ?maps?)\b/i, "#/mindmaps", "Mind Maps"],
  [/\b(sheets?|spreadsheets?)\b/i, "#/sheets", "Sheets"],
  [/\b(canvas|canvases)\b/i, "#/canvases", "Canvases"],
  [/\b(flashcards?|quiz|study)\b/i, "#/study", "Flashcards & Quiz"],
  [/\b(slides?|decks?)\b/i, "#/slides", "Slide Decks"],
];

/* ============================================================
   THE CATALOGUE
   Each action states what it needs, does the real work, describes what
   it did in plain words, and knows how to undo itself.
   ============================================================ */
const ACTIONS = {
  "task.add": {
    label: "Add a task",
    args: ["text"],
    hint: 'add a task: finish the Aicruae funeral scene',
    async run(a) {
      const text = String(a.text || "").trim();
      if (!text) return { ok: false, why: "A task needs some words." };
      const row = { id: uid("t"), text, done: false, created: Date.now() };
      await S().put("tasks", row);
      window.CodexFeed && CodexFeed.log("Added task", text.slice(0, 60));
      return { ok: true, title: "Task added", detail: text,
        link: { href: "#/tasks", label: "Open Tasks" }, undo: { store: "tasks", id: row.id } };
    },
  },

  "note.create": {
    label: "Make a note",
    args: ["title", "text", "category"],
    hint: 'make a note called Vandrea\'s letter',
    async run(a) {
      const title = String(a.title || "").trim() || "Untitled note";
      const note = await C().addNote(title, String(a.text || "").trim(),
        [], validCategory(a.category));
      return { ok: true, title: "Note created", detail: title,
        link: { href: "#/entry/" + note.id, label: "Open it" },
        undo: { store: "notes", id: note.id, reload: true } };
    },
  },

  /* The one that earns its keep: a note that arrives already written,
     from what your own entries say about the subject. Not invention;
     assembly, with the sources named at the foot. */
  "note.draft": {
    label: "Draft a note from the canon",
    args: ["subject"],
    hint: 'draft a note about House Patton',
    async run(a) {
      const subject = String(a.subject || "").trim();
      if (!subject) return { ok: false, why: "Tell me what to draft about." };
      const sents = C().topicSummary(subject, 6);
      const home = C().bestEntryFor(subject, true);
      const facts = home ? C().factsOf(home, 10) : [];
      const mentions = C().mentionsOf(subject, null, true);
      if (!sents.length && !facts.length) {
        return { ok: false, why: `Your entries do not describe “${subject}” yet, so there is nothing honest to draft from.` };
      }
      const body = [
        subject,
        "",
        facts.length ? facts.map(f => f.k + ": " + f.v).join("\n") + "\n" : "",
        sents.length ? "Overview:\n" + sents.join(" ") + "\n" : "",
        mentions.length
          ? "Drawn from:\n" + mentions.slice(0, 8).map(e => "- " + e.title).join("\n")
          : "",
        "",
        "(Drafted from your own entries. Nothing above was invented; edit freely.)",
      ].filter(Boolean).join("\n");
      const note = await C().addNote("Draft · " + subject, body, [], "My Notes");
      return { ok: true, title: "Draft written", detail: "“Draft · " + subject + "”, assembled from " +
          mentions.length + " " + (mentions.length === 1 ? "entry" : "entries"),
        link: { href: "#/entry/" + note.id, label: "Open the draft" },
        undo: { store: "notes", id: note.id, reload: true } };
    },
  },

  "doc.create": {
    label: "Start a document",
    args: ["title"],
    hint: 'start a document called Chapter One',
    async run(a) {
      const title = String(a.title || "").trim() || "Untitled";
      const d = { id: uid("d"), title, html: "", folder: null, updated: Date.now() };
      await S().put("docs", d);
      window.CodexFeed && CodexFeed.log("Created document", title);
      return { ok: true, title: "Document created", detail: title,
        link: { href: "#/doc/" + d.id, label: "Open and write" },
        undo: { store: "docs", id: d.id } };
    },
  },

  "section.create": {
    label: "Add a section",
    args: ["name"],
    hint: 'add a section called Songs & Ballads',
    async run(a) {
      const name = String(a.name || "").trim();
      if (!name) return { ok: false, why: "A section needs a name." };
      if (!window.CodexExtra) return { ok: false, why: "The sections store is not loaded." };
      const cat = await CodexExtra.addCat(name);
      C().refresh();
      return { ok: true, title: "Section added", detail: name + " now sits under The Canon",
        link: { href: "#/browse/" + encodeURIComponent(name), label: "Open it" },
        undo: { cat: cat.id } };
    },
  },

  /* Only your own notes can be re-filed. The imported canon is read from
     the source documents on every load, so "moving" one would last until
     the next refresh and then silently undo itself; saying so is better
     than appearing to work. */
  "entry.file": {
    label: "File an entry",
    args: ["subject", "category"],
    hint: 'file Vandrea\'s letter under Characters',
    async run(a) {
      const subject = String(a.subject || "").trim();
      const category = validCategory(a.category);
      if (!subject || !category) return { ok: false, why: "I need both a note and a section." };
      const sl = subject.toLowerCase();
      const entry = C().DB.entries.find(e => e.title.toLowerCase() === sl) ||
                    C().DB.entries.find(e => e.title.toLowerCase().includes(sl));
      if (!entry) return { ok: false, why: `I cannot find anything called “${subject}”.` };
      if (!entry._user) {
        return { ok: false, why: `“${entry.title}” came from your source documents, and those are re-read ` +
          `on every load, so filing it here would not stick. Notes you wrote can be filed.` };
      }
      const was = entry.category;
      await C().updateNote(entry.id, { category });
      return { ok: true, title: "Filed", detail: `“${entry.title}” moved from ${was} to ${category}`,
        link: { href: "#/entry/" + entry.id, label: "Open it" },
        undo: { note: entry.id, patch: { category: was } } };
    },
  },

  "navigate": {
    label: "Open a page",
    args: ["target"],
    hint: 'open my tasks',
    async run(a) {
      const t = String(a.target || "").trim();
      if (!t) return { ok: false, why: "Open what?" };
      for (const [re, hash, label] of PLACES) {
        if (re.test(t)) { location.hash = hash; return { ok: true, title: "Opened", detail: label, quiet: true }; }
      }
      const sl = t.toLowerCase();
      const entry = C().DB.entries.find(e => e.title.toLowerCase() === sl) ||
                    C().DB.entries.find(e => e.title.toLowerCase().includes(sl));
      if (entry) { location.hash = "#/entry/" + entry.id; return { ok: true, title: "Opened", detail: entry.title, quiet: true }; }
      return { ok: false, why: `I do not know a page or entry called “${t}”.` };
    },
  },

  "backup": {
    label: "Back up the workspace",
    args: [],
    hint: 'back up my work',
    async run() {
      if (!C().backup) return { ok: false, why: "The backup routine is not loaded." };
      C().backup();
      return { ok: true, title: "Backup started", detail: "Your browser is downloading the file. It never includes your API key.", quiet: true };
    },
  },
};

function validCategory(name) {
  if (!name) return "My Notes";
  const want = String(name).trim().toLowerCase();
  const all = (C().categoriesList() || []).map(c => c.name);
  return all.find(c => c.toLowerCase() === want) ||
         all.find(c => c.toLowerCase().includes(want)) || "My Notes";
}

/* ---------- undo ----------
   Each action described its own reversal; this performs it. Kept in one
   place so an action author only has to say what to undo, never how the
   rail should behave afterwards. */
async function undo(u) {
  if (!u) return false;
  if (u.cat && window.CodexExtra) { await CodexExtra.delCat(u.cat); C().refresh(); return true; }
  if (u.note) { await C().updateNote(u.note, u.patch || {}); return true; }
  if (u.store === "notes") { await C().deleteNote(u.id); return true; }
  if (u.store) { await S().del(u.store, u.id); return true; }
  return false;
}

/* ============================================================
   READING AN INSTRUCTION OUT OF PLAIN ENGLISH
   Ordered most specific first: "draft a note about X" must not be
   swallowed by the plainer "note" pattern below it.
   ============================================================ */
const PATTERNS = [
  [/^\s*(?:draft|write|compose)\s+(?:me\s+)?(?:an?\s+)?(?:note|page|entry|summary)\s+(?:about|on|for)\s+(.+?)\s*$/i,
    m => ({ do: "note.draft", subject: m[1] })],

  [/^\s*(?:add|create|make|new)\s+(?:a\s+)?task\s*(?::|\bto\b|\bfor\b)?\s*(.+?)\s*$/i,
    m => ({ do: "task.add", text: m[1] })],
  [/^\s*(?:todo|to-do)[:\s]+(.+?)\s*$/i, m => ({ do: "task.add", text: m[1] })],
  [/^\s*remind\s+me\s+to\s+(.+?)\s*$/i, m => ({ do: "task.add", text: m[1] })],

  [/^\s*(?:make|create|add|new)\s+(?:a\s+)?(?:note|entry)\s+(?:called|titled|named)\s+(.+?)\s*$/i,
    m => ({ do: "note.create", title: m[1] })],
  [/^\s*(?:make|create|add|new)\s+(?:a\s+)?note\s+(?:about|on|for)\s+(.+?)\s*$/i,
    m => ({ do: "note.draft", subject: m[1] })],

  [/^\s*(?:start|create|make|new|open)\s+(?:a\s+)?(?:new\s+)?(?:document|doc|chapter|manuscript)\s+(?:called|titled|named)\s+(.+?)\s*$/i,
    m => ({ do: "doc.create", title: m[1] })],
  [/^\s*(?:start|create|make|new)\s+(?:a\s+)?(?:new\s+)?(?:document|doc|chapter)\s*$/i,
    () => ({ do: "doc.create", title: "Untitled" })],

  [/^\s*(?:add|create|make|new)\s+(?:a\s+)?section\s+(?:called|titled|named)\s+(.+?)\s*$/i,
    m => ({ do: "section.create", name: m[1] })],

  [/^\s*(?:file|move|put)\s+(.+?)\s+(?:under|in|into|to)\s+(.+?)\s*$/i,
    m => ({ do: "entry.file", subject: m[1], category: m[2] })],

  [/^\s*(?:back\s*up|backup)\s+(?:my\s+)?(?:work|workspace|everything|canon)?\s*$/i,
    () => ({ do: "backup" })],

  [/^\s*(?:open|go\s+to|take\s+me\s+to|show\s+me)\s+(?:my\s+|the\s+)?(.+?)\s*$/i,
    m => ({ do: "navigate", target: m[1] })],
];

/* Returns a plan, or null when this is not an instruction at all.
   Trailing punctuation is stripped first; a question mark is a strong
   signal it is NOT an instruction ("open my tasks?" is a question about
   whether to), so those are handed back to the answering pipeline. */
/* People do not type commands the way a parser wishes they would. They
   say "please", they say "can you", they say "hey Lucky" first. Those
   openers carry no meaning for the instruction, so they come off before
   any pattern is tried; otherwise the ^ anchor misses and a perfectly
   clear request falls through to a canon search that finds nothing. */
const POLITE = new RegExp(
  "^\\s*(?:hey|hi|hello|ok(?:ay)?|so)?[\\s,]*" +
  "(?:please|pls|kindly)?[\\s,]*" +
  "(?:(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?|i\\s+(?:want|need)\\s+(?:you\\s+)?to\\s+|" +
  "i'?d\\s+like\\s+(?:you\\s+)?to\\s+|let'?s\\s+)?" +
  "(?:please\\s+)?", "i");

function parse(q) {
  const raw = String(q || "").trim();
  if (!raw || /\?\s*$/.test(raw)) return null;
  let text = raw.replace(/[.!]+$/, "");
  // strip the opener, but never strip the whole thing away
  const stripped = text.replace(POLITE, "").trim();
  if (stripped) text = stripped;
  for (const [re, build] of PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const plan = build(m);
      if (plan && ACTIONS[plan.do]) return plan;
    }
  }
  return null;
}

/* ---------- running one ---------- */
async function execute(plan) {
  const def = ACTIONS[plan && plan.do];
  if (!def) return { ok: false, why: "I do not know how to do that." };
  try { return await def.run(plan); }
  catch (e) {
    try { console.error("Assistant action failed:", e); } catch (e2) {}
    return { ok: false, why: "That did not go through: " + ((e && e.message) || "unknown error") };
  }
}

/* ---------- what the rail shows ---------- */
let undoSeq = 0;
const undoBank = {};

function resultHtml(res, plan) {
  if (!res.ok) {
    return `<div class="act-card bad"><div class="ac-k">✧ I could not do that</div>
      <div class="ac-why">${esc(res.why || "")}</div></div>`;
  }
  let undoBtn = "";
  if (res.undo) {
    const id = "u" + (++undoSeq);
    undoBank[id] = res.undo;
    undoBtn = `<button class="act-undo" data-undo="${id}">Undo</button>`;
  }
  return `<div class="act-card">
    <div class="ac-k">✦ ${esc(res.title || ACTIONS[plan.do].label)}</div>
    <div class="ac-detail">${esc(res.detail || "")}</div>
    <div class="ac-acts">
      ${res.link ? `<a class="btn sm" href="${esc(res.link.href)}">${esc(res.link.label)}</a>` : ""}
      ${undoBtn}
    </div>
  </div>`;
}

/* A model's suggestion, waiting for a click. The parameters are shown in
   full, because agreeing to something you cannot see is not consent. */
const proposals = {};
let propSeq = 0;
function proposalHtml(plan) {
  const def = ACTIONS[plan.do];
  if (!def) return "";
  const id = "p" + (++propSeq);
  proposals[id] = plan;
  const params = def.args.map(k => plan[k] ? `<span class="ap-arg"><b>${esc(k)}</b> ${esc(String(plan[k]))}</span>` : "")
    .filter(Boolean).join("");
  return `<div class="act-card proposal" data-proposal="${id}">
    <div class="ac-k">✧ Suggested: ${esc(def.label)}</div>
    ${params ? `<div class="ap-args">${params}</div>` : ""}
    <div class="ac-acts">
      <button class="btn sm" data-doit="${id}">Do it</button>
      <button class="act-undo" data-dismiss="${id}">Dismiss</button>
    </div>
  </div>`;
}

/* Pull ```action {...}``` blocks out of a model reply. Anything that is
   not valid JSON naming a known action is ignored rather than guessed
   at, and the block is always stripped from the prose either way. */
function extractProposals(text) {
  const plans = [];
  const clean = String(text || "").replace(/```(?:action|json:action)\s*([\s\S]*?)```/gi, (all, body) => {
    try {
      const plan = JSON.parse(body.trim());
      if (plan && ACTIONS[plan.do]) plans.push(plan);
    } catch (e) {}
    return "";
  });
  return { text: clean.trim(), plans };
}

/* The catalogue as the model sees it; only ever the actions above, so a
   model cannot reach past what you could type yourself. */
function catalogue() {
  return Object.keys(ACTIONS).map(k =>
    `- ${k}(${ACTIONS[k].args.join(", ")}): ${ACTIONS[k].label}`).join("\n");
}
function promptBlock() {
  return "You may propose ONE action when, and only when, the writer clearly asks for something to be " +
    "created, filed or opened. Emit it as a fenced block ```action {\"do\":\"task.add\",\"text\":\"...\"} ``` " +
    "after your prose. Never propose an action for a question that merely asks about the world. " +
    "The available actions are:\n" + catalogue();
}

/* ---------- wiring the buttons in a rendered turn ---------- */
function bind(root, onRerender) {
  (root || document).querySelectorAll("[data-undo]").forEach(b => b.onclick = async () => {
    const u = undoBank[b.dataset.undo];
    b.disabled = true;
    const done = await undo(u);
    window.toast && toast(done ? "Undone" : "There was nothing left to undo");
    const card = b.closest(".act-card");
    if (card && done) { card.classList.add("undone"); card.querySelector(".ac-detail").textContent = "Undone."; }
    if (onRerender) onRerender();
  });
  (root || document).querySelectorAll("[data-doit]").forEach(b => b.onclick = async () => {
    const plan = proposals[b.dataset.doit];
    const card = b.closest(".act-card");
    b.disabled = true;
    const res = await execute(plan);
    if (card) {
      card.classList.remove("proposal");
      card.outerHTML = resultHtml(res, plan);
      bind(root, onRerender);
    }
    if (onRerender) onRerender();
  });
  (root || document).querySelectorAll("[data-dismiss]").forEach(b => b.onclick = () => {
    const card = b.closest(".act-card");
    if (card) card.remove();
  });
}

/* Everything the rail needs to offer actions as a first-class thing. */
function helpRows() {
  return Object.keys(ACTIONS).map(k => ({ label: ACTIONS[k].label, hint: ACTIONS[k].hint || "" }))
    .filter(r => r.hint);
}

window.CodexActions = {
  ACTIONS, parse, execute, undo, resultHtml, proposalHtml, extractProposals,
  catalogue, promptBlock, bind, helpRows,
};
})();
