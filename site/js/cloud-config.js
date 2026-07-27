/* ============================================================
   CLOUD CONFIGURATION

   These two values point the app at a Supabase project. Both are
   public by design: the key grants nothing on its own, because every
   table denies access by default and the rules in supabase/schema.sql
   decide who may read what.

   Never put the service_role (or sb_secret_) key here. That one
   bypasses every rule.

   Leave both blank to run the app entirely offline; no accounts, no
   syncing, nothing leaves the browser.
   ============================================================ */
window.CODEX_CLOUD = {
  url: "https://drqqopgmmuoilghtjdvg.supabase.co",
  key: "sb_publishable_0jsr082oOEKo7uIBaiukDQ_fxEIg5sU",
};
