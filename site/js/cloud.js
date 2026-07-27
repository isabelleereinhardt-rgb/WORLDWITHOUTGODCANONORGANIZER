/* ============================================================
   CLOUD — accounts, syncing, sharing

   Local-first by design. IndexedDB stays the working copy; nothing
   waits on the network, and the app behaves exactly as it always has
   when signed out, offline, or with no credentials configured.

   Sync is a two-way delta. Every local write records itself in the
   store's outbox; a sync sends those up, then pulls anything the
   server has seen change since our last pull. Where the same record
   moved on both sides, the later edit wins and the loser is reported
   rather than silently dropped.

   Timestamps for ordering come from the server, never the browser,
   so two devices with drifting clocks cannot disagree.
   ============================================================ */
(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const S = () => window.CodexStore;

const CFG = window.CODEX_CLOUD || {};
const CONFIGURED = !!(CFG.url && CFG.key);

let sb = null;                 // the supabase client, made on first use
let session = null;            // the signed-in session, or null
let syncing = false;
let lastError = "";
const listeners = [];

function emit() { listeners.forEach(fn => { try { fn(state()); } catch (e) {} }); }
function state() {
  return {
    configured: CONFIGURED,
    signedIn: !!session,
    email: session && session.user ? session.user.email : "",
    userId: session && session.user ? session.user.id : "",
    syncing, lastError,
    lastSync: +(localStorage.getItem(lastSyncKey()) || 0),
    pending: CONFIGURED && S() ? S().outbox().length : 0,
  };
}

function client() {
  if (!CONFIGURED) return null;
  if (sb) return sb;
  if (!window.supabase || !window.supabase.createClient) return null;
  sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "codex.auth" },
  });
  return sb;
}

/* ---------- per-workspace bookkeeping ---------- */
const wsId = () => (S() ? S().currentWorkspace() : "default");
const lastSyncKey = () => "codex.sync.at." + wsId();
const remoteIdKey = () => "codex.sync.ws." + wsId();
const remoteId = () => localStorage.getItem(remoteIdKey()) || "";
const setRemoteId = id => localStorage.setItem(remoteIdKey(), id);

/* ============================================================
   AUTH
   ============================================================ */
/* Whatever the network or Postgres says, the person reading it wants
   to know what to do next. */
function friendly(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/schema cache|does not exist|PGRST205/i.test(m)) return "the database tables haven't been created yet — run supabase/schema.sql";
  if (/Failed to fetch|NetworkError|ERR_/i.test(m)) return "couldn't reach the server — check your connection";
  if (/Invalid login credentials/i.test(m)) return "that email and password don't match an account";
  if (/Email not confirmed/i.test(m)) return "check your email for the confirmation link first";
  if (/already registered|already been registered/i.test(m)) return "there's already an account with that email — try signing in";
  if (/Password should be/i.test(m)) return "that password is too short";
  if (/rate limit|too many/i.test(m)) return "too many attempts just now — wait a minute and try again";
  if (/JWT|expired/i.test(m)) return "your session expired — sign in again";
  if (/row-level security|permission denied/i.test(m)) return "this account can't write to that workspace";
  return m;
}
const fail = e => { const err = new Error(friendly(e)); err.raw = e; return err; };
async function restore() {
  const c = client();
  if (!c) return;
  try {
    const { data } = await c.auth.getSession();
    session = data.session || null;
    c.auth.onAuthStateChange((_e, s) => { session = s; emit(); });
    emit();
    if (session) syncNow({ quiet: true });
  } catch (e) { lastError = e.message || String(e); emit(); }
}

async function signUp(email, password, displayName) {
  const c = client();
  if (!c) throw new Error("Cloud isn't configured");
  let data, error;
  try {
    ({ data, error } = await c.auth.signUp({
      email, password, options: { data: { display_name: displayName || "" } },
    }));
  } catch (e) { throw fail(e); }
  if (error) throw fail(error);
  // With email confirmation on, Supabase returns a user but no session
  // until the link is clicked. Say so rather than looking broken.
  if (!data.session) return { needsConfirmation: true };
  session = data.session;
  emit();
  return { needsConfirmation: false };
}

async function signIn(email, password) {
  const c = client();
  if (!c) throw new Error("Cloud isn't configured");
  let data, error;
  try { ({ data, error } = await c.auth.signInWithPassword({ email, password })); }
  catch (e) { throw fail(e); }
  if (error) throw fail(error);
  session = data.session;
  emit();
  await syncNow({});
  return true;
}

async function signOut() {
  const c = client();
  if (c) await c.auth.signOut();
  session = null;
  emit();
}

async function resetPassword(email) {
  const c = client();
  if (!c) throw new Error("Cloud isn't configured");
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.href });
  if (error) throw fail(error);
  return true;
}

/* ============================================================
   SYNC
   ============================================================ */

/* The remote row for this local workspace, made on first sync. */
async function ensureWorkspace() {
  const c = client();
  const existing = remoteId();
  if (existing) {
    const { data } = await c.from("workspaces").select("id").eq("id", existing).maybeSingle();
    if (data) return existing;
    // it was deleted, or belongs to another account — start a fresh one
    localStorage.removeItem(remoteIdKey());
    localStorage.removeItem(lastSyncKey());
  }
  const name = (window.CodexWorkspaces && CodexWorkspaces.current() && CodexWorkspaces.current().name) || "My workspace";
  const hasCanon = !window.CodexWorkspaces || CodexWorkspaces.activeHasCanon();
  const { data, error } = await c.from("workspaces")
    .insert({ owner: session.user.id, name, has_canon: hasCanon })
    .select("id").single();
  if (error) throw error;
  setRemoteId(data.id);
  return data.id;
}

/* Push: send everything the outbox is holding, in batches. */
async function push(ws) {
  const c = client();
  const box = S().outbox();
  if (!box.length) return { sent: 0 };
  const rows = [];
  const keys = [];
  for (const item of box) {
    keys.push(S().outboxKeyFor(item.store, item.id));
    if (item.deleted) {
      rows.push({ workspace_id: ws, store: item.store, local_id: String(item.id),
        data: {}, deleted: true, updated_by: session.user.id });
    } else {
      const rec = await S().get(item.store, item.id);
      if (!rec) continue;   // written then removed before we got here
      rows.push({ workspace_id: ws, store: item.store, local_id: String(item.id),
        data: rec, deleted: false, updated_by: session.user.id });
    }
  }
  if (!rows.length) { S().clearOutbox(keys); return { sent: 0 }; }

  // Batched, because a single request carrying every image in the
  // workspace is the one that times out.
  const SIZE = 40;
  for (let i = 0; i < rows.length; i += SIZE) {
    const { error } = await c.from("items")
      .upsert(rows.slice(i, i + SIZE), { onConflict: "workspace_id,store,local_id" });
    if (error) throw error;
  }
  S().clearOutbox(keys);
  return { sent: rows.length };
}

/* Pull: anything the server has seen change since we last looked. */
async function pull(ws) {
  const c = client();
  const since = new Date(+(localStorage.getItem(lastSyncKey()) || 0)).toISOString();
  const conflicts = [];
  let applied = 0, newest = 0;
  const PAGE = 300;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.from("items")
      .select("store,local_id,data,deleted,updated_at")
      .eq("workspace_id", ws)
      .gt("updated_at", since)
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || !data.length) break;

    for (const row of data) {
      const stamp = Date.parse(row.updated_at);
      if (stamp > newest) newest = stamp;
      const mine = await S().get(row.store, row.local_id);
      // A record we have also edited since the last sync is a genuine
      // clash. The newer edit wins; the older one is named, not binned.
      const pendingHere = S().outbox().some(o => o.store === row.store && String(o.id) === String(row.local_id));
      if (pendingHere && mine && (mine.updated || 0) > stamp) {
        conflicts.push({ store: row.store, id: row.local_id, title: mine.title || row.local_id, kept: "yours" });
        continue;
      }
      if (pendingHere && mine) conflicts.push({ store: row.store, id: row.local_id, title: mine.title || row.local_id, kept: "theirs" });
      if (row.deleted) await S().delQuiet(row.store, row.local_id);
      else await S().putQuiet(row.store, row.data);
      applied++;
    }
    if (data.length < PAGE) break;
  }
  if (newest) localStorage.setItem(lastSyncKey(), String(newest));
  return { applied, conflicts };
}

async function syncNow(opts) {
  opts = opts || {};
  if (!CONFIGURED || !session || syncing) return null;
  const c = client();
  if (!c) return null;
  syncing = true; lastError = ""; emit();
  try {
    const ws = await ensureWorkspace();
    const up = await push(ws);
    const down = await pull(ws);
    // anything that arrived needs to reach the screen
    if (down.applied) {
      if (window.Codex && Codex.reloadWorkspace) await Codex.reloadWorkspace();
    }
    if (!opts.quiet) {
      const bits = [];
      if (up.sent) bits.push(`${up.sent} sent`);
      if (down.applied) bits.push(`${down.applied} received`);
      window.toast && toast(bits.length ? "Synced · " + bits.join(", ") : "Already up to date");
    }
    if (down.conflicts.length && window.toast) {
      const c0 = down.conflicts[0];
      toast(`${down.conflicts.length} item${down.conflicts.length === 1 ? "" : "s"} changed in both places — kept the newer edit of “${c0.title}”`);
    }
    localStorage.setItem(lastSyncKey() + ".ok", String(Date.now()));
    return { up, down };
  } catch (e) {
    lastError = friendly(e);
    if (!opts.quiet && window.toast) toast("Sync failed · " + lastError);
    return null;
  } finally { syncing = false; emit(); }
}

/* Send everything currently in this workspace up for the first time —
   used once, when an account adopts the work already in this browser. */
async function uploadEverything() {
  if (!session) throw new Error("Sign in first");
  const n = await S().markAllDirty();
  const res = await syncNow({ quiet: true });
  if (res) window.toast && toast(`Uploaded ${n} record${n === 1 ? "" : "s"} to your account`);
  return res;
}

/* periodic and opportunistic syncing, gentle enough to ignore */
let timer = null;
function startAuto() {
  clearInterval(timer);
  timer = setInterval(() => { if (session && navigator.onLine) syncNow({ quiet: true }); }, 90 * 1000);
  window.addEventListener("online", () => session && syncNow({ quiet: true }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && session) syncNow({ quiet: true });
  });
}

window.CodexCloud = {
  configured: () => CONFIGURED,
  state, onChange: fn => listeners.push(fn),
  signUp, signIn, signOut, resetPassword,
  sync: syncNow, uploadEverything,
  client,
};

if (CONFIGURED) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { restore(); startAuto(); });
  else { restore(); startAuto(); }
}
})();
