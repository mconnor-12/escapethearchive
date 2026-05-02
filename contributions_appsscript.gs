// ══════════════════════════════════════════════════════════════════════
// ESCAPE THE ARCHIVE — Apps Script Extension
// Handles: Contributions tab + Contact tab
//
// ── HOW TO ADD THIS TO YOUR EXISTING APPS SCRIPT ──────────────────────
//
// Option A — Merge with existing script:
//   1. Open your existing Apps Script (Extensions → Apps Script)
//   2. Create a new file: File → New → Script file → name it "contributions"
//   3. Paste this entire file there
//   4. Your existing doPost/doGet handlers need one small edit (see below)
//
// Option B — If you want to update your main doPost:
//   In your existing doPost(e) function, add this at the top of the switch/if:
//
//     if (data.action === 'contribute') { return handleContribution(data); }
//     if (data.action === 'contact')    { return handleContact(data); }
//
// ══════════════════════════════════════════════════════════════════════

const SS_ETA = SpreadsheetApp.getActiveSpreadsheet();

// ── SHEET DEFINITIONS ──────────────────────────────────────────────────

const CONTRIBUTION_HEADERS = [
  'Submitted At',
  'Review Status',       // pending / approved / rejected
  'Source Type',
  'Source Type (Other)',
  'Source Title / Description',
  'Date of Origin',
  'Place of Origin',
  'Source Description / Transcription',
  'Source URL',
  'Temporal Tags',
  'Thematic Tags',
  'Contributor Name',
  'Contributor Email',
  'Contributor Role',
  'Contributor Institution',
  'Credit Preference',
  'Original Creator Name',
  'Original Creator Role',
  'Current Holder / Location',
  'Usage Rights',
  'Archival Note',
  'Related Sources',
  'Suggested Grade Level',
  'Content Notes',
  'Internal Notes'      // for archive admin use
];

const CONTACT_HEADERS = [
  'Timestamp',
  'Name',
  'Email',
  'Role',
  'Subject',
  'Message',
  'Responded?'           // for admin tracking
];

// ── SHEET SETUP ────────────────────────────────────────────────────────

function getOrCreateContributionsSheet() {
  let sh = SS_ETA.getSheetByName('Contributions');
  if (!sh) {
    sh = SS_ETA.insertSheet('Contributions');
    const headerRow = sh.getRange(1, 1, 1, CONTRIBUTION_HEADERS.length);
    headerRow.setValues([CONTRIBUTION_HEADERS]);
    headerRow.setFontWeight('bold')
             .setBackground('#2a5f5c')
             .setFontColor('#ffffff')
             .setFontSize(10);
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160);   // Submitted At
    sh.setColumnWidth(2, 100);   // Review Status
    sh.setColumnWidth(3, 140);   // Source Type
    sh.setColumnWidth(5, 300);   // Title
    sh.setColumnWidth(8, 400);   // Description
    sh.setColumnWidth(10, 200);  // Temporal Tags
    sh.setColumnWidth(11, 250);  // Thematic Tags
    sh.setColumnWidth(20, 140);  // Usage Rights
    sh.setColumnWidth(21, 350);  // Archival Note

    // Add data validation for Review Status
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['pending', 'approved', 'rejected', 'needs-info'], true)
      .build();
    // Apply to col B starting row 2 — will auto-expand
    sh.getRange('B2:B1000').setDataValidation(rule);

    // Conditional formatting: color-code by review status
    const rules = sh.getConditionalFormatRules();
    const pendingRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('pending')
      .setBackground('#fff9c4')
      .setRanges([sh.getRange('B2:B1000')])
      .build();
    const approvedRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('approved')
      .setBackground('#c8e6c9')
      .setRanges([sh.getRange('B2:B1000')])
      .build();
    const rejectedRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('rejected')
      .setBackground('#ffcdd2')
      .setRanges([sh.getRange('B2:B1000')])
      .build();
    sh.setConditionalFormatRules([pendingRule, approvedRule, rejectedRule]);
  }
  return sh;
}

function getOrCreateContactSheet() {
  let sh = SS_ETA.getSheetByName('Contact Messages');
  if (!sh) {
    sh = SS_ETA.insertSheet('Contact Messages');
    const headerRow = sh.getRange(1, 1, 1, CONTACT_HEADERS.length);
    headerRow.setValues([CONTACT_HEADERS]);
    headerRow.setFontWeight('bold')
             .setBackground('#1a1208')
             .setFontColor('#ffffff')
             .setFontSize(10);
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160);  // Timestamp
    sh.setColumnWidth(5, 220);  // Subject
    sh.setColumnWidth(6, 500);  // Message
  }
  return sh;
}

// ── HANDLERS ──────────────────────────────────────────────────────────

function handleContribution(data) {
  try {
    const sh = getOrCreateContributionsSheet();
    const row = [
      data.submitted_at || new Date().toISOString(),
      'pending',
      data.source_type || '',
      data.source_type_other || '',
      data.source_title || '',
      data.source_date || '',
      data.source_location || '',
      data.source_description || '',
      data.source_url || '',
      data.temporal_tags || '',
      data.thematic_tags || '',
      data.contributor_name || '',
      data.contributor_email || '',
      data.contributor_role || '',
      data.contributor_institution || '',
      data.credit_preference || '',
      data.original_creator || '',
      data.original_creator_role || '',
      data.current_holder || '',
      data.usage_rights || '',
      data.archival_note || '',
      data.related_sources || '',
      data.suggested_grade || '',
      data.content_notes || '',
      ''  // Internal Notes — blank for admin to fill
    ];
    sh.appendRow(row);

    // Optional: send notification email to archive admin
    // Uncomment and add your email to enable:
    /*
    MailApp.sendEmail({
      to: 'your-email@example.com',
      subject: '[Escape the Archive] New contribution: ' + (data.source_title || 'Untitled'),
      body: [
        'A new source has been submitted to the archive.',
        '',
        'Type: ' + (data.source_type || 'Not specified'),
        'Title: ' + (data.source_title || 'Not specified'),
        'Contributor: ' + (data.contributor_name || 'Anonymous') + ' (' + (data.contributor_email || '') + ')',
        'Submitted: ' + (data.submitted_at || 'Unknown time'),
        '',
        'Review it in your spreadsheet.'
      ].join('\n')
    });
    */

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, action: 'contribute' })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('handleContribution error: ' + err.toString());
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleContact(data) {
  try {
    const sh = getOrCreateContactSheet();
    const row = [
      data.timestamp || new Date().toISOString(),
      data.name || '',
      data.email || '',
      data.role || '',
      data.subject || '',
      data.message || '',
      'No'
    ];
    sh.appendRow(row);

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, action: 'contact' })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('handleContact error: ' + err.toString());
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── SETUP FUNCTION ────────────────────────────────────────────────────
// Run this once manually to create both sheets immediately.

function setupContributionSheets() {
  getOrCreateContributionsSheet();
  getOrCreateContactSheet();
  SpreadsheetApp.getUi().alert(
    '✓ Done!\n\n' +
    'Two new tabs have been created in your spreadsheet:\n' +
    '• "Contributions" — incoming source submissions (color-coded by review status)\n' +
    '• "Contact Messages" — messages from the About page contact form\n\n' +
    'Both are ready to receive submissions from the website.'
  );
}

// ── MENU INTEGRATION ─────────────────────────────────────────────────
// If you have an onOpen() function in Code.gs, add these items to it.
// Or let this run its own onOpen — whichever you prefer.

function onOpen_Contributions() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📚 Archive Admin')
    .addItem('Set up contribution sheets', 'setupContributionSheets')
    .addSeparator()
    .addItem('Mark selected row: Approved', 'markApproved')
    .addItem('Mark selected row: Rejected', 'markRejected')
    .addItem('Mark selected row: Needs Info', 'markNeedsInfo')
    .addSeparator()
    .addItem('Export pending contributions', 'exportPending')
    .addToUi();
}

// ── REVIEW HELPERS ────────────────────────────────────────────────────

function markApproved()  { _setStatus('approved'); }
function markRejected()  { _setStatus('rejected'); }
function markNeedsInfo() { _setStatus('needs-info'); }

function _setStatus(status) {
  const sh = SS_ETA.getSheetByName('Contributions');
  if (!sh) { SpreadsheetApp.getUi().alert('Contributions sheet not found.'); return; }
  const row = sh.getActiveCell().getRow();
  if (row <= 1) { SpreadsheetApp.getUi().alert('Please select a data row (not the header).'); return; }
  sh.getRange(row, 2).setValue(status);
  SpreadsheetApp.getUi().alert('Marked as: ' + status);
}

function exportPending() {
  const sh = SS_ETA.getSheetByName('Contributions');
  if (!sh) { SpreadsheetApp.getUi().alert('Contributions sheet not found.'); return; }
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const pending = data.filter((row, i) => i > 0 && row[1] === 'pending');
  SpreadsheetApp.getUi().alert(
    'Pending contributions: ' + pending.length + '\n\n' +
    pending.map(r => '• ' + r[4] + ' (' + r[2] + ') — by ' + r[11]).join('\n')
  );
}

// ══════════════════════════════════════════════════════════════════════
// INTEGRATION NOTE FOR YOUR EXISTING doPost():
// ──────────────────────────────────────────────────────────────────────
// Find your existing doPost(e) function and add these two lines
// near the top, inside the function, before your existing logic:
//
//   var data = JSON.parse(e.postData.contents);
//   if (data.action === 'contribute') { return handleContribution(data); }
//   if (data.action === 'contact')    { return handleContact(data); }
//
// If your doPost already parses JSON at the top, just add the two
// if-lines after that parse. That's the only change needed to Code.gs.
// ══════════════════════════════════════════════════════════════════════
