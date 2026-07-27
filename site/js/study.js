/* ============================================================
   World Without God; Canon Organizer
   Flashcards & Quiz; self-testing built straight from your own
   canon, in three parts.

   BUILD      Draw questions out of your entries, edit any of them by
              hand, and keep the set as a named quiz. Generated
              questions are a starting point, not the final word: every
              one can be reworded, re-answered, or thrown away.
   RESPONSES  Every attempt is kept, so a score means something over
              time. It also shows which questions you get wrong most,
              which is the only part of a quiz that actually teaches.
   SETTINGS   Per quiz: how it is answered, whether questions shuffle,
              and what counts as a pass.

   Nothing is invented. Questions come from facts and sentences you
   wrote, and every card links back to the entry it came from.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const C = () => window.Codex;

/* returns { items, note }; note explains why the pool is smaller than hoped, if it is */
function pool(topic) {
  const DB = C().DB;
  const entries = C().visibleEntries ? C().visibleEntries() : DB.entries;
  const usable = entries.filter(e => e.type === "pdf" || e.type === "note");
  if (!topic || !topic.trim()) return { items: usable, note: null };
  const t = topic.trim().toLowerCase();
  // exact category match first, then a looser "contains" match (so "houses" matches "Noble Houses")
  const cats = C().categoriesList();
  let cat = cats.find(c => c.name.toLowerCase() === t) || cats.find(c => c.name.toLowerCase().includes(t) || t.includes(c.name.toLowerCase()));
  if (cat) {
    const items = usable.filter(e => e.category === cat.name);
    return { items, note: items.length ? null : `Nothing's in "${cat.name}" yet.` };
  }
  // otherwise treat the topic as a name/subject and gather everything that mentions it
  const titleHits = usable.filter(e => e.title.toLowerCase().includes(t));
  const mentionHits = usable.filter(e => !titleHits.includes(e) && (e._hay || "").includes(t));
  const named = titleHits.concat(mentionHits);
  if (named.length >= 3) return { items: named, note: null };
  if (named.length) return { items: named, note: `Only ${named.length} entr${named.length === 1 ? "y" : "ies"} in your canon match "${topic.trim()}"; try a broader topic (a category name like "Noble Houses"), or leave it blank to pull from everything.` };
  return { items: usable, note: `Nothing matched "${topic.trim()}", so this pulls from your whole canon instead.` };
}
const S = () => window.CodexStore;
const uid = p => (p || "q") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- saved quizzes and their attempts ---------- */
const QUIZ_DEF = { shuffle: true, difficulty: "easy", pass: 70, reveal: true };
let tab = "build";           // build | responses | settings
let quizzes = [], attempts = [], currentId = null;

async function loadAll() {
  await S().ready;
  quizzes = (await S().all("quizzes").catch(() => [])).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  attempts = (await S().all("attempts").catch(() => [])).sort((a, b) => (b.at || 0) - (a.at || 0));
}
function currentQuiz() { return quizzes.find(q => q.id === currentId) || null; }
function optsOf(q) { return Object.assign({}, QUIZ_DEF, (q && q.opts) || {}); }
async function saveQuiz(q) {
  q.updated = Date.now();
  await S().put("quizzes", q);
  const i = quizzes.findIndex(x => x.id === q.id);
  if (i > -1) quizzes[i] = q; else quizzes.unshift(q);
}
function attemptsFor(id) { return attempts.filter(a => a.quiz === id); }

function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pick(arr, n) { return shuffle(arr).slice(0, n); }

/* build one Q/A pair from an entry; prefers a concrete fact, falls back to a summary sentence */
function questionFor(entry) {
  const facts = C().factsOf(entry, 8);
  if (facts.length) {
    const f = facts[Math.floor(Math.random() * facts.length)];
    return { q: `${entry.title}; ${f.k}?`, a: f.v, entry, factKey: f.k };
  }
  const sents = C().sentencesOf(entry.text).filter(s => s.length > 20 && s.length < 220);
  const s = sents[0] || entry.summary || entry.title;
  return { q: `What do you know about ${entry.title}?`, a: s, entry, factKey: null };
}

/* ---------- FLASHCARDS ---------- */
let cards = [], flipped = new Set();

async function view_() {
  const gen = window.Codex ? Codex.currentGen() : 0;
  await loadAll();
  if (window.Codex && Codex.isStale(gen)) return;
  if (!currentId && quizzes.length) currentId = quizzes[0].id;
  render();
}

const TABS = [["build", "Build"], ["responses", "Responses"], ["settings", "Settings"]];

function render() {
  const q = currentQuiz();
  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Study</div>
    <h1 class="display">Flashcards &amp; Quiz</h1>
    <p class="muted" style="max-width:64ch">Built from your own canon; nothing invented. Draw questions
      out of your entries, reword any of them, and keep the set. Every attempt is recorded, so you can
      see what you keep getting wrong.</p>

    <div class="atlas-bar">
      ${TABS.map(([id, label]) => `<button class="a-chip${tab === id ? " on" : ""}" data-qtab="${id}">${label}${
        id === "responses" && q ? ` <span class="rn">${attemptsFor(q.id).length}</span>` : ""}</button>`).join("")}
      <span class="hr"></span>
      ${quizzes.length ? `<select class="folder-select" id="qPick">
        ${quizzes.map(x => `<option value="${esc(x.id)}" ${x.id === currentId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}
      </select>` : ""}
      <button class="a-chip" id="qNew">+ New quiz</button>
    </div>
    <div id="stArea"></div>
  </div>`;

  $$("[data-qtab]").forEach(b => b.onclick = () => { tab = b.dataset.qtab; render(); });
  if ($("#qPick")) $("#qPick").onchange = e => { currentId = e.target.value; render(); };
  $("#qNew").onclick = newQuiz;

  if (tab === "build") renderBuild();
  else if (tab === "responses") renderResponses();
  else renderSettings();
}

/* ---------- BUILD ---------- */
async function newQuiz() {
  const name = prompt("Name this quiz:", "Canon check " + (quizzes.length + 1));
  if (name === null) return;
  const q = { id: uid("qz"), name: (name.trim() || "Untitled quiz").slice(0, 120),
              questions: [], opts: Object.assign({}, QUIZ_DEF), created: Date.now() };
  await saveQuiz(q);
  currentId = q.id; tab = "build";
  toast("Quiz created; draw some questions from your canon");
  render();
}

function renderBuild() {
  const q = currentQuiz();
  const area = $("#stArea");
  if (!q) {
    area.innerHTML = `<div class="empty-state">No quizzes yet.
      <button class="btn sm" id="qNew2" style="margin-top:12px">Make your first quiz</button></div>`;
    $("#qNew2").onclick = newQuiz;
    return;
  }
  area.innerHTML = `
    <div class="rule-head"><span class="k">Draw questions from your canon</span><span class="hr"></span></div>
    <div class="study-controls">
      <input id="stTopic" placeholder="Topic (optional); e.g. Magic System, or a name…">
      <input id="stCount" type="number" min="1" max="30" value="10" style="width:80px">
      <button class="btn" id="stGenerate">Add questions</button>
    </div>
    <div id="stNote"></div>

    <div class="rule-head mt"><span class="k">Questions in “${esc(q.name)}”</span><span class="hr"></span>
      <span class="meta">${q.questions.length}</span></div>
    ${q.questions.length ? `<div class="qz-list">${q.questions.map((c, i) => `
      <div class="qz-row" data-qi="${i}">
        <span class="qz-n">${i + 1}</span>
        <div class="qz-body">
          <input class="qz-q" data-f="q" value="${esc(c.q)}" placeholder="Question">
          <input class="qz-a" data-f="a" value="${esc(c.a)}" placeholder="The answer">
          ${c.entryId ? `<a class="qz-src" href="#/entry/${esc(c.entryId)}">from ${esc(c.entryTitle || "an entry")} →</a>` : `<span class="qz-src own">written by you</span>`}
        </div>
        <span class="qz-tools">
          <button class="a-chip" data-qup="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="a-chip" data-qdown="${i}" ${i === q.questions.length - 1 ? "disabled" : ""}>↓</button>
          <button class="a-chip danger" data-qdel="${i}">✕</button>
        </span>
      </div>`).join("")}</div>
      <div class="qz-acts">
        <button class="btn sm" id="qSave">Save changes</button>
        <button class="btn ghost sm" id="qStart">Start the quiz</button>
        <button class="btn ghost sm" id="qCards">Study as flashcards</button>
        <button class="btn ghost sm danger" id="qDelete">Delete this quiz</button>
      </div>`
    : `<div class="empty-state">No questions yet. Draw some from your canon above,
        or <button class="btn sm" id="qBlank" style="margin-left:6px">write one yourself</button></div>`}`;

  $("#stGenerate").onclick = () => addGenerated(q);
  if ($("#qBlank")) $("#qBlank").onclick = () => addBlank(q);
  if ($("#qSave")) $("#qSave").onclick = () => commitEdits(q, true);
  if ($("#qStart")) $("#qStart").onclick = async () => { await commitEdits(q); startQuiz(q); };
  if ($("#qCards")) $("#qCards").onclick = async () => { await commitEdits(q); cards = q.questions.slice(); renderCards(); };
  if ($("#qDelete")) $("#qDelete").onclick = async () => {
    if (!confirm(`Delete “${q.name}”?\n\nIts ${attemptsFor(q.id).length} recorded attempt(s) go too. The entries it was built from are untouched.`)) return;
    for (const a of attemptsFor(q.id)) await S().del("attempts", a.id);
    await S().del("quizzes", q.id);
    quizzes = quizzes.filter(x => x.id !== q.id);
    attempts = attempts.filter(a => a.quiz !== q.id);
    currentId = quizzes.length ? quizzes[0].id : null;
    toast("Quiz deleted");
    render();
  };
  $$("[data-qup]").forEach(b => b.onclick = async () => { await moveQ(q, +b.dataset.qup, -1); });
  $$("[data-qdown]").forEach(b => b.onclick = async () => { await moveQ(q, +b.dataset.qdown, 1); });
  $$("[data-qdel]").forEach(b => b.onclick = async () => {
    commitEditsSync(q);
    q.questions.splice(+b.dataset.qdel, 1);
    await saveQuiz(q); render();
  });
}

/* read every edited field back before any action that re-renders, so
   typing is never silently lost */
function commitEditsSync(q) {
  $$(".qz-row").forEach(row => {
    const i = +row.dataset.qi;
    if (!q.questions[i]) return;
    q.questions[i].q = row.querySelector('[data-f="q"]').value.trim() || q.questions[i].q;
    q.questions[i].a = row.querySelector('[data-f="a"]').value.trim();
  });
}
async function commitEdits(q, announce) {
  commitEditsSync(q);
  await saveQuiz(q);
  if (announce) { toast("Saved"); render(); }
}
async function moveQ(q, i, d) {
  commitEditsSync(q);
  const j = i + d;
  if (j < 0 || j >= q.questions.length) return;
  const t = q.questions[i]; q.questions[i] = q.questions[j]; q.questions[j] = t;
  await saveQuiz(q); render();
}
async function addBlank(q) {
  q.questions.push({ q: "", a: "", entryId: null, entryTitle: null });
  await saveQuiz(q); render();
}
async function addGenerated(q) {
  const topic = $("#stTopic").value;
  const count = Math.max(1, Math.min(30, +$("#stCount").value || 10));
  const { items, note } = pool(topic);
  const src = pick(items, Math.min(count, items.length));
  if (!src.length) { $("#stNote").innerHTML = `<div class="empty-state">Nothing in your canon matches that topic yet.</div>`; return; }
  commitEditsSync(q);
  // don't ask the same thing twice
  const have = new Set(q.questions.map(x => x.q));
  let added = 0;
  src.map(questionFor).forEach(c => {
    if (have.has(c.q)) return;
    q.questions.push({ q: c.q, a: c.a, entryId: c.entry.id, entryTitle: c.entry.title, factKey: c.factKey });
    added++;
  });
  await saveQuiz(q);
  window.CodexFeed && CodexFeed.log("Added quiz questions", `${added} to "${q.name}"`);
  render();
  $("#stNote").innerHTML = `<div class="import-ok" style="margin-top:12px">Added ${added}
    question${added === 1 ? "" : "s"}${added < src.length ? `; ${src.length - added} were already in the set` : ""}.
    ${note ? esc(note) : ""}</div>`;
}

let poolNote = null;
function generate() {
  const topic = $("#stTopic").value;
  const count = Math.max(3, Math.min(30, +$("#stCount").value || 10));
  const mode = $("#stMode").value;
  const { items, note } = pool(topic);
  poolNote = note;
  const src = pick(items, Math.min(count, items.length));
  if (!src.length) { $("#stArea").innerHTML = `<div class="empty-state">Nothing in your canon matches that topic yet.</div>`; return; }
  cards = src.map(questionFor);
  window.CodexFeed && CodexFeed.log("Generated " + (mode === "quiz" ? "quiz" : "flashcards"), `${cards.length} on "${topic || "everything"}"`);
  if (mode === "cards") renderCards(); else renderQuiz($("#stDiff").value);
}
function poolNoteHtml() { return poolNote ? `<div class="import-ok" style="margin-bottom:14px">${esc(poolNote)}</div>` : ""; }

/* ---------- RESPONSES ---------- */
function renderResponses() {
  const q = currentQuiz(); const area = $("#stArea");
  if (!q) { area.innerHTML = `<div class="empty-state">Make a quiz first.</div>`; return; }
  const mine = attemptsFor(q.id);
  if (!mine.length) {
    area.innerHTML = `<div class="empty-state">No attempts yet. Take “${esc(q.name)}” and your
      score, and the questions you missed, are kept here.</div>`;
    return;
  }
  const o = optsOf(q);
  const best = Math.max.apply(null, mine.map(a => a.pct));
  const avg = Math.round(mine.reduce((n, a) => n + a.pct, 0) / mine.length);
  const passed = mine.filter(a => a.pct >= o.pass).length;

  /* Which questions actually catch you out. This is the part worth
     keeping records for; a score alone tells you nothing about what to
     go back and read. */
  const missed = {};
  mine.forEach(a => (a.wrong || []).forEach(w => { missed[w] = (missed[w] || 0) + 1; }));
  const worst = Object.keys(missed).sort((x, y) => missed[y] - missed[x]).slice(0, 8);

  area.innerHTML = `
    <div class="space-stats">
      ${[[mine.length, "attempt" + (mine.length === 1 ? "" : "s")],
         [best + "%", "best"], [avg + "%", "average"],
         [passed + "/" + mine.length, "passed"]].map(([n, l]) =>
        `<div class="space-stat"><div class="ss-n">${n}</div><div class="ss-l">${esc(l)}</div></div>`).join("")}
    </div>

    ${worst.length ? `<div class="rule-head mt"><span class="k">What you keep missing</span><span class="hr"></span></div>
      <div class="qz-missed">${worst.map(w => `<div class="glance-row">
        <span class="gk">${esc(w)}</span>
        <span class="gv">wrong ${missed[w]}&times;</span></div>`).join("")}</div>` : ""}

    <div class="rule-head mt"><span class="k">Every attempt</span><span class="hr"></span>
      <span class="meta">${mine.length}</span></div>
    <div class="qz-att">${mine.map(a => `<div class="qz-att-row${a.pct >= o.pass ? " pass" : ""}">
      <span class="qa-score">${a.pct}%</span>
      <span class="qa-body"><span class="qa-n">${a.score} of ${a.total} right</span>
        <span class="qa-when">${new Date(a.at).toLocaleString()}${a.mode ? " · " + esc(a.mode) : ""}</span></span>
      <span class="qa-tag">${a.pct >= o.pass ? "Pass" : "Below " + o.pass + "%"}</span>
    </div>`).join("")}</div>
    <div class="qz-acts"><button class="btn ghost sm danger" id="qClear">Clear this history</button></div>`;

  $("#qClear").onclick = async () => {
    if (!confirm("Clear every recorded attempt for this quiz?\n\nThe questions stay.")) return;
    for (const a of mine) await S().del("attempts", a.id);
    attempts = attempts.filter(a => a.quiz !== q.id);
    toast("History cleared");
    render();
  };
}

/* ---------- SETTINGS ---------- */
function renderSettings() {
  const q = currentQuiz(); const area = $("#stArea");
  if (!q) { area.innerHTML = `<div class="empty-state">Make a quiz first.</div>`; return; }
  const o = optsOf(q);
  area.innerHTML = `
    <div class="rule-head"><span class="k">Name</span><span class="hr"></span></div>
    <input class="import-title" id="qName" value="${esc(q.name)}" maxlength="120" style="max-width:420px">

    <div class="rule-head mt"><span class="k">How it is answered</span><span class="hr"></span></div>
    <div class="pers-grid">
      <button class="pers-card${o.difficulty === "easy" ? " on" : ""}" data-qdiff="easy">
        <span class="pc-glyph">✧</span><span><span class="pc-name">Multiple choice</span>
        <span class="pc-sample">Four options, one right. The wrong ones are drawn from your other entries,
          so they are plausible rather than silly.</span></span></button>
      <button class="pers-card${o.difficulty === "hard" ? " on" : ""}" data-qdiff="hard">
        <span class="pc-glyph">✦</span><span><span class="pc-name">Type it yourself</span>
        <span class="pc-sample">Recall from memory, then reveal what the canon says and mark yourself.
          Harder, and much better at finding gaps.</span></span></button>
    </div>

    <div class="rule-head mt"><span class="k">Behaviour</span><span class="hr"></span></div>
    <div class="sfx-row"><span class="sfx-label">Shuffle the questions<em>A different order each attempt, so you learn the answers rather than the sequence.</em></span>
      <button class="switch${o.shuffle ? " on" : ""}" data-qopt="shuffle" role="switch" aria-checked="${!!o.shuffle}"><span></span></button></div>
    <div class="sfx-row"><span class="sfx-label">Show the answer as you go<em>Off holds everything back until the end.</em></span>
      <button class="switch${o.reveal ? " on" : ""}" data-qopt="reveal" role="switch" aria-checked="${!!o.reveal}"><span></span></button></div>

    <div class="rule-head mt"><span class="k">What counts as a pass</span><span class="hr"></span></div>
    <div class="pace-row">
      <input type="range" id="qPass" min="0" max="100" step="5" value="${o.pass}" class="pace-slider">
      <span class="pace-read" id="qPassRead">${o.pass}%</span>
    </div>
    <p class="faint set-help">Only used to mark attempts in Responses; nothing is gated behind it.</p>

    <div class="qz-acts"><button class="btn sm" id="qOptSave">Save settings</button></div>`;

  $$("[data-qdiff]").forEach(b => b.onclick = async () => {
    q.opts = Object.assign(optsOf(q), { difficulty: b.dataset.qdiff });
    await saveQuiz(q); render();
  });
  $$("[data-qopt]").forEach(b => b.onclick = async () => {
    const k = b.dataset.qopt;
    q.opts = Object.assign(optsOf(q), { [k]: !optsOf(q)[k] });
    await saveQuiz(q); render();
  });
  const pass = $("#qPass");
  pass.oninput = () => { $("#qPassRead").textContent = pass.value + "%"; };
  $("#qOptSave").onclick = async () => {
    q.name = $("#qName").value.trim() || q.name;
    q.opts = Object.assign(optsOf(q), { pass: +pass.value });
    await saveQuiz(q);
    toast("Settings saved");
    render();
  };
}

function renderCards() {
  flipped = new Set();
  $("#stArea").innerHTML = `${poolNoteHtml()}<p class="muted">${cards.length} card${cards.length === 1 ? "" : "s"} on <b>${esc($("#stTopic").value || "your canon")}</b>; click a card to flip it.</p>
    <div class="flash-grid">${cards.map((c, i) => flashcardHtml(c, i)).join("")}</div>`;
  bindCards();
}
function flashcardHtml(c, i) {
  const isFlipped = flipped.has(i);
  return `<div class="flashcard ${isFlipped ? "flipped" : ""}" data-i="${i}">
    <div class="fc-face fc-front">${esc(c.q)}</div>
    <div class="fc-face fc-back">${esc((c.a || "").slice(0, 260))}${(c.a || "").length > 260 ? "…" : ""}
      <a class="fc-source" href="#/entry/${c.entry.id}">Open source →</a></div>
  </div>`;
}
function bindCards() {
  $$(".flashcard", $("#stArea")).forEach(el => el.onclick = e => {
    if (e.target.classList.contains("fc-source")) return;
    const i = +el.dataset.i;
    if (flipped.has(i)) flipped.delete(i); else flipped.add(i);
    el.classList.toggle("flipped");
  });
}

/* ---------- QUIZ ---------- */
let quizState = null;

/* Running a saved quiz: honours its own settings and records the result. */
function startQuiz(q) {
  if (!q.questions.length) { toast("No questions in this quiz yet"); return; }
  const o = optsOf(q);
  cards = o.shuffle ? shuffle(q.questions) : q.questions.slice();
  quizState = { i: 0, score: 0, difficulty: o.difficulty, answers: [], wrong: [], quiz: q.id, opts: o };
  renderQuizQuestion();
}
function renderQuiz(difficulty) {
  quizState = { i: 0, score: 0, difficulty, answers: [], wrong: [], quiz: null, opts: Object.assign({}, QUIZ_DEF, { difficulty }) };
  renderQuizQuestion();
}

async function recordAttempt() {
  if (!quizState || !quizState.quiz) return;
  const total = cards.length;
  const a = {
    id: uid("at"), quiz: quizState.quiz, at: Date.now(),
    score: quizState.score, total,
    pct: total ? Math.round((quizState.score / total) * 100) : 0,
    mode: quizState.difficulty === "hard" ? "typed" : "multiple choice",
    wrong: quizState.wrong.slice(0, 40),
  };
  await S().put("attempts", a);
  attempts.unshift(a);
}
function distractorsFor(c) {
  const others = cards.filter(x => x !== c);
  let vals;
  if (c.factKey) vals = others.map(o => C().factsOf(o.entry, 8).find(f => f.k === c.factKey)).filter(Boolean).map(f => f.v);
  if (!vals || vals.length < 3) vals = C().DB.entries.filter(e => e !== c.entry && (e.type === "pdf" || e.type === "note")).map(e => e.title);
  return pick(Array.from(new Set(vals)).filter(v => v && v !== c.a), 3);
}
function renderQuizQuestion() {
  const area = $("#stArea");
  if (quizState.i >= cards.length) { renderQuizResults(); return; }
  const c = cards[quizState.i];
  const progress = `Question ${quizState.i + 1} of ${cards.length} · Score ${quizState.score}`;
  const noteBlock = quizState.i === 0 ? poolNoteHtml() : "";
  if (quizState.difficulty === "hard") {
    area.innerHTML = `${noteBlock}<p class="muted">${progress}</p>
      <div class="quiz-card">
        <div class="quiz-q">${esc(c.q)}</div>
        <textarea class="import-body" id="quizAnswer" placeholder="Type your answer, then reveal…" style="min-height:80px"></textarea>
        <div style="margin-top:10px"><button class="btn sm" id="reveal">Reveal answer</button></div>
        <div id="revealArea" hidden>
          <div class="quiz-reveal"><b>Canon says:</b> ${esc(c.a)}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn sm" id="gotRight">I got it right</button>
            <button class="btn ghost sm" id="gotWrong">I got it wrong</button>
          </div>
        </div>
      </div>`;
    $("#reveal").onclick = () => { $("#revealArea").hidden = false; };
    $("#gotRight").onclick = () => { quizState.score++; nextQuestion(); };
    $("#gotWrong").onclick = () => { quizState.wrong.push(c.q); nextQuestion(); };
  } else {
    const options = shuffle([c.a, ...distractorsFor(c)]);
    area.innerHTML = `${noteBlock}<p class="muted">${progress}</p>
      <div class="quiz-card">
        <div class="quiz-q">${esc(c.q)}</div>
        <div class="quiz-opts">${options.map((o, i) => `<button class="quiz-opt" data-opt="${esc(o)}">${esc((o || "").slice(0, 140))}</button>`).join("")}</div>
      </div>`;
    $$(".quiz-opt", area).forEach(b => b.onclick = () => {
      const correct = b.dataset.opt === c.a;
      $$(".quiz-opt", area).forEach(x => { x.disabled = true; if (x.dataset.opt === c.a) x.classList.add("correct"); });
      if (!correct) { b.classList.add("wrong"); quizState.wrong.push(c.q); } else quizState.score++;
      setTimeout(nextQuestion, 900);
    });
  }
}
function nextQuestion() { quizState.i++; renderQuizQuestion(); }
async function renderQuizResults() {
  const total = cards.length;
  const pct = total ? Math.round((quizState.score / total) * 100) : 0;
  const o = quizState.opts || QUIZ_DEF;
  const saved = !!quizState.quiz;
  await recordAttempt();
  const missed = quizState.wrong;
  $("#stArea").innerHTML = `<div class="quiz-results">
    <div class="page-kicker">Results${saved ? " · recorded" : ""}</div>
    <h2>${quizState.score} / ${total} <span class="faint" style="font-size:16px">(${pct}%)</span></h2>
    <p class="muted">${pct >= o.pass ? "A pass, by your own mark." : "Below your " + o.pass + "% pass mark."}
      ${pct >= 80 ? "You know this cold." : pct >= 50 ? "A few gaps to shore up." : "Worth another pass through the source entries."}</p>
    ${missed.length ? `<div class="rule-head mt"><span class="k">What you missed</span><span class="hr"></span></div>
      <div class="qz-missed">${missed.slice(0, 12).map(w =>
        `<div class="glance-row"><span class="gk">${esc(w)}</span></div>`).join("")}</div>` : ""}
    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="retryQuiz">Take it again</button>
      ${saved ? `<button class="btn ghost" id="seeResp">See all attempts</button>
                 <button class="btn ghost" id="backBuild">Back to the questions</button>`
              : `<button class="btn ghost" id="newQuiz">New quiz</button>`}
    </div>
  </div>`;
  $("#retryQuiz").onclick = () => {
    const q = currentQuiz();
    if (saved && q) startQuiz(q); else renderQuiz(quizState.difficulty);
  };
  if ($("#seeResp")) $("#seeResp").onclick = () => { tab = "responses"; render(); };
  if ($("#backBuild")) $("#backBuild").onclick = () => { tab = "build"; render(); };
  if ($("#newQuiz")) $("#newQuiz").onclick = () => generate();
}

window.CodexStudy = { view: view_ };
})();
