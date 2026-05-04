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
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gameEvent', ...payload }),
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
  // Seed the default Sheets URL if none saved yet
  if (!localStorage.getItem(SHEETS_URL_KEY)) {
    localStorage.setItem(SHEETS_URL_KEY, SHEETS_URL_DEFAULT);
  }
  const saved = localStorage.getItem(SHEETS_URL_KEY) || SHEETS_URL_DEFAULT;
  const inp = document.getElementById('sheets-url-input');
  if (inp) {
    inp.value = saved;
    setSyncIndicator('connected');
    const setup = document.getElementById('educator-setup');
    if (setup) setup.style.display = 'none';
  }

  // Loading bar runs after beginGame() — see startLoadingBar()

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

// ── LOADING BAR ───────────────────────────────────────────────
function startLoadingBar() {
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
}

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
  el.classList.add(trust);
  el.setAttribute('aria-pressed', 'true');

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

function startLoadingBar() {
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
}
