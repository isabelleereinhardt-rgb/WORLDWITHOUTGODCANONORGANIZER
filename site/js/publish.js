/* ============================================================
   PUBLISHING; the Work page, share links, and the reader's view

   A "work" is a project folder: its documents are its chapters. The
   Work page is that project's public face; cover, blurb, tags,
   chapter list, and whatever readers have said about it.

   Sharing hands out a link. Whoever opens it reads through a narrow
   database function that returns only what the token covers, with no
   account and no access to anything else. They can leave a comment,
   which lands back on your Desk.

   Everything except the sharing itself works offline; a work with no
   link is simply a private one.
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

/* A work's public details live in the folder record, so they travel
   with the project and sync like everything else. */
const GENRES = ["Romantasy", "Fantasy", "Romance", "Science fiction", "Historical",
  "Mystery", "Horror", "Literary", "Young adult", "Poetry"];
const STATUSES = ["Ongoing", "Complete", "On hiatus", "Draft"];
const REACTIONS = [
  ["heart", "♥", "Loved it"], ["gasp", "✦", "Gasped"], ["cry", "✧", "Cried"],
  ["laugh", "❖", "Laughed"], ["reread", "☾", "Reread it"], ["chill", "✶", "Chills"],
];

async function folderOf(id) {
  const all = await S().all("folders").catch(() => []);
  return all.find(f => f.id === id) || null;
}
async function chaptersOf(folderId) {
  const docs = await S().all("docs").catch(() => []);
  return docs.filter(d => (d.folder || "") === folderId).sort(chapterOrder);
}

/* ---------- reading order ----------
   Reading order is the writer's, not the file system's. `order` is
   authoritative once set; anything without one falls back to the chapter
   number in its title, then to when it was made; so a book imported or
   written before this existed still lines up sensibly instead of
   scattering. */
function chapterOrder(a, b) {
  const ao = Number.isFinite(a.order) ? a.order : null;
  const bo = Number.isFinite(b.order) ? b.order : null;
  if (ao != null && bo != null) return ao - bo;
  if (ao != null) return -1;
  if (bo != null) return 1;
  const num = t => (window.CodexEditor && CodexEditor.chapterNumberIn)
    ? CodexEditor.chapterNumberIn(t) : null;
  const an = num(a.title), bn = num(b.title);
  if (an != null && bn != null && an !== bn) return an - bn;
  return (a.created || a.updated || 0) - (b.created || b.updated || 0);
}

/* Write the current visual order back onto every chapter, so the next
   read is not relying on the fallbacks above. */
async function commitOrder(list) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].order !== i) { list[i].order = i; await S().put("docs", list[i]); }
  }
}
async function moveChapter(folderId, id, delta) {
  const list = await chaptersOf(folderId);
  const i = list.findIndex(d => d.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return false;
  const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
  await commitOrder(list);
  return true;
}

/* ---------- per-chapter state ----------
   A book is written in public a chapter at a time, so a chapter is
   either a draft you are still working on or something readers are
   allowed to see. A reading link only ever carries the published ones;
   that is the whole point of the distinction, so it is enforced where
   the chapters are gathered rather than left to each caller. */
function isPublished(d) { return !!(d && d.published); }
function publishedOnly(list) { return list.filter(isPublished); }
async function setChapterState(id, published) {
  const d = await S().get("docs", id);
  if (!d) return null;
  d.published = !!published;
  d.publishedAt = published ? (d.publishedAt || Date.now()) : null;
  await S().put("docs", d);
  return d;
}

/* ============================================================
   THE WORK PAGE   #/work/<folderId>
   ============================================================ */
async function viewWork(folderId) {
  const gen = window.Codex ? Codex.currentGen() : 0;
  await S().ready;
  const folders = await S().all("folders").catch(() => []);
  if (!folders.length) {
    view().innerHTML = `<div class="wrap">
      <div class="page-kicker">Your work</div>
      <h1 class="display">Nothing published yet</h1>
      <p class="muted">A work is a project: make one from the <b>+</b> beside Projects in the sidebar,
        file some documents into it, and it becomes a book with chapters.</p>
      <p><a class="btn" href="#/docs">Go to documents</a></p></div>`;
    return;
  }
  if (!folderId || !folders.some(f => f.id === folderId)) folderId = folders[0].id;
  const f = await folderOf(folderId);
  const chapters = await chaptersOf(folderId);
  const pub = f.publish || {};
  const total = chapters.reduce((n, c) => n + words(plain(c.html)), 0);
  const written = chapters.filter(c => words(plain(c.html)) > 0).length;
  const live = publishedOnly(chapters);
  const counts = pub.reactions || {};

  let comments = [];
  let shares = [];
  const st = C() && C().configured() ? C().state() : { signedIn: false };
  if (st.signedIn) {
    try { comments = await C().comments.list(); } catch (e) {}
    try { shares = await C().shares.list(); } catch (e) {}
  }

  if (window.Codex && Codex.isStale(gen)) return;
  view().innerHTML = `<div class="wrap wide work-page">
    <div class="work-head">
      <div class="work-cover" id="workCover">
        ${pub.cover ? `<img src="${esc(pub.cover)}" alt="Cover">`
      : `<div class="wc-empty"><div class="ornament">✦ ✧ ✦</div>Drop a cover<br><span>or click to choose</span></div>`}
        <input type="file" id="workCoverFile" accept="image/*" hidden>
      </div>
      <div class="work-meta">
        <div class="page-kicker">${esc(pub.genre || "Unfiled")} · ${esc(pub.status || "Draft")}${
          pub.schedule ? " · " + esc(pub.schedule) : ""}</div>
        <h1 class="display work-title">${esc(f.name)}</h1>
        <div class="work-by">${pub.author ? "by " + esc(pub.author) : "by you"}${
          pub.series ? " · " + esc(pub.series) : ""}</div>
        ${(pub.tags || []).length ? `<div class="work-tags">${pub.tags.map(t =>
          `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
        <div class="work-reacts">${REACTIONS.map(([id, glyph, label]) =>
          `<span class="react"><span class="rg">${glyph}</span>${esc(label)}
            <span class="rn">${counts[id] || 0}</span></span>`).join("")}</div>
      </div>
      <div class="work-side">
        <a class="btn" href="#/read/${encodeURIComponent(folderId)}">Start reading</a>
        <button class="btn ghost sm" id="workNewCh">New chapter</button>
        <button class="btn ghost sm" id="workEdit">Edit details</button>
        <button class="btn ghost sm" id="workShare">Share…</button>
        <button class="btn ghost sm danger" id="workDelete">Delete this work</button>
        <div class="work-stat">${total.toLocaleString()} words · ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}${
          written < chapters.length ? ` · ${written} written` : ""}</div>
      </div>
    </div>

    ${folders.length > 1 ? `<div class="atlas-bar">${folders.map(x =>
      `<button class="a-chip${x.id === folderId ? " on" : ""}" data-work="${esc(x.id)}">${esc(x.name)}</button>`).join("")}</div>` : ""}

    <div class="work-grid">
      <div>
        <div class="rule-head"><span class="k">Blurb</span><span class="hr"></span></div>
        <p class="work-blurb">${pub.blurb ? esc(pub.blurb)
      : `<span class="faint">No blurb yet. <b>Edit details</b> to write the few lines a reader sees first.</span>`}</p>

        <div class="rule-head mt"><span class="k">Chapters</span><span class="hr"></span>
          <span class="meta">${live.length} of ${chapters.length} published</span></div>
        ${chapters.length ? `<div class="ch-list">${chapters.map((c, i) => {
          const w = words(plain(c.html));
          const pub = isPublished(c);
          const empty = !w;
          return `<div class="work-ch${pub ? " live" : ""}" data-ch="${esc(c.id)}">
            <span class="wch-n">${i + 1}</span>
            <a class="wch-title" href="#/doc/${encodeURIComponent(c.id)}">${esc(c.title || "Untitled")}</a>
            <span class="wch-meta">${w ? w.toLocaleString() + " words" : "empty"}</span>
            <span class="wch-state ${pub ? "on" : ""}">${pub ? "Published" : "Draft"}</span>
            <span class="wch-tools">
              <button class="a-chip" data-up="${esc(c.id)}" title="Move earlier" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="a-chip" data-down="${esc(c.id)}" title="Move later" ${i === chapters.length - 1 ? "disabled" : ""}>↓</button>
              <button class="a-chip${pub ? "" : " go"}" data-pub="${esc(c.id)}"
                ${empty && !pub ? "disabled title='Nothing written yet'" : ""}>${pub ? "Unpublish" : "Publish"}</button>
              <button class="a-chip danger" data-chdel="${esc(c.id)}" title="Delete this chapter">✕</button>
            </span>
          </div>`;
        }).join("")}</div>
        <p class="faint" style="margin:10px 0 0">A reading link carries only the published chapters.
          Drafts stay yours until you say otherwise.</p>`
        : `<div class="empty-state">No chapters yet.
          <button class="btn sm" id="workNewCh2" style="margin-top:12px">Write the first chapter</button></div>`}
        ${chapters.length ? `<button class="btn ghost sm" id="workNewCh3" style="margin-top:12px">Add another chapter</button>` : ""}

        <div class="rule-head mt"><span class="k">Comments</span><span class="hr"></span>
          <span class="meta">${comments.length}${st.signedIn ? "" : " · sign in to see"}</span></div>
        <div id="workComments"></div>
      </div>

      <aside class="work-rail">
        <div class="gold-card">
          <div class="gold-card-head">✦ The community ✦</div>
          <div id="communityCard"><p class="faint" style="font-size:13px">Checking…</p></div>
        </div>
        <div class="gold-card" style="margin-top:14px">
          <div class="gold-card-head">✦ Share privately ✦</div>
          <div id="shareList"></div>
        </div>
      </aside>
    </div>
  </div>`;

  $$("[data-work]").forEach(b => b.onclick = () => { location.hash = "#/work/" + encodeURIComponent(b.dataset.work); });
  $("#workEdit").onclick = () => editDetails(f);
  $("#workShare").onclick = () => makeShare(folderId, f.name);
  // three entry points, one action: a chapter is a document already
  // filed into this work, so you never have to go and file it yourself
  ["#workNewCh", "#workNewCh2", "#workNewCh3"].forEach(sel => {
    const b = $(sel); if (b) b.onclick = () => newChapter(f, chapters.length);
  });
  const again = () => viewWork(folderId);
  $$("[data-up]").forEach(b => b.onclick = async () => {
    if (await moveChapter(folderId, b.dataset.up, -1)) again();
  });
  $$("[data-down]").forEach(b => b.onclick = async () => {
    if (await moveChapter(folderId, b.dataset.down, 1)) again();
  });
  $$("[data-pub]").forEach(b => b.onclick = async () => {
    const id = b.dataset.pub;
    const cur = chapters.find(c => c.id === id);
    const next = !isPublished(cur);
    // publishing is the outward-facing move, so it says what it means
    if (next && !confirm(`Publish “${cur.title || "Untitled"}”?\n\nAnyone holding a reading link for this work will be able to read it.`)) return;
    await setChapterState(id, next);
    toast(next ? "Chapter published" : "Back to draft");
    again();
  });
  $$("[data-chdel]").forEach(b => b.onclick = async () => {
    const id = b.dataset.chdel;
    const cur = chapters.find(c => c.id === id);
    if (!confirm(`Delete “${cur.title || "Untitled"}”?\n\nThis removes the chapter and what is written in it.`)) return;
    await S().del("docs", id);
    const rest = (await chaptersOf(folderId));
    await commitOrder(rest);
    toast("Chapter deleted");
    again();
  });
  $("#workDelete").onclick = async () => {
    if (!window.CodexFolders) return;
    if (await CodexFolders.confirmRemove(folderId, f.name)) location.hash = "#/work";
  };
  bindCover(f);
  renderComments(comments, st);
  renderShares(shares, st, folderId);
  renderCommunityCard(folderId, f, st, live.length);
}

/* ---------- the community card ----------
   Publishing here is the loud version of a reading link: the published
   chapters are COPIED to the public shelves where anyone can find them.
   The card says which of the two states the work is in and what the
   community has made of it so far. */
async function renderCommunityCard(folderId, f, st, liveCount) {
  const box = $("#communityCard");
  if (!box) return;
  const B = window.CodexBooks;
  if (!B || !C() || !C().configured()) {
    box.innerHTML = `<p class="faint" style="font-size:13px;line-height:1.5">Needs a connected database;
      see <code>supabase/README.md</code>.</p>`;
    return;
  }
  if (!st.signedIn) {
    box.innerHTML = `<p class="faint" style="font-size:13px;line-height:1.5">Sign in from
      <a href="#/settings">Settings → Account</a> to put this on the public shelves.</p>`;
    return;
  }
  let out = null;
  try { out = await B.communityCopyOf(folderId); } catch (e) {}
  if (!out) {
    box.innerHTML = `
      <p class="faint" style="font-size:13px;line-height:1.5">Not on the shelves yet. Publishing copies
        the <b>published</b> chapters (${liveCount} right now) where anyone can read, kudos and comment.
        Drafts stay home.</p>
      <button class="btn sm" id="commGo" style="width:100%" ${liveCount ? "" : "disabled title='Publish a chapter first'"}>Publish to the community</button>`;
    const go = $("#commGo");
    if (go) go.onclick = async () => {
      go.disabled = true; go.textContent = "Publishing…";
      try {
        const id = await B.publishWork(folderId);
        if (id) { toast("On the shelves ✦"); viewWork(folderId); }
        else { go.disabled = false; go.textContent = "Publish to the community"; }
      } catch (e) { toast(e.message || String(e)); go.disabled = false; go.textContent = "Publish to the community"; }
    };
    return;
  }
  const stale = (f.publish && f.publish.communityAt || 0) < (f.updated || 0);
  box.innerHTML = `
    <div class="comm-stats">
      <span><b>${(+out.reads || 0).toLocaleString()}</b> reads</span>
      <span><b>${out.kudos_count}</b> kudos</span>
      <span><b>${out.library_count}</b> in libraries</span>
      <span><b>${out.comment_count}</b> comments</span>
    </div>
    <a class="btn ghost sm" style="width:100%;margin-top:8px" href="#/book/${esc(out.id)}">View public page</a>
    <button class="btn sm" id="commUpdate" style="width:100%;margin-top:8px">${stale ? "Update the community copy" : "Republish latest"}</button>
    <button class="btn ghost sm danger" id="commDown" style="width:100%;margin-top:8px">Take it down</button>`;
  $("#commUpdate").onclick = async () => {
    try { await B.publishWork(folderId); toast("Community copy updated"); viewWork(folderId); }
    catch (e) { toast(e.message || String(e)); }
  };
  $("#commDown").onclick = async () => {
    if (!confirm("Take this book off the community shelves?\n\nReaders lose access; its kudos, comments and library saves go with it. Your work here is untouched.")) return;
    try { await B.unpublishWork(out.id); toast("Taken down"); viewWork(folderId); }
    catch (e) { toast(e.message || String(e)); }
  };
}

/* A chapter is not a separate kind of thing; it is a document filed
   into this work. Making one from here does the filing for you and
   drops you straight into it, which is what "add a chapter" should
   mean; hunting for Documents and setting a project afterwards is the
   step that made this confusing. */
async function newChapter(f, existing) {
  // the same numbering the Books page uses, so the two never disagree
  const suggested = window.CodexEditor && CodexEditor.nextChapterTitle
    ? await CodexEditor.nextChapterTitle(f.id)
    : "Chapter " + (existing + 1);
  const title = prompt("Chapter title:", suggested);
  if (title === null) return;
  const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await S().put("docs", {
    id, title: (title.trim() || suggested).slice(0, 200),
    html: "", folder: f.id, updated: Date.now(),
  });
  toast("Chapter added to “" + f.name + "”");
  location.hash = "#/doc/" + encodeURIComponent(id);
}

/* ---------- cover ---------- */
function bindCover(f) {
  const box = $("#workCover"), input = $("#workCoverFile");
  if (!box) return;
  const take = async (file) => {
    if (!file) return;
    try {
      const url = await window.CodexImg.fileToScaledDataURL(file, 900, 0.85);
      f.publish = Object.assign({}, f.publish, { cover: url });
      await S().put("folders", f);
      if (window.CodexFolders) await CodexFolders.ensureCache(true);
      toast("Cover set");
      viewWork(f.id);
    } catch (e) { toast("Couldn't read that image"); }
  };
  box.onclick = () => input.click();
  input.onchange = () => take(input.files[0]);
  box.ondragover = e => { e.preventDefault(); box.classList.add("over"); };
  box.ondragleave = () => box.classList.remove("over");
  box.ondrop = e => { e.preventDefault(); box.classList.remove("over"); take(e.dataTransfer.files[0]); };
}

/* ---------- the details a reader sees ---------- */
function editDetails(f) {
  const pub = f.publish || {};
  let el = document.getElementById("workDetails");
  if (el) el.remove();
  el = document.createElement("div");
  el.id = "workDetails";
  el.className = "export-menu";
  el.innerHTML = `<div class="export-box wide-box">
    <div class="export-title">Details for “${esc(f.name)}”</div>
    <label class="wd-row"><span>Author name</span>
      <input class="import-title" id="wdAuthor" value="${esc(pub.author || "")}" placeholder="How you want to be credited"></label>
    <label class="wd-row"><span>Series</span>
      <input class="import-title" id="wdSeries" value="${esc(pub.series || "")}" placeholder="e.g. World Without God, book two"></label>
    <label class="wd-row"><span>Genre</span>
      <select class="folder-select" id="wdGenre">${GENRES.map(g =>
        `<option ${g === pub.genre ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
    <label class="wd-row"><span>Status</span>
      <select class="folder-select" id="wdStatus">${STATUSES.map(s =>
        `<option ${s === pub.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <label class="wd-row"><span>Schedule</span>
      <input class="import-title" id="wdSchedule" value="${esc(pub.schedule || "")}" placeholder="e.g. Updates Fridays"></label>
    <label class="wd-row"><span>Tags</span>
      <input class="import-title" id="wdTags" value="${esc((pub.tags || []).join(", "))}" placeholder="Comma separated"></label>
    <label class="wd-row"><span>Mature</span>
      <span class="wd-check"><input type="checkbox" id="wdMature" ${pub.mature ? "checked" : ""}>
        <span class="faint" style="font-size:13px">18+; hidden on Discover unless a reader opts in</span></span></label>
    <label class="wd-row col"><span>Blurb</span>
      <textarea class="import-body" id="wdBlurb" placeholder="The few lines a reader sees first.">${esc(pub.blurb || "")}</textarea></label>
    <div class="wd-btns">
      <button class="btn" id="wdSave">Save</button>
      <button class="btn ghost" id="wdCancel">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => { if (e.target === el) el.remove(); });
  $("#wdCancel", el).onclick = () => el.remove();
  $("#wdSave", el).onclick = async () => {
    f.publish = Object.assign({}, f.publish, {
      author: $("#wdAuthor", el).value.trim(),
      series: $("#wdSeries", el).value.trim(),
      genre: $("#wdGenre", el).value,
      status: $("#wdStatus", el).value,
      schedule: $("#wdSchedule", el).value.trim(),
      tags: $("#wdTags", el).value.split(",").map(t => t.trim()).filter(Boolean).slice(0, 12),
      mature: $("#wdMature", el).checked,
      blurb: $("#wdBlurb", el).value.trim(),
    });
    await S().put("folders", f);
    if (window.CodexFolders) await CodexFolders.ensureCache(true);
    el.remove();
    toast("Saved");
    viewWork(f.id);
  };
}

/* ---------- share links ---------- */
function renderShares(shares, st, folderId) {
  const box = $("#shareList");
  if (!box) return;
  if (!C() || !C().configured()) {
    box.innerHTML = `<p class="faint" style="font-size:13px;line-height:1.5">No cloud is connected, so there
      is nothing to share from; this work lives only in this browser. Connect a database to hand out a
      reading link.</p>`;
    return;
  }
  if (!st.signedIn) {
    box.innerHTML = `<p class="faint" style="font-size:13px;line-height:1.5">Sign in from
      <a href="#/settings">Settings → Account</a> to create a reading link.</p>`;
    return;
  }
  box.innerHTML = shares.length ? shares.map(s => `
    <div class="share-row">
      <div class="sh-label">${esc(s.label || (s.scope === "workspace" ? "Whole workspace" : "One work"))}
        ${s.can_comment ? `<span class="sh-tag">comments on</span>` : ""}</div>
      <input class="sh-url" readonly value="${esc(C().shares.url(s.token))}">
      <div class="sh-acts">
        <button class="a-chip" data-copy="${esc(s.token)}">Copy link</button>
        <button class="a-chip" data-revoke="${esc(s.id)}">Revoke</button>
      </div>
    </div>`).join("")
    : `<p class="faint" style="font-size:13px;line-height:1.5">No links yet. <b>Share…</b> makes one you can
       send to a reader; they need no account, and you can revoke it at any time.</p>`;

  $$("[data-copy]", box).forEach(b => b.onclick = () => {
    const url = C().shares.url(b.dataset.copy);
    navigator.clipboard ? navigator.clipboard.writeText(url).then(() => toast("Link copied"))
      : window.prompt("Copy this link:", url);
  });
  $$("[data-revoke]", box).forEach(b => b.onclick = async () => {
    if (!confirm("Revoke this link? Anyone holding it loses access immediately.")) return;
    try { await C().shares.revoke(b.dataset.revoke); toast("Revoked"); viewWork(folderId); }
    catch (e) { toast(e.message || String(e)); }
  });
}

async function makeShare(folderId, name) {
  if (!C() || !C().configured()) return toast("Connect a database first; see supabase/README.md");
  const st = C().state();
  if (!st.signedIn) { toast("Sign in first"); location.hash = "#/settings"; return; }
  const whole = confirm(`Share the whole workspace?\n\nOK; everything in this workspace.\nCancel; just “${name}”.`);
  try {
    await C().shares.create(whole ? "workspace" : folderId, whole ? "Whole workspace" : name, true);
    toast("Link created");
    viewWork(folderId);
  } catch (e) { toast(e.message || String(e)); }
}

/* ---------- comments ---------- */
function renderComments(comments, st) {
  const box = $("#workComments");
  if (!box) return;
  if (!st.signedIn) {
    box.innerHTML = `<p class="faint" style="font-size:13.5px">Comments arrive through a reading link.
      Sign in to see them.</p>`;
    return;
  }
  if (!comments.length) {
    box.innerHTML = `<div class="empty-state">Nothing yet. Send someone a reading link and whatever they
      say lands here, and on your Desk.</div>`;
    return;
  }
  box.innerHTML = comments.map(c => {
    const who = c.author_name || (c.author_id ? "You" : "A reader");
    return `<div class="work-comment${c.resolved ? " done" : ""}">
      <span class="wc-initial">${esc(who.charAt(0).toUpperCase())}</span>
      <div class="wc-body">
        <div class="wc-top"><span class="wc-name">${esc(who)}</span>
          <span class="wc-where">${new Date(c.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span></div>
        <div class="wc-text">${esc(c.body)}</div>
        <div class="wc-acts"><button class="a-chip" data-resolve="${esc(c.id)}" data-on="${c.resolved ? 1 : 0}">${
          c.resolved ? "Reopen" : "Mark read"}</button></div>
      </div>
    </div>`;
  }).join("");
  $$("[data-resolve]", box).forEach(b => b.onclick = async () => {
    try { await C().comments.resolve(b.dataset.resolve, b.dataset.on !== "1"); location.reload(); }
    catch (e) { toast(e.message || String(e)); }
  });
}

/* ============================================================
   THE READER'S VIEW   #/shared/<token>
   No account, no sidebar, nothing but the work.
   ============================================================ */
async function viewShared(token) {
  const app = $("#app");
  if (app) app.classList.add("reader-mode");
  view().innerHTML = `<div class="wrap"><div class="empty-state">Opening…</div></div>`;

  if (!C() || !C().configured()) {
    view().innerHTML = `<div class="wrap"><div class="empty-state">This link needs a connected database.</div></div>`;
    return;
  }
  let rows = [];
  try { rows = await C().reader.read(token); }
  catch (e) {
    view().innerHTML = `<div class="wrap"><div class="page-kicker">Reading link</div>
      <h1 class="display">This link doesn't work</h1>
      <p class="muted">It may have been revoked, or mistyped. Ask whoever sent it for a new one.</p></div>`;
    return;
  }
  if (!rows.length) {
    view().innerHTML = `<div class="wrap"><div class="page-kicker">Reading link</div>
      <h1 class="display">Nothing to read here yet</h1>
      <p class="muted">The link works, but the author hasn't written anything into it.</p></div>`;
    return;
  }

  const byStore = {};
  rows.forEach(r => { (byStore[r.store] = byStore[r.store] || []).push(r.data); });
  const folders = byStore.folders || [];
  /* A reader sees published chapters only. The share token may well
     cover the whole project, drafts and all; the filter is here, at the
     point of display, so an unfinished chapter cannot appear just because
     the link was made before it was written. */
  const all = (byStore.docs || []).sort(chapterOrder);
  const docs = publishedOnly(all);
  const held = all.length - docs.length;
  const f = folders[0] || {};
  const pub = f.publish || {};
  const total = docs.reduce((n, d) => n + words(plain(d.html)), 0);

  if (!docs.length) {
    view().innerHTML = `<div class="wrap"><div class="page-kicker">Reading link</div>
      <h1 class="display">${esc(f.name || "A work in progress")}</h1>
      <p class="muted">No chapters have been published yet. The link stays good; come back when
        the first one goes up.</p></div>`;
    return;
  }

  view().innerHTML = `<div class="reader">
    <div class="reader-top">
      ${pub.cover ? `<div class="reader-cover"><img src="${esc(pub.cover)}" alt="Cover"></div>` : ""}
      <div>
        <div class="page-kicker">${esc(pub.genre || "")}${pub.status ? " · " + esc(pub.status) : ""}</div>
        <h1 class="display">${esc(f.name || "A work in progress")}</h1>
        <div class="work-by">${pub.author ? "by " + esc(pub.author) : ""}${pub.series ? " · " + esc(pub.series) : ""}</div>
        <div class="work-stat">${total.toLocaleString()} words · ${docs.length} chapter${docs.length === 1 ? "" : "s"}${
          held ? " · " + held + " still being written" : ""}</div>
      </div>
    </div>
    ${pub.blurb ? `<p class="reader-blurb">${esc(pub.blurb)}</p>` : ""}
    ${docs.map((d, i) => {
      const text = plain(d.html).trim();
      return `<section class="read-ch">
        <div class="rch-head"><div class="ornament">✧ ✦ ✧</div>
          <div class="rch-kicker">Chapter ${i + 1}</div>
          <div class="rch-title">${esc(d.title || "Untitled")}</div></div>
        ${text ? text.split(/\n{1,}/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("")
        : `<p class="faint">Not written yet.</p>`}
      </section>`;
    }).join("")}
    <div class="reader-say">
      <div class="rule-head"><span class="k">Leave the author a note</span><span class="hr"></span></div>
      <p class="faint">Be kind; authors read every one.</p>
      <input class="import-title" id="rsName" placeholder="Your name (optional)">
      <textarea class="import-body" id="rsBody" placeholder="What did you think?"></textarea>
      <button class="btn" id="rsSend">Send</button>
      <div class="auth-msg" id="rsMsg"></div>
    </div>
    <div class="read-end">✦✧✦<div>Shared with you by the author. Nothing you read here is public.</div></div>
  </div>`;

  $("#rsSend").onclick = async () => {
    const body = $("#rsBody").value.trim();
    const msg = $("#rsMsg");
    if (!body) { msg.textContent = "Write something first."; return; }
    msg.textContent = "Sending…";
    try {
      await C().reader.comment(token, f.id || "workspace", $("#rsName").value.trim(), body);
      $("#rsBody").value = "";
      msg.textContent = "Sent. Thank you.";
    } catch (e) { msg.textContent = e.message || String(e); }
  };
}

window.CodexPublish = {
  chaptersOf, chapterOrder, publishedOnly, isPublished, setChapterState, moveChapter, commitOrder, work: viewWork, shared: viewShared, GENRES, REACTIONS };
})();
