# Performance Contract

This document records the current performance-sensitive behavior that should not be changed casually.

## Startup Requests

- A second visit must not issue `GET /api/install/status`. The browser's local installed hint is authoritative; the probe only runs without that hint, on `/install`, or as a one-off recheck after a server-side data load failure.
- `GET /api/data/version` must stay at one D1 query. It runs on every page load, so an extra query is an extra serialized round trip.

## Data Freshness

- A valid local snapshot should unlock the home view immediately on refresh; remote freshness validation continues in the background through the existing data-version flow.
- If version validation fails for a non-auth reason, the snapshot remains visible and the UI shows a non-blocking refresh/network hint.
- Saving categories, bookmarks, settings, sort order, or imports must continue to update cloud data and refresh local stores.
- Multi-device refresh behavior depends on the version/data invalidation contract. Do not remove or bypass it to reduce requests.
- Performance work should avoid adding background polling or extra startup requests.

## Aggregate Data

- `/api/admin/data` and `/api/public/data` should stay lightweight.
- Aggregate bookmark payloads should not include large icon blobs for normal authenticated/admin loading unless a specific workflow requires them.
- The observed authenticated `/api/admin/data` transfer target is roughly 38 KB for the current 345-bookmark dataset.

## Bookmark Icons

- Normal home rendering may lazy-load bookmark icons, but changes must not increase same-origin Cloudflare Worker request counts for the same browsing scenario without a measured budget update.
- HTTP(S) bookmark icons may use same-origin proxy URLs only where the current runtime path already does so.
- Icon rendering should keep native lazy loading, async decoding, fixed image dimensions, and low fetch priority for bookmark icons.
- Failed icon handling should prefer stable fallback behavior over repeated retries in the same interaction path.
- Anonymous icon proxies must perform the current public-visibility metadata gate **before every shared edge-cache lookup**. Cache hits now pay the gate's targeted metadata read; this is intentional for privacy revocation and must be measured by `perf:audit` rather than removed to recover the old hit count. The gate must fail closed.

## Trusted Device Icon Copies

- Persistent object-icon copies are an explicit device opt-in and require a current authenticated receipt. Standard mode and anonymous visitors continue to use the ordinary `no-store` proxy path; ordinary proxy responses are never persisted.
- Trusted bookmark copies are fetched only through the session-authenticated `/api/icon-local-copy` protocol and are stored in one IndexedDB database. The Service Worker, Cache Storage, aggregate snapshots, and `localStorage` must not mirror the image bodies.
- The shared bookmark/category budget is 10 MiB of bodies, 1,000 entries, and 512 KiB of index metadata; one body is at most 512 KiB. LRU pressure evicts from the 10 MiB high-water mark to 8 MiB. Category icons do not yet use this storage path.
- For an unchanged, warmed, authorized, non-evicted bookmark, refresh or same-profile reopen should issue zero icon-body requests. Version/authorization checks remain separately observable and are not counted as icon bodies.
- `npm run test:icon-storage` measures the native IndexedDB path with synthetic SVGs: 20-item first-batch samples and full-set stress sweeps at 100/500/1,000 entries, five rounds each. Its decode timings are a storage-layer baseline only; it does not measure actual viewport rendering, Worker/D1 queries, production edge behavior, or another browser.

## Service Worker And Storage

- Navigation requests use stale-while-revalidate: the cached `/index.html` is served immediately and refreshed in the background. Do not revert to network-first without measuring the second-visit first paint.
- The page sends the current document's `/assets/*` list to the Service Worker after `load` so hashed build output actually lands in Cache Storage on the first visit. Do not remove this without replacing it with a build-time manifest.
- The Service Worker must not write `/api/icon/*` or `/api/iconify/*` bookmark icon proxy responses into Cache Storage. Object-icon responses are also `no-store` to the browser, so the page's local bookmark-icon Cache Storage path must not persist them; public reuse is provided only by the Worker edge cache after the visibility gate.
- `/api/category-icon/*` is network-only in the Service Worker. Public reuse is provided by the Worker edge cache after the visibility gate; Cache Storage cannot revoke a private/public transition.
- Cross-origin `opaque` Iconify responses must not be cached.
- Storage growth should stay bounded during full-page scroll and admin navigation. Cache Storage should not return to the multi-megabyte growth caused by bulk bookmark icon caching.
- Public and authenticated aggregate snapshots are capped at 1.5 MB each and must use one persistence backend at a time: localStorage first, Cache Storage only as fallback.

## Admin Loading

- The Admin route itself is lazy-loaded from the main app.
- Heavy secondary admin UI should remain lazy where practical:
  - `SettingsPanel` loads only when the settings tab is opened.
  - `CategoryEditModal` loads only when the category modal is opened.
  - `SortableJS` loads only when sort mode is enabled.

## Real-Browser Regression Audit

Use `npm run perf:audit` after deployments that affect frontend loading, storage, icon behavior, or admin navigation.

Expected current-shape results for the deployment configured through the git-ignored `verify.local.json`:

- Home loads 345 bookmark cards across 11 sections.
- Rapid home search causes no DOM rebuild before the debounce settles.
- Admin entry opens from the home toolbar after authenticated reload.
- Admin bookmark search filters and clears without failed requests.
- Failed network requests should be empty.
- `/api/admin/data` should remain about 38 KB transferred for the current dataset.
