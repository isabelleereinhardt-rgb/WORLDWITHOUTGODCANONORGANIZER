/* ============================================================
   The Codex — Projects (folders)
   Group documents, decks, and canvases by the project you're
   working on, so several worlds / books stay untangled.
   A folder is just { id, name }; items carry a .folder = id.
   ============================================================ */
(function () {
"use strict";
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uid = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const S = () => window.CodexStore;

async function allFolders() { await S().ready; return (await S().all("folders")).sort((a, b) => (a.name || "").localeCompare(b.name || "")); }

/* A chip bar shown at the top of Documents / Decks / Canvases.
   kind is informational; baseHash is where a chip click navigates
   (e.g. "#/docs" → "#/docs/<folderId>"). */
function bar(kind, activeId, baseHash) {
  // synchronous render off a cached list populated by ensureCache()
  const folders = window.CodexFolders._cache || [];
  const chip = (id, label, count) =>
    `<button class="folder-chip ${activeId === id || (!activeId && !id) ? "active" : ""}" data-folder="${id || ""}">
       ${esc(label)}${count != null ? `<span class="fc-n">${count}</span>` : ""}</button>`;
  const chips = [chip("", "All")].concat(folders.map(f => chip(f.id, f.name)));
  setTimeout(() => bindBar(baseHash), 0);
  return `<div class="folder-bar" data-base="${esc(baseHash)}">
    ${chips.join("")}
    <button class="folder-chip new" id="newFolderBtn">+ Project</button>
  </div>`;
}
function bindBar(baseHash) {
  document.querySelectorAll(".folder-bar .folder-chip[data-folder]").forEach(b => {
    b.onclick = () => { const id = b.dataset.folder; location.hash = id ? baseHash + "/" + id : baseHash; };
  });
  const nb = document.getElementById("newFolderBtn");
  if (nb) nb.onclick = async () => {
    const name = prompt("Name this project / folder:");
    if (!name) return;
    await S().put("folders", { id: uid(), name: name.trim() });
    await ensureCache(true);
    // re-run current route so the new chip shows
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
}

/* keep a synchronous cache so bar() can render inside sync view code */
async function ensureCache(force) {
  if (force || !window.CodexFolders._cache) window.CodexFolders._cache = await allFolders();
  return window.CodexFolders._cache;
}

/* a small <select> to move an item into a folder */
function selectFor(currentId) {
  const folders = window.CodexFolders._cache || [];
  return `<select class="folder-select" data-role="folder-move">
    <option value="">No project</option>
    ${folders.map(f => `<option value="${f.id}" ${f.id === currentId ? "selected" : ""}>${esc(f.name)}</option>`).join("")}
  </select>`;
}

window.CodexFolders = { allFolders, bar, selectFor, ensureCache, _cache: null };
})();
