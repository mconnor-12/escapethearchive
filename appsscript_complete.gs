// ══════════════════════════════════════════════════════════════
// ESCAPE THE ARCHIVE — Google Apps Script v3
// Sheet ID: 1F2NrS4Gaz7WY2pJCMSbE4F-DGKGc0szalpPUPtMaAks
//
// SETUP:
//   1. Extensions > Apps Script — paste this entire file
//   2. Run setupAllSheets() once manually
//   3. Deploy > New deployment > Web app
//      Execute as: Me  |  Who has access: Anyone
//   4. Copy the deployment URL into the game's educator field
// ══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1F2NrS4Gaz7WY2pJCMSbE4F-DGKGc0szalpPUPtMaAks';

// ── TAB COLORS ─────────────────────────────────────────────────
const C = {
  INK:     '#1a1208',
  GOLD:    '#d4ad3a',
  TEAL:    '#2a5f5c',
  RUST:    '#8b3a2a',
  PLUM:    '#5a2d6e',
  GREEN:   '#1a3020',
  SLATE:   '#1a2030',
  CREAM:   '#f5f0e8',
  PAPER:   '#ffffff',
};

// ── ENTRY POINT ────────────────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || 'gameEvent';

    if (action === 'contact')        return handleContact(data);
    if (action === 'contribute')     return handleContribution(data);
    if (action === 'ping')           return handlePing();
    if (action === 'score_earned')   return handleScoreEvent(data);
    if (action === 'trophy_earned')  return handleTrophyEvent(data);
    if (action === 'session_start')  return handleSessionStart(data);
    if (action === 'room_response')  return handleRoomResponse(data);

    // All other game events
    return handleGameEvent(data);

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── TRAFFIC OVERVIEW ───────────────────────────────────────────
// Called on archive_entered and role_selected
function updateTraffic(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Traffic', [
    'Timestamp', 'Session ID', 'Role', 'Class Period', 'Event',
    'Room', 'Score at Event', 'Trophies at Event', 'Referrer'
  ], C.INK, C.GOLD);

  var d = data.detail || {};
  sh.appendRow([
    new Date().toISOString(),
    data.sessionId || data.detail && data.detail.sessionId || '',
    data.role || 'pre-role',
    d.classPeriod || '',
    data.type || '',
    data.room !== undefined ? data.room : '',
    data.score || 0,
    data.trophies ? (Array.isArray(data.trophies) ? data.trophies.join(', ') : data.trophies) : '',
    d.referrer || '',
  ]);
}

// ── GAME EVENT (catch-all) ─────────────────────────────────────
function handleGameEvent(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Game Events', [
    'Timestamp', 'Session ID', 'Role', 'Room', 'Event Type',
    'Detail JSON', 'Session Start', 'Time in Session (min)',
    'Score', 'Trophies'
  ], C.INK, C.GOLD);

  var detail = data.detail ? JSON.stringify(data.detail) : '';
  var elapsed = data.ts && data.startTime
    ? Math.round((data.ts - data.startTime) / 60000)
    : '';

  sh.appendRow([
    new Date().toISOString(),
    data.sessionId || '',
    data.role || '',
    data.room !== undefined ? data.room : '',
    data.type || '',
    detail,
    data.startTime ? new Date(data.startTime).toISOString() : '',
    elapsed,
    data.score !== undefined ? data.score : '',
    data.trophies ? (Array.isArray(data.trophies) ? data.trophies.join(', ') : '') : '',
  ]);

  // Mirror traffic events
  if (data.type === 'archive_entered' || data.type === 'role_selected') {
    updateTraffic(data);
  }

  return ok('gameEvent');
}

// ── SESSION START ──────────────────────────────────────────────
function handleSessionStart(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Sessions', [
    'Timestamp', 'Session ID', 'Student Name', 'Class Period',
    'Role', 'Started At', 'Completed At', 'Rooms Completed',
    'Final Score', 'Trophies Earned', 'Hints Used', 'Status',
    'Bonus Challenges Done', 'Time to Complete (min)'
  ], C.TEAL, C.PAPER);

  var d = data.detail || {};
  sh.appendRow([
    new Date().toISOString(),
    data.sessionId || d.sessionId || '',
    d.studentName || '',
    d.classPeriod || '',
    data.role || '',
    new Date().toISOString(),
    '',         // completed_at — filled by escape_protocol_complete
    0,          // rooms_completed
    0,          // final_score
    '',         // trophies
    0,          // hints_used
    'active',
    0,          // bonus_challenges
    '',         // time_to_complete
  ]);

  updateTraffic(data);
  return ok('session_start');
}

// ── ROOM RESPONSE (open-ended text per room) ───────────────────
function handleRoomResponse(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Per-room response sheet
  var shName = 'Responses';
  var sh = getOrCreate(ss, shName, [
    'Timestamp', 'Session ID', 'Student Name', 'Class Period',
    'Role', 'Room', 'Task ID', 'Task Label',
    'Response Type', 'Response Text',
    'Is Correct', 'Points Awarded',
    'Standards Addressed', 'Skill Category'
  ], C.SLATE, C.PAPER);

  var d = data.detail || {};
  sh.appendRow([
    new Date().toISOString(),
    data.sessionId || '',
    d.studentName || '',
    d.classPeriod || '',
    data.role || '',
    data.room !== undefined ? data.room : '',
    d.taskId || '',
    d.taskLabel || '',
    d.responseType || 'open_text',
    d.responseText || d.value || '',
    d.isCorrect !== undefined ? d.isCorrect : '',
    d.ptsAwarded || '',
    d.standards || '',
    d.skillCategory || '',
  ]);

  return ok('room_response');
}

// ── SCORE EVENT ────────────────────────────────────────────────
function handleScoreEvent(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Points Log', [
    'Timestamp', 'Session ID', 'Student Name', 'Class Period',
    'Role', 'Room', 'Points Earned', 'Label', 'Running Total'
  ], C.GREEN, C.PAPER);

  var d = data.detail || {};
  sh.appendRow([
    new Date().toISOString(),
    data.sessionId || '',
    d.studentName || '',
    d.classPeriod || '',
    data.role || '',
    data.room !== undefined ? data.room : '',
    d.pts || '',
    d.label || '',
    d.total || data.score || '',
  ]);

  return ok('score_earned');
}

// ── TROPHY EVENT ───────────────────────────────────────────────
function handleTrophyEvent(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Trophy Log', [
    'Timestamp', 'Session ID', 'Student Name', 'Class Period',
    'Role', 'Trophy ID', 'Trophy Name', 'Rarity', 'Score at Award'
  ], C.PLUM, C.PAPER);

  var d = data.detail || {};
  sh.appendRow([
    new Date().toISOString(),
    data.sessionId || '',
    d.studentName || '',
    d.classPeriod || '',
    data.role || '',
    d.id || '',
    (d.id || '').replace(/_/g, ' '),
    d.rarity || '',
    d.total || data.score || '',
  ]);

  return ok('trophy_earned');
}

// ── CONTACT ────────────────────────────────────────────────────
var CONTACT_HEADERS = [
  'Timestamp', 'Name', 'Email', 'Role', 'Subject', 'Message', 'Responded?'
];
function handleContact(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Contact Messages', CONTACT_HEADERS, C.TEAL, C.PAPER);
  sh.appendRow([
    new Date().toISOString(),
    data.name || '', data.email || '', data.role || '',
    data.subject || '', data.message || '', 'No',
  ]);
  return ok('contact');
}

// ── CONTRIBUTION ───────────────────────────────────────────────
var CONTRIB_HEADERS = [
  'Submitted At', 'Review Status', 'Source Type', 'Source Title',
  'Date of Origin', 'Place of Origin', 'Source Description', 'Source URL',
  'Contributor Name', 'Contributor Email', 'Contributor Role',
  'Contributor Institution', 'Suggested Grade', 'Internal Notes'
];
function handleContribution(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Contributions', CONTRIB_HEADERS, C.TEAL, C.PAPER);
  sh.appendRow([
    new Date().toISOString(), 'Pending',
    data.sourceType || '', data.sourceTitle || '',
    data.dateOfOrigin || '', data.placeOfOrigin || '',
    data.sourceDescription || '', data.sourceUrl || '',
    data.contributorName || '', data.contributorEmail || '',
    data.contributorRole || '', data.contributorInstitution || '',
    data.suggestedGrade || '', '',
  ]);
  return ok('contribution');
}

// ── PING ───────────────────────────────────────────────────────
function handlePing() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = getOrCreate(ss, 'Ping Log', ['Timestamp', 'Message'], C.INK, C.CREAM);
  sh.appendRow([new Date().toISOString(), 'ping received']);
  return ok('ping');
}

// ── TEACHER GRADING VIEW (computed on demand) ──────────────────
// Run this from the sheet menu to rebuild the grading summary
function rebuildGradingView() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var respSheet = ss.getSheetByName('Responses');
  var finalSheet = ss.getSheetByName('Final_Outputs');
  var pointsSheet = ss.getSheetByName('Points Log');
  var trophySheet = ss.getSheetByName('Trophy Log');

  var gradeSheet = getOrCreate(ss, 'Teacher Grading', [
    'Session ID', 'Student Name', 'Class Period', 'Role',
    // Per-room open responses
    'Prologue - Annotation 1', 'Prologue - Annotation 2', 'Prologue - Annotation 3',
    'Room I - Role Task Response',
    'Room II - Source Pattern Analysis',
    'Room III - Citation Trace',
    'Room IV - Feed Reflection',
    // Final outputs
    'R5 - Historical Claim', 'R5 - Curation Claim', 'R5 - Limitation Claim',
    'R5 - Volume Signal', 'R5 - Your Decision', 'R5 - What AI Erased',
    'R5 - Your Version (Field 7)',
    // Scoring
    'Total Score', 'Trophies Earned',
    // Flags
    'Rooms Completed', 'Hints Used',
    // Teacher
    'Teacher Notes', 'Grade'
  ], C.RUST, C.CREAM);

  // Clear existing data (keep header)
  var lastRow = gradeSheet.getLastRow();
  if (lastRow > 1) gradeSheet.deleteRows(2, lastRow - 1);

  // Build response lookup by sessionId + room + taskId
  var respData = respSheet ? respSheet.getDataRange().getValues() : [];
  var respMap = {};  // sessionId -> { taskId: responseText }
  for (var i = 1; i < respData.length; i++) {
    var sid = respData[i][1];
    var taskId = respData[i][6];
    var text = respData[i][9];
    if (!respMap[sid]) respMap[sid] = {};
    respMap[sid][taskId] = text;
  }

  // Build final outputs lookup
  var finalData = finalSheet ? finalSheet.getDataRange().getValues() : [];
  var finalMap = {};
  for (var fi = 1; fi < finalData.length; fi++) {
    var fsid = finalData[fi][0];
    finalMap[fsid] = finalData[fi];
  }

  // Build points lookup
  var ptsData = pointsSheet ? pointsSheet.getDataRange().getValues() : [];
  var ptsMap = {};  // sessionId -> last running total
  for (var pi = 1; pi < ptsData.length; pi++) {
    var psid = ptsData[pi][1];
    var total = ptsData[pi][8];
    if (total) ptsMap[psid] = total;
  }

  // Build trophy lookup
  var trophyData = trophySheet ? trophySheet.getDataRange().getValues() : [];
  var trophyMap = {};
  for (var ti = 1; ti < trophyData.length; ti++) {
    var tsid = trophyData[ti][1];
    var tname = trophyData[ti][6];
    if (!trophyMap[tsid]) trophyMap[tsid] = [];
    if (tname) trophyMap[tsid].push(tname);
  }

  // Get unique sessions from Game Events
  var evSheet = ss.getSheetByName('Game Events');
  var evData = evSheet ? evSheet.getDataRange().getValues() : [];
  var sessions = {};  // sessionId -> { name, period, role }
  for (var ei = 1; ei < evData.length; ei++) {
    var esid = evData[ei][1];
    if (esid && !sessions[esid]) {
      sessions[esid] = {
        role: evData[ei][2],
        period: '',
        name: '',
      };
    }
  }

  // Also pick up names from Sessions tab
  var sessSheet = ss.getSheetByName('Sessions');
  var sessData = sessSheet ? sessSheet.getDataRange().getValues() : [];
  for (var si = 1; si < sessData.length; si++) {
    var ssid = sessData[si][1];
    if (ssid) {
      sessions[ssid] = sessions[ssid] || {};
      sessions[ssid].name = sessData[si][2] || '';
      sessions[ssid].period = sessData[si][3] || '';
      sessions[ssid].role = sessData[si][4] || sessions[ssid].role || '';
    }
  }

  // Write one row per session
  var rows = [];
  Object.keys(sessions).forEach(function(sid) {
    var s = sessions[sid];
    var rm = respMap[sid] || {};
    var fm = finalMap[sid] || [];

    rows.push([
      sid,
      s.name || '',
      s.period || '',
      s.role || '',
      // Prologue annotations
      rm['PROL_001'] || rm['annotation_1'] || '',
      rm['PROL_002'] || rm['annotation_2'] || '',
      rm['PROL_003'] || rm['annotation_3'] || '',
      // Room I role task
      rm['R1_LEAD_CLAIM'] || rm['R1_LIMIT_CLAIM'] || rm['R1_SIG_ANALYSIS'] || '',
      // Room II
      rm['R2_PATTERN'] || rm['r2-limitation'] || '',
      // Room III
      rm['R3_TRACE'] || rm['r3-trace'] || '',
      // Room IV
      rm['R4_REFLECT'] || rm['r4-reflect'] || '',
      // Final outputs
      fm[4] || rm['historical-claim'] || '',
      fm[5] || rm['curation-claim'] || '',
      fm[6] || rm['limitation-claim-v'] || '',
      fm[7] || rm['saturation-note'] || '',
      fm[8] || rm['handoff-decision'] || '',
      fm[9] || rm['remnant-statement'] || '',
      fm[10] || rm['exhibit-description'] || '',
      // Score
      ptsMap[sid] || 0,
      // Trophies
      trophyMap[sid] ? trophyMap[sid].join(', ') : '',
      // Metadata
      '',  // rooms_completed — from sessions
      '',  // hints_used
      '',  // teacher notes (manual)
      '',  // grade (manual)
    ]);
  });

  if (rows.length > 0) {
    gradeSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  // Format the grade column with a yellow background for teacher entry
  if (rows.length > 0) {
    var gradeCol = gradeSheet.getRange(2, 25, rows.length, 1);
    gradeCol.setBackground('#fffde7');
    var notesCol = gradeSheet.getRange(2, 24, rows.length, 1);
    notesCol.setBackground('#e8f5e9');
  }

  try { SpreadsheetApp.getUi().alert(
    'Grading view rebuilt. ' + rows.length + ' student sessions found.\n\nYellow column = Grade (enter manually)\nGreen column = Teacher Notes (enter manually)'
  ); } catch(e) {}
}


// ── DELETE ALL ARCHIVE TABS ────────────────────────────────────
// Removes every tab this script created, leaving only Sheet1
function deleteAllArchiveTabs() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var archiveTabs = [
    'Traffic', 'Game Events', 'Sessions', 'Responses',
    'Points Log', 'Trophy Log', 'Teacher Grading', 'Teacher_Notes',
    'Standards_Map', 'Contact Messages', 'Contributions', 'Ping Log',
    'Class_Dashboard', 'Live_Feed', 'Auto_Scores', 'Final_Outputs',
    'Reflections', 'Signal_Log', 'Evidence_Lockers', 'Rank_History',
    'Points_Log', 'Passage_Events', 'Quest_Progress', 'Quests_Map',
    'Objects_Map', 'Object_Finds', 'Teacher_Config', 'Config',
    'Protocol_Decisions', 'Refusal_Decisions', 'Unarchivable_Markers',
    'Limitation_Claims', 'Handoff_Decisions', 'Smoothness_Checks',
    'Saturation_Events', 'Role_Shifts', 'Parallel_Endings',
  ];

  var sheets = ss.getSheets();
  var deleted = 0;

  // Must keep at least one sheet — ensure Sheet1 exists first
  var hasSheet1 = sheets.some(function(s) { return s.getName() === 'Sheet1'; });
  if (!hasSheet1) {
    ss.insertSheet('Sheet1');
  }

  sheets.forEach(function(sh) {
    if (archiveTabs.indexOf(sh.getName()) !== -1) {
      ss.deleteSheet(sh);
      deleted++;
    }
  });

  Logger.log('Deleted ' + deleted + ' tabs.');
  try {
    SpreadsheetApp.getUi().alert(
      'Deleted ' + deleted + ' archive tabs.\n\nRun Setup All Sheets to rebuild them.'
    );
  } catch(e) {}
}

// ── RESET ALL DATA (keep structure, wipe rows) ─────────────────
// Clears all data rows from every tab but keeps headers and formatting
function resetAllData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tabsToReset = [
    'Traffic', 'Game Events', 'Sessions', 'Responses',
    'Points Log', 'Trophy Log', 'Teacher Grading', 'Teacher_Notes',
    'Contact Messages', 'Contributions', 'Ping Log',
    'Class_Dashboard', 'Live_Feed', 'Auto_Scores', 'Final_Outputs',
    'Reflections', 'Signal_Log', 'Evidence_Lockers', 'Rank_History',
    'Points_Log', 'Passage_Events', 'Quest_Progress',
    'Protocol_Decisions', 'Refusal_Decisions', 'Unarchivable_Markers',
    'Limitation_Claims', 'Handoff_Decisions', 'Smoothness_Checks',
    'Saturation_Events', 'Role_Shifts', 'Parallel_Endings',
  ];

  var cleared = 0;
  tabsToReset.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last > 1) {
      sh.deleteRows(2, last - 1);
      cleared++;
    }
  });

  Logger.log('Cleared data from ' + cleared + ' tabs.');
  try {
    SpreadsheetApp.getUi().alert(
      'Data cleared from ' + cleared + ' tabs.\n\nHeaders and formatting preserved.\nStandards_Map reference data kept.'
    );
  } catch(e) {}
}

// ── FULL RESET: DELETE + REBUILD ───────────────────────────────
// Nuclear option: wipes all tabs and recreates everything clean
function fullReset() {
  try {
    var ui = SpreadsheetApp.getUi();
    var resp = ui.alert(
      'Full Reset',
      'This will DELETE ALL TABS and rebuild everything from scratch.\n\nAll student data will be permanently lost.\n\nAre you sure?',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) {
      ui.alert('Reset cancelled.');
      return;
    }
  } catch(e) {
    // Running from editor without UI — proceed anyway
  }

  deleteAllArchiveTabs();
  setupAllSheets();

  try {
    SpreadsheetApp.getUi().alert('Full reset complete. All tabs rebuilt.');
  } catch(e) {}
}

// ── NEW CLASS PERIOD (reset data, keep structure) ──────────────
// Use at the start of a new class period without rebuilding tabs
function newClassPeriod() {
  resetAllData();
  try {
    SpreadsheetApp.getUi().alert(
      'Ready for new class period.\n\nAll previous student data cleared.\nSheet structure preserved.'
    );
  } catch(e) {}
}

// ── SETUP ALL SHEETS ───────────────────────────────────────────
function setupAllSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Core operational tabs
  getOrCreate(ss, 'Traffic', [
    'Timestamp', 'Session ID', 'Role', 'Class Period', 'Event',
    'Room', 'Score at Event', 'Trophies at Event', 'Referrer'
  ], C.INK, C.GOLD);

  getOrCreate(ss, 'Game Events', [
    'Timestamp', 'Session ID', 'Role', 'Room', 'Event Type',
    'Detail JSON', 'Session Start', 'Time in Session (min)',
    'Score', 'Trophies'
  ], C.INK, C.GOLD);

  getOrCreate(ss, 'Sessions', [
    'Timestamp', 'Session ID', 'Student Name', 'Class Period',
    'Role', 'Started At', 'Completed At', 'Rooms Completed',
    'Final Score', 'Trophies Earned', 'Hints Used', 'Status',
    'Bonus Challenges Done', 'Time to Complete (min)'
  ], C.TEAL, C.PAPER);

  getOrCreate(ss, 'Responses', [
    'Timestamp', 'Session ID', 'Student Name', 'Class Period',
    'Role', 'Room', 'Task ID', 'Task Label',
    'Response Type', 'Response Text',
    'Is Correct', 'Points Awarded',
    'Standards Addressed', 'Skill Category'
  ], C.SLATE, C.PAPER);

  getOrCreate(ss, 'Points Log', [
    'Timestamp', 'Session ID', 'Student Name', 'Class Period',
    'Role', 'Room', 'Points Earned', 'Label', 'Running Total'
  ], C.GREEN, C.PAPER);

  getOrCreate(ss, 'Trophy Log', [
    'Timestamp', 'Session ID', 'Student Name', 'Class Period',
    'Role', 'Trophy ID', 'Trophy Name', 'Rarity', 'Score at Award'
  ], C.PLUM, C.PAPER);

  // Teacher-facing tabs
  getOrCreate(ss, 'Teacher Grading', [
    'Session ID', 'Student Name', 'Class Period', 'Role',
    'Prologue - Annotation 1', 'Prologue - Annotation 2', 'Prologue - Annotation 3',
    'Room I - Role Task Response',
    'Room II - Source Pattern Analysis',
    'Room III - Citation Trace',
    'Room IV - Feed Reflection',
    'R5 - Historical Claim', 'R5 - Curation Claim', 'R5 - Limitation Claim',
    'R5 - Volume Signal', 'R5 - Your Decision', 'R5 - What AI Erased',
    'R5 - Your Version (Field 7)',
    'Total Score', 'Trophies Earned',
    'Rooms Completed', 'Hints Used',
    'Teacher Notes', 'Grade'
  ], C.RUST, C.CREAM);

  getOrCreate(ss, 'Teacher_Notes', [
    'Timestamp', 'Session ID', 'Student Name', 'Room', 'Note', 'Flag'
  ], C.RUST, C.CREAM);

  // Reference tabs
  getOrCreate(ss, 'Standards_Map', [
    'Room', 'Task ID', 'Task Label', 'AP Standard Code',
    'AP Standard Text', 'Skill Category',
    'Historical Thinking Skill', 'Takeaway', 'Difficulty'
  ], C.SLATE, C.PAPER);

  getOrCreate(ss, 'Contact Messages', CONTACT_HEADERS, C.TEAL, C.PAPER);
  getOrCreate(ss, 'Contributions', CONTRIB_HEADERS, C.TEAL, C.PAPER);
  getOrCreate(ss, 'Ping Log', ['Timestamp', 'Message'], C.INK, C.CREAM);

  // Seed Standards_Map if empty
  seedStandardsMap(ss);

  // Rebuild menu
  try {
    SpreadsheetApp.getUi().createMenu('Archive Tools')
      .addItem('Rebuild Grading View', 'rebuildGradingView')
      .addItem('Rebuild Class Dashboard', 'rebuildClassDashboard')
      .addSeparator()
      .addItem('New Class Period (clear data)', 'newClassPeriod')
      .addItem('Reset All Data (keep tabs)', 'resetAllData')
      .addItem('Full Reset (delete + rebuild)', 'fullReset')
      .addSeparator()
      .addItem('Setup / Rebuild All Tabs', 'setupAllSheets')
      .addItem('Delete All Archive Tabs', 'deleteAllArchiveTabs')
      .addToUi();
  } catch(e) {}

  // Show completion alert
  try { SpreadsheetApp.getUi().alert(
    'Escape the Archive - Setup Complete\n\nSheets created:\n  Traffic - every archive entry and role selection\n  Game Events - full event log\n  Sessions - one row per student\n  Responses - all open-response text per room\n  Points Log - score events\n  Trophy Log - trophies earned\n  Teacher Grading - one row per student, all responses compiled\n  Standards_Map - AP/archival standards reference\n\nRun Rebuild Grading View from the Archive Tools menu to compile all student responses.\n\nNow deploy as Web App (Deploy > New deployment).'
  ); } catch(e) {}
}

// ── CLASS DASHBOARD ────────────────────────────────────────────
function rebuildClassDashboard() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sessSheet = ss.getSheetByName('Sessions');
  if (!sessSheet) { try { SpreadsheetApp.getUi().alert('No Sessions tab found.'); } catch(e) {} return; }

  var dash = getOrCreate(ss, 'Class_Dashboard', [
    'Session ID', 'Student Name', 'Class Period', 'Role',
    'Status', 'Current Room', 'Score', 'Trophies',
    'Rooms Completed', 'Hints Used',
    'Bonus Challenges', 'Started At', 'Last Updated'
  ], C.INK, C.GOLD);

  var lastRow = dash.getLastRow();
  if (lastRow > 1) dash.deleteRows(2, lastRow - 1);

  var sessData = sessSheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < sessData.length; i++) {
    rows.push([
      sessData[i][1],   // session_id
      sessData[i][2],   // student_name
      sessData[i][3],   // class_period
      sessData[i][4],   // role
      sessData[i][11],  // status
      '',               // current_room (from game events)
      sessData[i][8],   // final_score
      sessData[i][9],   // trophies
      sessData[i][7],   // rooms_completed
      sessData[i][10],  // hints_used
      sessData[i][12],  // bonus_challenges
      sessData[i][5],   // started_at
      new Date().toISOString(),
    ]);
  }
  if (rows.length > 0) {
    dash.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  try { SpreadsheetApp.getUi().alert('Class Dashboard rebuilt. ' + rows.length + ' sessions.'); } catch(e) {}
}

// ── STANDARDS MAP SEED ─────────────────────────────────────────
function seedStandardsMap(ss) {
  var sh = ss.getSheetByName('Standards_Map');
  if (!sh || sh.getLastRow() > 1) return;

  var standards = [
    ['all',     'AS-1', 'Close Reading Under Condition',
     'Custom Archival Standard', 'Read source and system simultaneously.',
     'Source-System Analysis', 'Analyzing Evidence',
     'The frame is part of the source.', 'foundation'],
    ['all',     'AS-2', 'Absence Naming',
     'Custom Archival Standard', 'Classify absences: accidental, institutional, deliberate.',
     'Source-System Analysis', 'Analyzing Evidence',
     'Absence has structure.', 'foundation'],
    ['all',     'AS-3', 'Provenance Tracing',
     'Custom Archival Standard', 'Follow the full chain of custody.',
     'Source-System Analysis', 'Analyzing Evidence',
     'The chain of custody is the argument.', 'core'],
    ['all',     'AS-4', 'Trust Signal Audit',
     'Custom Archival Standard', 'Distinguish earned from unearned trust signals.',
     'Argumentation', 'Causation',
     'Credibility requires independent verification.', 'core'],
    ['all',     'AS-5', 'Curation Claim',
     'Custom Archival Standard', 'Name who assembled the record and on what basis.',
     'Source-System Analysis', 'Continuity and Change over Time',
     'Curation is an argument.', 'advanced'],
    ['all',     'AS-6', 'Limitation Claim',
     'Custom Archival Standard', 'State what cannot be known from this record alone.',
     'Argumentation', 'Analyzing Evidence',
     'A stated limitation is analytical honesty.', 'advanced'],
    ['prologue','PROL_001', 'Intake document annotation',
     'APUSH KC-7.3.I, WHAP-7.3', 'Identify framing and omission in official language.',
     'Contextualization', 'Analyzing Evidence',
     'The language of the intake desk is the first archive.', 'foundation'],
    ['room1',   'R1_EUPH', 'Euphemism decoder',
     'APUSH KC-7.3.I, HTS-1', 'Match bureaucratic euphemism to plain-language meaning.',
     'Sourcing', 'Analyzing Evidence',
     'Naming the euphemism names the act.', 'foundation'],
    ['room1',   'R1_LEAD_CLAIM', 'Lead Auditor judgment',
     'APUSH KC-7.3.I, HTS-2', 'Evaluate official record against available evidence.',
     'Argumentation', 'Causation',
     'What the record makes easy to believe matters.', 'core'],
    ['room1',   'R1_LIMIT_CLAIM', 'Limitation claim (Room I)',
     'APUSH KC-7.3.I, AS-6', 'Identify evidentiary gaps from two-document record.',
     'Argumentation', 'Analyzing Evidence',
     'What two documents cannot tell is still evidence.', 'core'],
    ['room1',   'R1_SIG_ANALYSIS', 'Signal analysis (Room I)',
     'APUSH KC-7.3.I, AS-4', 'Identify trust signals in official document design.',
     'Sourcing', 'Analyzing Evidence',
     'Formatting is an argument about authority.', 'core'],
    ['room2',   'R2_PATTERN', 'Source pattern analysis',
     'AS-1, AS-3, APUSH HTS-1', 'Identify volume saturation and false independence.',
     'Corroboration', 'Continuity and Change over Time',
     'Five sources from one origin are one source.', 'core'],
    ['room3',   'R3_TRACE', 'Citation chain trace',
     'AS-3, APUSH HTS-2', 'Trace citation chain to single or multiple origins.',
     'Corroboration', 'Causation',
     'Repetition is not corroboration.', 'advanced'],
    ['room4',   'R4_REFLECT', 'Feed reflection',
     'AS-4, AS-5', 'Name the ranking signals that shaped trust.',
     'Argumentation', 'Analyzing Evidence',
     'The algorithm is a curation decision.', 'advanced'],
    ['room5',   'R5_HIST', 'Historical claim',
     'APUSH KC-7.3.I, HTS-3', 'Construct a responsible historical claim from the full record.',
     'Argumentation', 'Causation',
     'Historical claiming is an act of judgment.', 'advanced'],
    ['room5',   'R5_LIMIT', 'Limitation claim (Room V)',
     'AS-6, APUSH HTS-3', 'Name what cannot be determined from the archive.',
     'Argumentation', 'Analyzing Evidence',
     'Naming the limit is the hardest claim.', 'advanced'],
  ];

  sh.getRange(2, 1, standards.length, 9).setValues(standards);
}

// ── UTILITY ────────────────────────────────────────────────────
function getOrCreate(ss, name, headers, bgColor, textColor) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    var hdr = sh.getRange(1, 1, 1, headers.length);
    hdr.setBackground(bgColor || '#1a1208');
    hdr.setFontColor(textColor || '#d4ad3a');
    hdr.setFontWeight('bold');
    hdr.setFontFamily('Arial');
    hdr.setFontSize(10);
    sh.setFrozenRows(1);
    // Auto-size columns
    for (var i = 1; i <= headers.length; i++) {
      sh.setColumnWidth(i, Math.max(120, headers[i-1].length * 8));
    }
  }
  return sh;
}

function ok(action) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, action: action }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── ADD MENU ON OPEN ───────────────────────────────────────────
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Archive Tools')
      .addItem('Rebuild Grading View', 'rebuildGradingView')
      .addItem('Rebuild Class Dashboard', 'rebuildClassDashboard')
      .addSeparator()
      .addItem('New Class Period (clear data)', 'newClassPeriod')
      .addItem('Reset All Data (keep tabs)', 'resetAllData')
      .addItem('Full Reset (delete + rebuild)', 'fullReset')
      .addSeparator()
      .addItem('Setup / Rebuild All Tabs', 'setupAllSheets')
      .addItem('Delete All Archive Tabs', 'deleteAllArchiveTabs')
      .addToUi();
  } catch(e) {
    // onOpen called outside spreadsheet context — safe to ignore
  }
}
