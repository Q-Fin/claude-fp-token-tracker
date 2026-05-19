/**
 * popup.js — runs in the popup page context.
 *
 * Reads:
 *   chrome.storage.session['ctt_tabs']  → per-tab TokenState
 *   chrome.storage.session['ctt_drift'] → global DriftState
 *
 * Renders the gauge ring, bar, stats, and (if present) the drift
 * warning banner. Wires up the Dismiss and Reset buttons.
 */

'use strict';

const CONTEXT_WINDOW = 200_000;
const CIRC           = 2 * Math.PI * 36;   // r=36 → ≈ 226.2px
const KEY_TABS       = 'ctt_tabs';
const KEY_DRIFT      = 'ctt_drift';

// ── DOM refs ────────────────────────────────────────────────────────────────
const elDriftBanner   = document.getElementById('drift-banner');
const elDriftEvent    = document.getElementById('drift-event');
const elDriftField    = document.getElementById('drift-field');
const elDriftExpected = document.getElementById('drift-expected');
const elDriftReceived = document.getElementById('drift-received');
const elDriftDismiss  = document.getElementById('drift-dismiss');

const elHdrSchema  = document.getElementById('hdr-schema');
const elData       = document.getElementById('state-data');
const elEmpty      = document.getElementById('state-empty');
const elArc        = document.getElementById('gauge-arc');
const elPct        = document.getElementById('gauge-pct');
const elIn         = document.getElementById('stat-in');
const elOut        = document.getElementById('stat-out');
const elTotal      = document.getElementById('stat-total');
const elBarFill    = document.getElementById('bar-fill');
const elBarUsed    = document.getElementById('bar-used');
const elBarFree    = document.getElementById('bar-free');
const elUpdated    = document.getElementById('updated-time');
const elReset      = document.getElementById('btn-reset');

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) {
  return n.toLocaleString('en-US').replace(/,/g, '\u202f');   // thin-space thousands
}

function accentForPct(pct, hasDrift) {
  if (hasDrift) return '#c99540';   // amber — values are suspect
  if (pct >= 85) return '#d95f5f';
  if (pct >= 60) return '#c99540';
  return '#4aab84';
}

function relativeTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s <  5)  return 'just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

// ── Drift banner ─────────────────────────────────────────────────────────────

function renderDrift(drift) {
  if (!drift || drift.dismissed) {
    elDriftBanner.style.display = 'none';
    return;
  }

  elDriftBanner.style.display = '';
  elDriftEvent.textContent    = drift.eventType  ?? '—';
  elDriftField.textContent    = drift.field       ?? '—';
  elDriftExpected.textContent = drift.expected    ?? '—';
  elDriftReceived.textContent = drift.received    ?? '—';
}

// ── Token gauge ───────────────────────────────────────────────────────────────

function renderTokens(state) {
  if (!state) {
    elData.style.display  = 'none';
    elEmpty.style.display = '';
    elUpdated.textContent = '';
    return;
  }

  elData.style.display  = '';
  elEmpty.style.display = 'none';

  const { inputTokens, outputTokens, total, pct, hasDrift, schemaVersion, updatedAt } = state;
  const accent = accentForPct(pct, hasDrift);
  const fill   = CIRC * (pct / 100);

  // Schema version label in header
  elHdrSchema.textContent = schemaVersion != null ? `schema v${schemaVersion}` : 'schema v—';

  // Ring
  elArc.setAttribute('stroke-dasharray', `${fill.toFixed(1)} ${CIRC.toFixed(1)}`);
  elArc.setAttribute('stroke', accent);
  elPct.textContent = `${pct}%`;
  elPct.setAttribute('fill', accent);

  // Stats
  elIn.textContent    = fmt(inputTokens)  + ' tk';
  elOut.textContent   = fmt(outputTokens) + ' tk';
  elTotal.textContent = fmt(total)        + ' tk';
  elIn.style.color    = accent;

  // Bar
  elBarFill.style.width      = `${pct}%`;
  elBarFill.style.background = accent;
  elBarUsed.textContent      = `${fmt(total)} used`;
  elBarFree.textContent      = `${fmt(Math.max(0, CONTEXT_WINDOW - total))} free`;

  // Timestamp
  elUpdated.textContent = relativeTime(updatedAt);
}

// ── Load ─────────────────────────────────────────────────────────────────────

async function loadAndRender() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id ?? null;

  const data = await chrome.storage.session.get([KEY_TABS, KEY_DRIFT]);
  const tabs  = data[KEY_TABS]  ?? {};
  const drift = data[KEY_DRIFT] ?? null;

  renderDrift(drift);
  renderTokens(tabId != null ? (tabs[tabId] ?? null) : null);

  // Expose tabId for Reset
  elReset._tabId = tabId;
}

// ── Dismiss drift ─────────────────────────────────────────────────────────────

elDriftDismiss.addEventListener('click', async () => {
  const data  = await chrome.storage.session.get(KEY_DRIFT);
  const drift = data[KEY_DRIFT];
  if (!drift) return;

  drift.dismissed = true;
  await chrome.storage.session.set({ [KEY_DRIFT]: drift });

  elDriftBanner.style.display = 'none';
});

// ── Reset tab token data ──────────────────────────────────────────────────────

elReset.addEventListener('click', async () => {
  const tabId = elReset._tabId;
  if (tabId == null) return;

  const data = await chrome.storage.session.get(KEY_TABS);
  const all  = data[KEY_TABS] ?? {};
  delete all[tabId];
  await chrome.storage.session.set({ [KEY_TABS]: all });

  await chrome.action.setBadgeText({ text: '', tabId });

  renderTokens(null);
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadAndRender();
