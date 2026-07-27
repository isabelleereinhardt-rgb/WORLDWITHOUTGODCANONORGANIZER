/* ============================================================
   World Without God — Canon Organizer
   Timeline — enter events as BR (Before Reconstruction) or AR
   (After Reconstruction) years and they're automatically placed
   and ordered on a single computed line. Click a date to open its
   notes. Saved in IndexedDB ("timeline" store).
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const uid = () => "tl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const S = () => window.CodexStore;

/* ---------- what the two halves of the calendar are called ----------
   "BR" and "AR" are this canon's, not everyone's: another project wants
   BC/AD, or PC/AC, or Before the Flood and After. The era KEY stored on
   every event stays "BR"/"AR" forever so nothing needs migrating — only
   the labels are yours to set, and they are per workspace, because a
   second project is a different world with a different calendar. */
const ERA_DEFAULTS = {
  beforeAbbr: "BR", afterAbbr: "AR",
  beforeName: "Before Reconstruction", afterName: "After Reconstruction",
  pivot: "Reconstruction",
};
function eraKey() {
  const ws = window.CodexWorkspaces ? CodexWorkspaces.activeId() : "default";
  return "codex.eras." + ws;
}
function eras() {
  try {
    const raw = JSON.parse(localStorage.getItem(eraKey()) || "{}");
    const out = Object.assign({}, ERA_DEFAULTS);
    // take only non-empty strings, so a half-filled form can't blank a label
    Object.keys(ERA_DEFAULTS).forEach(k => {
      if (typeof raw[k] === "string" && raw[k].trim()) out[k] = raw[k].trim();
    });
    return out;
  } catch (e) { return Object.assign({}, ERA_DEFAULTS); }
}
function saveEras(next) {
  const clean = {};
  Object.keys(ERA_DEFAULTS).forEach(k => {
    const v = (next[k] || "").trim();
    if (v && v !== ERA_DEFAULTS[k]) clean[k] = v.slice(0, 40);
  });
  if (Object.keys(clean).length) localStorage.setItem(eraKey(), JSON.stringify(clean));
  else localStorage.removeItem(eraKey());
}
function abbr(era) { const e = eras(); return era === "BR" ? e.beforeAbbr : e.afterAbbr; }

function sortKey(ev) { return ev.era === "BR" ? -ev.value : ev.value; }
function fmtDate(ev) { return `${ev.value} ${abbr(ev.era)}`; }
/* map a raw 0–100 position into a safe visible band so points never sit
   flush against the edge (which was clipping high AR values out of view) */
function safePct(raw) { return 4 + (raw / 100) * 92; }

let events = [], openId = null, lastEra = "BR";
async function view_() {
  await S().ready;
  events = (await S().all("timeline"));
  render();
}
function render() {
  const E = eras();
  const sorted = events.slice().sort((a, b) => sortKey(a) - sortKey(b));
  const min = sorted.length ? sortKey(sorted[0]) : -1, max = sorted.length ? sortKey(sorted[sorted.length - 1]) : 1;
  const span = Math.max(1, max - min);
  // where "year 0" (the Reconstruction) falls on the line, if it's within range
  const zeroRaw = ((0 - min) / span) * 100;
  const showZero = zeroRaw >= 0 && zeroRaw <= 100 && min < 0 && max > 0;

  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${esc(E.beforeName)} &amp; ${esc(E.afterName)} · ${sorted.length} event${sorted.length === 1 ? "" : "s"}</div>
    <div class="tl-head">
      <h1 class="display">Timeline</h1>
      <button class="btn ghost sm" id="tlEras">Rename the eras</button>
    </div>
    <p class="muted">Add events as <b>${esc(E.beforeAbbr)}</b> (${esc(E.beforeName)}) or
      <b>${esc(E.afterAbbr)}</b> (${esc(E.afterName)}) years —
      they're placed and re-ordered on the line automatically. Click any point to open its notes.</p>
    <div id="tlEraForm"></div>

    ${sorted.length ? `<div class="era-bands">${eraBands(sorted).map(b => `
      <div class="era-band"><div class="eb-name">${esc(b.name)}</div><div class="eb-span">${esc(b.span)}</div></div>`).join("")}</div>` : ""}

    <div class="tl-add">
      <input id="tlLabel" placeholder="Event label — e.g. “Founding of House Solis”">
      <input id="tlValue" type="number" placeholder="Year" style="width:110px">
      <select id="tlEra"><option value="BR" ${lastEra === "BR" ? "selected" : ""}>${esc(E.beforeAbbr)}</option><option value="AR" ${lastEra === "AR" ? "selected" : ""}>${esc(E.afterAbbr)}</option></select>
      <button class="btn" id="tlAdd">Add to timeline</button>
    </div>

    ${sorted.length ? `
      <div class="tl-line-wrap">
        <div class="tl-line">
          ${showZero ? `<div class="tl-zero" style="left:${safePct(zeroRaw)}%"><span>0 · ${esc(E.pivot)}</span></div>` : ""}
          ${sorted.map(ev => {
            const pct = safePct(span ? ((sortKey(ev) - min) / span) * 100 : 50);
            return `<div class="tl-point ${openId === ev.id ? "active" : ""}" style="left:${pct}%" data-id="${ev.id}" title="${esc(ev.label)}">
              <div class="tl-dot"></div>
              <div class="tl-point-label">${esc(fmtDate(ev))}</div>
            </div>`;
          }).join("")}
        </div>
        <div class="tl-axis-ends"><span>${esc(fmtDate(sorted[0]))}</span><span>${esc(fmtDate(sorted[sorted.length - 1]))}</span></div>
      </div>
      <div id="tlDetail">${openId ? detailHtml(events.find(e => e.id === openId)) : `<div class="empty-state">Click a point on the line to see its notes.</div>`}</div>
      <div class="rule-head mt"><span class="k">Every event, in order</span><span class="hr"></span></div>
      <div class="tl-list">
        ${sorted.map(ev => `<div class="tl-row" data-open="${ev.id}">
          <span class="tr-year">${esc(fmtDate(ev))}</span>
          <span class="tr-mark">✦</span>
          <span class="tr-body"><span class="tr-title">${esc(ev.label)}</span>
            ${ev.note ? `<span class="tr-note">${esc(ev.note.slice(0, 140))}${ev.note.length > 140 ? "…" : ""}</span>` : ""}</span>
          <button class="a-chip" data-del="${ev.id}">Delete</button>
        </div>`).join("")}
      </div>` : `<div class="empty-state">No events yet. Add your first one above.</div>`}
  </div>`;

  $("#tlEras").onclick = toggleEraForm;
  $("#tlAdd").onclick = addEvent;
  $("#tlLabel").onkeydown = e => { if (e.key === "Enter") addEvent(); };
  $("#tlEra").onchange = e => { lastEra = e.target.value; };
  $$(".tl-point,.tl-row[data-open]", view()).forEach(el => el.addEventListener("click", () => { openId = el.dataset.id || el.dataset.open; render(); }));
  $$("[data-del]", view()).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (!confirm("Delete this event?")) return;
    await S().del("timeline", b.dataset.del);
    events = events.filter(x => x.id !== b.dataset.del);
    if (openId === b.dataset.del) openId = null;
    render();
  });
}
/* Eras are read off the events you actually have, so the bands describe
   your canon rather than a calendar nobody agreed to. */
function eraBands(sorted) {
  const br = sorted.filter(e => sortKey(e) < 0);
  const ar = sorted.filter(e => sortKey(e) >= 0);
  const bands = [];
  const range = list => {
    const ys = list.map(e => Math.abs(sortKey(e)));
    return Math.min(...ys) + "–" + Math.max(...ys);
  };
  const E = eras();
  if (br.length) bands.push({ name: E.beforeName, span: range(br) + " " + E.beforeAbbr + " · " + br.length + " event" + (br.length === 1 ? "" : "s") });
  if (br.length && ar.length) bands.push({ name: E.pivot, span: "Year 0" });
  if (ar.length) bands.push({ name: E.afterName, span: range(ar) + " " + E.afterAbbr + " · " + ar.length + " event" + (ar.length === 1 ? "" : "s") });
  return bands;
}

/* The era editor lives on the Timeline itself rather than in Settings:
   it is the page where you notice the labels are wrong. */
function toggleEraForm() {
  const host = $("#tlEraForm");
  if (!host) return;
  if (host.innerHTML) { host.innerHTML = ""; return; }
  const E = eras();
  host.innerHTML = `<div class="tl-eras">
    <div class="rule-head"><span class="k">What this world calls its eras</span><span class="hr"></span></div>
    <p class="faint set-help">Only the names change. Every event keeps the year and the side of the
      line you gave it, so nothing moves. These belong to this workspace alone.</p>
    <div class="tl-era-grid">
      <label>Earlier era, short<input id="eaBA" maxlength="40" value="${esc(E.beforeAbbr)}" placeholder="BR"></label>
      <label>Earlier era, in full<input id="eaBN" maxlength="40" value="${esc(E.beforeName)}" placeholder="Before Reconstruction"></label>
      <label>Later era, short<input id="eaAA" maxlength="40" value="${esc(E.afterAbbr)}" placeholder="AR"></label>
      <label>Later era, in full<input id="eaAN" maxlength="40" value="${esc(E.afterName)}" placeholder="After Reconstruction"></label>
      <label>The event they count from<input id="eaPV" maxlength="40" value="${esc(E.pivot)}" placeholder="Reconstruction"></label>
    </div>
    <div class="tl-era-acts">
      <button class="btn sm" id="eaSave">Save these names</button>
      <button class="btn ghost sm" id="eaReset">Back to ${esc(ERA_DEFAULTS.beforeAbbr)} / ${esc(ERA_DEFAULTS.afterAbbr)}</button>
    </div>
  </div>`;
  $("#eaSave").onclick = () => {
    saveEras({
      beforeAbbr: $("#eaBA").value, beforeName: $("#eaBN").value,
      afterAbbr: $("#eaAA").value, afterName: $("#eaAN").value,
      pivot: $("#eaPV").value,
    });
    window.toast && toast("Eras renamed");
    render();
  };
  $("#eaReset").onclick = () => {
    localStorage.removeItem(eraKey());
    window.toast && toast("Eras back to the defaults");
    render();
  };
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
  const label = $("#tlLabel").value.trim();
  // strip commas/spaces so "1,500" or "1 500" parse the same as "1500"
  const raw = $("#tlValue").value.replace(/[,\s]/g, "");
  const value = raw === "" ? NaN : Number(raw);
  const era = $("#tlEra").value;
  lastEra = era;
  if (!label || isNaN(value)) { toast("Give it a label and a year"); return; }
  const ev = { id: uid(), label, value, era, note: "" };
  await S().put("timeline", ev);
  events.push(ev);
  openId = ev.id;
  window.CodexFeed && CodexFeed.log("Added timeline event", `${label} (${value} ${era})`);
  $("#tlLabel").value = ""; $("#tlValue").value = "";
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
