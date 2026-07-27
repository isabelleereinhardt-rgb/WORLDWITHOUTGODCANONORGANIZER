/* ============================================================
   Cloud sync configuration (Supabase).
   These two values are PUBLIC by design; the anon key can only do
   what Row Level Security allows, which is "each signed-in user
   touches their own rows and nothing else". The secret key
   (service_role) must never appear here or anywhere in the site.

   To turn cloud sync off entirely, set window.CODEX_CLOUD = null.
   ============================================================ */
window.CODEX_CLOUD = {
  url: "https://drqqopgmmuoilghtjdvg.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRycXFvcGdtbXVvaWxnaHRqZHZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTg4NjUsImV4cCI6MjEwMDY3NDg2NX0.gPYSAr4OtJCfCR1aVmtZcodaIqrRelId0FP44B9Gzwk",
};
