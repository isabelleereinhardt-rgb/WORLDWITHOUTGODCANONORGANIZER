# World Without God — Canon Organizer

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
  across every entry by title *and* full text.
- **Cross-references** — names in any entry are underlined links. Click one and
  you get a page gathering **every** passage across your canon that mentions it,
  plus a "Mentioned in" list at the bottom of each entry (backlinks, Obsidian-style).
- **Summaries above every result** — search or open a cross-reference and the top
  of the page gives you a *synthesized brief* of the topic — key sentences, facts,
  and related names pulled together from across your canon — **before** the list
  of individual results.
- **Collections, plus your own** — the sidebar groups everything into Characters,
  Noble Houses, Maps & Locations, Religion, Magic, Timeline, Culture, Books,
  Reference, Canon, and My Notes. Click the **+** next to "The Canon" to add your
  own sections — no code needed.
- **Batch select & delete, everywhere** — every collection has a **Select** button:
  check individual items, or **Select all** and unselect the ones you want to keep,
  then delete the rest in one go. Nothing is destroyed — deleted entries are hidden
  and can be restored anytime from **Settings → Deleted entries**.
  "My Notes" always stays in the sidebar, even at zero entries, with its own
  **New note** button.
- **Atlas & galleries** — all your maps, flags, and visual reference plates in
  clean image galleries (click to zoom).
- **Name Index** — an A–Z of every cross-linked name in the world.
- **Documents** — a Google-Docs-style editor: bold/italic/underline, **alignment,
  indent, and line spacing**, bullet & numbered lists, **tables**, links, images
  (saved properly via IndexedDB — they no longer vanish, and are resizable by
  dragging their corner), a live **word count**, a **writing timer**, **dictation**
  (speak your notes in), **read-aloud**, and an offline **grammar &amp; style check**
  (repeated words, common typos, unmatched punctuation, run-on sentences).
  Export to Word (.doc), Markdown, or PDF (print).
- **Slide Decks** — build simple presentations with **layout presets** (Title &
  Body, Title Only, Quote, Two Column), present fullscreen, export to PDF.
- **Canvases & Mood Boards** — freeform boards, Notion-style: pin images
  (resizable), a **drawing mode** (freehand sketch, downloadable as PNG), videos
  (YouTube / Vimeo / .mp4), links, and text notes, and drag them wherever you like.
  Images/links/videos/drawings can carry a **caption** describing what they are and
  how the assistant should use them. Any text you write on a canvas is picked up by
  search and the assistant, the same as a document.
- **Projects (folders)** — file Documents, Decks, and Canvases under a project so
  several books/worlds stay untangled.
- **Import & Add Lore** — drag in **PDFs** (both the text *and* the page images
  come in, so nothing goes blank), **Word (.docx)** files, text/Markdown, or paste
  writing directly — all indexed immediately: searchable, cross-linked, and
  readable by the assistant. File anything into "My Notes" or one of your own
  sections.
- **Task Manager** — a real-time to-do list: add, check off, edit, delete.
- **Mind Maps** — nodes you add, drag, and connect with lines; make as many maps as
  you want for plot threads, relationship webs, cause and effect.
- **Sheets** — a small spreadsheet with formulas (`=SUM(...)`, `=AVERAGE(...)`,
  cell arithmetic) and **pie/bar charts** built from a selected range.
- **Flashcards & Quiz** — give it a topic (a category, a name, or nothing for
  everything) and a count; it builds cards or a quiz (multiple-choice or
  type-it-yourself) straight from your canon's facts and summaries, regenerate
  as often as you like.
- **Timeline** — enter events as **BR** (Before Reckoning) or **AR** (After
  Reckoning) years and they're placed and re-ordered on a line automatically;
  click any point to write or read its notes.
- **Activity Feed** — a running log of what's changed lately.
- **Settings** — pick any **accent colour** (a full colour wheel, not just presets),
  adjust base font size and interface/reading fonts, restore deleted entries, and
  leave standing instructions for how the assistant should behave.
- **Export** (top-right) — print/save the current page as a PDF with a **portrait
  or landscape** toggle, or download a full backup of everything as one file.
- **Canon Assistant** (the ✦ button, top-right) — your canon at your fingertips.
  - Look up a name for a **natural-reading summary** (not a raw quote) with related
    names and sources.
  - **Ask questions in plain words** — it synthesizes an answer from your passages.
  - **Give it tasks** — e.g. *"list all characters in Aicruae"* pulls a live list.
  - **Ask its opinion** — e.g. *"what's your favourite house"* and it picks one and
    explains its reasoning from how central that entry is to your canon.
  - Remembers your **recent lookups** so you can jump back to one.
  - Keep it open while writing and it recognises names as you type.

> The assistant reads **only your own canon** — it never invents facts. Everything
> it shows you comes from your own documents, notes, and canvases.

---

## Your writing is saved in the browser

Documents, decks, canvases, folders, tasks, and imported notes are stored in your
browser's **IndexedDB** — which, unlike the old local-storage approach, has plenty
of room, so **images you add actually persist** instead of vanishing. To keep a
permanent copy or move between devices, use **Back up my work** in the sidebar (it
backs up everything) and **Restore backup** to load it elsewhere. Your original
canon in `source/` is always safe in the repo regardless.

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

