/* ============================================================
   Beep Beep Organizer; cloud accounts & cross-device sync
   (Supabase; configured in data/cloud-config.js)

   Design: local-first. IndexedDB stays the source the app reads
   and writes, so everything keeps working instantly and offline.
   This module mirrors those writes up to Supabase and pulls other
   devices' changes down, last-write-wins by each object's
   "updated" timestamp.

   - Auth: Supabase email + password (GoTrue REST). The session
     (access + refresh token) is kept in localStorage; account.js
     reads it to decide who is signed in and which storage
     namespace to use.
   - Push: store.js calls CodexCloud.track() on every put/delete.
     Dirty markers (tiny, no data) persist in localStorage so
     offline edits sync later. A flush reads the real objects back
     out of IndexedDB and upserts them in batches.
   - Pull: incremental, "everything of mine with updated > since",
     applied straight into the right workspace databases.
   - The workspace list + settings sync through a single
     user_meta row, compared by JSON against the last synced copy.
   ============================================================ */
(function () {
"use strict";
const CFG = window.CODEX_CLOUD || null;
const SESSION_KEY = "codex.cloudSession";

/* ---------- session ---------- */
function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
}
function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}
function nsOf(s) { return s ? "sb" + (s.user.id || "").replace(/-/g, "") : null; }
function myNs() { return nsOf(session()); }
function nsKey(base) { const n = myNs(); return n ? base + "@" + n : base; }
function isActive() {
  // sync only runs when the signed-in identity IS the cloud account
  return !!(CFG && session() && window.CodexAccount && CodexAccount.ns() === myNs());
}

/* ---------- status (for the chip + Settings) ---------- */
let status = { state: CFG ? "idle" : "off", detail: "" };
const statusListeners = [];
function setStatus(state, detail) {
  status = { state, detail: detail || "" };
  statusListeners.forEach(fn => { try { fn(status); } catch (e) {} });
}
function onStatus(fn) { statusListeners.push(fn); fn(status); }

/* ---------- HTTP ---------- */
function authHeaders(token) {
  return { apikey: CFG.anonKey, authorization: "Bearer " + (token || CFG.anonKey), "content-type": "application/json" };
}
async function ensureToken() {
  const s = session();
  if (!s) throw new Error("Not signed in to a cloud account.");
  if (Date.now() < (s.expires_at || 0) - 120000) return s.access_token;
  // refresh
  const res = await fetch(CFG.url + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    saveSession(null);
    throw new Error("Your cloud session expired; sign in again.");
  }
  adoptSession(j);
  return j.access_token;
}
function adoptSession(j) {
  const user = j.user || {};
  saveSession({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    user: { id: user.id, email: user.email },
    name: (user.user_metadata && user.user_metadata.name) || (user.email || "").split("@")[0],
  });
}
/* A request came back 401 even though the token hadn't expired (revoked,
   or adopted from an email link edge case): mark it stale so the next
   ensureToken() call refreshes it instead of reusing it. */
function markTokenStale() {
  const s = session();
  if (s) { s.expires_at = 0; saveSession(s); }
}

function friendlyAuthError(j, fallback) {
  const raw = (j && (j.error_description || j.msg || j.message || j.error)) || fallback || "Something went wrong.";
  if (/invalid login credentials/i.test(raw)) return "Wrong email or password.";
  if (/email address .* is invalid|email_address_invalid/i.test(raw)) return "That email address doesn't look right; double-check it.";
  if (/email not confirmed/i.test(raw)) return "This email hasn't been confirmed yet; check your inbox for the confirmation link, then sign in.";
  if (/already registered|already been registered/i.test(raw)) return "There's already an account with that email; sign in instead.";
  if (/at least 6|password/i.test(raw) && /short|length|weak/i.test(raw)) return "Password needs to be at least 6 characters.";
  if (/rate limit/i.test(raw)) return "Too many attempts; wait a minute and try again.";
  return raw;
}

/* ---------- auth API (used by the gate) ---------- */
async function signUp(name, email, pass) {
  if (!CFG) throw new Error("Cloud sync isn't configured.");
  if (!email || !/@/.test(email)) throw new Error("A real email address is needed for a cloud account.");
  if (!pass || pass.length < 6) throw new Error("Pick a password of at least 6 characters.");
  const res = await fetch(CFG.url + "/auth/v1/signup", {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ email, password: pass, data: { name: (name || "").trim() || email.split("@")[0] } }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyAuthError(j, "Could not create the account."));
  if (j.access_token) { adoptSession(j); return { ok: true }; }
  // email confirmation is on: no session until they click the link
  return { needsConfirm: true };
}
async function signIn(email, pass) {
  if (!CFG) throw new Error("Cloud sync isn't configured.");
  const res = await fetch(CFG.url + "/auth/v1/token?grant_type=password", {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ email, password: pass }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(friendlyAuthError(j, "Could not sign in."));
  adoptSession(j);
  return { ok: true };
}
function signOutLocal() { saveSession(null); }

/* ---------- dirty tracking ---------- */
let applying = false; // (pull uses raw IDB writes, but keep the guard for safety)
function dirtyList() {
  try { return JSON.parse(localStorage.getItem(nsKey("codex.cloud.dirty")) || "[]"); } catch (e) { return []; }
}
function saveDirty(list) { localStorage.setItem(nsKey("codex.cloud.dirty"), JSON.stringify(list)); }
function track(store, id, del) {
  if (!isActive() || applying || !id) return;
  const ws = window.CodexStore ? CodexStore.currentWorkspace() : "default";
  const list = dirtyList().filter(d => !(d.ws === ws && d.store === store && d.id === id));
  list.push({ ws, store, id, del: !!del, t: Date.now() });
  saveDirty(list);
  scheduleFlush();
}

/* ---------- raw IndexedDB access for ANY workspace ---------- */
async function withWsDB(wsId, fn) {
  const db = await CodexStore.openWorkspaceDB(wsId);
  if (!db) throw new Error("Could not open local storage for workspace " + wsId);
  try { return await fn(db); }
  finally { try { db.close(); } catch (e) {} }
}
function idb(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
function rawGet(db, store, id) { return idb(db.transaction(store, "readonly").objectStore(store).get(id)); }
function rawPut(db, store, obj) { return idb(db.transaction(store, "readwrite").objectStore(store).put(obj)); }
function rawDel(db, store, id) { return idb(db.transaction(store, "readwrite").objectStore(store).delete(id)); }

/* ---------- push ---------- */
let flushTimer = null, cycleTimer = null, busy = false;
function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(() => flush().catch(() => {}), 2500); }

async function flush() {
  if (!isActive() || busy) return;
  const list = dirtyList();
  const metaDue = metaChanged();
  if (!list.length && !metaDue) return;
  busy = true;
  setStatus("syncing", "Saving to your account…");
  try {
    const token = await ensureToken();
    const uid = session().user.id;

    // read the real objects, grouped by workspace
    const byWs = {};
    list.forEach(d => (byWs[d.ws] = byWs[d.ws] || []).push(d));
    const rows = [];
    for (const ws of Object.keys(byWs)) {
      await withWsDB(ws, async (db) => {
        for (const d of byWs[ws]) {
          if (d.del) {
            rows.push({ user_id: uid, workspace_id: ws, store: d.store, id: d.id, data: null, updated: d.t, deleted: true, _k: key(d) });
          } else {
            const obj = await rawGet(db, d.store, d.id).catch(() => null);
            if (obj) rows.push({ user_id: uid, workspace_id: ws, store: d.store, id: d.id, data: obj, updated: obj.updated || d.t, deleted: false, _k: key(d) });
            else rows.push({ user_id: uid, workspace_id: ws, store: d.store, id: d.id, data: null, updated: d.t, deleted: true, _k: key(d) });
          }
        }
      });
    }

    // upsert in batches, bounded by count and rough byte size
    const flushedKeys = new Set();
    let batch = [], bytes = 0;
    const send = async () => {
      if (!batch.length) return;
      const body = JSON.stringify(batch.map(r => { const { _k, ...row } = r; return row; }));
      const res = await fetch(CFG.url + "/rest/v1/user_data?on_conflict=user_id,workspace_id,store,id", {
        method: "POST",
        headers: Object.assign(authHeaders(token), { prefer: "resolution=merge-duplicates,return=minimal" }),
        body,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j.code === "PGRST205" || j.code === "42P01") { setStatus("setup", "The cloud database isn't set up yet."); throw new Error("setup"); }
        if (res.status === 401) { markTokenStale(); throw new Error("Refreshing your session; syncing again shortly."); }
        throw new Error(j.message || ("Sync failed (HTTP " + res.status + ")"));
      }
      batch.forEach(r => flushedKeys.add(r._k));
      batch = []; bytes = 0;
    };
    for (const r of rows) {
      const size = JSON.stringify(r.data || "").length;
      if (batch.length >= 20 || (bytes + size) > 3000000) await send();
      batch.push(r); bytes += size;
    }
    await send();

    // drop exactly what we flushed; anything dirtied meanwhile stays queued
    saveDirty(dirtyList().filter(d => !flushedKeys.has(key(d))));

    if (metaDue) await pushMeta(token, uid);
    localStorage.setItem(nsKey("codex.cloud.lastSync"), String(Date.now()));
    setStatus("synced", "");
  } catch (e) {
    if (String(e.message) !== "setup") setStatus(navigator.onLine === false ? "offline" : "error", e.message || "Sync failed.");
  } finally {
    busy = false;
  }
}
function key(d) { return d.ws + "|" + d.store + "|" + d.id; }

/* ---------- user_meta (workspace list + settings) ---------- */
function currentMetaJson() {
  const ws = localStorage.getItem(CodexAccount.storeKey("codex.workspaces")) || "null";
  const st = localStorage.getItem(CodexAccount.storeKey("codex.settings")) || "null";
  return JSON.stringify({ workspaces: JSON.parse(ws), settings: JSON.parse(st) });
}
function metaChanged() {
  if (!isActive()) return false;
  try { return currentMetaJson() !== (localStorage.getItem(nsKey("codex.cloud.metacache")) || ""); }
  catch (e) { return false; }
}
async function pushMeta(token, uid) {
  const metaJson = currentMetaJson();
  const meta = JSON.parse(metaJson);
  const res = await fetch(CFG.url + "/rest/v1/user_meta?on_conflict=user_id", {
    method: "POST",
    headers: Object.assign(authHeaders(token), { prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ user_id: uid, workspaces: meta.workspaces, settings: meta.settings, updated: Date.now() }]),
  });
  if (res.ok) localStorage.setItem(nsKey("codex.cloud.metacache"), metaJson);
}
async function pullMeta(token) {
  const res = await fetch(CFG.url + "/rest/v1/user_meta?select=workspaces,settings,updated", { headers: authHeaders(token) });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return rows && rows[0] ? rows[0] : null;
}
function applyMeta(row) {
  if (!row) return false;
  const metaJson = JSON.stringify({ workspaces: row.workspaces, settings: row.settings });
  if (metaJson === (localStorage.getItem(nsKey("codex.cloud.metacache")) || "")) return false;
  if (row.workspaces) localStorage.setItem(CodexAccount.storeKey("codex.workspaces"), JSON.stringify(row.workspaces));
  if (row.settings) localStorage.setItem(CodexAccount.storeKey("codex.settings"), JSON.stringify(row.settings));
  localStorage.setItem(nsKey("codex.cloud.metacache"), metaJson);
  return true;
}

/* ---------- pull ---------- */
async function pull(full) {
  if (!isActive() || busy) return;
  busy = true;
  try {
    const token = await ensureToken();
    let since = full ? 0 : Number(localStorage.getItem(nsKey("codex.cloud.since")) || 0);
    let touchedActive = false;
    const activeWs = CodexStore.currentWorkspace();
    while (true) {
      const res = await fetch(CFG.url + "/rest/v1/user_data?select=workspace_id,store,id,data,updated,deleted" +
        "&updated=gt." + since + "&order=updated.asc&limit=500", { headers: authHeaders(token) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j.code === "PGRST205" || j.code === "42P01") { setStatus("setup", "The cloud database isn't set up yet."); return; }
        if (res.status === 401) { markTokenStale(); throw new Error("Refreshing your session; syncing again shortly."); }
        throw new Error(j.message || ("Pull failed (HTTP " + res.status + ")"));
      }
      const rows = await res.json();
      if (!rows.length) break;
      const byWs = {};
      rows.forEach(r => (byWs[r.workspace_id] = byWs[r.workspace_id] || []).push(r));
      for (const ws of Object.keys(byWs)) {
        await withWsDB(ws, async (db) => {
          for (const r of byWs[ws]) {
            const local = await rawGet(db, r.store, r.id).catch(() => null);
            const localUpdated = (local && local.updated) || 0;
            if (r.deleted) {
              if (local && localUpdated <= r.updated) { await rawDel(db, r.store, r.id); if (ws === activeWs) touchedActive = true; }
            } else if (r.data && r.updated > localUpdated) {
              await rawPut(db, r.store, r.data);
              if (ws === activeWs) touchedActive = true;
            }
          }
        });
      }
      since = rows[rows.length - 1].updated;
      localStorage.setItem(nsKey("codex.cloud.since"), String(since));
      if (rows.length < 500) break;
    }
    const meta = await pullMeta(token);
    if (meta && applyMeta(meta)) touchedActive = true;
    localStorage.setItem(nsKey("codex.cloud.lastSync"), String(Date.now()));
    setStatus("synced", "");
    if (touchedActive && window.Codex && Codex.reloadWorkspace) { await Codex.reloadWorkspace(); window.CodexWorkspaces && CodexWorkspaces.updateBrandLabel(); }
  } catch (e) {
    setStatus(navigator.onLine === false ? "offline" : "error", e.message || "Sync failed.");
  } finally {
    busy = false;
  }
}

/* ---------- first open on a device: bring the account down ---------- */
function needsBootstrap() {
  return !!(CFG && session() && !localStorage.getItem(CodexAccount.storeKey("codex.workspaces")));
}
async function bootstrapIfNeeded() {
  if (!needsBootstrap()) return;
  setStatus("syncing", "Fetching your account…");
  const s = session();
  try {
    const token = await ensureToken();
    const meta = await pullMeta(token);
    if (meta && meta.workspaces && meta.workspaces.length) {
      applyMeta(meta);
      const list = meta.workspaces;
      const active = list.find(w => w.template) || list[0];
      localStorage.setItem(CodexAccount.storeKey("codex.activeWorkspace"), active.id);
      await pull(true);
      return;
    }
  } catch (e) { /* fall through to a fresh local seed; sync catches up later */ }
  // brand-new cloud account (or the database isn't set up / offline):
  // start from the template locally, exactly like a new device account
  CodexAccount.seedSpaceFor(myNs(), s.name || "My");
}

/* ---------- lifecycle ---------- */
function start() {
  if (!CFG || !isActive()) { if (!CFG) setStatus("off", ""); return; }
  setStatus("syncing", "");
  pull(false).then(() => flush()).catch(() => {});
  clearInterval(cycleTimer);
  cycleTimer = setInterval(() => { flush().then(() => pull(false)).catch(() => {}); }, 45000);
  window.addEventListener("online", () => { flush().then(() => pull(false)).catch(() => {}); });
}
async function syncNow() { await flush(); await pull(false); }

window.CodexCloud = {
  enabled: !!CFG,
  session, myNs, signUp, signIn, signOutLocal,
  track, start, syncNow, bootstrapIfNeeded, needsBootstrap,
  onStatus, get status() { return status; },
  lastSync: () => Number(localStorage.getItem(nsKey("codex.cloud.lastSync")) || 0),
  pending: () => dirtyList().length,
};
})();
