/* ============================================================
   World Without God — Canon Organizer
   Timeline — enter events as BR (Before Reckoning) or AR (After
   Reckoning) years and they're automatically placed and ordered
   on a single computed line. Click a date to open its notes.
   Saved in IndexedDB ("timeline" store).
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const uid = () => "tl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const S = () => window.CodexStore;

function sortKey(ev) { return ev.era === "BR" ? -ev.value : ev.value; }
function fmtDate(ev) { return `${ev.value} ${ev.era}`; }

let events = [], openId = null;
async function view_() {
  await S().ready;
  events = (await S().all("timeline"));
  render();
}
function render() {
  const sorted = events.slice().sort((a, b) => sortKey(a) - sortKey(b));
  const min = sorted.length ? sortKey(sorted[0]) : 0, max = sorted.length ? sortKey(sorted[sorted.length - 1]) : 1;
  const span = Math.max(1, max - min);

  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Timeline</div>
    <h1>Timeline</h1>
    <p class="muted">Add events as <b>BR</b> (Before Reckoning) or <b>AR</b> (After Reckoning) years — they're
      placed and re-ordered on the line automatically. Click any point to open its notes.</p>

    <div class="tl-add">
      <input id="tlLabel" placeholder="Event label — e.g. “Founding of House Solis”">
      <input id="tlValue" type="number" placeholder="Year" style="width:110px">
      <select id="tlEra"><option value="BR">BR</option><option value="AR">AR</option></select>
      <button class="btn" id="tlAdd">Add to timeline</button>
    </div>

    ${sorted.length ? `
      <div class="tl-line-wrap">
        <div class="tl-line">
          ${sorted.map(ev => {
            const pct = span ? ((sortKey(ev) - min) / span) * 100 : 50;
            return `<div class="tl-point ${openId === ev.id ? "active" : ""}" style="left:${pct}%" data-id="${ev.id}" title="${esc(ev.label)}">
              <div class="tl-dot"></div>
              <div class="tl-point-label">${esc(fmtDate(ev))}</div>
            </div>`;
          }).join("")}
        </div>
      </div>
      <div id="tlDetail">${openId ? detailHtml(events.find(e => e.id === openId)) : `<div class="empty-state">Click a point on the line to see its notes.</div>`}</div>
      <h3 style="font-family:var(--serif);margin-top:34px">All events</h3>
      <div class="tl-list">
        ${sorted.map(ev => `<div class="tl-list-item" data-open="${ev.id}">
          <b>${esc(fmtDate(ev))}</b> <span>${esc(ev.label)}</span>
          <button class="btn ghost sm" data-del="${ev.id}">Delete</button>
        </div>`).join("")}
      </div>` : `<div class="empty-state">No events yet. Add your first one above.</div>`}
  </div>`;

  $("#tlAdd").onclick = addEvent;
  $("#tlLabel").onkeydown = e => { if (e.key === "Enter") addEvent(); };
  $$(".tl-point,[data-open]", view()).forEach(el => el.addEventListener("click", () => { openId = el.dataset.id || el.dataset.open; render(); }));
  $$("[data-del]", view()).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (!confirm("Delete this event?")) return;
    await S().del("timeline", b.dataset.del);
    events = events.filter(x => x.id !== b.dataset.del);
    if (openId === b.dataset.del) openId = null;
    render();
  });
}
function detailHtml(ev) {
  if (!ev) return "";
  return `<div class="tl-detail">
    <div class="tl-detail-head"><b>${esc(ev.label)}</b><span class="faint">${esc(fmtDate(ev))}</span></div>
    <textarea class="import-body" id="tlNote" placeholder="What happened on this date?">${esc(ev.note || "")}</textarea>
    <div style="margin-top:8px"><button class="btn sm" id="tlSaveNote">Save note</button></div>
  </div>`;
}
async function addEvent() {
  const label = $("#tlLabel").value.trim(), value = +$("#tlValue").value, era = $("#tlEra").value;
  if (!label || isNaN(value)) { toast("Give it a label and a year"); return; }
  const ev = { id: uid(), label, value, era, note: "" };
  await S().put("timeline", ev);
  events.push(ev);
  openId = ev.id;
  window.CodexFeed && CodexFeed.log("Added timeline event", `${label} (${value} ${era})`);
  render();
}

document.addEventListener("click", async e => {
  if (e.target.id === "tlSaveNote") {
    const ev = events.find(x => x.id === openId); if (!ev) return;
    ev.note = $("#tlNote").value;
    await S().put("timeline", ev);
    toast("Note saved");
  }
});

window.CodexTimeline = { view: view_ };
})();
