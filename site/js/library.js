/* ============================================================
   Beep Beep Organizer; the Library
   Wattpad/AO3-inspired: your documents can be gathered into
   STORIES (works) with chapters, a cover, a blurb, tags, and a
   status (Draft / Ongoing / Completed). Every story gets a clean,
   bookish READER with adjustable type, reading themes, a progress
   bar, and it remembers exactly where you left off; "Continue
   reading" takes you straight back.

   Stories live in the "stories" store; reading positions in the
   "reading" store; both per workspace, per account.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const uid = (p) => (p || "s") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const S = () => window.CodexStore;
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const STATUS = { draft: "Draft", ongoing: "Ongoing", completed: "Completed" };

function stripHtml(h) { const d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent || ""; }
function wordsIn(html) { return stripHtml(html).trim().split(/\s+/).filter(Boolean).length; }

/* Chapter body for reading: writers often start a document with a heading
   that repeats its title. The reader/export already show the title, so a
   duplicate leading heading is dropped rather than shown twice. */
function chapterBodyHtml(doc) {
  const div = document.createElement("div");
  div.innerHTML = doc.html || "";
  const first = Array.from(div.children).find(el => (el.textContent || "").trim());
  if (first && /^H[12]$/.test(first.tagName) &&
      (first.textContent || "").trim().toLowerCase() === (doc.title || "").trim().toLowerCase()) first.remove();
  return div.innerHTML;
}

async function allStories() { await S().ready; return (await S().all("stories")).sort((a, b) => (b.updated || 0) - (a.updated || 0)); }
async function docsById() {
  const docs = await S().all("docs");
  const map = {}; docs.forEach(d => map[d.id] = d); return map;
}

/* ---------- reading positions ---------- */
async function getReading(storyId) { return await S().get("reading", storyId); }
async function saveReading(storyId, chapter, scrollPct) {
  await S().put("reading", { id: storyId, chapter, scrollPct: Math.round(scrollPct * 1000) / 1000, at: Date.now() });
}
async function latestReading() {
  const all = await S().all("reading");
  all.sort((a, b) => (b.at || 0) - (a.at || 0));
  return all[0] || null;
}

/* ---------- reader preferences (device-wide) ---------- */
const PREFS_KEY = "codex.readerPrefs";
function prefs() {
  try { return Object.assign({ size: 19, theme: "paper", width: "normal" }, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")); }
  catch (e) { return { size: 19, theme: "paper", width: "normal" }; }
}
function savePrefs(p) { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }

/* ---------- cover ---------- */
function coverHtml(story, cls) {
  if (story.cover) return `<div class="story-cover ${cls || ""}"><img src="${story.cover}" alt=""></div>`;
  const initials = (story.title || "?").split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  return `<div class="story-cover ${cls || ""} placeholder"><span>${esc(initials)}</span></div>`;
}
function statusChip(s) {
  const key = STATUS[s.status] ? s.status : "draft";
  return `<span class="status-chip status-${key}">${STATUS[key]}</span>`;
}

/* ============================================================
   LIBRARY (list of stories)
   ============================================================ */
let activeTag = null;
async function list() {
  const stories = await allStories();
  const docs = await docsById();
  const cont = await latestReading();
  const contStory = cont ? stories.find(s => s.id === cont.id) : null;

  const allTags = Array.from(new Set(stories.flatMap(s => s.tags || []))).sort();
  const shown = activeTag ? stories.filter(s => (s.tags || []).includes(activeTag)) : stories;

  const cards = shown.map(s => {
    const words = (s.chapters || []).reduce((n, id) => n + (docs[id] ? wordsIn(docs[id].html) : 0), 0);
    const chs = (s.chapters || []).length;
    return `<a class="story-card" href="#/story/${s.id}">
      ${coverHtml(s, "sm")}
      <div class="story-card-body">
        <h3>${esc(s.title || "Untitled story")}</h3>
        <div class="story-meta">${statusChip(s)} <span>${chs} chapter${chs === 1 ? "" : "s"}</span> <span>&middot;</span> <span>${words.toLocaleString()} words</span></div>
        <p class="story-desc">${esc((s.desc || "").slice(0, 150))}</p>
        ${(s.tags || []).length ? `<div class="tag-row">${s.tags.slice(0, 5).map(t => `<span class="tag-chip">${esc(t)}</span>`).join("")}</div>` : ""}
      </div>
    </a>`;
  }).join("");

  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Library</div>
    <div class="browse-head">
      <h1>Your Library</h1>
      <div class="browse-actions"><button class="btn" id="newStory">New story</button></div>
    </div>
    <p class="muted">Your works, Wattpad-style: gather documents into stories with chapters, a cover, and tags,
      then read them in a clean reader that remembers your place.</p>
    ${contStory ? `<div class="continue-card" id="continueCard">
      ${coverHtml(contStory, "xs")}
      <div>
        <div class="cc-kicker">Continue reading</div>
        <div class="cc-title">${esc(contStory.title || "Untitled story")}</div>
        <div class="faint">Chapter ${(cont.chapter || 0) + 1} of ${(contStory.chapters || []).length}${cont.scrollPct ? ` &middot; ${Math.round(cont.scrollPct * 100)}% through` : ""}</div>
      </div>
      <a class="btn sm" href="#/read/${contStory.id}/${cont.chapter || 0}">Resume</a>
    </div>` : ""}
    ${allTags.length ? `<div class="tag-row filter">
      <span class="sc-rel-label">Tags</span>
      ${allTags.map(t => `<button class="tag-chip ${activeTag === t ? "active" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}
      ${activeTag ? `<button class="tag-chip clear" data-cleartag="1">Clear &times;</button>` : ""}
    </div>` : ""}
    ${shown.length ? `<div class="story-grid">${cards}</div>`
      : `<div class="empty-state">${activeTag ? "No stories with that tag." : "No stories yet. Create one and pull your documents in as chapters."}</div>`}
  </div>`;

  $("#newStory").onclick = async () => {
    const s = { id: uid("story"), title: "", desc: "", cover: "", tags: [], status: "draft", chapters: [] };
    await S().put("stories", s);
    window.CodexFeed && CodexFeed.log("Created story", "Untitled story");
    location.hash = "#/story/" + s.id;
  };
  $$("[data-tag]", view()).forEach(b => b.onclick = () => { activeTag = b.dataset.tag === activeTag ? null : b.dataset.tag; list(); });
  $$("[data-cleartag]", view()).forEach(b => b.onclick = () => { activeTag = null; list(); });
}

/* ============================================================
   STORY PAGE (like a Wattpad story detail / AO3 work page)
   ============================================================ */
async function story(id) {
  await S().ready;
  const s = await S().get("stories", id);
  if (!s) { location.hash = "#/library"; return; }
  const docs = await docsById();
  const reading = await getReading(id);
  const chapters = (s.chapters || []).filter(cid => docs[cid]);
  if (chapters.length !== (s.chapters || []).length) { s.chapters = chapters; await S().put("stories", s); }
  const totalWords = chapters.reduce((n, cid) => n + wordsIn(docs[cid].html), 0);

  const chRows = chapters.map((cid, i) => {
    const d = docs[cid];
    return `<div class="ch-row" data-ch="${i}">
      <span class="ch-num">${i + 1}</span>
      <a class="ch-title" href="#/read/${s.id}/${i}">${esc(d.title || "Untitled")}</a>
      <span class="ch-words">${wordsIn(d.html).toLocaleString()} words</span>
      <span class="ch-actions">
        <button class="icon-btn" data-edit="${cid}" title="Edit this chapter">&#9998;</button>
        <button class="icon-btn" data-up="${i}" title="Move up" ${i === 0 ? "disabled" : ""}>&uarr;</button>
        <button class="icon-btn" data-down="${i}" title="Move down" ${i === chapters.length - 1 ? "disabled" : ""}>&darr;</button>
        <button class="icon-btn" data-remove="${i}" title="Remove from story (the document itself is kept)">&times;</button>
      </span>
    </div>`;
  }).join("");

  const unattached = Object.values(docs).filter(d => !chapters.includes(d.id))
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));

  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker"><a href="#/library" style="color:inherit;text-decoration:none">&larr; Library</a></div>
    <div class="story-head">
      <div class="story-cover-col">
        ${coverHtml(s, "lg")}
        <button class="btn ghost sm" id="coverBtn">${s.cover ? "Change cover" : "Add a cover"}</button>
        ${s.cover ? `<button class="btn ghost sm" id="coverRemove">Remove cover</button>` : ""}
      </div>
      <div class="story-head-body">
        <input class="doc-title" id="storyTitle" placeholder="Story title" value="${esc(s.title)}">
        <div class="story-meta" style="margin:6px 0 10px">
          <select id="storyStatus" class="folder-select" title="Status">
            ${Object.keys(STATUS).map(k => `<option value="${k}" ${s.status === k ? "selected" : ""}>${STATUS[k]}</option>`).join("")}
          </select>
          <span>${chapters.length} chapter${chapters.length === 1 ? "" : "s"}</span>
          <span>&middot;</span><span>${totalWords.toLocaleString()} words</span>
        </div>
        <textarea class="import-body" id="storyDesc" placeholder="What is this story about? (your blurb / summary)" style="min-height:70px">${esc(s.desc || "")}</textarea>
        <div class="tag-row" style="margin-top:10px" id="tagRow">
          ${(s.tags || []).map(t => `<span class="tag-chip">${esc(t)} <button data-deltag="${esc(t)}" title="Remove tag">&times;</button></span>`).join("")}
          <input id="tagInput" class="tag-input" placeholder="+ add tag, press Enter">
        </div>
        <div class="story-actions">
          ${chapters.length ? `<a class="btn" href="#/read/${s.id}/${reading ? (reading.chapter || 0) : 0}">${reading ? "Continue reading" : "Start reading"}</a>` : ""}
          <button class="btn ghost" id="exportStory" ${chapters.length ? "" : "disabled"}>Publish as webpage</button>
          <button class="btn ghost" id="deleteStory" style="color:var(--danger)">Delete story</button>
        </div>
        <p class="faint" style="font-size:12px;margin-top:6px">"Publish as webpage" downloads your whole story as one
          self-contained file: send it to anyone or host it anywhere, and it reads beautifully on phones and tablets.</p>
      </div>
    </div>

    <h3 style="font-family:var(--serif);margin-top:30px">Chapters</h3>
    ${chapters.length ? `<div class="ch-list">${chRows}</div>` : `<div class="empty-state">No chapters yet; add one below.</div>`}
    <div class="ch-add">
      <button class="btn sm" id="newChapter">Write a new chapter</button>
      ${unattached.length ? `<select class="folder-select" id="attachDoc">
        <option value="">Add an existing document as a chapter&hellip;</option>
        ${unattached.map(d => `<option value="${d.id}">${esc(d.title || "Untitled")}</option>`).join("")}
      </select>` : ""}
    </div>
  </div>`;

  let saveT;
  const persist = async () => { await S().put("stories", s); };
  const touch = () => { clearTimeout(saveT); saveT = setTimeout(persist, 500); };

  $("#storyTitle").oninput = e => { s.title = e.target.value; touch(); };
  $("#storyDesc").oninput = e => { s.desc = e.target.value; touch(); };
  $("#storyStatus").onchange = e => { s.status = e.target.value; persist(); };

  $("#coverBtn").onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { s.cover = await window.CodexImg.fileToScaledDataURL(f, 700, 0.85); await persist(); story(id); }
      catch (e) { toast("Couldn't read that image"); }
    };
    inp.click();
  };
  if ($("#coverRemove")) $("#coverRemove").onclick = async () => { s.cover = ""; await persist(); story(id); };

  const tagInput = $("#tagInput");
  tagInput.onkeydown = async e => {
    if (e.key !== "Enter") return;
    const t = tagInput.value.trim().toLowerCase().replace(/[,;]+$/, "");
    if (!t) return;
    s.tags = s.tags || [];
    if (!s.tags.includes(t)) { s.tags.push(t); await persist(); story(id); }
    else tagInput.value = "";
  };
  $$("[data-deltag]", view()).forEach(b => b.onclick = async () => {
    s.tags = (s.tags || []).filter(t => t !== b.dataset.deltag); await persist(); story(id);
  });

  $("#newChapter").onclick = async () => {
    const d = { id: uid("d"), title: "Chapter " + (chapters.length + 1), html: "", folder: null };
    await S().put("docs", d);
    s.chapters = (s.chapters || []).concat(d.id);
    await persist();
    location.hash = "#/doc/" + d.id;
  };
  if ($("#attachDoc")) $("#attachDoc").onchange = async e => {
    if (!e.target.value) return;
    s.chapters = (s.chapters || []).concat(e.target.value);
    await persist(); story(id);
  };
  $$("[data-edit]", view()).forEach(b => b.onclick = () => { location.hash = "#/doc/" + b.dataset.edit; });
  $$("[data-up]", view()).forEach(b => b.onclick = async () => {
    const i = +b.dataset.up; [s.chapters[i - 1], s.chapters[i]] = [s.chapters[i], s.chapters[i - 1]];
    await persist(); story(id);
  });
  $$("[data-down]", view()).forEach(b => b.onclick = async () => {
    const i = +b.dataset.down; [s.chapters[i + 1], s.chapters[i]] = [s.chapters[i], s.chapters[i + 1]];
    await persist(); story(id);
  });
  $$("[data-remove]", view()).forEach(b => b.onclick = async () => {
    const i = +b.dataset.remove;
    s.chapters.splice(i, 1);
    await persist(); story(id);
  });
  $("#exportStory").onclick = () => exportStory(s, docs);
  $("#deleteStory").onclick = async () => {
    if (!confirm(`Delete "${s.title || "this story"}"? The documents used as chapters are NOT deleted; only the story grouping is.`)) return;
    await S().del("stories", s.id);
    await S().del("reading", s.id);
    location.hash = "#/library";
  };
}

/* ============================================================
   READER
   ============================================================ */
let readerScrollHandler = null;
async function read(storyId, chIdx) {
  await S().ready;
  const s = await S().get("stories", storyId);
  if (!s) { location.hash = "#/library"; return; }
  const docs = await docsById();
  const chapters = (s.chapters || []).filter(cid => docs[cid]);
  if (!chapters.length) { location.hash = "#/story/" + storyId; return; }
  const i = Math.max(0, Math.min(chapters.length - 1, +chIdx || 0));
  const doc = docs[chapters[i]];
  const p = prefs();
  const reading = await getReading(storyId);
  const resumeScroll = (reading && reading.chapter === i) ? (reading.scrollPct || 0) : 0;

  view().innerHTML = `
    <div class="reader reader-theme-${p.theme}">
      <div class="reader-progress"><div class="reader-progress-fill" id="readerFill"></div></div>
      <div class="reader-top">
        <a class="reader-back" href="#/story/${s.id}" title="Back to story">&larr; ${esc(s.title || "Story")}</a>
        <span class="reader-ch-label">Chapter ${i + 1} of ${chapters.length}</span>
        <button class="icon-btn" id="readerAa" title="Reading settings">Aa</button>
      </div>
      <div class="reader-aa" id="readerAaPanel" hidden>
        <div class="aa-row"><span>Text size</span>
          <input type="range" id="aaSize" min="15" max="26" step="1" value="${p.size}"></div>
        <div class="aa-row"><span>Theme</span>
          <div class="aa-themes">
            ${["paper", "sepia", "dark", "night"].map(t => `<button class="aa-theme aa-${t} ${p.theme === t ? "active" : ""}" data-theme="${t}" title="${t}"></button>`).join("")}
          </div></div>
        <div class="aa-row"><span>Width</span>
          <div class="aa-widths">${["narrow", "normal", "wide"].map(w => `<button class="aa-w ${p.width === w ? "active" : ""}" data-width="${w}">${w}</button>`).join("")}</div></div>
      </div>
      <div class="reader-page reader-w-${p.width}" id="readerPage" style="font-size:${p.size}px">
        <h1 class="reader-ch-title">${esc(doc.title || "Chapter " + (i + 1))}</h1>
        <div class="reader-body">${chapterBodyHtml(doc) || "<p class='faint'>(This chapter is empty so far.)</p>"}</div>
        <div class="reader-nav">
          ${i > 0 ? `<a class="btn ghost" href="#/read/${s.id}/${i - 1}">&larr; Previous chapter</a>` : `<span></span>`}
          ${i < chapters.length - 1
            ? `<a class="btn" href="#/read/${s.id}/${i + 1}">Next chapter &rarr;</a>`
            : `<a class="btn ghost" href="#/story/${s.id}">The end &middot; back to story</a>`}
        </div>
      </div>
    </div>`;

  const main = view();
  // restore position, then track it
  requestAnimationFrame(() => {
    if (resumeScroll > 0) main.scrollTop = resumeScroll * (main.scrollHeight - main.clientHeight);
    updateFill();
  });
  function pct() {
    const range = main.scrollHeight - main.clientHeight;
    return range > 0 ? Math.min(1, main.scrollTop / range) : 1;
  }
  function updateFill() { const f = $("#readerFill"); if (f) f.style.width = (pct() * 100) + "%"; }
  let saveT;
  if (readerScrollHandler) main.removeEventListener("scroll", readerScrollHandler);
  readerScrollHandler = () => {
    updateFill();
    clearTimeout(saveT);
    saveT = setTimeout(() => saveReading(storyId, i, pct()), 400);
  };
  main.addEventListener("scroll", readerScrollHandler);
  saveReading(storyId, i, resumeScroll);

  $("#readerAa").onclick = (e) => { e.stopPropagation(); $("#readerAaPanel").hidden = !$("#readerAaPanel").hidden; };
  $("#aaSize").oninput = e => { const p2 = prefs(); p2.size = +e.target.value; savePrefs(p2); $("#readerPage").style.fontSize = p2.size + "px"; };
  $$("[data-theme]", view()).forEach(b => b.onclick = () => {
    const p2 = prefs(); p2.theme = b.dataset.theme; savePrefs(p2);
    const r = $(".reader"); r.className = "reader reader-theme-" + p2.theme;
    $$(".aa-theme", view()).forEach(x => x.classList.toggle("active", x === b));
  });
  $$("[data-width]", view()).forEach(b => b.onclick = () => {
    const p2 = prefs(); p2.width = b.dataset.width; savePrefs(p2);
    $("#readerPage").className = "reader-page reader-w-" + p2.width;
    $$(".aa-w", view()).forEach(x => x.classList.toggle("active", x === b));
  });
  document.addEventListener("click", function closeAa(ev) {
    const panel = $("#readerAaPanel");
    if (!panel) { document.removeEventListener("click", closeAa); return; }
    if (!panel.hidden && !panel.contains(ev.target)) panel.hidden = true;
  });
}

/* ============================================================
   PUBLISH: one self-contained HTML file of the whole story
   ============================================================ */
function exportStory(s, docs) {
  const chapters = (s.chapters || []).filter(cid => docs[cid]);
  const toc = chapters.map((cid, i) => `<li><a href="#ch${i + 1}">${esc(docs[cid].title || "Chapter " + (i + 1))}</a></li>`).join("");
  const body = chapters.map((cid, i) => `<section id="ch${i + 1}"><h2>${esc(docs[cid].title || "Chapter " + (i + 1))}</h2>${chapterBodyHtml(docs[cid])}</section>`).join("\n");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title || "Untitled story")}</title>
<style>
  body{margin:0;background:#f6f3ec;color:#2c2a26;font-family:Georgia,'Times New Roman',serif;line-height:1.75}
  .wrap{max-width:680px;margin:0 auto;padding:48px 22px 90px}
  h1{font-size:34px;margin:0 0 6px}
  .byline{color:#6a655c;margin:0 0 4px}
  .desc{color:#6a655c;font-style:italic;border-left:3px solid #c9c2b0;padding-left:14px;margin:18px 0}
  .tags span{display:inline-block;background:#ece7db;border-radius:999px;padding:3px 12px;font-size:13px;margin:0 6px 6px 0;font-family:system-ui,sans-serif}
  nav{margin:26px 0;padding:16px 20px;background:#efeadf;border-radius:10px}
  nav ol{margin:8px 0 0;padding-left:22px}
  section{margin-top:56px}
  section h2{font-size:24px;border-bottom:1px solid #d9d2c2;padding-bottom:8px}
  img{max-width:100%;height:auto;border-radius:6px}
  table{border-collapse:collapse}td,th{border:1px solid #d9d2c2;padding:6px 10px}
  blockquote{border-left:3px solid #b9b09a;margin-left:0;padding-left:16px;color:#555;font-style:italic}
  @media (prefers-color-scheme: dark){body{background:#17151a;color:#e8e3d8}nav{background:#221f26}.tags span{background:#2b2731}section h2{border-color:#3a3542}}
</style></head><body><div class="wrap">
  <h1>${esc(s.title || "Untitled story")}</h1>
  <p class="byline">${chapters.length} chapter${chapters.length === 1 ? "" : "s"} &middot; exported ${new Date().toLocaleDateString()}</p>
  ${(s.tags || []).length ? `<div class="tags">${s.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
  ${s.desc ? `<p class="desc">${esc(s.desc)}</p>` : ""}
  <nav><b>Chapters</b><ol>${toc}</ol></nav>
  ${body}
</div></body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (s.title || "story").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() + ".html";
  a.click();
  window.toast && toast("Story exported as a webpage; share or host it anywhere");
  window.CodexFeed && CodexFeed.log("Published story", s.title || "Untitled story");
}

/* ============================================================
   HOME STRIP: "Continue reading" + "Jump back into writing"
   ============================================================ */
async function homeStrip(container) {
  if (!container || !S()) return;
  try {
    await S().ready;
    const cont = await latestReading();
    const stories = await allStories();
    const contStory = cont ? stories.find(x => x.id === cont.id) : null;
    const docs = (await S().all("docs")).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const lastDoc = docs[0];
    let html = "";
    if (contStory) {
      html += `<a class="home-jump" href="#/read/${contStory.id}/${cont.chapter || 0}">
        ${coverHtml(contStory, "xs")}
        <span><b>Continue reading</b><br>${esc(contStory.title || "Untitled story")} &middot; ch. ${(cont.chapter || 0) + 1}</span></a>`;
    }
    if (lastDoc) {
      html += `<a class="home-jump" href="#/doc/${lastDoc.id}">
        <span class="home-jump-ic">&#9998;</span>
        <span><b>Jump back into writing</b><br>${esc(lastDoc.title || "Untitled")} &middot; ${fmtDate(lastDoc.updated)}</span></a>`;
    }
    if (html) container.innerHTML = `<div class="home-jump-row">${html}</div>`;
  } catch (e) { /* the home page works fine without the strip */ }
}

window.CodexLibrary = { list, story, read, homeStrip };
})();
