# Setting up the backend

Beep Beep Organizer works entirely offline. This directory is what you need
**only** if you want accounts, syncing across devices, workspace sharing, and
reader comments.

The site stays on GitHub Pages. There is no server to run — the browser talks
to Supabase directly.

---

## What you do

**1. Create the project** — about ten minutes, most of it waiting.

1. Go to [supabase.com](https://supabase.com) and sign up.
2. **New project**. Pick the region closest to you. Set a database password
   and save it somewhere you'll find it again.
3. Wait about two minutes while it provisions.

**2. Create the tables**

1. Open **SQL Editor → New query**.
2. Paste the whole of [`schema.sql`](./schema.sql) and press **Run**.
3. It should finish with "Success. No rows returned". The file is safe to run
   again later if the schema changes.

**3. Create the image bucket**

1. **Storage → New bucket**, name it exactly `plates`, leave it **private**.
2. Go back to the SQL editor and run `schema.sql` once more — the storage
   policies at the bottom need the bucket to exist before they'll apply.

**4. Turn on email sign-in**

**Authentication → Providers → Email** is on by default. Under
**Authentication → Sign In / Providers**, decide about **Confirm email**:

- **Off** — people can sign in straight away. Simpler; fine while it's just you.
- **On** — Supabase's built-in mail is rate-limited to a handful of messages an
  hour, so if you ever invite more than a couple of people you'll want to plug
  in your own SMTP under **Project Settings → Authentication → SMTP**.

**5. Copy the two values**

**Project Settings → API**, copy:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long string starting `eyJ...`

Send me both, and I'll wire them in.

---

## About that anon key

It goes in the site's JavaScript, where anyone can read it. That's what it's
designed for. It grants no access on its own — every table denies everything
by default, and the policies in `schema.sql` are what decide who sees what.

The key to **never** put in the site is the **service_role** key, also on that
API page. It bypasses every policy. Keep it out of the repo entirely.

---

## What the schema does

| Table | What it holds |
|---|---|
| `profiles` | One row per account: display name and your avatar. Created automatically on sign-up. |
| `workspaces` | A project. Each keeps its own entries, documents and canvases, exactly as it does locally. |
| `workspace_members` | Who can see a workspace, as `owner`, `editor` or `reader`. |
| `items` | Every record the app stores — one row each, tagged with which store it came from. |
| `shares` | A link that lets someone read without an account. Revocable. |
| `comments` | What readers send back. |

**Why one `items` table** rather than seventeen: the app already stores
everything through a single local interface keyed by store name, so mirroring
that shape keeps the sync layer small and means there is one set of access
rules to get right instead of seventeen chances to get one wrong.

**Deletes are soft.** A device that has been offline needs to hear that
something was deleted, and it means a mistaken delete is recoverable.

**Timestamps are set by the database**, not the browser, so two devices with
slightly different clocks can't disagree about which edit came last.

---

## Costs, and the one real annoyance

The free tier gives you 500MB of database, 1GB of file storage and 50,000
monthly active users — far more than this needs.

**Free projects pause after 7 days with no activity.** You wake them from the
dashboard and it takes about a minute. If you go a fortnight without opening
the app, that's a minute of friction every time you come back. The Pro plan is
$25/month and doesn't pause. Start free; upgrade only if the pausing gets
irritating.

---

## What changes about privacy

Right now your writing physically cannot leave your browser. Once this is
connected, it lives on Supabase's servers instead — still private to you, but
that's now a matter of access rules rather than physics.

The app will say so plainly once syncing is on, and the Help screen copy gets
rewritten to match. Signing in stays optional: without credentials, or without
signing in, the app carries on exactly as it does today.
