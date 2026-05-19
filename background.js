/**
 * background.js — MV3 service worker.
 *
 * Browser compatibility: uses the `api` shim. On Firefox 128+, MV3
 * service workers are fully supported. chrome.storage.session is
 * available on Firefox 115+, covered by our strict_min_version of 128.
 *
 * Handles two message types:
 *
 *   CTT_UPDATE — normal token report after a successful stream parse.
 *     Stores TokenState keyed by tabId in chrome.storage.session under
 *     'ctt_tabs'. Updates the toolbar badge with the fill percentage.
 *     If hasDrift=true, also records drift state.
 *
 *   CTT_DRIFT — schema validation failed for at least one SSE event.
 *     Stores DriftState in 'ctt_drift' (session-global, not per-tab).
 *     Sets badge to "!" in amber on the affected tab.
 *
 * Storage keys (chrome.storage.session — cleared on browser exit):
 *   'ctt_tabs'  → { [tabId: string]: TokenState }
 *   'ctt_drift' → DriftState | null
 *
 * TokenState: {
 *   conversationId, inputTokens, outputTokens, total,
 *   pct, schemaVersion, hasDrift, updatedAt
 * }
 *
 * DriftState: {
 *   schemaVersion, eventType, field, expected,
 *   received, detectedAt, dismissed
 * }
 */

'use strict';

/* global browser */
const api = (typeof browser !== 'undefined') ? browser : chrome;

const CONTEXT_WINDOW = 200_000;
const KEY_TABS       = 'ctt_tabs';
const KEY_DRIFT      = 'ctt_drift';

// ── Helpers ────────────────────────────────────────────────────────────────

function badgeColor(pct) {
  if (pct >= 85) return '#d95f5f';
  if (pct >= 60) return '#c99540';
  return '#4aab84';
}

async function getTabs() {
  const d = await api.storage.session.get(KEY_TABS);
  return d[KEY_TABS] ?? {};
}

async function setTabs(all) {
  await api.storage.session.set({ [KEY_TABS]: all });
}

// ── Message handler ────────────────────────────────────────────────────────

api.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  if (msg.type === 'CTT_UPDATE') { handleUpdate(tabId, msg); return; }
  if (msg.type === 'CTT_DRIFT')  { handleDrift(tabId, msg);  return; }
});

async function handleUpdate(tabId, msg) {
  const { conversationId, inputTokens, outputTokens, schemaVersion, hasDrift } = msg;
  const total = inputTokens + outputTokens;
  const pct   = Math.min(100, Math.round((total / CONTEXT_WINDOW) * 100));

  const state = {
    conversationId, inputTokens, outputTokens,
    total, pct, schemaVersion,
    hasDrift: !!hasDrift,
    updatedAt: Date.now(),
  };

  const all = await getTabs();
  all[tabId] = state;
  await setTabs(all);

  if (hasDrift) {
    await storeDrift({
      schemaVersion,
      eventType: 'unknown',
      field:     '(see CTT_DRIFT)',
      expected:  '—',
      received:  '—',
      detectedAt: Date.now(),
      dismissed:  false,
    });
    api.action.setBadgeText({ text: '!', tabId });
    api.action.setBadgeBackgroundColor({ color: '#c99540', tabId });
  } else {
    api.action.setBadgeText({ text: pct === 0 ? '' : `${pct}%`, tabId });
    api.action.setBadgeBackgroundColor({ color: badgeColor(pct), tabId });
  }
}

async function handleDrift(tabId, msg) {
  const { schemaVersion, eventType, field, expected, received } = msg;
  await storeDrift({
    schemaVersion, eventType, field, expected, received,
    detectedAt: Date.now(),
    dismissed:  false,
  });
  api.action.setBadgeText({ text: '!', tabId });
  api.action.setBadgeBackgroundColor({ color: '#c99540', tabId });
}

async function storeDrift(driftState) {
  const existing = (await api.storage.session.get(KEY_DRIFT))[KEY_DRIFT];
  if (existing && !existing.dismissed &&
      existing.schemaVersion === driftState.schemaVersion) return;
  await api.storage.session.set({ [KEY_DRIFT]: driftState });
}

// ── Cleanup ────────────────────────────────────────────────────────────────

api.tabs.onRemoved.addListener(async (tabId) => {
  const all = await getTabs();
  delete all[tabId];
  await setTabs(all);
});
