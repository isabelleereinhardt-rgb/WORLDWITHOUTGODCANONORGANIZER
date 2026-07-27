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
  // the rename/delete affordance only appears once a project is open,
  // because that is the only moment it has something to act on
  const active = folders.find(f => f.id === activeId);
  return `<div class="folder-bar" data-base="${esc(baseHash)}">
    ${chips.join("")}
    <button class="folder-chip new" id="newFolderBtn">+ Project</button>
    ${active ? `<span class="fb-sep"></span>
      <button class="folder-chip quiet" id="renameFolderBtn" title="Rename this project">Rename</button>
      <button class="folder-chip quiet danger" id="delFolderBtn" title="Delete this project">Delete</button>` : ""}
  </div>`;
}
function bindBar(baseHash) {
  document.querySelectorAll(".folder-bar .folder-chip[data-folder]").forEach(b => {
    b.onclick = () => { const id = b.dataset.folder; location.hash = id ? baseHash + "/" + id : baseHash; };
  });
  const activeChip = document.querySelector(".folder-bar .folder-chip.active[data-folder]");
  const activeId = activeChip ? activeChip.dataset.folder : "";
  const rb = document.getElementById("renameFolderBtn");
  if (rb) rb.onclick = async () => {
    const cur = (window.CodexFolders._cache || []).find(f => f.id === activeId);
    const name = prompt("Rename this project:", cur ? cur.name : "");
    if (name === null) return;
    if (await renameFolder(activeId, name)) {
      window.toast && toast("Project renamed");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  };
  const db = document.getElementById("delFolderBtn");
  if (db) db.onclick = async () => {
    const cur = (window.CodexFolders._cache || []).find(f => f.id === activeId);
    if (!cur) return;
    if (await confirmRemove(activeId, cur.name)) location.hash = baseHash;
  };
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

/* ---------- renaming and removing a project ----------
   Deleting a project never deletes what is filed in it. The documents,
   decks and canvases inside are simply unfiled and stay exactly where
   they were — you lose the grouping, not the writing. That is said out
   loud in the confirm, because "delete project" reads like it takes the
   chapters with it. */
async function itemsIn(folderId) {
  await S().ready;
  const kinds = ["docs", "decks", "canvases", "mindmaps", "sheets"];
  const found = [];
  for (const k of kinds) {
    let rows = [];
    try { rows = await S().all(k); } catch (e) { continue; }   // a store may not exist yet
    rows.filter(r => r && r.folder === folderId).forEach(r => found.push({ store: k, row: r }));
  }
  return found;
}

async function renameFolder(id, name) {
  const clean = (name || "").trim();
  if (!clean) return false;
  await S().ready;
  const f = await S().get("folders", id);
  if (!f) return false;
  f.name = clean.slice(0, 120);
  await S().put("folders", f);
  await ensureCache(true);
  return true;
}

async function removeFolder(id) {
  await S().ready;
  const items = await itemsIn(id);
  // unfile first, so a failure part-way through never leaves documents
  // pointing at a project that no longer exists
  for (const it of items) {
    it.row.folder = null;
    await S().put(it.store, it.row);
  }
  await S().del("folders", id);
  await ensureCache(true);
  return items.length;
}

/* the shared confirm, used from the project bar and from a work page */
async function confirmRemove(id, name) {
  const items = await itemsIn(id);
  const n = items.length;
  const msg = n
    ? `Delete the project “${name}”?\n\n` +
      `${n} item${n === 1 ? "" : "s"} filed in it will be kept and simply unfiled — ` +
      `nothing you have written is deleted.`
    : `Delete the project “${name}”?\n\nIt is empty, so nothing else changes.`;
  if (!confirm(msg)) return false;
  const moved = await removeFolder(id);
  window.toast && toast(moved
    ? `Project deleted. ${moved} item${moved === 1 ? "" : "s"} kept and unfiled.`
    : "Project deleted.");
  return true;
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

window.CodexFolders = {
  allFolders, bar, selectFor, ensureCache, _cache: null,
  renameFolder, removeFolder, confirmRemove, itemsIn,
};
})();
