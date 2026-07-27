/* ============================================================
   THE COMMUNITY LIBRARY; public books, readers, and authors

   This is the Wattpad/AO3 half of the app: the tables in Supabase
   that anyone can browse. Publishing COPIES the published chapters
   of a work into the community; your workspace itself never leaves
   the private side. Unpublishing deletes the copy.

   Browsing needs no account. Stars work signed out (an anonymous
   key this browser keeps); everything with a name on it; comments,
   follows, your library; asks you to sign in and pick a pen name.
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

function rel(t) {
  const s = Math.round((Date.now() - new Date(t)) / 1000);
  if (s < 90) return "just now";
  const m = Math.round(s / 60); if (m < 60) return m + " min ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24); if (d < 30) return d + "d ago";
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
const nice = n => {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
};
const toastMsg = m => window.toast && toast(m);

/* ============================================================
   API; every community read and write goes through here
   ============================================================ */
const sb = () => (C() && C().configured()) ? C().client() : null;
const me = () => { const st = C() ? C().state() : {}; return st.signedIn ? st.userId : ""; };
const ready = () => !!sb();

const BOOK_COLS = "id,owner,local_folder_id,title,blurb,cover,genre,tags,status,mature,visibility,language," +
  "word_count,chapter_count,reads,star_count,library_count,comment_count,created_at,updated_at," +
  "community_profiles(name,avatar,follower_count,book_count)";
const BOOK_LIST_COLS = BOOK_COLS;

async function myProfile() {
  if (!me()) return null;
  const { data } = await sb().from("community_profiles").select("*").eq("id", me()).maybeSingle();
  return data || null;
}
async function saveProfile(p) {
  const row = { id: me(), name: p.name, bio: p.bio || "", avatar: p.avatar || {} };
  const { data, error } = await sb().from("community_profiles")
    .upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return data;
}

/* browse the shelves. q searches title and blurb; "#tag" searches tags. */
async function browse(opts) {
  opts = opts || {};
  /* the RLS would hide other people's private books anyway; the filter
     also keeps YOUR private ones off the public shelves you browse */
  let q = sb().from("community_books").select(BOOK_LIST_COLS).eq("visibility", "public");
  if (opts.genre) q = q.eq("genre", opts.genre);
  if (!opts.matureOk) q = q.eq("mature", false);
  const term = String(opts.q || "").trim();
  if (term.startsWith("#") && term.length > 1) q = q.contains("tags", [term.slice(1)]);
  else if (term) {
    const safe = term.replace(/[,()%]/g, " ").trim();
    if (safe) q = q.or(`title.ilike.%${safe}%,blurb.ilike.%${safe}%`);
  }
  const sort = opts.sort || "updated";
  if (sort === "new") q = q.order("created_at", { ascending: false });
  else if (sort === "reads") q = q.order("reads", { ascending: false });
  else if (sort === "stars") q = q.order("star_count", { ascending: false });
  else q = q.order("updated_at", { ascending: false });
  const from = opts.offset || 0;
  const { data, error } = await q.range(from, from + (opts.limit || 24) - 1);
  if (error) throw error;
  return data || [];
}

async function getBook(id) {
  const { data, error } = await sb().from("community_books").select(BOOK_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
async function getChapters(bookId) {
  const { data, error } = await sb().from("community_chapters")
    .select("id,local_id,position,title,word_count,updated_at")
    .eq("book_id", bookId).order("position", { ascending: true });
  if (error) throw error;
  return data || [];
}
async function chapterAt(bookId, pos) {
  const { data, error } = await sb().from("community_chapters").select("*")
    .eq("book_id", bookId).eq("position", pos).maybeSingle();
  if (error) throw error;
  return data;
}

/* what I have already done to this book: star, library, progress */
async function myEngagement(bookId) {
  const out = { starred: false, inLibrary: false, progress: null };
  if (!ready()) return out;
  if (me()) {
    const [k, l, p] = await Promise.all([
      sb().from("community_stars").select("id").eq("book_id", bookId).eq("user_id", me()).maybeSingle(),
      sb().from("community_library").select("book_id,chapters_seen").eq("book_id", bookId).eq("user_id", me()).maybeSingle(),
      sb().from("community_progress").select("chapter_pos,updated_at").eq("book_id", bookId).eq("user_id", me()).maybeSingle(),
    ]);
    out.starred = !!(k.data); out.inLibrary = !!(l.data); out.progress = p.data || null;
  } else {
    const { data } = await sb().from("community_stars").select("id")
      .eq("book_id", bookId).eq("guest_key", guestKey()).is("user_id", null).maybeSingle();
    out.starred = !!data;
  }
  return out;
}

/* stars: one per reader per book, guests included */
function guestKey() {
  let k = localStorage.getItem("codex.guestKey");
  if (!k) { k = "g" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("codex.guestKey", k); }
  return k;
}
async function toggleStar(bookId, on) {
  if (me()) {
    if (on) { const { error } = await sb().from("community_stars").insert({ book_id: bookId, user_id: me() }); if (error && error.code !== "23505") throw error; }
    else { const { error } = await sb().from("community_stars").delete().eq("book_id", bookId).eq("user_id", me()); if (error) throw error; }
  } else {
    if (!on) return false;   // guests can give a star, not retract one
    const { error } = await sb().rpc("community_star_guest", { book: bookId, key: guestKey() });
    if (error) throw error;
  }
  return true;
}

async function setLibrary(bookId, on, chaptersSeen) {
  if (!me()) throw new Error("Sign in to keep a library");
  if (on) {
    const { error } = await sb().from("community_library")
      .upsert({ user_id: me(), book_id: bookId, chapters_seen: chaptersSeen || 0 }, { onConflict: "user_id,book_id" });
    if (error) throw error;
  } else {
    const { error } = await sb().from("community_library").delete().eq("book_id", bookId).eq("user_id", me());
    if (error) throw error;
  }
}
async function libraryList() {
  if (!me()) return [];
  const { data, error } = await sb().from("community_library")
    .select("book_id,chapters_seen,added_at,community_books(" + BOOK_LIST_COLS + ")")
    .eq("user_id", me()).order("added_at", { ascending: false });
  if (error) throw error;
  return (data || []).filter(r => r.community_books);
}
async function markSeen(bookId, count) {
  if (!me()) return;
  await sb().from("community_library").update({ chapters_seen: count })
    .eq("book_id", bookId).eq("user_id", me());
}

async function toggleFollow(authorId, on) {
  if (!me()) throw new Error("Sign in to follow authors");
  if (on) { const { error } = await sb().from("community_follows").insert({ follower: me(), author: authorId }); if (error && error.code !== "23505") throw error; }
  else { const { error } = await sb().from("community_follows").delete().eq("follower", me()).eq("author", authorId); if (error) throw error; }
}
async function following() {
  if (!me()) return [];
  const { data, error } = await sb().from("community_follows")
    .select("author,created_at,community_profiles!community_follows_author_fkey(id,name,avatar,follower_count,book_count)")
    .eq("follower", me());
  if (error) throw error;
  return data || [];
}
async function amFollowing(authorId) {
  if (!me()) return false;
  const { data } = await sb().from("community_follows").select("author")
    .eq("follower", me()).eq("author", authorId).maybeSingle();
  return !!data;
}
async function feed() {
  const fs = await following();
  const ids = fs.map(f => f.author);
  if (!ids.length) return { follows: fs, books: [] };
  const { data, error } = await sb().from("community_books").select(BOOK_LIST_COLS)
    .in("owner", ids).order("updated_at", { ascending: false }).limit(40);
  if (error) throw error;
  return { follows: fs, books: data || [] };
}

async function listComments(bookId, chapterId) {
  let q = sb().from("community_comments")
    .select("id,book_id,chapter_id,parent_id,author_id,body,deleted,created_at,community_profiles(name,avatar)")
    .eq("book_id", bookId).order("created_at", { ascending: true }).limit(400);
  q = chapterId ? q.eq("chapter_id", chapterId) : q.is("chapter_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
async function addComment(bookId, chapterId, parentId, body) {
  if (!me()) throw new Error("Sign in to comment");
  const { data, error } = await sb().from("community_comments")
    .insert({ book_id: bookId, chapter_id: chapterId || null, parent_id: parentId || null, author_id: me(), body })
    .select("id").single();
  if (error) throw error;
  return data;
}
async function removeComment(id) {
  const { error } = await sb().from("community_comments").update({ deleted: true }).eq("id", id);
  if (error) throw error;
}

async function saveProgress(bookId, pos) {
  if (!me()) return;
  try {
    await sb().from("community_progress")
      .upsert({ user_id: me(), book_id: bookId, chapter_pos: pos, updated_at: new Date().toISOString() },
        { onConflict: "user_id,book_id" });
  } catch (e) {}
}
async function continueReading() {
  if (!me()) return [];
  const { data, error } = await sb().from("community_progress")
    .select("book_id,chapter_pos,updated_at,community_books(id,title,cover,chapter_count,community_profiles(name))")
    .eq("user_id", me()).order("updated_at", { ascending: false }).limit(6);
  if (error) throw error;
  return (data || []).filter(r => r.community_books);
}

/* a read counts once per book per browser per half-day; enough to
   mean something, cheap enough not to police */
function bumpReads(bookId) {
  try {
    const key = "codex.read." + bookId;
    const last = +(localStorage.getItem(key) || 0);
    if (Date.now() - last < 12 * 3600 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    sb().rpc("community_bump_reads", { book: bookId }).then(() => {});
  } catch (e) {}
}

async function authorProfile(id) {
  const { data, error } = await sb().from("community_profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
async function authorBooks(id) {
  const { data, error } = await sb().from("community_books").select(BOOK_LIST_COLS)
    .eq("owner", id).order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
async function myBooks() {
  if (!me()) return [];
  return authorBooks(me());
}

/* every comment left on any of my community books, newest first;
   the author's version of a mentions inbox */
async function commentsOnMyBooks() {
  if (!me()) return [];
  const mineList = await myBooks();
  if (!mineList.length) return [];
  const ids = mineList.map(b => b.id);
  const titles = {};
  mineList.forEach(b => { titles[b.id] = b.title; });
  const { data, error } = await sb().from("community_comments")
    .select("id,book_id,chapter_id,author_id,body,deleted,created_at,community_profiles(name,avatar)")
    .in("book_id", ids).eq("deleted", false)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).map(c => Object.assign({ book_title: titles[c.book_id] }, c));
}

async function listPosts(room) {
  const { data, error } = await sb().from("community_posts")
    .select("id,room,author_id,parent_id,body,deleted,created_at,community_profiles(name,avatar)")
    .eq("room", room).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data || [];
}
async function addPost(room, parentId, body) {
  if (!me()) throw new Error("Sign in to post");
  const { error } = await sb().from("community_posts")
    .insert({ room, parent_id: parentId || null, author_id: me(), body });
  if (error) throw error;
}
async function removePost(id) {
  const { error } = await sb().from("community_posts").update({ deleted: true }).eq("id", id);
  if (error) throw error;
}

/* ============================================================
   JOINING; the pen-name step, asked once
   ============================================================ */
let profileCache = null;
async function ensureProfile() {
  if (!me()) { toastMsg("Sign in first; Settings → Account"); location.hash = "#/settings"; return null; }
  if (profileCache && profileCache.id === me()) return profileCache;
  const have = await myProfile();
  if (have) { profileCache = have; return have; }
  return new Promise(resolve => openProfileModal(null, resolve));
}

function openProfileModal(existing, done) {
  let el = document.getElementById("penModal");
  if (el) el.remove();
  el = document.createElement("div");
  el.id = "penModal";
  el.className = "export-menu";
  const st = C().state();
  const guess = (existing && existing.name) || (window.CodexAccount && CodexAccount.current && (CodexAccount.current() || {}).name) || (st.email || "").split("@")[0] || "";
  el.innerHTML = `<div class="export-box wide-box">
    <div class="export-title">${existing ? "Your community profile" : "Join the community"}</div>
    <p class="faint" style="font-size:13.5px;line-height:1.55;margin:0 0 12px">${existing ? ""
      : "Publishing, commenting and following happen under a pen name. Pick yours; it is the only thing readers ever see, and you can change it any time."}</p>
    <label class="wd-row"><span>Pen name</span>
      <input class="import-title" id="penName" maxlength="60" value="${esc(existing ? existing.name : guess)}" placeholder="How readers will know you"></label>
    <label class="wd-row col"><span>About you</span>
      <textarea class="import-body" id="penBio" maxlength="600" placeholder="A line or two for your author page. Optional.">${esc(existing ? existing.bio : "")}</textarea></label>
    <div class="wd-btns">
      <button class="btn" id="penSave">${existing ? "Save" : "Join"}</button>
      <button class="btn ghost" id="penCancel">Cancel</button>
    </div>
    <div class="auth-msg" id="penMsg"></div>
  </div>`;
  document.body.appendChild(el);
  const close = v => { el.remove(); done && done(v); };
  el.addEventListener("click", e => { if (e.target === el) close(null); });
  $("#penCancel", el).onclick = () => close(null);
  $("#penSave", el).onclick = async () => {
    const name = $("#penName", el).value.trim();
    if (!name) { $("#penMsg", el).textContent = "A pen name is the one required thing."; return; }
    $("#penMsg", el).textContent = "Saving…";
    try {
      /* carry the private avatar across so the author page has a face */
      let av = (existing && existing.avatar) || {};
      if (!Object.keys(av).length) {
        try { const { data } = await sb().from("profiles").select("avatar").eq("id", me()).maybeSingle();
          if (data && data.avatar) av = data.avatar; } catch (e) {}
      }
      const p = await saveProfile({ name, bio: $("#penBio", el).value.trim(), avatar: av });
      profileCache = p;
      toastMsg(existing ? "Profile saved" : "Welcome to the community, " + p.name);
      close(p);
    } catch (e) { $("#penMsg", el).textContent = e.message || String(e); }
  };
}

/* ============================================================
   PUBLISHING; copy a work's published chapters into the community
   ============================================================ */
async function communityCopyOf(folderId) {
  if (!ready() || !me()) return null;
  const { data } = await sb().from("community_books").select(BOOK_COLS)
    .eq("owner", me()).eq("local_folder_id", folderId).maybeSingle();
  return data || null;
}

async function publishWork(folderId) {
  if (!ready()) { toastMsg("Connect a database first; see supabase/README.md"); return null; }
  const profile = await ensureProfile();
  if (!profile) return null;

  const folders = await S().all("folders").catch(() => []);
  const f = folders.find(x => x.id === folderId);
  if (!f) { toastMsg("That work no longer exists"); return null; }
  const pub = f.publish || {};
  const chapters = window.CodexPublish ? await CodexPublish.chaptersOf(folderId) : [];
  const live = window.CodexPublish ? CodexPublish.publishedOnly(chapters) : [];
  if (!live.length) {
    toastMsg("Publish at least one chapter first; the community copy carries only published chapters");
    return null;
  }

  const bookRow = {
    owner: me(),
    local_folder_id: folderId,
    title: f.name.slice(0, 200),
    blurb: (pub.blurb || "").slice(0, 2000),
    cover: pub.cover || null,
    genre: pub.genre || "",
    tags: (pub.tags || []).slice(0, 12),
    status: pub.status || "Ongoing",
    mature: !!pub.mature,
    visibility: pub.visibility === "private" ? "private" : "public",
  };
  const { data: book, error } = await sb().from("community_books")
    .upsert(bookRow, { onConflict: "owner,local_folder_id" }).select("id").single();
  if (error) throw error;

  const rows = live.map((d, i) => ({
    book_id: book.id, local_id: String(d.id), position: i,
    title: (d.title || "Untitled").slice(0, 200),
    content: plain(d.html).trim(),
    word_count: words(plain(d.html)),
    updated_at: new Date().toISOString(),
  }));
  const { error: chErr } = await sb().from("community_chapters")
    .upsert(rows, { onConflict: "book_id,local_id" });
  if (chErr) throw chErr;

  /* chapters unpublished or deleted since last time come off the copy */
  const keep = rows.map(r => r.local_id);
  await sb().from("community_chapters").delete().eq("book_id", book.id)
    .not("local_id", "in", "(" + keep.map(k => '"' + k + '"').join(",") + ")");

  f.publish = Object.assign({}, f.publish, { communityId: book.id, communityAt: Date.now() });
  await S().put("folders", f);
  return book.id;
}

async function unpublishWork(bookId) {
  const { error } = await sb().from("community_books").delete().eq("id", bookId);
  if (error) throw error;
}

/* hide or reshow without destroying anything: a private book keeps its
   stars, comments and library saves for whenever it comes back */
async function setVisibility(bookId, vis) {
  const { error } = await sb().from("community_books")
    .update({ visibility: vis === "private" ? "private" : "public" }).eq("id", bookId);
  if (error) throw error;
}

/* ============================================================
   SHARED PIECES; cards, stats, comments
   ============================================================ */
function statBits(b) {
  return `<span class="bk-stats">
    <span title="Reads">◉ ${nice(b.reads)}</span>
    <span title="Stars">★ ${nice(b.star_count)}</span>
    <span title="Chapters">☰ ${b.chapter_count}</span>
    <span title="In libraries">✦ ${nice(b.library_count)}</span>
  </span>`;
}

function bookCard(b, extra) {
  const author = b.community_profiles ? b.community_profiles.name : "Unknown";
  return `<a class="book-card" href="#/book/${esc(b.id)}">
    <div class="bk-cover">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy">` : `<span class="ornament">✦ ✧ ✦</span>`}
      ${b.mature ? `<span class="bk-mature">18+</span>` : ""}
      ${extra && extra.badge ? `<span class="bk-new">${esc(extra.badge)}</span>` : ""}</div>
    <div class="bk-body">
      <div class="bk-kicker">${esc(b.genre || "Unfiled")} · ${esc(b.status || "")}</div>
      <div class="bk-title">${esc(b.title)}</div>
      <div class="bk-author">by ${esc(author)}</div>
      ${statBits(b)}
      ${b.blurb ? `<div class="bk-blurb">${esc(b.blurb.slice(0, 150))}${b.blurb.length > 150 ? "…" : ""}</div>` : ""}
    </div>
  </a>`;
}

function avatarOf(p, size) {
  const av = p && p.avatar;
  if (av && window.CodexAvatar && Object.keys(av).length) return CodexAvatar.draw(av, size || 34);
  const ch = ((p && p.name) || "?").charAt(0).toUpperCase();
  return `<span class="wc-initial" style="width:${size || 34}px;height:${size || 34}px;line-height:${size || 34}px;font-size:${Math.round((size || 34) * .42)}px">${esc(ch)}</span>`;
}

/* one comment thread, one level of replies, with reply + moderation */
function commentThread(box, comments, ctx) {
  const roots = comments.filter(c => !c.parent_id);
  const kids = id => comments.filter(c => c.parent_id === id);
  const uid = me();
  const one = (c, isReply) => {
    const p = c.community_profiles || {};
    const mine = c.author_id === uid;
    const mod = ctx.ownerId && ctx.ownerId === uid;
    return `<div class="cm${isReply ? " cm-reply" : ""}" data-cm="${esc(c.id)}">
      ${avatarOf(p, isReply ? 24 : 30)}
      <div class="cm-body">
        <div class="cm-top">
          <a class="cm-name" href="#/author/${esc(c.author_id)}">${esc(p.name || "Someone")}</a>
          ${ctx.ownerId === c.author_id ? `<span class="cm-tag">author</span>` : ""}
          <span class="cm-when">${rel(c.created_at)}</span></div>
        <div class="cm-text">${c.deleted ? `<span class="faint">[removed]</span>` : esc(c.body)}</div>
        <div class="cm-acts">
          ${!isReply && !c.deleted ? `<button class="a-chip" data-reply="${esc(c.id)}">Reply</button>` : ""}
          ${(mine || mod) && !c.deleted ? `<button class="a-chip danger" data-rm="${esc(c.id)}">Remove</button>` : ""}
        </div>
        <div class="cm-replies">${kids(c.id).map(k => one(k, true)).join("")}</div>
        <div class="cm-replybox" id="rb-${esc(c.id)}" hidden>
          <textarea class="import-body sm" placeholder="Your reply…"></textarea>
          <button class="btn sm" data-sendreply="${esc(c.id)}">Send</button>
        </div>
      </div></div>`;
  };
  box.innerHTML = `
    <div class="cm-compose">
      <textarea class="import-body" id="cmNew" placeholder="${uid ? "Say something to the author and everyone reading…" : "Sign in to join the conversation."}" ${uid ? "" : "disabled"}></textarea>
      <div class="cm-compose-foot">
        ${uid ? `<button class="btn sm" id="cmSend">Comment</button>`
          : `<a class="btn ghost sm" href="#/settings">Sign in to comment</a>`}
      </div>
    </div>
    ${roots.length ? roots.map(c => one(c, false)).join("")
      : `<p class="faint" style="font-size:13.5px">Nothing here yet. Be the first.</p>`}`;

  const send = async (parentId, text) => {
    if (!text.trim()) return;
    const p = await ensureProfile();
    if (!p) return;
    try {
      await addComment(ctx.bookId, ctx.chapterId, parentId, text.trim().slice(0, 5000));
      toastMsg("Sent");
      ctx.refresh();
    } catch (e) { toastMsg(e.message || String(e)); }
  };
  const sendBtn = $("#cmSend", box);
  if (sendBtn) sendBtn.onclick = () => send(null, $("#cmNew", box).value);
  $$("[data-reply]", box).forEach(b => b.onclick = () => {
    const rb = $("#rb-" + CSS.escape(b.dataset.reply), box) || box.querySelector(`[id="rb-${b.dataset.reply}"]`);
    if (rb) { rb.hidden = !rb.hidden; if (!rb.hidden) rb.querySelector("textarea").focus(); }
  });
  $$("[data-sendreply]", box).forEach(b => b.onclick = () => {
    const rb = box.querySelector(`[id="rb-${b.dataset.sendreply}"]`);
    send(b.dataset.sendreply, rb.querySelector("textarea").value);
  });
  $$("[data-rm]", box).forEach(b => b.onclick = async () => {
    if (!confirm("Remove this comment?")) return;
    try { await removeComment(b.dataset.rm); ctx.refresh(); }
    catch (e) { toastMsg(e.message || String(e)); }
  });
}

function needsCloud() {
  view().innerHTML = `<div class="wrap"><div class="page-kicker">The community</div>
    <h1 class="display">No database connected</h1>
    <p class="muted">The community lives in the shared database, and this copy of the app is not
      pointed at one. See <code>supabase/README.md</code>.</p></div>`;
}

/* ============================================================
   THE BOOK PAGE   #/book/<id>
   ============================================================ */
async function viewBook(id) {
  const gen = window.Codex ? Codex.currentGen() : 0;
  if (!ready()) return needsCloud();
  view().innerHTML = `<div class="wrap wide"><div class="empty-state">Opening…</div></div>`;
  let b, chapters, mine;
  try {
    [b, chapters, mine] = await Promise.all([getBook(id), getChapters(id), myEngagement(id)]);
  } catch (e) {
    view().innerHTML = `<div class="wrap"><div class="empty-state">Couldn't open that book · ${esc(e.message || e)}</div></div>`;
    return;
  }
  if (!b) {
    view().innerHTML = `<div class="wrap"><div class="page-kicker">The community</div>
      <h1 class="display">That book isn't here</h1>
      <p class="muted">It may have been taken down by its author.
        <a href="#/community/discover">Back to Discover</a>.</p></div>`;
    return;
  }
  if (window.Codex && Codex.isStale(gen)) return;
  bumpReads(id);
  const author = b.community_profiles || {};
  const isMine = b.owner === me();
  const startPos = mine.progress ? Math.min(mine.progress.chapter_pos, Math.max(chapters.length - 1, 0)) : 0;
  const started = !!mine.progress && chapters.length;

  view().innerHTML = `<div class="wrap wide work-page">
    <div class="work-head">
      <div class="work-cover as-view">${b.cover ? `<img src="${esc(b.cover)}" alt="Cover">` : `<div class="wc-empty"><div class="ornament">✦ ✧ ✦</div></div>`}</div>
      <div class="work-meta">
        <div class="page-kicker">${esc(b.genre || "Unfiled")} · ${esc(b.status)}${b.mature ? " · 18+" : ""}</div>
        <h1 class="display work-title">${esc(b.title)}</h1>
        <div class="work-by">by <a class="bk-authorlink" href="#/author/${esc(b.owner)}">${esc(author.name || "Unknown")}</a></div>
        ${(b.tags || []).length ? `<div class="work-tags">${b.tags.map(t =>
          `<a class="chip" href="#/community/discover/${encodeURIComponent("#" + t)}">${esc(t)}</a>`).join("")}</div>` : ""}
        <div class="bk-bigstats">
          <span><b>${nice(b.reads)}</b> reads</span>
          <span><b>${nice(b.star_count)}</b> star${b.star_count === 1 ? "" : "s"}</span>
          <span><b>${nice(b.library_count)}</b> in libraries</span>
          <span><b>${b.word_count.toLocaleString()}</b> words</span>
        </div>
      </div>
      <div class="work-side">
        ${chapters.length ? `<a class="btn" href="#/book/${esc(id)}/${started ? startPos : 0}">${started && startPos > 0 ? "Continue · ch " + (startPos + 1) : "Start reading"}</a>` : ""}
        ${isMine ? `<a class="btn ghost sm" href="#/work/${esc(b.local_folder_id)}">Manage in My Works</a>`
        : `<button class="btn ghost sm${mine.starred ? " on" : ""}" id="bkStar">${mine.starred ? "★ Starred" : "☆ Leave a star"}</button>
           <button class="btn ghost sm${mine.inLibrary ? " on" : ""}" id="bkLib">${mine.inLibrary ? "✦ In your library" : "✦ Save to library"}</button>`}
        <button class="btn ghost sm" id="bkCopy">Copy link</button>
        <div class="work-stat">Updated ${rel(b.updated_at)}</div>
      </div>
    </div>

    <div class="work-grid">
      <div>
        ${b.blurb ? `<div class="rule-head"><span class="k">Blurb</span><span class="hr"></span></div>
          <p class="work-blurb">${esc(b.blurb)}</p>` : ""}
        <div class="rule-head mt"><span class="k">Chapters</span><span class="hr"></span>
          <span class="meta">${chapters.length}</span></div>
        <div class="ch-list">${chapters.map((c, i) => `
          <a class="work-ch live" href="#/book/${esc(id)}/${i}">
            <span class="wch-n">${i + 1}</span>
            <span class="wch-title">${esc(c.title || "Untitled")}</span>
            <span class="wch-meta">${(c.word_count || 0).toLocaleString()} words</span>
            ${mine.progress && mine.progress.chapter_pos === i ? `<span class="wch-state on">You are here</span>` : ""}
          </a>`).join("")}</div>

        <div class="rule-head mt"><span class="k">Conversation</span><span class="hr"></span>
          <span class="meta">${b.comment_count}</span></div>
        <div id="bkComments"><p class="faint">Loading…</p></div>
      </div>

      <aside class="work-rail">
        <div class="gold-card">
          <div class="gold-card-head">✦ The author ✦</div>
          <a class="auth-card" href="#/author/${esc(b.owner)}">
            ${avatarOf(author, 44)}
            <span class="ac-body"><span class="ac-name">${esc(author.name || "Unknown")}</span>
            <span class="ac-meta">${author.book_count || 0} book${author.book_count === 1 ? "" : "s"} · ${nice(author.follower_count || 0)} follower${author.follower_count === 1 ? "" : "s"}</span></span>
          </a>
          ${!isMine && ready() ? `<button class="btn ghost sm" id="bkFollow" style="width:100%;margin-top:10px">…</button>` : ""}
        </div>
      </aside>
    </div>
  </div>`;

  const refresh = () => viewBook(id);
  $("#bkCopy").onclick = () => {
    const url = location.origin + location.pathname + "#/book/" + id;
    navigator.clipboard ? navigator.clipboard.writeText(url).then(() => toastMsg("Link copied")) : window.prompt("Copy:", url);
  };
  const kBtn = $("#bkStar");
  if (kBtn) kBtn.onclick = async () => {
    try {
      if (!me() && mine.starred) return toastMsg("A guest star can't be taken back");
      await toggleStar(id, !mine.starred);
      toastMsg(mine.starred ? "Star removed" : "★ Star left");
      refresh();
    } catch (e) { toastMsg(e.message || String(e)); }
  };
  const lBtn = $("#bkLib");
  if (lBtn) lBtn.onclick = async () => {
    if (!me()) { toastMsg("Sign in to keep a library; Settings → Account"); return; }
    try {
      await setLibrary(id, !mine.inLibrary, b.chapter_count);
      toastMsg(mine.inLibrary ? "Removed from your library" : "✦ Saved; new chapters will show there");
      refresh();
    } catch (e) { toastMsg(e.message || String(e)); }
  };
  const fBtn = $("#bkFollow");
  if (fBtn) (async () => {
    const on = await amFollowing(b.owner);
    fBtn.textContent = on ? "Following" : "+ Follow";
    fBtn.classList.toggle("on", on);
    fBtn.onclick = async () => {
      if (!me()) { toastMsg("Sign in to follow authors; Settings → Account"); return; }
      const p = await ensureProfile(); if (!p) return;
      try { await toggleFollow(b.owner, !on); toastMsg(on ? "Unfollowed" : "Following " + (author.name || "")); refresh(); }
      catch (e) { toastMsg(e.message || String(e)); }
    };
  })();

  try {
    const comments = listComments(id, null);
    commentThread($("#bkComments"), await comments, { bookId: id, chapterId: null, ownerId: b.owner, refresh });
  } catch (e) { $("#bkComments").innerHTML = `<p class="faint">Comments didn't load.</p>`; }
}

/* ============================================================
   THE READER   #/book/<id>/<pos>
   ============================================================ */
async function viewChapter(id, posArg) {
  const gen = window.Codex ? Codex.currentGen() : 0;
  if (!ready()) return needsCloud();
  const pos = Math.max(0, parseInt(posArg, 10) || 0);
  view().innerHTML = `<div class="wrap"><div class="empty-state">Turning the page…</div></div>`;
  let b, chapters, ch;
  try {
    [b, chapters, ch] = await Promise.all([getBook(id), getChapters(id), chapterAt(id, pos)]);
  } catch (e) {
    view().innerHTML = `<div class="wrap"><div class="empty-state">Couldn't open that chapter.</div></div>`;
    return;
  }
  if (!b || !ch) { location.hash = "#/book/" + id; return; }
  if (window.Codex && Codex.isStale(gen)) return;
  bumpReads(id);
  saveProgress(id, pos);
  if (me()) markSeen(id, chapters.length).catch(() => {});
  const text = String(ch.content || "").trim();
  const author = b.community_profiles || {};

  view().innerHTML = `<div class="reader comm-reader">
    <div class="cr-top">
      <a class="cr-bookline" href="#/book/${esc(id)}">← ${esc(b.title)}</a>
      <span class="cr-by">by <a href="#/author/${esc(b.owner)}">${esc(author.name || "")}</a></span>
    </div>
    <section class="read-ch">
      <div class="rch-head"><div class="ornament">✧ ✦ ✧</div>
        <div class="rch-kicker">Chapter ${pos + 1} of ${chapters.length}</div>
        <div class="rch-title">${esc(ch.title || "Untitled")}</div></div>
      ${text ? text.split(/\n+/).filter(Boolean).map(p =>
        /^([*✦\-–—\s]{3,})$/.test(p.trim()) ? `<div class="ornament" style="margin:22px 0">✦ ✧ ✦</div>` : `<p>${esc(p)}</p>`).join("")
      : `<p class="faint">This chapter is empty.</p>`}
    </section>
    <div class="cr-nav">
      ${pos > 0 ? `<a class="btn ghost sm" href="#/book/${esc(id)}/${pos - 1}">← Previous</a>` : `<span></span>`}
      <button class="a-chip cr-star" id="crStar">★ <span id="crKn">${nice(b.star_count)}</span></button>
      ${pos < chapters.length - 1 ? `<a class="btn sm" href="#/book/${esc(id)}/${pos + 1}">Next chapter →</a>`
        : `<a class="btn sm" href="#/book/${esc(id)}">The end, for now ✦</a>`}
    </div>
    <div class="reader-say" style="margin-top:44px">
      <div class="rule-head"><span class="k">Talk about this chapter</span><span class="hr"></span></div>
      <div id="crComments"><p class="faint">Loading…</p></div>
    </div>
  </div>`;

  $("#crStar").onclick = async () => {
    try {
      const mine = await myEngagement(id);
      if (mine.starred) return toastMsg("Already starred ★");
      await toggleStar(id, true);
      $("#crKn").textContent = nice(b.star_count + 1);
      toastMsg("★ Star left for " + b.title);
    } catch (e) { toastMsg(e.message || String(e)); }
  };
  const refresh = () => viewChapter(id, pos);
  try {
    commentThread($("#crComments"), await listComments(id, ch.id), { bookId: id, chapterId: ch.id, ownerId: b.owner, refresh });
  } catch (e) { $("#crComments").innerHTML = `<p class="faint">Comments didn't load.</p>`; }
}

/* ============================================================
   THE AUTHOR PAGE   #/author/<id>
   ============================================================ */
async function viewAuthor(id) {
  const gen = window.Codex ? Codex.currentGen() : 0;
  if (!ready()) return needsCloud();
  view().innerHTML = `<div class="wrap wide"><div class="empty-state">Opening…</div></div>`;
  let p, books;
  try { [p, books] = await Promise.all([authorProfile(id), authorBooks(id)]); }
  catch (e) { view().innerHTML = `<div class="wrap"><div class="empty-state">Couldn't open that page.</div></div>`; return; }
  if (!p) {
    view().innerHTML = `<div class="wrap"><div class="page-kicker">The community</div>
      <h1 class="display">No such author</h1><p class="muted"><a href="#/community/discover">Back to Discover</a></p></div>`;
    return;
  }
  if (window.Codex && Codex.isStale(gen)) return;
  const isMe = id === me();
  const totalReads = books.reduce((n, b) => n + (+b.reads || 0), 0);
  const totalStars = books.reduce((n, b) => n + (b.star_count || 0), 0);

  view().innerHTML = `<div class="wrap wide">
    <div class="author-head">
      <div class="ah-av">${avatarOf(p, 84)}</div>
      <div class="ah-main">
        <div class="page-kicker">Author</div>
        <h1 class="display" style="margin:2px 0 6px">${esc(p.name)}</h1>
        <div class="bk-bigstats">
          <span><b>${p.book_count}</b> book${p.book_count === 1 ? "" : "s"}</span>
          <span><b>${nice(p.follower_count)}</b> follower${p.follower_count === 1 ? "" : "s"}</span>
          <span><b>${nice(totalReads)}</b> reads</span>
          <span><b>${nice(totalStars)}</b> star${totalStars === 1 ? "" : "s"}</span>
        </div>
        ${p.bio ? `<p class="ah-bio">${esc(p.bio)}</p>` : ""}
      </div>
      <div class="work-side">
        ${isMe ? `<button class="btn ghost sm" id="ahEdit">Edit profile</button>`
        : `<button class="btn sm" id="ahFollow">…</button>`}
      </div>
    </div>
    <div class="rule-head mt"><span class="k">Their shelf</span><span class="hr"></span><span class="meta">${books.length}</span></div>
    ${books.length ? `<div class="disc-grid">${books.map(b => bookCard(b)).join("")}</div>`
      : `<div class="empty-state">Nothing published yet.</div>`}
  </div>`;

  const eBtn = $("#ahEdit");
  if (eBtn) eBtn.onclick = () => openProfileModal(p, saved => { if (saved) viewAuthor(id); });
  const fBtn = $("#ahFollow");
  if (fBtn) (async () => {
    const on = await amFollowing(id);
    fBtn.textContent = on ? "Following ✓" : "+ Follow";
    fBtn.onclick = async () => {
      if (!me()) { toastMsg("Sign in to follow authors; Settings → Account"); return; }
      const mp = await ensureProfile(); if (!mp) return;
      try { await toggleFollow(id, !on); toastMsg(on ? "Unfollowed" : "Following " + p.name); viewAuthor(id); }
      catch (e) { toastMsg(e.message || String(e)); }
    };
  })();
}

window.CodexBooks = {
  book: viewBook, chapter: viewChapter, author: viewAuthor,
  publishWork, unpublishWork, communityCopyOf, ensureProfile, openProfileModal,
  api: {
    ready, me, myProfile, browse, getBook, getChapters, myEngagement,
    toggleStar, setVisibility, setLibrary, libraryList, markSeen, toggleFollow, following, feed,
    listComments, addComment, removeComment, continueReading, commentsOnMyBooks,
    listPosts, addPost, removePost, myBooks, authorProfile, authorBooks,
  },
  ui: { bookCard, avatarOf, commentThread, statBits, rel, nice },
};
})();
