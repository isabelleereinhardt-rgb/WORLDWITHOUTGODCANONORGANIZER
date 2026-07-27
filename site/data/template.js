/* ============================================================
   Starter template; replicated into every NEW account's own
   workspace the first time they sign in. After that first copy,
   the workspace belongs entirely to them: their edits, additions,
   and deletions persist like anything else and this file is never
   consulted again for that account.

   Want new users to start from YOUR layout instead? Open Settings
   while in the workspace you want to share and use "Download as
   new-user template", then replace this file with the download.
   ============================================================ */
window.CODEX_TEMPLATE = {
  name: "Starter workspace",
  stores: {

    folders: [
      { id: "tpl-folder-book", name: "My First Book" }
    ],

    cats: [
      { id: "tpl-cat-characters", name: "My Characters", created: 1 },
      { id: "tpl-cat-places", name: "My Places", created: 2 }
    ],

    docs: [
      {
        id: "tpl-doc-start",
        title: "Start here",
        folder: null,
        html: "<h1 class=\"ty-h1\">Welcome to your workspace</h1><p>This whole workspace is yours: everything you write here is saved automatically, and if you signed in with a cloud account it follows you onto any device.</p><h3 class=\"ty-h3\">Where things live</h3><ul><li><b>The Desk</b>: your writing home; sprints, streaks, and word counts fill in as you write.</li><li><b>Books</b>: long-form writing with styles, tables, images, and autosave.</li><li><b>Read Through</b>: read your chapters in order, like a reader would.</li><li><b>My Characters / My Places</b> (in the sidebar): quick reference notes about your world. Add more sections with the + next to \"The Canon\".</li><li><b>Canvases, Timeline, Mind Maps, Sheets, Tasks</b>: everything else a book brain needs.</li></ul><h3 class=\"ty-h3\">Three good first steps</h3><ol><li>Open <b>Chapter One</b> in Books and start writing over it.</li><li>Add your first character note from <b>Add Lore</b>.</li><li>Press <b>Ctrl or Cmd + K</b> and search anything you have written; it is all indexed.</li></ol><p>Back up anytime from the sidebar: <b>Back up my work</b> gives you one file with everything, restorable on any device.</p>"
      },
      {
        id: "tpl-doc-ch1",
        title: "Chapter One",
        folder: "tpl-folder-book",
        html: "<h1 class=\"ty-h1\">Chapter One</h1><p>This is the first chapter of your first book. Replace this text with your opening scene; it is filed under \"My First Book\".</p><p>A few things worth trying while you write:</p><ul><li>Type <b>/</b> for a menu of headings, lists, tables, and images.</li><li>Names you have used before autocomplete with <b>Tab</b>.</li><li>The assistant (top right) recognises your characters as you type.</li></ul>"
      }
    ],

    notes: [
      {
        id: "tpl-note-welcome",
        title: "How reference notes work",
        category: "My Characters",
        text: "This note lives in the \"My Characters\" section in the sidebar. Anything you write in a note is searchable and cross-linked: mention a name in one note and click it anywhere else to gather every passage about it.\n\nTry replacing this with your protagonist:\n\nName: (their name)\nAge: (age)\nRole: (what they are to the story)\nWants: (what they want most)\nFears: (what they will not admit they fear)",
        images: []
      }
    ],

    tasks: [
      { id: "tpl-task-1", text: "Rename this workspace to your project's name (Workspaces button, top left)", done: false, created: 3 },
      { id: "tpl-task-2", text: "Write over Chapter One with your real opening scene", done: false, created: 2 },
      { id: "tpl-task-3", text: "Add a note for your main character in My Characters", done: false, created: 1 }
    ]

  }
};
