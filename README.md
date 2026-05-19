# Claude Token Tracker

> A minimal Chrome / Edge / Firefox extension that shows how much of Claude's free-plan **context window** you have used in the current conversation by measuring the context window *fill* (tokens used / 200k), not the free-plan message quota. These are different things. The token tracking is precise, but the quota is sadly opaque and there is no way to truly measure it for the free-plan as of now.


<p align="center">
  <img src="https://img.shields.io/badge/Claude-D97757?logo=claude&logoColor=fff">
  <img src="https://img.shields.io/badge/Version-1.2.0-orange" alt="Version">
  <img src="https://img.shields.io/badge/Manifest-v3-orange">
  <img src="https://img.shields.io/badge/SSE%20schema-v1-orange">
  <img src="https://img.shields.io/badge/Chrome-supported-teal?logo=googlechrome&logoColor=fff">
  <img src="https://img.shields.io/badge/Edge-supported-teal?logo=microsoftedge&logoColor=white">
  <img src="https://img.shields.io/badge/Firefox-128%2B-teal?logo=firefox&logoColor=white">
  <img src="https://img.shields.io/badge/license-MIT-4aab84">
</p>

---

## ⚠ One thing to understand before installing

This extension tracks **context window fill** — the fraction of the model's 200 000-token memory used by your current conversation.

It does **not** track your **free-plan message quota** (the daily limit on how many times you can send a message).

**These are two different limits.** Most tools that claim to track "Claude tokens" conflate them. This one does not.

| What this tracks | What this does NOT track |
|---|---|
| Tokens in the active conversation | Daily message allowance |
| Input + output split per turn | Pro / Team plan seat limits |
| Remaining context window space | API rate limits |
| Schema validity of Claude's API | Any other Anthropic quota |

---

## Install from store

| Browser | Store | Min version |
|---|---|---|
| Chrome | [Chrome Web Store](#) *(coming soon)* | Chrome 109+ |
| Edge | [Chrome Web Store](#) *(same listing)* | Edge 109+ |
| Firefox | [Firefox Add-ons (AMO)](#) *(coming soon)* | Firefox 128+ |

> Store listings will be linked here once published. Until then, use the unpacked install instructions below.

---

## Install unpacked (developer mode)

### Chrome / Edge

1. Download and extract this repository
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge)
3. Enable **Developer mode** — toggle in the top-right corner
4. Click **Load unpacked** → select the `claude-token-tracker/` folder
5. Navigate to [claude.ai](https://claude.ai), send any message
6. Click the extension icon — the gauge updates immediately

### Firefox

1. Download and extract this repository
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
3. Select `manifest.json` inside the `claude-token-tracker/` folder
4. Navigate to [claude.ai](https://claude.ai), send any message

> **Note:** Temporary add-ons in Firefox are removed on browser restart. For persistent install, use the AMO listing (coming soon) or sign the extension yourself via [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/).

---

## How it works

Claude's completion endpoint streams responses as Server-Sent Events. Two of those events carry exact token counts:

```
data: {"type":"message_start","message":{"usage":{"input_tokens":35731}}}
                                                         ↑
                              full conversation history fed to the model this turn

data: {"type":"message_delta","usage":{"output_tokens":712}}
                                                ↑
                                assistant tokens for this turn only
```

The extension intercepts these events, validates them against a typed schema contract, and computes:

```
context fill % = (input_tokens + output_tokens) / 200 000 × 100
```

`input_tokens` already equals the cumulative context (system prompt + full history + new message). No accumulation logic is needed. The last value from any given turn is authoritative.

---

## Architecture

```
claude.ai page
  └─ injected.js    [MAIN world]      overrides window.fetch
                                      parses SSE line-by-line
                                      validates schema contract
                                      emits postMessage → CTT_UPDATE | CTT_DRIFT
        ↓
  content.js        [isolated world]  validates sentinel (__ctt)
                                      forwards payload to background
        ↓
  background.js     [service worker]  stores state per-tab in session storage
                                      updates toolbar badge
                                      stores drift state globally
        ↓
  popup.js          [popup context]   reads storage, renders gauge + drift banner
```

Six files. No build step. No dependencies. No external requests.

---

## Browser compatibility

The shim `const api = (typeof browser !== 'undefined') ? browser : chrome` is inlined in every extension-context file (`content.js`, `background.js`, `popup.js`). `injected.js` runs in the page's MAIN world and uses no extension APIs — it requires no shim.

| API used | Chrome / Edge | Firefox 128+ |
|---|---|---|
| `storage.session` | ✓ | ✓ (since Firefox 115) |
| `action.setBadgeText` | ✓ | ✓ |
| `runtime.sendMessage` | ✓ | ✓ |
| `tabs.query` | ✓ | ✓ |
| MV3 service worker | ✓ | ✓ (since Firefox 128) |
| MAIN-world content script injection | ✓ | ✓ (since Firefox 128) |

Edge requires no adaptation — it is Chromium and the `chrome.*` namespace is natively present.

---

## Schema guard

The SSE event shape is undocumented and can change without notice. Every event this extension cares about is validated on each intercept against a typed contract (`SCHEMA_VERSION = 1`).

If Anthropic changes the response structure:

- The badge shows **`!`** in amber
- The popup shows a **Schema Drift Detected** banner with the exact failing field, expected type, and received type
- Token values are still displayed if extractable, but tinted amber to signal uncertainty
- A new extension version increments `SCHEMA_VERSION` alongside the fix

You will never see a silent zero or a wrong number presented as correct.

---

## File structure

```
claude-token-tracker/
├── manifest.json         MV3 manifest — permissions, wiring, version
├── injected.js           fetch override, SSE parser, schema validators
├── content.js            bridge: inject script + relay postMessage
├── background.js         session state store, badge, drift handling
├── popup.html            UI shell
├── popup.js              reads storage, renders gauge and drift banner
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── generate_icons.py     reproducible icon generation (requires Pillow, already run)
```

---

## What the popup shows

```
┌─────────────────────────────────┐
│ CONTEXT WINDOW       schema v1  │
├─────────────────────────────────┤
│                                 │
│      ╭───────╮   Input          │
│      │  18%  │   35 731 tk      │
│      │  USED │   Output         │
│      ╰───────╯   712 tk         │
│                  Total          │
│                  36 443 tk      │
│                                 │
│     ▰▰▱▱▱▱▱▱▱▱▱ 18%    │
│ 36 443 used        163 557 free │
├─────────────────────────────────┤
│  23s ago                  Reset │
└─────────────────────────────────┘
```

**Badge colors:**

| Color | Meaning |
|---|---|
| 🟢 Teal | < 60 % used — comfortable |
| 🟡 Amber | 60–84 % used — getting full |
| 🔴 Red | ≥ 85 % used — near limit |
| `!` Amber | Schema drift detected — check for update |

---

## Schema versioning

`SCHEMA_VERSION` in `injected.js` is an integer independent of the extension's semver. It represents the observed shape of Claude's SSE events.

| Change | Semver bump | Schema bump |
|---|---|---|
| New feature / UI change | minor | no |
| Bug fix | patch | no |
| SSE shape changed, fixed | minor | **yes** |
| SSE shape changed, breaking | major | **yes** |

When you report an issue, always include the schema version shown in the popup header.

---

## Contributing

1. Fork and clone
2. Load unpacked from your local clone
3. Open `injected.js` to update validators if the SSE shape has changed
4. Increment `SCHEMA_VERSION` if you touch the validators
5. Update CHANGELOG section with the date and nature of the change
6. Open a pull request — include the observed raw SSE event that prompted the fix

**Do not add features that are out of scope.** This extension does one thing. Proposals to add quota tracking, conversation history, analytics, or sync storage will be closed.

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | Persist token state and drift records in session storage |
| `tabs` | Identify the active tab to read and reset its state |
| `host_permissions: *://claude.ai/*` | Inject the content script and intercept fetch on claude.ai only |

No data ever leaves your browser. No analytics. No remote logging.

---

## Limitations

- **SSE schema is private.** Anthropic can change it without notice. The schema guard exists precisely for this — it fails loudly, not silently.
- **Free-plan message quota is not tracked.** It is not exposed in the SSE stream. The DOM-scraping approach required to infer it is brittle and explicitly out of scope.
- **Firefox requires version 128+.** This is the minimum for MV3 service workers and MAIN-world content script injection.
- **SharedWorker requests would not be intercepted.** The `window.fetch` override covers requests made from the main frame only. Claude.ai currently does not use SharedWorkers for completions.

---

## CHANGELOG

### v1.2.0
- Added `icons/` — 16, 32, 48, 128 px PNGs generated from `generate_icons.py`
- Added `"icons"` and `"action.default_icon"` blocks to manifest
- Added `"browser_specific_settings.gecko"` to manifest (`id`, `strict_min_version: 128`)
- Added `const api = browser ?? chrome` shim to `content.js`, `background.js`, `popup.js`
- All `chrome.*` calls replaced with `api.*` — single codebase, three browsers
- `injected.js` unchanged (MAIN world, no extension APIs)
- README updated with browser badges, compatibility table, Firefox install instructions, store section

### v1.1.0
- Added `SCHEMA_VERSION = 1` constant in `injected.js`
- Added typed validators for `message_start` and `message_delta` SSE events
- Added `CTT_DRIFT` message type: emitted on first validation failure per stream
- Added drift warning banner in popup with field-level diagnostic detail
- Background now stores drift state globally in session (not per-tab)
- Drift dismissed per-session; reappears after browser restart if still unresolved
- Token values on partial drift still displayed, tinted amber
- Schema version now shown in popup header

### v1.0.0 (not fully publicly published)
- Initial release
- `window.fetch` override in MAIN world
- SSE parser for `message_start` / `message_delta`
- Per-tab token state in `chrome.storage.session`
- SVG ring gauge, linear bar, toolbar badge

---

## Store submission checklist

The following is required before each store submission. Included here so it survives across contributors.

### Chrome Web Store
- [ ] `manifest.json` version bumped
- [ ] All icons present at 16 / 32 / 48 / 128 px
- [ ] Privacy practices declared: no user data collected, no remote transmission
- [ ] Single-purpose description matches the one-liner in this README
- [ ] Zip excludes `generate_icons.py`, `*.md`, `.git/`

### Firefox Add-ons (AMO)
- [ ] `browser_specific_settings.gecko.id` present in manifest
- [ ] `strict_min_version` set (currently `128.0`)
- [ ] Source code zip uploaded (AMO may require it for fetch-override review)
- [ ] Listed as "Works with Firefox for Android: No"

---

## License

**MIT License** — This project is licensed under the MIT License.

This project is not affiliated with, endorsed by, or connected to Anthropic in any way. It observes network responses that your browser already receives. It does not intercept, store, or transmit your conversation content.

---

<p align="center">
  Developed by <a href="https://github.com/Q-Fin">Q-Fin</a><br><br>
  <a href="https://github.com/Q-Fin">
    <img src="https://avatars.githubusercontent.com/u/152863492" width="48" height="48" alt="FinEn" style="border-radius:50%">
  </a>
</p>
