/* ============================================================
   READ THROUGH  and  REVISION HISTORY

   Read-through stitches every document filed under one project into a
   single continuous read, with the chapter list beside it — the thing
   you want when you have stopped writing and started reading.

   Revision history shows the versions the editor saved as you worked,
   with a line-level comparison against the current draft and a real
   restore. Snapshots are taken on a change of substance, not on every
   keystroke, so the list stays readable.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const S = () => window.CodexStore;
const uid = () => "rev" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const words = t => String(t || "").trim().split(/\s+/).filter(Boolean).length;
const plain = html => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-7]|li)>/gi, "\n")
  .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/* ============================================================
   SNAPSHOTS
   ============================================================ */
const SNAP_WORDS = 60;             // a paragraph's worth of change
const SNAP_GAP = 8 * 60 * 1000;    // or eight minutes, whichever comes first

const Revisions = {
  last: {},   // docId -> { at, words }

  /* Called by the editor after every save. Cheap and mostly a no-op. */
  async consider(doc) {
    if (!doc || !doc.id) return;
    const w = words(plain(doc.html));
    const seen = this.last[doc.id];
    if (!seen) {
      // first save this session: remember where we started, and make sure
      // there is at least one version to compare against
      this.last[doc.id] = { at: Date.now(), words: w };
      const existing = await this.forDoc(doc.id);
      if (!existing.length) await this.snap(doc, w, "first");
      return;
    }
    const moved = Math.abs(w - seen.words) >= SNAP_WORDS;
    const waited = Date.now() - seen.at >= SNAP_GAP;
    if (!moved && !waited) return;
    if (w === seen.words && !moved) return;
    this.last[doc.id] = { at: Date.now(), words: w };
    await this.snap(doc, w, moved ? "wrote" : "paused");
  },

  async snap(doc, w, why) {
    try {
      await S().put("revisions", {
        id: uid(), docId: doc.id, title: doc.title || "Untitled",
        html: doc.html || "", words: w == null ? words(plain(doc.html)) : w,
        at: Date.now(), why: why || "saved",
      });
      await this.trim(doc.id);
    } catch (e) {}
  },

  /* Keep the most recent 40 per document so the store can't grow forever. */
  async trim(docId) {
    const all = await this.forDoc(docId);
    for (const r of all.slice(40)) { try { await S().del("revisions", r.id); } catch (e) {} }
  },

  async forDoc(docId) {
    try {
      return (await S().all("revisions")).filter(r => r.docId === docId).sort((a, b) => b.at - a.at);
    } catch (e) { return []; }
  },
};
window.CodexRevisions = Revisions;

/* ---------- a line-level comparison, longest-common-subsequence ---------- */
function diffLines(oldText, newText) {
  const a = oldText.split("\n").map(s => s.trim()).filter(Boolean);
  const b = newText.split("\n").map(s => s.trim()).filter(Boolean);
  // Full LCS on very long drafts is wasteful; compare the first 400 lines,
  // which is far more than a chapter, and say so if truncated.
  const A = a.slice(0, 400), B = b.slice(0, 400);
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ sign: " ", text: A[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ sign: "-", text: A[i] }); i++; }
    else { out.push({ sign: "+", text: B[j] }); j++; }
  }
  while (i < n) out.push({ sign: "-", text: A[i++] });
  while (j < m) out.push({ sign: "+", text: B[j++] });
  return { rows: out, truncated: a.length > 400 || b.length > 400 };
}

function when(t) {
  const d = new Date(t), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return "Today " + time;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday " + time;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + " " + time;
}
const WHY = { first: "first version kept", wrote: "after a stretch of writing",
  paused: "after a pause", saved: "before a restore", opened: "first version kept" };

/* ============================================================
   REVISION HISTORY  #/history/<docId>
   ============================================================ */
let pickedRev = null;

async function viewHistory(docId) {
  await S().ready;
  const doc = await S().get("docs", docId).catch(() => null);
  if (!doc) { view().innerHTML = `<div class="wrap"><p class="faint">That document no longer exists.</p></div>`; return; }
  const revs = await Revisions.forDoc(docId);
  if (!revs.length) {
    view().innerHTML = `<div class="wrap">
      <div class="page-kicker">Revision history</div>
      <h1 class="display">${esc(doc.title || "Untitled")}</h1>
      <div class="empty-state">No versions saved yet. As you write, a version is kept whenever the draft
        changes by a paragraph or so, or after a pause — then you can compare and restore from here.</div>
      <p><a class="btn ghost sm" href="#/doc/${encodeURIComponent(docId)}">Back to the draft</a></p>
    </div>`;
    return;
  }
  // Default to the newest version that actually differs from the draft —
  // opening on an identical one shows an empty comparison and looks broken.
  if (!pickedRev || !revs.some(r => r.id === pickedRev)) {
    const cur = plain(doc.html).trim();
    pickedRev = (revs.find(r => plain(r.html).trim() !== cur) || revs[0]).id;
  }
  render();

  function render() {
    const rev = revs.find(r => r.id === pickedRev);
    const cur = plain(doc.html);
    const { rows, truncated } = diffLines(plain(rev.html), cur);
    const added = rows.filter(r => r.sign === "+").reduce((n, r) => n + words(r.text), 0);
    const removed = rows.filter(r => r.sign === "-").reduce((n, r) => n + words(r.text), 0);
    view().innerHTML = `<div class="wrap wide">
      <div class="page-kicker">Revision history</div>
      <h1 class="display">${esc(doc.title || "Untitled")}</h1>
      <p class="muted">${revs.length} saved version${revs.length === 1 ? "" : "s"} ·
        <a href="#/doc/${encodeURIComponent(docId)}">back to the draft</a></p>
      <div class="hist-grid">
        <div class="rev-list">
          ${revs.map(r => `<button class="rev-row${r.id === pickedRev ? " on" : ""}" data-rev="${r.id}">
            <span class="rv-when">${esc(when(r.at))}</span>
            <span class="rv-meta">${r.words.toLocaleString()} words · ${esc(WHY[r.why] || r.why)}</span>
          </button>`).join("")}
        </div>
        <div class="diff-pane">
          <div class="diff-head">
            <span class="dh-title">${esc(when(rev.at))} compared with now</span>
            <span class="hr"></span>
            <span class="dh-add">+${added} words</span>
            <span class="dh-del">−${removed} words</span>
            <button class="btn sm" id="restoreRev">Restore this version</button>
          </div>
          ${rows.length ? `<div class="diff-body">${rows.map(r => `
            <div class="diff-row ${r.sign === "+" ? "add" : r.sign === "-" ? "del" : "same"}">
              <span class="dr-sign">${r.sign === " " ? "" : r.sign}</span>
              <span class="dr-text">${esc(r.text)}</span></div>`).join("")}</div>`
      : `<div class="empty-state">This version is identical to the draft.</div>`}
          ${truncated ? `<p class="faint diff-note">Comparison shown for the first 400 lines.</p>` : ""}
        </div>
      </div>
    </div>`;

    $$("[data-rev]").forEach(b => b.onclick = () => { pickedRev = b.dataset.rev; render(); });
    $("#restoreRev").onclick = async () => {
      if (!confirm(`Restore the version from ${when(rev.at)}? The current draft is saved as a version first, so nothing is lost.`)) return;
      await Revisions.snap(doc, null, "saved");        // keep what we are replacing
      doc.html = rev.html;
      doc.updated = Date.now();
      await S().put("docs", doc);
      window.CodexFeed && CodexFeed.log("Restored a version of", doc.title || "Untitled");
      toast("Restored. The draft you replaced is still in this list.");
      location.hash = "#/doc/" + encodeURIComponent(docId);
    };
  }
}

/* ============================================================
   READ THROUGH  #/read  or  #/read/<folderId>
   ============================================================ */
async function viewRead(folderId) {
  await S().ready;
  const docs = (await S().all("docs")).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.created || 0) - (b.created || 0));
  const folders = await S().all("folders").catch(() => []);

  if (!docs.length) {
    view().innerHTML = `<div class="wrap">
      <div class="page-kicker">Read through</div>
      <h1 class="display">Nothing to read yet</h1>
      <p class="muted">Write a document or two and they'll appear here as one continuous read,
        chapter after chapter, with the list beside them.</p>
      <p><a class="btn" href="#/docs">Start a document</a></p>
    </div>`;
    return;
  }

  // Which project are we reading? Default to the one with the most writing in it.
  const groups = {};
  docs.forEach(d => { const k = d.folder || ""; (groups[k] = groups[k] || []).push(d); });
  const keys = Object.keys(groups);
  if (!folderId || !groups[folderId]) {
    folderId = keys.sort((a, b) =>
      groups[b].reduce((n, d) => n + words(plain(d.html)), 0) -
      groups[a].reduce((n, d) => n + words(plain(d.html)), 0))[0];
  }
  const chapters = groups[folderId] || [];
  const fname = (folders.find(f => f.id === folderId) || {}).name || "Unfiled documents";
  const written = chapters.filter(c => words(plain(c.html)) > 0).length;
  const total = chapters.reduce((n, c) => n + words(plain(c.html)), 0);

  view().innerHTML = `<div class="read-wrap">
    <div class="read-bar">
      <span class="rb-title">${esc(fname)}</span>
      <span class="rb-meta">Read through · ${written} of ${chapters.length} chapter${chapters.length === 1 ? "" : "s"} written
        · ${total.toLocaleString()} words</span>
      <span class="hr"></span>
      ${keys.length > 1 ? `<select class="folder-select" id="readFolder">${keys.map(k =>
        `<option value="${esc(k)}" ${k === folderId ? "selected" : ""}>${esc((folders.find(f => f.id === k) || {}).name || "Unfiled documents")}</option>`).join("")}</select>` : ""}
      <button class="a-chip" id="readAloudAll">Read aloud</button>
      <button class="a-chip" id="readPrint">Print</button>
    </div>
    <div class="read-grid">
      <nav class="read-chapters">
        <div class="rc-head">Chapters</div>
        ${chapters.map((c, i) => {
          const w = words(plain(c.html));
          return `<a class="rc-row" href="#read-ch-${i}" data-ch="${i}">
            <span class="rc-n">${i + 1}</span>
            <span class="rc-title">${esc(c.title || "Untitled")}</span>
            <span class="rc-words">${w ? w.toLocaleString() : "—"}</span></a>`;
        }).join("")}
      </nav>
      <article class="read-body" id="readBody">
        ${chapters.map((c, i) => {
          const text = plain(c.html).trim();
          return `<section class="read-ch" id="read-ch-${i}">
            <div class="rch-head">
              <div class="ornament">✧ ✦ ✧</div>
              <div class="rch-kicker">Chapter ${i + 1}</div>
              <div class="rch-title">${esc(c.title || "Untitled")}</div>
            </div>
            ${text ? text.split(/\n{1,}/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("")
            : `<p class="faint">This one is still empty.
                 <a href="#/doc/${encodeURIComponent(c.id)}">Write it</a>.</p>`}
          </section>`;
        }).join("")}
        <div class="read-end">✦✧✦<div>That's everything written so far. Keep going.</div></div>
      </article>
    </div>
  </div>`;

  if ($("#readFolder")) $("#readFolder").onchange = e => viewRead(e.target.value);
  $("#readPrint").onclick = () => window.print();
  $("#readAloudAll").onclick = () => {
    const text = chapters.map((c, i) => `Chapter ${i + 1}. ${c.title || ""}. ${plain(c.html)}`).join("\n");
    window.CodexSpeech ? CodexSpeech.read(text) : toast("Read-aloud isn't available here");
  };
  // highlight whichever chapter is on screen
  const body = $("#readBody");
  const rows = $$(".rc-row");
  body.addEventListener("scroll", () => {
    const tops = $$(".read-ch").map(s => s.getBoundingClientRect().top);
    let cur = 0;
    tops.forEach((t, i) => { if (t < 140) cur = i; });
    rows.forEach((r, i) => r.classList.toggle("on", i === cur));
  }, { passive: true });
  if (rows[0]) rows[0].classList.add("on");
  rows.forEach(r => r.onclick = e => {
    e.preventDefault();
    const target = $("#read-ch-" + r.dataset.ch);
    if (target) body.scrollTo({ top: target.offsetTop - body.offsetTop - 8, behavior: "smooth" });
  });
}

window.CodexPages = { history: viewHistory, read: viewRead };
})();
