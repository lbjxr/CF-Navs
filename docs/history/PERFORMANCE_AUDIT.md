# Performance Audit

## 2026-07-05 Baseline

Target: `https://navs.bjlius.com/`, authenticated Chrome session, cache disabled for the cold-load run.

Observed:

- Logged-in home loaded 337 bookmarks across 11 categories.
- `/api/admin/data` dominated the load: about 1.8 MB transferred, 3.7 MB decoded, and 3.3 s duration.
- Field breakdown showed `bookmarks[].icon_blob` accounted for about 3.58 MB of the 3.73 MB decoded payload.
- Removing `icon_blob` from aggregate data would reduce the decoded admin payload to about 145 KB.
- Initial logged-in DOM was about 2,699 elements with 338 links and 41 images in the measured viewport.
- Browser storage usage was about 4 MB, mostly Cache Storage. The full admin-data cache was the main avoidable contributor.
- No 4xx/5xx responses, failed requests, runtime exceptions, or console errors were observed.

## Issues And Fixes

1. Aggregate data included cached image blobs.
   - Impact: Large network payloads, slower first authenticated load, larger Cache Storage use.
   - Fix: Public and admin aggregate bookmark queries now return `NULL AS icon_blob` plus a lightweight `icon_cached` flag. Full icon blobs remain available through `/api/icon/:id`.

2. Icon cache refresh invalidated aggregate data caches.
   - Impact: Fetching or generating an icon could invalidate public/admin runtime data even though aggregate responses no longer depend on `icon_blob`.
   - Fix: `/api/icon/:id` no longer invalidates aggregate runtime/public data after writing `icon_blob`.

3. Bookmark cards used external icon URLs for runtime display.
   - Impact: More third-party image requests and weaker reuse of the existing Worker/service-worker icon cache.
   - Fix: Bookmark cards now use same-origin `/api/icon/:id` for HTTP icons and `/api/iconify/...` for Iconify icons.

## Follow-Up Candidates

- Consider progressive rendering or virtualization for the public bookmark grid if bookmark count grows far beyond the current 337 items.
- Consider capping large client-side icon data URIs in localStorage and preferring Cache Storage for large icons.

## 2026-07-05 Round 1

Stress path: authenticated home, cold admin-data cache, full-page scroll sweep, repeated search queries, and three home/admin switches.

Observed:

- `/api/admin/data` stayed small after the previous optimization: about 38 KB transferred and 156 KB decoded.
- Full scroll/search triggered about 240 same-origin icon requests.
- Several `/api/icon/:id` requests returned 502 when the original remote icon could not be fetched.
- Browser storage grew from about 1.4 MB to about 4.6 MB after icon-heavy interactions.

Fix:

- `/api/icon/:id` now returns the existing cacheable fallback SVG when the remote icon fetch fails instead of returning 502.

## 2026-07-05 Round 2

Stress path: authenticated home, cold icon cache, full-page scroll sweep.

Observed:

- A full icon-heavy scroll left browser Cache Storage around 4.6 MB.
- The Service Worker cached bookmark icons in Cache Storage even though `/api/icon/*` and `/api/iconify/*` already use same-origin URLs and cache headers.

Fix:

- Service Worker cache version bumped to `cf-navs-v13`.
- Service Worker no longer writes bookmark icon proxy responses (`/api/icon/*` and `/api/iconify/*`) into browser Cache Storage. Category icons remain cached because the count is small.

## 2026-07-05 Round 3

Stress path: rapid search input across the full 337-bookmark home list.

Observed:

- Each keystroke immediately recomputed the search filter and rebuilt the visible category/bookmark DOM.
- Clearing a restrictive search rebuilt the full list back to about 2,700 DOM nodes in one input turn.

Fix:

- Home list filtering now uses a 120 ms deferred query. The search box value remains immediate for the external search action, while local list filtering coalesces rapid keystrokes into one render.

## 2026-07-05 Round 4

Stress path: authenticated home reload, full-page scroll sweep, and icon-heavy viewport changes.

Observed:

- The home page renders 337 bookmark images after the full scroll sweep.
- Bookmark icon images did not declare intrinsic dimensions, so the browser had less information for image scheduling and layout reservation.
- Full scroll still produced the expected icon request volume without 4xx/5xx responses; `/api/admin/data` remained about 38 KB transferred.

Fix:

- Bookmark icon images now declare explicit `width` and `height` attributes and use `fetchpriority="low"` alongside existing lazy loading and async decoding.
- Retest showed all 337 icon images had the low-priority hint and fixed dimensions, zero broken images, no failed requests, and Cache Storage remained under 1 MB.

## 2026-07-05 Round 5

Stress path: authenticated home reload, full-page scroll sweep, and repeated layout updates while all 337 bookmark cards are present.

Observed:

- The full home list keeps about 2,700 DOM nodes active after rendering 337 bookmarks.
- Card hover, icon state changes, and scroll-triggered image updates can force layout/style work across a large sibling list.

Fix:

- Bookmark card shells now use CSS `contain: layout style` to isolate per-card layout and style recalculation.
- Retest showed all 337 card shells had containment applied, zero broken images, zero failed requests, `/api/admin/data` stayed about 38 KB transferred, and icon request counts did not increase.

## 2026-07-05 Round 6

Stress path: admin bookmark filtering across the full bookmark list.

Observed:

- Admin bookmark filtering normalized the search query inside the per-bookmark filter loop.
- Category-title matching used repeated linear category lookups while filtering bookmarks.

Fix:

- Admin bookmark search now normalizes the query once per input state and uses a reactive category-title map for category matching.
- Local type-check and production build passed; the deployed home regression pass still showed zero failed requests, `/api/admin/data` around 38 KB transferred, and unchanged icon request volume.

## 2026-07-05 Round 7

Stress path: authenticated reload followed by switching from home to the admin bookmark page.

Observed:

- The startup splash could remain in the DOM at the top of the document while the home shell was already rendered below it.
- In that state, real pointer interaction with the top toolbar was blocked by the stale splash occupying the viewport.

Fix:

- The initial boot splash is now removed immediately when booting completes instead of using an outro fade.
- Retest after deployment showed `app-splash` count at 0 after reload, the admin toolbar button entered the admin page, admin bookmark search worked, zero failed requests were observed, and `/api/admin/data` stayed about 38 KB transferred.

## 2026-07-05 Round 8

Stress path: rapid home search input, filtered render, and clearing back to the full 337-bookmark list.

Observed:

- Home search already deferred filtering, but visible category IDs were built via `visibleBookmarks.map(...)` followed by `new Set(...)`, creating an avoidable intermediate array each filter pass.

Fix:

- Visible category IDs are now built in a single loop without the intermediate array allocation.
- Retest showed rapid `n` -> `np` -> `npm` input caused 0 DOM mutations before the debounce settled, the settled query rendered 5 cards in 1 section, clearing restored 337 cards across 11 sections, no images were broken, zero failed requests were observed, and `/api/admin/data` stayed about 38 KB transferred.

## 2026-07-05 Round 9

Stress path: authenticated home reload, admin entry, admin bookmark search, and settings-tab navigation.

Observed:

- `SortableJS` was already dynamically imported only when sort mode is enabled.
- `SettingsPanel` and `CategoryEditModal` were still statically included in the Admin bundle even though they are not needed for the default admin category/bookmark workflow.

Fix:

- `SettingsPanel` now loads only when the settings tab is opened.
- `CategoryEditModal` now loads only when the category modal is opened.
- Production build split Admin from about 113 KB to about 41 KB, with SettingsPanel in its own about 70 KB chunk and CategoryEditModal in its own about 5 KB chunk.
- Retest showed the fixed real-browser audit still had zero failed requests, `/api/admin/data` stayed about 38 KB transferred, settings tab loaded and rendered its dynamic chunk, and CategoryEditModal assets were not requested during settings navigation.

## 2026-07-05 Round 10

Stress path: production build, authenticated home reload, admin entry, admin bookmark search, and the fixed real-browser audit.

Observed:

- The backup/import parser was statically imported by the app shell even though it is only needed when a user imports a backup file.
- The real-browser audit emitted metrics but did not enforce thresholds by default, so regressions could be missed unless the JSON was inspected manually.

Fix:

- Backup/import parsing now loads through a dynamic import only when an import file is actually processed.
- Production build split `importData` into an about 2 KB chunk and reduced the main `index` JS by about 2 KB.
- `npm run perf:audit` now emits a `checks` array and exits non-zero when key thresholds fail. Thresholds cover failed requests, bookmark count, broken images, splash removal, search debounce behavior, admin search, `/api/admin/data` transfer size, icon request count, and Cache Storage bytes.
- Retest after deployment showed every audit check passed, with zero failed requests, 337 home bookmark cards, 228 `/api/icon/*` requests, `/api/admin/data` about 38 KB transferred, and Cache Storage bytes under the configured 5 MB ceiling.

## 2026-07-05 Round 11

Stress path: authenticated home reload, full 337-bookmark list render, rapid home search, admin entry, and admin bookmark search.

Observed:

- The home page still built a visible-category ID `Set` for all 337 visible bookmarks even when no search query was active.
- That work was unnecessary because the non-search state already displays the complete sorted category list.

Fix:

- Visible category IDs are now computed only while a search query is active.
- The change is client-side only and does not alter admin/public data loading, Cloudflare request counts, update writes, or multi-device freshness/version checks.
- Retest after deployment showed all fixed audit checks passed: zero failed requests, 337 home bookmark cards, zero broken images, zero pre-settle rapid-search DOM mutations, 5 admin-search rows, `/api/admin/data` transfer at 38,638 bytes, 228 bookmark icon requests, and Cache Storage bytes at 2,026,779.

## 2026-07-05 Round 12

Stress path: authenticated home reload, local bookmark icon cache maintenance, rapid home search, admin entry, and admin bookmark search.

Observed:

- Locally cached data-URI bookmark icons could be written to both `localStorage` and the browser Cache Storage fallback.
- When `localStorage` succeeds, keeping the same data URI in Cache Storage is duplicate client-side storage.

Fix:

- Data-URI bookmark icons now keep Cache Storage only as a fallback when `localStorage` is unavailable or the write fails.
- App startup schedules an idle-time prune that removes Cache Storage icon entries already backed by valid `localStorage` data URIs.
- The change is local-browser storage maintenance only; it does not alter Cloudflare request paths, data update writes, or version freshness checks.
- Retest after deployment showed all audit checks still passed with no request increase: zero failed requests, 337 home bookmark cards, zero broken images, zero pre-settle rapid-search DOM mutations, `/api/admin/data` transfer at 38,629 bytes, 228 bookmark icon requests, and Cache Storage bytes at 2,182,910. Existing cache did not drop immediately, which indicates the current entries are mostly not duplicate localStorage-backed data URIs, but future duplicate writes are avoided.

## 2026-07-11 Weak-Network Snapshot Recovery

Test path: isolated headless Chrome profile, local production build, real production admin aggregate payload, one online load to establish a snapshot, followed by a reload with `/api/data/version` deliberately failed as offline.

Observed and verified:

- The online load rendered 348 bookmark cards across 11 categories and persisted exactly one authenticated aggregate snapshot.
- The offline reload restored all 348 cards and removed the startup splash in about 100 ms, without waiting for the failed version request.
- A non-blocking toast then explained that cached content was being shown and advised refreshing or checking the network.
- The aggregate snapshot occupied about 159 KB in localStorage, below the new 1.5 MB per-snapshot ceiling.
- No page exceptions were recorded. The deliberate version failure was the expected weak-network signal.
- Local preview returned 500 for Worker-only `/api/icon/*` routes; these icon-proxy limitations were isolated from the aggregate-data recovery assertions.

### Production confirmation

After `npm run deploy`, the same recovery path was verified against `https://navs.bjlius.com` on Worker version `d0743c00-a881-4c58-9421-0f782fddf0a4` using a separate headless Chrome profile.

- The online production load rendered 348 cards and stored exactly one authenticated snapshot at about 159 KB.
- With `/api/data/version` deliberately failed as `ERR_INTERNET_DISCONNECTED`, reload restored all 348 cards and removed the splash in about 398 ms.
- The cached-content/network-check toast appeared as expected.
- Page exceptions and unexpected HTTP 4xx/5xx responses were zero.
- The one console error and one failed request were both the deliberately disconnected version request.
- The wider production regression passed 24 of 25 checks. The only failure was the pre-existing theme-toggle state assertion; all loading, data, admin, search, icon, context-menu, authentication, security, and error checks passed.

## 2026-07-11 Error Reporting Hardening

The public runtime-error endpoint was bounded to prevent abusive Worker and logging usage while reducing duplicate client reports.

- Client reports now deduplicate the same fingerprint for 60 seconds and send at most six batches per minute.
- Server payloads are limited to 16 KB and ten entries, with bounded normalized fields.
- D1 atomic counters enforce twelve valid reports per source IP per minute across Worker isolates; locally blocked sources can be rejected from isolate memory.
- Production probes returned HTTP 400 for invalid JSON, 413 for a 17 KB payload, 200 for the first twelve valid requests, and 429 for the thirteenth.
- A KV-only counter and an isolate-memory counter were both rejected after production probes demonstrated their consistency/scope limitations.
- Fresh-profile production regression completed with zero failed requests, console errors, or page exceptions after the deployment asset propagation window. The existing theme-toggle assertion remained the only unrelated failed check.

## 2026-07-11 Shared Snapshot Storage

- Public and authenticated snapshot persistence now share a business-agnostic storage helper while keeping existing keys and payloads compatible.
- The refactor removed 138 net lines and reduced the main bundle from about 138.22 KB to 137.26 KB without changing startup requests.
- Fresh-profile production regression rendered 350 cards with zero failed requests, broken images, console errors, or page exceptions.
- A fully offline production reload restored all 350 cards from one approximately 161 KB authenticated snapshot in about 613 ms, removed the splash, and displayed the expected network hint.

## 2026-07-11 Uncached Icon Direct Fallback

- Production data contained 303 HTTP bookmark icons: 237 with persisted D1 cache and 66 without it.
- Persisted icons continue to use local/D1-backed sources; only uncached HTTP icons now fall back to their original URL instead of entering `/api/icon/:id`.
- On the same full-scroll audit, bookmark proxy requests fell from 160 to 141 (about 11.9%), while total requests fell from 253 to 232.
- Broken images, failed requests, Iconify request count, aggregate transfer size, and Cache Storage remained within the previous contract.

## 2026-07-11 Final Audit Reliability Pass

- Browser regression now treats a theme-mode label change as a valid toggle even when the resolved light/dark theme remains the same.
- Performance audit uses stable test IDs and semantic labels for admin navigation and bookmark search.
- Final browser regression passed every check with zero unexpected failed requests, console errors, or page exceptions.
- Final performance audit passed 9/9 checks: 350 cards, zero broken images, admin search 5 rows, `/api/admin/data` 39,627 bytes, 142 bookmark proxy requests, and 273,252 Cache Storage bytes.
