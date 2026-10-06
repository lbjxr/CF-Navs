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
export function assessStableIcons(requests, allowedObjects = [], allowedPreviewObjects = [], existingImagesOnly = false) {
  const unexpected = requests.filter(row => ['icon-body', 'icon-copy', 'iconify-body', 'external-image'].includes(row.kind) && !(existingImagesOnly && ['external-image','iconify-body'].includes(row.kind) && row.wasDisplayed === false) && !allowedObjects.includes(row.object) && !(row.surface === 'editor-preview' && allowedPreviewObjects.includes(row.previewFor)))
  return { passed: unexpected.length === 0, unexpected: unexpected.map(row => ({ requestId: row.requestId, object: row.object, path: row.path, status: row.status ?? null, canceled: row.canceled ?? false })) }
}

export function assessIconTrace(trace, allowedObjects = []) {
  const regressions = (trace?.changes ?? []).filter(row => !allowedObjects.includes(row.key))
  const revocations=(trace?.protectedRevocations??[]).filter(row=>!allowedObjects.includes(row.key))
  return { passed: Number.isSafeInteger(trace?.frames) && trace.frames > 0 && regressions.length === 0 && revocations.length===0, frames: trace?.frames ?? 0, regressions, revocations }
}

// A 409 is expected only when the matching advertised descriptor is requested
// again and a real body succeeds. Never waive all conflicts by status alone.
export function validatedIconConflicts(rows) {
  const ids = []
  for (const row of rows) {
    const result=row.copyResult, d=result?.descriptor
    if(row.status!==409||result?.protocol!==1||result.reason!=='conflict'||result.hasImage||d?.state!=='ready'||
       !['bookmark','category'].includes(d.object_type)||!Number.isSafeInteger(d.object_id)||d.object_id<=0||
       !/^[a-f0-9]{32}$/.test(d.dataset_epoch??'')||!Number.isSafeInteger(d.write_epoch)||d.write_epoch<0||
       !/^sha256-[a-f0-9]{64}$/.test(d.content_revision??'')||row.object!==`${d.object_type}:${d.object_id}`||
       row.copyRequest?.dataset_epoch!==d.dataset_epoch) continue
    const success=rows.find(next=>next.status===200&&next.time>=row.time&&next.object===row.object&&
      next.copyRequest?.dataset_epoch===d.dataset_epoch&&next.copyRequest.expected_write_epoch===d.write_epoch&&next.copyRequest.expected_content_revision===d.content_revision&&
      next.copyResult?.protocol===1&&next.copyResult.persistence==='session-scoped'&&next.copyResult.imageBytes>0&&
      ['object_type','object_id','dataset_epoch','write_epoch','content_revision','state'].every(key=>next.copyResult.descriptor?.[key]===d[key]))
    if(success) ids.push(row.requestId)
  }
  return ids
}
