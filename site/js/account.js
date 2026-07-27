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
const GUEST = { id: "guest", name: "Guest", guest: true };

/* ---------- cloud session (Supabase; see cloud.js) ----------
   Read directly from localStorage so identity and namespacing work
   at parse time, before cloud.js has loaded. A signed-in cloud
   account takes precedence over any device-only session. */
/* The Supabase client (cloud.js) persists its session in localStorage
   under "codex.auth". Read it directly so identity and namespacing are
   known at parse time, before the client library has even loaded. */
const CLOUD_SESSION_KEY = "codex.auth";
function cloudSession() {
  if (!window.CODEX_CLOUD || !(window.CODEX_CLOUD.url && (window.CODEX_CLOUD.key || window.CODEX_CLOUD.anonKey))) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY) || "null");
    const s = raw && raw.currentSession ? raw.currentSession : raw;   // both storage shapes
    if (!s || !s.user || !s.user.id) return null;
    return {
      user: { id: s.user.id, email: s.user.email },
      name: (s.user.user_metadata && (s.user.user_metadata.display_name || s.user.user_metadata.name)) || (s.user.email || "").split("@")[0],
    };
  } catch (e) { return null; }
}
function cloudNsOf(cs) { return "sb" + ((cs.user && cs.user.id) || "").replace(/-/g, ""); }

/* ---------- arriving from a Supabase email link ----------
   Confirmation (and recovery / magic-link) emails redirect back with the
   session tokens in the URL fragment. Catch them here, BEFORE anything
   else reads storage, and adopt them as the cloud session: clicking the
   email lands the user on the site already signed in. The user id and
   email live inside the token itself, so no network round-trip is needed. */
let arrivingFromEmail = false;
(function captureAuthRedirect() {
  if (!window.CODEX_CLOUD) return;
  const h = location.hash || "";
  if (!/access_token=|error_description=/.test(h)) return;
  const p = new URLSearchParams(h.replace(/^#\/?/, ""));
  const errDesc = p.get("error_description");
  if (errDesc && !p.get("access_token")) {
    // e.g. an expired confirmation link; surface it on the gate
    try { sessionStorage.setItem("codex.gateNotice", errDesc.replace(/\+/g, " ")); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search + "#/");
    return;
  }
  // tokens present: the Supabase client parses and stores them once it
  // loads; hold a small cover instead of the gate, then reload signed in
  arrivingFromEmail = true;
})();
function holdForEmailSignIn() {
  const app = document.getElementById("app");
  if (app) app.style.display = "none";
  const cover = document.createElement("div");
  cover.id = "gate";
  cover.className = "gate";
  cover.innerHTML = `<div class="gate-split" style="grid-template-columns:1fr;text-align:center">
    <div class="gate-promo"><div class="gate-brand" style="justify-content:center">Beep Beep Organizer</div>
    <h1>Signing you in&hellip;</h1><p class="gate-note" style="max-width:none">One moment; confirming your email.</p></div></div>`;
  document.body.appendChild(cover);
  let waited = 0;
  const iv = setInterval(() => {
    waited += 300;
    if (cloudSession()) {
      clearInterval(iv);
      localStorage.removeItem(SESSION_KEY);
      localStorage.setItem("codex.hasSignedInBefore", "1");
      history.replaceState(null, "", location.pathname + location.search + "#/");
      location.reload();
    } else if (waited > 8000) {
      clearInterval(iv);
      try { sessionStorage.setItem("codex.gateNotice", "That link couldn't be used; sign in with your email and password instead"); } catch (e) {}
      history.replaceState(null, "", location.pathname + location.search + "#/");
      location.reload();
    }
  }, 300);
}

function current() {
  const cs = cloudSession();
  if (cs) return { id: "cloud", name: cs.name || (cs.user.email || "").split("@")[0], email: cs.user.email, cloud: true };
  return accounts().find(a => a.id === sessionId()) || (sessionId() === "guest" ? GUEST : null);
}

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
  const cs = cloudSession();
  if (cs) return cloudNsOf(cs);        // cloud account: namespace derived from its user id
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
  localStorage.removeItem(CLOUD_SESSION_KEY);   // a device-only account replaces any cloud session
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
  localStorage.removeItem(CLOUD_SESSION_KEY);   // a device-only sign-in replaces any cloud session
  localStorage.setItem(SESSION_KEY, acc.id);
  return acc;
}
function signInGuest() {
  localStorage.removeItem(CLOUD_SESSION_KEY);
  localStorage.setItem(SESSION_KEY, "guest");
  if (!localStorage.getItem(storeKeyFor("guest", "codex.workspaces"))) seedNewAccountSpace(GUEST);
}
function signOut() {
  localStorage.removeItem(SESSION_KEY);
  const finish = () => { localStorage.removeItem(CLOUD_SESSION_KEY); location.reload(); };
  if (cloudSession() && window.CodexCloud && CodexCloud.signOut) {
    Promise.resolve(CodexCloud.signOut()).then(finish, finish);
  } else finish();
}

function storeKeyFor(accountNs, base) { return accountNs ? base + "@" + accountNs : base; }

/* Pre-seed a brand-new account's workspace list: the shared canon workspace
   plus their OWN workspace, marked to receive the starter template on first
   open (the actual template content is copied in by ensureTemplate() below,
   once storage for that workspace is open). */
function seedSpaceFor(n, ownerName) {
  // new accounts start with exactly ONE workspace: their own, copied from the
  // starter template. (The World Without God canon workspace belongs to the
  // site owner's original account; it is not pre-added for everyone else.)
  const wsId = "ws" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const list = [
    { id: wsId, name: ownerName === "Guest" ? "Guest workspace" : ownerName + "'s workspace", hasCanon: false, template: true, createdAt: Date.now() },
  ];
  localStorage.setItem(storeKeyFor(n, "codex.workspaces"), JSON.stringify(list));
  localStorage.setItem(storeKeyFor(n, "codex.activeWorkspace"), wsId);
  // the Desk greets by this name; start it as the sign-up name (editable later)
  if (ownerName && ownerName !== "Guest" && !localStorage.getItem(storeKeyFor(n, "codex.settings"))) {
    localStorage.setItem(storeKeyFor(n, "codex.settings"), JSON.stringify({ writerName: ownerName }));
  }
}
function seedNewAccountSpace(acc) {
  seedSpaceFor(acc.id === "guest" ? "guest" : acc.id, acc.name || "My");
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
const cloudConfigured = () => !!(window.CODEX_CLOUD && window.CODEX_CLOUD.url && (window.CODEX_CLOUD.key || window.CODEX_CLOUD.anonKey));
function gateHtml() {
  const cloud = cloudConfigured();
  const accs = accounts();
  const accChips = accs.map(a => `
    <button class="gate-acc" data-acc="${a.id}">
      <span class="gate-avatar">${esc((a.name || "?")[0].toUpperCase())}</span>
      <span class="gate-acc-name">${esc(a.name)}</span>
      ${a.pass ? `<span class="gate-lock" title="Password protected">&#128274;</span>` : ""}
    </button>`).join("");
  const localAccBlock = accs.length ? `
    ${cloud ? `<div class="gate-divider"><span>Device-only accounts on this computer</span></div>` : ""}
    <div class="gate-acc-list">${accChips}</div>
    <div id="gatePassRow" hidden>
      <input type="password" id="gatePass" placeholder="Password" autocomplete="current-password">
      <button class="btn gate-go" id="gateSignIn">Sign in</button>
    </div>` : "";
  const note = cloud
    ? `One account, every device: sign in on a laptop, tablet, or phone and your workspaces and stories <b>sync to your account</b>. Everything also keeps a local copy, so the app works offline.`
    : `Your account and everything you write live <b>on this device</b>, in this browser. Use <b>Back up my work</b> anytime for a portable copy you can restore on another device.`;
  const paneIn = cloud ? `
      <div class="gate-pane" id="gatePaneIn" hidden>
        <p class="gate-sub">Welcome back.</p>
        <input id="gateCloudEmail" type="email" placeholder="Email" autocomplete="email">
        <input id="gateCloudPass" type="password" placeholder="Password" autocomplete="current-password">
        <button class="btn gate-go" id="gateCloudSignIn">Sign in</button>
        <button class="gate-guest" id="gateForgot" style="margin-top:8px">Forgot your password?</button>
        <div class="gate-err" id="gateErrIn"></div>
        ${localAccBlock}
      </div>` : `
      <div class="gate-pane" id="gatePaneIn" ${accs.length ? "" : "hidden"}>
        <p class="gate-sub">Welcome back. Pick your account:</p>
        ${localAccBlock}
        <div class="gate-err" id="gateErrIn"></div>
      </div>`;
  const paneUp = cloud ? `
      <div class="gate-pane" id="gatePaneUp" hidden>
        <p class="gate-sub">One account for every device; your stories sync to it automatically.</p>
        <input id="gateName" placeholder="Your name (or pen name)" autocomplete="username" maxlength="40">
        <input id="gateEmail" type="email" placeholder="Email" autocomplete="email">
        <input type="password" id="gateNewPass" placeholder="Password (at least 6 characters)" autocomplete="new-password">
        <button class="btn gate-go" id="gateCloudCreate">Create my account</button>
        <div class="gate-err" id="gateErrUp"></div>
        <button class="gate-guest" id="gateLocalToggle" style="margin-top:10px">Prefer an account that stays on this device only?</button>
        <div id="gateLocalForm" hidden>
          <input id="gateLocalName" placeholder="Your name (or pen name)" maxlength="40">
          <input type="password" id="gateLocalPass" placeholder="Password (optional)" autocomplete="new-password">
          <button class="btn gate-go" id="gateCreate">Create device-only account</button>
          <div class="gate-err" id="gateErrLocal"></div>
        </div>
      </div>` : `
      <div class="gate-pane" id="gatePaneUp" ${accs.length ? "hidden" : ""}>
        <p class="gate-sub">New here? Your account is created on this device; no email verification, no waiting.</p>
        <input id="gateName" placeholder="Your name (or pen name)" autocomplete="username" maxlength="40">
        <input id="gateEmail" placeholder="Email (optional)" autocomplete="email">
        <input type="password" id="gateNewPass" placeholder="Password (optional, protects this account on shared devices)" autocomplete="new-password">
        <button class="btn gate-go" id="gateCreate">Create my account</button>
        <div class="gate-err" id="gateErrUp"></div>
      </div>`;
  const showIn = cloud ? accs.length > 0 || localStorage.getItem("codex.hasSignedInBefore") === "1" : accs.length > 0;
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
        ${cloud ? `<li><b>Sync</b> across devices: your account travels with you</li>` : `<li><b>Ask</b> the built-in assistant anything about your own lore</li>`}
      </ul>
      <p class="gate-note">${note}</p>
    </div>
    <div class="gate-card">
      <div class="gate-tabs">
        <button class="gate-tab ${showIn ? "active" : ""}" data-tab="in">Sign in</button>
        <button class="gate-tab ${showIn ? "" : "active"}" data-tab="up">Create account</button>
      </div>
      ${paneIn}
      ${paneUp}
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

  let notice = "";
  try { notice = sessionStorage.getItem("codex.gateNotice") || ""; sessionStorage.removeItem("codex.gateNotice"); } catch (e) {}
  if (notice) {
    const card = gate.querySelector(".gate-card");
    if (card) card.insertAdjacentHTML("afterbegin",
      `<div class="gate-notice">${esc(notice)}. Sign in below, or create the account again to get a fresh link.</div>`);
  }

  const $ = (s) => gate.querySelector(s);
  const $$ = (s) => Array.from(gate.querySelectorAll(s));
  let pickedAcc = null;

  const showTab = (tab) => {
    $$(".gate-tab").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
    $("#gatePaneIn").hidden = tab !== "in";
    $("#gatePaneUp").hidden = tab !== "up";
  };
  $$(".gate-tab").forEach(t => t.onclick = () => showTab(t.dataset.tab));
  const initialTab = ($$(".gate-tab").find(t => t.classList.contains("active")) || {}).dataset;
  showTab(initialTab ? initialTab.tab : "up");

  /* ---------- cloud account handlers (only present in cloud mode) ---------- */
  const markSignedIn = () => { localStorage.setItem("codex.hasSignedInBefore", "1"); localStorage.removeItem(SESSION_KEY); location.reload(); };
  if ($("#gateCloudSignIn")) {
    const doCloudIn = async () => {
      const btn = $("#gateCloudSignIn");
      btn.disabled = true; $("#gateErrIn").textContent = "Signing in\u2026";
      try {
        await CodexCloud.signIn($("#gateCloudEmail").value.trim(), $("#gateCloudPass").value);
        markSignedIn();
      } catch (e) { $("#gateErrIn").textContent = e.message; btn.disabled = false; }
    };
    $("#gateCloudSignIn").onclick = doCloudIn;
    ["#gateCloudEmail", "#gateCloudPass"].forEach(sel => { $(sel).onkeydown = e => { if (e.key === "Enter") doCloudIn(); }; });
    if ($("#gateForgot")) $("#gateForgot").onclick = async () => {
      const email = ($("#gateCloudEmail").value || "").trim() || prompt("Your account's email address:") || "";
      if (!email.trim()) return;
      try { await CodexCloud.resetPassword(email.trim()); $("#gateErrIn").innerHTML = `<span class="gate-ok">Password reset email sent to ${esc(email.trim())}.</span>`; }
      catch (e) { $("#gateErrIn").textContent = e.message; }
    };
  }
  if ($("#gateCloudCreate")) {
    const doCloudUp = async () => {
      const btn = $("#gateCloudCreate");
      btn.disabled = true; $("#gateErrUp").textContent = "Creating your account\u2026";
      try {
        const r = await CodexCloud.signUp($("#gateEmail").value.trim(), $("#gateNewPass").value, $("#gateName").value.trim());
        if (r && r.needsConfirmation) {
          $("#gateErrUp").innerHTML = `<span class="gate-ok">Almost there: a confirmation link is on its way to your email. Click it and you'll land here signed in.</span>`;
          btn.disabled = false;
        } else markSignedIn();
      } catch (e) { $("#gateErrUp").textContent = e.message; btn.disabled = false; }
    };
    $("#gateCloudCreate").onclick = doCloudUp;
    ["#gateName", "#gateEmail", "#gateNewPass"].forEach(sel => { $(sel).onkeydown = e => { if (e.key === "Enter") doCloudUp(); }; });
  }
  if ($("#gateLocalToggle")) $("#gateLocalToggle").onclick = () => { $("#gateLocalForm").hidden = !$("#gateLocalForm").hidden; };
  if ($("#gateCreate") && $("#gateLocalForm")) {
    // device-only creation inside the cloud-mode form
    $("#gateCreate").onclick = async () => {
      try { await createAccount($("#gateLocalName").value, "", $("#gateLocalPass").value); location.reload(); }
      catch (e) { $("#gateErrLocal").textContent = e.message; }
    };
  }

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

  if (!cloudConfigured()) {
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
  }
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
      ${a.cloud ? `<span class="sync-dot" id="syncDot" title="Sync status"></span>` : ""}
    </button>
    <div class="acct-menu" id="acctMenu" hidden>
      <div class="acct-menu-head">Signed in as <b>${esc(a.name)}</b>${a.guest ? " (guest)" : ""}${a.cloud ? `<br><span class="faint">${esc(a.email || "")}</span><br><span class="faint" id="syncLabel"></span>` : ""}</div>
      ${a.cloud ? `<button class="acct-item" id="acctSyncNow">Sync now</button>` : ""}
      <button class="acct-item" id="acctSwitch">Switch account</button>
      <button class="acct-item" id="acctOut">Sign out</button>
    </div>`;
  const btn = holder.querySelector("#acctBtn"), menu = holder.querySelector("#acctMenu");
  btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener("click", () => { menu.hidden = true; });
  holder.querySelector("#acctSwitch").onclick = signOut;
  holder.querySelector("#acctOut").onclick = signOut;
  const syncBtn = holder.querySelector("#acctSyncNow");
  if (syncBtn) syncBtn.onclick = (e) => { e.stopPropagation(); window.CodexCloud && CodexCloud.syncNow(); };
  const syncBtn2 = holder.querySelector("#acctSyncNow");
  if (syncBtn2) syncBtn2.onclick = (e) => { e.stopPropagation(); window.CodexCloud && CodexCloud.sync && CodexCloud.sync({}); };
  if (a.cloud && window.CodexCloud && CodexCloud.state) {
    const apply = (st) => {
      const dot = holder.querySelector("#syncDot"), label = holder.querySelector("#syncLabel");
      const cls = st.syncing ? "syncing" : st.lastError ? "error" : st.signedIn ? "synced" : "offline";
      const text = st.syncing ? "Syncing\u2026"
        : st.lastError ? "Sync problem: " + st.lastError
        : st.signedIn ? "Synced to your account" + (st.pending ? " (" + st.pending + " waiting)" : "")
        : "Signed out";
      if (dot) { dot.className = "sync-dot sync-" + cls; dot.title = text; }
      if (label) label.textContent = text;
    };
    apply(CodexCloud.state());
    CodexCloud.onChange(apply);
  }
}

/* ---------- boot ---------- */
function boot() {
  if (arrivingFromEmail && !cloudSession()) { holdForEmailSignIn(); return; }
  if (!current()) showGate();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

/* One-time repair for accounts created before the template-only change:
   they were seeded with an extra World Without God workspace alongside
   their own. If that extra canon workspace holds nothing of theirs, it
   is quietly removed so they see just their own workspace. Anything
   with actual content in it is left alone (they can delete it by hand). */
async function cleanupExtraCanon() {
  const n = ns();
  if (!n || n === "gate") return;              // the owner's original account keeps the canon
  const flagKey = storeKey("codex.canonCleanupDone");
  if (localStorage.getItem(flagKey)) return;
  let list;
  try { list = JSON.parse(localStorage.getItem(storeKey("codex.workspaces")) || "null"); } catch (e) { return; }
  if (!list || list.length < 2) { localStorage.setItem(flagKey, "1"); return; }
  const canon = list.find(w => w.id === "default" && w.hasCanon);
  if (!canon) { localStorage.setItem(flagKey, "1"); return; }
  const empty = await new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(dbName("default")); } catch (e) { return resolve(true); }
    req.onerror = () => resolve(true);
    req.onsuccess = () => {
      const d = req.result;
      const skip = ["meta", "feed", "daylog", "revisions"];
      const names = Array.from(d.objectStoreNames).filter(s => !skip.includes(s));
      if (!names.length) { d.close(); return resolve(true); }
      let total = 0, done = 0;
      let tx;
      try { tx = d.transaction(names, "readonly"); } catch (e) { d.close(); return resolve(false); }
      names.forEach(s => {
        const c = tx.objectStore(s).count();
        const step = () => { if (++done === names.length) { try { d.close(); } catch (e) {} resolve(total === 0); } };
        c.onsuccess = () => { total += c.result; step(); };
        c.onerror = step;
      });
    };
  });
  if (empty) {
    const next = list.filter(w => w.id !== "default");
    localStorage.setItem(storeKey("codex.workspaces"), JSON.stringify(next));
    const activeKey = storeKey("codex.activeWorkspace");
    if ((localStorage.getItem(activeKey) || "default") === "default") localStorage.setItem(activeKey, next[0].id);
    try { indexedDB.deleteDatabase(dbName("default")); } catch (e) {}
  }
  localStorage.setItem(flagKey, "1");
}

async function ensureCloudSpace() {
  const cs = cloudSession();
  if (!cs) return;
  if (localStorage.getItem(storeKey("codex.workspaces"))) return;
  let adopted = 0;
  try {
    if (window.CodexCloud && CodexCloud.adoptRemoteWorkspaces) adopted = await CodexCloud.adoptRemoteWorkspaces();
  } catch (e) { /* offline or tables missing: fall through to the template */ }
  if (!adopted) seedSpaceFor(ns(), cs.name || "My");
}

window.CodexAccount = {
  current, accounts, ns, storeKey, dbName, signOut, ensureTemplate, ensureCloudSpace, cleanupExtraCanon, mountChip, seedSpaceFor,
  isSignedIn: () => !!current(),
};
})();
