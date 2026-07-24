/* ============================================================
   World Without God — Canon Organizer
   Flashcards & Quiz — self-testing built straight from your own
   canon. Give it a topic and a count and it pulls facts and
   summaries into cards or multiple-choice / recall questions.
   Regenerate as many times as you want.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const C = () => window.Codex;

function pool(topic) {
  const DB = C().DB;
  const entries = C().visibleEntries ? C().visibleEntries() : DB.entries;
  const usable = entries.filter(e => e.type === "pdf" || e.type === "note");
  if (!topic || !topic.trim()) return usable;
  const t = topic.trim().toLowerCase();
  const cat = C().categoriesList().find(c => c.name.toLowerCase() === t);
  if (cat) return usable.filter(e => e.category === cat.name);
  const named = usable.filter(e => e.title.toLowerCase().includes(t) || (e._hay || "").includes(t));
  return named.length ? named : usable;
}
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pick(arr, n) { return shuffle(arr).slice(0, n); }

/* build one Q/A pair from an entry — prefers a concrete fact, falls back to a summary sentence */
function questionFor(entry) {
  const facts = C().factsOf(entry, 8);
  if (facts.length) {
    const f = facts[Math.floor(Math.random() * facts.length)];
    return { q: `${entry.title} — ${f.k}?`, a: f.v, entry, factKey: f.k };
  }
  const sents = C().sentencesOf(entry.text).filter(s => s.length > 20 && s.length < 220);
  const s = sents[0] || entry.summary || entry.title;
  return { q: `What do you know about ${entry.title}?`, a: s, entry, factKey: null };
}

/* ---------- FLASHCARDS ---------- */
let cards = [], flipped = new Set();
function view_() {
  view().innerHTML = `<div class="wrap">
    <div class="page-kicker">${window.svg ? "" : ""}Study</div>
    <h1>Flashcards &amp; Quiz</h1>
    <p class="muted">Built from your own canon — nothing invented. Pick a topic (a category name like
      "Noble Houses", or a character/place name, or leave blank for anything), how many, and go.</p>

    <div class="study-controls">
      <input id="stTopic" placeholder="Topic (optional) — e.g. Magic System, or a name…">
      <input id="stCount" type="number" min="3" max="30" value="10" style="width:80px">
      <select id="stMode"><option value="cards">Flashcards</option><option value="quiz">Quiz</option></select>
      <select id="stDiff"><option value="easy">Easy (multiple choice)</option><option value="hard">Hard (type it yourself)</option></select>
      <button class="btn" id="stGenerate">Generate</button>
    </div>
    <div id="stArea"></div>
  </div>`;
  $("#stGenerate").onclick = generate;
  $("#stMode").onchange = () => { $("#stDiff").style.display = $("#stMode").value === "quiz" ? "" : "none"; };
  $("#stDiff").style.display = "none";
  $("#stArea").innerHTML = `<div class="empty-state">Set a topic (or not) and hit Generate.</div>`;
}

function generate() {
  const topic = $("#stTopic").value;
  const count = Math.max(3, Math.min(30, +$("#stCount").value || 10));
  const mode = $("#stMode").value;
  const src = pick(pool(topic), Math.min(count, 60));
  if (!src.length) { $("#stArea").innerHTML = `<div class="empty-state">Nothing in your canon matches that topic yet.</div>`; return; }
  cards = src.slice(0, count).map(questionFor);
  window.CodexFeed && CodexFeed.log("Generated " + (mode === "quiz" ? "quiz" : "flashcards"), `${cards.length} on "${topic || "everything"}"`);
  if (mode === "cards") renderCards(); else renderQuiz($("#stDiff").value);
}

function renderCards() {
  flipped = new Set();
  $("#stArea").innerHTML = `<p class="muted">${cards.length} cards on <b>${esc($("#stTopic").value || "your canon")}</b> — click a card to flip it.</p>
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
function renderQuiz(difficulty) {
  quizState = { i: 0, score: 0, difficulty, answers: [] };
  renderQuizQuestion();
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
  if (quizState.difficulty === "hard") {
    area.innerHTML = `<p class="muted">${progress}</p>
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
    $("#gotWrong").onclick = () => nextQuestion();
  } else {
    const options = shuffle([c.a, ...distractorsFor(c)]);
    area.innerHTML = `<p class="muted">${progress}</p>
      <div class="quiz-card">
        <div class="quiz-q">${esc(c.q)}</div>
        <div class="quiz-opts">${options.map((o, i) => `<button class="quiz-opt" data-opt="${esc(o)}">${esc((o || "").slice(0, 140))}</button>`).join("")}</div>
      </div>`;
    $$(".quiz-opt", area).forEach(b => b.onclick = () => {
      const correct = b.dataset.opt === c.a;
      $$(".quiz-opt", area).forEach(x => { x.disabled = true; if (x.dataset.opt === c.a) x.classList.add("correct"); });
      if (!correct) b.classList.add("wrong"); else quizState.score++;
      setTimeout(nextQuestion, 900);
    });
  }
}
function nextQuestion() { quizState.i++; renderQuizQuestion(); }
function renderQuizResults() {
  const pct = Math.round((quizState.score / cards.length) * 100);
  $("#stArea").innerHTML = `<div class="quiz-results">
    <div class="page-kicker">Results</div>
    <h2>${quizState.score} / ${cards.length} <span class="faint" style="font-size:16px">(${pct}%)</span></h2>
    <p class="muted">${pct >= 80 ? "You know this cold." : pct >= 50 ? "Solid — a few gaps to shore up." : "Worth another pass through the source entries."}</p>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" id="retryQuiz">Retry this set</button>
      <button class="btn ghost" id="newQuiz">New quiz</button>
    </div>
  </div>`;
  $("#retryQuiz").onclick = () => renderQuiz(quizState.difficulty);
  $("#newQuiz").onclick = () => generate();
}

window.CodexStudy = { view: view_ };
})();
