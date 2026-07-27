/* ============================================================
   World Without God; Canon Organizer
   Mind Maps: nodes you can add, drag, connect, and label. Make as
   many maps as you want, file them under a project. Saved in
   IndexedDB via CodexStore ("mindmaps" store).
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const uid = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const S = () => window.CodexStore;
const NODE_COLORS = ["#7c5cff", "#c2603f", "#3f8f6b", "#b8893b", "#d0699a", "#3f6f8f"];

async function list(folderId) {
  await S().ready;
  let maps = await S().all("mindmaps");
  maps.sort((a, b) => b.updated - a.updated);
  if (folderId) maps = maps.filter(m => m.folder === folderId);
  const folderBar = window.CodexFolders ? CodexFolders.bar("mindmap", folderId, "#/mindmaps") : "";
  const cards = maps.map(m => `
    <div class="entry-card" data-open="${m.id}" style="cursor:pointer">
      <h3>${esc(m.title || "Untitled map")}</h3>
      <p>${(m.nodes || []).length} node${(m.nodes || []).length === 1 ? "" : "s"}</p>
      <div class="meta">Edited ${fmtDate(m.updated)}
        <button class="btn ghost sm" data-del="${m.id}" style="margin-left:auto">Delete</button></div>
    </div>`).join("");
  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Workspace · Mind Maps</div>
    <h1>Mind Maps</h1>
    <p class="muted">Lay ideas out and connect them; plot threads, relationship webs, cause and effect.
      Double-click empty space to add a node; drag from a node's dot to connect it to another.</p>
    ${folderBar}
    <div style="margin:16px 0"><button class="btn" id="newMap">New mind map</button></div>
    ${maps.length ? `<div class="list-grid">${cards}</div>` : `<div class="empty-state">No mind maps yet.</div>`}
  </div>`;
  $("#newMap").onclick = async () => {
    const m = { id: uid(), title: "Untitled map", folder: folderId || null,
      nodes: [{ id: uid(), x: 360, y: 220, text: "Central idea", color: NODE_COLORS[0] }], edges: [] };
    await S().put("mindmaps", m); location.hash = "#/mindmap/" + m.id;
  };
  $$("[data-open]", view()).forEach(c => c.onclick = e => { if (e.target.dataset.del) return; location.hash = "#/mindmap/" + c.dataset.open; });
  $$("[data-del]", view()).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (confirm("Delete this mind map?")) { await S().del("mindmaps", b.dataset.del); list(folderId); }
  });
}

let cur = null, saveT = null, connectFrom = null, colorIdx = 1;
async function open(id) {
  await S().ready;
  cur = await S().get("mindmaps", id);
  if (!cur) { location.hash = "#/mindmaps"; return; }
  if (!cur.nodes) cur.nodes = [];
  if (!cur.edges) cur.edges = [];
  connectFrom = null;

  view().innerHTML = `
    <div class="doc-toolbar">
      <input class="doc-title" style="font-size:20px;width:auto;flex:1;min-width:120px" id="mmTitle" value="${esc(cur.title)}">
      <button class="btn ghost sm" id="mmAddNode">+ Node</button>
      <span class="faint" id="mmHint" style="font-size:12px"></span>
      <span class="save-state" id="saveState">Saved</span>
    </div>
    <div class="canvas-scroll" id="mmScroll">
      <svg class="mm-edges" id="mmEdges"></svg>
      <div class="canvas-surface" id="mmSurface"></div>
    </div>`;

  $("#mmTitle").oninput = () => { cur.title = $("#mmTitle").value; touch(); };
  $("#mmAddNode").onclick = () => addNode(240 + Math.random() * 200, 160 + Math.random() * 200);
  $("#mmScroll").addEventListener("dblclick", e => {
    if (e.target.id !== "mmScroll" && e.target.id !== "mmSurface") return;
    const r = $("#mmSurface").getBoundingClientRect();
    addNode(e.clientX - r.left, e.clientY - r.top);
  });
  render();
}
function touch() { $("#saveState") && ($("#saveState").textContent = "Saving…"); clearTimeout(saveT); saveT = setTimeout(persist, 500); }
async function persist() { await S().put("mindmaps", cur); const el = $("#saveState"); if (el) el.textContent = "Saved"; }

function addNode(x, y) {
  const n = { id: uid(), x, y, text: "New idea", color: NODE_COLORS[colorIdx++ % NODE_COLORS.length] };
  cur.nodes.push(n); persist(); render();
}
function deleteNode(id) {
  cur.nodes = cur.nodes.filter(n => n.id !== id);
  cur.edges = cur.edges.filter(e => e.a !== id && e.b !== id);
  persist(); render();
}

function render() {
  const surface = $("#mmSurface"), svg = $("#mmEdges");
  if (!surface) return;
  $("#mmHint").textContent = connectFrom ? "Click another node to connect, or Esc to cancel" : "";
  surface.innerHTML = cur.nodes.map(n => `
    <div class="mm-node ${connectFrom === n.id ? "connecting" : ""}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;border-color:${n.color}">
      <div class="mm-node-text" contenteditable="true" data-id="${n.id}">${esc(n.text)}</div>
      <button class="mm-connect" data-connect="${n.id}" title="Drag or click to connect" style="background:${n.color}"></button>
      <button class="mm-del" data-del="${n.id}" title="Delete">✕</button>
    </div>`).join("");

  const w = Math.max(surface.scrollWidth, 1600), h = Math.max(surface.scrollHeight, 1200);
  svg.setAttribute("width", w); svg.setAttribute("height", h);
  svg.innerHTML = cur.edges.map(e => {
    const a = cur.nodes.find(n => n.id === e.a), b = cur.nodes.find(n => n.id === e.b);
    if (!a || !b) return "";
    const ax = a.x + 70, ay = a.y + 22, bx = b.x + 70, by = b.y + 22;
    const mx = (ax + bx) / 2;
    return `<path d="M${ax},${ay} C${mx},${ay} ${mx},${by} ${bx},${by}" fill="none" stroke="var(--line-strong)" stroke-width="2"/>
      <circle cx="${(ax+bx)/2}" cy="${(ay+by)/2}" r="7" fill="var(--bg)" stroke="var(--line-strong)" data-rmedge="${e.a}|${e.b}" class="mm-edge-del" />`;
  }).join("");
  $$(".mm-edge-del", svg).forEach(c => c.onclick = () => {
    const [a, b] = c.dataset.rmedge.split("|");
    cur.edges = cur.edges.filter(e => !(e.a === a && e.b === b));
    persist(); render();
  });

  $$(".mm-node", surface).forEach(el => {
    const n = cur.nodes.find(x => x.id === el.dataset.id);
    if (!n) return;
    el.querySelector(".mm-del").onclick = () => deleteNode(n.id);
    const textEl = el.querySelector(".mm-node-text");
    textEl.addEventListener("mousedown", ev => ev.stopPropagation());
    textEl.addEventListener("input", () => { n.text = textEl.textContent; touch(); });
    const connectBtn = el.querySelector(".mm-connect");
    connectBtn.onclick = ev => {
      ev.stopPropagation();
      if (!connectFrom) { connectFrom = n.id; render(); return; }
      if (connectFrom !== n.id && !cur.edges.some(e => (e.a === connectFrom && e.b === n.id) || (e.a === n.id && e.b === connectFrom))) {
        cur.edges.push({ a: connectFrom, b: n.id }); persist();
      }
      connectFrom = null; render();
    };
    dragify(el, n);
  });
}

function dragify(el, n) {
  const surface = $("#mmSurface");
  let sx, sy, ox, oy, dragging = false;
  const down = e => {
    if (e.target.classList.contains("mm-connect") || e.target.classList.contains("mm-del") || e.target.classList.contains("mm-node-text")) return;
    dragging = true; el.classList.add("dragging");
    const pt = e.touches ? e.touches[0] : e;
    sx = pt.clientX; sy = pt.clientY; ox = n.x; oy = n.y;
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    e.preventDefault();
  };
  const move = e => {
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    n.x = Math.max(0, ox + (pt.clientX - sx)); n.y = Math.max(0, oy + (pt.clientY - sy));
    el.style.left = n.x + "px"; el.style.top = n.y + "px";
    surface.style.minHeight = Math.max(surface.offsetHeight, n.y + 300) + "px";
    render();
  };
  const up = () => { dragging = false; el.classList.remove("dragging"); document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); touch(); };
  el.addEventListener("mousedown", down);
}

document.addEventListener("keydown", e => { if (e.key === "Escape" && connectFrom) { connectFrom = null; render(); } });

window.CodexMindmap = { list, open };
})();
