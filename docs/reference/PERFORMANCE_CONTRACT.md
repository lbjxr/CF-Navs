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

- Normal home rendering may lazy-load bookmark icons, but changes must not increase same-origin Cloudflare Worker request counts for the same browsing scenario.
- HTTP(S) bookmark icons may use same-origin proxy URLs only where the current runtime path already does so.
- Icon rendering should keep native lazy loading, async decoding, fixed image dimensions, and low fetch priority for bookmark icons.
- Failed icon handling should prefer stable fallback behavior over repeated retries in the same interaction path.
- Anonymous icon proxies must pass the public-visibility check before returning real icon bytes. The check costs one extra category read on `/api/icon/:id` cache misses and none on `/api/category-icon/:id`; cache hits and same-origin request counts are unchanged. Do not drop the check to save that read, and do not move it ahead of the cache lookup without bumping `ICON_CACHE_NAMESPACE`.

## Service Worker And Storage

- Navigation requests use stale-while-revalidate: the cached `/index.html` is served immediately and refreshed in the background. Do not revert to network-first without measuring the second-visit first paint.
- The page sends the current document's `/assets/*` list to the Service Worker after `load` so hashed build output actually lands in Cache Storage on the first visit. Do not remove this without replacing it with a build-time manifest.
- The Service Worker must not write `/api/icon/*` or `/api/iconify/*` bookmark icon proxy responses into Cache Storage.
- Category icons may stay cached because their count is small.
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
