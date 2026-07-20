# Performance Testing

This project includes two real-browser Chrome scripts for the production site or any deployed CF-Navs origin.

- `npm run perf:audit` checks performance-sensitive behavior and thresholds.
- `npm run regression:chrome` checks broader functional regression paths without modifying data.

Read `docs/reference/PERFORMANCE_CONTRACT.md` before changing data freshness, icon loading, Service Worker caching, or admin loading behavior.

## Chrome Setup

Start a dedicated Chrome with a DevTools endpoint. By default `regression:chrome` starts an isolated temporary profile and fails if the configured port is already occupied. Reuse of an existing browser is opt-in only and must target a browser dedicated to this test.

Default endpoint:

```powershell
http://127.0.0.1:9223
```

Each script creates a dedicated test tab for `BASE_URL`, logs in through the page, runs the audit, prints JSON metrics, removes `cf-navs.auth`, and closes only that test tab before exit. Existing user tabs are never reused or closed.

## Run

```powershell
$env:BASE_URL = 'https://navs.bjlius.com'
$env:CHROME_DEBUG_PORT = '9223'
$env:ADMIN_USER = '<admin user>'
$env:ADMIN_PASS = '<admin password>'
npm run perf:audit
```

Functional regression:

```powershell
$env:BASE_URL = 'https://navs.bjlius.com'
$env:CHROME_DEBUG_PORT = '9228'
$env:ADMIN_USER = '<admin user>'
$env:ADMIN_PASS = '<admin password>'
npm run regression:chrome
```

By default `regression:chrome` starts a temporary Chrome profile under `D:\tmp\cf-navs-chrome-profile-<port>`. Its `finally` cleanup closes the test-owned browser, stops only Chrome processes matching that exact profile, verifies the remaining process count is zero, and then removes the profile.

When Chrome is already running with a dynamic DevTools port, the script can connect through the browser websocket only if `REGRESSION_ALLOW_EXISTING_CHROME=1` and `CHROME_DEVTOOLS_ACTIVE_PORT_FILE` are set for a browser dedicated to this test. In that mode the JSON output reports `browserConnectionMode: "dedicated-existing-browser"` and does not start a temporary Chrome process. The helper `scripts/discover-devtools.ps1` never scans the default Chrome profile; existing-browser discovery requires an explicit active-port file and opt-in switch.

Explicit existing-browser opt-in:

```powershell
$env:REGRESSION_ALLOW_EXISTING_CHROME = '1'
$env:CHROME_DEVTOOLS_ACTIVE_PORT_FILE = 'D:\path\to\dedicated-test-profile\DevToolsActivePort'
```

Existing Chrome and every visible/headed Chrome are user-owned unless current-task authorization says otherwise. Both scripts create and close only their dedicated test target. They must never call `Browser.close` or terminate a Chrome process in those modes.

For unattended runs where an existing Chrome profile must not be used, force a temporary headless profile and choose a free port:

```powershell
$env:REGRESSION_FORCE_TEMP_CHROME = '1'
$env:CHROME_DEBUG_PORT = '9230'
$env:CHROME_USER_DATA_DIR = 'D:\tmp\cf-navs-chrome-profile-9230'
npm run regression:chrome
```

With `REGRESSION_FORCE_TEMP_CHROME=1`, the regression script skips `DevToolsActivePort`. If the configured port is already in use, it fails instead of attaching to an existing browser.

For safety, `CHROME_USER_DATA_DIR` must end with `cf-navs-chrome-profile-<unique-id>`. The script refuses arbitrary profile paths so it can never delete a normal Chrome profile during cleanup. `REGRESSION_CLEAR_ORIGIN_DATA=1` is rejected when the run reuses an existing browser.

Never clean up with `taskkill /IM chrome.exe`, `Get-Process chrome | Stop-Process`, or another process-name-wide command. If exact-profile process cleanup fails, treat the regression run as failed and report the remaining process count.

Optional:

```powershell
$env:PERF_AUDIT_ALLOW_FAILURES = '1'
```

Use this only when collecting diagnostics from a known-bad run. By default, the script exits non-zero if it sees failed network requests or cannot complete a core scenario.

Thresholds can be tuned per deployment:

```powershell
$env:PERF_MAX_FAILED_REQUESTS = '0'
$env:PERF_MAX_ADMIN_DATA_TRANSFER = '60000'
$env:PERF_MAX_CACHE_BYTES = '5242880'
$env:PERF_MIN_BOOKMARK_CARDS = '300'
$env:PERF_MAX_ICON_REQUESTS = '260'
```

The JSON output includes a `checks` array with pass/fail status, actual values, and expected thresholds.

For regression diagnostics, use:

```powershell
$env:REGRESSION_ALLOW_FAILURES = '1'
$env:REGRESSION_MIN_BOOKMARK_CARDS = '1'
$env:REGRESSION_MIN_CATEGORIES = '1'
$env:REGRESSION_MIN_BOOKMARKS = '1'
$env:REGRESSION_CLEAR_ORIGIN_DATA = '1'
```

Use these regression diagnostics with the default isolated browser. The script rejects origin-level cleanup when it is attached to an existing browser.

## Covered Scenarios

### `regression:chrome`

- Login through `/api/login` in page context and authenticated reload.
- API smoke checks for `/api/health`, `/api/config`, `/api/data/version`, `/api/admin/data`, and `/api/iconify-search`.
- Home render, bookmark cards, section count, theme toggle, local search and broken image count.
- Admin entry from the home toolbar.
- Admin category, bookmark, settings, and backup tabs.
- Admin bookmark search input and clear.
- Bookmark card right-click using CDP `Input.dispatchMouseEvent`, context menu edit action, edit modal open/cancel.
- Logout and local auth cleanup.
- Console errors, page exceptions, failed requests, and unexpected HTTP 4xx/5xx.

### `perf:audit`

- Authenticated home reload.
- Full-page scroll to trigger lazy bookmark icons.
- Rapid home search input and clear.
- Admin entry from the home toolbar.
- Admin bookmark search input and clear.
- Network request summary, including `/api/admin/data`, `/api/icon/*`, `/api/iconify/*`, and failed requests.
- Storage summary for `navigator.storage.estimate()` and Cache Storage entries.

## Request Discipline

Both scripts intentionally avoid save, delete, import, sort-save, and icon-cache refresh endpoints by default. That keeps them suitable for production regression checks without modifying cloud data or increasing request volume beyond measured browsing scenarios.
