/* ============================================================
   Starter template; replicated into every NEW account's own
   workspace the first time they sign in. After that first copy,
   the workspace belongs entirely to them: their edits, additions,
   and deletions persist like anything else and this file is never
   consulted again for that account.

   Per the site owner's spec: a new account starts EMPTY except for
   a user manual for each section, filed under My Notes. No sample
   chapters, no starter sections, no tasks.

   Want new users to start from YOUR layout instead? Open Settings
   while in the workspace you want to share and use "Download as
   new-user template", then replace this file with the download.
   ============================================================ */
window.CODEX_TEMPLATE = {
  name: "Starter workspace",
  stores: {

    notes: [
      {
        id: "tpl-man-start",
        title: "Read me first",
        category: "My Notes",
        text: "Welcome to your workspace. Everything you write here saves automatically, and if you signed in with a cloud account it follows you onto any device you sign in on.\n\nThese notes are a user manual: one guide per section of the app. Read the ones you need and delete any or all of them whenever you like; they are ordinary notes and this workspace is entirely yours.\n\nTwo essentials before anything else:\n1. Press Ctrl or Cmd + K anywhere to search everything you have written.\n2. Back up my work (bottom of the sidebar) downloads one file containing your whole workspace, restorable on any device.",
        images: []
      },
      {
        id: "tpl-man-desk",
        title: "Guide: The Desk",
        category: "My Notes",
        text: "The Desk is your writing home page. It greets you, tracks your writing streak and word counts, and shows what changed since you were last here.\n\nStart a 25 minute sprint with the button at the top; when the sprint ends, its words are added to your heatmap and totals automatically. Pick up where you left off shows the last things you read or wrote so you can jump straight back in.",
        images: []
      },
      {
        id: "tpl-man-books",
        title: "Guide: Books",
        category: "My Notes",
        text: "Books is where long-form writing lives. A book is a project with chapters filed into it; you can also keep loose documents that do not belong to a book yet.\n\nOpen a document and you get a full editor: headings and styles, bold and italics, tables, images, bullet and numbered lists, a live word count, dictation, and read-aloud. Type / for a quick menu of everything you can insert. Names you have used before autocomplete with Tab. Everything saves as you type.",
        images: []
      },
      {
        id: "tpl-man-read",
        title: "Guide: Read Through",
        category: "My Notes",
        text: "Read Through presents your chapters in order, the way a reader would see them, in a clean book-like page with nothing to click but next and previous.\n\nUse it to read your own drafts straight through, to check pacing, or to hand your device to someone for a read. It remembers where you stopped.",
        images: []
      },
      {
        id: "tpl-man-slides",
        title: "Guide: Slide Decks",
        category: "My Notes",
        text: "Slide Decks builds simple presentations: character profiles, world recaps, pitches.\n\nAdd slides, pick a layout for each (title and body, quote, two columns), then Present to show them fullscreen; arrow keys move between slides. You can also export a deck to PDF.",
        images: []
      },
      {
        id: "tpl-man-canvases",
        title: "Guide: Canvases",
        category: "My Notes",
        text: "Canvases are freeform mood boards. Pin images, videos, links, sticky notes, and freehand drawings anywhere on the board and drag them around until it feels right.\n\nGive images a caption saying what they are; captions are searchable and the assistant reads them. Make as many boards as you like: one per character, per place, per book.",
        images: []
      },
      {
        id: "tpl-man-mindmaps",
        title: "Guide: Mind Maps",
        category: "My Notes",
        text: "Mind Maps are for plot threads, relationship webs, and cause-and-effect chains. Add nodes, drag them around, and connect them with lines.\n\nMake a separate map per question you are working out; they are cheap to create and easy to delete.",
        images: []
      },
      {
        id: "tpl-man-sheets",
        title: "Guide: Sheets",
        category: "My Notes",
        text: "Sheets is a small spreadsheet for tallies and tables: ages, timelines, army sizes, word count targets.\n\nIt supports formulas like =SUM(A1:A5) and =AVERAGE(B1:B4), plus cell arithmetic, and can draw a pie or bar chart from a selected range.",
        images: []
      },
      {
        id: "tpl-man-study",
        title: "Guide: Flashcards & Quiz",
        category: "My Notes",
        text: "Flashcards & Quiz turns your own notes and entries into self-testing. Give it a topic (or leave it blank for everything) and a count, then generate flashcards to flip through or a quiz to score yourself against.\n\nIt only ever uses facts from what you have written; nothing is invented. Saved quizzes keep your attempt history so you can watch a score improve.",
        images: []
      },
      {
        id: "tpl-man-timeline",
        title: "Guide: Timeline",
        category: "My Notes",
        text: "Timeline places your world's events on a line automatically. Add an event with a label and a year, and it is sorted into position; click any point to write notes about what happened.\n\nUse it for history, for a book's chronology, or for a single character's life.",
        images: []
      },
      {
        id: "tpl-man-atlas",
        title: "Guide: Atlas",
        category: "My Notes",
        text: "Atlas collects every map and image gallery in the workspace in one place, with click-to-zoom.\n\nAdd images through Add Lore or on a Canvas and they become part of your world's visual reference.",
        images: []
      },
      {
        id: "tpl-man-index",
        title: "Guide: Name Index",
        category: "My Notes",
        text: "The Name Index is an A to Z of every name the app has recognised across your writing. Click a name to gather every passage that mentions it, with a summary at the top.\n\nNames are cross-linked automatically: mention a character in any note or document and the link appears everywhere. You can remove a name from the index if it is a common word being picked up by mistake.",
        images: []
      },
      {
        id: "tpl-man-tasks",
        title: "Guide: Tasks",
        category: "My Notes",
        text: "Tasks is a simple to-do list that saves as you type. Add a task, check it off, edit it in place, delete it.\n\nUse it for revision passes, research questions, or anything you would otherwise put on a sticky note.",
        images: []
      },
      {
        id: "tpl-man-lore",
        title: "Guide: Add Lore",
        category: "My Notes",
        text: "Add Lore brings material into your canon. Drag in PDFs (text and page images both come through), Word documents, text or Markdown files, or images, or just paste writing straight in.\n\nEverything you add is indexed immediately: searchable, cross-linked, and readable by the assistant. File things into My Notes or into a section of your own; add a new section with the + next to The Canon in the sidebar.",
        images: []
      },
      {
        id: "tpl-man-canon",
        title: "Guide: The Canon and sections",
        category: "My Notes",
        text: "The Canon is the sidebar area for your world's reference material. It starts with just My Notes; press the + beside the heading to add sections of your own, such as Characters, Places, or Magic.\n\nAnything filed in a section becomes part of your searchable canon, and the assistant answers questions from it.",
        images: []
      },
      {
        id: "tpl-man-assistant",
        title: "Guide: The Assistant",
        category: "My Notes",
        text: "The assistant button at the top right opens a helper that reads only what you have written in the active workspace. Look up any name for a summary, ask questions in plain words, ask for lists, or have it check your canon for contradictions. Type / to see its commands.\n\nIt never invents facts; every answer is drawn from your own entries, and you can connect an AI key in Settings if you want fuller written answers.",
        images: []
      },
      {
        id: "tpl-man-community",
        title: "Guide: Community Space and sharing",
        category: "My Notes",
        text: "The Community Space (top bar) is where publishing lives: publish chapters one at a time and follow what readers are seeing.\n\nYou can also create share links that give someone read-only access to your work with no account needed, and collect their comments back. Manage links and comments from the same place.",
        images: []
      },
      {
        id: "tpl-man-workspaces",
        title: "Guide: Workspaces and your account",
        category: "My Notes",
        text: "A workspace is one project: its own documents, notes, canvases, everything. The Workspaces button (top left) creates more and switches between them; each is fully separate.\n\nYour account keeps everything saved. With a cloud account your workspaces sync, so signing in on another device brings your work with you; the coloured dot on your account chip shows sync status. Settings holds appearance, typography, your avatar, and account controls, including turning this workspace into the template new users start from.",
        images: []
      }
    ]

  }
};
