/**
 * content.js — isolated-world content script.
 *
 * Two jobs:
 *   1. Inject injected.js into the page's MAIN world at document_start
 *      so our fetch override runs before any page code.
 *   2. Receive postMessages from injected.js and forward them verbatim
 *      to the background service worker via chrome.runtime.sendMessage.
 *
 * Accepted message types: 'CTT_UPDATE', 'CTT_DRIFT'.
 * content.js does not interpret payloads — it is a transparent bridge.
 */

// ── 1. Inject ──────────────────────────────────────────────────────────────
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).prepend(script);

// ── 2. Bridge ──────────────────────────────────────────────────────────────
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data?.__ctt) return;

  // Destructure sentinel, forward the rest as-is.
  // background.js dispatches on `type` ('CTT_UPDATE' | 'CTT_DRIFT').
  const { __ctt: _sentinel, ...payload } = event.data;
  chrome.runtime.sendMessage(payload);
});
