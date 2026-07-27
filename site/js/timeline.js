/* ============================================================
   World Without God; Canon Organizer
   Timeline; enter events as BR (Before Reconstruction) or AR
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

/* ---------- the calendar this world keeps ----------
   Two fixed halves called BR and AR was this canon's calendar imposed on
   everyone else's. A timeline is really an ordered list of eras, and
   each era needs three things to sit on one line with the others:

     abbr / name  what it is called, short and long
     counts       "down" if years fall as time moves forward (BC, BR),
                  "up" if they rise (AD, CE, AR)
     anchor       the absolute year this era counts from

   That is enough to express BC → AD, or a third age starting at 2000,
   or Before the Flood → After, without special cases. An event's
   position on the shared line is:

     anchor + (counts === "down" ? -value : value)

   The stored era KEY never changes, so events written under the old
   two-era scheme keep working untouched: the defaults below use the
   same "BR" and "AR" keys they were saved with. */
const ERA_DEFAULTS = [
  { key: "BR", abbr: "BR", name: "Before Reconstruction", counts: "down", anchor: 0 },
  { key: "AR", abbr: "AR", name: "After Reconstruction", counts: "up", anchor: 0 },
];
const PIVOT_DEFAULT = "Reconstruction";

function eraKey() {
  const ws = window.CodexWorkspaces ? CodexWorkspaces.activeId() : "default";
  return "codex.eras." + ws;
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* the whole calendar: eras, what the zero point is called, and an
   optional fixed span for the axis */
function calendar() {
  const def = { eras: clone(ERA_DEFAULTS), pivot: PIVOT_DEFAULT, from: null, to: null };
  let raw;
  try { raw = JSON.parse(localStorage.getItem(eraKey()) || "null"); } catch (e) { return def; }
  if (!raw || typeof raw !== "object") return def;

  const out = clone(def);
  if (typeof raw.pivot === "string" && raw.pivot.trim()) out.pivot = raw.pivot.trim();
  if (Number.isFinite(raw.from)) out.from = raw.from;
  if (Number.isFinite(raw.to)) out.to = raw.to;
  if (Array.isArray(raw.eras) && raw.eras.length) {
    const clean = raw.eras.map(e => e && typeof e === "object" ? {
      key: String(e.key || "").slice(0, 24),
      abbr: (String(e.abbr || "").trim() || "?").slice(0, 12),
      name: (String(e.name || "").trim() || "Unnamed era").slice(0, 60),
      counts: e.counts === "down" ? "down" : "up",
      anchor: Number.isFinite(e.anchor) ? e.anchor : 0,
    } : null).filter(e => e && e.key);
    if (clean.length) out.eras = clean;
  }
  // a range the wrong way round would invert the axis; put it right
  if (out.from != null && out.to != null && out.from > out.to) {
    const t = out.from; out.from = out.to; out.to = t;
  }
  return out;
}
function saveCalendar(cal) {
  localStorage.setItem(eraKey(), JSON.stringify({
    eras: cal.eras, pivot: cal.pivot, from: cal.from, to: cal.to,
  }));
}
function resetCalendar() { localStorage.removeItem(eraKey()); }

function eraFor(key) {
  const cal = calendar();
  return cal.eras.find(e => e.key === key) || cal.eras[0] ||
    { key: key, abbr: key || "?", name: key || "Unknown era", counts: "up", anchor: 0 };
}
function abbr(key) { return eraFor(key).abbr; }

/* one absolute position on the shared line */
function sortKey(ev) {
  const e = eraFor(ev.era);
  const v = Number(ev.value) || 0;
  return e.anchor + (e.counts === "down" ? -v : v);
}
function fmtDate(ev) { return `${ev.value} ${abbr(ev.era)}`; }
/* map a raw 0–100 position into a safe visible band so points never sit
   flush against the edge (which was clipping high values out of view) */
function safePct(raw) { return 4 + (Math.max(0, Math.min(100, raw)) / 100) * 92; }

let events = [], openId = null, lastEra = "BR";
async function view_() {
  const gen = window.Codex ? Codex.currentGen() : 0;
  await S().ready;
  events = (await S().all("timeline"));
  if (window.Codex && Codex.isStale(gen)) return;
  render();
}
function render() {
  const cal = calendar();
  const sorted = events.slice().sort((a, b) => sortKey(a) - sortKey(b));
  // The axis fits the events unless you have pinned a span, in which
  // case it honours yours; that is the difference between "as far back
  // as anything happens to be" and "this world starts here".
  const fitMin = sorted.length ? sortKey(sorted[0]) : -1;
  const fitMax = sorted.length ? sortKey(sorted[sorted.length - 1]) : 1;
  const min = cal.from != null ? cal.from : fitMin;
  const max = cal.to != null ? cal.to : fitMax;
  const span = Math.max(1, max - min);
  const pinned = cal.from != null || cal.to != null;
  // anything outside a pinned span still exists; it is just off the axis
  const outside = pinned ? sorted.filter(e => sortKey(e) < min || sortKey(e) > max).length : 0;
  // where year zero falls on the line, if it is in view at all
  const zeroRaw = ((0 - min) / span) * 100;
  const showZero = zeroRaw >= 0 && zeroRaw <= 100 && min < 0 && max > 0;
  const eraNames = cal.eras.map(e => e.name).join(" & ");

  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">${esc(eraNames)} · ${sorted.length} event${sorted.length === 1 ? "" : "s"}</div>
    <div class="tl-head">
      <h1 class="display">Timeline</h1>
      <button class="btn ghost sm" id="tlEras">Eras &amp; span</button>
    </div>
    <p class="muted">${cal.eras.length} era${cal.eras.length === 1 ? "" : "s"} in this world:
      ${cal.eras.map(e => `<b>${esc(e.abbr)}</b> (${esc(e.name)})`).join(", ")}.
      Events are placed and re-ordered on the line automatically. Click any point to open its notes.</p>
    ${outside ? `<p class="muted"><b>${outside}</b> event${outside === 1 ? " sits" : "s sit"} outside the span you
      pinned, so ${outside === 1 ? "it is" : "they are"} listed below but not on the line.</p>` : ""}
    <div id="tlEraForm"></div>

    ${sorted.length ? `<div class="era-bands">${eraBands(sorted).map(b => `
      <div class="era-band"><div class="eb-name">${esc(b.name)}</div><div class="eb-span">${esc(b.span)}</div></div>`).join("")}</div>` : ""}

    <div class="tl-add">
      <input id="tlLabel" placeholder="Event label; e.g. “Founding of House Solis”">
      <input id="tlValue" type="number" placeholder="Year" style="width:110px">
      <select id="tlEra">${cal.eras.map(e =>
        `<option value="${esc(e.key)}" ${lastEra === e.key ? "selected" : ""}>${esc(e.abbr)}</option>`).join("")}</select>
      <button class="btn" id="tlAdd">Add to timeline</button>
    </div>

    ${sorted.length ? `
      <div class="tl-line-wrap">
        <div class="tl-line">
          ${showZero ? `<div class="tl-zero" style="left:${safePct(zeroRaw)}%"><span>0 · ${esc(cal.pivot)}</span></div>` : ""}
          ${sorted.filter(ev => sortKey(ev) >= min && sortKey(ev) <= max).map(ev => {
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
  const cal = calendar();
  const bands = [];
  cal.eras.forEach((era, i) => {
    const mine = sorted.filter(e => e.era === era.key);
    if (!mine.length) return;
    const ys = mine.map(e => Math.abs(Number(e.value) || 0));
    bands.push({
      name: era.name,
      span: Math.min(...ys) + "\u2013" + Math.max(...ys) + " " + era.abbr +
        " \u00b7 " + mine.length + " event" + (mine.length === 1 ? "" : "s"),
    });
    // name the turn between a falling era and the rising one after it
    const next = cal.eras[i + 1];
    if (next && era.counts === "down" && next.counts === "up" &&
        era.anchor === next.anchor && sorted.some(e => e.era === next.key)) {
      bands.push({ name: cal.pivot, span: "Year 0" });
    }
  });
  return bands;
}

/* The era editor lives on the Timeline itself rather than in Settings:
   it is the page where you notice the calendar is wrong. Eras can be
   added, removed and reordered, and the axis span can be pinned so the
   line covers the stretch of history you care about rather than only
   the years you happen to have entered. */
function toggleEraForm() {
  const host = $("#tlEraForm");
  if (!host) return;
  if (host.innerHTML) { host.innerHTML = ""; return; }
  renderEraForm();
}
function renderEraForm() {
  const host = $("#tlEraForm");
  const cal = calendar();
  const used = {};
  events.forEach(e => { used[e.era] = (used[e.era] || 0) + 1; });

  host.innerHTML = `<div class="tl-eras">
    <div class="rule-head"><span class="k">The eras of this world</span><span class="hr"></span></div>
    <p class="faint set-help">Each era needs a name, and whether its years count up or down as
      time moves forward; BC counts down, AD counts up. The year it counts from places it
      against the others on one line. These belong to this workspace alone.</p>

    <div class="era-rows">
      ${cal.eras.map((e, i) => `<div class="era-row" data-i="${i}">
        <input class="er-abbr" data-f="abbr" value="${esc(e.abbr)}" maxlength="12" placeholder="BC" title="Short form">
        <input class="er-name" data-f="name" value="${esc(e.name)}" maxlength="60" placeholder="Before the Common Era" title="Full name">
        <select class="er-counts" data-f="counts" title="Do years rise or fall as time moves forward?">
          <option value="down" ${e.counts === "down" ? "selected" : ""}>counts down</option>
          <option value="up" ${e.counts === "up" ? "selected" : ""}>counts up</option>
        </select>
        <input class="er-anchor" data-f="anchor" type="number" value="${e.anchor}" title="The year on the shared line this era counts from" style="width:92px">
        <span class="er-used">${used[e.key] ? used[e.key] + " event" + (used[e.key] === 1 ? "" : "s") : "unused"}</span>
        <button class="a-chip" data-eup="${i}" title="Move earlier" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="a-chip" data-edown="${i}" title="Move later" ${i === cal.eras.length - 1 ? "disabled" : ""}>↓</button>
        <button class="a-chip danger" data-edel="${i}" title="Remove this era">✕</button>
      </div>`).join("")}
    </div>
    <button class="btn ghost sm" id="eaAdd" style="margin-top:10px">Add an era</button>

    <div class="rule-head mt"><span class="k">What the calendar counts from</span><span class="hr"></span></div>
    <input class="import-title" id="eaPivot" maxlength="40" value="${esc(cal.pivot)}"
      placeholder="Reconstruction" style="max-width:320px">
    <p class="faint set-help">Shown at year zero where a falling era meets a rising one.</p>

    <div class="rule-head mt"><span class="k">How far the line runs</span><span class="hr"></span></div>
    <p class="faint set-help">Leave both blank and the line fits whatever events you have.
      Fill them in to pin the span; useful when the first age is long and empty.
      Both are positions on the shared line, so a year before zero is negative.</p>
    <div class="era-span">
      <label>Earliest<input id="eaFrom" type="number" value="${cal.from == null ? "" : cal.from}" placeholder="auto"></label>
      <label>Latest<input id="eaTo" type="number" value="${cal.to == null ? "" : cal.to}" placeholder="auto"></label>
    </div>

    <div class="tl-era-acts">
      <button class="btn sm" id="eaSave">Save this calendar</button>
      <button class="btn ghost sm" id="eaReset">Back to the defaults</button>
    </div>
  </div>`;

  // read the form back into a calendar object
  const collect = () => {
    const eras = $$(".era-row", host).map(row => {
      const g = f => $(`[data-f="${f}"]`, row);
      const i = +row.dataset.i;
      const existing = cal.eras[i] || {};
      return {
        key: existing.key || ("e" + Date.now().toString(36) + i),
        abbr: g("abbr").value.trim() || "?",
        name: g("name").value.trim() || "Unnamed era",
        counts: g("counts").value === "down" ? "down" : "up",
        anchor: Number(g("anchor").value) || 0,
      };
    });
    const num = el => { const v = el.value.trim(); return v === "" ? null : Number(v); };
    return {
      eras: eras.length ? eras : clone(ERA_DEFAULTS),
      pivot: $("#eaPivot", host).value.trim() || PIVOT_DEFAULT,
      from: num($("#eaFrom", host)), to: num($("#eaTo", host)),
    };
  };

  $$("[data-eup]", host).forEach(b => b.onclick = () => {
    const c = collect(), i = +b.dataset.eup;
    [c.eras[i - 1], c.eras[i]] = [c.eras[i], c.eras[i - 1]];
    saveCalendar(c); renderEraForm();
  });
  $$("[data-edown]", host).forEach(b => b.onclick = () => {
    const c = collect(), i = +b.dataset.edown;
    [c.eras[i + 1], c.eras[i]] = [c.eras[i], c.eras[i + 1]];
    saveCalendar(c); renderEraForm();
  });
  $$("[data-edel]", host).forEach(b => b.onclick = () => {
    const c = collect(), i = +b.dataset.edel;
    const era = c.eras[i];
    const n = used[era.key] || 0;
    if (c.eras.length === 1) { toast("A timeline needs at least one era"); return; }
    // Events never disappear with their era. They move to the era next
    // to it, keeping their year, and the confirm says so plainly.
    const to = c.eras[i === 0 ? 1 : i - 1];
    if (n && !confirm(`Remove the era “${era.name}”?\n\n${n} event${n === 1 ? "" : "s"} filed under it ` +
        `will move to “${to.name}”, keeping the same year. Nothing is deleted.`)) return;
    c.eras.splice(i, 1);
    saveCalendar(c);
    if (n) {
      Promise.all(events.filter(e => e.era === era.key).map(e => {
        e.era = to.key;
        return S().put("timeline", e);
      })).then(() => { toast(`${n} event${n === 1 ? "" : "s"} moved to “${to.name}”`); render(); renderEraForm(); });
    } else { renderEraForm(); render(); }
  });
  $("#eaAdd", host).onclick = () => {
    const c = collect();
    c.eras.push({ key: "e" + Date.now().toString(36), abbr: "NEW", name: "A new era", counts: "up", anchor: 0 });
    saveCalendar(c); renderEraForm();
  };
  $("#eaSave", host).onclick = () => {
    saveCalendar(collect());
    toast("Calendar saved");
    render();
  };
  $("#eaReset", host).onclick = () => {
    if (!confirm("Put the calendar back to Before and After the Reconstruction?\n\nEvents keep their years.")) return;
    resetCalendar();
    toast("Calendar reset");
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
