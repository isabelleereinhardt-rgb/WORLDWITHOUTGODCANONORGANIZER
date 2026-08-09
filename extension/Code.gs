/**
 * BEEP BEEP ORGANIZER — Google Docs sidebar
 *
 * The server half. It is deliberately thin: it opens the sidebar, hands
 * over the text of the document or of your selection, and writes text
 * back when you ask it to. Everything else — reading the canon,
 * checking continuity, answering questions — happens in the sidebar's
 * own browser context, against your canon, using the same brain.js the
 * website uses.
 *
 * Why the split matters:
 *
 * Apps Script functions are capped at six minutes and run on Google's
 * servers, which would be a poor place to push four hundred thousand
 * words of canon through. The sidebar has no such limit and is already
 * in a browser, so the work belongs there.
 *
 * And Google Docs renders your text onto a canvas rather than into the
 * page, which is why a browser extension that tried to read the
 * document by looking at it would come back with almost nothing. Asking
 * Apps Script for the text — the way this does — sidesteps that
 * entirely and is the reason this is an add-on rather than an extension.
 *
 * Deploying it for yourself needs no Marketplace listing and no OAuth
 * review: see extension/README.md.
 */

/** Docs calls this when the document opens. */
function onOpen() {
  DocumentApp.getUi()
    .createMenu('Beep Beep Organizer')
    .addItem('Open the canon', 'showSidebar')
    .addToUi();
}

/** Called when the add-on is installed; same menu, no extra prompt. */
function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Beep Beep Organizer')
    .setWidth(360);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * The whole document as plain text.
 * Docs has no "give me 400k words cheaply" call, so very long documents
 * are truncated here rather than timing out; the sidebar says so.
 */
function getDocText() {
  var body = DocumentApp.getActiveDocument().getBody().getText() || '';
  var LIMIT = 200000;
  return {
    text: body.length > LIMIT ? body.slice(0, LIMIT) : body,
    truncated: body.length > LIMIT,
    title: DocumentApp.getActiveDocument().getName(),
  };
}

/**
 * Whatever is selected, as text. Returns an empty string when nothing
 * is selected, which the sidebar treats as "check the whole thing".
 */
function getSelectionText() {
  var sel = DocumentApp.getActiveDocument().getSelection();
  if (!sel) return '';
  var out = [];
  var parts = sel.getRangeElements();
  for (var i = 0; i < parts.length; i++) {
    var el = parts[i].getElement();
    if (!el.editAsText) continue;
    var t = el.editAsText().getText();
    if (parts[i].isPartial()) {
      t = t.substring(parts[i].getStartOffset(), parts[i].getEndOffsetInclusive() + 1);
    }
    if (t) out.push(t);
  }
  return out.join('\n');
}

/**
 * Put text into the document at the cursor, or after the selection.
 * Used by "insert from canon"; it never replaces what you have written
 * unless you had it selected and asked for that.
 */
function insertAtCursor(text) {
  var doc = DocumentApp.getActiveDocument();
  var cursor = doc.getCursor();
  if (cursor) {
    var el = cursor.insertText(text);
    if (el) return true;
  }
  doc.getBody().appendParagraph(text);
  return true;
}

/**
 * Remember the reader's settings between sessions. Properties are
 * per-user and per-document, which is the right scope for "which canon
 * am I checking this manuscript against".
 */
function loadSettings() {
  var p = PropertiesService.getUserProperties();
  return {
    canonUrl: p.getProperty('canonUrl') || '',
    shareToken: p.getProperty('shareToken') || '',
  };
}

function saveSettings(s) {
  var p = PropertiesService.getUserProperties();
  p.setProperty('canonUrl', (s && s.canonUrl) || '');
  p.setProperty('shareToken', (s && s.shareToken) || '');
  return loadSettings();
}
