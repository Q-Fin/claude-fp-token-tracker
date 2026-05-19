/**
 * content.js — isolated-world content script.
 *
 * Browser compatibility: uses the `api` shim so the same source runs on
 * Chrome, Edge (chrome.* native) and Firefox (browser.* preferred,
 * chrome.* alias also present but promise-based browser.* is canonical).
 *
 * Two jobs:
 *   1. Inject injected.js into the page's MAIN world at document_start.
 *   2. Bridge postMessages from injected.js to the background service
 *      worker — transparent, no payload interpretation.
 *
 * Accepted message types: 'CTT_UPDATE', 'CTT_DRIFT'.
 */

/* global browser */
const api = (typeof browser !== 'undefined') ? browser : chrome;

// ── 1. Inject ──────────────────────────────────────────────────────────────
const script = document.createElement('script');
script.src = api.runtime.getURL('injected.js');
(document.head || document.documentElement).prepend(script);

// ── 2. Bridge ──────────────────────────────────────────────────────────────
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data?.__ctt) return;

  const { __ctt: _sentinel, ...payload } = event.data;
  // Firefox's browser.runtime.sendMessage returns a Promise; Chrome's
  // chrome.runtime.sendMessage uses a callback. Either works here because
  // we do not consume the return value — fire and forget.
  api.runtime.sendMessage(payload);
});
