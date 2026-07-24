/* ============================================================
   Beep Beep Organizer — storage layer (IndexedDB)
   Documents, slide decks, canvases (mood boards), folders,
   imported notes, and media all live here. IndexedDB has far
   more room than localStorage, so images actually persist now.
   Falls back to localStorage if IndexedDB is unavailable.

   Multi-workspace: each workspace gets its own IndexedDB database
   (codex-db--default for the original World Without God workspace,
   codex-db--<id> for every workspace after that), so switching
   workspaces fully isolates docs/notes/canvases/etc — nothing
   bleeds between projects. Call CodexStore.switchWorkspace(id)
   before touching data for a workspace other than the current one.

   API is promise-based:  await CodexStore.all("docs") etc.
   ============================================================ */
(function () {
"use strict";

const STORES = ["docs", "decks", "canvases", "folders", "notes", "meta",
  "tasks", "hidden", "cats", "sheets", "mindmaps", "flashcards", "feed", "timeline", "excludedNames"];
const DB_VER = 3;
let db = null;
let usingFallback = false;
let currentWorkspace = "default";

function dbNameFor(workspaceId) { return workspaceId === "default" ? "codex-db" : "codex-db--" + workspaceId; }

/* ---------- open ---------- */
function openDB(name) {
  return new Promise((resolve) => {
    if (!("indexedDB" in window)) { usingFallback = true; return resolve(null); }
    let req;
    try { req = indexedDB.open(name, DB_VER); }
    catch (e) { usingFallback = true; return resolve(null); }
    req.onupgradeneeded = () => {
      const d = req.result;
      STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: "id" }); });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { usingFallback = true; resolve(null); };
    req.onblocked = () => { usingFallback = true; resolve(null); };
  });
}

/* ---------- localStorage fallback (namespaced per workspace too) ---------- */
const LS = {
  key(s) { return "codex.store." + currentWorkspace + "." + s; },
  all(s) { try { return JSON.parse(localStorage.getItem(this.key(s)) || "[]"); } catch (e) { return []; } },
  saveAll(s, arr) { try { localStorage.setItem(this.key(s), JSON.stringify(arr)); return true; } catch (e) { return false; } },
  put(s, obj) { const a = this.all(s); const i = a.findIndex(x => x.id === obj.id); if (i >= 0) a[i] = obj; else a.unshift(obj); return this.saveAll(s, a); },
  del(s, id) { return this.saveAll(s, this.all(s).filter(x => x.id !== id)); },
  get(s, id) { return this.all(s).find(x => x.id === id) || null; },
};

/* ---------- core ops ---------- */
function tx(store, mode) { return db.transaction(store, mode).objectStore(store); }
function wrap(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

const Store = {
  ready: null,
  usingFallback: () => usingFallback,
  currentWorkspace: () => currentWorkspace,

  async all(store) {
    if (usingFallback || !db) return LS.all(store);
    try {
      const r = await wrap(tx(store, "readonly").getAll());
      return r || [];
    } catch (e) { return LS.all(store); }
  },
  async get(store, id) {
    if (usingFallback || !db) return LS.get(store, id);
    try { return (await wrap(tx(store, "readonly").get(id))) || null; }
    catch (e) { return LS.get(store, id); }
  },
  async put(store, obj) {
    obj.updated = Date.now();
    if (!obj.created) obj.created = obj.updated;
    if (usingFallback || !db) return LS.put(store, obj);
    try { await wrap(tx(store, "readwrite").put(obj)); return true; }
    catch (e) { return LS.put(store, obj); }
  },
  async del(store, id) {
    if (usingFallback || !db) return LS.del(store, id);
    try { await wrap(tx(store, "readwrite").delete(id)); return true; }
    catch (e) { return LS.del(store, id); }
  },

  /* export EVERYTHING in the *current* workspace as a plain object for backup */
  async exportAll() {
    const out = { _codex: true, v: 1, workspace: currentWorkspace, exported: new Date().toISOString(), stores: {} };
    for (const s of STORES) out.stores[s] = await this.all(s);
    return out;
  },
  async importAll(data) {
    if (!data || !data.stores) throw new Error("Not a valid backup file");
    for (const s of STORES) {
      const arr = data.stores[s] || [];
      for (const obj of arr) { if (obj && obj.id) await this.put(s, obj); }
    }
    return true;
  },

  /* switch every subsequent read/write to a different workspace's isolated
     database. Safe to call repeatedly (re-opens are cheap). */
  async switchWorkspace(workspaceId) {
    if (db) { try { db.close(); } catch (e) {} db = null; }
    usingFallback = false;
    currentWorkspace = workspaceId || "default";
    this.ready = (async () => {
      db = await openDB(dbNameFor(currentWorkspace));
      await migrateLegacy();
    })();
    await this.ready;
    return true;
  },

  /* permanently remove a workspace's entire database (used when deleting a workspace) */
  deleteWorkspaceDB(workspaceId) {
    return new Promise((resolve) => {
      if (!("indexedDB" in window)) return resolve(false);
      const name = dbNameFor(workspaceId);
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    });
  },
};

/* ---------- one-time migration from the old localStorage format (default workspace only) ---------- */
async function migrateLegacy() {
  if (currentWorkspace !== "default") return;
  try {
    const done = await Store.get("meta", "legacy-migrated");
    if (done) return;
    const legacyDocs = JSON.parse(localStorage.getItem("codex.docs") || "[]");
    const legacyDecks = JSON.parse(localStorage.getItem("codex.decks") || "[]");
    for (const d of legacyDocs) { if (d && d.id) await Store.put("docs", d); }
    for (const d of legacyDecks) { if (d && d.id) await Store.put("decks", d); }
    await Store.put("meta", { id: "legacy-migrated", at: Date.now() });
  } catch (e) { /* non-fatal */ }
}

Store.ready = (async () => {
  db = await openDB(dbNameFor(currentWorkspace));
  await migrateLegacy();
})();

/* ============================================================
   Image helper — downscale + compress before storing so a
   mood board full of pictures still fits and loads fast.
   Returns a data URL (persisted safely in IndexedDB).
   ============================================================ */
function fileToScaledDataURL(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Not an image"));
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bad image"));
      img.onload = () => {
        let { width: w, height: h } = img;
        if (Math.max(w, h) > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale); h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        // keep PNG for transparency, otherwise JPEG for size
        const isPng = /png/i.test(file.type);
        try { resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", quality)); }
        catch (e) { resolve(reader.result); } // tainted? fall back to original
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

window.CodexStore = Store;
window.CodexImg = { fileToScaledDataURL };
})();
