/* ============================================================
   THE READING ROOM

   The hub of the community: Discover (everyone's books), your
   Library, the authors you follow, the Rooms, your own shelf, and
   what readers have sent you. Browsing works signed out; anything
   with your name on it asks you to sign in first.

   The heavy lifting; queries, publishing, the book and author
   pages; lives in books.js. This file is the furniture.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const S = () => window.CodexStore;
const C = () => window.CodexCloud;
const B = () => window.CodexBooks;

const words = t => String(t || "").trim().split(/\s+/).filter(Boolean).length;
const plain = html => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-7]|li)>/gi, "\n")
  .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const TABS = [["discover", "Discover"], ["library", "Saved to read"], ["following", "Following"],
  ["rooms", "Rooms"], ["shelf", "My shelf"], ["notes", "From readers"]];
let tab = "discover";

function rel(t) {
  const s = Math.round((Date.now() - new Date(t)) / 1000);
  if (s < 90) return "just now";
  const m = Math.round(s / 60); if (m < 60) return m + " min ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24); if (d < 30) return d + "d ago";
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/* the state Discover keeps between renders */
const disc = { q: "", genre: "", sort: "updated", matureOk: localStorage.getItem("codex.matureOk") === "1", offset: 0, rows: [] };
let room = "lobby";

async function viewCommunity(which, arg) {
  const aliases = { chat: "notes" };
  which = aliases[which] || which;
  if (which && TABS.some(t => t[0] === which)) tab = which;
  if (tab === "discover" && arg) { disc.q = arg; disc.offset = 0; }
  await S().ready;
  const st = C() && C().configured() ? C().state() : { signedIn: false, configured: false };

  view().innerHTML = `<div class="wrap wide">
    <div class="comm-head">
      <div>
        <div class="page-kicker">Community spaces</div>
        <h1 class="display">The reading room</h1>
      </div>
      <div class="comm-actions">
        <button class="a-chip" id="commPublish">✎ Write a story</button>
      </div>
    </div>
    <div class="atlas-bar">
      ${TABS.map(([id, label]) => `<button class="a-chip${tab === id ? " on" : ""}" data-ctab="${id}">${esc(label)}</button>`).join("")}
    </div>
    <div id="commBody"><div class="empty-state">Opening…</div></div>
  </div>`;

  $$("[data-ctab]").forEach(b => b.onclick = () => { location.hash = "#/community/" + b.dataset.ctab; });
  $("#commPublish").onclick = () => { location.hash = "#/work"; };

  const body = $("#commBody");
  try {
    if (tab === "discover") await renderDiscover(body, st);
    else if (tab === "library") await renderLibrary(body, st);
    else if (tab === "following") await renderFollowing(body, st);
    else if (tab === "rooms") await renderRooms(body, st);
    else if (tab === "shelf") await renderShelf(body, st);
    else await renderNotes(body, st);
  } catch (e) {
    body.innerHTML = `<div class="empty-state">That didn't load · ${esc(e.message || e)}</div>`;
  }
}

function cloudNote(body) {
  body.innerHTML = `<div class="gold-card">
    <div class="gold-card-head">✦ The community needs the database ✦</div>
    <p style="font-size:14.5px;line-height:1.6;margin:0">This copy of the app isn't connected to one, so
      there is nothing shared to show. See <code>supabase/README.md</code>.</p></div>`;
}

/* ---------- Discover: everyone's books ---------- */
async function renderDiscover(body, st) {
  if (!B() || !B().api.ready()) return cloudNote(body);
  const genres = (window.CodexPublish && CodexPublish.GENRES) || [];
  body.innerHTML = `
    <div class="disc-controls">
      <input class="import-title disc-q" id="discQ" value="${esc(disc.q)}"
        placeholder="Search titles and blurbs, or #tag…">
      <select class="folder-select" id="discSort">
        ${[["updated", "Recently updated"], ["new", "New arrivals"], ["reads", "Most read"], ["stars", "Most starred"]]
          .map(([v, l]) => `<option value="${v}"${disc.sort === v ? " selected" : ""}>${l}</option>`).join("")}
      </select>
      <button class="a-chip${disc.matureOk ? " on" : ""}" id="discMature" title="Show works marked 18+">18+</button>
    </div>
    <div class="atlas-bar">
      <button class="a-chip${!disc.genre ? " on" : ""}" data-g="">All genres</button>
      ${genres.map(g => `<button class="a-chip${disc.genre === g ? " on" : ""}" data-g="${esc(g)}">${esc(g)}</button>`).join("")}
    </div>
    <div id="discGrid"><div class="empty-state">Looking along the shelves…</div></div>
    <div style="text-align:center;margin-top:18px"><button class="btn ghost sm" id="discMore" hidden>Show more</button></div>`;

  const q = $("#discQ");
  q.onkeydown = e => { if (e.key === "Enter") { disc.q = q.value.trim(); disc.offset = 0; load(true); } };
  $("#discSort").onchange = e => { disc.sort = e.target.value; disc.offset = 0; load(true); };
  $("#discMature").onclick = () => {
    disc.matureOk = !disc.matureOk;
    localStorage.setItem("codex.matureOk", disc.matureOk ? "1" : "0");
    $("#discMature").classList.toggle("on", disc.matureOk);
    disc.offset = 0; load(true);
  };
  $$("[data-g]", body).forEach(b => b.onclick = () => { disc.genre = b.dataset.g; disc.offset = 0;
    $$("[data-g]", body).forEach(x => x.classList.toggle("on", x === b)); load(true); });
  $("#discMore").onclick = () => { disc.offset += 24; load(false); };

  async function load(fresh) {
    const grid = $("#discGrid");
    if (!grid) return;
    if (fresh) grid.innerHTML = `<div class="empty-state">Looking along the shelves…</div>`;
    let rows = [];
    try { rows = await B().api.browse({ q: disc.q, genre: disc.genre, sort: disc.sort, matureOk: disc.matureOk, offset: disc.offset, limit: 24 }); }
    catch (e) { grid.innerHTML = `<div class="empty-state">The shelves didn't answer · ${esc(e.message || e)}</div>`; return; }
    disc.rows = fresh ? rows : disc.rows.concat(rows);
    const more = $("#discMore");
    if (more) more.hidden = rows.length < 24;
    if (!disc.rows.length) {
      grid.innerHTML = disc.q || disc.genre
        ? `<div class="empty-state">Nothing on the shelves matches that. Try fewer words, or another genre.</div>`
        : `<div class="gold-card"><div class="gold-card-head">✦ The shelves are waiting ✦</div>
            <p style="font-size:14.5px;line-height:1.6;margin:0">Nothing has been published to the community yet.
            Yours could be the first: start a story at <a href="#/work">the writing desk</a>, publish a
            part or two, and press <b>Go public</b>. Anyone with an account can do the same, and
            everything published lands here for everyone to find.</p></div>`;
      return;
    }
    grid.innerHTML = `<div class="disc-grid">${disc.rows.map(b => B().ui.bookCard(b)).join("")}</div>`;
  }
  await load(true);
}

/* ---------- Library: saved to read ---------- */
async function renderLibrary(body, st) {
  if (!B() || !B().api.ready()) return cloudNote(body);
  if (!st.signedIn) {
    body.innerHTML = `<div class="empty-state">Your library follows your account. Sign in from
      <a href="#/settings">Settings → Account</a>, then save books from Discover and they keep
      their place here; with a mark when new chapters arrive.</div>`;
    return;
  }
  const [rows, cont] = await Promise.all([B().api.libraryList(), B().api.continueReading()]);
  const parts = [];
  if (cont.length) {
    parts.push(`<div class="rule-head"><span class="k">Continue reading</span><span class="hr"></span></div>
      ${cont.map(r => {
        const bk = r.community_books;
        return `<a class="upd-row" href="#/book/${esc(bk.id)}/${r.chapter_pos}">
          <div class="ur-body"><div class="ur-title">${esc(bk.title)}</div>
            <div class="ur-meta">by ${esc(bk.community_profiles ? bk.community_profiles.name : "")} ·
              chapter ${r.chapter_pos + 1} of ${bk.chapter_count} · ${rel(r.updated_at)}</div></div>
          <span class="ur-when">Resume</span></a>`;
      }).join("")}`);
  }
  if (!rows.length) {
    parts.push(`<div class="empty-state" style="margin-top:26px">Nothing saved yet. Anything you
      <b>✦ Save to library</b> from a book's page lands here, and shows a mark when the author
      posts new chapters.</div>`);
  } else {
    parts.push(`<div class="rule-head${cont.length ? " mt" : ""}"><span class="k">Saved to read</span><span class="hr"></span>
      <span class="meta">${rows.length}</span></div>
      <div class="disc-grid">${rows.map(r => {
        const bk = r.community_books;
        const fresh = Math.max(0, (bk.chapter_count || 0) - (r.chapters_seen || 0));
        return B().ui.bookCard(bk, fresh ? { badge: fresh + " new" } : null);
      }).join("")}</div>`);
  }
  body.innerHTML = parts.join("");
}

/* ---------- Following ---------- */
async function renderFollowing(body, st) {
  if (!B() || !B().api.ready()) return cloudNote(body);
  if (!st.signedIn) {
    body.innerHTML = `<div class="empty-state">Sign in from <a href="#/settings">Settings → Account</a>
      to follow authors; their new books and chapters gather here.</div>`;
    return;
  }
  const { follows, books } = await B().api.feed();
  if (!follows.length) {
    body.innerHTML = `<div class="empty-state">You aren't following anyone yet. Any author page has a
      <b>+ Follow</b> button; from then on their updates land here.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="rule-head"><span class="k">Authors you follow</span><span class="hr"></span>
      <span class="meta">${follows.length}</span></div>
    <div class="follow-row">${follows.map(f => {
      const p = f.community_profiles || {};
      return `<a class="follow-chip" href="#/author/${esc(f.author)}">${B().ui.avatarOf(p, 26)}
        <span>${esc(p.name || "?")}</span></a>`;
    }).join("")}</div>
    <div class="rule-head mt"><span class="k">Latest from them</span><span class="hr"></span></div>
    ${books.length ? `<div class="disc-grid">${books.map(b => B().ui.bookCard(b)).join("")}</div>`
      : `<div class="empty-state">Quiet so far. When they publish or update, it shows here.</div>`}`;
}

/* ---------- Rooms: shared threads ---------- */
function roomList() {
  const fixed = [
    ["lobby", "The Lobby", "Introduce yourself; talk about anything"],
    ["craft", "The Writers' Room", "Craft, structure, stuck scenes, honest help"],
    ["boost", "The Signal Boost", "Share what you have published; find readers"],
    ["prompts", "Prompts & Dares", "A line to steal, a dare to take"],
  ];
  const genres = ((window.CodexPublish && CodexPublish.GENRES) || []).map(g =>
    ["genre:" + g, g, "For readers and writers of " + g.toLowerCase()]);
  return fixed.concat(genres);
}

async function renderRooms(body, st) {
  if (!B() || !B().api.ready()) return cloudNote(body);
  const rooms = roomList();
  if (!rooms.some(r => r[0] === room)) room = "lobby";
  const meta = rooms.find(r => r[0] === room);
  body.innerHTML = `
    <div class="atlas-bar">${rooms.map(([id, label]) =>
      `<button class="a-chip${room === id ? " on" : ""}" data-room="${esc(id)}">${esc(label)}</button>`).join("")}</div>
    <div class="room-head"><span class="k">${esc(meta[1])}</span><span class="faint"> · ${esc(meta[2])}</span></div>
    <div class="cm-compose">
      <textarea class="import-body" id="roomNew" placeholder="${st.signedIn ? "Say something…" : "Sign in to post."}" ${st.signedIn ? "" : "disabled"}></textarea>
      <div class="cm-compose-foot">
        ${st.signedIn ? `<button class="btn sm" id="roomSend">Post</button>` : `<a class="btn ghost sm" href="#/settings">Sign in to post</a>`}
      </div>
    </div>
    <div id="roomPosts"><p class="faint">Listening at the door…</p></div>`;

  $$("[data-room]", body).forEach(b => b.onclick = () => { room = b.dataset.room; renderRooms(body, st); });
  const sendBtn = $("#roomSend");
  if (sendBtn) sendBtn.onclick = async () => {
    const t = $("#roomNew").value.trim();
    if (!t) return;
    const p = await B().ensureProfile(); if (!p) return;
    try { await B().api.addPost(room, null, t.slice(0, 4000)); toast("Posted"); renderRooms(body, st); }
    catch (e) { toast(e.message || String(e)); }
  };

  const box = $("#roomPosts");
  let posts = [];
  try { posts = await B().api.listPosts(room); }
  catch (e) { box.innerHTML = `<p class="faint">The room didn't answer.</p>`; return; }
  const uid = B().api.me();
  posts = posts.filter(p => !p.deleted);
  const roots = posts.filter(p => !p.parent_id);
  const kids = id => posts.filter(p => p.parent_id === id).slice().reverse();
  if (!roots.length) {
    box.innerHTML = `<div class="empty-state">Empty chairs and open floor. First word is yours.</div>`;
    return;
  }
  const one = (p, isReply) => {
    const prof = p.community_profiles || {};
    return `<div class="cm${isReply ? " cm-reply" : ""}">
      ${B().ui.avatarOf(prof, isReply ? 24 : 30)}
      <div class="cm-body">
        <div class="cm-top"><a class="cm-name" href="#/author/${esc(p.author_id)}">${esc(prof.name || "Someone")}</a>
          <span class="cm-when">${rel(p.created_at)}</span></div>
        <div class="cm-text">${esc(p.body)}</div>
        <div class="cm-acts">
          ${!isReply && uid ? `<button class="a-chip" data-preply="${esc(p.id)}">Reply</button>` : ""}
          ${uid === p.author_id ? `<button class="a-chip danger" data-prm="${esc(p.id)}" data-haskids="${!isReply && kids(p.id).length ? 1 : 0}">Remove</button>` : ""}
        </div>
        <div class="cm-replies">${kids(p.id).map(k => one(k, true)).join("")}</div>
        <div class="cm-replybox" id="prb-${esc(p.id)}" hidden>
          <textarea class="import-body sm" placeholder="Your reply…"></textarea>
          <button class="btn sm" data-psend="${esc(p.id)}">Send</button>
        </div>
      </div></div>`;
  };
  box.innerHTML = roots.map(p => one(p, false)).join("");
  $$("[data-preply]", box).forEach(b => b.onclick = () => {
    const rb = box.querySelector(`[id="prb-${b.dataset.preply}"]`);
    if (rb) { rb.hidden = !rb.hidden; if (!rb.hidden) rb.querySelector("textarea").focus(); }
  });
  $$("[data-psend]", box).forEach(b => b.onclick = async () => {
    const rb = box.querySelector(`[id="prb-${b.dataset.psend}"]`);
    const t = rb.querySelector("textarea").value.trim();
    if (!t) return;
    const p = await B().ensureProfile(); if (!p) return;
    try { await B().api.addPost(room, b.dataset.psend, t.slice(0, 4000)); renderRooms(body, st); }
    catch (e) { toast(e.message || String(e)); }
  });
  $$("[data-prm]", box).forEach(b => b.onclick = async () => {
    if (!confirm(b.dataset.haskids === "1"
      ? "Delete this post?\n\nIts replies are deleted with it." : "Delete this post?")) return;
    try { await B().api.removePost(b.dataset.prm); renderRooms(body, st); }
    catch (e) { toast(e.message || String(e)); }
  });
}

/* ---------- My shelf: local works + my community copies ---------- */
async function renderShelf(body, st) {
  const folders = await S().all("folders").catch(() => []);
  const docs = (await S().all("docs").catch(() => []));
  let mineOut = [];
  if (B() && B().api.ready() && st.signedIn) {
    try { mineOut = await B().api.myBooks(); } catch (e) {}
  }
  const outBy = {};
  mineOut.forEach(b => { outBy[b.local_folder_id] = b; });

  const parts = [];
  if (!folders.length) {
    parts.push(`<div class="empty-state">No works yet. A work is a project: make one with the
      <b>+</b> beside Projects in the sidebar, then file documents into it as chapters.</div>`);
  } else {
    parts.push(`<div class="shelf-grid">${folders.map(f => {
      const chs = docs.filter(d => (d.folder || "") === f.id);
      const total = chs.reduce((n, c) => n + words(plain(c.html)), 0);
      const pub = f.publish || {};
      const out = outBy[f.id];
      return `<a class="shelf-card" href="#/work/${encodeURIComponent(f.id)}">
        <div class="sc-cover">${pub.cover ? `<img src="${esc(pub.cover)}" alt="">`
          : `<span class="ornament">✦ ✧ ✦</span>`}</div>
        <div class="sc-body">
          <div class="sc-kicker">${esc(pub.genre || "Unfiled")} · ${esc(pub.status || "Draft")}</div>
          <div class="sc-title">${esc(f.name)}</div>
          <div class="sc-meta">${chs.length} chapter${chs.length === 1 ? "" : "s"} · ${total.toLocaleString()} words</div>
          <div class="sc-tag">${out ? `◉ In the community · ${out.reads} read${out.reads === 1 ? "" : "s"}` : "Private"}</div>
        </div>
      </a>`;
    }).join("")}</div>`);
  }

  /* community copies whose local project is gone would otherwise be
     unmanageable; name them here with a way to take them down */
  const orphans = mineOut.filter(b => !folders.some(f => f.id === b.local_folder_id));
  if (orphans.length) {
    parts.push(`<div class="rule-head mt"><span class="k">In the community, no longer on this device</span><span class="hr"></span></div>
      ${orphans.map(b => `<div class="upd-row">
        <div class="ur-body"><div class="ur-title"><a href="#/book/${esc(b.id)}">${esc(b.title)}</a></div>
          <div class="ur-meta">${b.chapter_count} chapters · ${b.reads} reads</div></div>
        <button class="a-chip danger" data-takedown="${esc(b.id)}">Take down</button>
      </div>`).join("")}`);
  }
  if (st.configured && !st.signedIn) {
    parts.push(`<p class="faint set-help" style="margin-top:16px">Sign in from
      <a href="#/settings">Settings → Account</a> to publish any of these to the community.</p>`);
  }
  body.innerHTML = parts.join("");
  $$("[data-takedown]", body).forEach(b => b.onclick = async () => {
    if (!confirm("Take this book off the community? Readers lose access; its stars and comments go with it.")) return;
    try { await B().unpublishWork(b.dataset.takedown); toast("Taken down"); viewCommunity("shelf"); }
    catch (e) { toast(e.message || String(e)); }
  });
}

/* ---------- From readers: everything sent back to you ---------- */
async function renderNotes(body, st) {
  if (!st.configured) return cloudNote(body);
  if (!st.signedIn) {
    body.innerHTML = `<div class="empty-state">Sign in from <a href="#/settings">Settings → Account</a>
      to see what readers have sent.</div>`;
    return;
  }
  let priv = [], pub = [];
  try { priv = await C().comments.list(); } catch (e) {}
  if (B() && B().api.ready()) { try { pub = await B().api.commentsOnMyBooks(); } catch (e) {} }

  const items = [
    ...priv.map(c => ({ when: c.created_at, kind: "link", who: c.author_name || "A reader", body: c.body, where: "through a reading link" })),
    ...pub.map(c => ({ when: c.created_at, kind: "community", who: (c.community_profiles && c.community_profiles.name) || "Someone",
      body: c.body, where: "on “" + (c.book_title || "your book") + "”", authorId: c.author_id, bookId: c.book_id })),
  ].sort((a, b) => new Date(b.when) - new Date(a.when));

  if (!items.length) {
    body.innerHTML = `<div class="empty-state">Nothing yet. Publish to the community, or send someone a
      private reading link; whatever comes back lands here.</div>`;
    return;
  }
  body.innerHTML = items.map(c => `<div class="work-comment">
    <span class="wc-initial">${esc(c.who.charAt(0).toUpperCase())}</span>
    <div class="wc-body">
      <div class="wc-top"><span class="wc-name">${c.authorId ? `<a href="#/author/${esc(c.authorId)}">${esc(c.who)}</a>` : esc(c.who)}</span>
        <span class="wc-where">${esc(c.where)} · ${rel(c.when)}</span></div>
      <div class="wc-text">${esc(c.body)}</div>
      ${c.bookId ? `<div class="wc-acts"><a class="a-chip" href="#/book/${esc(c.bookId)}">Open the conversation</a></div>` : ""}
    </div></div>`).join("");
}

/* ============================================================
   THE SPACE HOME
   The front door: your work facing outward, and the community
   behind it; live numbers when the database is connected.
   ============================================================ */
async function spaceHome() {
  const gen = window.Codex ? Codex.currentGen() : 0;
  await S().ready;
  const folders = await S().all("folders").catch(() => []);
  const docs = await S().all("docs").catch(() => []);
  const st = C() ? C().state() : { signedIn: false };

  const works = folders.map(f => {
    const chapters = docs.filter(d => d.folder === f.id);
    const total = chapters.reduce((n, d) => n + words(plain(d.html)), 0);
    return { f, chapters: chapters.length, total, pub: f.publish || {} };
  }).sort((a, b) => b.total - a.total);
  const totalWords = works.reduce((n, w) => n + w.total, 0);

  if (window.Codex && Codex.isStale(gen)) return;
  view().innerHTML = `<div class="wrap wide space-home">
    <div class="page-kicker">Community Space</div>
    <h1 class="display" style="font-size:44px;margin:4px 0 8px">Your work, facing outward</h1>
    <p class="muted" style="max-width:64ch;font-size:15.5px;line-height:1.55;margin:0 0 24px">
      Your workspace stays private. Publishing copies the chapters you choose into the community,
      where anyone can find, read, and answer them; a private reading link is still there for
      sharing quietly with one person.</p>

    <div class="space-stats">
      ${[[works.length, "work" + (works.length === 1 ? "" : "s")],
         [totalWords.toLocaleString(), "words written"]].map(([n, label]) =>
        `<div class="space-stat"><div class="ss-n">${n}</div><div class="ss-l">${esc(label)}</div></div>`).join("")}
      <span id="spaceCloudStats" style="display:contents"></span>
    </div>

    <div class="space-cards">
      <a class="space-card-lg" href="#/community/discover">
        <div class="sc-glyph">❖</div>
        <div class="sc-name">Discover</div>
        <div class="sc-note">Everyone's shelves: browse by genre, tag, newest, most read.</div>
      </a>
      <a class="space-card-lg" href="#/work">
        <div class="sc-glyph">✎</div>
        <div class="sc-name">My Stories</div>
        <div class="sc-note">The writing desk: parts, drafts, publishing, covers and blurbs; all in one place.</div>
      </a>
      <a class="space-card-lg" href="#/community/library">
        <div class="sc-glyph">☾</div>
        <div class="sc-name">Your library</div>
        <div class="sc-note">Saved books, marked when new chapters arrive; pick up where you stopped.</div>
      </a>
      <a class="space-card-lg" href="#/community/rooms">
        <div class="sc-glyph">✧</div>
        <div class="sc-name">The Rooms</div>
        <div class="sc-note">Shared threads: the Lobby, the Writers' Room, prompts and signal boosts.</div>
      </a>
    </div>

    <div id="spaceFresh"></div>

    ${!st.signedIn && st.configured ? `<div class="gold-card" style="margin-top:26px">
      <div class="gold-card-head">✦ Reading is open; belonging needs a name ✦</div>
      <p style="font-size:14.5px;line-height:1.6;margin:0">Browse and read without signing in. To publish,
        follow, comment, keep a library, or star books under a name, sign in from
        <a href="#/settings">Settings → Account</a> and pick a pen name; that is all a reader ever sees.</p>
    </div>` : ""}
  </div>`;

  /* the page never waits on the network; the community numbers and the
     fresh strip arrive when they arrive, or quietly don't */
  if (B() && B().api.ready()) (async () => {
    try {
      const jobs = [B().api.browse({ sort: "updated", limit: 4, matureOk: localStorage.getItem("codex.matureOk") === "1" })];
      if (st.signedIn) jobs.push(B().api.myBooks());
      const res = await Promise.all(jobs);
      if (window.Codex && Codex.isStale(gen)) return;
      const fresh = res[0] || [], mineOut = res[1] || [];
      const freshBox = $("#spaceFresh");
      if (freshBox && fresh.length) freshBox.innerHTML = `
        <div class="rule-head mt"><span class="k">Fresh in the community</span><span class="hr"></span>
          <a class="meta" href="#/community/discover" style="text-decoration:none">See all →</a></div>
        <div class="disc-grid">${fresh.map(b => B().ui.bookCard(b)).join("")}</div>`;
      const statBox = $("#spaceCloudStats");
      if (statBox && st.signedIn) {
        const outReads = mineOut.reduce((n, b) => n + (+b.reads || 0), 0);
        const outStars = mineOut.reduce((n, b) => n + (b.star_count || 0), 0);
        statBox.innerHTML = [[mineOut.length, "in the community"],
          [outReads.toLocaleString(), "reads out there"],
          [outStars.toLocaleString(), "stars received"]].map(([n, label]) =>
          `<div class="space-stat"><div class="ss-n">${n}</div><div class="ss-l">${esc(label)}</div></div>`).join("");
      }
    } catch (e) {}
  })();
}

window.CodexCommunity = { view: viewCommunity, spaceHome };
})();
