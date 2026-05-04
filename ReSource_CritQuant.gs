/**
 * Re:Source | CritQuant Google Apps Script
 * ─────────────────────────────────────────────────────────────────────────────
 * This script wires the Re:Source site to the CritQuant Google Sheet.
 *
 * SETUP INSTRUCTIONS (run once):
 *   1. Open the CritQuant Sheet.
 *   2. Click Extensions > Apps Script.
 *   3. Paste this entire file, replacing any existing content.
 *   4. Run setupTabs() once from the Apps Script editor to create all tabs.
 *   5. Deploy as a Web App (Deploy > New Deployment):
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   6. Copy the Web App URL.
 *   7. In resource_app.html, paste that URL into SHEET_CONFIG.webAppUrl.
 *
 * TABS THIS SCRIPT MANAGES:
 *   Source Library   — verified, coded sources (syncs to site)
 *   Submissions      — all incoming contributions (pending + approved)
 *   Modern Events    — modern event submissions (pending + approved)
 *   Pending Review   — filtered view of unverified submissions
 *   Sync Log         — timestamp log of every site sync request
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SPREADSHEET_ID = '1xaSSdcfZ3AeU40tnC5WK9k50EAnphNHgHY8uBCh-jqc';

const TAB = {
  LIBRARY:    'Source Library',
  SUBMISSIONS:'Submissions',
  MODERN:     'Modern Events',
  PENDING:    'Pending Review',
  SYNC_LOG:   'Sync Log',
};

// ─────────────────────────────────────────────────────────────────────────────
// WEB APP ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET — returns the full source library as JSON.
 * Called by the site when syncing the library.
 */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (action === 'library') {
      const data = getLibrarySources(ss);
      return jsonResponse({ ok: true, sources: data, count: data.length });
    }

    if (action === 'pending') {
      const data = getPendingSources(ss);
      return jsonResponse({ ok: true, sources: data, count: data.length });
    }

    // Default: return library + pending merged
    const library = getLibrarySources(ss);
    const pending = getPendingSources(ss);
    logSync(ss, 'GET /sources');
    return jsonResponse({ ok: true, library, pending, total: library.length + pending.length });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

/**
 * POST — receives a source submission from the site.
 * Logs it to Submissions or Modern Events tab with status=pending.
 */
function doPost(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let payload;

    try {
      payload = JSON.parse(e.postData.contents);
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON payload' });
    }

    const timestamp = new Date().toISOString();
    const isModern = payload.type === 'modern';
    const tabName = isModern ? TAB.MODERN : TAB.SUBMISSIONS;

    // Append to appropriate tab
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      return jsonResponse({ ok: false, error: 'Tab not found: ' + tabName });
    }

    sheet.appendRow([
      timestamp,
      payload.title || '',
      payload.author || '',
      payload.year || '',
      payload.excerpt || '',
      payload.type || 'archival',
      payload.power || '',
      payload.voice || '',
      payload.gaze || '',
      payload.schema || '',
      payload.submitter || '',
      payload.notes || '',
      payload.url || '',
      'PENDING',   // status
      '',          // reviewer
      '',          // reviewed date
    ]);

    // Also append to Pending Review tab for quick admin view
    const pendingSheet = ss.getSheetByName(TAB.PENDING);
    if (pendingSheet) {
      pendingSheet.appendRow([
        timestamp,
        payload.title || '',
        payload.author || '',
        isModern ? 'Modern Event' : 'Archival',
        payload.submitter || '',
        tabName + ' row ' + sheet.getLastRow(),
        'PENDING',
      ]);
    }

    logSync(ss, 'POST /submit: ' + (payload.title || 'untitled'));

    return jsonResponse({ ok: true, message: 'Submission logged', row: sheet.getLastRow() });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getLibrarySources(ss) {
  const sheet = ss.getSheetByName(TAB.LIBRARY);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h).trim().toLowerCase());
  return data.slice(1)
    .filter(row => row[0])
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = String(row[i] || '').trim(); });
      return {
        title:    obj['title'] || obj['source title'] || '',
        author:   obj['author'] || '',
        year:     obj['year'] || '',
        excerpt:  obj['excerpt'] || obj['key passage'] || '',
        power:    (obj['power'] || obj['power relation'] || 'constructs').toLowerCase(),
        voice:    (obj['voice'] || obj['voice authenticity'] || 'direct').toLowerCase(),
        gaze:     (obj['gaze'] || obj['gaze direction'] || 'downward').toLowerCase(),
        schema:   (obj['schema'] || obj['schema burden'] || 'moderate').toLowerCase(),
        type:     obj['type'] || obj['source type'] || '',
        status:   'verified',
        isModern: false,
      };
    })
    .filter(s => s.title);
}

function getPendingSources(ss) {
  const sources = [];

  [TAB.SUBMISSIONS, TAB.MODERN].forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    // Expected columns: timestamp, title, author, year, excerpt, type, power,
    //                   voice, gaze, schema, submitter, notes, url, status
    data.slice(1).forEach(row => {
      const status = String(row[13] || '').trim().toUpperCase();
      if (status !== 'PENDING') return;
      sources.push({
        title:    String(row[1] || '').trim(),
        author:   String(row[2] || '').trim(),
        year:     String(row[3] || '').trim(),
        excerpt:  String(row[4] || '').trim(),
        power:    String(row[6] || 'constructs').trim().toLowerCase(),
        voice:    String(row[7] || 'direct').trim().toLowerCase(),
        gaze:     String(row[8] || 'outward').trim().toLowerCase(),
        schema:   String(row[9] || 'moderate').trim().toLowerCase(),
        submitter:String(row[10] || '').trim(),
        status:   'pending',
        isModern: String(row[5] || '').trim().toLowerCase() === 'modern',
      });
    });
  });

  return sources;
}

function logSync(ss, action) {
  const sheet = ss.getSheetByName(TAB.SYNC_LOG);
  if (!sheet) return;
  sheet.appendRow([new Date().toISOString(), action]);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP: run this once to create all required tabs
// ─────────────────────────────────────────────────────────────────────────────

function setupTabs() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Source Library tab
  ensureSheet(ss, TAB.LIBRARY, [
    'Title', 'Author', 'Year', 'Excerpt', 'Source Type',
    'Power', 'Voice', 'Gaze', 'Schema',
    'Region', 'Notes', 'Status',
  ]);

  // Submissions tab
  ensureSheet(ss, TAB.SUBMISSIONS, [
    'Submitted At', 'Title', 'Author', 'Year', 'Excerpt', 'Type',
    'Power (suggested)', 'Voice (suggested)', 'Gaze (suggested)', 'Schema (suggested)',
    'Submitter', 'Notes', 'URL', 'Status', 'Reviewer', 'Reviewed At',
  ]);

  // Modern Events tab
  ensureSheet(ss, TAB.MODERN, [
    'Submitted At', 'Title', 'Speaker/Source', 'Date', 'Excerpt', 'Type',
    'Power (suggested)', 'Voice (suggested)', 'Gaze (suggested)', 'Schema (suggested)',
    'Submitter', 'Notes', 'URL', 'Status', 'Reviewer', 'Reviewed At',
  ]);

  // Pending Review tab
  ensureSheet(ss, TAB.PENDING, [
    'Submitted At', 'Title', 'Author/Speaker', 'Type',
    'Submitted By', 'Source Tab', 'Status',
  ]);

  // Sync Log tab
  ensureSheet(ss, TAB.SYNC_LOG, ['Timestamp', 'Action']);

  SpreadsheetApp.getUi().alert(
    'Setup complete. All tabs created.\n\n' +
    'Next step: Deploy this script as a Web App and paste the URL into resource_app.html under SHEET_CONFIG.webAppUrl.'
  );
}

function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1F3A6B')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN HELPERS: run from the Apps Script editor or add to a custom menu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * approveSubmission(tabName, rowNumber)
 * Moves a PENDING submission to Source Library as verified.
 * Call from the editor: approveSubmission('Submissions', 2)
 */
function approveSubmission(tabName, rowNumber) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const srcSheet = ss.getSheetByName(tabName || TAB.SUBMISSIONS);
  if (!srcSheet) { Logger.log('Tab not found: ' + tabName); return; }

  const row = srcSheet.getRange(rowNumber, 1, 1, 16).getValues()[0];
  const title   = row[1];
  const author  = row[2];
  const year    = row[3];
  const excerpt = row[4];
  const type    = row[5];
  const power   = row[6];
  const voice   = row[7];
  const gaze    = row[8];
  const schema  = row[9];
  const notes   = row[11];

  // Add to Source Library
  const libSheet = ss.getSheetByName(TAB.LIBRARY);
  libSheet.appendRow([title, author, year, excerpt, type, power, voice, gaze, schema, '', notes, 'VERIFIED']);

  // Update status in source tab
  srcSheet.getRange(rowNumber, 14).setValue('APPROVED');
  srcSheet.getRange(rowNumber, 15).setValue(Session.getActiveUser().getEmail());
  srcSheet.getRange(rowNumber, 16).setValue(new Date().toISOString());

  // Remove from Pending Review
  const pendingSheet = ss.getSheetByName(TAB.PENDING);
  if (pendingSheet) {
    const pData = pendingSheet.getDataRange().getValues();
    for (let i = pData.length - 1; i >= 1; i--) {
      if (String(pData[i][1]).trim() === String(title).trim()) {
        pendingSheet.deleteRow(i + 1);
        break;
      }
    }
  }

  Logger.log('Approved: ' + title + ' -> Source Library row ' + libSheet.getLastRow());
}

/**
 * Custom menu added when sheet opens.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Re:Source Admin')
    .addItem('Setup all tabs', 'setupTabs')
    .addSeparator()
    .addItem('View pending count', 'showPendingCount')
    .addSeparator()
    .addItem('Open Re:Source site', 'openSite')
    .addToUi();
}

function showPendingCount() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sources = getPendingSources(ss);
  SpreadsheetApp.getUi().alert(
    'Pending submissions: ' + sources.length + '\n\n' +
    sources.map(s => '- ' + s.title).join('\n')
  );
}

function openSite() {
  const html = HtmlService.createHtmlOutput(
    '<script>window.open("https://your-site-url-here","_blank");google.script.host.close();</script>'
  );
  SpreadsheetApp.getUi().showModalDialog(html, 'Opening Re:Source...');
}
