# The Codex — *World Without God* Worldbuilding Database

A calm, searchable home for your entire canon. It reads every document you've
written, organizes it into collections, cross-links every name so you can chase a
subject wherever it appears, and gives you a workspace to write new lore — with a
built-in assistant that recognizes your characters and places as you type.

Think **Notion + Google Docs + Obsidian**, built specifically for this world.

### Live site

**https://isabelleereinhardt-rgb.github.io/WORLDWITHOUTGODCANONORGANIZER/**

> This link goes live once GitHub Pages is turned on (**Settings → Pages → Source
> → GitHub Actions** — see [How to open it](#how-to-open-it) below). Give the
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

**Easiest:** double-click `site/index.html` — it runs entirely in your browser,
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

- **Search everything** — press `Ctrl / ⌘ + K` (or `Ctrl + F`) anywhere to search
  across every entry by title *and* full text. This is your "find all the
  information about one subject" tool.
- **Cross-references** — names in any entry are underlined links. Click one and
  you get a page gathering **every** passage across your canon that mentions it,
  plus a "Mentioned in" list at the bottom of each entry (backlinks, Obsidian-style).
- **Collections** — the left sidebar groups everything into Characters, Noble
  Houses, Maps & Locations, Religion, Magic, Timeline, Culture, Books, Reference,
  and Canon — so it's calm to look at instead of one overwhelming pile.
- **Atlas & galleries** — all your maps, flags, and visual reference plates in
  clean image galleries (click to zoom).
- **Name Index** — an A–Z of every cross-linked name in the world.
- **Summaries above every result** — search or open a cross-reference and the top
  of the page gives you a *synthesized brief* of the topic — the key sentences,
  facts, and related names pulled together from across your canon — **before** the
  list of individual results. So you get the gist first, the sources second.
- **Documents** — a Google-Docs-style editor. Write lore, format it, add images
  (they're **saved properly now** — see below). Export to **Word (.doc)**,
  **Markdown**, or **PDF (print)**. Autosaves as you go.
- **Slide Decks** — build simple presentations, present fullscreen, export to PDF.
- **Canvases & Mood Boards** — freeform boards, Notion-style: pin **images, videos
  (YouTube / Vimeo / .mp4), links, and text notes**, and drag them wherever you
  like. Make as many boards as you want.
- **Projects (folders)** — file your Documents, Decks, and Canvases under a project
  so several books / worlds stay untangled. Use the **+ Project** chip at the top of
  each workspace page.
- **Import & Add Lore** — drag in text or Markdown files, or paste writing straight
  in, and it's indexed immediately: searchable, cross-linked, and readable by the
  assistant. Drop in images and they become a gallery.
- **Codex Assistant** (the ✦ button, top-right) — your canon at your fingertips.
  Type a name for an instant **summary** (not just a one-line blurb) with related
  names and sources, **ask a question in plain words** and it synthesizes an answer
  from your passages, or keep it open while writing and it recognizes names as you
  type.

> The assistant reads **only your own canon** — it never invents facts. Everything
> it shows you comes from your own documents and the notes you add.

---

## Your writing is saved in the browser

Documents, decks, canvases, folders, and imported notes are stored in your
browser's **IndexedDB** — which, unlike the old local-storage approach, has plenty
of room, so **images you add actually persist** instead of vanishing. To keep a
permanent copy or move between devices, use **Back up my work** in the sidebar (it
now backs up everything — including your boards and imported lore) and **Restore
backup** to load it elsewhere. Your original canon in `source/` is always safe in
the repo regardless.

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
`tools/words.txt` — one word per line — so ordinary words are filtered out and
only your coined names become links. The script works fine without it.)
