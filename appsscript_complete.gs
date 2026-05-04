// ══════════════════════════════════════════════════════════════
// ESCAPE THE ARCHIVE — Google Apps Script (complete)
// Sheet ID: 1F2NrS4Gaz7WY2pJCMSbE4F-DGKGc0szalpPUPtMaAks
//
// SETUP STEPS:
//   1. Open the sheet at the link above
//   2. Extensions > Apps Script
//   3. Delete any existing code and paste this entire file
//   4. Click Save (floppy disk icon)
//   5. Run setupAllSheets() once manually (select it, click Run)
//   6. Deploy > New deployment > Web app
//      - Execute as: Me
//      - Who has access: Anyone
//   7. Copy the web app URL
//   8. Paste that URL into the Educator Access field on the game site
// ══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1F2NrS4Gaz7WY2pJCMSbE4F-DGKGc0szalpPUPtMaAks';

// ── ENTRY POINT ────────────────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'gameEvent';

    if (action === 'contact')    return handleContact(data);
    if (action === 'contribute') return handleContribution(data);
    if (action === 'ping')       return handlePing();

    // Default: game event
    return handleGameEvent(data);

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'Escape the Archive ledger is live.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── PING ───────────────────────────────────────────────────────
function handlePing() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName('Ping Log') || ss.insertSheet('Ping Log');
  sh.appendRow([new Date().toISOString(), 'ping received']);
  return ok('ping');
}

// ── GAME EVENTS ────────────────────────────────────────────────
var GAME_HEADERS = [
  'Timestamp', 'Role', 'Room', 'Event Type', 'Detail JSON',
  'Session Start', 'Time in Session (min)'
];

function handleGameEvent(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Game Events', GAME_HEADERS, '#1a1208', '#d4ad3a');

  var detail = data.detail ? JSON.stringify(data.detail) : '';
  var elapsed = data.ts && data.startTime
    ? Math.round((data.ts - data.startTime) / 60000)
    : '';

  sh.appendRow([
    new Date().toISOString(),
    data.role || '',
    data.room !== undefined ? data.room : '',
    data.type || '',
    detail,
    data.startTime ? new Date(data.startTime).toISOString() : '',
    elapsed
  ]);

  return ok('gameEvent');
}

// ── CONTACT ────────────────────────────────────────────────────
var CONTACT_HEADERS = [
  'Timestamp', 'Name', 'Email', 'Role', 'Subject', 'Message', 'Responded?'
];

function handleContact(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Contact Messages', CONTACT_HEADERS, '#2a5f5c', '#ffffff');

  sh.appendRow([
    data.timestamp || new Date().toISOString(),
    data.name    || '',
    data.email   || '',
    data.role    || '',
    data.subject || '',
    data.message || '',
    'No'
  ]);

  return ok('contact');
}

// ── CONTRIBUTIONS ──────────────────────────────────────────────
var CONTRIB_HEADERS = [
  'Submitted At', 'Review Status', 'Source Type', 'Source Type (Other)',
  'Source Title', 'Date of Origin', 'Place of Origin',
  'Source Description', 'Source URL', 'Temporal Tags', 'Thematic Tags',
  'Contributor Name', 'Contributor Email', 'Contributor Role',
  'Contributor Institution', 'Credit Preference',
  'Original Creator', 'Original Creator Role', 'Current Holder',
  'Usage Rights', 'Archival Note', 'Related Sources',
  'Suggested Grade', 'Content Notes', 'Internal Notes'
];

function handleContribution(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Contributions', CONTRIB_HEADERS, '#2a5f5c', '#ffffff');

  sh.appendRow([
    data.submitted_at         || new Date().toISOString(),
    'pending',
    data.source_type          || '',
    data.source_type_other    || '',
    data.source_title         || '',
    data.source_date          || '',
    data.source_location      || '',
    data.source_description   || '',
    data.source_url           || '',
    data.temporal_tags        || '',
    data.thematic_tags        || '',
    data.contributor_name     || '',
    data.contributor_email    || '',
    data.contributor_role     || '',
    data.contributor_institution || '',
    data.credit_preference    || '',
    data.original_creator     || '',
    data.original_creator_role || '',
    data.current_holder       || '',
    data.usage_rights         || '',
    data.archival_note        || '',
    data.related_sources      || '',
    data.suggested_grade      || '',
    data.content_notes        || '',
    ''
  ]);

  // Status validation on col B
  try {
    var lastRow = sh.getLastRow();
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['pending','approved','rejected','needs-info'], true)
      .build();
    sh.getRange(lastRow, 2).setDataValidation(rule);
  } catch(e) {}

  return ok('contribute');
}

// ── SHEET HELPERS ──────────────────────────────────────────────
function getOrCreate(ss, name, headers, bgColor, fontColor) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var hr = sh.getRange(1, 1, 1, headers.length);
    hr.setValues([headers]);
    hr.setFontWeight('bold')
      .setBackground(bgColor || '#1a1208')
      .setFontColor(fontColor || '#ffffff')
      .setFontSize(10);
    sh.setFrozenRows(1);

    // Conditional formatting for Contributions review status
    if (name === 'Contributions') {
      var rules = [
        SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('pending').setBackground('#fff9c4').setRanges([sh.getRange('B2:B1000')]).build(),
        SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('approved').setBackground('#c8e6c9').setRanges([sh.getRange('B2:B1000')]).build(),
        SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('rejected').setBackground('#ffcdd2').setRanges([sh.getRange('B2:B1000')]).build()
      ];
      sh.setConditionalFormatRules(rules);
    }
  }
  return sh;
}

function ok(action) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, action: action }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── MANUAL SETUP ───────────────────────────────────────────────
// Run this once after pasting the script.
function setupAllSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  getOrCreate(ss, 'Game Events', GAME_HEADERS, '#1a1208', '#d4ad3a');
  getOrCreate(ss, 'Contact Messages', CONTACT_HEADERS, '#2a5f5c', '#ffffff');
  getOrCreate(ss, 'Contributions', CONTRIB_HEADERS, '#2a5f5c', '#ffffff');
  getOrCreate(ss, 'Ping Log', ['Timestamp', 'Message'], '#3d2f1a', '#f5f0e8');

  SpreadsheetApp.getUi().alert(
    'Setup complete!\n\n' +
    'Four tabs created:\n' +
    '  Game Events — all student interactions\n' +
    '  Contact Messages — messages from About Me\n' +
    '  Contributions — submitted sources\n' +
    '  Ping Log — connection tests\n\n' +
    'Now deploy as a Web App (Deploy > New deployment)\n' +
    'and paste the URL into the Educator Access field on the game site.'
  );
}

// ── REVIEW HELPERS (run from sheet menu) ───────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Archive Admin')
    .addItem('Set up all sheets', 'setupAllSheets')
    .addSeparator()
    .addItem('Mark selected: Approved', 'markApproved')
    .addItem('Mark selected: Rejected', 'markRejected')
    .addItem('Mark selected: Needs Info', 'markNeedsInfo')
    .addToUi();
}

function markApproved()  { setReviewStatus('approved'); }
function markRejected()  { setReviewStatus('rejected'); }
function markNeedsInfo() { setReviewStatus('needs-info'); }

function setReviewStatus(status) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName('Contributions');
  if (!sh) { SpreadsheetApp.getUi().alert('Contributions sheet not found.'); return; }
  var row = sh.getActiveCell().getRow();
  if (row <= 1) { SpreadsheetApp.getUi().alert('Select a data row first.'); return; }
  sh.getRange(row, 2).setValue(status);
  SpreadsheetApp.getUi().alert('Marked as: ' + status);
}
