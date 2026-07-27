/* ============================================================
   THE READING ROOM

   Your shelf of works, the chapters you have published, and what
   readers have said. The Discover and Rooms tabs are the parts that
   need other people in them; until anyone else publishes, they say so
   rather than showing invented authors and made-up follower counts.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const S = () => window.CodexStore;
const C = () => window.CodexCloud;

const words = t => String(t || "").trim().split(/\s+/).filter(Boolean).length;
const plain = html => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-7]|li)>/gi, "\n")
  .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const TABS = [["shelf", "My shelf"], ["chapters", "Chapters"], ["notes", "From readers"],
  ["discover", "Discover"], ["rooms", "Rooms"]];
let tab = "shelf";

function rel(t) {
  const s = Math.round((Date.now() - new Date(t)) / 1000);
  if (s < 90) return "just now";
  const m = Math.round(s / 60); if (m < 60) return m + " min ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24); if (d < 30) return d + "d ago";
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

async function viewCommunity(which) {
  if (which && TABS.some(t => t[0] === which)) tab = which;
  await S().ready;
  const folders = await S().all("folders").catch(() => []);
  const docs = (await S().all("docs").catch(() => []))
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const st = C() && C().configured() ? C().state() : { signedIn: false, configured: false };

  let comments = [], shares = [];
  if (st.signedIn) {
    try { comments = await C().comments.list(); } catch (e) {}
    try { shares = await C().shares.list(); } catch (e) {}
  }
  const sharedIds = new Set(shares.map(s => s.scope));
  const anyWorkspaceShare = shares.some(s => s.scope === "workspace");

  view().innerHTML = `<div class="wrap wide">
    <div class="comm-head">
      <div>
        <div class="page-kicker">Community spaces</div>
        <h1 class="display">The reading room</h1>
      </div>
      <div class="comm-actions">
        <button class="a-chip" id="commPublish">Publish a work</button>
      </div>
    </div>
    <div class="atlas-bar">
      ${TABS.map(([id, label]) => `<button class="a-chip${tab === id ? " on" : ""}" data-ctab="${id}">${esc(label)}${
        id === "notes" && comments.length ? ` <span class="rn">${comments.length}</span>` : ""}</button>`).join("")}
      <span class="hr"></span>
      <button class="a-chip" id="commSearch">⌕ Search your works</button>
    </div>
    <div id="commBody"></div>
  </div>`;

  $$("[data-ctab]").forEach(b => b.onclick = () => viewCommunity(b.dataset.ctab));
  $("#commPublish").onclick = () => {
    if (!folders.length) { toast("Make a project first — the + beside Projects in the sidebar"); return; }
    location.hash = "#/work/" + encodeURIComponent(folders[0].id);
  };
  $("#commSearch").onclick = () => window.CodexUI && document.getElementById("searchOpen").click();

  const body = $("#commBody");
  if (tab === "shelf") renderShelf(body, folders, docs, sharedIds, anyWorkspaceShare, st);
  else if (tab === "chapters") renderChapters(body, folders, docs);
  else if (tab === "notes") renderNotes(body, comments, st);
  else if (tab === "discover") renderDiscover(body, folders, docs, st);
  else renderRooms(body, st);
}

/* ---------- My shelf: the works you have ---------- */
function renderShelf(el, folders, docs, sharedIds, anyWorkspaceShare, st) {
  if (!folders.length) {
    el.innerHTML = `<div class="empty-state">No works yet. A work is a project: make one with the
      <b>+</b> beside Projects in the sidebar, then file documents into it as chapters.</div>`;
    return;
  }
  el.innerHTML = `<div class="shelf-grid">${folders.map(f => {
    const chs = docs.filter(d => (d.folder || "") === f.id);
    const total = chs.reduce((n, c) => n + words(plain(c.html)), 0);
    const pub = f.publish || {};
    const isShared = sharedIds.has(f.id) || anyWorkspaceShare;
    return `<a class="shelf-card" href="#/work/${encodeURIComponent(f.id)}">
      <div class="sc-cover">${pub.cover ? `<img src="${esc(pub.cover)}" alt="">`
        : `<span class="ornament">✦ ✧ ✦</span>`}</div>
      <div class="sc-body">
        <div class="sc-kicker">${esc(pub.genre || "Unfiled")} · ${esc(pub.status || "Draft")}</div>
        <div class="sc-title">${esc(f.name)}</div>
        <div class="sc-meta">${chs.length} chapter${chs.length === 1 ? "" : "s"} · ${total.toLocaleString()} words</div>
        <div class="sc-tag">${isShared ? "✦ Shared by link" : "Private"}</div>
      </div>
    </a>`;
  }).join("")}</div>
  ${st.configured && !st.signedIn ? `<p class="faint set-help" style="margin-top:16px">Sign in from
    <a href="#/settings">Settings → Account</a> to share any of these with a reader.</p>` : ""}`;
}

/* ---------- Chapters: what you have published, newest first ---------- */
function renderChapters(el, folders, docs) {
  const named = {};
  folders.forEach(f => { named[f.id] = f.name; });
  const written = docs.filter(d => words(plain(d.html)) > 0);
  if (!written.length) {
    el.innerHTML = `<div class="empty-state">No chapters written yet.</div>`;
    return;
  }
  el.innerHTML = written.slice(0, 40).map(d => `
    <a class="upd-row" href="#/doc/${encodeURIComponent(d.id)}">
      <div class="ur-body">
        <div class="ur-title">${esc(d.title || "Untitled")}</div>
        <div class="ur-meta">${esc(named[d.folder] || "Unfiled")} · ${words(plain(d.html)).toLocaleString()} words</div>
      </div>
      <span class="ur-when">${d.updated ? rel(d.updated) : ""}</span>
    </a>`).join("");
}

/* ---------- From readers ---------- */
function renderNotes(el, comments, st) {
  if (!st.configured) {
    el.innerHTML = `<div class="empty-state">Reader notes need a connected database. See
      <code>supabase/README.md</code>.</div>`;
    return;
  }
  if (!st.signedIn) {
    el.innerHTML = `<div class="empty-state">Sign in from <a href="#/settings">Settings → Account</a>
      to see what readers have sent.</div>`;
    return;
  }
  if (!comments.length) {
    el.innerHTML = `<div class="empty-state">Nothing yet. Open a work, make a reading link, and send it
      to someone — whatever they write lands here and on your Desk.</div>`;
    return;
  }
  el.innerHTML = comments.map(c => {
    const who = c.author_name || (c.author_id ? "You" : "A reader");
    return `<div class="work-comment${c.resolved ? " done" : ""}">
      <span class="wc-initial">${esc(who.charAt(0).toUpperCase())}</span>
      <div class="wc-body">
        <div class="wc-top"><span class="wc-name">${esc(who)}</span>
          <span class="wc-where">${rel(c.created_at)}</span></div>
        <div class="wc-text">${esc(c.body)}</div>
      </div></div>`;
  }).join("");
}

/* ---------- Discover: honest about needing other people ---------- */
function renderDiscover(el, folders, docs, st) {
  const genres = (window.CodexPublish && CodexPublish.GENRES) || [];
  el.innerHTML = `
    <div class="atlas-bar">${genres.map(g => `<button class="a-chip" disabled>${esc(g)}</button>`).join("")}</div>
    <div class="gold-card" style="margin-top:16px">
      <div class="gold-card-head">✦ Nobody else has published here yet ✦</div>
      <p style="font-size:14.5px;line-height:1.6;margin:0">This is where other writers' works would appear —
        browsable by genre, sorted by what's active. It needs more than one person to be worth looking at,
        and right now this database has you in it.</p>
      <p style="font-size:14.5px;line-height:1.6;margin:10px 0 0;color:var(--dim)">Your own works are on
        <b>My shelf</b>. Anyone you send a reading link to can read and comment without an account, which is
        the part that works today.</p>
    </div>
    <div class="rule-head mt"><span class="k">Pick up where you stopped</span><span class="hr"></span></div>
    ${docs.filter(d => words(plain(d.html)) > 0).slice(0, 3).map(d => {
      const w = words(plain(d.html));
      return `<a class="upd-row" href="#/doc/${encodeURIComponent(d.id)}">
        <div class="ur-body"><div class="ur-title">${esc(d.title || "Untitled")}</div>
          <div class="ur-meta">${w.toLocaleString()} words · last touched ${d.updated ? rel(d.updated) : "a while ago"}</div></div>
        <span class="ur-when">Open</span></a>`;
    }).join("") || `<div class="empty-state">Nothing opened yet.</div>`}`;
}

/* ---------- Rooms ---------- */
function renderRooms(el, st) {
  el.innerHTML = `<div class="gold-card">
    <div class="gold-card-head">✦ Rooms need company ✦</div>
    <p style="font-size:14.5px;line-height:1.6;margin:0">Rooms in the design are shared threads —
      a tag, a prompt, and whoever turns up. They are the one part of this that cannot be faked
      convincingly for a single person, so rather than show six invented rooms with invented member
      counts, this is here to say what it would be.</p>
    <p style="font-size:14.5px;line-height:1.6;margin:10px 0 0;color:var(--dim)">If you ever want this
      for real, say so and I will build it on the same database — the tables and access rules are
      already shaped for more than one account.</p>
  </div>`;
}

window.CodexCommunity = { view: viewCommunity };
})();
