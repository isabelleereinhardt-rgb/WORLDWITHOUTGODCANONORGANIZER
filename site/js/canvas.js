/* ============================================================
   The Codex; Canvases (mood boards)
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

/* ---------- keep the assistant/search aware of canvas content ----------
   Every text note and every caption on the board is mirrored into the
   regular notes store (tagged so we know it came from a canvas), so it's
   searchable, cross-linked, and readable by the assistant just like any
   other note; instead of silently living only inside the board. */
function cardAIText(c) {
  if (c.type === "text") return (c.data.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (c.data && c.data.caption) return c.data.caption.trim();
  return "";
}
async function syncCardToAI(board, c) {
  if (!S()) return;
  await S().ready;
  const text = cardAIText(c);
  const noteId = "canvasnote-" + board.id + "-" + c.id;
  if (!text) { await S().del("notes", noteId); if (window.Codex) Codex.refresh(); return; }
  const kindLabel = c.type === "text" ? "Note" : (c.type[0].toUpperCase() + c.type.slice(1) + " caption");
  await S().put("notes", {
    id: noteId, title: `${board.title || "Canvas"}; ${kindLabel}`, text,
    images: c.type === "image" && c.data.src ? [c.data.src] : [], category: "My Notes", _fromCanvas: true,
  });
  if (window.Codex) Codex.refresh();
}
async function unsyncCard(board, cardId) {
  if (!S()) return;
  await S().del("notes", "canvasnote-" + board.id + "-" + cardId);
  if (window.Codex) Codex.refresh();
}
async function unsyncBoard(boardId) {
  if (!S()) return;
  const all = await S().all("notes");
  for (const n of all) { if (n.id.startsWith("canvasnote-" + boardId + "-")) await S().del("notes", n.id); }
  if (window.Codex) Codex.refresh();
}

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
    <p class="muted">Freeform boards for the <em>feel</em> of a place, a character, a whole book; pin images,
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
    if (confirm("Delete this board?")) { await unsyncBoard(btn.dataset.del); await S().del("canvases", btn.dataset.del); list(folderId); }
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
      <button class="btn ghost sm" id="addDraw">+ Draw</button>
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
  $("#addDraw").onclick = () => addCard({ type: "draw", data: { src: null }, w: 340, h: 260 });

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
async function persist() {
  await S().put("canvases", cur);
  for (const c of cur.cards) await syncCardToAI(cur, c);
  const el = $("#saveState"); if (el) el.textContent = "Saved";
}

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

function captionField(c) {
  return `<div class="cc-caption-wrap"><input class="cc-caption" data-cap="${c.id}"
    placeholder="Caption; what this is, and how the assistant should use it…"
    value="${esc(c.data.caption || "")}"></div>`;
}
function cardInner(c) {
  if (c.type === "draw") return `
    <div class="cc-draw-toolbar">
      <input type="color" class="cc-draw-color" data-id="${c.id}" value="#2c2a26">
      <input type="range" class="cc-draw-size" data-id="${c.id}" min="1" max="14" value="3">
      <button class="cc-draw-clear" data-id="${c.id}">Clear</button>
      <button class="cc-draw-dl" data-id="${c.id}">Download</button>
    </div>
    <canvas class="cc-draw-canvas" data-id="${c.id}" width="${c.w || 340}" height="${c.h || 220}"></canvas>` + captionField(c);
  if (c.type === "image") return `<img src="${c.data.src}" alt="${esc(c.data.name || "")}" draggable="false">` + captionField(c);
  if (c.type === "video") return `<div class="cc-video">${videoEmbed(c.data.url)}</div>` + captionField(c);
  if (c.type === "link") {
    let host = ""; try { host = new URL(c.data.url).hostname.replace(/^www\./, ""); } catch (e) {}
    return `<a class="cc-link" href="${esc(c.data.url)}" target="_blank" rel="noopener">
      <span class="cc-link-host">${esc(host || "link")}</span>
      <span class="cc-link-url">${esc(c.data.url)}</span></a>` + captionField(c);
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
    el.querySelector(".cc-del").onclick = async () => {
      cur.cards = cur.cards.filter(x => x.id !== c.id);
      await unsyncCard(cur, c.id);
      persist(); renderCards();
    };
    // caption (images/videos/links)
    const capEl = el.querySelector(".cc-caption");
    if (capEl) {
      capEl.addEventListener("mousedown", e => e.stopPropagation());
      capEl.addEventListener("input", () => { c.data.caption = capEl.value; touch(); });
    }
    // editable notes
    const note = el.querySelector(".cc-note");
    if (note) {
      note.addEventListener("input", () => { c.data.html = note.innerHTML; touch(); });
      note.addEventListener("mousedown", e => e.stopPropagation()); // let text selection work
    }
    // drawing surface
    if (c.type === "draw") initDrawCanvas(el, c);
    // drag (from handle, or anywhere on media cards)
    const handle = el.querySelector(".cc-handle");
    dragify(el, handle, c);
  });
}

/* ---------- drawing mode: freehand sketch saved as a PNG, per card ---------- */
function initDrawCanvas(el, c) {
  const canvas = el.querySelector(".cc-draw-canvas");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffdf8"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (c.data.src) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height); img.src = c.data.src; }
  let drawing = false, color = "#2c2a26", size = 3;
  const colorInp = el.querySelector(".cc-draw-color"), sizeInp = el.querySelector(".cc-draw-size");
  [colorInp, sizeInp].forEach(i => i && i.addEventListener("mousedown", e => e.stopPropagation()));
  if (colorInp) colorInp.oninput = () => { color = colorInp.value; };
  if (sizeInp) sizeInp.oninput = () => { size = +sizeInp.value; };
  el.querySelector(".cc-draw-clear").onmousedown = e => e.stopPropagation();
  el.querySelector(".cc-draw-clear").onclick = () => {
    ctx.fillStyle = "#fffdf8"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    c.data.src = canvas.toDataURL("image/png"); touch();
  };
  el.querySelector(".cc-draw-dl").onmousedown = e => e.stopPropagation();
  el.querySelector(".cc-draw-dl").onclick = () => {
    const a = document.createElement("a"); a.href = canvas.toDataURL("image/png");
    a.download = (cur.title || "drawing").replace(/\s+/g, "-") + ".png"; a.click();
  };
  const posFrom = e => { const r = canvas.getBoundingClientRect(); const pt = e.touches ? e.touches[0] : e; return { x: (pt.clientX - r.left) * (canvas.width / r.width), y: (pt.clientY - r.top) * (canvas.height / r.height) }; };
  const start = e => { e.stopPropagation(); e.preventDefault(); drawing = true; const p = posFrom(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineCap = "round"; ctx.strokeStyle = color; ctx.lineWidth = size; };
  const move = e => { if (!drawing) return; e.stopPropagation(); e.preventDefault(); const p = posFrom(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { if (!drawing) return; drawing = false; c.data.src = canvas.toDataURL("image/png"); touch(); };
  canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end); canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive: false }); canvas.addEventListener("touchmove", move, { passive: false }); canvas.addEventListener("touchend", end);
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
