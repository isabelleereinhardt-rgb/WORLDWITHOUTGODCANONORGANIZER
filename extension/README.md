# The Google Docs sidebar

Your canon, inside the document you are writing in. It checks a chapter
against what you have already written, flags names that are not in your
canon yet, and answers questions without you leaving the page.

The thing it is actually for is the first one. Looking a fact up is
convenient. Being told, while you write, that this scene has Lily at
nine when you established seven — or that Vex is speaking three chapters
after Doran killed him — is the part no amount of care replaces, because
across four hundred thousand words no one can hold it all.

## Putting it in your Docs (about five minutes)

You do **not** need to publish anything to the Google Workspace
Marketplace, and you do not need an OAuth review. This is a bound
script in your own account.

1. Open the Google Doc you write in.
2. **Extensions → Apps Script**. A new tab opens with an empty
   `Code.gs`.
3. Replace everything in `Code.gs` with the contents of
   [`Code.gs`](Code.gs) from this folder.
4. **＋ → HTML** beside *Files*. Name it exactly `Sidebar` (Apps Script
   adds the `.html`). Replace its contents with
   [`Sidebar.html`](Sidebar.html).
5. Save, then **Run → onOpen** once. Google will ask you to authorise
   it; it is your own script, so approve it. (The "unverified app"
   warning appears because it has not been through Marketplace review,
   which a private script does not need. **Advanced → Go to … (unsafe)**.)
6. Back in your document, reload the page. A **Beep Beep Organizer**
   menu appears. **Open the canon**.
7. First run asks where your canon lives. Paste:

   ```
   https://isabelleereinhardt-rgb.github.io/WORLDWITHOUTGODCANONORGANIZER/site/
   ```

   Leave the share token blank to use the canon published in this
   repository, or paste one made in the app (**Community Space → your
   work → Share**) to check against a private workspace instead.

If you would rather keep the script in this repository than edit it in a
browser tab, [`clasp`](https://github.com/google/clasp) will push this
folder into the bound project: `clasp clone <scriptId>` then
`clasp push`.

## What it does

**Check this chapter** / **Check the selection** reads the document
through Apps Script, then compares it with your canon and reports:

- **Contradictions** — a fact stated in the draft that disagrees with a
  fact in your canon. Only single-valued things are compared (you have
  one age, one birthplace, one mother, one founder), and only when both
  sides state one plainly.
- **The dead, walking** — somebody your canon killed, speaking or acting
  in the draft.
- **Names not in your canon yet** — with the nearest existing name
  beside them, because that is usually the answer: `Lilly → Lily`.

**Ask the canon** is the same assistant the website runs, and **Insert**
drops its answer into the document at your cursor.

## Why it is an add-on and not a Chrome extension

Google Docs draws your text onto a canvas rather than putting it in the
page, so an extension that tried to read the document by looking at it
would come back with almost nothing. Asking Apps Script for the text —
which is what `getDocText` does — sidesteps that completely.

The split of work matters too. Apps Script functions run on Google's
servers with a six-minute ceiling, which is a poor place to push a
422,000-word canon through. So the server half here is deliberately
thin — read the document, read the selection, insert text, remember two
settings — and all the reading happens in the sidebar, in your browser,
against `canon.js`, `brain.js` and `continuity.js` loaded from your own
site. That is the same code the website runs, not a copy of it, so the
checker cannot drift away from the assistant.

## What it does not do

It does not write to your canon. Filing a selection as a new entry is
the obvious next step and is deliberately not here yet: reading is worth
trusting first.

It checks what it can state plainly and stays quiet otherwise. Run
against 25 real chapters of *World Without God* it reported no false
alarms; run against drafts written to contradict the canon it caught two
of three, missing one whose death the trait reader does not state
plainly enough to compare. Missing a real contradiction is the failure
it is designed to have — a checker that cries wolf gets switched off
within a day, and then it catches nothing at all.

## Testing

The logic is covered by `tests/continuity.test.js` (29 checks), which
runs in Node with no browser and no Google account:

```bash
node tests/continuity.test.js
```

The Apps Script glue in `Code.gs` — the four calls into the document —
cannot be exercised outside Google, so it is kept small enough to read
in one sitting.
