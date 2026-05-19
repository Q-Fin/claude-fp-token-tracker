/**
 * background.js — MV3 service worker.
 *
 * Handles two message types:
 *
 *   CTT_UPDATE — normal token report after a successful stream parse.
 *     Stores TokenState keyed by tabId in chrome.storage.session under
 *     'ctt_tabs'. Updates the toolbar badge with the fill percentage.
 *     If the update carries hasDrift=true, also records drift (same as
 *     CTT_DRIFT) so the popup can annotate partial-success readings.
 *
 *   CTT_DRIFT — schema validation failed for at least one SSE event.
 *     Stores DriftState in chrome.storage.session under 'ctt_drift'.
 *     Sets the badge to "!" with an amber color on the affected tab.
 *     Drift state is global (not per-tab): a schema change affects all
 *     tabs equally and the user needs to act at the extension level.
 *
 * Storage keys (chrome.storage.session — cleared on browser exit):
 *   'ctt_tabs'  → { [tabId: string]: TokenState }
 *   'ctt_drift' → DriftState | null
 *
 * TokenState: {
 *   conversationId: string,
 *   inputTokens:    number,
 *   outputTokens:   number,
 *   total:          number,
 *   pct:            number,   // 0–100 integer
 *   hasDrift:       boolean,
 *   updatedAt:      number,
 * }
 *
 * DriftState: {
 *   schemaVersion: number,
 *   eventType:     string,   // which SSE event type drifted
 *   field:         string,   // dot-notation path of the failing field
 *   expected:      string,
 *   received:      string,
 *   detectedAt:    number,
 *   dismissed:     boolean,  // set by popup when user acknowledges
 * }
 */

'use strict';

const CONTEXT_WINDOW = 200_000;
const KEY_TABS  = 'ctt_tabs';
const KEY_DRIFT = 'ctt_drift';

// ── Helpers ────────────────────────────────────────────────────────────────

function badgeColor(pct) {
  if (pct >= 85) return '#d95f5f';
  if (pct >= 60) return '#c99540';
  return '#4aab84';
}

async function getTabs() {
  const d = await chrome.storage.session.get(KEY_TABS);
  return d[KEY_TABS] ?? {};
}

async function setTabs(all) {
  await chrome.storage.session.set({ [KEY_TABS]: all });
}

// ── Message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  if (msg.type === 'CTT_UPDATE') {
    handleUpdate(tabId, msg);
    return;
  }

  if (msg.type === 'CTT_DRIFT') {
    handleDrift(tabId, msg);
    return;
  }
});

async function handleUpdate(tabId, msg) {
  const { conversationId, inputTokens, outputTokens, schemaVersion, hasDrift } = msg;
  const total = inputTokens + outputTokens;
  const pct   = Math.min(100, Math.round((total / CONTEXT_WINDOW) * 100));

  const state = {
    conversationId,
    inputTokens,
    outputTokens,
    total,
    pct,
    schemaVersion,
    hasDrift: !!hasDrift,
    updatedAt: Date.now(),
  };

  const all = await getTabs();
  all[tabId] = state;
  await setTabs(all);

  // If this update itself carries a drift signal, record it.
  if (hasDrift) {
    await storeDrift({
      schemaVersion,
      eventType:  'unknown',   // CTT_UPDATE doesn't carry per-event drift detail
      field:      '(see CTT_DRIFT)',
      expected:   '—',
      received:   '—',
      detectedAt: Date.now(),
      dismissed:  false,
    });
    chrome.action.setBadgeText({ text: '!', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#c99540', tabId });
  } else {
    const badgeText = pct === 0 ? '' : `${pct}%`;
    chrome.action.setBadgeText({ text: badgeText, tabId });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor(pct), tabId });
  }
}

async function handleDrift(tabId, msg) {
  const { schemaVersion, eventType, field, expected, received } = msg;

  await storeDrift({
    schemaVersion,
    eventType,
    field,
    expected,
    received,
    detectedAt: Date.now(),
    dismissed:  false,
  });

  // Override the badge to signal something is wrong.
  chrome.action.setBadgeText({ text: '!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#c99540', tabId });
}

async function storeDrift(driftState) {
  // Only store if not already present and undismissed — avoid overwriting
  // a drift record with the same schema version repeatedly.
  const existing = (await chrome.storage.session.get(KEY_DRIFT))[KEY_DRIFT];
  if (existing && !existing.dismissed && existing.schemaVersion === driftState.schemaVersion) {
    return;   // already recorded; wait for user to dismiss before updating
  }
  await chrome.storage.session.set({ [KEY_DRIFT]: driftState });
}

// ── Cleanup ────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const all = await getTabs();
  delete all[tabId];
  await setTabs(all);
});
