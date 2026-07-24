/* ============================================================
   The Codex — Documents & Slide Decks
   Rich text editor + deck builder. Everything saves to IndexedDB
   (via CodexStore), so images persist. Items can be filed under
   a project folder. Export to Word / Markdown / print-to-PDF.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const view = () => $("#view");
const uid = () => "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const S = () => window.CodexStore;

/* ============================================================
   DOCUMENTS
   ============================================================ */
async function list(folderId) {
  await S().ready;
  if (window.CodexFolders) await CodexFolders.ensureCache(true);
  let docs = (await S().all("docs")).sort((a, b) => b.updated - a.updated);
  if (folderId) docs = docs.filter(d => d.folder === folderId);

  const folderBar = window.CodexFolders ? CodexFolders.bar("doc", folderId, "#/docs") : "";
  const cards = docs.map(d => `
    <div class="entry-card" data-open="${d.id}" style="cursor:pointer">
      <h3>${esc(d.title || "Untitled")}</h3>
      <p>${esc(stripHtml(d.html).slice(0, 160)) || "Empty document"}</p>
      <div class="meta">Edited ${fmtDate(d.updated)}
        <button class="btn ghost sm" data-del="${d.id}" style="margin-left:auto">Delete</button></div>
    </div>`).join("");
  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Workspace</div>
    <h1>Documents</h1>
    <p class="muted">Write lore, drafts, and notes right inside your organizer. They save automatically to this
      browser — use <b>Back up my work</b> in the sidebar to keep a portable copy.</p>
    ${folderBar}
    <div style="margin:16px 0"><button class="btn" id="newDoc">New document</button></div>
    ${docs.length ? `<div class="list-grid">${cards}</div>` :
      `<div class="empty-state">No documents here yet. Create one to start writing.</div>`}
  </div>`;
  $("#newDoc").onclick = async () => {
    const d = { id: uid(), title: "", html: "", folder: folderId || null };
    await S().put("docs", d); location.hash = "#/doc/" + d.id;
  };
  $$("[data-open]", view()).forEach(c => c.onclick = e => {
    if (e.target.dataset.del) return;
    location.hash = "#/doc/" + c.dataset.open;
  });
  $$("[data-del]", view()).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (confirm("Delete this document?")) { await S().del("docs", b.dataset.del); list(folderId); }
  });
}

async function open(id) {
  await S().ready;
  if (window.CodexFolders) await CodexFolders.ensureCache();
  const doc = await S().get("docs", id);
  if (!doc) { location.hash = "#/docs"; return; }
  const folderSelect = window.CodexFolders ? CodexFolders.selectFor(doc.folder) : "";
  view().innerHTML = `
    <div class="doc-toolbar">
      <select id="tbBlock" title="Text style">
        <option value="p">Body</option><option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option><option value="blockquote">Quote</option>
      </select>
      <span class="sep"></span>
      <button data-cmd="bold" title="Bold"><b>B</b></button>
      <button data-cmd="italic" title="Italic"><i>I</i></button>
      <button data-cmd="underline" title="Underline"><u>U</u></button>
      <button data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
      <span class="sep"></span>
      <button data-cmd="justifyLeft" title="Align left">⯇</button>
      <button data-cmd="justifyCenter" title="Align center">≡</button>
      <button data-cmd="justifyRight" title="Align right">⯈</button>
      <span class="sep"></span>
      <button data-cmd="indent" title="Indent">→|</button>
      <button data-cmd="outdent" title="Outdent">|←</button>
      <select id="tbSpacing" title="Line spacing">
        <option value="">Line spacing</option>
        <option value="1">Single</option><option value="1.5">1.5×</option><option value="2">Double</option>
      </select>
      <span class="sep"></span>
      <button data-cmd="insertUnorderedList" title="Bullet list">List</button>
      <button data-cmd="insertOrderedList" title="Numbered list">1.</button>
      <span class="sep"></span>
      <button id="tbLink" title="Insert link">Link</button>
      <button id="tbImg" title="Insert image">Image</button>
      <button id="tbTable" title="Insert table">Table</button>
      <button id="tbHr" title="Divider">Divider</button>
      <span class="sep"></span>
      <button id="tbDictate" title="Dictate (speech to text)">Dictate</button>
      <button id="tbReadSel" title="Read selection aloud">Read aloud</button>
      <span class="sep"></span>
      ${folderSelect}
      <button id="tbAssist" title="Toggle assistant" class="accent">✦ Assistant</button>
      <button id="tbExport" title="Export">Export</button>
      <span class="save-state" id="saveState">Saved</span>
    </div>
    <div class="wrap">
      <input class="doc-title" id="docTitle" placeholder="Untitled document" value="${esc(doc.title)}">
      <div class="doc-editor" id="docEditor" contenteditable="true" spellcheck="true"
           data-ph="Start writing your lore… As you type names from your world, the assistant on the right recognises them.">${doc.html || ""}</div>
      <div class="doc-footer">
        <span id="wordCount">0 words</span>
        <span class="doc-footer-sep">·</span>
        <button class="timer-btn" id="writeTimer">Start writing timer</button>
      </div>
    </div>`;

  const titleEl = $("#docTitle"), edEl = $("#docEditor"), stateEl = $("#saveState");
  edEl.focus();

  let saveT, scanT;
  const updateWordCount = () => {
    const words = (edEl.innerText || "").trim().split(/\s+/).filter(Boolean).length;
    const wc = $("#wordCount"); if (wc) wc.textContent = words + " word" + (words === 1 ? "" : "s");
  };
  const persist = async () => {
    doc.title = titleEl.value; doc.html = edEl.innerHTML;
    await S().put("docs", doc);
    stateEl.textContent = S().usingFallback() ? "Saved (local)" : "Saved";
  };
  const touch = () => { stateEl.textContent = "Saving…"; updateWordCount(); clearTimeout(saveT); saveT = setTimeout(persist, 600); };
  updateWordCount();
  titleEl.oninput = touch;
  edEl.oninput = () => {
    touch();
    clearTimeout(scanT);
    scanT = setTimeout(() => {
      if (window.CodexAssistant && !$("#assistant").hidden) CodexAssistant.scan(edEl.innerText);
    }, 400);
  };

  // toolbar
  $$("[data-cmd]", view()).forEach(b => b.onmousedown = e => {
    e.preventDefault();
    document.execCommand(b.dataset.cmd, false, null);
    edEl.focus(); touch();
  });
  $("#tbBlock").onchange = e => { document.execCommand("formatBlock", false, e.target.value); edEl.focus(); touch(); };
  $("#tbSpacing").onchange = e => {
    if (!e.target.value) return;
    const sel = window.getSelection();
    const applyTo = (node) => { node.style.lineHeight = e.target.value; };
    if (sel && sel.anchorNode) {
      let block = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      while (block && block !== edEl && !/^(P|DIV|LI|H1|H2|BLOCKQUOTE)$/.test(block.tagName || "")) block = block.parentElement;
      applyTo(block && block !== edEl ? block : edEl);
    } else applyTo(edEl);
    touch();
  };
  $("#tbLink").onclick = () => { const u = prompt("Link URL:"); if (u) document.execCommand("createLink", false, u); touch(); };
  $("#tbHr").onclick = () => { document.execCommand("insertHorizontalRule"); touch(); };
  $("#tbImg").onclick = () => insertImage(edEl, touch);
  $("#tbTable").onclick = () => {
    const rows = +(prompt("Rows:", "3") || 3), cols = +(prompt("Columns:", "3") || 3);
    if (!rows || !cols) return;
    let html = '<table class="doc-table"><tbody>';
    for (let r = 0; r < rows; r++) { html += "<tr>"; for (let c = 0; c < cols; c++) html += "<td>&nbsp;</td>"; html += "</tr>"; }
    html += "</tbody></table><p><br></p>";
    document.execCommand("insertHTML", false, html); touch();
  };
  $("#tbDictate").onclick = () => toggleDictate(edEl, touch);
  $("#tbReadSel").onclick = () => { window.CodexSpeech ? CodexSpeech.readSelection() : toast("Speech not supported here"); };
  $("#tbAssist").onclick = () => { CodexAssistant.open(); CodexAssistant.scan(edEl.innerText); };
  $("#tbExport").onclick = () => exportMenu(doc);
  const fsel = $('[data-role="folder-move"]', view());
  if (fsel) fsel.onchange = () => { doc.folder = fsel.value || null; touch(); };
  bindWriteTimer($("#writeTimer"));

  // paste images (downscaled)
  edEl.addEventListener("paste", async ev => {
    const items = (ev.clipboardData || {}).items || [];
    for (const it of items) {
      if (it.type && it.type.indexOf("image") === 0) {
        ev.preventDefault();
        try {
          const url = await window.CodexImg.fileToScaledDataURL(it.getAsFile());
          document.execCommand("insertImage", false, url); touch();
        } catch (e) { toast("Couldn't read that image"); }
      }
    }
  });
}

/* ---------- dictation (speech-to-text straight into the editor) ---------- */
let dictateRec = null;
function toggleDictate(edEl, touch) {
  const btn = $("#tbDictate");
  if (dictateRec) { dictateRec.stop(); dictateRec = null; btn.classList.remove("active"); btn.textContent = "Dictate"; return; }
  edEl.focus();
  let base = "";
  dictateRec = window.CodexSpeech && CodexSpeech.dictate(
    (finalText, interim) => {
      document.execCommand("insertText", false, finalText.slice(base.length) || "");
      base = finalText;
      touch();
    },
    () => { dictateRec = null; btn.classList.remove("active"); btn.textContent = "Dictate"; }
  );
  if (dictateRec) { btn.classList.add("active"); btn.textContent = "Stop dictating"; }
}

/* ---------- writing timer ---------- */
function bindWriteTimer(btn) {
  if (!btn) return;
  let t0 = null, iv = null;
  btn.onclick = () => {
    if (iv) {
      clearInterval(iv); iv = null;
      const mins = Math.round((Date.now() - t0) / 60000);
      btn.textContent = "Start writing timer";
      btn.classList.remove("active");
      toast(`Writing session: ${mins < 1 ? "under a minute" : mins + " min"}`);
      return;
    }
    t0 = Date.now();
    btn.classList.add("active");
    iv = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      const m = String(Math.floor(s / 60)).padStart(2, "0"), sec = String(s % 60).padStart(2, "0");
      btn.textContent = `${m}:${sec} — stop`;
    }, 1000);
  };
}

function insertImage(edEl, touch) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const url = await window.CodexImg.fileToScaledDataURL(f);
      edEl.focus(); document.execCommand("insertImage", false, url); touch();
    } catch (e) { toast("Couldn't read that image"); }
  };
  inp.click();
}

/* ---------- export ---------- */
function exportMenu(doc) {
  const choice = prompt("Export as:\n1 = Word (.doc)\n2 = Markdown (.md)\n3 = Print / PDF\n\nType 1, 2, or 3:", "1");
  if (choice === "1") exportWord(doc);
  else if (choice === "2") exportMarkdown(doc);
  else if (choice === "3") printDoc(doc);
}
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
}
function exportWord(doc) {
  const html = `<!doctype html><html xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${esc(doc.title)}</title>
    <style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.6}h1{font-size:22pt}h2{font-size:16pt}blockquote{border-left:3px solid #999;padding-left:12px;color:#555}</style>
    </head><body><h1>${esc(doc.title || "Untitled")}</h1>${doc.html}</body></html>`;
  download((doc.title || "document") + ".doc", html, "application/msword");
  window.toast && toast("Word document downloaded");
}
function exportMarkdown(doc) {
  const md = htmlToMd(doc.html);
  download((doc.title || "document") + ".md", `# ${doc.title || "Untitled"}\n\n${md}`, "text/markdown");
  window.toast && toast("Markdown downloaded");
}
function printDoc(doc) {
  const w = window.open("", "_blank");
  w.document.write(`<!doctype html><title>${esc(doc.title)}</title>
    <style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;line-height:1.7;padding:0 20px}
    h1{font-size:32px}blockquote{border-left:3px solid #7c5cff;padding-left:16px;color:#555;font-style:italic}
    img{max-width:100%}</style>
    <h1>${esc(doc.title || "Untitled")}</h1>${doc.html}`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}
function stripHtml(h) { const d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent || ""; }
function htmlToMd(html) {
  const d = document.createElement("div"); d.innerHTML = html || "";
  const walk = n => {
    let out = "";
    n.childNodes.forEach(c => {
      if (c.nodeType === 3) { out += c.textContent; return; }
      const tag = c.tagName ? c.tagName.toLowerCase() : "";
      const inner = walk(c);
      if (tag === "h1") out += `\n# ${inner}\n`;
      else if (tag === "h2") out += `\n## ${inner}\n`;
      else if (tag === "b" || tag === "strong") out += `**${inner}**`;
      else if (tag === "i" || tag === "em") out += `*${inner}*`;
      else if (tag === "blockquote") out += `\n> ${inner}\n`;
      else if (tag === "li") out += `\n- ${inner}`;
      else if (tag === "br") out += `\n`;
      else if (tag === "a") out += `[${inner}](${c.getAttribute("href")})`;
      else if (tag === "img") out += `![](image)`;
      else if (tag === "p" || tag === "div") out += `\n${inner}\n`;
      else out += inner;
    });
    return out;
  };
  return walk(d).replace(/\n{3,}/g, "\n\n").trim();
}

/* ============================================================
   SLIDE DECKS
   ============================================================ */
async function deckList(folderId) {
  await S().ready;
  if (window.CodexFolders) await CodexFolders.ensureCache(true);
  let decks = (await S().all("decks")).sort((a, b) => b.updated - a.updated);
  if (folderId) decks = decks.filter(d => d.folder === folderId);
  const folderBar = window.CodexFolders ? CodexFolders.bar("deck", folderId, "#/slides") : "";
  const cards = decks.map(d => `
    <div class="entry-card" data-open="${d.id}" style="cursor:pointer">
      <h3>${esc(d.title || "Untitled deck")}</h3>
      <p>${d.slides.length} slide${d.slides.length === 1 ? "" : "s"}</p>
      <div class="meta">Edited ${fmtDate(d.updated)}
        <button class="btn ghost sm" data-del="${d.id}" style="margin-left:auto">Delete</button></div>
    </div>`).join("");
  view().innerHTML = `<div class="wrap wide">
    <div class="page-kicker">Workspace</div>
    <h1>Slide Decks</h1>
    <p class="muted">Build simple presentations for your world — lore recaps, house profiles, pitch decks.
      Present fullscreen or export to PDF.</p>
    ${folderBar}
    <div style="margin:16px 0"><button class="btn" id="newDeck">New deck</button></div>
    ${decks.length ? `<div class="list-grid">${cards}</div>` :
      `<div class="empty-state">No decks here yet.</div>`}
  </div>`;
  $("#newDeck").onclick = async () => {
    const d = { id: uid(), title: "Untitled deck", folder: folderId || null,
      slides: [{ title: "Title slide", body: "Click to edit" }] };
    await S().put("decks", d); location.hash = "#/deck/" + d.id;
  };
  $$("[data-open]", view()).forEach(c => c.onclick = e => {
    if (e.target.dataset.del) return; location.hash = "#/deck/" + c.dataset.open;
  });
  $$("[data-del]", view()).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (confirm("Delete this deck?")) { await S().del("decks", b.dataset.del); deckList(folderId); }
  });
}

let curDeck = null, curSlide = 0;
async function deckOpen(id) {
  await S().ready;
  curDeck = await S().get("decks", id); curSlide = 0;
  if (!curDeck) { location.hash = "#/slides"; return; }
  renderDeck();
}
function renderDeck() {
  const d = curDeck;
  view().innerHTML = `
    <div class="doc-toolbar">
      <input class="doc-title" style="font-size:20px;width:auto;flex:1" id="deckTitle" value="${esc(d.title)}">
      <button class="btn ghost sm" id="addSlide">+ Slide</button>
      <button class="btn ghost sm" id="delSlide">Delete slide</button>
      <button class="btn sm" id="present">Present</button>
      <button class="btn ghost sm" id="deckExport">PDF</button>
      <span class="save-state" id="saveState">Saved</span>
    </div>
    <div class="deck-stage">
      <div class="slide-strip" id="strip"></div>
      <div class="slide-editor-wrap">
        <div class="slide-canvas">
          <div class="s-title" contenteditable="true" id="sTitle"></div>
          <div class="s-body" contenteditable="true" id="sBody"></div>
        </div>
        <p class="faint" style="text-align:center;margin-top:14px;font-size:12px">Click the title or body to edit · arrow keys navigate slides in Present mode</p>
      </div>
    </div>`;
  const persist = async () => { await S().put("decks", d); $("#saveState").textContent = "Saved"; };
  const touch = () => { $("#saveState").textContent = "Saving…"; clearTimeout(renderDeck._t); renderDeck._t = setTimeout(persist, 500); };

  $("#deckTitle").oninput = e => { d.title = e.target.value; touch(); };
  $("#addSlide").onclick = () => { d.slides.splice(curSlide + 1, 0, { title: "New slide", body: "" }); curSlide++; persist(); renderDeck(); };
  $("#delSlide").onclick = () => {
    if (d.slides.length <= 1) return toast("A deck needs at least one slide");
    d.slides.splice(curSlide, 1); curSlide = Math.max(0, curSlide - 1); persist(); renderDeck();
  };
  $("#present").onclick = present;
  $("#deckExport").onclick = () => exportDeckPdf(d);

  const sTitle = $("#sTitle"), sBody = $("#sBody");
  const loadSlide = () => {
    sTitle.textContent = d.slides[curSlide].title;
    sBody.textContent = d.slides[curSlide].body;
  };
  sTitle.oninput = () => { d.slides[curSlide].title = sTitle.textContent; touch(); drawStrip(); };
  sBody.oninput = () => { d.slides[curSlide].body = sBody.textContent; touch(); drawStrip(); };
  loadSlide();

  function drawStrip() {
    $("#strip").innerHTML = d.slides.map((s, i) => `
      <div class="slide-thumb ${i === curSlide ? "active" : ""}" data-i="${i}">
        <span class="num">${i + 1}</span>
        <div style="font-weight:600;font-family:var(--serif)">${esc((s.title || "").slice(0, 40))}</div>
        <div style="margin-top:4px;color:var(--ink-faint)">${esc((s.body || "").slice(0, 60))}</div>
      </div>`).join("");
    $$("#strip .slide-thumb").forEach(t => t.onclick = () => { curSlide = +t.dataset.i; loadSlide(); drawStrip(); });
  }
  drawStrip();
}
function present() {
  const d = curDeck; let i = curSlide;
  const el = document.createElement("div");
  el.className = "present";
  const draw = () => el.innerHTML = `
    <div class="s-title">${esc(d.slides[i].title)}</div>
    <div class="s-body">${esc(d.slides[i].body).replace(/\n/g, "<br>")}</div>
    <div class="p-nav">${i + 1} / ${d.slides.length} · ← → to move · Esc to exit</div>`;
  draw();
  document.body.appendChild(el);
  const key = e => {
    if (e.key === "ArrowRight" || e.key === " ") { i = Math.min(i + 1, d.slides.length - 1); draw(); }
    else if (e.key === "ArrowLeft") { i = Math.max(i - 1, 0); draw(); }
    else if (e.key === "Escape") { el.remove(); document.removeEventListener("keydown", key); }
  };
  document.addEventListener("keydown", key);
  el.onclick = () => { i = Math.min(i + 1, d.slides.length - 1); draw(); };
}
function exportDeckPdf(d) {
  const w = window.open("", "_blank");
  const slides = d.slides.map(s => `
    <section style="width:100%;aspect-ratio:16/9;page-break-after:always;display:flex;flex-direction:column;
      justify-content:center;padding:6%;box-sizing:border-box;border-bottom:1px solid #eee">
      <h1 style="font-size:40px;font-family:Georgia,serif;margin:0 0 16px">${esc(s.title)}</h1>
      <div style="font-size:22px;color:#444">${esc(s.body).replace(/\n/g, "<br>")}</div>
    </section>`).join("");
  w.document.write(`<!doctype html><title>${esc(d.title)}</title><style>body{margin:0;font-family:Georgia,serif}</style>${slides}`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

window.CodexEditor = { list, open, deckList, deckOpen };
})();
