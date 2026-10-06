// Only the dedicated test profile is mutated; server records are untouched.
export async function pageLegacySnapshots(ids, scope, mode = 'inspect') {
  if (!['admin', 'public'].includes(scope) || !['inspect', 'seed'].includes(mode) || !ids.length) throw new Error('Invalid legacy snapshot probe scope')
  const owned = new Set(ids.map(String)), observations = []
  const visit = (payload, storage) => {
    if (!Array.isArray(payload?.data?.bookmarks)) return null
    const selected = payload.data.bookmarks.filter((row) => owned.has(String(row.id)))
    if (!selected.length) return null
    if (mode === 'seed') {
      delete payload.icon_snapshot_version
      payload.data.bookmarks = payload.data.bookmarks.map((row) => owned.has(String(row.id))
        ? { ...row, icon: null, icon_blob: null, icon_revision: null, icon_cached: false, icon_display: 'empty' }
        : row)
    }
    const rows = payload.data.bookmarks.filter((row) => owned.has(String(row.id)))
    observations.push({ storage, matched: rows.length, version: payload.icon_snapshot_version ?? null,
      empty: rows.filter((row) => row.icon_display === 'empty').length,
      images: rows.filter((row) => row.icon_display === 'image').length })
    return payload
  }
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('cf-navs.' + scope + '-data.')) continue
    const payload = visit(JSON.parse(localStorage.getItem(key)), 'localStorage')
    if (payload && mode === 'seed') localStorage.setItem(key, JSON.stringify(payload))
  }
  const name = 'cf-navs-' + scope + '-data-v1'
  if ((await caches.keys()).includes(name)) {
    const cache = await caches.open(name)
    for (const request of await cache.keys()) {
      const response = await cache.match(request)
      if (!response) continue
      const payload = visit(await response.json(), 'CacheStorage')
      if (payload && mode === 'seed') await cache.put(request, new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }))
    }
  }
  return observations
}
