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
