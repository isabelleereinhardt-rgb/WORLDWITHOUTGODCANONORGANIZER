/* ============================================================
   Beep Beep Organizer — Help
   "Start here, nothing is urgent." Topic-filtered FAQ accordion,
   a first-five-minutes checklist that reflects what you've
   ACTUALLY done (not a hardcoded 3-of-5), keyboard shortcuts, and
   a hand-off to the assistant.

   Each FAQ carries a `needs` key naming the feature it describes.
   Entries whose feature isn't built yet are held back rather than
   shipped — an FAQ that confidently explains a screen that doesn't
   exist is worse than no FAQ. Flip a flag in SHIPPED as each
   phase lands.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");

/* which features exist in the running app today */
const SHIPPED = {
  backups: true, basics: true, importing: true, crossrefs: true,
  assistant: true, sprint: false, revisions: false, community: false,
};

const FAQS = [
  { needs: "backups", topic: "Backups", q: "Where does my writing actually live?",
    a: "In this browser, on this device, in its own database per workspace. Nothing is uploaded. That means it is private by default and also that a backup is the only copy that leaves this machine: Settings, then Back up my work." },
  { needs: "basics", topic: "Getting started", q: "Can I break something by clicking around?",
    a: "No. Deleting hides an entry rather than destroying it, and everything hidden is listed in Settings under Deleted entries. Even a whole collection you hide keeps its entries." },
  { needs: "importing", topic: "Getting started", q: "How do I get my old documents in?",
    a: "Add Lore takes PDFs, Word files, Markdown, plain text, images, or a straight paste. PDFs come in with both their text and their page images, and everything is indexed the moment it saves." },
  { needs: "crossrefs", topic: "Canon & search", q: "What makes a name a link?",
    a: "Any name you have used more than once becomes a cross reference. Click one and you get every passage that mentions it with a brief on top. If an ordinary word gets caught by mistake, remove it from the Name Index and it stops linking without deleting anything." },
  { needs: "assistant", topic: "Assistant", q: "Does the assistant invent things?",
    a: "No. It answers only from your own entries and lists the ones it used underneath. It runs entirely on this device — it searches, summarizes, cross-checks and answers from your words, with no request leaving the browser." },
  { needs: "basics", topic: "Canon & search", q: "What is a workspace?",
    a: "One project, kept entirely separate: its own documents, notes, canvases and database. Switch with Workspaces in the top bar. Only the first workspace carries the World Without God canon; new ones start empty, and the assistant only ever reads the one you are in." },
  { needs: "importing", topic: "Getting started", q: "Can I file lore somewhere other than My Notes?",
    a: "Yes. Every collection is a filing destination, and you can make your own with the + beside The Canon. Pick the section in Add Lore, or change it later from the entry itself." },
  { needs: "sprint", topic: "Writing", q: "How do I write with fewer distractions?",
    a: "Start a sprint from the Desk. Everything dims for twenty five minutes, ambience plays if you chose one, and Lucky naps on the clock. Your word count and timer keep running in the document toolbar." },
  { needs: "revisions", topic: "Writing", q: "Can I undo a bad revision?",
    a: "Open Revisions. Every save is listed with its word count, the diff shows exactly what changed, and Restore this version puts it back. Nothing is overwritten silently." },
  { needs: "community", topic: "Community", q: "What is the difference between a workspace and a community space?",
    a: "A workspace is yours and private: one project, its own database. A community space is public: you publish chapters there, readers comment and react, and nothing from your private workspace goes with it unless you publish it." },
];

const SHORTCUTS = [
  { what: "Search everything", keys: "Ctrl K" },
  { what: "Command menu while writing", keys: "/" },
  { what: "Autocomplete a name", keys: "Tab" },
  { what: "Open the assistant", keys: "Ctrl J" },
];

/* ---------- first-five-minutes: real milestones, not a fixed count ---------- */
const MK = "codex.milestones";
function milestones() { try { return JSON.parse(localStorage.getItem(MK) || "{}"); } catch (e) { return {}; } }
function markMilestone(k) {
  const m = milestones();
  if (m[k]) return;
  m[k] = Date.now();
  localStorage.setItem(MK, JSON.stringify(m));
}
function steps() {
  const m = milestones();
  const C = window.Codex;
  const readOne = !!(C && C.recentCount && C.recentCount() > 0) || !!m.readEntry;
  const imported = !!(C && C.DB.entries.some(e => e._user));
  return [
    { label: "Open a collection and read one entry", done: readOne },
    { label: "Press Ctrl K and search a name", done: !!m.searched },
    { label: "Bring in one old document", done: imported },
    { label: "Write for twenty five minutes", done: !!m.sprint },
    { label: "Back up your workspace", done: !!m.backup },
  ];
}

let topic = "All", openIdx = 0;

function visibleFaqs() {
  return FAQS.filter(f => SHIPPED[f.needs]).filter(f => topic === "All" || f.topic === topic);
}

function render() {
  const shown = visibleFaqs();
  // only offer topics that actually have shipped entries behind them
  const avail = Array.from(new Set(FAQS.filter(f => SHIPPED[f.needs]).map(f => f.topic)));
  const topics = ["All", ...avail];
  const st = steps();
  const doneN = st.filter(s => s.done).length;

  view().innerHTML = `<div class="wrap wide help-wrap">
    <div class="page-kicker">Help</div>
    <h1 class="display" style="font-size:42px;margin:4px 0 6px">Start here, nothing is urgent</h1>
    <p class="muted" style="font-size:15.5px;line-height:1.55;max-width:62ch;margin:0 0 20px">
      Everything below is a two minute answer. Nothing in this app can be permanently destroyed by
      clicking the wrong thing, which is the first fact worth knowing.</p>

    <button class="help-ask" id="helpAsk">
      <span style="color:var(--blush)">⌕</span>
      <span style="flex:1;text-align:left">Ask a question in your own words</span>
    </button>

    <div class="help-grid">
      <div style="min-width:0">
        <div class="help-topics">
          ${topics.map(t => `<button class="chip ${t === topic ? "on" : ""}" data-topic="${esc(t)}">${esc(t)}</button>`).join("")}
        </div>
        ${shown.length ? shown.map((f, i) => `
          <div class="faq ${i === openIdx ? "open" : ""}" data-i="${i}">
            <div class="faq-head">
              <span class="faq-glyph">${["✦", "✧", "❖"][i % 3]}</span>
              <span class="faq-q">${esc(f.q)}</span>
              <span class="faq-topic">${esc(f.topic)}</span>
            </div>
            ${i === openIdx ? `<div class="faq-a">${esc(f.a)}</div>` : ""}
          </div>`).join("")
          : `<div class="empty-state">Nothing filed under that topic yet.</div>`}
      </div>

      <div style="min-width:0;display:flex;flex-direction:column;gap:20px">
        <div class="gold-card">
          <div class="gold-card-head">✦ First five minutes ✦</div>
          ${st.map(s => `<div class="step ${s.done ? "done" : ""}">
              <span class="step-mark">${s.done ? "✓" : ""}</span>
              <span class="step-label">${esc(s.label)}</span>
            </div>`).join("")}
          <p class="muted" style="font-size:13.5px;line-height:1.45;margin:10px 0 0">
            ${doneN} of ${st.length} done. The rest can wait for a rainy afternoon.</p>
        </div>

        <div>
          <div class="rule-head" style="margin:0 0 9px"><span class="k">Keyboard shortcuts</span><span class="hr"></span></div>
          ${SHORTCUTS.map(s => `<div class="kb-row"><span style="flex:1;min-width:0">${esc(s.what)}</span>
            <kbd>${esc(s.keys)}</kbd></div>`).join("")}
        </div>

        <div class="stuck">
          <div class="page-kicker" style="letter-spacing:.22em;margin-bottom:7px">Still stuck?</div>
          <div style="font-size:14.5px;line-height:1.55;color:var(--ink)">Ask ${esc(luckyName())} in plain words.
            He answers from your own canon, and if the question is about the app itself he points you at the page you need.</div>
          <button class="btn sm" id="helpAskLucky" style="margin-top:10px">Ask ${esc(luckyName())}</button>
        </div>
      </div>
    </div>
  </div>`;

  $$("[data-topic]", view()).forEach(b => b.onclick = () => { topic = b.dataset.topic; openIdx = 0; render(); });
  $$(".faq", view()).forEach(el => el.onclick = () => {
    const i = +el.dataset.i; openIdx = (openIdx === i ? -1 : i); render();
  });
  const ask = () => { if (window.CodexAssistant) { CodexAssistant.open(); $("#assistantInput") && $("#assistantInput").focus(); } };
  $("#helpAsk").onclick = ask;
  $("#helpAskLucky").onclick = ask;
}
function luckyName() {
  const s = window.CodexExtra && CodexExtra.settings;
  return (s && s.luckyName) || "Lucky";
}

window.CodexHelp = { view: render, markMilestone, SHIPPED };
})();
