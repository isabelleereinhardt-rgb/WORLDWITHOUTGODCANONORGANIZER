/* ============================================================
   World Without God; Canon Organizer
   Sheets: a small spreadsheet; grid of cells, basic formulas
   (=A1+B2, =SUM(A1:A5), =AVERAGE(...), =COUNT(...)), and pie/bar
   charts built from a selected range. Saved in IndexedDB.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const uid = () => "sh" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const S = () => window.CodexStore;
const ROWS = 20, COLS = 8;
const colLetter = c => String.fromCharCode(65 + c);
const chartPalette = ["#7c5cff", "#c2603f", "#3f8f6b", "#b8893b", "#d0699a", "#3f6f8f", "#9a6bd0", "#d98b2b"];

async function list(folderId) {
  await S().ready;
  let sheets = await S().all("sheets");
  sheets.sort((a, b) => b.updated - a.updated);
  if (folderId) sheets = sheets.filter(s => s.folder === folderId);
  const folderBar = window.CodexFolders ? CodexFolders.bar("sheet", folderId, "#/sheets") : "";
  const cards = sheets.map(s => `
    <div class="entry-card" data-open="${s.id}" style="cursor:pointer">
      <h3>${esc(s.title || "Untitled sheet")}</h3>
      <p>${ROWS} × ${COLS} grid${(s.charts || []).length ? ` · ${s.charts.length} chart${s.charts.length === 1 ? "" : "s"}` : ""}</p>
      <div class="meta">Edited ${fmtDate(s.updated)}
        <button class="btn ghost sm" data-del="${s.id}" style="margin-left:auto">Delete</button></div>
    </div>`).join("");
  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Workspace · Sheets</div>
    <h1>Sheets</h1>
    <p class="muted">A small spreadsheet for tallies, comparisons, timelines of numbers; anything you'd
      rather see in a grid. Select a range and turn it into a pie or bar chart.</p>
    ${folderBar}
    <div style="margin:16px 0"><button class="btn" id="newSheet">New sheet</button></div>
    ${sheets.length ? `<div class="list-grid">${cards}</div>` : `<div class="empty-state">No sheets yet.</div>`}
  </div>`;
  $("#newSheet").onclick = async () => {
    const s = { id: uid(), title: "Untitled sheet", folder: folderId || null, cells: {}, charts: [] };
    await S().put("sheets", s); location.hash = "#/sheet/" + s.id;
  };
  $$("[data-open]", view()).forEach(c => c.onclick = e => { if (e.target.dataset.del) return; location.hash = "#/sheet/" + c.dataset.open; });
  $$("[data-del]", view()).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (confirm("Delete this sheet?")) { await S().del("sheets", b.dataset.del); list(folderId); }
  });
}

let cur = null, saveT = null, selStart = null, selEnd = null;
async function open(id) {
  await S().ready;
  cur = await S().get("sheets", id);
  if (!cur) { location.hash = "#/sheets"; return; }
  if (!cur.cells) cur.cells = {};
  if (!cur.charts) cur.charts = [];
  selStart = selEnd = null;

  view().innerHTML = `
    <div class="doc-toolbar">
      <input class="doc-title" style="font-size:20px;width:auto;flex:1;min-width:120px" id="shTitle" value="${esc(cur.title)}">
      <button class="btn ghost sm" id="mkPie">Pie chart from selection</button>
      <button class="btn ghost sm" id="mkBar">Bar chart from selection</button>
      <span class="save-state" id="saveState">Saved</span>
    </div>
    <div class="wrap wide">
      <p class="muted" id="selHint" style="margin:14px 0">Click a cell, or drag to select a range; the first
        column of your selection becomes chart labels, the rest become values.</p>
      <div class="sheet-scroll"><table class="sheet-grid" id="grid"></table></div>
      <div class="sheet-charts" id="chartArea"></div>
    </div>`;

  $("#shTitle").oninput = () => { cur.title = $("#shTitle").value; touch(); };
  $("#mkPie").onclick = () => makeChart("pie");
  $("#mkBar").onclick = () => makeChart("bar");

  buildGrid();
  renderCharts();
}
function touch() { $("#saveState") && ($("#saveState").textContent = "Saving…"); clearTimeout(saveT); saveT = setTimeout(persist, 500); }
async function persist() { await S().put("sheets", cur); const el = $("#saveState"); if (el) el.textContent = "Saved"; }

function cellKey(r, c) { return colLetter(c) + (r + 1); }
function parseRef(ref) { const m = ref.match(/^([A-Za-z]+)(\d+)$/); if (!m) return null; return { c: m[1].toUpperCase().charCodeAt(0) - 65, r: +m[2] - 1 }; }
function rawValue(key) { return (cur.cells[key] != null ? cur.cells[key] : ""); }

function evalCell(key, seen) {
  seen = seen || new Set();
  if (seen.has(key)) return "#REF!";
  const raw = rawValue(key);
  if (typeof raw !== "string" || !raw.startsWith("=")) { const n = parseFloat(raw); return isNaN(n) ? (raw || "") : n; }
  seen = new Set(seen); seen.add(key);
  let expr = raw.slice(1).trim();
  const rangeFn = expr.match(/^(SUM|AVERAGE|COUNT|MAX|MIN)\(([A-Za-z]+\d+):([A-Za-z]+\d+)\)$/i);
  if (rangeFn) {
    const [, fn, a, b] = rangeFn;
    const vals = rangeValues(a, b, seen).filter(v => typeof v === "number");
    if (!vals.length) return fn.toUpperCase() === "COUNT" ? 0 : 0;
    if (/sum/i.test(fn)) return vals.reduce((s, v) => s + v, 0);
    if (/average/i.test(fn)) return vals.reduce((s, v) => s + v, 0) / vals.length;
    if (/count/i.test(fn)) return vals.length;
    if (/max/i.test(fn)) return Math.max(...vals);
    if (/min/i.test(fn)) return Math.min(...vals);
  }
  // simple arithmetic with cell refs, e.g. =A1+B2*2
  const substituted = expr.replace(/[A-Za-z]+\d+/g, ref => {
    const v = evalCell(ref.toUpperCase(), seen);
    return typeof v === "number" ? v : 0;
  });
  if (!/^[\d\s+\-*/().]+$/.test(substituted)) return "#ERR";
  try { const v = Function('"use strict";return (' + substituted + ")")(); return typeof v === "number" && isFinite(v) ? v : "#ERR"; }
  catch (e) { return "#ERR"; }
}
function rangeValues(aRef, bRef, seen) {
  const a = parseRef(aRef), b = parseRef(bRef); if (!a || !b) return [];
  const out = [];
  for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++)
    for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++)
      out.push(evalCell(cellKey(r, c), seen));
  return out;
}

function buildGrid() {
  const grid = $("#grid");
  let html = "<thead><tr><th></th>" + Array.from({ length: COLS }, (_, c) => `<th>${colLetter(c)}</th>`).join("") + "</tr></thead><tbody>";
  for (let r = 0; r < ROWS; r++) {
    html += `<tr><th>${r + 1}</th>`;
    for (let c = 0; c < COLS; c++) {
      const key = cellKey(r, c);
      html += `<td data-key="${key}" data-r="${r}" data-c="${c}"><input value="${esc(rawValue(key))}" data-key="${key}"></td>`;
    }
    html += "</tr>";
  }
  grid.innerHTML = html + "</tbody>";

  $$("td input", grid).forEach(inp => {
    inp.addEventListener("focus", () => { inp.value = rawValue(inp.dataset.key); });
    inp.addEventListener("blur", () => { showComputed(inp); });
    inp.addEventListener("change", () => { cur.cells[inp.dataset.key] = inp.value; touch(); showComputed(inp); });
  });
  $$("td", grid).forEach(td => {
    td.addEventListener("mousedown", e => { if (e.target.tagName !== "INPUT") { selStart = { r: +td.dataset.r, c: +td.dataset.c }; selEnd = selStart; paintSelection(); } });
    td.addEventListener("mouseenter", e => { if (e.buttons === 1 && selStart) { selEnd = { r: +td.dataset.r, c: +td.dataset.c }; paintSelection(); } });
  });
  $$("td input", grid).forEach(inp => showComputed(inp));
}
function showComputed(inp) {
  if (document.activeElement === inp) return;
  const v = evalCell(inp.dataset.key);
  inp.value = typeof v === "number" ? (Math.round(v * 1000) / 1000).toString() : (rawValue(inp.dataset.key) || "");
}
function paintSelection() {
  const grid = $("#grid"); if (!grid || !selStart || !selEnd) return;
  const r0 = Math.min(selStart.r, selEnd.r), r1 = Math.max(selStart.r, selEnd.r);
  const c0 = Math.min(selStart.c, selEnd.c), c1 = Math.max(selStart.c, selEnd.c);
  $$("td", grid).forEach(td => {
    const r = +td.dataset.r, c = +td.dataset.c;
    td.classList.toggle("sel", r >= r0 && r <= r1 && c >= c0 && c <= c1);
  });
  const hint = $("#selHint");
  if (hint) hint.textContent = `Selected ${colLetter(c0)}${r0 + 1}:${colLetter(c1)}${r1 + 1}; click "Pie chart" or "Bar chart" to visualize it.`;
}

function makeChart(kind) {
  if (!selStart || !selEnd) { toast("Select a range first"); return; }
  const r0 = Math.min(selStart.r, selEnd.r), r1 = Math.max(selStart.r, selEnd.r);
  const c0 = Math.min(selStart.c, selEnd.c), c1 = Math.max(selStart.c, selEnd.c);
  const data = [];
  for (let r = r0; r <= r1; r++) {
    const label = evalCell(cellKey(r, c0));
    let val = null;
    for (let c = c0 + 1; c <= c1; c++) { const v = evalCell(cellKey(r, c)); if (typeof v === "number") { val = v; break; } }
    if (val == null) { const v = evalCell(cellKey(r, c0 + (c1 > c0 ? 1 : 0))); if (typeof v === "number") val = v; }
    if (val != null) data.push({ label: String(label || `Row ${r + 1}`), value: val });
  }
  if (!data.length) { toast("No numeric values in that selection"); return; }
  cur.charts.push({ id: uid(), kind, title: `${kind === "pie" ? "Pie" : "Bar"} chart; ${colLetter(c0)}${r0 + 1}:${colLetter(c1)}${r1 + 1}`, data });
  persist(); renderCharts();
}
function deleteChart(id) { cur.charts = cur.charts.filter(c => c.id !== id); persist(); renderCharts(); }

function pieSvg(data) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  let angle = -90, r = 90, cx = 110, cy = 110, paths = "";
  data.forEach((d, i) => {
    const frac = Math.max(0, d.value) / total;
    const a0 = angle, a1 = angle + frac * 360; angle = a1;
    const x0 = cx + r * Math.cos(a0 * Math.PI / 180), y0 = cy + r * Math.sin(a0 * Math.PI / 180);
    const x1 = cx + r * Math.cos(a1 * Math.PI / 180), y1 = cy + r * Math.sin(a1 * Math.PI / 180);
    const large = (a1 - a0) > 180 ? 1 : 0;
    paths += `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z" fill="${chartPalette[i % chartPalette.length]}"><title>${esc(d.label)}: ${d.value}</title></path>`;
  });
  return `<svg viewBox="0 0 220 220" class="chart-svg">${paths}</svg>`;
}
function barSvg(data) {
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 36, gap = 14, h = 180, pad = 26;
  const svgW = data.length * (w + gap) + pad;
  let bars = data.map((d, i) => {
    const bh = Math.max(2, (Math.max(0, d.value) / max) * h);
    const x = pad + i * (w + gap);
    return `<rect x="${x}" y="${h - bh + 20}" width="${w}" height="${bh}" fill="${chartPalette[i % chartPalette.length]}"><title>${esc(d.label)}: ${d.value}</title></rect>
      <text x="${x + w / 2}" y="${h + 34}" text-anchor="middle" class="chart-label">${esc(String(d.label).slice(0, 8))}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${svgW} ${h + 46}" class="chart-svg" style="width:${Math.min(svgW, 480)}px">${bars}</svg>`;
}
function renderCharts() {
  const area = $("#chartArea"); if (!area) return;
  area.innerHTML = cur.charts.map(c => `
    <div class="chart-card">
      <div class="chart-head"><b>${esc(c.title)}</b><button class="btn ghost sm" data-rm="${c.id}">Remove</button></div>
      ${c.kind === "pie" ? pieSvg(c.data) : barSvg(c.data)}
      <div class="chart-legend">${c.data.map((d, i) => `<span><i style="background:${chartPalette[i % chartPalette.length]}"></i>${esc(d.label)}: ${d.value}</span>`).join("")}</div>
    </div>`).join("");
  $$("[data-rm]", area).forEach(b => b.onclick = () => deleteChart(b.dataset.rm));
}

window.CodexSheets = { list, open };
})();
