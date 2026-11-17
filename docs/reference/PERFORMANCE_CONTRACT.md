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
- Anonymous `/api/public/data` must not let a request header force a D1 read: anonymous `no-cache` / `Pragma` directives are ignored and freshness comes from the versioned URL `/api/public/data?v=<data_version>`. A stale or forged `v` may cost at most the single settings version query before being answered from the current version's cached copy (`no-store`). Cold starts without a snapshot keep requesting the unversioned URL rather than adding a version probe.
- Aggregate bookmark payloads should not include large icon blobs for normal authenticated/admin loading unless a specific workflow requires them.
- The observed authenticated `/api/admin/data` transfer target is roughly 38 KB for the current 345-bookmark dataset.

## Bookmark Icons

- Bookmark editing shows a cancellable loading shell before network or lazy component loading completes. Both start concurrently; only the authoritative `GET /api/bookmarks/:id` source fields may populate a savable form. Failed or ten-second stalled reads offer retry/cancel; closing, changing session or starting another edit invalidates pending work.
- Opening a bookmark editor must not fetch the whole admin aggregate or automatically refresh the icon cache. Post-save background icon refresh remains. Edit source responses are `private, no-store`; no extra persistent edit cache or startup prefetch is added. `Server-Timing` on the edit and aggregate endpoints separates server data access from browser transfer time.

- Normal home rendering may lazy-load bookmark icons, but changes must not increase same-origin Cloudflare Worker request counts for the same browsing scenario without a measured budget update.
- `perf:audit` 的图标请求预算（`PERF_MAX_ICON_REQUESTS`）为 **270**（2026-10-12 由 260 上调）。原 260 是 #31 第 3 点的基线（~255）；REQ-17 的一级分类聚合「常用」区固定上限 `CATEGORY_HOT_LIMIT=12`（与全局 `most_visited_count` 解耦）会让每个「空一级 + 有子分类」各多渲染至多 4 张卡片/图标，实测全流程由 ~255 升到 ~262。这是对已请求功能的有界、经测量的预算上调；突发并发仍受 #31 第 3 点的有界调度器约束，上调的只是总请求数上限。
- HTTP(S) bookmark icons may use same-origin proxy URLs only where the current runtime path already does so.
- Icon rendering should keep native lazy loading, async decoding, fixed image dimensions, and low fetch priority for bookmark icons.
- Failed icon handling should prefer stable fallback behavior over repeated retries in the same interaction path.
- Anonymous icon proxies must perform the current public-visibility metadata gate **before every shared edge-cache lookup**. Cache hits now pay the gate's targeted metadata read; this is intentional for privacy revocation and must be measured by `perf:audit` rather than removed to recover the old hit count. The gate must fail closed.

- Per-bookmark icon display state published by explicit icon refreshes (`icon_revision` / `icon_write_epoch` / `icon_display`) lives in the per-id store `src/lib/iconDisplayStore.ts` (`bookmarkIconDisplay`), consumed by the icon-rendering components (`BookmarkCard`, `SpotlightBookmarkIcon`, `CachedBookmarkIcon`). A single icon load must not replace the `adminStore` / `publicStore` bookmark arrays, so Home's sorted/grouped/search-index memos keep their identity; the overrides are merged back only when persisting the admin snapshot. Category icons still use the array patch path (few objects).
- App root theme/background variables and the injected custom CSS are written through `src/lib/rootStyleWriter.ts` as two independent reactive writes that skip unchanged content; unrelated data changes (clicks, icon state, bookmark edits) must not rewrite `<style id="custom-css-inject">`.

## Local-First Icon Cache

- Every object icon (bookmark `/api/icon/:id`, category `/api/category-icon/:id`, public and private) is stored in one IndexedDB database (`cf-navs-icons-v2`, `src/lib/iconLocalStore.ts`) after a real image was fetched. Anonymous visitors persist too; there is no opt-in.
- One entry per object (`bookmark:<id>` / `category:<id>`). Its version is the proxy URL without the `key` access parameter; `v=` already folds in `icon_revision` / `icon_write_epoch` / source / title. A rendered icon whose version matches is served from IndexedDB with **zero** network requests; a different version downloads once and replaces the entry.
- The global flag `icon_epoch` (D1 triggers, returned with `/api/data/version` and both aggregates) is compared with the stored one on every data load / version check. Equal: no scan. Different: entries for objects absent from the current visible data are deleted, then the new flag is recorded.
- No total budget and no LRU; only the browser quota applies. Safeguards: a single image over 512 KiB is shown but not persisted; `navigator.storage.persist()` is requested once on the first write; a write failure (e.g. `QuotaExceededError`) or a missing IndexedDB falls back to memory for the page without an error.
- Fallback responses (`X-Icon-Fallback: 1`), failures and non-image bodies are never stored; the component's native recovery path (bounded retries) still owns them.
- Logout and session loss delete only private entries (fetched with `key=`); public entries stay.
- Downloads reuse the ordinary bounded scheduler (concurrency 4, per-URL coalescing, 10 s deadline). The Service Worker, Cache Storage, aggregate snapshots and `localStorage` still never hold image bodies.

## Service Worker And Storage

- The offline-shell fingerprint includes generated HTML response-header rules as well as HTML, scripts and styles. A policy-only change must not leave an old cached security policy indefinitely. HTML retains revalidation and uses `no-transform`; immutable build assets and the Service Worker retain their separate cache policies.

- Navigation requests use stale-while-revalidate: the cached `/index.html` is served immediately and refreshed in the background. Do not revert to network-first without measuring the second-visit first paint.
- The page sends the current document's `/assets/*` list to the Service Worker after `load` so hashed build output actually lands in Cache Storage on the first visit. Do not remove this without replacing it with a build-time manifest.
- The Service Worker must not write `/api/icon/*` or `/api/iconify/*` bookmark icon proxy responses into Cache Storage. Object-icon responses are also `no-store` to the browser, so the page's local bookmark-icon Cache Storage path must not persist them; public reuse is provided only by the Worker edge cache after the visibility gate.
- `/api/category-icon/*` is network-only in the Service Worker. Public reuse is provided by the Worker edge cache after the visibility gate; Cache Storage cannot revoke a private/public transition.
- Cross-origin `opaque` Iconify responses must not be cached.
- Storage growth should stay bounded during full-page scroll and admin navigation. Cache Storage should not return to the multi-megabyte growth caused by bulk bookmark icon caching.
- Public and authenticated aggregate snapshots are capped at 1.5 MB each and must use one persistence backend at a time: localStorage first, Cache Storage only as fallback.

## Admin Loading

- The Admin route itself is lazy-loaded from the main app.
- First-screen JS (`index-*.js`) must not statically include rarely used views: `Install` / `Recover` load on demand (the boot splash covers the load), `BookmarkContextMenu` (with `CategoryTreeSelect`) loads on first open and is idle-preloaded only for cards that can open it, and home rendering reads preset colors from `themePresetRender.ts` while the full `themePresets.ts` stays in the settings chunk. Measured with `npm run build` on 2026-10-12: index chunk 312.88 kB (gzip 104.94 kB) → 279.01 kB (gzip 94.73 kB); index CSS 99.19 kB (gzip 16.67 kB) → 82.14 kB (gzip 13.99 kB).
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
