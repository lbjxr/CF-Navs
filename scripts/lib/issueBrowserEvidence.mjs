// Network evidence is classified without retaining credentials, query strings,
// private URLs or response bodies. Request ownership is fixed at start time.
export function classifyIssueRequest(url, postData, origin) {
  const parsed = new URL(url)
  if (['data:', 'blob:'].includes(parsed.protocol)) return { kind:'local-image', object:null, path:'['+parsed.protocol.slice(0,-1)+']' }
  if (parsed.origin !== origin) return { kind: 'external', object: null, path: '[external]' }
  const path = parsed.pathname
  const match = path.match(/^\/api\/(icon|category-icon)\/(\d+)$/)
  if (match) return { kind: 'icon-body', object: `${match[1] === 'icon' ? 'bookmark' : 'category'}:${match[2]}`, path }
  if (path.startsWith('/api/iconify/')) return {kind:'iconify-body', object:'iconify:'+path, path}
  if (path === '/api/icon-local-copy') {
    let descriptor
    try { descriptor = JSON.parse(postData) } catch { /* Unknown descriptor must not silently pass a zero-request gate. */ }
    const object = ['bookmark', 'category'].includes(descriptor?.object_type) && Number.isSafeInteger(descriptor?.object_id)
      ? `${descriptor.object_type}:${descriptor.object_id}` : 'unknown'
    return { kind: 'icon-copy', object, path }
  }
  return { kind: path.startsWith('/api/') ? 'api' : 'resource', object: null, path }
}
export function assessStableIcons(requests, allowedObjects = [], allowedPreviewObjects = []) {
  const unexpected = requests.filter(row => ['icon-body', 'icon-copy', 'iconify-body', 'external-image'].includes(row.kind) && !allowedObjects.includes(row.object) && !(row.surface === 'editor-preview' && allowedPreviewObjects.includes(row.previewFor)))
  return { passed: unexpected.length === 0, unexpected: unexpected.map(row => ({ requestId: row.requestId, object: row.object, path: row.path, status: row.status ?? null, canceled: row.canceled ?? false })) }
}

export function assessIconTrace(trace, allowedObjects = []) {
  const regressions = (trace?.changes ?? []).filter(row => !allowedObjects.includes(row.key))
  return { passed: Number.isSafeInteger(trace?.frames) && trace.frames > 0 && regressions.length === 0, frames: trace?.frames ?? 0, regressions }
}
