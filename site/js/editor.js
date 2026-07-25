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
let curDocRef = null; // { title(), editor } for whichever document is currently open, so the assistant can summarize "this document"
function getCurrentDoc() { return curDocRef; }

/* ============================================================
   DOCUMENTS
   ============================================================ */
async function list(folderId) {
  curDocRef = null;
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
        ${(window.CodexTypo ? CodexTypo.STYLES : []).map(s => `<option value="${s.key}">${s.label}</option>`).join("")}
        <option value="quote">Quote</option>
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
      <button id="tbGrammar" title="Check grammar &amp; style">Grammar</button>
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
  curDocRef = { title: () => titleEl.value, editor: edEl };

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
  $("#tbBlock").onchange = e => { applyBlockStyle(e.target.value, edEl); touch(); };
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
  $("#tbTable").onclick = () => insertTable(touch);
  $("#tbDictate").onclick = () => toggleDictate(edEl, touch);
  $("#tbReadSel").onclick = () => { window.CodexSpeech ? CodexSpeech.readSelection() : toast("Speech not supported here"); };
  $("#tbGrammar").onclick = () => runGrammarCheck(edEl.innerText);
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

  bindSlashMenu(edEl, touch);
  bindAutocomplete(edEl, touch);
}

/* ---------- entity-name autocomplete: type the start of a name you've
   used before and press Tab to finish it, the way Notion/Docs complete
   words. Only fires when exactly one canon name matches, so it never
   guesses wrong. ---------- */
let acEl = null, acSuggestion = null;
function closeAC() { if (acEl) { acEl.remove(); acEl = null; } acSuggestion = null; }
function bindAutocomplete(edEl, touch) {
  edEl.addEventListener("keyup", e => {
    if (["Tab", "Escape", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { closeAC(); return; }
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3) { closeAC(); return; }
    const before = node.textContent.slice(0, sel.anchorOffset);
    const m = before.match(/([A-Za-z]{3,})$/);
    if (!m) { closeAC(); return; }
    const partial = m[1];
    const entities = (window.Codex ? Codex.DB.entities : []);
    const pl = partial.toLowerCase();
    const matches = entities.filter(n => n.length > partial.length && n.toLowerCase().startsWith(pl));
    if (matches.length !== 1) { closeAC(); return; }
    acSuggestion = { full: matches[0], partialLen: partial.length };
    showAC(matches[0].slice(partial.length));
  });
  edEl.addEventListener("keydown", e => {
    if (!acSuggestion) return;
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("insertText", false, acSuggestion.full.slice(acSuggestion.partialLen));
      closeAC(); touch();
    } else if (e.key === "Escape") closeAC();
  });
  edEl.addEventListener("blur", () => setTimeout(closeAC, 150));
}
function showAC(remainder) {
  if (!acEl) { acEl = document.createElement("div"); acEl.className = "ac-hint"; document.body.appendChild(acEl); }
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const r = sel.getRangeAt(0).cloneRange();
    const rect = r.getClientRects()[0] || r.getBoundingClientRect();
    acEl.style.left = (rect.right + window.scrollX + 2) + "px";
    acEl.style.top = (rect.top + window.scrollY - 1) + "px";
  }
  acEl.textContent = remainder + " ⇥";
}

/* ---------- block styles: Title / Subtitle / Heading 1-7 / Normal / Caption / Quote
   Reads font+size+colour straight from Settings (via CodexTypo), so a
   Heading 1 typed here looks exactly like you configured it there. ---------- */
function applyBlockStyle(value, edEl) {
  edEl.focus();
  if (value === "quote") { document.execCommand("formatBlock", false, "blockquote"); return; }
  const st = window.CodexTypo && CodexTypo.STYLES.find(s => s.key === value);
  if (!st) return;
  document.execCommand("formatBlock", false, st.tag);
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    let node = sel.anchorNode;
    if (node && node.nodeType === 3) node = node.parentElement;
    let block = node && node.closest ? node.closest(st.tag) : null;
    if (!block || block === edEl) block = node;
    if (block && block.classList && block !== edEl) {
      block.className = (block.className || "").replace(/\bty-\S+/g, "").trim();
      block.classList.add("ty-" + value);
    }
  }
}
function insertTable(touch) {
  const rows = +(prompt("Rows:", "3") || 3), cols = +(prompt("Columns:", "3") || 3);
  if (!rows || !cols) return;
  let html = '<table class="doc-table"><tbody>';
  for (let r = 0; r < rows; r++) { html += "<tr>"; for (let c = 0; c < cols; c++) html += "<td>&nbsp;</td>"; html += "</tr>"; }
  html += "</tbody></table><p><br></p>";
  document.execCommand("insertHTML", false, html); touch();
}

/* ---------- slash command menu (Notion-style): type "/" to insert/format ---------- */
let slashEl = null, slashSel = 0, slashItems = [];
function closeSlash() { if (slashEl) { slashEl.remove(); slashEl = null; } }
function slashCommandList(edEl, touch) {
  const styleItems = (window.CodexTypo ? CodexTypo.STYLES : []).map(s => ({ label: s.label, run: () => applyBlockStyle(s.key, edEl) }));
  return [
    ...styleItems,
    { label: "Quote", run: () => applyBlockStyle("quote", edEl) },
    { label: "Bullet list", run: () => document.execCommand("insertUnorderedList") },
    { label: "Numbered list", run: () => document.execCommand("insertOrderedList") },
    { label: "Table", run: () => insertTable(touch) },
    { label: "Image", run: () => insertImage(edEl, touch) },
    { label: "Divider", run: () => document.execCommand("insertHorizontalRule") },
  ];
}
function bindSlashMenu(edEl, touch) {
  edEl.addEventListener("keyup", e => {
    if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key) && slashEl) return; // handled in keydown
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { closeSlash(); return; }
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3) { closeSlash(); return; }
    const textBefore = node.textContent.slice(0, sel.anchorOffset);
    if (e.key === "/" && /(^|\s)\/$/.test(textBefore)) {
      openSlash(edEl, touch, node);
    } else if (slashEl) {
      // keep menu open only while the "/" and a short filter word follow
      const m = textBefore.match(/\/(\w*)$/);
      if (!m) closeSlash(); else filterSlash(m[1]);
    }
  });
  edEl.addEventListener("keydown", e => {
    if (!slashEl) return;
    if (e.key === "ArrowDown") { e.preventDefault(); slashSel = Math.min(slashSel + 1, slashItems.length - 1); paintSlash(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); slashSel = Math.max(slashSel - 1, 0); paintSlash(); }
    else if (e.key === "Enter") { e.preventDefault(); runSlash(edEl, touch); }
    else if (e.key === "Escape") { e.preventDefault(); closeSlash(); }
  });
  edEl.addEventListener("blur", () => setTimeout(closeSlash, 150));
}
function openSlash(edEl, touch) {
  closeSlash();
  slashEl = document.createElement("div");
  slashEl.className = "slash-menu";
  document.body.appendChild(slashEl);
  slashSel = 0;
  slashItems = slashCommandList(edEl, touch);
  positionSlash();
  paintSlash();
}
function positionSlash() {
  if (!slashEl) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0).cloneRange();
  const rect = r.getClientRects()[0] || r.getBoundingClientRect();
  slashEl.style.left = (rect.left + window.scrollX) + "px";
  slashEl.style.top = (rect.bottom + window.scrollY + 6) + "px";
}
function filterSlash(query) {
  if (!slashEl) return;
  const all = slashItems;
  const q = (query || "").toLowerCase();
  slashEl._filtered = q ? all.filter(i => i.label.toLowerCase().includes(q)) : all;
  slashSel = 0;
  paintSlash();
}
function paintSlash() {
  if (!slashEl) return;
  const items = slashEl._filtered || slashItems;
  slashEl.innerHTML = items.length
    ? items.map((it, i) => `<div class="slash-item ${i === slashSel ? "sel" : ""}" data-i="${i}">${it.label}</div>`).join("")
    : `<div class="slash-empty">No match</div>`;
  $$(".slash-item", slashEl).forEach(el => {
    el.onmouseenter = () => { slashSel = +el.dataset.i; paintSlash(); };
    el.onmousedown = e => e.preventDefault(); // don't steal focus from editor
  });
}
function runSlash(edEl, touch) {
  const items = slashEl && (slashEl._filtered || slashItems);
  const item = items && items[slashSel];
  closeSlash();
  if (!item) return;
  // remove the trailing "/query" the user typed to trigger the menu
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const node = sel.anchorNode;
    if (node && node.nodeType === 3) {
      const before = node.textContent.slice(0, sel.anchorOffset);
      const m = before.match(/\/(\w*)$/);
      if (m) {
        const range = document.createRange();
        range.setStart(node, sel.anchorOffset - m[0].length);
        range.setEnd(node, sel.anchorOffset);
        range.deleteContents();
      }
    }
  }
  item.run();
  touch();
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

/* ---------- lightweight, offline grammar & style check ---------- */
const TYPOS = {
  "teh": "the", "adn": "and", "recieve": "receive", "seperate": "separate", "definately": "definitely",
  "occured": "occurred", "alot": "a lot", "wich": "which", "thier": "their", "becuase": "because",
  "untill": "until", "accomodate": "accommodate", "wierd": "weird", "goverment": "government",
  "beleive": "believe", "concious": "conscious", "existance": "existence", "publically": "publicly",
};
function runGrammarCheck(text) {
  const issues = [];
  const doubleSpace = text.match(/ {2,}/g); if (doubleSpace) issues.push({ msg: `${doubleSpace.length} place${doubleSpace.length === 1 ? "" : "s"} with double spaces.` });
  const repeated = text.match(/\b(\w+)\s+\1\b/gi); if (repeated) issues.push({ msg: `Repeated word: "${repeated[0]}".` });
  const openParen = (text.match(/\(/g) || []).length, closeParen = (text.match(/\)/g) || []).length;
  if (openParen !== closeParen) issues.push({ msg: `Unmatched parentheses (${openParen} "(" vs ${closeParen} ")").` });
  const quotes = (text.match(/"/g) || []).length;
  if (quotes % 2 !== 0) issues.push({ msg: `An odd number of straight quotes (${quotes}) — one may be unclosed.` });
  Object.keys(TYPOS).forEach(t => { if (new RegExp("\\b" + t + "\\b", "i").test(text)) issues.push({ msg: `Possible typo: "${t}" → "${TYPOS[t]}".` }); });
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) || [];
  sentences.forEach(s => {
    const words = s.trim().split(/\s+/).filter(Boolean);
    if (words.length > 42) issues.push({ msg: `A ${words.length}-word sentence may be hard to follow: "${s.trim().slice(0, 60)}…"` });
    const first = s.trim()[0];
    if (first && /[a-z]/.test(first)) issues.push({ msg: `Sentence doesn't start with a capital: "${s.trim().slice(0, 40)}…"` });
  });
  showGrammarPanel(issues, text);
}
function showGrammarPanel(issues, text) {
  let panel = document.getElementById("grammarPanel");
  if (!panel) { panel = document.createElement("div"); panel.id = "grammarPanel"; panel.className = "grammar-panel"; document.body.appendChild(panel); }
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  panel.innerHTML = `<button class="grammar-close" id="grammarClose">✕</button>
    <b style="font-family:var(--serif);font-size:15px">Grammar &amp; style</b>
    <p class="faint" style="font-size:12px;margin:6px 0 10px">${words} words checked · offline, rule-based — use judgement, it isn't exhaustive.</p>
    ${issues.length ? issues.map(i => `<div class="grammar-item">${i.msg}</div>`).join("") : `<div class="grammar-item">No issues spotted.</div>`}`;
  document.getElementById("grammarClose").onclick = () => panel.remove();
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
    <div style="margin:16px 0;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="newDeck">New deck</button>
      <button class="btn ghost" id="aiDeck" title="Let Gemini draft a deck from your canon">✦ AI deck from my canon</button>
    </div>
    <div id="aiDeckMsg"></div>
    ${decks.length ? `<div class="list-grid">${cards}</div>` :
      `<div class="empty-state">No decks here yet.</div>`}
  </div>`;
  $("#newDeck").onclick = async () => {
    const d = { id: uid(), title: "Untitled deck", folder: folderId || null,
      slides: [{ title: "Title slide", body: "Click to edit" }] };
    await S().put("decks", d); location.hash = "#/deck/" + d.id;
  };
  $("#aiDeck").onclick = () => generateAIDeck(folderId);
  $$("[data-open]", view()).forEach(c => c.onclick = e => {
    if (e.target.dataset.del) return; location.hash = "#/deck/" + c.dataset.open;
  });
  $$("[data-del]", view()).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    if (confirm("Delete this deck?")) { await S().del("decks", b.dataset.del); deckList(folderId); }
  });
}
function parseJsonObject(raw) {
  if (!raw) return {};
  let t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t) || {}; } catch (_) { return {}; }
}
async function generateAIDeck(folderId) {
  if (!window.CodexAI || !CodexAI.on) { toast("Connect Gemini first — Settings → Assistant"); location.hash = "#/settings"; return; }
  const topic = prompt("What should the deck be about? (a character, house, place, event, or a theme from your canon)");
  if (topic === null) return;
  const msg = $("#aiDeckMsg");
  if (msg) msg.innerHTML = `<div class="ai-thinking" style="padding:10px 0">✦ Drafting your deck from your canon<span class="ai-dots"><i></i><i></i><i></i></span></div>`;
  let context = "";
  try { context = CodexAI.context(topic || "overview", 14).context; } catch (e) {}
  const system = "You build a slide deck from a worldbuilding author's OWN canon. Use ONLY the provided excerpts — never invent names, facts, or events. " +
    "Return STRICT JSON only (no markdown, no prose): an object " +
    "{\"title\":\"deck title\",\"slides\":[{\"title\":\"slide title\",\"body\":\"a few short lines, use \\n for line breaks\"}]}. " +
    "Open with a strong title slide, then 4–8 content slides. Keep each slide skimmable — a heading plus a handful of concise lines.";
  const user = `Build a presentation about "${topic || "an overview of this world"}" from these excerpts. Return only the JSON.\n\n${context}`;
  try {
    const data = parseJsonObject(await CodexAI.complete(system, user, { maxTokens: 3200 }));
    const slides = (data.slides || []).map(s => ({ title: String(s.title || "").slice(0, 120), body: String(s.body || "").slice(0, 1200) })).filter(s => s.title || s.body);
    if (!slides.length) throw new Error("no slides came back");
    const d = { id: uid(), title: (data.title || topic || "AI deck").slice(0, 120), folder: folderId || null, slides };
    await S().put("decks", d);
    window.CodexFeed && CodexFeed.log("Generated AI deck", `${slides.length} slides on "${topic || "overview"}"`);
    location.hash = "#/deck/" + d.id;
  } catch (err) {
    if (msg) msg.innerHTML = `<div class="empty-state">✦ AI couldn't build the deck (${esc(err.message)}). Check your key in Settings, or use New deck.</div>`;
  }
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
      <select id="slideLayout" title="Slide layout">
        <option value="title-body">Title &amp; Body</option>
        <option value="title-only">Title Only</option>
        <option value="quote">Quote</option>
        <option value="two-col">Two Column</option>
      </select>
      <button class="btn ghost sm" id="addSlide">+ Slide</button>
      <button class="btn ghost sm" id="delSlide">Delete slide</button>
      <button class="btn sm" id="present">Present</button>
      <button class="btn ghost sm" id="deckExport">PDF</button>
      <span class="save-state" id="saveState">Saved</span>
    </div>
    <div class="deck-stage">
      <div class="slide-strip" id="strip"></div>
      <div class="slide-editor-wrap">
        <div class="slide-canvas" id="slideCanvas">
          <div class="s-title" contenteditable="true" id="sTitle"></div>
          <div class="s-body" contenteditable="true" id="sBody"></div>
        </div>
        <p class="faint" style="text-align:center;margin-top:14px;font-size:12px">Click the title or body to edit ·
          for Two Column, separate the halves with a <code>|</code> · arrow keys navigate slides in Present mode</p>
      </div>
    </div>`;
  const persist = async () => { await S().put("decks", d); $("#saveState").textContent = "Saved"; };
  const touch = () => { $("#saveState").textContent = "Saving…"; clearTimeout(renderDeck._t); renderDeck._t = setTimeout(persist, 500); };

  $("#deckTitle").oninput = e => { d.title = e.target.value; touch(); };
  $("#addSlide").onclick = () => { d.slides.splice(curSlide + 1, 0, { title: "New slide", body: "", layout: "title-body" }); curSlide++; persist(); renderDeck(); };
  $("#delSlide").onclick = () => {
    if (d.slides.length <= 1) return toast("A deck needs at least one slide");
    d.slides.splice(curSlide, 1); curSlide = Math.max(0, curSlide - 1); persist(); renderDeck();
  };
  $("#present").onclick = present;
  $("#deckExport").onclick = () => exportDeckPdf(d);
  $("#slideLayout").onchange = e => { d.slides[curSlide].layout = e.target.value; touch(); applyLayout(); drawStrip(); };

  const sTitle = $("#sTitle"), sBody = $("#sBody");
  function applyLayout() {
    const layout = d.slides[curSlide].layout || "title-body";
    $("#slideCanvas").className = "slide-canvas layout-" + layout;
    $("#slideLayout").value = layout;
  }
  const loadSlide = () => {
    sTitle.textContent = d.slides[curSlide].title;
    sBody.textContent = d.slides[curSlide].body;
    applyLayout();
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
function bodyHtml(s, forExport) {
  const layout = s.layout || "title-body";
  if (layout === "title-only") return "";
  if (layout === "two-col") {
    const [left, right] = (s.body || "").split("|");
    return `<div style="display:flex;gap:${forExport ? "6%" : "40px"}">
      <div style="flex:1">${esc((left || "").trim()).replace(/\n/g, "<br>")}</div>
      <div style="flex:1">${esc((right || "").trim()).replace(/\n/g, "<br>")}</div>
    </div>`;
  }
  if (layout === "quote") return `<div style="font-style:italic;text-align:center">${esc(s.body).replace(/\n/g, "<br>")}</div>`;
  return `${esc(s.body).replace(/\n/g, "<br>")}`;
}
function present() {
  const d = curDeck; let i = curSlide;
  const el = document.createElement("div");
  el.className = "present";
  const draw = () => {
    const s = d.slides[i];
    el.innerHTML = `
    <div class="s-title" style="${s.layout === "quote" ? "font-style:italic" : ""}">${esc(s.title)}</div>
    <div class="s-body">${bodyHtml(s, false)}</div>
    <div class="p-nav">${i + 1} / ${d.slides.length} · ← → to move · Esc to exit</div>`;
  };
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
      justify-content:center;padding:6%;box-sizing:border-box;border-bottom:1px solid #eee;text-align:${s.layout === "quote" ? "center" : "left"}">
      <h1 style="font-size:40px;font-family:Georgia,serif;margin:0 0 16px;font-style:${s.layout === "quote" ? "italic" : "normal"}">${esc(s.title)}</h1>
      <div style="font-size:22px;color:#444">${bodyHtml(s, true)}</div>
    </section>`).join("");
  w.document.write(`<!doctype html><title>${esc(d.title)}</title><style>body{margin:0;font-family:Georgia,serif}</style>${slides}`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

window.CodexEditor = { list, open, deckList, deckOpen, getCurrentDoc };
})();
