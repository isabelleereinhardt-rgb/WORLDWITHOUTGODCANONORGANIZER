/* ============================================================
   The Codex — Canvases (mood boards)
   A freeform space, Notion-style: drop in images, videos, links,
   and text cards, drag them anywhere. Make as many boards as you
   like and file them under a project folder. Saved in IndexedDB.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const uid = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const S = () => window.CodexStore;

/* ---------- list of boards ---------- */
async function list(folderId) {
  await S().ready;
  let boards = await S().all("canvases");
  const folders = (await S().all("folders")).filter(f => f.kind === "canvas" || !f.kind);
  boards.sort((a, b) => b.updated - a.updated);
  if (folderId) boards = boards.filter(b => b.folder === folderId);

  const folderBar = window.CodexFolders
    ? CodexFolders.bar("canvas", folderId, "#/canvases")
    : "";
  const cards = boards.map(b => `
    <div class="entry-card" data-open="${b.id}" style="cursor:pointer">
      <h3>${esc(b.title || "Untitled board")}</h3>
      <p>${b.cards ? b.cards.length : 0} item${(b.cards && b.cards.length === 1) ? "" : "s"}${b.folder ? " · " + esc(folderName(folders, b.folder)) : ""}</p>
      <div class="meta">Edited ${fmtDate(b.updated)}
        <button class="btn ghost sm" data-del="${b.id}" style="margin-left:auto">Delete</button></div>
    </div>`).join("");

  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Workspace · Mood boards</div>
    <h1>Canvases</h1>
    <p class="muted">Freeform boards for the <em>feel</em> of a place, a character, a whole book — pin images,
      video, links, and stray thoughts, and arrange them however makes sense to you.</p>
    ${folderBar}
    <div style="margin:16px 0"><button class="btn" id="newCanvas">New canvas</button></div>
    ${boards.length ? `<div class="list-grid">${cards}</div>` :
      `<div class="empty-state">No boards yet. Create one to start pinning.</div>`}
  </div>`;

  $("#newCanvas").onclick = async () => {
    const b = { id: uid(), title: "Untitled board", folder: folderId || null, cards: [] };
    await S().put("canvases", b); location.hash = "#/canvas/" + b.id;
  };
  $$("[data-open]", view()).forEach(c => c.onclick = e => {
    if (e.target.dataset.del) return; location.hash = "#/canvas/" + c.dataset.open;
  });
  $$("[data-del]", view()).forEach(btn => btn.onclick = async e => {
    e.stopPropagation();
    if (confirm("Delete this board?")) { await S().del("canvases", btn.dataset.del); list(folderId); }
  });
}
function folderName(folders, id) { const f = folders.find(x => x.id === id); return f ? f.name : ""; }

/* ---------- open a single board ---------- */
let cur = null, saveT = null;
async function open(id) {
  await S().ready;
  cur = await S().get("canvases", id);
  if (!cur) { location.hash = "#/canvases"; return; }
  if (!cur.cards) cur.cards = [];

  view().innerHTML = `
    <div class="doc-toolbar">
      <input class="doc-title" style="font-size:20px;width:auto;flex:1;min-width:120px" id="canvasTitle" value="${esc(cur.title)}">
      <button class="btn ghost sm" id="addImg">+ Image</button>
      <button class="btn ghost sm" id="addText">+ Note</button>
      <button class="btn ghost sm" id="addLink">+ Link</button>
      <button class="btn ghost sm" id="addVideo">+ Video</button>
      <span class="save-state" id="saveState">Saved</span>
    </div>
    <div class="canvas-scroll">
      <div class="canvas-surface" id="surface"></div>
      <div class="canvas-hint" id="canvasHint">Drag items to arrange · use the buttons above to add · double-click a note to edit</div>
    </div>`;

  const titleEl = $("#canvasTitle");
  titleEl.oninput = () => { cur.title = titleEl.value; touch(); };

  $("#addImg").onclick = addImageCard;
  $("#addText").onclick = () => addCard({ type: "text", data: { html: "New note" } });
  $("#addLink").onclick = () => {
    const url = prompt("Paste a link (any URL):"); if (!url) return;
    addCard({ type: "link", data: { url, title: url } });
  };
  $("#addVideo").onclick = () => {
    const url = prompt("Paste a video URL (YouTube, Vimeo, or a direct .mp4):"); if (!url) return;
    addCard({ type: "video", data: { url } });
  };

  renderCards();

  // paste image straight onto the board
  const surface = $("#surface");
  surface.addEventListener("paste", async ev => {
    const items = (ev.clipboardData || {}).items || [];
    for (const it of items) {
      if (it.type && it.type.indexOf("image") === 0) {
        ev.preventDefault();
        try {
          const url = await window.CodexImg.fileToScaledDataURL(it.getAsFile());
          addCard({ type: "image", data: { src: url } });
        } catch (e) { toast("Couldn't read that image"); }
      }
    }
  });
}
function touch() { $("#saveState") && ($("#saveState").textContent = "Saving…"); clearTimeout(saveT); saveT = setTimeout(persist, 500); }
async function persist() { await S().put("canvases", cur); const el = $("#saveState"); if (el) el.textContent = "Saved"; }

function addImageCard() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.onchange = async () => {
    const files = Array.from(inp.files || []);
    let i = 0;
    for (const f of files) {
      try {
        const url = await window.CodexImg.fileToScaledDataURL(f);
        addCard({ type: "image", data: { src: url, name: f.name }, dx: (i % 4) * 30, dy: (i % 4) * 24 });
        i++;
      } catch (e) { toast("Skipped " + f.name); }
    }
  };
  inp.click();
}

function addCard(partial) {
  const surface = $("#surface");
  const rect = surface ? surface.getBoundingClientRect() : { width: 900 };
  const card = Object.assign({
    id: uid(),
    x: 40 + (partial.dx || 0) + Math.round(Math.random() * 60),
    y: 40 + (partial.dy || 0) + Math.round(Math.random() * 60),
    w: partial.type === "text" ? 220 : 260,
    h: null,
  }, partial);
  cur.cards.push(card);
  persist();
  renderCards();
}

function videoEmbed(url) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return `<iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen loading="lazy"></iframe>`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `<iframe src="https://player.vimeo.com/video/${vm[1]}" allowfullscreen loading="lazy"></iframe>`;
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return `<video src="${esc(url)}" controls preload="metadata"></video>`;
  return `<a class="cc-linkbody" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`;
}

function cardInner(c) {
  if (c.type === "image") return `<img src="${c.data.src}" alt="${esc(c.data.name || "")}" draggable="false">`;
  if (c.type === "video") return `<div class="cc-video">${videoEmbed(c.data.url)}</div>`;
  if (c.type === "link") {
    let host = ""; try { host = new URL(c.data.url).hostname.replace(/^www\./, ""); } catch (e) {}
    return `<a class="cc-link" href="${esc(c.data.url)}" target="_blank" rel="noopener">
      <span class="cc-link-host">${esc(host || "link")}</span>
      <span class="cc-link-url">${esc(c.data.url)}</span></a>`;
  }
  // text / note
  return `<div class="cc-note" contenteditable="true" data-id="${c.id}">${c.data.html || ""}</div>`;
}

function renderCards() {
  const surface = $("#surface");
  if (!surface) return;
  $("#canvasHint") && ($("#canvasHint").style.display = cur.cards.length ? "none" : "");
  surface.innerHTML = cur.cards.map(c => `
    <div class="cc ${"cc-" + c.type}" data-id="${c.id}"
         style="left:${c.x}px;top:${c.y}px;width:${c.w}px${c.h ? ";height:" + c.h + "px" : ""}">
      <div class="cc-handle" title="Drag">⠿</div>
      <button class="cc-del" title="Remove">✕</button>
      <div class="cc-body">${cardInner(c)}</div>
    </div>`).join("");

  $$(".cc", surface).forEach(el => {
    const c = cur.cards.find(x => x.id === el.dataset.id);
    if (!c) return;
    // delete
    el.querySelector(".cc-del").onclick = () => {
      cur.cards = cur.cards.filter(x => x.id !== c.id); persist(); renderCards();
    };
    // editable notes
    const note = el.querySelector(".cc-note");
    if (note) {
      note.addEventListener("input", () => { c.data.html = note.innerHTML; touch(); });
      note.addEventListener("mousedown", e => e.stopPropagation()); // let text selection work
    }
    // drag (from handle, or anywhere on media cards)
    const handle = el.querySelector(".cc-handle");
    dragify(el, handle, c);
  });
}

function dragify(el, handle, c) {
  const surface = $("#surface");
  let startX, startY, ox, oy, dragging = false;
  const down = e => {
    if (e.target.closest(".cc-del")) return;
    if (e.target.closest(".cc-note") && e.target !== handle) return; // editing text
    if (e.target.closest("a,iframe,video,input,button") && e.target !== handle) return;
    dragging = true;
    el.classList.add("dragging");
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY; ox = c.x; oy = c.y;
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    document.addEventListener("touchmove", move, { passive: false }); document.addEventListener("touchend", up);
    e.preventDefault();
  };
  const move = e => {
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    c.x = Math.max(0, ox + (pt.clientX - startX));
    c.y = Math.max(0, oy + (pt.clientY - startY));
    el.style.left = c.x + "px"; el.style.top = c.y + "px";
    // grow surface if needed
    surface.style.minHeight = Math.max(surface.offsetHeight, c.y + 320) + "px";
    if (e.cancelable) e.preventDefault();
  };
  const up = () => {
    if (!dragging) return;
    dragging = false; el.classList.remove("dragging");
    document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
    document.removeEventListener("touchmove", move); document.removeEventListener("touchend", up);
    touch();
  };
  handle.addEventListener("mousedown", down);
  handle.addEventListener("touchstart", down, { passive: false });
  // media cards: whole card draggable
  if (c.type === "image" || c.type === "video" || c.type === "link") {
    el.addEventListener("mousedown", down);
    el.addEventListener("touchstart", down, { passive: false });
  }
}

window.CodexCanvas = { list, open };
})();
