# Tests for the assistant

These exist because the assistant is the one part of the site that can be
confidently wrong. Everything else either renders or does not; an answer
can look perfectly reasonable and still be made up, or quietly stop
citing your entries. These suites check the things that would be
embarrassing rather than merely broken.

They have already caught nine real faults: a house indexed under its bare
name reported as "not in your canon", statistics disagreeing with the
sidebar, a polite "please add a task to…" falling through to a search,
a connected model never being called when retrieval came back empty, a
key field wrongly hidden for custom gateways, and — the one that
mattered most — a leftover API key being transmitted to whichever
provider you switched to next. Playing with it rather than testing it
found three more: a denial read as an assertion, the writer's own words
being rewritten before they were saved, and every handler but one
ignoring what the assistant had already read. The scanned-pages suite
immediately caught two of its own: an import writing its explanation to
a log that saving the note then wiped, so a refused page read as an
empty page; and the connection test redrawing the panel over the answer
it had just given.

## Running them

```bash
./tests/run.sh unit     # fast, no browser
./tests/run.sh          # everything, including the browser suite
```

The browser suite needs Playwright once:

```bash
cd tests && npm install
```

Nothing here talks to the internet, and no API key is needed. The suites
block outbound requests and use a local stand-in provider instead.

## What each one covers

**`brain.test.js`** — the on-device understanding, against a small
invented canon so the expected answers are knowable. Every question shape
(compare, relationship, when, where, why, how old, define, facts,
opinion, statistics), pronoun and "what about X" resolution, typo
tolerance, the markdown renderer, and — just as important — the questions
the brain must *not* answer, so it keeps handing those to the older
handlers instead of swallowing them.

**`ai.test.js`** — the request actually sent to a provider, with `fetch`
stubbed. That conversation history is sanitised into strict alternation,
that a dangling user turn is dropped, that standing instructions and the
persona reach the system prompt, and that turning the personality off
removes it without disturbing anything else.

**`providers.test.js`** — every provider preset, with `fetch` stubbed:
the URL each one builds, the headers it carries, and the body shape,
which genuinely differs between Anthropic, OpenAI and Gemini. Also that
the two local presets connect with no key at all, that they never
forward a key left behind by a paid provider, and that model discovery
reads each provider's own listing format.

**`streaming.test.js`** — answers arriving as they are written, with
`fetch` stubbed by a real `ReadableStream` of server-sent frames. It
exercises the actual reader: frames split across arbitrary chunk
boundaries, several frames in one chunk, all three delta shapes, an error
frame arriving after a 200, a server that ignored the stream flag, and
the rule that words already received are never thrown away when a
connection breaks.

**`ocr.test.js`** — reading scanned pages through Google Cloud Vision,
with `fetch` stubbed. The request shape (key in the query, not a header;
dense document text, not a caption), the text going back to the page it
came from, batching, and every failure worth explaining in words rather
than a status code. Most of it is about the money: that pages are counted
against the free allowance, that a page Google found nothing on is still
counted because it is still billed, that a job which would overrun is
refused rather than quietly trimmed, that a refusal costs nothing, that a
failure part-way keeps what was already paid for, and that a new month
restores the allowance.

**`explore.js`** — a hunt rather than a checklist. Hostile and malformed
input (empty, punctuation-only, 500 characters, regex metacharacters,
script payloads, emoji, non-Latin), markup living inside the canon,
negation, contradictory entries, pronoun chains, empty workspaces, 400
entries for scale, a name that is also a verb, and circular text. It
fails the run if anything throws, hangs, leaks live markup, or states
the opposite of what is written.

**`assistant.e2e.js`** — the real site in a real browser, against the
real World Without God canon, driven through the actual interface. Asks
questions, checks the answers name real entries, teaches it a fact and
confirms a later answer uses it, runs every action and confirms the
records exist and that undo removes them, configures the API path through
Settings, watches a streamed answer actually grow on screen, and verifies
a bad key downgrades instead of breaking.

**`ocr.e2e.js`** — the real site in a real browser importing a real PDF
that carries no text layer, which is what a scan looks like to pdf.js.
Google is intercepted rather than called, so it costs nothing and runs
offline, but everything this side of the wire is the shipping code: the
file imports empty while the feature is off and nothing is sent; the
Settings panel switches it on and tests the key; the chapter then comes
in as text, in page order, findable by search and answerable by the
assistant; the allowance is counted and refused at the line; a refused
key does not lose the file; and the key never reaches a backup.

**`stub-provider.js`** — a stand-in that speaks the OpenAI request shape.
It records everything it is sent so the tests can assert on the real
payload, echoes back proof of what arrived, and has a `/fail` route for
testing the failure path. Using it means no key, no cost, and no network.

## A note on the end-to-end suite

It signs in as a guest whose workspace carries the canon, which is the
configuration a reader of this repository gets. It writes to that
workspace: a few tasks, a draft note, a document, a section. They live in
that browser profile only and are discarded when it closes.
