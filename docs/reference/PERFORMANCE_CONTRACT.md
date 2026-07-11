# Performance Contract

This document records the current performance-sensitive behavior that should not be changed casually.

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

## Service Worker And Storage

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

Expected current-shape results for `https://navs.bjlius.com`:

- Home loads 345 bookmark cards across 11 sections.
- Rapid home search causes no DOM rebuild before the debounce settles.
- Admin entry opens from the home toolbar after authenticated reload.
- Admin bookmark search filters and clears without failed requests.
- Failed network requests should be empty.
- `/api/admin/data` should remain about 38 KB transferred for the current dataset.
