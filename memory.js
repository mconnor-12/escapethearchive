/* ══════════════════════════════════════════════════════════════
   ESCAPE THE ARCHIVE — memory.js
   Full game logic: state, rooms, roles, analytics, DnD, feeds
   ══════════════════════════════════════════════════════════════ */

'use strict';

// ── GAME STATE ─────────────────────────────────────────────────
const S = {
  role: null,
  room: 0,   // 0=prologue, 1-5=rooms
  r0: { annotationsSaved: false, hotspot1: false, hotspot2: false, hotspot3: false },
  r1: { euphDone: false, _euphDnd: false, witnessOpen: false, claimSubmitted: false },
  r2: { sourcesTagged: 0, limitationDone: false },
  r3: { tracingDone: false, echoJudgment: null },
  r4: { signalsRated: 0, totalSignals: 6, feedReflected: false },
  r5: { escapeParts: 0, totalParts: 7, submitted: false },
  frustration: { r1: false, r2: false, r3: false, r4: false },
  analytics: { events: [] },
  startTime: null,
};

// ── ANALYTICS ──────────────────────────────────────────────────
const SHEETS_URL_KEY = 'sheetsUrl';

function logEvent(type, detail) {
  const ev = { ts: Date.now(), role: S.role, room: S.room, type, detail };
  S.analytics.events.push(ev);
  postToSheets(ev);
}

async function postToSheets(payload) {
  const url = localStorage.getItem(SHEETS_URL_KEY);
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gameEvent', ...payload }),
      mode: 'no-cors'
    });
  } catch (e) { /* silent */ }
}

function showToast(msg, dur = 2200) {
  const t = document.getElementById('ledger-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ── STARTUP ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Animate loading bar then show role screen
  const bar = document.getElementById('loading-bar');
  let w = 0;
  const iv = setInterval(() => {
    w += Math.random() * 18 + 4;
    if (w >= 100) { w = 100; clearInterval(iv); }
    if (bar) bar.style.width = w + '%';
    if (w >= 100) {
      setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        const rs = document.getElementById('role-screen');
        if (ls) ls.style.display = 'none';
        if (rs) rs.style.display = 'block';
      }, 350);
    }
  }, 80);

  // Wire DnD
  initDnD();
  // Wire hotspots
  initHotspots();
});

// ── ROLE SELECTION ─────────────────────────────────────────────
function selectRole(role, el) {
  S.role = role;
  S.startTime = Date.now();
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');

  setTimeout(() => {
    document.getElementById('role-screen').style.display = 'none';
    document.getElementById('game-area').style.display = 'block';
    goToRoom(0);
    logEvent('role_selected', { role });
  }, 400);
}

// ── ROOM NAVIGATION ────────────────────────────────────────────
function goToRoom(n) {
  S.room = n;
  // Hide all panels
  document.querySelectorAll('.room-panel').forEach(p => p.classList.remove('visible'));
  const panel = document.getElementById('room-' + n);
  if (panel) { panel.classList.add('visible'); panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  // Update header
  const labels = ['Prologue — The Intake Desk', 'Room I — Curated Scarcity', 'Room II — Broadcast Saturation', 'Room III — Echo Corroboration', 'Room IV — Feed Overload', 'Room V — Smooth Synthetic Coherence'];
  const rl = document.getElementById('room-label');
  const rt = document.getElementById('room-title');
  if (rl) rl.textContent = 'Room ' + n;
  if (rt) rt.textContent = labels[n] || '';

  // Update progress dots
  document.querySelectorAll('.prog-dot').forEach((d, i) => {
    d.classList.toggle('done',   i < n);
    d.classList.toggle('active', i === n);
  });

  // Role-specific adjustments
  applyRoleView();
  logEvent('room_enter', { room: n });
}

function applyRoleView() {
  // Show/hide role-gated elements
  document.querySelectorAll('[data-roles]').forEach(el => {
    const roles = el.dataset.roles.split(',').map(r => r.trim());
    el.style.display = (!S.role || roles.includes(S.role)) ? '' : 'none';
  });
}

// ── PROLOGUE (Room 0) ──────────────────────────────────────────
function saveAnnotations() {
  const a1 = document.getElementById('annot-1')?.value.trim();
  const a2 = document.getElementById('annot-2')?.value.trim();
  const a3 = document.getElementById('annot-3')?.value.trim();
  if (!a1 || !a2 || !a3) {
    showFeedback('fb-annot', 'warn', 'Complete all three annotation prompts before saving.');
    return;
  }
  S.r0.annotationsSaved = true;
  document.getElementById('annot-save-btn')?.setAttribute('disabled', true);
  showFeedback('fb-annot', 'ok', '✓ Annotations saved. Examine the document hotspots below to continue.');
  document.getElementById('hotspot-zone')?.removeAttribute('hidden');
  logEvent('annotations_saved', { r0: true });
  checkPrologueUnlock();
}

function initHotspots() {
  document.querySelectorAll('.hotspot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.hotspot;
      const reveal = document.getElementById('hotspot-reveal-' + key);
      if (reveal) {
        reveal.hidden = !reveal.hidden;
        S.r0['hotspot' + key] = true;
        btn.classList.add('visited');
        logEvent('hotspot_clicked', { key });
        checkPrologueUnlock();
      }
    });
  });
}

function checkPrologueUnlock() {
  if (S.r0.annotationsSaved && S.r0.hotspot1 && S.r0.hotspot2 && S.r0.hotspot3) {
    document.getElementById('prologue-proceed')?.removeAttribute('hidden');
    showToast('✓ Prologue complete — proceed to Room I');
  }
}

// ── ROOM I — CURATED SCARCITY ──────────────────────────────────
// Euphemism Decoder (Drag & Drop)
const EUPH_ANSWERS = {
  'euph-a': 'systematic destruction',
  'euph-b': 'forced removal',
  'euph-c': 'administrative delay',
};
let _euphDndState = {};

function initDnD() {
  document.querySelectorAll('.dnd-chip').forEach(chip => {
    chip.setAttribute('draggable', true);
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', chip.dataset.value);
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  });

  document.querySelectorAll('.dnd-zone').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('over');
      const val = e.dataTransfer.getData('text/plain');
      const zoneKey = zone.dataset.zone;
      zone.dataset.filled = val;
      zone.textContent = val;
      _euphDndState[zoneKey] = val;
      checkAllEuph();
    });
  });
}

function checkAllEuph() {
  let allCorrect = true;
  Object.entries(EUPH_ANSWERS).forEach(([k, ans]) => {
    if (_euphDndState[k] !== ans) allCorrect = false;
  });
  if (allCorrect) {
    S.r1.euphDone = true;
    S.r1._euphDnd = true;
    document.querySelectorAll('.dnd-zone').forEach(z => z.classList.add('ready'));
    document.getElementById('euph-drawer-btn')?.removeAttribute('hidden');
    showFeedback('fb-euph', 'ok', '✓ Decoder complete. The witness testimony is now accessible.');
    logEvent('euph_decoded', { method: 'dnd' });
  }
}

// Dropdown fallback
function checkEuph() {
  const a = document.getElementById('euph-sel-a')?.value;
  const b = document.getElementById('euph-sel-b')?.value;
  const c = document.getElementById('euph-sel-c')?.value;
  if (a === 'systematic destruction' && b === 'forced removal' && c === 'administrative delay') {
    S.r1.euphDone = true;
    document.getElementById('euph-drawer-btn')?.removeAttribute('hidden');
    showFeedback('fb-euph', 'ok', '✓ Correct — testimony unlocked.');
    logEvent('euph_decoded', { method: 'select' });
  } else {
    showFeedback('fb-euph', 'warn', 'Not quite. Re-examine the language used in the official record.');
  }
}

function unlockWitness() {
  if (!S.r1.euphDone && !S.r1._euphDnd) {
    showFeedback('fb-euph', 'warn', 'Complete the euphemism decoder first.');
    return;
  }
  const drawer = document.getElementById('witness-drawer');
  if (!drawer) return;
  S.r1.witnessOpen = true;
  drawer.classList.toggle('open');
  logEvent('witness_drawer', { open: drawer.classList.contains('open') });
}

function submitLeadJudgment() {
  const judgment = document.getElementById('lead-judgment')?.value.trim();
  if (!judgment || judgment.length < 20) {
    showFeedback('fb-r1', 'warn', 'Your judgment must be substantive — at least a sentence.');
    return;
  }
  S.r1.claimSubmitted = true;
  showFeedback('fb-r1', 'ok', '✓ Judgment recorded in the archive ledger.');
  document.getElementById('r1-proceed')?.removeAttribute('hidden');
  logEvent('lead_judgment', { length: judgment.length });
  checkFrustration(1);
}

function buildLimitationClaimScaffold() {
  const claim = document.getElementById('limitation-claim')?.value.trim();
  if (!claim || claim.length < 15) {
    showFeedback('fb-r1-lim', 'warn', 'State your limitation claim clearly.');
    return;
  }
  showFeedback('fb-r1-lim', 'ok', '✓ Limitation claim built.');
  logEvent('limitation_claim', { room: 1 });
}

// ── ROOM II — BROADCAST SATURATION ────────────────────────────
function tagSource(el, sourceId, trust) {
  el.closest('.signal-item')?.querySelectorAll('.sig-btn').forEach(b => b.classList.remove('earned', 'unearned'));
  el.classList.add(trust === 'earned' ? 'earned' : 'unearned');
  S.r2.sourcesTagged++;
  logEvent('source_tagged', { source: sourceId, trust, room: 2 });
  if (S.r2.sourcesTagged >= 5) {
    document.getElementById('r2-limitation-zone')?.removeAttribute('hidden');
  }
}

function submitLimitation() {
  const lim = document.getElementById('r2-limitation')?.value.trim();
  if (!lim || lim.length < 15) {
    showFeedback('fb-r2', 'warn', 'Articulate the limitation more fully.');
    return;
  }
  S.r2.limitationDone = true;
  showFeedback('fb-r2', 'ok', '✓ Saturation analysis complete.');
  document.getElementById('r2-proceed')?.removeAttribute('hidden');
  logEvent('saturation_limitation', { length: lim.length });
  checkFrustration(2);
}

// ── ROOM III — ECHO CORROBORATION ─────────────────────────────
function submitEchoTrace() {
  const trace = document.getElementById('r3-trace')?.value.trim();
  if (!trace || trace.length < 15) {
    showFeedback('fb-r3', 'warn', 'Trace the citation path before judging.');
    return;
  }
  S.r3.tracingDone = true;
  document.getElementById('r3-judgment-zone')?.removeAttribute('hidden');
  showFeedback('fb-r3', 'ok', '✓ Citation trace recorded.');
  logEvent('echo_trace', { length: trace.length });
}

function submitLeadJudgmentR3(judgment) {
  S.r3.echoJudgment = judgment;
  showFeedback('fb-r3-j', 'ok', `✓ Corroboration verdict: <strong>${judgment}</strong>`);
  document.getElementById('r3-proceed')?.removeAttribute('hidden');
  logEvent('echo_judgment', { judgment });
  checkFrustration(3);
}

// ── ROOM IV — FEED OVERLOAD ────────────────────────────────────
let _signalsRated = 0;

function rateSignal(el, sigId, verdict) {
  el.closest('.signal-item')?.querySelectorAll('.sig-btn').forEach(b => b.classList.remove('earned', 'unearned'));
  el.classList.add(verdict);
  _signalsRated++;
  S.r4.signalsRated = _signalsRated;
  document.getElementById('r4-rated-count').textContent = _signalsRated;
  logEvent('signal_rated', { sig: sigId, verdict });
  if (_signalsRated >= S.r4.totalSignals) {
    document.getElementById('r4-reflect-zone')?.removeAttribute('hidden');
  }
}

function submitFeedReflection() {
  const ref = document.getElementById('r4-reflect')?.value.trim();
  if (!ref || ref.length < 20) {
    showFeedback('fb-r4', 'warn', 'Reflect more fully on how ranking shaped your judgment.');
    return;
  }
  S.r4.feedReflected = true;
  showFeedback('fb-r4', 'ok', '✓ Feed analysis recorded.');
  document.getElementById('r4-proceed')?.removeAttribute('hidden');
  logEvent('feed_reflected', { length: ref.length });
  checkFrustration(4);
}

// ── ROOM V — ESCAPE PROTOCOL ────────────────────────────────────
const ESCAPE_FIELDS = ['historical-claim','curation-claim','limitation-claim-v','saturation-note','handoff-decision','remnant-statement','exhibit-description'];

function checkEscapeProgress() {
  let filled = 0;
  ESCAPE_FIELDS.forEach(f => {
    const el = document.getElementById(f);
    if (el && el.value.trim().length >= 10) filled++;
  });
  S.r5.escapeParts = filled;
  document.getElementById('escape-progress').textContent = filled + ' / ' + ESCAPE_FIELDS.length;
  if (filled >= ESCAPE_FIELDS.length) {
    document.getElementById('escape-submit-btn')?.removeAttribute('hidden');
  }
}

function submitEscapeProtocol() {
  const allFilled = ESCAPE_FIELDS.every(f => {
    const el = document.getElementById(f);
    return el && el.value.trim().length >= 10;
  });
  if (!allFilled) {
    showFeedback('fb-r5', 'warn', 'Complete all seven protocol fields before submitting.');
    return;
  }
  S.r5.submitted = true;

  // Build final exhibit text
  const exhibit = document.getElementById('exhibit-description')?.value || '';
  document.getElementById('final-exhibit-text').textContent = exhibit;
  document.getElementById('escape-complete')?.removeAttribute('hidden');

  const elapsed = Math.round((Date.now() - S.startTime) / 60000);
  logEvent('escape_protocol_complete', { elapsed_min: elapsed, role: S.role });
  showToast('🔓 Archive escape complete');
}

function recoverFrustrationDocument(room) {
  showFeedback('fb-r' + room + '-frust', 'info', '↩ Recovery mode: take a breath. The archive hasn\'t changed — your analysis has. Return to the documents with fresh eyes.');
  logEvent('frustration_recovery', { room });
}

// ── FRUSTRATION DETECTION ──────────────────────────────────────
const _submitTimes = {};

function checkFrustration(room) {
  const now = Date.now();
  const key = 'r' + room;
  if (_submitTimes[key] && (now - _submitTimes[key]) < 25000) {
    S.frustration[key] = true;
    const banner = document.getElementById('frust-banner-' + room);
    if (banner) { banner.classList.add('visible'); }
    logEvent('frustration_detected', { room });
    showFRUST_RECOG_FEEDBACK(room);
  }
  _submitTimes[key] = now;
}

function showFRUST_RECOG_FEEDBACK(room) {
  const el = document.getElementById('frust-recog-' + room);
  if (el) { el.style.display = 'block'; }
}

// demonstrates-inertness: rooms don't reset on frustration, they hold state
function R5_FRUST_RECOVER() { recoverFrustrationDocument(5); }
function R5_FRUST_RECOGNITION() { checkFrustration(5); }

// ── FEEDBACK HELPER ────────────────────────────────────────────
function showFeedback(id, type, html) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'feedback-msg visible feedback-' + type;
  el.innerHTML = html;
}

// ── PHOTO CLAIMS (Room II / Analyst role) ─────────────────────
function submitPhotoClaims() {
  S.r1.euphDone = S.r1.euphDone || S.r1._euphDnd;
  const claims = document.getElementById('photo-claims')?.value.trim();
  if (!claims || claims.length < 15) {
    showFeedback('fb-photo', 'warn', 'Submit at least one substantive claim.');
    return;
  }
  showFeedback('fb-photo', 'ok', '✓ Photo analysis recorded.');
  logEvent('photo_claims', { length: claims.length });
}

// ── HOTSPOT RESCUE ─────────────────────────────────────────────
function showHotspotRescue(key) {
  const zone = document.getElementById('hotspot-rescue-' + key);
  if (zone) { zone.hidden = false; }
}

// ── UTILITIES ─────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

// Non-blocking startGame wrapper
function startGame(role) {
  setTimeout(() => selectRole(role, null), 0);
}

// Timer (non-blocking via _withTimeout)
function _withTimeout(fn, delay) {
  return setTimeout(fn, delay);
}
