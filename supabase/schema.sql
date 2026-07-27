-- ============================================================
-- Beep Beep Organizer; database schema
--
-- Paste this whole file into your Supabase project:
--   SQL Editor  ->  New query  ->  paste  ->  Run
--
-- It is safe to run more than once; everything is guarded with
-- "if not exists" or dropped-and-recreated.
--
-- The design mirrors the app's local storage: the browser keeps
-- IndexedDB as its working copy and every record is one row in
-- "items", keyed by which store it came from. That keeps the sync
-- layer small and means there is exactly one set of access rules to
-- get right instead of seventeen.
-- ============================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";

-- ============================================================
-- RESET; drop every existing policy on this app's tables, whatever
-- it is called, plus the helper functions. Several generations of
-- this schema have run against real projects, and a leftover policy
-- from an older version (under a name this file doesn't know) can
-- silently veto writes even after the current rules are applied.
-- Everything dropped here is recreated below, so this is always safe.
-- ============================================================
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'workspaces', 'workspace_members', 'items', 'shares', 'comments')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
exception when others then
  raise notice 'policy reset skipped a step (%)', sqlerrm;
end $$;

do $$
begin
  execute 'drop function if exists public.is_member(uuid) cascade';
  execute 'drop function if exists public.can_write(uuid) cascade';
  execute 'drop function if exists public.is_owner(uuid) cascade';
  execute 'drop function if exists public.handle_new_user() cascade';
  execute 'drop function if exists public.add_owner_as_member() cascade';
  execute 'drop function if exists public.touch_updated_at() cascade';
  execute 'drop function if exists public.read_shared(text) cascade';
  execute 'drop function if exists public.comment_via_share(text, text, text, text) cascade';
exception when others then
  raise notice 'function reset skipped a step (%)', sqlerrm;
end $$;

-- ============================================================
-- PROFILES ; one row per account, created automatically on sign-up
-- ============================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar       jsonb   default '{}'::jsonb,   -- the parametric portrait
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- new sign-ups get a profile without the client having to ask
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Creating a trigger on auth.users needs ownership of that table, which
-- some Supabase projects do not grant the SQL editor. When it is refused
-- the error must NOT abort this file (everything below still needs to
-- run), so it is guarded: refused means skipped with a notice, and the
-- backfill at the end of this file covers profile creation instead.
do $$ begin
  execute 'drop trigger if exists on_auth_user_created on auth.users';
  execute 'create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user()';
exception when others then
  raise notice 'skipped the auth.users trigger (%); profiles are backfilled at the end of this file instead', sqlerrm;
end $$;

-- ============================================================
-- WORKSPACES ; a project. Each has its own entries, documents,
-- canvases and so on, exactly as it does locally today.
-- ============================================================
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users on delete cascade,
  name       text not null,
  has_canon  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspaces_owner_idx on public.workspaces (owner);

-- ============================================================
-- MEMBERSHIP ; who can see a workspace, and what they may do
--   owner   : everything, including deleting the workspace
--   editor  : read and write its contents
--   reader  : read only; this is what a shared link grants
-- ============================================================
do $$ begin
  create type public.member_role as enum ('owner', 'editor', 'reader');
exception when duplicate_object then null;
end $$;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  role         public.member_role not null default 'reader',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists members_user_idx on public.workspace_members (user_id);

-- the owner is always a member, so one rule covers every read
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.add_owner_as_member();

-- ============================================================
-- ITEMS ; every record the app stores, one row each.
--
-- "store" is the local store name ('docs', 'notes', 'canvases',
-- 'timeline', ...) and "data" is the record itself. "local_id" is
-- the id the browser already uses, so a record keeps its identity
-- across devices.
--
-- Deletes are soft: syncing clients need to hear about a deletion,
-- and it means a mistaken delete on one device is recoverable.
-- ============================================================
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  store        text not null,
  local_id     text not null,
  data         jsonb not null default '{}'::jsonb,
  deleted      boolean not null default false,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users on delete set null,
  unique (workspace_id, store, local_id)
);
-- the sync query is "everything in this workspace changed since X"
create index if not exists items_sync_idx on public.items (workspace_id, updated_at desc);
create index if not exists items_store_idx on public.items (workspace_id, store);

-- stamp updated_at server-side so clocks on two devices cannot disagree
create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

drop trigger if exists workspaces_touch on public.workspaces;
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.touch_updated_at();

-- ============================================================
-- SHARES ; a link that grants read access without an account,
-- so you can send a book to a reader who will never sign up.
-- ============================================================
create table if not exists public.shares (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  token        text not null unique default encode(gen_random_bytes(16), 'hex'),
  label        text,
  scope        text not null default 'workspace',  -- 'workspace' or a doc's local_id
  can_comment  boolean not null default true,
  revoked      boolean not null default false,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists shares_ws_idx on public.shares (workspace_id);

-- ============================================================
-- COMMENTS ; what a reader sends back. Readers may be signed in
-- or anonymous through a share link, so author_id can be null and
-- author_name carries whatever they typed.
-- ============================================================
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  target       text not null,               -- the local_id of the entry or document
  body         text not null,
  author_id    uuid references auth.users on delete set null,
  author_name  text,
  share_id     uuid references public.shares on delete set null,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists comments_ws_idx on public.comments (workspace_id, created_at desc);

-- ============================================================
-- ACCESS RULES
--
-- Every table is deny-by-default; the policies below are the only
-- way in. The membership check lives in a SECURITY DEFINER function
-- on purpose: a policy on workspace_members that queries
-- workspace_members sends Postgres into infinite recursion, and this
-- is the standard way around it.
-- ============================================================
create or replace function public.is_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_write(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_owner(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner = auth.uid()
  );
$$;

alter table public.profiles          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.items             enable row level security;
alter table public.shares            enable row level security;
alter table public.comments          enable row level security;

-- ---------- profiles ----------
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

-- you can see the name of anyone you share a workspace with, so
-- membership lists and comment authors are not a wall of user ids
drop policy if exists "read collaborator profiles" on public.profiles;
create policy "read collaborator profiles" on public.profiles
  for select using (exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  ));

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- if the auth.users trigger could not be installed, the app itself may
-- create the signed-in user's profile row
drop policy if exists "create own profile" on public.profiles;
create policy "create own profile" on public.profiles
  for insert with check (id = auth.uid());

-- ---------- workspaces ----------
drop policy if exists "read my workspaces" on public.workspaces;
create policy "read my workspaces" on public.workspaces
  for select using (public.is_member(id));

drop policy if exists "create workspaces" on public.workspaces;
create policy "create workspaces" on public.workspaces
  for insert with check (owner = auth.uid());

drop policy if exists "owner updates workspace" on public.workspaces;
create policy "owner updates workspace" on public.workspaces
  for update using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "owner deletes workspace" on public.workspaces;
create policy "owner deletes workspace" on public.workspaces
  for delete using (owner = auth.uid());

-- ---------- membership ----------
drop policy if exists "read membership" on public.workspace_members;
create policy "read membership" on public.workspace_members
  for select using (public.is_member(workspace_id));

drop policy if exists "owner adds members" on public.workspace_members;
create policy "owner adds members" on public.workspace_members
  for insert with check (public.is_owner(workspace_id));

drop policy if exists "owner changes members" on public.workspace_members;
create policy "owner changes members" on public.workspace_members
  for update using (public.is_owner(workspace_id));

-- an owner can remove anyone; anyone else can remove only themselves
drop policy if exists "remove members" on public.workspace_members;
create policy "remove members" on public.workspace_members
  for delete using (public.is_owner(workspace_id) or user_id = auth.uid());

-- ---------- items ----------
drop policy if exists "read workspace items" on public.items;
create policy "read workspace items" on public.items
  for select using (public.is_member(workspace_id));

drop policy if exists "write workspace items" on public.items;
create policy "write workspace items" on public.items
  for insert with check (public.can_write(workspace_id));

drop policy if exists "update workspace items" on public.items;
create policy "update workspace items" on public.items
  for update using (public.can_write(workspace_id)) with check (public.can_write(workspace_id));

-- hard deletes are not used by the app, but an owner may prune
drop policy if exists "owner prunes items" on public.items;
create policy "owner prunes items" on public.items
  for delete using (public.is_owner(workspace_id));

-- ---------- shares ----------
drop policy if exists "read shares" on public.shares;
create policy "read shares" on public.shares
  for select using (public.is_member(workspace_id));

drop policy if exists "owner manages shares" on public.shares;
create policy "owner manages shares" on public.shares
  for all using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));

-- ---------- comments ----------
drop policy if exists "members read comments" on public.comments;
create policy "members read comments" on public.comments
  for select using (public.is_member(workspace_id));

drop policy if exists "members write comments" on public.comments;
create policy "members write comments" on public.comments
  for insert with check (public.is_member(workspace_id) and author_id = auth.uid());

drop policy if exists "authors edit own comments" on public.comments;
create policy "authors edit own comments" on public.comments
  for update using (author_id = auth.uid() or public.can_write(workspace_id));

drop policy if exists "remove comments" on public.comments;
create policy "remove comments" on public.comments
  for delete using (author_id = auth.uid() or public.is_owner(workspace_id));

-- ============================================================
-- READING BY SHARE LINK
--
-- Anonymous readers are not members, so the policies above shut them
-- out by design. They come in through these functions instead, which
-- take a token and hand back only what that token covers. Doing it
-- this way means a link can be revoked in one place and cannot be
-- widened by guessing at table names.
-- ============================================================
create or replace function public.read_shared(share_token text)
returns table (store text, local_id text, data jsonb)
language sql stable security definer set search_path = public
as $$
  select i.store, i.local_id, i.data
  from public.shares s
  join public.items i on i.workspace_id = s.workspace_id
  where s.token = share_token
    and s.revoked = false
    and i.deleted = false
    and (s.scope = 'workspace' or i.local_id = s.scope);
$$;

create or replace function public.comment_via_share(share_token text, target_id text, name text, body text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare s record; new_id uuid;
begin
  select * into s from public.shares where token = share_token and revoked = false and can_comment = true;
  if not found then
    raise exception 'that link does not accept comments';
  end if;
  if length(coalesce(body, '')) < 1 or length(body) > 4000 then
    raise exception 'comment must be between 1 and 4000 characters';
  end if;
  insert into public.comments (workspace_id, target, body, author_name, share_id)
  values (s.workspace_id, target_id, body, nullif(left(coalesce(name, ''), 60), ''), s.id)
  returning id into new_id;
  return new_id;
end;
$$;

-- anonymous visitors may call exactly these two functions and nothing else
grant execute on function public.read_shared(text) to anon, authenticated;
grant execute on function public.comment_via_share(text, text, text, text) to anon, authenticated;

-- ============================================================
-- STORAGE ; images and maps live in a bucket, not in the database.
-- Base64 image data inside jsonb would eat the 500MB row storage
-- quota very quickly; a bucket is the right home for it.
--
-- Create the bucket in the dashboard (Storage -> New bucket ->
-- name it "plates", keep it private), then run the policies below.
-- ============================================================
-- Policies on storage.objects also need ownership rights that some
-- projects withhold from the SQL editor. Guarded for the same reason as
-- the auth trigger above: a refusal must not abort the backfill below.
-- If these are skipped, add the same four rules from the dashboard
-- under Storage > Policies whenever you start using the plates bucket.
do $$ begin
  execute 'drop policy if exists "members read plates" on storage.objects';
  execute $pol$create policy "members read plates" on storage.objects
    for select using (
      bucket_id = 'plates'
      and public.is_member(((storage.foldername(name))[1])::uuid)
    )$pol$;
  execute 'drop policy if exists "members write plates" on storage.objects';
  execute $pol$create policy "members write plates" on storage.objects
    for insert with check (
      bucket_id = 'plates'
      and public.can_write(((storage.foldername(name))[1])::uuid)
    )$pol$;
  execute 'drop policy if exists "members replace plates" on storage.objects';
  execute $pol$create policy "members replace plates" on storage.objects
    for update using (
      bucket_id = 'plates'
      and public.can_write(((storage.foldername(name))[1])::uuid)
    )$pol$;
  execute 'drop policy if exists "members delete plates" on storage.objects';
  execute $pol$create policy "members delete plates" on storage.objects
    for delete using (
      bucket_id = 'plates'
      and public.can_write(((storage.foldername(name))[1])::uuid)
    )$pol$;
exception when others then
  raise notice 'skipped storage.objects policies (%); add them under Storage > Policies when needed', sqlerrm;
end $$;

-- ============================================================
-- BACKFILL; safe to run any number of times.
-- Repairs rows created by earlier versions of this schema:
-- every existing user gets a profile row, and every workspace
-- owner becomes a member of their own workspace (without this,
-- writes to workspaces made before the membership trigger
-- existed fail row-level security with "can't write").
-- ============================================================
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.owner, 'owner'
from public.workspaces w
on conflict do nothing;

-- Optional tidy-up: earlier broken syncs could leave duplicate EMPTY
-- workspace rows behind. Uncomment to remove workspaces that have no
-- items and are older than an hour:
-- delete from public.workspaces w
--   where w.created_at < now() - interval '1 hour'
--     and not exists (select 1 from public.items i where i.workspace_id = w.id);
