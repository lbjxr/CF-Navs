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
  const unexpected = requests.filter(row => !(row.kind === 'external-image' && row.resourceRole === 'site-background') && ['icon-body', 'icon-copy', 'iconify-body', 'external-image'].includes(row.kind) && !(existingImagesOnly && ['external-image','iconify-body'].includes(row.kind) && row.wasDisplayed === false) && !allowedObjects.includes(row.object) && !(row.surface === 'editor-preview' && allowedPreviewObjects.includes(row.previewFor)))
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

// A response whose consumer was cancelled is not a verified protocol success.
// Keep it in the journal; operation-level request/handle budgets still count it.
export function isCanceledNetworkResponse(row) {
  return row.canceled === true && row.error === 'net::ERR_ABORTED' && Number.isInteger(row.status) && row.status >= 400
}

export function isExpectedOfflineFailure(errorText, offlineActive) {
  return offlineActive === true && errorText === 'net::ERR_INTERNET_DISCONNECTED'
}

// The timeout probe must prove cold storage, a still-held transport cancelled by
// the app's 10s deadline, and pixels from a real uncached proxy (new Blob or completed native image). Timing
// uses CDP monotonic seconds; wall time only joins the DOM observation to it.
export function assessCopyTimeoutFallback(rows, evidence) {
  const errors = []
  const scenario = evidence.scenario ?? '28-COPY-TIMEOUT'
  if (!['28-COPY-TIMEOUT', '28-PRIVATE-COPY-TIMEOUT', '28-PRIVATE-COPY-TIMEOUT-SLOW-PROXY'].includes(scenario)) errors.push('invalid-timeout-scenario')
  const { object, requestId, proxyRequestId, cold, afterTimeout, displayed, pixelsPassed } = evidence
  const copy = rows.find(row => row.requestId === requestId)
  const proxy = rows.find(row => row.requestId === proxyRequestId)
  const missing = state => state?.available === true && state.enabled === true && state.entryPresent === false && state.bodyPresent === false
  if (!missing(cold)) errors.push('not-cold')
  if (!missing(afterTimeout)) errors.push('timeout-persisted-data')
  if (!copy || copy.stage !== scenario || copy.kind !== 'icon-copy' || copy.object !== object || copy.status != null ||
      copy.canceled !== true || copy.error !== 'net::ERR_ABORTED') errors.push('not-held-copy-cancellation')
  const abortElapsedMs = (copy?.failureTime - copy?.time) * 1000
  const imageElapsedMs = displayed?.observedWallTime - copy?.wallTime * 1000
  if (!Number.isFinite(abortElapsedMs) || abortElapsedMs < 9000 || abortElapsedMs > 15000) errors.push('deadline-not-observed')
  if (!Number.isFinite(imageElapsedMs) || imageElapsedMs < abortElapsedMs - 100 || imageElapsedMs > 15000) errors.push('fallback-not-bounded')
  const headers = Object.fromEntries(Object.entries(proxy?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
  if (!proxy || proxy.stage !== scenario || proxy.kind !== 'icon-body' || proxy.object !== object || proxy.type !== (displayed?.kind === 'native' ? 'Image' : 'Fetch') ||
      proxy.status !== 200 || proxy.error || proxy.canceled || proxy.disk || proxy.sw || !Number.isFinite(proxy.finishedTime) ||
      !(proxy.time >= copy?.failureTime - 0.1 && proxy.finishedTime >= copy?.failureTime) ||
      proxy.path !== '/api/icon/' + object.split(':')[1] || !/^image\//i.test(headers['content-type'] ?? '') || headers['x-icon-fallback'] === '1' || pixelsPassed !== true) errors.push('not-real-proxy-image')
  const bodyFinishedWallTime = proxy?.wallTime * 1000 + (proxy?.finishedTime - proxy?.time) * 1000
  if (displayed?.kind === 'native') {
    if (displayed.sourceMatched !== true || !displayed.documentLoaderId || displayed.documentLoaderId !== proxy?.documentLoaderId || displayed.documentLoaderId !== copy?.documentLoaderId ||
        !(displayed.width > 0 && displayed.height > 0 && proxy?.receivedDataLength > 0) || !Number.isFinite(bodyFinishedWallTime) ||
        displayed.observedWallTime < bodyFinishedWallTime - 100) errors.push('not-completed-native-proxy')
  } else if (displayed?.kind !== 'blob' || !Number.isFinite(displayed.createdWallTime) || !(displayed.bytes > 0) ||
      displayed.mime?.split(';')[0].trim().toLowerCase() !== headers['content-type']?.split(';')[0].trim().toLowerCase() || !Number.isFinite(bodyFinishedWallTime) ||
      displayed.createdWallTime < bodyFinishedWallTime - 100 || displayed.createdWallTime > displayed.observedWallTime) errors.push('not-new-proxy-blob')
  // A second cancellation, even for the same object, has no timeout exemption.
  const unexpectedFailures = rows.filter(row => row.error && row.requestId !== requestId).map(row => row.requestId)
  if (unexpectedFailures.length) errors.push('unrelated-network-failure')
  if (rows.some(row => row.status >= 400)) errors.push('unexpected-http')
  return { passed: errors.length === 0, errors, abortElapsedMs, imageElapsedMs, unexpectedFailures,
    expectedCanceledRequests: errors.length ? [] : [requestId] }
}

export function assessCopyTimeoutRecovery(rows, evidence) {
  const { object, requestId, restoredWallTime, persisted, blobDisplayed, pixelsPassed } = evidence
  const row = rows.find(row => row.requestId === requestId), result = row?.copyResult, d = result?.descriptor
  const keys = ['object_type', 'object_id', 'dataset_epoch', 'write_epoch', 'content_revision', 'state']
  const errors = []
  const scenario = evidence.scenario ?? '28-COPY-TIMEOUT'
  if (!['28-COPY-TIMEOUT', '28-PRIVATE-COPY-TIMEOUT', '28-PRIVATE-COPY-TIMEOUT-SLOW-PROXY'].includes(scenario)) errors.push('invalid-timeout-scenario')
  const failed = rows.find(item => item.requestId === evidence.failedRequestId)
  const finishedWallTime = row?.wallTime * 1000 + (row?.finishedTime - row?.time) * 1000
  const releasedRetry = evidence.releasedRetryRequestId === requestId && failed?.stage === scenario && failed.kind === 'icon-copy' &&
    failed.object === object && failed.error === 'net::ERR_ABORTED' && failed.canceled === true && failed.status == null &&
    (failed.failureTime - failed.time) * 1000 >= 9000 && (failed.failureTime - failed.time) * 1000 <= 15000 &&
    failed.requestId !== requestId && Number.isFinite(failed.failureTime) && row?.time >= failed.failureTime &&
    row.authSession != null && row.authSession === failed.authSession &&
    ['dataset_epoch', 'expected_write_epoch', 'expected_content_revision'].every(key => row.copyRequest?.[key] === failed.copyRequest?.[key]) &&
    Number.isFinite(finishedWallTime) && finishedWallTime >= restoredWallTime - 100
  if (!row || row.stage !== scenario || row.kind !== 'icon-copy' || row.object !== object || row.status !== 200 || row.error || row.canceled ||
      !Number.isFinite(restoredWallTime) || !(row.wallTime * 1000 >= restoredWallTime || releasedRetry) || !Number.isFinite(row.finishedTime) ||
      result?.protocol !== 1 || result.persistence !== 'session-scoped' || result.hasImage !== true || !(result.imageBytes > 0) ||
      d?.state !== 'ready' || !['bookmark','category'].includes(d?.object_type) || !Number.isSafeInteger(d?.object_id) || d.object_id <= 0 ||
      object !== d?.object_type + ':' + d?.object_id || !/^[a-f0-9]{32}$/.test(d?.dataset_epoch ?? '') ||
      !Number.isSafeInteger(d?.write_epoch) || d.write_epoch < 0 || !/^sha256-[a-f0-9]{64}$/.test(d?.content_revision ?? '') ||
      row.copyRequest?.dataset_epoch !== d?.dataset_epoch) errors.push('no-fresh-copy-success')
  if (persisted?.available !== true || persisted.enabled !== true || persisted.entryPresent !== true || persisted.bodyPresent !== true ||
      !(persisted.bodyBytes > 0) || persisted.bodyBytes !== result?.imageBytes || !d ||
      persisted.bodyRevision !== d.content_revision || !keys.every(key => persisted.descriptor?.[key] === d[key])) errors.push('not-valid-persisted-body')
  if (blobDisplayed !== true || pixelsPassed !== true) errors.push('not-recovered-blob-image')
  return { passed: errors.length === 0, errors, requestId }
}

// CDP timing may contain unavailable (-1) phases. Retain numeric measurements,
// never addresses, headers, bodies or nested vendor-specific metadata.
export function numericNetworkTiming(timing) {
  return Object.fromEntries(Object.entries(timing ?? {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)))
}

export function isExpectedInjectedCancellation(row, expectedRequestIds) {
  return expectedRequestIds.has(row.requestId) && row.canceled === true && row.error === 'net::ERR_ABORTED'
}

export function unexecutedRequestedCases(requested, cases) {
  return [...requested].filter(id => !cases.some(row => row.id === id && ['passed', 'failed'].includes(row.status)))
}

export function verifiedCategoryFilterCancellations(rows, filters) {
  return rows.filter(row=>row.kind==='icon-copy'&&row.object?.startsWith('category:')&&row.canceled===true&&row.error==='net::ERR_ABORTED'&&!(row.status>=400)&&
    filters.some(filter=>filter.matched===true&&filter.stage===row.stage&&filter.authSession===row.authSession&&Number.isInteger(row.authSession)&&row.authSession>0&&Array.isArray(filter.beforeIds)&&Array.isArray(filter.afterIds)&&
      Number.isFinite(filter.enteredAt)&&Number.isFinite(filter.inputAt)&&Number.isFinite(filter.settledAt)&&filter.enteredAt<=filter.inputAt&&filter.inputAt<=filter.settledAt&&
      filter.beforeIds.includes(Number(row.object.split(':')[1]))&&!filter.afterIds.includes(Number(row.object.split(':')[1]))&&
      Number.isFinite(row.wallTime)&&row.wallTime*1000>=filter.enteredAt&&row.wallTime*1000<=filter.inputAt&&
      Number.isFinite(row.failureTime)&&Number.isFinite(row.time)&&row.wallTime*1000+(row.failureTime-row.time)*1000>=filter.inputAt-20&&
      row.wallTime*1000+(row.failureTime-row.time)*1000<=filter.settledAt+1000)).map(row=>row.requestId)
}

// A deliberately reset copy request is expected only after the same case has
// proved ordinary-image fallback, cold-store rejection and natural recovery.
export function verifiedInjectedCopyResets(rows, cases) {
  const ids = []
  for (const test of cases) {
    const proof = test.copyFailure
    if (test.id !== '28-COPY-CONNECTION-RESET' || test.status !== 'passed' ||
        proof?.failure !== 'CONNECTION-RESET' || proof.imagesPassed !== true) continue
    for (const injected of proof.requests ?? []) {
      const row = rows.find(item => item.requestId === injected.requestId)
      const cold = proof.cold?.find(item => item.object === injected.object)
      const restored = proof.recovered?.find(item => item.object === injected.object)?.state
      if (row?.stage !== test.id || row.kind !== 'icon-copy' || row.object !== injected.object ||
          row.path !== '/api/icon-local-copy' || row.error !== 'net::ERR_CONNECTION_RESET' || row.status != null ||
          !cold || cold.entryPresent !== false || cold.bodyPresent !== false ||
          restored?.available !== true || restored.enabled !== true || restored.entryPresent !== true || restored.bodyPresent !== true ||
          !(restored.bodyBytes > 0) || !/^sha256-[a-f0-9]{64}$/.test(restored.bodyRevision ?? '') ||
          restored.bodyRevision !== restored.descriptor?.content_revision) continue
      ids.push(row.requestId)
    }
  }
  return ids
}
