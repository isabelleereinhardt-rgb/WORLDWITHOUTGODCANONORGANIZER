/* ============================================================
   VIEWS OVER THE RECORDS

   One collection, several ways of looking at it. Notion's
   databases-as-views, scoped down to what a novelist actually asks
   while writing: a table you can sort, and a line you can read in
   order. No new storage — a view is a filter, a sort and a renderer
   over the entity records and the facts already attributed to them.

   The table is the one that earns its keep. Seven hundred names each
   carrying declared facts is a spreadsheet nobody has, and "every
   house, with its seat and its founder, sorted by when it was founded"
   is a question you cannot ask a list of chips.

   The dates need care, because this canon counts backwards. Years are
   written 8,759 BR and 1,147 AR, and BR runs DOWN as time moves
   forward — 8,759 BR is earlier than 8,577 BR, which is the opposite
   of what sorting the numbers would tell you. Getting that wrong would
   print the history of the world in reverse and look authoritative
   doing it, so the era decides the direction and the same convention
   the Timeline already uses is followed exactly.

   No graph view. It demos beautifully and answers nothing you would
   ask mid-sentence; a table and a line answer real questions.
   ============================================================ */
(function () {
"use strict";

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* ---------- reading a year out of what somebody wrote ----------
   "8,759 BR", "died in 8,577 BR at the age of 79", "1204", "c. 300 AR".
   The comma is a thousands separator here, not a list. */
const YEAR = /(\d[\d,]*)\s*(BR|AR)\b/i;
const BARE_YEAR = /\b(\d{3,5})\b/;
function dateIn(text) {
  const s = String(text || "");
  const m = YEAR.exec(s);
  if (m) {
    const value = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) return null;
    const era = m[2].toUpperCase();
    /* BR counts down: a bigger number is further in the past. Putting
       it on one line means negating it, exactly as the Timeline does. */
    return { value, era, abs: era === "BR" ? -value : value, said: m[0] };
  }
  const b = BARE_YEAR.exec(s);
  if (!b) return null;
  const value = Number(b[1]);
  return Number.isFinite(value) ? { value, era: "", abs: value, said: b[1] } : null;
}

/* The fields worth reading as a date, in the order they say most about
   when a thing belongs on a line. */
const DATE_FIELDS = ["founded", "born", "died", "era", "active years", "reign", "date"];
function dateFor(claims) {
  for (const f of DATE_FIELDS) {
    const hit = claims.find(c => c.field === f);
    if (hit) {
      const d = dateIn(hit.value);
      if (d) return Object.assign({ field: f }, d);
    }
  }
  for (const c of claims) {
    const d = dateIn(c.value);
    if (d) return Object.assign({ field: c.field }, d);
  }
  return null;
}

/* ---------- what to put in the columns ----------
   Chosen from the records on screen rather than fixed, because a table
   of houses wants Seat and Founder and a table of characters wants Age
   and Status, and neither wants the other's empty columns. */
function columnsFor(rows, max) {
  const count = Object.create(null);
  /* Only records that declare anything get a vote. A canon is mostly
     prose, and prose declares no fields; letting six hundred silent
     records outvote sixty filled-in ones deletes every column and
     leaves a table of names, which is the chip list with lines round
     it. Silence is not an objection. */
  const voters = rows.filter(r => r.claims.length).length;
  if (!voters) return [];
  rows.forEach(r => r.claims.forEach(c => { count[c.field] = (count[c.field] || 0) + 1; }));
  return Object.keys(count)
    .filter(f => count[f] >= Math.max(2, Math.ceil(voters * 0.2)))
    .sort((a, b) => count[b] - count[a] || a.localeCompare(b))
    .slice(0, max || 5);
}

/* Most of these kinds were worked out from the prose rather than
   chosen, and a column that shows a guess has to let you overrule it —
   otherwise it is just a wrong answer you have to look at. Choosing one
   settles it for good; the reading never overwrites a decision. */
function kindCell(r) {
  const types = (window.CodexEntities && window.CodexEntities.TYPES) || [];
  return `<select class="vt-kind${r.read ? " read" : ""}" data-kind-of="${esc(r.id)}"
    title="${r.read ? "Read from your writing. Change it if it is wrong." : "Set by you."}"
    aria-label="Kind of ${esc(r.name)}">${
    types.map(t => `<option value="${t}"${t === r.type ? " selected" : ""}>${t}</option>`).join("")
  }</select>`;
}

function valueOf(row, field) {
  const hit = row.claims.find(c => c.field === field);
  return hit ? hit.value : "";
}

/* ---------- assembling the rows ---------- */
function rowsFrom(opts) {
  opts = opts || {};
  const E = window.CodexEntities;
  if (!E || !E.ready()) return [];
  const kindOf = E.kindOf ? E.kindOf : (r => r.type);
  let recs = E.confirmed();
  if (opts.type && opts.type !== "all") recs = recs.filter(r => kindOf(r) === opts.type);
  return recs.map(r => ({
    id: r.id, name: r.name, type: kindOf(r), seen: r.seen || 0,
    read: E.kindWasRead ? E.kindWasRead(r) : false,
    aliases: r.aliases || [],
    claims: E.claimsFor(r.id),
  }));
}

function sortRows(rows, by, dir) {
  const sign = dir === "desc" ? -1 : 1;
  const out = rows.slice();
  if (by === "name") out.sort((a, b) => sign * a.name.localeCompare(b.name));
  else if (by === "type") out.sort((a, b) => sign * (a.type.localeCompare(b.type) || a.name.localeCompare(b.name)));
  else if (by === "seen") out.sort((a, b) => sign * (a.seen - b.seen) || a.name.localeCompare(b.name));
  else if (by === "when") {
    out.sort((a, b) => {
      const da = dateFor(a.claims), db = dateFor(b.claims);
      if (!da && !db) return a.name.localeCompare(b.name);
      if (!da) return 1;                       // undated sinks, either direction
      if (!db) return -1;
      return sign * (da.abs - db.abs) || a.name.localeCompare(b.name);
    });
  } else {
    // a declared field: blank values sink rather than sorting as ""
    out.sort((a, b) => {
      const va = valueOf(a, by), vb = valueOf(b, by);
      if (!va && !vb) return a.name.localeCompare(b.name);
      if (!va) return 1;
      if (!vb) return -1;
      const na = Number(va.replace(/,/g, "")), nb = Number(vb.replace(/,/g, ""));
      if (Number.isFinite(na) && Number.isFinite(nb)) return sign * (na - nb);
      return sign * va.localeCompare(vb);
    });
  }
  return out;
}

/* ---------- the table ---------- */
function tableHtml(rows, state) {
  if (!rows.length) return `<p class="faint">Nothing filed under that yet.</p>`;
  const cols = columnsFor(rows);
  const arrow = key => state.by === key ? (state.dir === "desc" ? " ▾" : " ▴") : "";
  const head = ["name", "type", "seen"].concat(cols);
  return `<div class="vt-wrap"><table class="vt">
    <thead><tr>
      <th><button data-sort="name">Name${arrow("name")}</button></th>
      <th><button data-sort="type">Kind${arrow("type")}</button></th>
      <th><button data-sort="seen">Mentions${arrow("seen")}</button></th>
      ${cols.map(c => `<th><button data-sort="${esc(c)}">${esc(c)}${arrow(c)}</button></th>`).join("")}
    </tr></thead>
    <tbody>${rows.slice(0, 400).map(r => `<tr>
      <td><a href="#/subject/${encodeURIComponent(r.name)}">${esc(r.name)}</a>${
        r.aliases.length ? `<span class="vt-alias">also ${esc(r.aliases.slice(0, 2).join(", "))}</span>` : ""}</td>
      <td>${kindCell(r)}</td>
      <td class="vt-dim">${r.seen}</td>
      ${cols.map(c => `<td>${esc(valueOf(r, c))}</td>`).join("")}
    </tr>`).join("")}</tbody>
  </table>
  ${footHtml(rows, cols)}</div>`;
}

/* Rows of blanks look like missing data rather than what they are:
   entries written as prose, which declares nothing. Saying so is
   shorter than letting somebody work it out from the emptiness. */
function footHtml(rows, cols) {
  const bits = [];
  if (rows.length > 400) bits.push(`Showing 400 of ${rows.length}.`);
  if (cols.length) {
    const bare = rows.filter(r => !r.claims.length).length;
    if (bare > rows.length * 0.25) {
      bits.push(`${bare} of these are written as prose and declare no fields, so the
        columns are blank for them. A line like <b>Seat: Lajazer</b> in an entry fills one in.`);
    }
  }
  return bits.length ? `<p class="faint">${bits.join(" ")}</p>` : "";
}

/* ---------- the line ---------- */
function timelineHtml(rows) {
  const dated = rows.map(r => ({ r, d: dateFor(r.claims) })).filter(x => x.d);
  if (!dated.length) {
    return `<p class="faint">Nothing here carries a date yet. Write <b>Founded: 8,759 BR</b> or
      <b>Born: 1204</b> in an entry and it will find its place on the line.</p>`;
  }
  dated.sort((a, b) => a.d.abs - b.d.abs);
  const undated = rows.length - dated.length;
  return `<div class="vl">
    ${dated.map(x => `<div class="vl-row">
      <span class="vl-when">${esc(x.d.said)}</span>
      <span class="vl-dot"></span>
      <span class="vl-what">
        <a href="#/subject/${encodeURIComponent(x.r.name)}">${esc(x.r.name)}</a>
        <em>${esc(x.d.field)}</em>
      </span>
    </div>`).join("")}
  </div>
  ${undated ? `<p class="faint">${undated} other${undated === 1 ? "" : "s"} carry no date, so they are
    not on the line.</p>` : ""}`;
}

window.CodexViews = { dateIn, dateFor, columnsFor, rowsFrom, sortRows, tableHtml, timelineHtml };
})();
