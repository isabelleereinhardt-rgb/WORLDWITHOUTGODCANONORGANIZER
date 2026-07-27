/* ============================================================
   Beep Beep Organizer; workspaces
   Each workspace is a fully separate project: its own documents,
   notes, canvases, mind maps, tasks, everything; backed by its
   own isolated IndexedDB database (see store.js). The default
   workspace keeps the World Without God canon; any workspace you
   create after that starts empty. The assistant/search only ever
   sees the active workspace's data.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* keys are namespaced per signed-in account (account.js), so every
   account keeps its own workspace list and active selection */
const WS_KEY = () => window.CodexAccount ? CodexAccount.storeKey("codex.workspaces") : "codex.workspaces";
const ACTIVE_KEY = () => window.CodexAccount ? CodexAccount.storeKey("codex.activeWorkspace") : "codex.activeWorkspace";
const uid = () => "ws" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function list() {
  try {
    const raw = JSON.parse(localStorage.getItem(WS_KEY()) || "null");
    if (raw && raw.length) return raw;
  } catch (e) {}
  const seeded = [{ id: "default", name: "World Without God", hasCanon: true, createdAt: Date.now() }];
  localStorage.setItem(WS_KEY(), JSON.stringify(seeded));
  return seeded;
}
function saveList(arr) { localStorage.setItem(WS_KEY(), JSON.stringify(arr)); }
function activeId() { return localStorage.getItem(ACTIVE_KEY()) || "default"; }
function current() { return list().find(w => w.id === activeId()) || list()[0]; }
function activeHasCanon() { const w = current(); return !!(w && w.hasCanon); }

async function create(name) {
  const arr = list();
  const ws = { id: uid(), name: (name || "").trim() || "Untitled workspace", hasCanon: false, createdAt: Date.now() };
  arr.push(ws); saveList(arr);
  return ws;
}
function rename(id, name) {
  const arr = list(); const w = arr.find(x => x.id === id); if (!w) return;
  w.name = (name || "").trim() || w.name; saveList(arr);
}
/* The original owner's canon workspace stays protected; for every other
   account, any workspace can go, as long as at least one remains. */
function canDelete(id) {
  const isLegacyOwner = window.CodexAccount && CodexAccount.ns() === "";
  if (id === "default" && isLegacyOwner) return false;
  return list().length > 1;
}
async function remove(id) {
  if (!canDelete(id)) throw new Error(id === "default" ? "The canon workspace can't be deleted." : "You need at least one workspace.");
  const arr = list().filter(x => x.id !== id); saveList(arr);
  if (window.CodexStore) await CodexStore.deleteWorkspaceDB(id);
  if (activeId() === id) localStorage.setItem(ACTIVE_KEY(), (arr[0] && arr[0].id) || "default");
}
async function switchTo(id) {
  localStorage.setItem(ACTIVE_KEY(), id);
  if (window.CodexStore) await CodexStore.switchWorkspace(id);
}

/* ---------- switcher UI (a panel like the export menu) ---------- */
function openSwitcher() {
  let el = document.getElementById("wsSwitcher");
  if (!el) {
    el = document.createElement("div");
    el.id = "wsSwitcher";
    el.className = "export-menu";
    document.body.appendChild(el);
    el.addEventListener("click", e => { if (e.target === el) closeSwitcher(); });
  }
  el.hidden = false;
  renderSwitcher();
}
function closeSwitcher() { const el = document.getElementById("wsSwitcher"); if (el) el.hidden = true; }
function renderSwitcher() {
  const el = document.getElementById("wsSwitcher"); if (!el) return;
  const active = activeId();
  const rows = list().map(w => `
    <div class="ws-row ${w.id === active ? "active" : ""}" data-ws="${w.id}">
      <span class="ws-name">${esc(w.name)}${w.hasCanon ? ` <span class="faint">· canon</span>` : ""}</span>
      ${w.id === active ? `<span class="ws-current">Current</span>` : `<button class="btn ghost sm" data-switch="${w.id}">Switch</button>`}
      <button class="btn ghost sm" data-rename="${w.id}">Rename</button>
      ${canDelete(w.id) ? `<button class="btn danger sm" data-remove="${w.id}">Delete</button>` : ""}
    </div>`).join("");
  el.innerHTML = `<div class="export-box" style="width:400px">
    <div class="export-title">Workspaces</div>
    <p class="faint" style="margin:0 0 12px">Each workspace is a separate project: its own documents, notes,
      canvases, everything. The assistant only ever looks at whichever one is active.</p>
    <div class="ws-list">${rows}</div>
    <div class="ws-new"><input id="wsNewName" placeholder="New workspace name…"><button class="btn sm" id="wsNewBtn">Create</button></div>
    <button class="btn ghost sm" id="wsClose" style="margin-top:10px;width:100%">Close</button>
  </div>`;

  $("#wsClose", el).onclick = closeSwitcher;
  $("#wsNewBtn", el).onclick = async () => {
    const name = $("#wsNewName", el).value.trim();
    if (!name) { toast("Give it a name"); return; }
    const ws = await create(name);
    await activate(ws.id);
    closeSwitcher();
  };
  $("#wsNewName", el).onkeydown = e => { if (e.key === "Enter") $("#wsNewBtn", el).click(); };
  $$("[data-switch]", el).forEach(b => b.onclick = async () => { await activate(b.dataset.switch); closeSwitcher(); });
  $$("[data-rename]", el).forEach(b => b.onclick = () => {
    const w = list().find(x => x.id === b.dataset.rename);
    const name = prompt("Rename workspace:", w ? w.name : "");
    if (name && name.trim()) { rename(b.dataset.rename, name); renderSwitcher(); if (window.Codex) Codex.refresh(); }
  });
  $$("[data-remove]", el).forEach(b => b.onclick = async () => {
    const w = list().find(x => x.id === b.dataset.remove);
    if (!confirm(`Delete "${w ? w.name : "this workspace"}" and everything in it? This can't be undone.`)) return;
    const wasActive = activeId() === b.dataset.remove;
    await remove(b.dataset.remove);
    if (wasActive) await activate(list()[0].id);
    renderSwitcher();
  });
}

/* full reload of app data/UI after switching workspaces */
async function activate(id) {
  await switchTo(id);
  if (window.CodexExtra) await CodexExtra.ready();
  if (window.Codex && Codex.reloadWorkspace) await Codex.reloadWorkspace();
  location.hash = "#/";
  updateBrandLabel();
  window.toast && toast("Switched to " + current().name);
}
function updateBrandLabel() {
  const el = document.querySelector(".brand-text small");
  if (el) el.textContent = current().name;
}

window.CodexWorkspaces = { list, current, activeId, activeHasCanon, create, rename, remove, switchTo, activate, openSwitcher, closeSwitcher, updateBrandLabel };
})();
