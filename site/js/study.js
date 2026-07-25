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

/* returns { items, note } — note explains why the pool is smaller than hoped, if it is */
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
  if (named.length) return { items: named, note: `Only ${named.length} entr${named.length === 1 ? "y" : "ies"} in your canon match "${topic.trim()}" — try a broader topic (a category name like "Noble Houses"), or leave it blank to pull from everything.` };
  return { items: usable, note: `Nothing matched "${topic.trim()}", so this pulls from your whole canon instead.` };
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
      <button class="btn ghost" id="stGenAI" title="Let Gemini write richer cards from your canon">✦ AI cards</button>
    </div>
    <div id="stArea"></div>
  </div>`;
  $("#stGenerate").onclick = generate;
  $("#stGenAI").onclick = generateAI;
  $("#stMode").onchange = () => { $("#stDiff").style.display = $("#stMode").value === "quiz" ? "" : "none"; };
  $("#stDiff").style.display = "none";
  $("#stArea").innerHTML = `<div class="empty-state">Set a topic (or not) and hit Generate.</div>`;
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

/* ---------- AI card generation (Gemini) ---------- */
/* Gemini's newer models spend a real, size-varying chunk of the token budget on internal
   "thinking" before writing anything (observed 300–2800+ tokens even for simple prompts).
   If the visible JSON gets cut off partway through, a naive parse either fails outright or
   — worse — can slice at the wrong bracket and leave a corrupted trailing object. This
   scans char-by-char and keeps only COMPLETE {...} objects, so a truncated generation still
   yields whatever full cards it managed to finish, never a card with a blank answer. */
function parseJsonArray(raw) {
  if (!raw) return [];
  const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("[");
  if (start < 0) return [];
  const out = [];
  let depth = 0, objStart = -1;
  for (let i = start + 1; i < t.length; i++) {
    const ch = t[i];
    if (ch === "{") { if (depth === 0) objStart = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && objStart >= 0) { try { out.push(JSON.parse(t.slice(objStart, i + 1))); } catch (_) {} objStart = -1; } }
  }
  return out;
}
async function generateAI() {
  if (!window.CodexAI || !CodexAI.on) { toast("Connect Gemini first — Settings → Assistant"); location.hash = "#/settings"; return; }
  const topic = $("#stTopic").value.trim();
  const count = Math.max(3, Math.min(30, +$("#stCount").value || 10));
  const mode = $("#stMode").value;
  const { items, note } = pool(topic);
  poolNote = note;
  const src = pick(items, Math.min(16, items.length));
  if (!src.length) { $("#stArea").innerHTML = `<div class="empty-state">Nothing in your canon matches that topic yet.</div>`; return; }
  let context = "";
  for (const e of src) { const chunk = `### ${e.title} — ${e.category}\n${(e.text || "").replace(/\s+/g, " ").trim().slice(0, 1400)}\n\n`; if (context.length + chunk.length > 15000) break; context += chunk; }
  $("#stArea").innerHTML = `<div class="ai-thinking" style="justify-content:center;padding:30px">✦ Writing ${count} cards from your canon<span class="ai-dots"><i></i><i></i><i></i></span></div>`;
  const system = "You write study flashcards from a worldbuilding author's OWN canon. Use ONLY the provided excerpts — never invent names, facts, or events. " +
    "Return STRICT JSON only (no markdown, no prose): an array of objects with EXACTLY these keys — " +
    `{"q":"a specific question","a":"a concise correct answer","distractors":["wrong but plausible","wrong 2","wrong 3"]}. ` +
    "Every object must have a non-empty \"q\" and a non-empty \"a\" — never omit or leave either blank. " +
    "Questions must be answerable from the excerpts; answers short; distractors plausible-but-wrong short phrases drawn from the same world.";
  const user = `Make ${count} flashcards${topic ? ` about "${topic}"` : ""} from these excerpts. Return only the JSON array.\n\n${context}`;
  try {
    // scale the budget to the requested count — thinking overhead alone can run 1000-2800+
    // tokens, so a fixed low cap silently truncates larger batches mid-array
    const maxTokens = Math.min(8000, 1400 + count * 260);
    const raw = await CodexAI.complete(system, user, { maxTokens });
    const arr = parseJsonArray(raw);
    const built = arr.map(o => ({
      q: String(o.q || o.question || "").trim(),
      a: String(o.a || o.answer || o.correct_answer || o.correctAnswer || "").trim(),
      distractors: (Array.isArray(o.distractors) ? o.distractors : Array.isArray(o.options) ? o.options : Array.isArray(o.choices) ? o.choices : [])
        .map(d => String(d).trim()).filter(Boolean),
      entry: null, factKey: null,
    })).filter(c => c.q && c.a);
    if (!built.length) throw new Error("no usable cards came back");
    cards = built.slice(0, count);
    window.CodexFeed && CodexFeed.log("Generated AI " + (mode === "quiz" ? "quiz" : "flashcards"), `${cards.length} on "${topic || "everything"}"`);
    if (built.length < count) poolNote = `Gemini finished ${built.length} of ${count} requested cards — showing what came back.`;
    if (mode === "cards") renderCards(); else renderQuiz($("#stDiff").value);
  } catch (err) {
    $("#stArea").innerHTML = `<div class="empty-state">✦ AI couldn't build cards (${esc(err.message)}). Try the plain <b>Generate</b> button, or check your key in Settings.</div>`;
  }
}

function renderCards() {
  flipped = new Set();
  $("#stArea").innerHTML = `${poolNoteHtml()}<p class="muted">${cards.length} card${cards.length === 1 ? "" : "s"} on <b>${esc($("#stTopic").value || "your canon")}</b> — click a card to flip it.</p>
    <div class="flash-grid">${cards.map((c, i) => flashcardHtml(c, i)).join("")}</div>`;
  bindCards();
}
function flashcardHtml(c, i) {
  const isFlipped = flipped.has(i);
  return `<div class="flashcard ${isFlipped ? "flipped" : ""}" data-i="${i}">
    <div class="fc-face fc-front">${esc(c.q)}</div>
    <div class="fc-face fc-back">${esc((c.a || "").slice(0, 260))}${(c.a || "").length > 260 ? "…" : ""}
      ${c.entry ? `<a class="fc-source" href="#/entry/${c.entry.id}">Open source →</a>` : ""}</div>
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
  if (c.distractors && c.distractors.length >= 3) return pick(c.distractors.filter(v => v && v !== c.a), 3);
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
    $("#gotWrong").onclick = () => nextQuestion();
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
