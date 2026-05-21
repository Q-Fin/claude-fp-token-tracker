# Changelog

All notable changes to Claude Token Tracker are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).\
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\
Schema versions (the integer in `injected.js`) are tracked separately — a schema bump always accompanies a version bump, but not vice versa.

> **If you are here because the extension is showing `!` in the toolbar:**\
> look for the most recent entry marked `[SSE schema changed]`. That entry describes what drifted and which version fixed it.

---

## [Unreleased]

*Raw files of version 1.0.0*\
*See below for released features of 1.0.0*\
*Those were automatically bundled with 1.1.0 instead of having their own commits*

---

## [1.3.0] — 2026-05-06

### Added
- `test/parser.test.js` — zero-dependency test runner using `node:assert/strict` only; runs with `node test/parser.test.js`, no install step, exits with code 1 on failure (CI-compatible)
- `test/fixtures/completion.sse` — realistic captured SSE stream covering the full event sequence (`message_start`, `content_block_*`, `ping`, `message_delta`, `message_stop`)
- `test/fixtures/completion-drift-type.sse` — fixture where `input_tokens` is a string instead of a number; exercises the type-check branch of `validateMessageStart`
- `test/fixtures/completion-drift-missing.sse` — fixture where the `usage` block is absent entirely from `message_start`; exercises the missing-field branch
- 13 assertions across three test cases: correct token values on happy path, fill % within valid range, drift detection with correct `eventType` / `field` / `expected` / `received` values, graceful degradation under both drift types
- `CHANGELOG.md` — standalone file in Keep a Changelog format, replacing the inline bullet lists that were appended to `README.md`; includes schema version history table and `[SSE schema changed]` tagging convention

### Changed
- `README.md` — inline CHANGELOG section replaced with a two-sentence pointer to `CHANGELOG.md` and a callout for users seeing the `!` badge
- `README.md` — file structure tree updated to reflect `test/`, all three fixtures, `CHANGELOG.md`, and `LICENSE`
- `README.md` — Contributing section gains step 5 ("Run the tests") and a **Running the tests** subsection with the one-line command, fixture table, and an explicit note that `injected.js` validators and their mirror in `parser.test.js` must be kept identical
- `README.md` — Chrome Web Store submission checklist updated to exclude `test/` from the store zip

### Notes
- The validators in `test/parser.test.js` are an intentional duplicate of those in `injected.js`. `injected.js` is a browser IIFE with no exports and cannot be `require()`'d without a build step. The test targets the contract, not the implementation. Any divergence between the two copies is a bug surfaced by the test failing.
- Store zip (`claude-token-tracker-store.zip`) excludes `test/`, `generate_icons.py`, and `*.md` — none are runtime artifacts.

---

## [1.2.0] — 2026-05-05

### Added
- Icons at 16, 32, 48, 128 px (`icons/`) — generated from `generate_icons.py` using Pillow; reproducible from source
- `"icons"` and `"action.default_icon"` blocks in `manifest.json`
- `"browser_specific_settings.gecko"` in `manifest.json` — `id: claude-token-tracker@extension`, `strict_min_version: 128.0`
- Firefox install instructions and browser compatibility table in README
- Store submission checklist in README (Chrome Web Store + Firefox AMO requirements)
- `LICENSE` file (MIT) — required by both stores

### Changed
- All `chrome.*` API calls replaced with `const api = (typeof browser !== 'undefined') ? browser : chrome` shim in `content.js`, `background.js`, `popup.js`
- Single codebase now runs on Chrome, Edge, and Firefox 128+ without modification
- `injected.js` unchanged — runs in page MAIN world, uses no extension APIs

---

## [1.1.0] — 2026-05-04

### Added
- `SCHEMA_VERSION = 1` constant in `injected.js` — integer, independent of extension semver
- Typed validators for `message_start` and `message_delta` SSE events — dot-notation field paths, type-level checks
- `CTT_DRIFT` message type — emitted on first validation failure per stream (one report per stream maximum)
- Drift warning banner in popup — shows `eventType`, `field`, `expected`, `received` — dismissible per session
- Drift state stored globally in `chrome.storage.session` under `ctt_drift` (not per-tab — a schema change affects all tabs)
- Schema version displayed in popup header (`schema v1`)

### Changed
- `content.js` bridge now forwards all `__ctt`-flagged messages verbatim; `background.js` dispatches on `type`
- Token values produced under drift are still displayed but tinted amber (`hasDrift: true` flag propagated through the message chain)
- Badge shows `!` in amber when drift is active; reverts to percentage on dismiss + reload

---

## [1.0.0] — 2026-05-03

### Added
- `window.fetch` override in MAIN world (`injected.js`) — intercepts Claude's SSE completion stream
- SSE line-by-line parser targeting `message_start` and `message_delta` events
- Per-tab token state in `chrome.storage.session` (`ctt_tabs`) — cleared on browser exit
- Toolbar badge: percentage + colour coding (teal / amber / red by fill level)
- SVG ring gauge and linear progress bar in popup
- Input / output / total token breakdown in popup
- Relative timestamp ("23s ago") for last update
- Reset button — clears state and badge for the active tab

---

## Schema version history

| Schema | Extension version | Date | Notes |
|---|---|---|---|
| v1 | 1.3.0 → current | 2026-05-06 | Initial observed shape — `message_start.message.usage.input_tokens` (number), `message_delta.usage.output_tokens` (number) |

> When Anthropic changes the SSE response structure, contributors should add a new row here on the same day the fix ships (hopefully quickly). This table is the fastest way to determine whether an observed `!` badge is already fixed in a newer version.
>
> ## How to read a schema drift entry
> 
> When a drift is detected and fixed, the entry will look like this:
> 
> ```
> ## [X.Y.Z] — YYYY-MM-DD
> 
> ### Fixed
> - [SSE schema changed] `message_start.message.usage.input_tokens` moved to
>   `message_start.message.usage.context.input_tokens` — validators and
>   extraction path updated, SCHEMA_VERSION bumped to Y
> ```
