# Beep Beep Organizer

A calm, searchable home for worldbuilding, writing, and canon; built first for
*World Without God*, but built to hold as many separate projects as you want.
It reads every document you've written, organizes it into collections,
cross-links every name so you can chase a subject wherever it appears, and gives
you a workspace to write new lore; with a built-in assistant that recognizes
your characters and places as you type.

Think **Notion + Google Docs + Obsidian**, built specifically for writers and
worldbuilders; but general enough to run more than one project at once.

### Workspaces

The app itself is just "Beep Beep Organizer"; **World Without God** is the name
of your *first* workspace, not the app. Click **Workspaces** in the top bar to
create more: each one is a fully separate project with its own documents, notes,
canvases, everything, stored in its own isolated database. Only the original
workspace ships with the pre-extracted World Without God canon; any workspace
you create after that starts blank. The assistant only ever looks at whichever
workspace is currently active.

### Live site

**https://isabelleereinhardt-rgb.github.io/WORLDWITHOUTGODCANONORGANIZER/**

> This link goes live once GitHub Pages is turned on (**Settings → Pages → Source
> → GitHub Actions**; see [How to open it](#how-to-open-it) below). Give the
> first deploy a minute or two after enabling it.

---

## What's inside

| Folder | What it holds |
|--------|---------------|
| `site/` | The web app (open `site/index.html`) |
| `site/data/db.js` | Your whole canon, extracted and indexed |
| `source/` | The original files from your Google Drive (PDFs + images), untouched |
| `tools/build_db.py` | Rebuilds the database when you add new source files |

Your **202 source files** are all preserved in `source/`, sorted into:
`core` (characters, houses, lore), `religion`, `maps`, `maps/solis`,
`maps/guide`, and `canon` (your continuity/audit docs).

---

## How to open it

**Easiest:** double-click `site/index.html`; it runs entirely in your browser,
no internet needed. (Images and original PDFs load from the `source/` folder next
to it, so keep the folders together.)

**As a website (recommended):** turn on GitHub Pages so you get a private URL you
can open from any device:

1. Push this branch (already done for you).
2. On GitHub go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. The included workflow (`.github/workflows/deploy-pages.yml`) publishes the site.
   Your URL will look like `https://<you>.github.io/<repo>/`.

---

## What it does

- **Search everything**; press `Ctrl / ⌘ + K` (or `Ctrl + F`) anywhere to search
  across every entry by title *and* full text.
- **Cross-references**; names in any entry are underlined links. Click one and
  you get a page gathering **every** passage across your canon that mentions it,
  plus a "Mentioned in" list at the bottom of each entry (backlinks, Obsidian-style).
- **Summaries above every result**; search or open a cross-reference and the top
  of the page gives you a *synthesized brief* of the topic; key sentences, facts,
  and related names pulled together from across your canon; **before** the list
  of individual results.
- **Collections, plus your own**; the sidebar groups everything into Characters,
  Noble Houses, Maps & Locations, Religion, Magic, Timeline, Culture, Books,
  Reference, Canon, and My Notes. Click the **+** next to "The Canon" to add your
  own sections; no code needed.
- **Batch select & delete, everywhere**; every collection has a **Select** button:
  check individual items, or **Select all** and unselect the ones you want to keep,
  then delete the rest in one go. Nothing is destroyed; deleted entries are hidden
  and can be restored anytime from **Settings → Deleted entries**.
  "My Notes" always stays in the sidebar, even at zero entries, with its own
  **New note** button.
- **Atlas & galleries**; all your maps, flags, and visual reference plates in
  clean image galleries (click to zoom).
- **Name Index**; an A–Z of every cross-linked name in the world.
- **Documents**; a Google-Docs-style editor: bold/italic/underline, **alignment,
  indent, and line spacing**, bullet & numbered lists, **tables**, links, images
  (saved properly via IndexedDB; they no longer vanish, and are resizable by
  dragging their corner), a live **word count**, a **writing timer**, **dictation**
  (speak your notes in), **read-aloud**, and an offline **grammar &amp; style check**
  (repeated words, common typos, unmatched punctuation, run-on sentences).
  Export to Word (.doc), Markdown, or PDF (print).
- **Slide Decks**; build simple presentations with **layout presets** (Title &
  Body, Title Only, Quote, Two Column), present fullscreen, export to PDF.
- **Canvases & Mood Boards**; freeform boards, Notion-style: pin images
  (resizable), a **drawing mode** (freehand sketch, downloadable as PNG), videos
  (YouTube / Vimeo / .mp4), links, and text notes, and drag them wherever you like.
  Images/links/videos/drawings can carry a **caption** describing what they are and
  how the assistant should use them. Any text you write on a canvas is picked up by
  search and the assistant, the same as a document.
- **Library & Stories** (Wattpad/AO3-style); gather documents into **stories**
  with ordered chapters, a **cover**, a blurb, **tags**, and a status
  (Draft / Ongoing / Completed). Every story opens in a clean, bookish **reader**
  with adjustable text size, reading themes (paper, sepia, dark, night), a
  progress bar, and it **remembers exactly where you left off**; "Continue
  reading" on the Home page and in the Library takes you straight back.
  **Publish as webpage** exports the whole story as one self-contained HTML file
  you can send to anyone or host anywhere; it reads well on phones and tablets.
- **Projects (folders)**; file Documents, Decks, and Canvases under a project so
  several books/worlds stay untangled.
- **Import & Add Lore**; drag in **PDFs** (both the text *and* the page images
  come in, so nothing goes blank), **Word (.docx)** files, text/Markdown, or paste
  writing directly; all indexed immediately: searchable, cross-linked, and
  readable by the assistant. File anything into "My Notes" or one of your own
  sections.
- **Task Manager**; a real-time to-do list: add, check off, edit, delete.
- **Mind Maps**; nodes you add, drag, and connect with lines; make as many maps as
  you want for plot threads, relationship webs, cause and effect.
- **Sheets**; a small spreadsheet with formulas (`=SUM(...)`, `=AVERAGE(...)`,
  cell arithmetic) and **pie/bar charts** built from a selected range.
- **Flashcards & Quiz**; give it a topic (a category, a name, or nothing for
  everything) and a count; it builds cards or a quiz (multiple-choice or
  type-it-yourself) straight from your canon's facts and summaries, regenerate
  as often as you like.
- **Timeline**; enter events as **BR** (Before Reckoning) or **AR** (After
  Reckoning) years and they're placed and re-ordered on a line automatically;
  click any point to write or read its notes.
- **Activity Feed**; a running log of what's changed lately.
- **Settings**; full **colour wheels** for both accent and background (text
  contrast adjusts automatically so it's always readable), base font size, and
  **typography for every text style**; Title, Subtitle, Heading 1–7, Normal
  Text, and Caption each get their own font, size, and colour, picked from a
  **40-font library** (Lora, Cinzel, Playfair Display, EB Garamond, Cormorant,
  Times New Roman, and more). Restore deleted entries and Name Index removals,
  and leave standing instructions for how the assistant should behave.
- **Export** (top-right); print/save the current page as a PDF with a **portrait
  or landscape** toggle, or download a full backup of everything as one file.
- **Canon Assistant** (the ✦ button, top-right); your canon at your fingertips.
  - Look up a name for a **natural-reading summary** (not a raw quote) with related
    names and sources.
  - **Ask questions in plain words**; it synthesizes an answer from your passages.
  - **Give it tasks**; e.g. *"list all characters in Aicruae"* or *"how many
    houses are there"* pulls a live list.
  - **Ask its opinion**; e.g. *"what's your favourite house"* and it picks one and
    explains its reasoning from how central that entry is to your canon.
  - **Check consistency**; *"check consistency for Solis"* gathers every entry
    actually about that subject and flags facts where they disagree.
  - **Summarize the document you're writing**; *"summarize this document"* while
    a Document is open.
  - **Quick-action chips** in the assistant panel for the common asks, and it
    remembers your **recent lookups** so you can jump back to one.
  - Keep it open while writing and it recognises names as you type.

> The assistant reads **only your own canon**; it never invents facts. Everything
> it shows you comes from your own documents, notes, and canvases. It's a local,
> rule-based tool (no external AI call); genuinely good at finding and
> synthesizing what you've written, not at generating new prose from nothing.

### Writing in Documents

The Document editor has the same styles as Settings; pick **Title, Subtitle,
Heading 1–7, Normal Text, or Caption** from the toolbar dropdown (or type **/**
for a Notion-style command menu with all of them, plus tables, images, lists,
and dividers) and it renders exactly the font/size/colour you configured. While
typing, if what you've typed is the unique start of a name you've used before,
press **Tab** to autocomplete it.

---

## Accounts: sign in first, like Wattpad

The app now opens with a **front door**: a sign-in screen you pass through
*before* you reach the workspace (the way Wattpad and AO3 treat it), not a
setting buried inside the app.

- **Create account**: a name, an optional email, and an optional password
  (useful on shared devices). No verification emails, no waiting.
- **Sign in**: pick your account from the list; if it has a password you'll be
  asked for it. You stay signed in on that browser until you sign out (from the
  avatar chip in the top bar, or Settings).
- **Guest mode**: "Continue as a guest" lets someone poke around without
  creating anything.
- **Every account is fully separate**: its own workspaces, documents, stories,
  notes, settings; two people on one computer never see each other's work.
- The **first account created on a device that already has data claims that
  data**, so if you were using the organizer before accounts existed, nothing
  moves: create your account and everything is right where you left it.

### The starter template for new users

Brand-new accounts don't start from a blank page: the **starter template**
(`site/data/template.js`) is **replicated into a workspace of their own** the
first time they sign in; a welcome document, a first story with Chapter One
wired into the Library, starter sections, and a short task list. From that
moment the copy belongs to them; every edit persists like anything else, and
the template is never re-applied over their changes.

Want new users to start from *your* layout instead? Open the workspace you want
to share and use **Settings > Account > Download as new-user template**, then
replace `site/data/template.js` in the repo with the downloaded file.

## Where your writing is saved

Documents, decks, canvases, folders, tasks, stories, and imported notes are
stored in your browser's **IndexedDB**, one separate database per workspace per
account; which, unlike the old local-storage approach, has plenty of room, so
**images you add actually persist** instead of vanishing. To keep a permanent
copy or move a workspace to another device, open that workspace and use
**Back up my work** in the sidebar (it exports everything *in the
currently-active workspace*) and **Restore backup** to load it elsewhere. Your
original canon in `source/` is always safe in the repo regardless.

Device-only accounts live **on this device**. Cloud accounts (below) keep a
local copy too, so the app opens instantly and works offline either way.

## Cloud accounts: real cross-device sync (Supabase)

When `site/data/cloud-config.js` holds a Supabase project's URL and anon key,
the sign-in screen offers **cloud accounts**: email + password, and everything
the user writes syncs to their account. Sign in on a laptop, an iPad, or a
phone and the same workspaces, documents, and stories are there. It's
local-first: IndexedDB stays the working copy, changes push up in the
background, other devices' changes pull down, and offline edits sync when the
connection returns. A sync dot on the account chip (and a Cloud sync panel in
Settings) shows the current state.

One-time setup for the project owner:

1. Create a free project at supabase.com.
2. Open the project's **SQL Editor**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This
   creates the two tables and the row-level security rules that keep every
   user's data private to them.
3. (Recommended) **Authentication > Sign In / Providers > Email**: turn off
   "Confirm email" so new users can start instantly. If you keep it on, set
   **Authentication > URL Configuration > Site URL** to the live site so the
   confirmation link lands somewhere sensible.
4. Put the project URL and anon key in `site/data/cloud-config.js` (already
   done for this repo). The anon key is public by design; the `service_role`
   key must never ship in the site.

Device-only accounts and guest mode keep working exactly as before; cloud is
an option at the gate, not a requirement.

---

## Adding more lore later

Drop new PDFs or images into the right `source/` subfolder, then rebuild the
database:

```bash
python3 tools/build_db.py source site/data/db.json
```

That re-extracts text, re-detects cross-reference names, and regenerates
`site/data/db.js`. Commit and push, and Pages redeploys automatically.

(Optional: for cleaner cross-reference names, place an English word list at
`tools/words.txt`; one word per line; so ordinary words are filtered out and
only your coined names become links. The script works fine without it.)

