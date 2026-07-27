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
      and tablename in ('profiles', 'workspaces', 'workspace_members', 'items', 'shares', 'comments',
                        'community_profiles', 'community_books', 'community_chapters', 'community_kudos',
                        'community_library', 'community_follows', 'community_comments',
                        'community_progress', 'community_posts')
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
-- The owner check must be direct, not only via membership: the
-- membership row is written by an AFTER INSERT trigger, and Postgres
-- checks the visibility of "insert ... returning" BEFORE that trigger's
-- work is visible. With membership alone, creating a workspace and
-- reading it back in one statement fails as a phantom RLS violation
-- ("new row violates row-level security policy"), which broke sync's
-- first step on every device.
drop policy if exists "read my workspaces" on public.workspaces;
create policy "read my workspaces" on public.workspaces
  for select using (owner = auth.uid() or public.is_member(id));

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
-- THE COMMUNITY ; the public side of the Space.
--
-- Everything above this line is private-by-default: your workspace,
-- readable only by you and whoever holds a link you made. The
-- community tables are the opposite on purpose; a book published
-- here is meant to be found, read, and responded to by strangers,
-- the way Wattpad and AO3 work.
--
-- The split matters. Publishing COPIES the published chapters of a
-- work into these tables; it never exposes the workspace itself.
-- Unpublishing deletes the copy. Your drafts stay physics-private.
--
-- Reads are public (anon may browse). Writes always belong to
-- somebody: books to their author, kudos/library/follows/comments
-- to the account that made them. The stat counters on books are
-- maintained by triggers running as the schema owner, so a client
-- cannot inflate its own numbers by writing to the book row.
-- ============================================================

-- ---------- public identity ----------
-- Publishing, commenting and posting all hang off a pen name, kept
-- apart from the private profile so joining the community is a
-- deliberate step and the name is chosen, not leaked.
create table if not exists public.community_profiles (
  id             uuid primary key references auth.users on delete cascade,
  name           text not null check (char_length(name) between 1 and 60),
  bio            text not null default '' check (char_length(bio) <= 600),
  avatar         jsonb not null default '{}'::jsonb,
  follower_count int  not null default 0,
  book_count     int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- books ----------
-- One row per published work. (owner, local_folder_id) ties it back
-- to the project it came from, so publishing again updates in place
-- instead of minting duplicates.
create table if not exists public.community_books (
  id              uuid primary key default gen_random_uuid(),
  owner           uuid not null references public.community_profiles on delete cascade,
  local_folder_id text not null,
  title           text not null check (char_length(title) between 1 and 200),
  blurb           text not null default '' check (char_length(blurb) <= 2000),
  cover           text,                       -- data URL, scaled client-side
  genre           text not null default '',
  tags            text[] not null default '{}',
  status          text not null default 'Ongoing',
  mature          boolean not null default false,
  language        text not null default 'English',
  word_count      int    not null default 0,
  chapter_count   int    not null default 0,
  reads           bigint not null default 0,
  kudos_count     int    not null default 0,
  library_count   int    not null default 0,
  comment_count   int    not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner, local_folder_id)
);
create index if not exists cbooks_updated_idx on public.community_books (updated_at desc);
create index if not exists cbooks_created_idx on public.community_books (created_at desc);
create index if not exists cbooks_kudos_idx   on public.community_books (kudos_count desc);
create index if not exists cbooks_reads_idx   on public.community_books (reads desc);
create index if not exists cbooks_genre_idx   on public.community_books (genre);
create index if not exists cbooks_tags_idx    on public.community_books using gin (tags);

-- ---------- chapters ----------
-- Content is plain text with newlines; the reader renders paragraphs.
-- local_id is the doc id in the author's workspace, for re-publish.
create table if not exists public.community_chapters (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.community_books on delete cascade,
  local_id   text not null,
  position   int  not null default 0,
  title      text not null default '',
  content    text not null default '',
  word_count int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, local_id)
);
create index if not exists cch_book_idx on public.community_chapters (book_id, position);

-- ---------- kudos ----------
-- One per reader per book, AO3-style. Guests may leave kudos through
-- an RPC below, deduplicated on a key their browser keeps.
create table if not exists public.community_kudos (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.community_books on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  guest_key  text,
  created_at timestamptz not null default now(),
  check (user_id is not null or guest_key is not null)
);
create unique index if not exists ckudos_user_idx  on public.community_kudos (book_id, user_id)  where user_id is not null;
create unique index if not exists ckudos_guest_idx on public.community_kudos (book_id, guest_key) where user_id is null;

-- ---------- library ----------
-- "Saved to read", Wattpad-style. chapters_seen remembers how many
-- chapters existed when you last looked, so the shelf can say
-- "2 new chapters" without another table.
create table if not exists public.community_library (
  user_id       uuid not null references auth.users on delete cascade,
  book_id       uuid not null references public.community_books on delete cascade,
  chapters_seen int  not null default 0,
  added_at      timestamptz not null default now(),
  primary key (user_id, book_id)
);
create index if not exists clib_book_idx on public.community_library (book_id);

-- ---------- follows ----------
create table if not exists public.community_follows (
  follower   uuid not null references auth.users on delete cascade,
  author     uuid not null references public.community_profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, author),
  check (follower <> author)
);
create index if not exists cfol_author_idx on public.community_follows (author);

-- ---------- comments ----------
-- On the book (chapter_id null) or on one chapter. One level of
-- replies via parent_id. Soft-deleted so a reply thread keeps its
-- shape when something above it goes.
create table if not exists public.community_comments (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.community_books on delete cascade,
  chapter_id uuid references public.community_chapters on delete cascade,
  parent_id  uuid references public.community_comments on delete cascade,
  author_id  uuid not null references public.community_profiles on delete cascade,
  body       text not null check (char_length(body) between 1 and 5000),
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ccom_book_idx    on public.community_comments (book_id, created_at desc);
create index if not exists ccom_chapter_idx on public.community_comments (chapter_id);

-- ---------- reading progress ----------
create table if not exists public.community_progress (
  user_id     uuid not null references auth.users on delete cascade,
  book_id     uuid not null references public.community_books on delete cascade,
  chapter_pos int  not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- ---------- rooms ----------
-- Shared threads: a room name, posts, one level of replies. The room
-- list itself lives in the app (a fixed set plus one per genre), so a
-- room with nobody in it costs nothing.
create table if not exists public.community_posts (
  id         uuid primary key default gen_random_uuid(),
  room       text not null check (char_length(room) between 1 and 40),
  author_id  uuid not null references public.community_profiles on delete cascade,
  parent_id  uuid references public.community_posts on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  deleted    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists cpost_room_idx on public.community_posts (room, created_at desc);

-- ---------- counters ----------
-- SECURITY DEFINER on purpose: the trigger fires as whoever caused it
-- (a reader leaving kudos), and that person has no right to update the
-- book row directly. The function runs as the schema owner instead.
--
-- Each swallows its own errors: when an account is deleted, cascades
-- tear down kudos and comments while their book is itself mid-deletion,
-- and a counter update against a half-gone row must not abort the
-- teardown. A skipped count during demolition costs nothing.
create or replace function public.community_book_counters()
returns trigger language plpgsql security definer set search_path = public
as $$
declare b uuid;
begin
  b := coalesce(new.book_id, old.book_id);
  update public.community_books set
    kudos_count   = (select count(*) from public.community_kudos   k where k.book_id = b),
    library_count = (select count(*) from public.community_library l where l.book_id = b),
    comment_count = (select count(*) from public.community_comments c where c.book_id = b and not c.deleted)
  where id = b;
  return coalesce(new, old);
exception when others then
  return coalesce(new, old);
end;
$$;

drop trigger if exists ckudos_counter on public.community_kudos;
create trigger ckudos_counter after insert or delete on public.community_kudos
  for each row execute function public.community_book_counters();
drop trigger if exists clib_counter on public.community_library;
create trigger clib_counter after insert or delete on public.community_library
  for each row execute function public.community_book_counters();
drop trigger if exists ccom_counter on public.community_comments;
create trigger ccom_counter after insert or update or delete on public.community_comments
  for each row execute function public.community_book_counters();

-- chapter changes roll up onto the book: size, count, and the
-- updated_at that "recently updated" sorts by
create or replace function public.community_chapter_rollup()
returns trigger language plpgsql security definer set search_path = public
as $$
declare b uuid;
begin
  b := coalesce(new.book_id, old.book_id);
  update public.community_books set
    chapter_count = (select count(*)                       from public.community_chapters c where c.book_id = b),
    word_count    = (select coalesce(sum(c.word_count), 0) from public.community_chapters c where c.book_id = b),
    updated_at    = now()
  where id = b;
  return coalesce(new, old);
exception when others then
  return coalesce(new, old);
end;
$$;

drop trigger if exists cch_rollup on public.community_chapters;
create trigger cch_rollup after insert or update or delete on public.community_chapters
  for each row execute function public.community_chapter_rollup();

create or replace function public.community_follow_counter()
returns trigger language plpgsql security definer set search_path = public
as $$
declare a uuid;
begin
  a := coalesce(new.author, old.author);
  update public.community_profiles set
    follower_count = (select count(*) from public.community_follows f where f.author = a)
  where id = a;
  return coalesce(new, old);
exception when others then
  return coalesce(new, old);
end;
$$;

drop trigger if exists cfol_counter on public.community_follows;
create trigger cfol_counter after insert or delete on public.community_follows
  for each row execute function public.community_follow_counter();

create or replace function public.community_bookcount()
returns trigger language plpgsql security definer set search_path = public
as $$
declare o uuid;
begin
  o := coalesce(new.owner, old.owner);
  update public.community_profiles set
    book_count = (select count(*) from public.community_books b where b.owner = o)
  where id = o;
  return coalesce(new, old);
exception when others then
  return coalesce(new, old);
end;
$$;

drop trigger if exists cbooks_count on public.community_books;
create trigger cbooks_count after insert or delete on public.community_books
  for each row execute function public.community_bookcount();

drop trigger if exists cprofiles_touch on public.community_profiles;
create trigger cprofiles_touch before update on public.community_profiles
  for each row execute function public.touch_updated_at();

-- ---------- anonymous participation ----------
-- Browsing needs no account. These two let a signed-out reader also
-- count a read and leave kudos, each through a narrow function
-- rather than table access.
create or replace function public.community_bump_reads(book uuid)
returns void language sql security definer set search_path = public
as $$
  update public.community_books set reads = reads + 1 where id = book;
$$;

create or replace function public.community_kudos_guest(book uuid, key text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if key is null or char_length(key) < 8 or char_length(key) > 80 then
    raise exception 'bad guest key';
  end if;
  insert into public.community_kudos (book_id, guest_key)
  values (book, key)
  on conflict (book_id, guest_key) where user_id is null do nothing;
  return found;
end;
$$;

grant execute on function public.community_bump_reads(uuid) to anon, authenticated;
grant execute on function public.community_kudos_guest(uuid, text) to anon, authenticated;

-- ---------- community access rules ----------
alter table public.community_profiles enable row level security;
alter table public.community_books    enable row level security;
alter table public.community_chapters enable row level security;
alter table public.community_kudos    enable row level security;
alter table public.community_library  enable row level security;
alter table public.community_follows  enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_progress enable row level security;
alter table public.community_posts    enable row level security;

-- profiles: anyone may look at an author; only you may be you
create policy "anyone reads community profiles" on public.community_profiles
  for select using (true);
create policy "create own community profile" on public.community_profiles
  for insert with check (id = auth.uid());
create policy "update own community profile" on public.community_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "delete own community profile" on public.community_profiles
  for delete using (id = auth.uid());

-- books and chapters: the whole point is that strangers can read them
create policy "anyone reads community books" on public.community_books
  for select using (true);
create policy "authors publish books" on public.community_books
  for insert with check (owner = auth.uid());
create policy "authors update own books" on public.community_books
  for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "authors unpublish own books" on public.community_books
  for delete using (owner = auth.uid());

create policy "anyone reads community chapters" on public.community_chapters
  for select using (true);
create policy "authors write own chapters" on public.community_chapters
  for all using (exists (select 1 from public.community_books b
                         where b.id = book_id and b.owner = auth.uid()))
  with check  (exists (select 1 from public.community_books b
                       where b.id = book_id and b.owner = auth.uid()));

-- kudos: visible to all (that is what a count is), given as yourself,
-- and takeable-back. Guest kudos arrive via the RPC above.
create policy "anyone reads kudos" on public.community_kudos
  for select using (true);
create policy "signed-in kudos" on public.community_kudos
  for insert with check (user_id = auth.uid());
create policy "remove own kudos" on public.community_kudos
  for delete using (user_id = auth.uid());

-- your library and your reading position are nobody's business;
-- the aggregate library_count on the book is all the world sees
create policy "own library" on public.community_library
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own progress" on public.community_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- follows are public, as on every platform like this
create policy "anyone reads follows" on public.community_follows
  for select using (true);
create policy "follow as yourself" on public.community_follows
  for insert with check (follower = auth.uid());
create policy "unfollow as yourself" on public.community_follows
  for delete using (follower = auth.uid());

-- comments: public to read, signed as yourself. The book's author may
-- also moderate; soft-delete or remove anything on their own book.
create policy "anyone reads community comments" on public.community_comments
  for select using (true);
create policy "comment as yourself" on public.community_comments
  for insert with check (author_id = auth.uid());
create policy "edit own or moderate" on public.community_comments
  for update using (author_id = auth.uid()
    or exists (select 1 from public.community_books b where b.id = book_id and b.owner = auth.uid()));
create policy "remove own or moderate" on public.community_comments
  for delete using (author_id = auth.uid()
    or exists (select 1 from public.community_books b where b.id = book_id and b.owner = auth.uid()));

-- rooms: public to read, post as yourself, tidy up after yourself
create policy "anyone reads posts" on public.community_posts
  for select using (true);
create policy "post as yourself" on public.community_posts
  for insert with check (author_id = auth.uid());
create policy "edit own posts" on public.community_posts
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "remove own posts" on public.community_posts
  for delete using (author_id = auth.uid());

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
