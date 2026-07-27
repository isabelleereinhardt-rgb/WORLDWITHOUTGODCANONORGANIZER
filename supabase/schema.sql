-- ============================================================
-- Beep Beep Organizer; cloud sync schema for Supabase
--
-- HOW TO RUN THIS (one time, takes a minute):
--   1. Open your Supabase project dashboard
--   2. Left sidebar: SQL Editor
--   3. Paste this whole file into the editor
--   4. Click "Run"
-- That's it. The site's cloud sync starts working immediately.
--
-- RECOMMENDED SETTINGS (optional but nicer):
--   Authentication > Sign In / Providers > Email > turn OFF
--   "Confirm email" so new users can start instantly without a
--   confirmation email. If you keep it on, also set
--   Authentication > URL Configuration > Site URL to your live
--   site so the confirmation link lands somewhere sensible.
-- ============================================================

-- Everything a user writes, one row per object:
-- (workspace, store, id) -> jsonb payload, last-write-wins by "updated".
create table if not exists public.user_data (
  user_id      uuid    not null references auth.users (id) on delete cascade default auth.uid(),
  workspace_id text    not null,
  store        text    not null,
  id           text    not null,
  data         jsonb,
  updated      bigint  not null default 0,
  deleted      boolean not null default false,
  primary key (user_id, workspace_id, store, id)
);

-- Per-user app state that lives outside the object stores:
-- the workspace list and interface settings.
create table if not exists public.user_meta (
  user_id    uuid   primary key references auth.users (id) on delete cascade default auth.uid(),
  workspaces jsonb,
  settings   jsonb,
  updated    bigint not null default 0
);

-- Row Level Security: every user can only ever see and touch their own rows.
alter table public.user_data enable row level security;
alter table public.user_meta enable row level security;

drop policy if exists "own data" on public.user_data;
create policy "own data" on public.user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own meta" on public.user_meta;
create policy "own meta" on public.user_meta
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Fast incremental pulls ("everything of mine changed since X").
create index if not exists user_data_user_updated
  on public.user_data (user_id, updated);
