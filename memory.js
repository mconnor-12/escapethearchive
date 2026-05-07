/* ══════════════════════════════════════════════════════════════
   ESCAPE THE ARCHIVE — memory.js  (usability revision)
   Fixes applied from usability report:
   - Auto-scroll to proceed / hotspot section after annotation save
   - Hotspot zone correctly hidden until annotations done
   - Progress dots: static, labeled, non-clickable (ARIA)
   - beforeunload warning when in-progress
   - Full keyboard + ARIA for DnD and signal buttons
   - Tooltips for "hotspot", "misalignment", "earned/unearned"
   - localStorage role-namespaced (no cross-role bleed)
   - Immersive historical feedback after euphemism decoder
   - Role-specific prologue orientation
   - Sticky "Continue" button when proceed is unlocked
   - source/signal tagging: each counted once (no double-count)
   - All proceed actions auto-scroll into view
   ══════════════════════════════════════════════════════════════ */

'use strict';

// ── GAME STATE ─────────────────────────────────────────────────
const S = {
  role: null,
  room: 0,
  r0: { annotationsSaved: false, hotspot1: false, hotspot2: false, hotspot3: false },
  r1: { euphDone: false, _euphDnd: false, witnessOpen: false, claimSubmitted: false },
  r2: { sourcesTagged: 0, limitationDone: false },
  r3: { tracingDone: false, echoJudgment: null },
  r4: { signalsRated: 0, totalSignals: 6, feedReflected: false },
  r5: { escapeParts: 0, totalParts: 7, submitted: false },
  frustration: {},
  analytics: { events: [] },
  startTime: null,
  hasProgress: false,
  score: 0,
  scoreBreakdown: [],
  sessionId: null,
};

// Role-namespaced storage — prevents cross-role annotation bleed
function storeKey(k) { return 'eta_' + (S.role || 'anon') + '_' + k; }
function saveProgress() {
  if (!S.role) return;
  try {
    localStorage.setItem(storeKey('state'), JSON.stringify({
      room: S.room,
      r0: S.r0,
      r1: { euphDone: S.r1.euphDone },
      r2: S.r2,
      r3: S.r3,
      r4: { signalsRated: S.r4.signalsRated },
      r5: { escapeParts: S.r5.escapeParts },
    }));
  } catch(e) {}
}

// ── ANALYTICS ──────────────────────────────────────────────────
const SHEETS_URL_KEY = 'sheetsUrl';
const SHEETS_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbx_hE36G5zn8evEoIge02aR-5q5fnPQKiqtay_7v4DkgXud3DJqpbhc7J3XQ9WTh2Y/exec';

function logEvent(type, detail) {
  const ev = { ts: Date.now(), role: S.role, room: S.room, type, detail };
  S.analytics.events.push(ev);
  S.hasProgress = true;
  saveProgress();
  postToSheets(ev);
}

async function postToSheets(payload) {
  const url = localStorage.getItem(SHEETS_URL_KEY) || SHEETS_URL_DEFAULT;
  if (!url) return;
  try {
    const body = {
      action: payload.action || 'gameEvent',
      sessionId: S.sessionId,
      ...payload,
      score: S.score || 0,
      trophies: Array.from(typeof earnedTrophies !== 'undefined' ? earnedTrophies : []),
      startTime: S.startTime,
    };
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      mode: 'no-cors',
    });
  } catch(e) {}
}

function showToast(msg, dur = 2800) {
  const t = document.getElementById('ledger-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ── STARTUP ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Always seed the live Sheets URL
  localStorage.setItem(SHEETS_URL_KEY, SHEETS_URL_DEFAULT);
  const saved = localStorage.getItem(SHEETS_URL_KEY) || SHEETS_URL_DEFAULT;
  const inp = document.getElementById('sheets-url-input');
  if (inp) inp.value = saved;
  setSyncIndicator('connected');


  initDnD();
  initHotspots();
  initTooltips();

  // FIX: Warn before leaving if in-progress
  window.addEventListener('beforeunload', e => {
    if (S.hasProgress && !S.r5.submitted) {
      e.preventDefault();
      e.returnValue = 'Your archive progress will be lost if you leave. Use the in-app navigation instead.';
    }
  });

  // FIX: Progress dots — mark as purely decorative / non-interactive
  document.querySelectorAll('.prog-dot').forEach(d => {
    d.setAttribute('aria-hidden', 'true');
    d.style.cursor = 'default';
    d.style.pointerEvents = 'none';
  });
});

// ── ARCHIVE ENTRY SYNC ────────────────────────────────────────
// Called the moment the student clicks "Enter the Archive"
function logArchiveEntry() {
  const url = localStorage.getItem(SHEETS_URL_KEY) || SHEETS_URL_DEFAULT;
  const payload = {
    action: 'gameEvent',
    ts: Date.now(),
    role: 'pre-role',
    room: 0,
    type: 'archive_entered',
    detail: {
      time: new Date().toISOString(),
      referrer: document.referrer || 'direct',
    },
    startTime: Date.now(),
  };
  // Store locally regardless of Sheets config
  S.analytics.events.push(payload);
  // Post to sheet if URL is configured
  if (url) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'no-cors',
    }).then(() => {
      setSyncIndicator('connected');
      showToast('Archive entered. Session logged to ledger.');
    }).catch(() => {});
  }
}

// ── ROLE SELECTION ─────────────────────────────────────────────
function selectRole(role, el) {
  S.role = role;
  S.startTime = Date.now();
  S.sessionId = 'SES_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  document.querySelectorAll('.role-card, .role-pass').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');

  showToast('📋 Your responses are saved locally in this browser. Each role has separate storage.');

  setTimeout(() => {
    document.getElementById('role-screen').style.display = 'none';
    document.getElementById('game-area').style.display = 'block';
    setRolePrologueText(role);
    applyRoleView();
    goToRoom(0);
    logEvent('role_selected', { role });
  }, 400);
}

// FIX: Role-specific prologue orientation
const ROLE_ORIENTATIONS = {
  lead: {
    label: 'Lead Auditor: your orientation',
    text: 'Your primary task is evaluating the archive\'s claims against its evidence. As you read, ask: <em>does the record do what it says it does?</em> Watch for overreach, selective omission, and framing that presents institutional choices as natural facts.',
  },
  keeper: {
    label: 'Evidence Keeper: your orientation',
    text: 'Your task is tracking what the archive holds, and flagging what\'s missing. As you read, ask: <em>what sources are cited, and what\'s absent that should be here?</em> Gaps in the record are as significant as what\'s present.',
  },
  analyst: {
    label: 'Archive Analyst: your orientation',
    text: 'Your task is reading the collection for patterns and silences. As you read, ask: <em>whose voices are included, and whose are absent?</em> Pay close attention to how language shapes what feels like neutral description.',
  },
  signal: {
    label: 'Signal Monitor: your orientation',
    text: 'Your task is evaluating the information environment itself. As you read, ask: <em>what makes this source feel authoritative, and is that feeling earned?</em> Official language and institutional credentials are signals to interrogate, not to accept at face value.',
  },
};

function setRolePrologueText(role) {
  const box = document.getElementById('role-orientation-box');
  const lbl = document.getElementById('role-orientation-label');
  const txt = document.getElementById('role-orientation-text');
  if (!box) return;
  const data = ROLE_ORIENTATIONS[role];
  if (!data) return;
  if (lbl) lbl.textContent = data.label;
  if (txt) txt.innerHTML = data.text;
  box.hidden = false;
}

// ── ROOM NAVIGATION ────────────────────────────────────────────
function goToRoom(n) {
  S.room = n;
  document.querySelectorAll('.room-panel').forEach(p => p.classList.remove('visible'));
  const panel = document.getElementById('room-' + n);
  if (panel) {
    panel.classList.add('visible');
    // FIX: Scroll to page top — avoids nested scroll container looping
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const labels = [
    'Prologue: The Intake Desk',
    'Room I: The Small Record',
    'Room II: Many Sources',
    'Room III: Following the Citation',
    'Room IV: The Feed',
    'Room V: The Summary',
  ];
  const rl = document.getElementById('room-label');
  const rt = document.getElementById('room-title');
  if (rl) rl.textContent = n === 0 ? 'Prologue' : 'Room ' + n;
  if (rt) rt.textContent = labels[n] || '';

  // FIX: Progress dots — visual only, with tooltip text
  document.querySelectorAll('.prog-dot').forEach((d, i) => {
    d.classList.toggle('done', i < n);
    d.classList.toggle('active', i === n);
    d.setAttribute('title', (i < n ? '✓ Complete: ' : i === n ? '→ Current: ' : '') + (labels[i] || ''));
  });

  const progressLabel = document.getElementById('progress-label');
  if (progressLabel) {
    progressLabel.textContent = n === 0 ? 'Prologue' : 'Room ' + n + ' of 5';
  }

  setStickyProceed(null);
  applyRoleView();
  logEvent('room_enter', { room: n });
  if (n > 0) scoreRoomComplete(n - 1);
}

function applyRoleView() {
  document.querySelectorAll('[data-roles]').forEach(el => {
    const roles = el.dataset.roles.split(',').map(r => r.trim());
    el.style.display = (!S.role || roles.includes(S.role)) ? '' : 'none';
  });
}

// FIX: Sticky "Continue" button — fixed bottom bar
function setStickyProceed(label, fn) {
  const btn = document.getElementById('sticky-proceed');
  if (!btn) return;
  if (!label) { btn.style.display = 'none'; return; }
  btn.style.display = 'flex';
  btn.textContent = label;
  btn.onclick = fn;
}

// ── TOOLTIPS ───────────────────────────────────────────────────
// FIX: Tooltips for archival terminology
function initTooltips() {
  const tips = {
    '[data-tip="hotspot"]':
      'A hotspot is a specific word or phrase marked for critical examination. Click it to reveal what the language conceals.',
    '[data-tip="misalignment"]':
      'A misalignment is a gap between what the archive claims and what the evidence actually supports.',
    '[data-tip="earned"]':
      '"Earned" means the trust signal reflects genuine reliability, e.g. peer review, independent sourcing, or community curation.',
    '[data-tip="unearned"]':
      '"Unearned" means the signal looks authoritative but is not, e.g. engagement counts, sponsored ranking, or a platform badge that certifies a domain, not content accuracy.',
  };
  Object.entries(tips).forEach(([sel, tip]) => {
    document.querySelectorAll(sel).forEach(el => {
      el.setAttribute('title', tip);
    });
  });
}

// ── PROLOGUE (Room 0) ──────────────────────────────────────────
function saveAnnotations() {
  const a1 = document.getElementById('annot-1')?.value.trim();
  const a2 = document.getElementById('annot-2')?.value.trim();
  const a3 = document.getElementById('annot-3')?.value.trim();
  if (!a1) { showFeedback('fb-annot','warn','Answer question 1 first.'); document.getElementById('annot-1')?.focus(); activateHint('hint-annot'); return; }
  if (!a2) { showFeedback('fb-annot','warn','Answer question 2 first.'); document.getElementById('annot-2')?.focus(); activateHint('hint-annot'); return; }
  if (!a3) { showFeedback('fb-annot','warn','Answer question 3 first.'); document.getElementById('annot-3')?.focus(); activateHint('hint-annot'); return; }

  S.r0.annotationsSaved = true;
  document.getElementById('annot-save-btn')?.setAttribute('disabled', true);
  showFeedback('fb-annot', 'ok', '✓ Annotations saved. Scroll back up and click all three bold phrases in the Exhibit Packet to continue.');

  // FIX: Unhide hotspot zone and scroll to it
  const hz = document.getElementById('hotspot-zone');
  if (hz) {
    hz.hidden = false;
    setTimeout(() => hz.scrollIntoView({ behavior: 'smooth', block: 'start' }), 180);
  }
  // Log annotation responses for teacher grading
  postToSheets({ action: 'room_response', room: 0, detail: { taskId: 'PROL_001', taskLabel: 'Intake annotation 1', responseType: 'annotation', responseText: a1, standards: 'APUSH KC-7.3.I, AS-1' } });
  postToSheets({ action: 'room_response', room: 0, detail: { taskId: 'PROL_002', taskLabel: 'Intake annotation 2', responseType: 'annotation', responseText: a2, standards: 'APUSH KC-7.3.I, AS-1' } });
  postToSheets({ action: 'room_response', room: 0, detail: { taskId: 'PROL_003', taskLabel: 'Intake annotation 3', responseType: 'annotation', responseText: a3, standards: 'APUSH KC-7.3.I, AS-1' } });
  logEvent('annotations_saved', {});
  checkPrologueUnlock();
}

function initHotspots() {
  // Force-hide all reveal panels on init regardless of HTML state
  document.querySelectorAll('[id^="hotspot-reveal-"]').forEach(r => {
    r.hidden = true;
    r.setAttribute('aria-hidden', 'true');
  });

  document.querySelectorAll('.hotspot-btn').forEach(btn => {
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-expanded', 'false');

    // FIX: Keyboard accessible
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });

    btn.addEventListener('click', () => {
      const key = btn.dataset.hotspot;
      const reveal = document.getElementById('hotspot-reveal-' + key);
      if (!reveal) return;
      // Always open, never re-hide — stays visible once clicked
      reveal.hidden = false;
      reveal.removeAttribute('aria-hidden');
      reveal.classList.add('open');      // triggers high-contrast styling
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('visited');
      // Only log + check unlock once per hotspot
      if (!S.r0['hotspot' + key]) {
        S.r0['hotspot' + key] = true;
        logEvent('hotspot_clicked', { key });
        checkPrologueUnlock();
      }
      setTimeout(() => reveal.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    });
  });
}

function checkPrologueUnlock() {
  if (S.r0.annotationsSaved && S.r0.hotspot1 && S.r0.hotspot2 && S.r0.hotspot3) {
    const proceed = document.getElementById('prologue-proceed');
    if (proceed) {
      proceed.hidden = false;
      setTimeout(() => proceed.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
    }
    setStickyProceed('Proceed to Room I →', () => goToRoom(1));
    showToast('✓ All phrases examined. Proceed to Room I when ready.');
    logEvent('prologue_complete', {});
  }
}

// ── ROOM I — CURATED SCARCITY ──────────────────────────────────
const EUPH_ANSWERS = {
  'euph-a': 'systematic destruction',
  'euph-b': 'forced removal',
  'euph-c': 'administrative delay',
};

// ── SCORING ───────────────────────────────────────────────────────────────────
const SCORE_VALUES = {
  euph_correct:    10,
  source_correct:   5,
  signal_correct:   5,
  room_complete:   10,
  bonus_challenge: 15,
  trophy_common:    5,
  trophy_uncommon: 10,
  trophy_rare:     20,
  trophy_legendary:50,
};
// Correct answer keys for objective tasks
const SOURCE_ANSWERS = {
  'ap-wire':   'unearned',   // WRA press release reprinted verbatim
  'wra-photo': 'unearned',   // official WRA institutional document
  'radio':     'unearned',   // cites AP wire, not independent
  'letter':    'earned',     // intercepted community letter - genuine testimony
  'wra-survey':'unearned',   // WRA surveying its own camps
};
const SIGNAL_ANSWERS = {
  'feed-1': 'unearned',  // sponsored WRA archive summary
  'feed-2': 'earned',    // peer-reviewed censorship research
  'feed-3': 'unearned',  // Wikipedia aggregation
  'feed-4': 'unearned',  // engagement-driven blog
  'feed-5': 'unearned',  // social media shares
  'feed-6': 'earned',    // Densho Digital Archive - community-built
};
const _sourceScored = {};
const _signalScored = {};
const _euphScored = {};

function addScore(pts, label) {
  S.score = (S.score || 0) + pts;
  S.scoreBreakdown = S.scoreBreakdown || [];
  S.scoreBreakdown.push({ label, pts, ts: Date.now() });
  updateScoreDisplay();
  if (typeof logEvent === 'function') logEvent('score_earned', { pts, label, total: S.score });
}

function updateScoreDisplay() {
  const el = document.getElementById('score-display');
  if (!el) return;
  el.textContent = S.score + ' pts';
  el.classList.remove('score-bump');
  void el.offsetWidth;
  el.classList.add('score-bump');
}

let _miniQueue = [];
let _miniBusy = false;
function showMiniScore(pts, label) {
  _miniQueue.push({ pts, label });
  if (!_miniBusy) drainMini();
}
function drainMini() {
  if (_miniQueue.length === 0) { _miniBusy = false; return; }
  _miniBusy = true;
  const { pts, label } = _miniQueue.shift();
  const el = document.getElementById('mini-score-popup');
  if (!el) { _miniBusy = false; setTimeout(drainMini, 100); return; }
  el.querySelector('.mini-score-pts').textContent = pts;
  el.querySelector('.mini-score-label').textContent = label;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => { el.classList.remove('show'); setTimeout(drainMini, 280); }, 1600);
}

function scoreEuphAnswer(zoneKey, val) {
  if (_euphScored[zoneKey]) return;
  if (EUPH_ANSWERS[zoneKey] && val.trim() === EUPH_ANSWERS[zoneKey]) {
    _euphScored[zoneKey] = true;
    addScore(SCORE_VALUES.euph_correct, 'Phrase decoded correctly');
    showMiniScore('+' + SCORE_VALUES.euph_correct, 'Correct decode');
  }
}

function scoreSourceRating(sourceId, trust) {
  if (_sourceScored[sourceId]) return;
  if (SOURCE_ANSWERS[sourceId]) {
    const correct = SOURCE_ANSWERS[sourceId] === trust;
    if (correct) {
      _sourceScored[sourceId] = true;
      addScore(SCORE_VALUES.source_correct, 'Source rated correctly');
      showMiniScore('+' + SCORE_VALUES.source_correct, 'Trust judgment: correct');
    }
  }
}

function scoreSignalRating(sigId, verdict) {
  if (_signalScored[sigId]) return;
  if (SIGNAL_ANSWERS[sigId]) {
    const correct = SIGNAL_ANSWERS[sigId] === verdict;
    if (correct) {
      _signalScored[sigId] = true;
      addScore(SCORE_VALUES.signal_correct, 'Signal rated correctly');
      showMiniScore('+' + SCORE_VALUES.signal_correct, 'Signal read: correct');
    }
  }
}

function scoreRoomComplete(room) {
  addScore(SCORE_VALUES.room_complete, 'Room ' + room + ' complete');
  showMiniScore('+' + SCORE_VALUES.room_complete, 'Room complete');
}

function scoreBonusChallenge(badgeId) {
  addScore(SCORE_VALUES.bonus_challenge, 'Challenge: ' + badgeId);
  showMiniScore('+' + SCORE_VALUES.bonus_challenge, 'Challenge complete');
}

function scoreTrophy(rarity) {
  const pts = SCORE_VALUES['trophy_' + rarity] || 5;
  addScore(pts, 'Trophy earned');
  showMiniScore('+' + pts, 'Trophy unlocked');
}

let _euphDndState = {};
let _kbSelectedChip = null;

function initDnD() {
  document.querySelectorAll('.dnd-chip').forEach(chip => {
    chip.setAttribute('draggable', true);
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('role', 'option');
    chip.setAttribute('aria-grabbed', 'false');
    chip.setAttribute('title', 'Drag to a matching phrase below. Or press Enter to select, then Tab to a phrase and press Enter to place.');

    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', chip.dataset.value);
      chip.classList.add('dragging');
      chip.setAttribute('aria-grabbed', 'true');
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      chip.setAttribute('aria-grabbed', 'false');
    });

    // FIX: Keyboard DnD
    chip.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (_kbSelectedChip === chip) {
        chip.classList.remove('kb-selected');
        _kbSelectedChip = null;
      } else {
        if (_kbSelectedChip) _kbSelectedChip.classList.remove('kb-selected');
        _kbSelectedChip = chip;
        chip.classList.add('kb-selected');
        showToast('Selected: "' + chip.dataset.value + '". Tab to a target phrase and press Enter to place it.');
      }
    });
  });

  document.querySelectorAll('.dnd-zone').forEach(zone => {
    zone.setAttribute('tabindex', '0');
    zone.setAttribute('role', 'listitem');
    zone.setAttribute('aria-dropeffect', 'move');
    zone.setAttribute('title', 'Drop a term here, or press Enter if a term is keyboard-selected.');

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('over');
      placeInZone(zone, e.dataTransfer.getData('text/plain'));
    });

    // FIX: Keyboard placement
    zone.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && _kbSelectedChip) {
        e.preventDefault();
        placeInZone(zone, _kbSelectedChip.dataset.value);
        _kbSelectedChip.classList.remove('kb-selected');
        _kbSelectedChip = null;
      }
    });
  });
}

function placeInZone(zone, val) {
  if (!val || !val.trim()) return;            // guard: ignore empty drops
  const zoneKey = zone.dataset.zone;
  // Update state first, then render, then check
  _euphDndState[zoneKey] = val.trim();
  // Score correct euphemism matches as they land
  if (typeof scoreEuphAnswer === 'function') scoreEuphAnswer(zoneKey, val.trim());
  zone.textContent = val.trim();
  zone.style.color = 'var(--paper2)';
  zone.style.fontStyle = 'normal';
  zone.setAttribute('aria-label', 'Contains: ' + val.trim());
  // Show partial progress immediately
  const filled = Object.keys(_euphDndState).length;
  if (filled < 3) {
    showFeedback('fb-euph', 'info', filled + ' of 3 placed. Keep going.');
  }
  checkAllEuph();
}

function checkAllEuph() {
  // Explicit: all three keys must be present and match exactly
  const keys = Object.keys(EUPH_ANSWERS);
  const allFilled = keys.every(k => k in _euphDndState);
  if (!allFilled) return;                     // wait until all three placed
  const correct = keys.every(k => _euphDndState[k] === EUPH_ANSWERS[k]);
  if (correct) {
    S.r1.euphDone = true;
    S.r1._euphDnd = true;
    document.querySelectorAll('.dnd-zone').forEach(z => z.classList.add('ready'));
    document.getElementById('euph-drawer-btn')?.removeAttribute('hidden');
    // FIX: Immersive historical feedback
    showFeedback('fb-euph', 'ok', `
      ✓ Decoder complete. Witness testimony is now accessible.<br><br>
      <strong style="color:var(--gold2);">Historical context:</strong> The War Relocation Authority's own
      style guide instructed staff to use "evacuation" instead of "removal," "assembly center" instead of
      "prison camp," and "non-alien" instead of "citizen" because "citizen" implied rights the
      government was actively suspending. Language was a legal instrument, not a description.
      Reading the official record against itself is an archival skill, not just a critical thinking one.
    `);
    logEvent('euph_decoded', { method: 'dnd' });
    setTimeout(() => document.getElementById('euph-drawer-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 250);
  } else {
    // All three placed but wrong — give feedback
    showFeedback('fb-euph', 'warn', 'Not quite. Look at each phrase again. Which plain-language word might it be replacing?');
    activateHint('hint-euph');
  }
}

function checkEuph() {
  const a = document.getElementById('euph-sel-a')?.value;
  const b = document.getElementById('euph-sel-b')?.value;
  const c = document.getElementById('euph-sel-c')?.value;
  if (!a || !b || !c) {
    showFeedback('fb-euph', 'warn', 'Select an answer for each phrase before checking.');
    return;
  }
  if (a === 'systematic destruction' && b === 'forced removal' && c === 'administrative delay') {
    S.r1.euphDone = true;
    document.getElementById('euph-drawer-btn')?.removeAttribute('hidden');
    showFeedback('fb-euph', 'ok', `
      ✓ Correct. Testimony unlocked.<br><br>
      <strong style="color:var(--gold2);">Historical context:</strong> The WRA's style guide directed staff
      to use "evacuation" rather than "removal," "assembly center" rather than "prison camp," and
      "non-alien" rather than "citizen." Language was a legal instrument. Reading the record against
      itself is a core archival skill.
    `);
    logEvent('euph_decoded', { method: 'select' });
    setTimeout(() => document.getElementById('euph-drawer-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 250);
  } else {
    showFeedback('fb-euph', 'warn', 'Not quite. Look at each phrase again. What plain-language word might the official term be replacing?'); activateHint('hint-euph');
  }
}

function unlockWitness() {
  if (!S.r1.euphDone && !S.r1._euphDnd) {
    showFeedback('fb-euph', 'warn', 'Complete the euphemism decoder first to unlock the testimony.');
    return;
  }
  const drawer = document.getElementById('witness-drawer');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('open');
  drawer.classList.toggle('open');
  const btn = document.getElementById('witness-toggle-btn');
  if (btn) btn.textContent = isOpen ? '🔓 Access witness testimony' : '▲ Close testimony';
  if (!isOpen) {
    S.r1.witnessOpen = true;
    setTimeout(() => drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
    logEvent('witness_drawer_open', {});
  }
}

function submitLeadJudgment() {
  const judgment = document.getElementById('lead-judgment')?.value.trim();
  if (!judgment || judgment.length < 20) {
    showFeedback('fb-r1', 'warn', 'Write at least one full sentence. Which specific words in the record seem important to you?');
    activateHint('hint-r1');
    document.getElementById('lead-judgment')?.focus();
    return;
  }
  S.r1.claimSubmitted = true;
  postToSheets({ action: 'room_response', room: 1, detail: { taskId: 'R1_LEAD_CLAIM', taskLabel: 'Lead Auditor judgment', responseType: 'open_text', responseText: judgment, standards: 'APUSH KC-7.3.I, HTS-2', skillCategory: 'Argumentation' } });
  showFeedback('fb-r1', 'ok', '✓ Judgment recorded in the archive ledger. You may proceed to Room II.');
  const proceed = document.getElementById('r1-proceed');
  if (proceed) { proceed.removeAttribute('hidden'); setTimeout(() => proceed.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200); }
  setStickyProceed('Proceed to Room II →', () => goToRoom(2));
  logEvent('lead_judgment', { length: judgment.length });
  checkFrustration(1);
}

function buildLimitationClaimScaffold() {
  const claim = document.getElementById('limitation-claim')?.value.trim();
  if (!claim || claim.length < 15) {
    showFeedback('fb-r1-lim', 'warn', 'Articulate the limitation in at least one full sentence.');
    document.getElementById('limitation-claim')?.focus();
    return;
  }
  S.r1.claimSubmitted = true;
  postToSheets({ action: 'room_response', room: 1, detail: { taskId: 'R1_LIMIT_CLAIM', taskLabel: 'Limitation claim', responseType: 'open_text', responseText: claim, standards: 'AS-6, APUSH KC-7.3.I', skillCategory: 'Argumentation' } });
  showFeedback('fb-r1-lim', 'ok', '✓ Limitation claim recorded. You may proceed to Room II.');
  const proceed = document.getElementById('r1-proceed');
  if (proceed) { proceed.removeAttribute('hidden'); setTimeout(() => proceed.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200); }
  setStickyProceed('Proceed to Room II →', () => goToRoom(2));
  logEvent('limitation_claim', { room: 1 });
}

// ── ROOM II — BROADCAST SATURATION ────────────────────────────
const _r2Tagged = {};

function tagSource(el, sourceId, trust) {
  const item = el.closest('.signal-item');
  item?.querySelectorAll('.sig-btn').forEach(b => {
    b.classList.remove('earned', 'unearned');
    b.setAttribute('aria-pressed', 'false');
  });
  el.classList.add(trust, 'selected');
  el.setAttribute('aria-pressed', 'true');
  scoreSourceRating(sourceId, trust);

  // Always log on change; derive count from object keys (never double-count)
  const wasNew = !_r2Tagged[sourceId];
  _r2Tagged[sourceId] = trust;
  S.r2.sourcesTagged = Object.keys(_r2Tagged).length;
  const counter = document.getElementById('r2-tagged-count');
  if (counter) counter.textContent = S.r2.sourcesTagged;
  if (wasNew) logEvent('source_tagged', { source: sourceId, trust, room: 2 });

  if (S.r2.sourcesTagged >= 5) {
    const zone = document.getElementById('r2-limitation-zone');
    if (zone && zone.hasAttribute('hidden')) {
      zone.removeAttribute('hidden');
      setTimeout(() => zone.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
  }
}

function submitLimitation() {
  const lim = document.getElementById('r2-limitation')?.value.trim();
  if (!lim || lim.length < 15) {
    showFeedback('fb-r2', 'warn', 'Articulate the saturation limitation in at least one full sentence.');
    document.getElementById('r2-limitation')?.focus();
    return;
  }
  S.r2.limitationDone = true;
  postToSheets({ action: 'room_response', room: 2, detail: { taskId: 'R2_PATTERN', taskLabel: 'Source pattern analysis', responseType: 'open_text', responseText: lim, standards: 'AS-1, AS-3, APUSH HTS-1', skillCategory: 'Corroboration' } });
  showFeedback('fb-r2', 'ok', '✓ Saturation analysis complete. Proceed to Room III.');
  const proceed = document.getElementById('r2-proceed');
  if (proceed) { proceed.removeAttribute('hidden'); setTimeout(() => proceed.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200); }
  setStickyProceed('Proceed to Room III →', () => goToRoom(3));
  logEvent('saturation_limitation', { length: lim.length });
  checkFrustration(2);
}

// ── ROOM III — ECHO CORROBORATION ─────────────────────────────
function submitEchoTrace() {
  const trace = document.getElementById('r3-trace')?.value.trim();
  if (!trace || trace.length < 15) {
    showFeedback('fb-r3', 'warn', 'Trace the full citation path before your verdict. Name the specific chain.');
    document.getElementById('r3-trace')?.focus();
    return;
  }
  S.r3.tracingDone = true;
  const _r3trace = document.getElementById('r3-trace')?.value || '';
  postToSheets({ action: 'room_response', room: 3, detail: { taskId: 'R3_TRACE', taskLabel: 'Citation chain trace', responseType: 'open_text', responseText: _r3trace, standards: 'AS-3, APUSH HTS-2', skillCategory: 'Corroboration' } });
  const zone = document.getElementById('r3-judgment-zone');
  if (zone) { zone.removeAttribute('hidden'); setTimeout(() => zone.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200); }
  showFeedback('fb-r3', 'ok', '✓ Citation trace recorded. Render your verdict below.');
  logEvent('echo_trace', { length: trace.length });
}

function submitLeadJudgmentR3(judgment) {
  S.r3.echoJudgment = judgment;
  const feedbacks = {
    'echo corroboration': `✓ Verdict: <strong style="color:var(--rust2);">Echo corroboration</strong>. The "consensus" traces to a single WRA press release. 47 newspapers reprinted the same wire; Congress cited those newspapers; historians cited Congress. This is how institutional framing achieves the appearance of broad corroboration.`,
    'independently corroborated': `Verdict recorded: <strong>Independently corroborated</strong>. Consider re-examining the chain. Multiple outlets cited the same AP wire, which cited the same WRA press release. Repetition across outlets is not independent corroboration. It is one source being passed around.`,
    'insufficient evidence to determine': `Verdict recorded: <strong>Insufficient evidence</strong>. The chain is traceable enough to make a determination. Examine who cited whom, and whether any source drew on material the WRA did not itself produce.`,
  };
  showFeedback('fb-r3-j', judgment === 'echo corroboration' ? 'ok' : 'warn', feedbacks[judgment] || '✓ Recorded.');
  const proceed = document.getElementById('r3-proceed');
  if (proceed) { proceed.removeAttribute('hidden'); setTimeout(() => proceed.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200); }
  setStickyProceed('Proceed to Room IV →', () => goToRoom(4));
  logEvent('echo_judgment', { judgment });
  checkFrustration(3);
}

// ── ROOM IV — FEED OVERLOAD ────────────────────────────────────
const _r4Rated = {};

function rateSignal(el, sigId, verdict) {
  const item = el.closest('.signal-item');
  item?.querySelectorAll('.sig-btn').forEach(b => {
    b.classList.remove('earned', 'unearned');
    b.setAttribute('aria-pressed', 'false');
  });
  el.classList.add(verdict);
  el.setAttribute('aria-pressed', 'true');

  // Always derive count from object keys after assignment
  const wasNewSig = !_r4Rated[sigId];
  _r4Rated[sigId] = verdict;
  S.r4.signalsRated = Object.keys(_r4Rated).length;
  const counter = document.getElementById('r4-rated-count');
  if (counter) counter.textContent = S.r4.signalsRated;
  if (wasNewSig) logEvent('signal_rated', { sig: sigId, verdict, room: 4 });

  if (S.r4.signalsRated >= S.r4.totalSignals) {
    const zone = document.getElementById('r4-reflect-zone');
    if (zone && zone.hasAttribute('hidden')) {
      zone.removeAttribute('hidden');
      setTimeout(() => zone.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
  }
}

function submitFeedReflection() {
  const ref = document.getElementById('r4-reflect')?.value.trim();
  if (!ref || ref.length < 20) {
    showFeedback('fb-r4', 'warn', 'Reflect in at least two sentences. How did the ranking shape your judgment?');
    document.getElementById('r4-reflect')?.focus();
    return;
  }
  S.r4.feedReflected = true;
  postToSheets({ action: 'room_response', room: 4, detail: { taskId: 'R4_REFLECT', taskLabel: 'Feed reflection', responseType: 'open_text', responseText: ref, standards: 'AS-4, AS-5', skillCategory: 'Argumentation' } });
  showFeedback('fb-r4', 'ok', '✓ Feed analysis complete. Proceed to the final room.');
  const proceed = document.getElementById('r4-proceed');
  if (proceed) { proceed.removeAttribute('hidden'); setTimeout(() => proceed.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200); }
  setStickyProceed('Proceed to Room V →', () => goToRoom(5));
  logEvent('feed_reflected', { length: ref.length });
  checkFrustration(4);
}

// ── ROOM V — ESCAPE PROTOCOL ──────────────────────────────────
const ESCAPE_FIELDS = [
  'historical-claim','curation-claim','limitation-claim-v',
  'saturation-note','handoff-decision','remnant-statement','exhibit-description',
];

function checkEscapeProgress() {
  let filled = 0;
  ESCAPE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el && el.value.trim().length >= 10) filled++;
  });
  S.r5.escapeParts = filled;
  const prog = document.getElementById('escape-progress');
  if (prog) prog.textContent = filled + ' / ' + ESCAPE_FIELDS.length;
  if (filled >= ESCAPE_FIELDS.length) {
    const btn = document.getElementById('escape-submit-btn');
    if (btn && btn.hasAttribute('hidden')) {
      btn.removeAttribute('hidden');
      setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
    }
  }
}

function submitEscapeProtocol() {
  const allFilled = ESCAPE_FIELDS.every(f => {
    const el = document.getElementById(f);
    return el && el.value.trim().length >= 10;
  });
  if (!allFilled) {
    showFeedback('fb-r5', 'warn', 'Complete all seven protocol fields (at least 10 characters each) before submitting.');
    for (const f of ESCAPE_FIELDS) {
      const el = document.getElementById(f);
      if (el && el.value.trim().length < 10) { el.focus(); break; }
    }
    return;
  }
  S.r5.submitted = true;
  S.hasProgress = false;
  // Log all 7 escape protocol fields
  var _fieldMap = {
    'historical-claim': { taskId: 'R5_HIST', label: 'Historical claim', std: 'APUSH KC-7.3.I, HTS-3' },
    'curation-claim':   { taskId: 'R5_CUR',  label: 'Curation claim',   std: 'AS-5' },
    'limitation-claim-v':{ taskId: 'R5_LIMIT',label: 'Limitation claim', std: 'AS-6, APUSH HTS-3' },
    'saturation-note':  { taskId: 'R5_SAT',  label: 'Volume signal',    std: 'AS-4' },
    'handoff-decision': { taskId: 'R5_HAND', label: 'Your decision',     std: 'AS-5' },
    'remnant-statement':{ taskId: 'R5_REM',  label: 'What AI erased',   std: 'AS-1, AS-2' },
    'exhibit-description':{ taskId: 'R5_VER',label: 'Your version',     std: 'APUSH HTS-3, AS-6' },
  };
  Object.keys(_fieldMap).forEach(function(fid) {
    var val = document.getElementById(fid)?.value || '';
    var info = _fieldMap[fid];
    postToSheets({ action: 'room_response', room: 5, detail: { taskId: info.taskId, taskLabel: info.label, responseType: 'escape_field', responseText: val, standards: info.std, skillCategory: 'Argumentation' } });
  });
  // Log final session summary
  postToSheets({ action: 'score_earned', detail: { pts: 0, label: 'Escape complete', total: S.score } });

  const exhibit = document.getElementById('exhibit-description')?.value || '';
  document.getElementById('final-exhibit-text').textContent = exhibit;
  const complete = document.getElementById('escape-complete');
  if (complete) { complete.removeAttribute('hidden'); setTimeout(() => complete.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200); }
  setStickyProceed(null);

  const elapsed = Math.round((Date.now() - S.startTime) / 60000);
  logEvent('escape_protocol_complete', { elapsed_min: elapsed, role: S.role });
  showToast('🔓 Archive escape complete.');
}

// ── FRUSTRATION DETECTION ─────────────────────────────────────
const _submitTimes = {};

function checkFrustration(room) {
  const now = Date.now();
  const key = 'r' + room;
  if (_submitTimes[key] && (now - _submitTimes[key]) < 28000) {
    S.frustration[key] = true;
    const banner = document.getElementById('frust-banner-' + room);
    if (banner) banner.classList.add('visible');
    const recog = document.getElementById('frust-recog-' + room);
    if (recog) recog.style.display = 'block';
    logEvent('frustration_detected', { room });
  }
  _submitTimes[key] = now;
}

const FRUST_MSGS = {
  1: 'The record is designed to be insufficient. That is the point. You are not failing to find evidence; you\'re experiencing what curated scarcity feels like as an analytical condition.',
  2: 'Abundance doesn\'t equal reliability. Saturation is a tactic, not an accident. Try returning to the sources one at a time rather than reading across all of them at once.',
  3: 'Echo corroboration is designed to look like consensus. Noticing it is exactly the analytical move. it\'s exactly what the exercise is built to surface.',
  4: 'The feed is engineered to make low-quality sources feel authoritative. Noticing that discomfort is the analytical move.',
  5: 'The AI summary is smooth by design. Your job is not to improve it. It is to name what it made disappear.',
};

function recoverFrustrationDocument(room) {
  showFeedback('fb-r' + room + '-frust', 'info',
    '↩ <strong>Recovery note:</strong> ' + (FRUST_MSGS[room] || 'The archive has not changed. your reading of it has room to deepen.'));
  logEvent('frustration_recovery', { room });
}

// v4/v5 analytics IDs preserved
function R5_FRUST_RECOVER() { recoverFrustrationDocument(5); }
function R5_FRUST_RECOGNITION() { checkFrustration(5); }

// ── FEEDBACK HELPER ───────────────────────────────────────────
function showFeedback(id, type, html) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'feedback-msg visible feedback-' + type;
  el.innerHTML = html;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');
}

// ── SHEETS URL CONFIG ─────────────────────────────────────────
function saveSheetURL() {
  const url = document.getElementById('sheets-url-input')?.value.trim();
  const status = document.getElementById('sheets-status');
  if (!url || !url.startsWith('https://')) {
    if (status) { status.textContent = 'Paste a valid https:// URL first.'; status.style.color = 'rgba(200,80,60,0.7)'; }
    return;
  }
  localStorage.setItem(SHEETS_URL_KEY, url);
  if (status) { status.textContent = 'URL saved. All student responses will sync to the ledger.'; status.style.color = 'rgba(80,180,100,0.8)'; }
  setSyncIndicator('connected');
  // Hide the setup instructions once configured
  const setup = document.getElementById('educator-setup');
  if (setup) setup.style.display = 'none';
}

async function testSheetURL() {
  const url = localStorage.getItem(SHEETS_URL_KEY);
  const status = document.getElementById('sheets-status');
  if (!url) {
    if (status) { status.textContent = 'No URL saved yet. Paste one above and click Save.'; status.style.color = 'rgba(212,150,42,0.5)'; }
    return;
  }
  if (status) { status.textContent = 'Testing connection...'; status.style.color = 'rgba(212,150,42,0.5)'; }
  setSyncIndicator('testing');
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ping' }),
      mode: 'no-cors',
    });
    // no-cors means we can't read the response, but no throw = request reached the server
    if (status) { status.textContent = 'Ping sent. Check your spreadsheet for a new row in the Ping Log tab.'; status.style.color = 'rgba(80,180,100,0.8)'; }
    setSyncIndicator('connected');
  } catch(e) {
    if (status) { status.textContent = 'Connection error. Check the URL and try again.'; status.style.color = 'rgba(200,80,60,0.7)'; }
    setSyncIndicator('error');
  }
}

function setSyncIndicator(state) {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!dot || !label) return;
  const states = {
    connected: { bg: 'rgba(80,180,100,0.8)',  text: 'Ledger connected. Responses syncing.',       shadow: '0 0 6px rgba(80,180,100,0.5)' },
    testing:   { bg: 'rgba(212,150,42,0.6)',   text: 'Testing connection...',                       shadow: 'none' },
    error:     { bg: 'rgba(200,80,60,0.7)',    text: 'Connection failed. Check your URL.',          shadow: 'none' },
    none:      { bg: 'rgba(212,150,42,0.2)',   text: 'No ledger configured',                        shadow: 'none' },
  };
  const s = states[state] || states.none;
  dot.style.background = s.bg;
  dot.style.boxShadow = s.shadow;
  label.textContent = s.text;
  label.style.color = s.bg;
}

// ── ROLE RESTART ─────────────────────────────────────────────
function resetToRoleSelect() {
  // Soft reset: clear game state, return to role screen, no page reload
  S.role = null;
  S.room = 0;
  S.r0 = { annotationsSaved: false, hotspot1: false, hotspot2: false, hotspot3: false };
  S.r1 = { euphDone: false, _euphDnd: false, witnessOpen: false, claimSubmitted: false };
  S.r2 = { sourcesTagged: 0, limitationDone: false };
  S.r3 = { tracingDone: false, echoJudgment: null };
  S.r4 = { signalsRated: 0, totalSignals: 6, feedReflected: false };
  S.r5 = { escapeParts: 0, totalParts: 7, submitted: false };
  S.frustration = {};
  S.hasProgress = false;

  // Clear DnD and counter state
  Object.keys(_euphDndState).forEach(k => delete _euphDndState[k]);
  Object.keys(_r2Tagged).forEach(k => delete _r2Tagged[k]);
  Object.keys(_r4Rated).forEach(k => delete _r4Rated[k]);

  // Reset UI counters and zones
  const r2c = document.getElementById('r2-tagged-count'); if (r2c) r2c.textContent = '0';
  const r4c = document.getElementById('r4-rated-count');  if (r4c) r4c.textContent = '0';

  // Hide game area, show role screen
  document.getElementById('game-area').style.display = 'none';
  document.getElementById('role-screen').style.display = 'block';
  document.querySelectorAll('.role-card, .role-pass').forEach(c => c.classList.remove('selected'));
  setStickyProceed(null);

  // Scroll back to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  logEvent('role_reset', {});
}

// ── UTILITY ───────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// ── HINT SYSTEM ───────────────────────────────────────────────
function activateHint(id) {
  const btn = document.getElementById(id);
  if (btn) btn.classList.add('visible');
}

function showHint(id, text) {
  const el = document.getElementById(id + '-text');
  if (el) {
    el.innerHTML = text;
    el.style.display = 'block';
  }
  const btn = document.getElementById(id);
  if (btn) btn.classList.remove('visible');
}

const HINTS = {
  'hint-annot': 'Try reading one sentence at a time. Ask yourself: What is this sentence claiming? Who is making this claim?',
  'hint-euph': 'Look at each phrase and ask: what is actually happening here? What would a news reporter call this same event?',
  'hint-r1': 'Start with what you know for certain from the documents. Then say what still feels unclear or missing.',
  'hint-r2': 'Look at where each source got its information. Does any source have access to facts the others do not?',
  'hint-r3': 'Pick one source from the list and ask: where did this source get its information? Now ask that again for the next one.',
  'hint-r4': 'Set aside the numbers and labels. If you stripped away the ranking and share counts, would these sources feel different?',
};


function toggleBonus(id) {
  const zone = document.getElementById(id);
  if (!zone) return;
  const isOpen = zone.classList.toggle('open');
  const btn = zone.querySelector('.bonus-trigger');
  if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

// ── TROPHY & ARTIFACT SYSTEM ────────────────────────────────────────────────
//
// Each trophy has:
//   id        unique key
//   name      display name
//   artifact  the collectible item (visual icon + label)
//   trigger   'keyword' | 'action' | 'pattern'
//   keywords  array of phrase triggers (lowercase, partial match OK)
//   desc      flavor text shown in dialog
//   detail    why this matters / what it recognizes
//   rarity    'common' | 'uncommon' | 'rare' | 'legendary'
//
// Keyword matching runs on any textarea submit. Checks
// the submitted text (lowercased) for any keyword hit.
// Action triggers fire on specific game events.

const TROPHIES = [

  // ── HISTORICAL PRECISION TROPHIES ─────────────────────────────────────────
  {
    id: 'incarceration_precise',
    name: 'Precise Record',
    artifact: '📜',
    trigger: 'keyword',
    keywords: ['incarceration','incarcer','japanese american incarceration','executive order 9066',
                '9066','war relocation authority','wra','manzanar','tule lake','heart mountain',
                'poston','minidoka','topaz','gila river','internment camp'],
    desc: 'You named the historical event with precision.',
    detail: 'Using the specific, accurate terminology for what happened matters. "Japanese American incarceration" and "Executive Order 9066" are the terms that carry historical weight. Calling it "relocation" or leaving it unnamed is a curation decision too.',
    rarity: 'common',
  },
  {
    id: 'densho',
    name: 'Community Archive',
    artifact: '🗂️',
    trigger: 'keyword',
    keywords: ['densho','community archive','family archive','oral history','oral histories',
                'community-held','community held','testimonial','survivor testimony',
                'first-hand account','firsthand','eyewitness'],
    desc: 'You named community-held evidence as a distinct kind of source.',
    detail: 'Community archives, oral histories, and survivor testimony are not supplemental to the official record. They are a counter-archive that the official record was designed not to produce. Naming them by type shows you understand the difference between what institutions preserve and what communities hold.',
    rarity: 'uncommon',
  },
  {
    id: 'institutional_language',
    name: 'Language Auditor',
    artifact: '🔍',
    trigger: 'keyword',
    keywords: ['euphemism','institutional language','sanitized','sanitize','bureaucratic',
                'administrative language','framing','reframe','rhetorical','rhetoric',
                'laundering','softened','softening','passive voice'],
    desc: 'You named the mechanism by which official language does its work.',
    detail: 'Calling something "administrative relocation" rather than incarceration is not a neutral choice. It is a curation decision embedded in grammar. Identifying that mechanism by name is archival analysis, not just reading comprehension.',
    rarity: 'uncommon',
  },
  {
    id: 'curation_named',
    name: 'The Curation Question',
    artifact: '✂️',
    trigger: 'keyword',
    keywords: ['who chose','who decided','who selected','who curated','curation decision',
                'curatorial','assembled by','put together by','selection criteria',
                'what was left out','left out','excluded','omitted','omission'],
    desc: 'You named the curation decision, not just the content.',
    detail: 'Moving from "what is in this source" to "who decided to include this source" is the shift this entire game is built around. You made that move on your own.',
    rarity: 'rare',
  },
  {
    id: 'echo_chamber',
    name: 'Echo Tracer',
    artifact: '🔗',
    trigger: 'keyword',
    keywords: ['echo','echo chamber','circular citation','citing itself','same source',
                'traces back','original source','primary source repeated','laundered',
                'citation laundering','one source','single origin','manufactured consensus',
                'appear independent','appearance of consensus'],
    desc: 'You named the mechanism that makes one source look like many.',
    detail: 'Echo corroboration is how a single claim achieves the appearance of consensus without the substance of it. Naming it is the difference between reading a citation and reading what the citation is doing.',
    rarity: 'rare',
  },
  {
    id: 'algorithm_critique',
    name: 'Signal Reader',
    artifact: '📡',
    trigger: 'keyword',
    keywords: ['engagement signal','ranking','algorithm','algorithmic','ranked','viral',
                'trending','shares','clicks','visibility','platform logic','seo',
                'search engine','sponsored','paid placement','platform bias',
                'what gets surfaced','what rises','what is amplified'],
    desc: 'You named what is actually doing the ranking.',
    detail: 'Identifying the difference between "this ranked first because it is authoritative" and "this ranked first because the platform logic rewarded engagement" is civic media literacy at its most precise.',
    rarity: 'uncommon',
  },
  {
    id: 'limitation_honest',
    name: 'Honest Limit',
    artifact: '⚖️',
    trigger: 'keyword',
    keywords: ['cannot know','we cannot know','cannot be determined','insufficient evidence',
                'incomplete record','gaps in the record','this record cannot tell','this archive',
                'limited by','constrained by','beyond the scope','what is unknowable',
                'what we cannot claim','what remains uncertain'],
    desc: 'You named what cannot be known, not just what can.',
    detail: 'Stating a limitation is not a failure of historical thinking. It is one of its hardest forms. Knowing what a record cannot tell you is a different skill than knowing what it does tell you, and it is the one most often missing from standard history instruction.',
    rarity: 'rare',
  },
  {
    id: 'power_named',
    name: 'Power Auditor',
    artifact: '🏛️',
    trigger: 'keyword',
    keywords: ['power','who benefits','who is protected','institutional interest',
                'political interest','preserves power','suppression','silenced',
                'who had access','control the narrative','narrative control',
                'protect the institution','institutional protection'],
    desc: 'You named whose interests the record serves.',
    detail: 'Archives are not neutral. They are products of decisions made by people and institutions with interests. Asking "who benefits from this record looking the way it does" is the question that connects historical analysis to civic agency.',
    rarity: 'rare',
  },
  {
    id: 'ai_critique',
    name: 'Summary Skeptic',
    artifact: '🤖',
    trigger: 'keyword',
    keywords: ['ai summary','ai-generated','generated summary','synthetic','hallucination',
                'smooths over','flattens','synthesized','coherent but','plausible but',
                'sounds authoritative','confident and wrong','confident without evidence',
                'what the summary erases','what it hides'],
    desc: 'You named what the AI summary does rather than what it says.',
    detail: 'The most dangerous thing about a well-written AI summary is that it sounds authoritative. Identifying the mechanism by which smoothness substitutes for accuracy is the critical move this room is designed to require.',
    rarity: 'uncommon',
  },

  // ── ARGUMENTATION QUALITY TROPHIES ────────────────────────────────────────
  {
    id: 'claim_evidence',
    name: 'Evidence-Backed',
    artifact: '📌',
    trigger: 'keyword',
    keywords: ['because','evidence suggests','the record shows','document states',
                'according to','the source says','this indicates','this demonstrates',
                'this reveals','we can see from','the testimony shows'],
    desc: 'You backed your claim with evidence rather than assertion.',
    detail: 'Connecting a claim to specific evidence is the move that separates analysis from opinion. You did not just say what you think. You showed why.',
    rarity: 'common',
  },
  {
    id: 'counterargument',
    name: 'Counter-Thinker',
    artifact: '🔄',
    trigger: 'keyword',
    keywords: ['however','on the other hand','but this also','while this suggests',
                'although','even so','complicates','but we should also consider',
                'another reading','a different interpretation','one could argue',
                'this could also mean','alternatively'],
    desc: 'You introduced a complication or counter-reading.',
    detail: 'Raising a counter-argument is not hedging. It is showing that you can hold two interpretive possibilities at once and reason between them. That is harder than picking a side.',
    rarity: 'uncommon',
  },
  {
    id: 'precise_language',
    name: 'Precision Mark',
    artifact: '🎯',
    trigger: 'keyword',
    keywords: ['specifically','in particular','more precisely','to be precise',
                'the distinction is','the difference between','not the same as',
                'rather than','as opposed to','distinguishes','nuance','distinction'],
    desc: 'You used language that marks a distinction rather than glossing over one.',
    detail: 'Precision in historical argumentation is not pedantry. It is the difference between a claim that can be evaluated and one that can only be agreed with or not.',
    rarity: 'uncommon',
  },
  {
    id: 'civic_stakes',
    name: 'Civic Frame',
    artifact: '🗳️',
    trigger: 'keyword',
    keywords: ['civic','democracy','public record','public trust','accountability',
                'informed citizen','media literacy','digital literacy','critical literacy',
                'collective memory','historical memory','what citizens need',
                'public knowledge','civic responsibility'],
    desc: 'You connected the historical analysis to civic stakes.',
    detail: 'Naming why this matters for how people participate in public life is the move that makes historical thinking a civic skill rather than an academic exercise.',
    rarity: 'rare',
  },

  // ── ACTION TROPHIES (fired from game events, not keywords) ─────────────────
  {
    id: 'all_hotspots',
    name: 'Close Reader',
    artifact: '🧐',
    trigger: 'action',
    event: 'prologue_complete',
    desc: 'You examined all three phrases in the exhibit brief.',
    detail: 'Most readers skim the opening language and move to the evidence. You stopped and read the frame. That is where the argument lives.',
    rarity: 'common',
  },
  {
    id: 'all_bonuses',
    name: 'Archivist',
    artifact: '🏛️',
    trigger: 'action',
    event: 'all_bonuses_claimed',
    desc: 'You completed every optional challenge.',
    detail: 'The optional challenges are not extra credit. They are the harder version of the same questions. Completing all of them means you stayed with the material past the point where most people stop.',
    rarity: 'legendary',
  },
  {
    id: 'frustration_persisted',
    name: 'Stayed With It',
    artifact: '🔥',
    trigger: 'action',
    event: 'frustration_persist',
    desc: 'You kept going after the game recognized your frustration.',
    detail: 'The record is designed to be hard to read. That is the point. Staying in that difficulty rather than moving around it is one of the things this game is actually measuring.',
    rarity: 'uncommon',
  },
  {
    id: 'full_protocol',
    name: 'Escape Protocol',
    artifact: '🔓',
    trigger: 'action',
    event: 'escape_protocol_complete',
    desc: 'You completed all seven fields of the escape protocol.',
    detail: 'The seven fields together are one of the harder written tasks in standard secondary history education. You produced a historical claim, a curation claim, a limitation claim, and a version you would stand behind. That is the full arc.',
    rarity: 'legendary',
  },
];

// ── TROPHY STATE ──────────────────────────────────────────────────────────────
const earnedTrophies = new Set();
const trophyMap = {};
TROPHIES.forEach(t => { trophyMap[t.id] = t; });

function getRarityColor(r) {
  return { common: '#7aab85', uncommon: '#5b9bbf', rare: '#a07ad4', legendary: '#d4ad3a' }[r] || '#888';
}
function getRarityLabel(r) {
  return { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' }[r] || r;
}

// ── SHOW TROPHY DIALOG ────────────────────────────────────────────────────────
function showTrophyDialog(trophy) {
  if (earnedTrophies.has(trophy.id)) return;
  earnedTrophies.add(trophy.id);
  if (typeof logEvent === 'function') logEvent('trophy_earned', { id: trophy.id, rarity: trophy.rarity });
  scoreTrophy(trophy.rarity);
  updateTrophyShelf();

  const overlay = document.getElementById('trophy-dialog-overlay');
  const box = document.getElementById('trophy-dialog-box');
  if (!overlay || !box) return;

  const rc = getRarityColor(trophy.rarity);
  const rl = getRarityLabel(trophy.rarity);

  box.innerHTML = `
    <div class="trophy-dialog-inner" style="border-top-color:${rc};">
      <button class="trophy-dialog-close" onclick="closeTrophyDialog()" aria-label="Close">&#10005;</button>
      <div class="trophy-artifact">${trophy.artifact}</div>
      <div class="trophy-rarity-badge" style="color:${rc};border-color:${rc};">${rl}</div>
      <h3 class="trophy-name">${trophy.name}</h3>
      <p class="trophy-desc">"${trophy.desc}"</p>
      <p class="trophy-detail">${trophy.detail}</p>
      <div class="trophy-dialog-footer">
        <span class="trophy-count">Collection: ${earnedTrophies.size} / ${TROPHIES.length}</span>
        <button class="btn btn-ghost trophy-ok-btn" onclick="closeTrophyDialog()">Add to collection</button>
      </div>
    </div>`;

  overlay.classList.add('open');

  // Auto-close after 8 seconds if no interaction
  clearTimeout(window._trophyTimer);
  window._trophyTimer = setTimeout(() => closeTrophyDialog(), 8000);
}

function closeTrophyDialog() {
  clearTimeout(window._trophyTimer);
  const overlay = document.getElementById('trophy-dialog-overlay');
  if (overlay) overlay.classList.remove('open');
}

// ── KEYWORD SCANNER ───────────────────────────────────────────────────────────
// Call this whenever a textarea is submitted
function scanForTrophies(text) {
  if (!text || text.length < 15) return;
  const lower = text.toLowerCase();
  const candidates = TROPHIES.filter(t =>
    t.trigger === 'keyword' &&
    !earnedTrophies.has(t.id) &&
    t.keywords.some(kw => lower.includes(kw))
  );
  if (candidates.length === 0) return;
  // Award highest rarity first, queue the rest with delay
  const order = ['legendary','rare','uncommon','common'];
  candidates.sort((a,b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
  candidates.forEach((t, i) => {
    setTimeout(() => showTrophyDialog(t), i * 600);
  });
}

// ── ACTION TRIGGER ────────────────────────────────────────────────────────────
function triggerTrophyEvent(eventName) {
  const candidates = TROPHIES.filter(t =>
    t.trigger === 'action' &&
    t.event === eventName &&
    !earnedTrophies.has(t.id)
  );
  candidates.forEach((t, i) => {
    setTimeout(() => showTrophyDialog(t), i * 600);
  });
}

// ── TROPHY SHELF ──────────────────────────────────────────────────────────────
function updateTrophyShelf() {
  const shelf = document.getElementById('trophy-shelf-items');
  if (!shelf) return;
  const shelfCount = document.getElementById('trophy-shelf-count');
  if (shelfCount) shelfCount.textContent = earnedTrophies.size + ' / ' + TROPHIES.length;

  shelf.innerHTML = '';
  earnedTrophies.forEach(id => {
    const t = trophyMap[id];
    if (!t) return;
    const rc = getRarityColor(t.rarity);
    const div = document.createElement('div');
    div.className = 'trophy-shelf-item';
    div.title = t.name + ' - ' + getRarityLabel(t.rarity);
    div.style.borderColor = rc + '66';
    div.innerHTML = `<span class="trophy-shelf-icon">${t.artifact}</span><span class="trophy-shelf-label" style="color:${rc};">${t.name}</span>`;
    div.onclick = () => showTrophyDialog(t);
    shelf.appendChild(div);
  });

  // Empty state
  if (earnedTrophies.size === 0) {
    shelf.innerHTML = '<p class="trophy-shelf-empty">No artifacts collected yet. Engage with the record.</p>';
  }
}


function pulseTrophyTab() {
  const tab = document.querySelector('.trophy-shelf-tab');
  if (tab) {
    tab.classList.remove('has-new');
    void tab.offsetWidth;
    tab.classList.add('has-new');
  }
}

// ── PATCH EXISTING SUBMIT FUNCTIONS ──────────────────────────────────────────
// Wrap all textarea submissions to scan for trophies
const _origSaveAnnotations = typeof saveAnnotations !== 'undefined' ? saveAnnotations : null;
// We patch via event delegation on submit buttons instead
document.addEventListener('click', function(e) {
  // Any submit/record/save button click: scan nearby textareas
  const btn = e.target.closest('button');
  if (!btn) return;
  const txt = btn.textContent.toLowerCase();
  if (txt.includes('record') || txt.includes('save') || txt.includes('submit') ||
      txt.includes('trace') || txt.includes('reflection') || txt.includes('protocol') ||
      txt.includes('analysis') || txt.includes('judgment') || txt.includes('signal')) {
    // Collect all visible game-textarea values
    const all = Array.from(document.querySelectorAll('.game-textarea'))
      .map(t => t.value).join(' ');
    scanForTrophies(all);
  }
});

// ── CHECK ALL-BONUSES TROPHY ──────────────────────────────────────────────────
function checkAllBonuses() {
  const bonusBadges = document.querySelectorAll('.bonus-badge.earned');
  if (bonusBadges.length >= 5) {
    triggerTrophyEvent('all_bonuses_claimed');
  }
}

// Patch claimBonusBadge to also check all-bonuses
const _origClaimBonusBadge = claimBonusBadge;
// Override
window.claimBonusBadge = function(btn, badgeId) {
  _origClaimBonusBadge(btn, badgeId);
  checkAllBonuses();
};

// ── PATCH ACTION EVENTS ───────────────────────────────────────────────────────
// We monitor logEvent for action triggers
const _origLogEvent = logEvent;
window.logEvent = function(type, detail) {
  _origLogEvent(type, detail);
  triggerTrophyEvent(type);
  // Frustration persist: if user submits after frustration banner shown
  if (type === 'annotations_saved' || type === 'echo_judgment' ||
      type === 'feed_reflected' || type === 'escape_protocol_complete') {
    const frust = document.querySelectorAll('.frustration-banner:not([hidden])');
    if (frust.length > 0) triggerTrophyEvent('frustration_persist');
  }
};

