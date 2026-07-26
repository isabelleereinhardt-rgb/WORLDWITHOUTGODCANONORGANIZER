/* ============================================================
   THE DESK  — the home screen.

   Everything on this page is computed from what you have actually
   done in this workspace. The heatmap and the fortnight bars read a
   per-day log ("daylog") that the editor writes to as you type; the
   recap reads the activity feed since your last visit; Lucky's
   journal is a few sentences assembled from this week's real
   numbers. Nothing here is sample data — an empty workspace shows
   an honestly empty desk.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const view = () => $("#view");
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const S = () => window.CodexStore;
const dayKey = (d) => {
  const t = d instanceof Date ? d : new Date(d);
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
};

/* ---------- the per-day log ----------
   One record per calendar day: words written, minutes at the desk,
   and how many separate edits landed. Words are recorded as a delta
   so re-opening a long document doesn't count its whole length
   again. */
const Day = {
  pending: { words: 0, minutes: 0, edits: 0 },
  flushTimer: null,

  async get(key) {
    try { return (await S().get("daylog", key)) || null; } catch (e) { return null; }
  },
  async all() {
    try { return await S().all("daylog"); } catch (e) { return []; }
  },
  /* Buffered so a fast typist doesn't cause a write per keystroke. */
  add(words, minutes, edits) {
    this.pending.words += words || 0;
    this.pending.minutes += minutes || 0;
    this.pending.edits += edits || 0;
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 4000);
  },
  async flush() {
    const p = this.pending;
    if (!p.words && !p.minutes && !p.edits) return;
    this.pending = { words: 0, minutes: 0, edits: 0 };
    try {
      const id = dayKey(new Date());
      const rec = (await this.get(id)) || { id, words: 0, minutes: 0, edits: 0 };
      rec.words += p.words; rec.minutes += p.minutes; rec.edits += p.edits;
      rec.at = Date.now();
      await S().put("daylog", rec);
    } catch (e) {}
  },
};
window.CodexDay = Day;
window.addEventListener("beforeunload", () => Day.flush());

/* ---------- word-count deltas from the editor ----------
   The editor calls this with a document's current word count. We
   remember the last count we saw per document, and log only the
   increase, so the heatmap measures writing rather than reading. */
const lastSeenWords = {};
function noteWordCount(docId, words) {
  if (!docId) return;
  const prev = lastSeenWords[docId];
  lastSeenWords[docId] = words;
  if (prev === undefined) return;              // first sight this session: baseline only
  const delta = words - prev;
  if (delta > 0) Day.add(delta, 0, 1);
}
window.CodexDeskLog = { words: noteWordCount, minutes: (m) => Day.add(0, m, 0) };

/* ============================================================
   DERIVED NUMBERS
   ============================================================ */

/* 26 weeks ending on the current week, Sunday-first columns. */
function heatWeeks(byDay, max) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()));  // this Saturday
  const weeks = [];
  for (let w = 25; w >= 0; w--) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(end);
      cur.setDate(end.getDate() - w * 7 - (6 - d));
      const key = dayKey(cur);
      const words = (byDay[key] && byDay[key].words) || 0;
      days.push({ key, words, future: cur > today, level: heatLevel(words, max), date: cur });
    }
    weeks.push({ days });
  }
  return weeks;
}
function heatLevel(words, max) {
  if (!words) return 0;
  const ceiling = Math.max(max, 400);
  const r = words / ceiling;
  if (r < 0.2) return 1;
  if (r < 0.5) return 2;
  return 3;
}

/* Longest run of consecutive days with any words, ending today or
   yesterday (so a streak isn't declared dead before the day is out). */
function streaks(byDay) {
  const keys = Object.keys(byDay).filter(k => byDay[k].words > 0).sort();
  if (!keys.length) return { current: 0, best: 0 };
  let best = 1, run = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = new Date(keys[i - 1] + "T12:00"), cur = new Date(keys[i] + "T12:00");
    const gap = Math.round((cur - prev) / 86400000);
    run = gap === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const today = dayKey(new Date());
  const yest = dayKey(new Date(Date.now() - 86400000));
  const last = keys[keys.length - 1];
  const current = (last === today || last === yest) ? run : 0;
  return { current, best };
}

function fortnight(byDay) {
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const key = dayKey(d);
    out.push({
      key, words: (byDay[key] && byDay[key].words) || 0,
      day: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      today: i === 0,
    });
  }
  return out;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relTime(t) {
  if (!t) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m + " minute" + (m === 1 ? "" : "s") + " ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " hour" + (h === 1 ? "" : "s") + " ago";
  const d = Math.round(h / 24);
  if (d < 30) return d + " day" + (d === 1 ? "" : "s") + " ago";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* Feed actions map to a glyph and a colour so the recap reads at a
   glance without needing to be read word by word. */
function recapMark(action) {
  const a = (action || "").toLowerCase();
  if (a.includes("delet") || a.includes("remov")) return { glyph: "−", dot: "var(--danger)" };
  if (a.includes("add") || a.includes("import") || a.includes("creat")) return { glyph: "+", dot: "var(--blush)" };
  if (a.includes("back")) return { glyph: "✦", dot: "var(--gold)" };
  return { glyph: "·", dot: "var(--blush2)" };
}

/* ---------- writer + cat identity (Phase 5 extends this) ---------- */
function deskIdentity() {
  const s = (window.CodexExtra && CodexExtra.settings) || {};
  return {
    name: (s.writerName || "").trim(),
    lucky: window.CodexLucky ? CodexLucky.name() : "Lucky",
    skin: window.CodexLucky ? CodexLucky.skin() : "tabby",
  };
}
/* One drawing of the cat, owned by lucky.js, so changing his coat in
   Settings updates the Desk, the assistant and the sprint clock alike. */
function luckySvg() {
  return window.CodexLucky ? CodexLucky.face(26) : "";
}

/* The portrait built in Settings. Falls back to a monogram if the
   avatar module is missing, so the greeting is never empty. */
function avatarMedallion(name) {
  if (window.CodexAvatar && window.CodexAvatarBuilder) {
    return `<a class="desk-avatar-link" href="#/settings" title="Change your avatar"
      data-avatar="56">${CodexAvatar.draw(CodexAvatarBuilder.current(), 56)}</a>`;
  }
  const initial = (name || "").trim().charAt(0).toUpperCase() || "✦";
  return `<span class="desk-avatar" aria-hidden="true">${initial}</span>`;
}

/* ---------- Lucky's weekly journal ----------
   Real sentences from real counts. The cat is a friendly frame for
   your own numbers, so it never claims a week you didn't have. */
function luckyJournal(id, week) {
  const { words, days, added, topCollection } = week;
  const lines = [];
  if (!words && !added) {
    lines.push(`Nothing on the desk this week, so ${id.lucky} slept on the keyboard and considered it a job well done.`);
    return lines.join(" ");
  }
  if (words) {
    lines.push(days >= 5
      ? `${words.toLocaleString()} words across ${days} days. ${id.lucky} says that is a proper week and expects to be told so.`
      : `${words.toLocaleString()} words on ${days} day${days === 1 ? "" : "s"}. ${id.lucky} sat through most of it.`);
  }
  if (added) lines.push(`${added} new ${added === 1 ? "entry" : "entries"} went into the canon.`);
  if (topCollection) lines.push(`Most of the attention went to ${topCollection}.`);
  return lines.join(" ");
}

/* ============================================================
   THE VIEW
   ============================================================ */
async function viewDesk() {
  const v = view();
  await S().ready;

  const id = deskIdentity();
  const now = new Date();
  const logs = await Day.all();
  const byDay = {};
  logs.forEach(l => { byDay[l.id] = l; });
  const maxWords = logs.reduce((m, l) => Math.max(m, l.words || 0), 0);

  const weeks = heatWeeks(byDay, maxWords);
  const st = streaks(byDay);
  const fn = fortnight(byDay);
  const fnTotal = fn.reduce((a, d) => a + d.words, 0);
  const fnMax = Math.max(1, ...fn.map(d => d.words));

  /* ---- since you were last here ---- */
  const meta = await S().get("meta", "lastVisit").catch(() => null);
  const since = (meta && meta.at) || 0;
  const feed = (await S().all("feed").catch(() => []))
    .filter(f => f.at > since).sort((a, b) => b.at - a.at).slice(0, 6);
  await S().put("meta", { id: "lastVisit", at: Date.now() }).catch(() => {});

  /* ---- this week, for Lucky ---- */
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  let weekWords = 0, weekDays = 0, weekMinutes = 0;
  Object.keys(byDay).forEach(k => {
    if (new Date(k + "T12:00") >= weekStart) {
      weekWords += byDay[k].words || 0;
      weekMinutes += byDay[k].minutes || 0;
      if (byDay[k].words) weekDays++;
    }
  });
  const notesThisWeek = (await S().all("notes").catch(() => []))
    .filter(n => (n.created || n.updated || 0) >= +weekStart).length;
  const week = { words: weekWords, days: weekDays, added: notesThisWeek, topCollection: topCollection(feed) };

  /* ---- pick up where you left off ---- */
  const resume = resumeCards();

  /* ---- on this day ---- */
  const anniversaries = await onThisDay();

  const minsSince = minutesSince(byDay, since);

  v.innerHTML = `
  <div class="desk">
    <div class="desk-top">
      <div class="desk-hello">
        ${avatarMedallion(id.name)}
        <div>
          <div class="page-kicker">${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
          <div class="display desk-greet">${greeting()}${id.name ? ", " + esc(id.name) : ""}<button class="name-edit" id="deskName"
            title="${id.name ? "Change the name you're greeted by" : "Tell it what to call you"}">${id.name ? "edit" : "add your name"}</button></div>
        </div>
      </div>
      <button class="btn" id="deskSprint">Start a 25 minute sprint</button>
    </div>

    <div class="desk-grid">
      <div class="desk-col">
        <div class="rule-head">
          <span class="k">The last six months at the desk</span><span class="hr"></span>
          <span class="meta">${st.current} day streak · best ${st.best}</span>
        </div>
        <div class="heat">
          ${weeks.map(w => `<div class="heat-w">${w.days.map(d => `
            <span class="heat-d l${d.level}${d.future ? " fut" : ""}"
                  title="${d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${d.words ? d.words.toLocaleString() + " words" : "nothing written"}"></span>`).join("")}</div>`).join("")}
        </div>
        <div class="heat-legend">
          <span>Quiet</span>
          <span class="heat-d l0"></span><span class="heat-d l1"></span>
          <span class="heat-d l2"></span><span class="heat-d l3"></span>
          <span>${maxWords ? maxWords.toLocaleString() + " words" : "busy"}</span>
        </div>

        <div class="rule-head mt">
          <span class="k">Words, last fortnight</span><span class="hr"></span>
          <span class="meta">${fnTotal.toLocaleString()} total</span>
        </div>
        <div class="bars">
          ${fn.map(d => `<div class="bar-col" title="${d.words.toLocaleString()} words">
            <span class="wbar${d.today ? " today" : ""}" style="height:${d.words ? Math.max(3, Math.round(d.words / fnMax * 100)) : 0}%"></span>
            <span class="bar-lab">${d.day}</span></div>`).join("")}
        </div>
        ${fnTotal ? "" : `<p class="faint desk-note">These fill in as you write. The heatmap and the bars read the same log, so a
          twenty minute sprint shows up here the moment it ends.</p>`}

        <div class="rule-head mt">
          <span class="k">Pick up where you left off</span><span class="hr"></span>
        </div>
        ${resume.length ? `<div class="resume-grid">${resume.map(r => `
          <a class="resume-card" href="${r.href}">
            <div class="rc-kind">${esc(r.kind)}</div>
            <div class="rc-title">${esc(r.title)}</div>
            <div class="rc-where">${esc(r.where)}</div>
            <div class="rc-bar"><span style="width:${r.pct}%"></span></div>
          </a>`).join("")}</div>`
      : `<div class="empty-state">Nothing opened yet. Whatever you read or write next shows up here.</div>`}
      </div>

      <div class="desk-col side">
        <div class="gold-card">
          <div class="gold-card-head">✦ Since you were last here ✦</div>
          ${feed.length ? feed.map(f => {
            const m = recapMark(f.action);
            return `<div class="recap-row">
              <span class="rc-glyph" style="color:${m.dot}">${m.glyph}</span>
              <span class="rc-what">${esc(f.action)}${f.detail ? " — " + esc(f.detail) : ""}
                <span class="rc-meta">${relTime(f.at)}</span></span></div>`;
          }).join("") : `<div class="recap-row quiet">Nothing has changed since you closed the tab.</div>`}
          ${minsSince ? `<div class="recap-foot">${minsSince}</div>` : ""}
        </div>

        <div class="lucky-card">
          <div class="lucky-head">
            <span class="lucky-face" data-lucky-face="26" data-skin="${esc(id.skin)}">${luckySvg()}</span>
            <span class="k">${esc(id.lucky)}'s journal, this week</span>
          </div>
          <div class="lucky-body">${esc(luckyJournal(id, week))}</div>
          <div class="lucky-meta">Week ${weekOfYear(now)} · ${weekWords.toLocaleString()} words · ${weekMinutes} min at the desk${treatLine()}</div>
        </div>

        <div>
          <div class="rule-head">
            <span class="k">On this day in your canon</span><span class="hr"></span>
          </div>
          ${anniversaries.length ? anniversaries.map(o => `
            <a class="otd-row" href="${o.href}">
              <span class="otd-year">${esc(o.year)}</span>
              <span class="otd-what">${esc(o.what)}</span>
            </a>`).join("")
      : `<div class="otd-row quiet"><span class="otd-what faint">Nothing was filed on ${now.toLocaleDateString(undefined, { month: "long", day: "numeric" })} in an earlier year — yet.</span></div>`}
        </div>
      </div>
    </div>

    <div class="rule-head mt">
      <span class="k">Your collections</span><span class="hr"></span>
      <span class="meta">${(window.Codex ? Codex.categoriesList().length : 0)} in this workspace</span>
    </div>
    <div class="cat-grid">${collectionCards()}</div>
  </div>`;

  $("#deskSprint").onclick = () => window.CodexSprint && CodexSprint.start(25);
  $("#deskName").onclick = () => {
    const next = prompt("What should the desk call you?", id.name || "");
    if (next === null) return;
    CodexExtra.settings.writerName = next.trim();
    CodexSettings.save();
    viewDesk();
  };
}

/* minutes logged since a given timestamp, phrased for the recap foot */
function minutesSince(byDay, since) {
  if (!since) return "";
  let mins = 0;
  Object.keys(byDay).forEach(k => {
    if (new Date(k + "T23:59") >= new Date(since)) mins += byDay[k].minutes || 0;
  });
  if (!mins) return "";
  const h = Math.floor(mins / 60), m = mins % 60;
  const dur = h ? `${h} hour${h === 1 ? "" : "s"}${m ? ` and ${m} minute${m === 1 ? "" : "s"}` : ""}` : `${m} minute${m === 1 ? "" : "s"}`;
  return `${dur} at the desk since ${new Date(since).toLocaleDateString(undefined, { weekday: "long" })}.`;
}

/* Pets and treats only appear once he has actually earned some. */
function treatLine() {
  if (!window.CodexLucky) return "";
  const pets = CodexLucky.pref("luckyPetsTotal") || 0, treats = CodexLucky.pref("luckyTreats") || 0;
  if (!pets && !treats) return "";
  return ` · ${treats} treat${treats === 1 ? "" : "s"} · ${pets} pet${pets === 1 ? "" : "s"}`;
}

function weekOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}

/* Which collection the recent feed touched most — used for one line
   of Lucky's journal, and left blank when there is no clear answer. */
function topCollection(feed) {
  if (!window.Codex) return "";
  const names = Codex.categoriesList().map(c => c.name);
  const hits = {};
  feed.forEach(f => {
    const text = (f.action + " " + (f.detail || "")).toLowerCase();
    names.forEach(n => { if (text.includes(n.toLowerCase())) hits[n] = (hits[n] || 0) + 1; });
  });
  const best = Object.keys(hits).sort((a, b) => hits[b] - hits[a])[0];
  return best || "";
}

/* The three most recently opened entries. The bar compares their
   lengths to each other — it is not a progress bar toward a goal we
   never asked you to set. */
function resumeCards() {
  if (!window.Codex) return [];
  const byId = {};
  Codex.visibleEntries().forEach(e => { byId[e.id] = e; });
  const picked = Codex.recentIds().map(id => byId[id]).filter(Boolean).slice(0, 3);
  const lens = picked.map(e => wordsOf(e));
  const max = Math.max(1, ...lens);
  return picked.map((e, i) => ({
    kind: e.category || "Entry",
    title: e.title,
    where: lens[i] ? lens[i].toLocaleString() + " words" : "no text yet",
    pct: Math.max(4, Math.round(lens[i] / max * 100)),
    href: "#/entry/" + encodeURIComponent(e.id),
  }));
}
function wordsOf(e) {
  const t = e.body || e.text || e._hay || "";
  return String(t).trim().split(/\s+/).filter(Boolean).length;
}

/* Entries and timeline notes filed on today's month and day in an
   earlier year. Reads real creation dates, so a young workspace has
   nothing to show and says so. */
async function onThisDay() {
  const now = new Date();
  const md = (t) => { const d = new Date(t); return d.getMonth() === now.getMonth() && d.getDate() === now.getDate(); };
  const out = [];
  const notes = await S().all("notes").catch(() => []);
  notes.forEach(n => {
    const t = n.created || n.updated;
    if (t && md(t) && new Date(t).getFullYear() < now.getFullYear()) {
      out.push({ year: String(new Date(t).getFullYear()), what: n.title || "Untitled note", href: "#/entry/" + encodeURIComponent(n.id) });
    }
  });
  const docs = await S().all("docs").catch(() => []);
  docs.forEach(d => {
    const t = d.created || d.updated;
    if (t && md(t) && new Date(t).getFullYear() < now.getFullYear()) {
      out.push({ year: String(new Date(t).getFullYear()), what: d.title || "Untitled document", href: "#/doc/" + encodeURIComponent(d.id) });
    }
  });
  return out.sort((a, b) => b.year - a.year).slice(0, 4);
}

function collectionCards() {
  if (!window.Codex) return "";
  return Codex.categoriesList().map(c => `
    <a class="cat-card" href="#/browse/${encodeURIComponent(c.name)}">
      <span class="bar" style="background:${Codex.catColor(c.name)}"></span>
      <span class="cdot lg" style="background:${Codex.catColor(c.name)}"></span>
      <h3>${esc(c.name)}</h3>
      <div class="n">${c.count} ${c.count === 1 ? "entry" : "entries"}</div>
    </a>`).join("");
}

window.CodexDesk = { view: viewDesk };
})();
