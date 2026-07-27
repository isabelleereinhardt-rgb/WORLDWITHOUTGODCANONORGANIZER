/* ============================================================
   Beep Beep Organizer; accounts & the front door
   Wattpad-style: you sign in BEFORE you enter the app, not from
   a buried settings page. Accounts are stored on this device
   (this is a static site with no server), and each account gets
   its own fully separate data: its own workspaces, documents,
   notes, stories, settings; nothing bleeds between people.

   How the separation works:
   - The very first account created on a device that already has
     data "claims" that existing data (so the original owner keeps
     everything exactly as it was).
   - Every other account gets a namespaced copy of storage: all
     localStorage keys and IndexedDB database names are suffixed
     with the account id.
   - Brand-new accounts get the starter template (data/template.js)
     replicated into a workspace of their own; from then on their
     edits persist like anything else.

   This module MUST load before store.js / workspaces.js so the
   namespace is known before any data is opened.
   ============================================================ */
(function () {
"use strict";

const ACCOUNTS_KEY = "codex.accounts";        // device-wide: list of accounts
const SESSION_KEY = "codex.session";          // device-wide: signed-in account id
const FRESH_KEY = "codex.freshDevice";        // recorded once, before the app ever seeds anything

const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uid = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function accounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); } catch (e) { return []; }
}
function saveAccounts(list) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
function sessionId() { return localStorage.getItem(SESSION_KEY) || ""; }
function current() { return accounts().find(a => a.id === sessionId()) || (sessionId() === "guest" ? GUEST : null); }
const GUEST = { id: "guest", name: "Guest", guest: true };

/* Record, ONCE, whether this device had any app data before accounts
   existed. This must run before app.js boots (which lazily seeds
   codex.workspaces), or we could never tell an old device from a new one. */
if (localStorage.getItem(FRESH_KEY) === null) {
  const hadData = localStorage.getItem("codex.workspaces") !== null ||
                  localStorage.getItem("codex.settings") !== null ||
                  localStorage.getItem("codex.recent") !== null;
  localStorage.setItem(FRESH_KEY, hadData ? "0" : "1");
}

/* ---------- namespacing ---------- */
/* The account that claimed the device's original data keeps the bare,
   historical key names; everyone else gets suffixed keys/db names. */
function ns() {
  const a = current();
  if (!a) return "gate";               // not signed in: a throwaway space so nothing real is touched
  if (a.legacy) return "";             // the claiming account: original, un-suffixed storage
  return a.id;
}
function storeKey(base) { const n = ns(); return n ? base + "@" + n : base; }
function dbName(workspaceId) {
  const n = ns();
  const base = workspaceId === "default" ? "codex-db" : "codex-db--" + workspaceId;
  return n ? base + "@" + n : base;
}

/* ---------- password hashing (device-local; honest, not bank-grade) ---------- */
async function hashPass(pass, salt) {
  const data = salt + "::" + pass;
  if (window.crypto && crypto.subtle && window.isSecureContext) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return "s256:" + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // opened from file:// where crypto.subtle is unavailable; a simple rolling hash
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < data.length; i++) { const c = data.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 31) ^ c; }
  return "djb2:" + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

/* ---------- account creation / sign-in ---------- */
async function createAccount(name, email, pass) {
  name = (name || "").trim();
  if (!name) throw new Error("Give yourself a name first.");
  if (accounts().some(a => a.name.toLowerCase() === name.toLowerCase()))
    throw new Error("There's already an account with that name on this device; sign in instead.");
  const list = accounts();
  const claimsLegacy = localStorage.getItem(FRESH_KEY) === "0" && !list.some(a => a.legacy);
  const acc = {
    id: uid(), name, email: (email || "").trim(),
    salt: Math.random().toString(36).slice(2, 12),
    created: Date.now(),
    legacy: claimsLegacy,
  };
  acc.pass = pass ? await hashPass(pass, acc.salt) : "";
  list.push(acc); saveAccounts(list);
  if (!claimsLegacy) seedNewAccountSpace(acc);
  localStorage.setItem(SESSION_KEY, acc.id);
  return acc;
}
async function signIn(accId, pass) {
  const acc = accounts().find(a => a.id === accId);
  if (!acc) throw new Error("That account doesn't exist on this device.");
  if (acc.pass) {
    const h = await hashPass(pass || "", acc.salt);
    if (h !== acc.pass) throw new Error("Wrong password for " + acc.name + ".");
  }
  localStorage.setItem(SESSION_KEY, acc.id);
  return acc;
}
function signInGuest() {
  localStorage.setItem(SESSION_KEY, "guest");
  if (!localStorage.getItem(storeKeyFor("guest", "codex.workspaces"))) seedNewAccountSpace(GUEST);
}
function signOut() { localStorage.removeItem(SESSION_KEY); location.reload(); }

function storeKeyFor(accountNs, base) { return accountNs ? base + "@" + accountNs : base; }

/* Pre-seed a brand-new account's workspace list: the shared canon workspace
   plus their OWN workspace, marked to receive the starter template on first
   open (the actual template content is copied in by ensureTemplate() below,
   once storage for that workspace is open). */
function seedNewAccountSpace(acc) {
  const wsId = "ws" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const list = [
    { id: "default", name: "World Without God", hasCanon: true, createdAt: Date.now() },
    { id: wsId, name: acc.name === "Guest" ? "Guest workspace" : acc.name + "'s workspace", hasCanon: false, template: true, createdAt: Date.now() },
  ];
  const n = acc.id === "guest" ? "guest" : acc.id;
  localStorage.setItem(storeKeyFor(n, "codex.workspaces"), JSON.stringify(list));
  localStorage.setItem(storeKeyFor(n, "codex.activeWorkspace"), wsId);
}

/* Copy the starter template's content into the active workspace, once.
   Called from app.js init after CodexStore has opened the right database.
   Marks the workspace seeded so edits are never overwritten afterwards. */
async function ensureTemplate() {
  if (!window.CodexWorkspaces || !window.CodexStore || !window.CODEX_TEMPLATE) return false;
  const ws = CodexWorkspaces.current();
  if (!ws || !ws.template || ws.seeded) return false;
  const tpl = window.CODEX_TEMPLATE;
  try {
    for (const store of Object.keys(tpl.stores || {})) {
      for (const obj of tpl.stores[store]) {
        if (obj && obj.id) await CodexStore.put(store, JSON.parse(JSON.stringify(obj)));
      }
    }
  } catch (e) { /* half-seeded is still usable; don't block the app */ }
  // mark seeded in this account's workspace list
  try {
    const key = storeKey("codex.workspaces");
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    const w = list.find(x => x.id === ws.id);
    if (w) { w.seeded = true; localStorage.setItem(key, JSON.stringify(list)); }
  } catch (e) {}
  return true;
}

/* ============================================================
   THE GATE; the front door you see before the app
   ============================================================ */
function gateHtml() {
  const accs = accounts();
  const accChips = accs.map(a => `
    <button class="gate-acc" data-acc="${a.id}">
      <span class="gate-avatar">${esc((a.name || "?")[0].toUpperCase())}</span>
      <span class="gate-acc-name">${esc(a.name)}</span>
      ${a.pass ? `<span class="gate-lock" title="Password protected">&#128274;</span>` : ""}
    </button>`).join("");
  return `
  <div class="gate-split">
    <div class="gate-promo">
      <div class="gate-brand">
        <svg viewBox="0 0 20 20" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 4.5C4 4 4.4 3.6 5 3.6h4V16H5c-.6 0-1 .4-1 1V4.5z"/><path d="M16 4.5C16 4 15.6 3.6 15 3.6h-4V16h4c.6 0 1 .4 1 1V4.5z"/></svg>
        <span>Beep Beep Organizer</span>
      </div>
      <h1>Every story you're building, in one calm place.</h1>
      <ul class="gate-points">
        <li><b>Write</b> in a full document editor with chapters, styles, and autosave</li>
        <li><b>Organize</b> your canon: characters, houses, maps, timelines, mood boards</li>
        <li><b>Read</b> your stories in a clean, bookish reader that remembers your place</li>
        <li><b>Ask</b> the built-in assistant anything about your own lore</li>
      </ul>
      <p class="gate-note">Your account and everything you write live <b>on this device</b>, in this browser. Use <b>Back up my work</b> anytime for a portable copy you can restore on another device.</p>
    </div>
    <div class="gate-card">
      <div class="gate-tabs">
        <button class="gate-tab ${accs.length ? "active" : ""}" data-tab="in" ${accs.length ? "" : "hidden"}>Sign in</button>
        <button class="gate-tab ${accs.length ? "" : "active"}" data-tab="up">Create account</button>
      </div>

      <div class="gate-pane" id="gatePaneIn" ${accs.length ? "" : "hidden"}>
        <p class="gate-sub">Welcome back. Pick your account:</p>
        <div class="gate-acc-list">${accChips || ""}</div>
        <div id="gatePassRow" hidden>
          <input type="password" id="gatePass" placeholder="Password" autocomplete="current-password">
          <button class="btn gate-go" id="gateSignIn">Sign in</button>
        </div>
        <div class="gate-err" id="gateErrIn"></div>
      </div>

      <div class="gate-pane" id="gatePaneUp" ${accs.length ? "hidden" : ""}>
        <p class="gate-sub">New here? Your account is created on this device; no email verification, no waiting.</p>
        <input id="gateName" placeholder="Your name (or pen name)" autocomplete="username" maxlength="40">
        <input id="gateEmail" placeholder="Email (optional)" autocomplete="email">
        <input type="password" id="gateNewPass" placeholder="Password (optional, protects this account on shared devices)" autocomplete="new-password">
        <button class="btn gate-go" id="gateCreate">Create my account</button>
        <div class="gate-err" id="gateErrUp"></div>
      </div>

      <button class="gate-guest" id="gateGuest">Just browsing? Continue as a guest &rarr;</button>
    </div>
  </div>`;
}

function showGate() {
  const app = document.getElementById("app");
  if (app) app.style.display = "none";
  let gate = document.getElementById("gate");
  if (!gate) {
    gate = document.createElement("div");
    gate.id = "gate";
    gate.className = "gate";
    document.body.appendChild(gate);
  }
  gate.innerHTML = gateHtml();

  const $ = (s) => gate.querySelector(s);
  const $$ = (s) => Array.from(gate.querySelectorAll(s));
  let pickedAcc = null;

  $$(".gate-tab").forEach(t => t.onclick = () => {
    $$(".gate-tab").forEach(x => x.classList.toggle("active", x === t));
    $("#gatePaneIn").hidden = t.dataset.tab !== "in";
    $("#gatePaneUp").hidden = t.dataset.tab !== "up";
  });

  $$(".gate-acc").forEach(b => b.onclick = async () => {
    pickedAcc = accounts().find(a => a.id === b.dataset.acc);
    $$(".gate-acc").forEach(x => x.classList.toggle("active", x === b));
    if (!pickedAcc) return;
    if (!pickedAcc.pass) {
      try { await signIn(pickedAcc.id, ""); location.reload(); }
      catch (e) { $("#gateErrIn").textContent = e.message; }
    } else {
      $("#gatePassRow").hidden = false;
      $("#gatePass").focus();
    }
  });
  const doSignIn = async () => {
    if (!pickedAcc) { $("#gateErrIn").textContent = "Pick your account above first."; return; }
    try { await signIn(pickedAcc.id, $("#gatePass").value); location.reload(); }
    catch (e) { $("#gateErrIn").textContent = e.message; }
  };
  if ($("#gateSignIn")) $("#gateSignIn").onclick = doSignIn;
  if ($("#gatePass")) $("#gatePass").onkeydown = e => { if (e.key === "Enter") doSignIn(); };

  const doCreate = async () => {
    try {
      await createAccount($("#gateName").value, $("#gateEmail").value, $("#gateNewPass").value);
      location.reload();
    } catch (e) { $("#gateErrUp").textContent = e.message; }
  };
  $("#gateCreate").onclick = doCreate;
  ["#gateName", "#gateEmail", "#gateNewPass"].forEach(sel => {
    const el = $(sel); if (el) el.onkeydown = e => { if (e.key === "Enter") doCreate(); };
  });
  $("#gateGuest").onclick = () => { signInGuest(); location.reload(); };
  const nameEl = $("#gateName"); if (nameEl && !$("#gatePaneUp").hidden) nameEl.focus();
}

/* ---------- topbar account chip (rendered by app.js calling mountChip) ---------- */
function mountChip() {
  const holder = document.getElementById("accountChip");
  if (!holder) return;
  const a = current();
  if (!a) return;
  holder.innerHTML = `
    <button class="acct-btn" id="acctBtn" title="Account">
      <span class="gate-avatar sm">${esc((a.name || "?")[0].toUpperCase())}</span>
      <span class="st-label">${esc(a.name)}</span>
    </button>
    <div class="acct-menu" id="acctMenu" hidden>
      <div class="acct-menu-head">Signed in as <b>${esc(a.name)}</b>${a.guest ? " (guest)" : ""}</div>
      <button class="acct-item" id="acctSwitch">Switch account</button>
      <button class="acct-item" id="acctOut">Sign out</button>
    </div>`;
  const btn = holder.querySelector("#acctBtn"), menu = holder.querySelector("#acctMenu");
  btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener("click", () => { menu.hidden = true; });
  holder.querySelector("#acctSwitch").onclick = signOut;
  holder.querySelector("#acctOut").onclick = signOut;
}

/* ---------- boot ---------- */
function boot() {
  if (!current()) showGate();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

window.CodexAccount = {
  current, accounts, ns, storeKey, dbName, signOut, ensureTemplate, mountChip,
  isSignedIn: () => !!current(),
};
})();
