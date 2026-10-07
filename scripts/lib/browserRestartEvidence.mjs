const validCopy = record => record?.available === true && record.enabled === true && record.entryPresent === true && record.bodyPresent === true &&
  Number.isSafeInteger(record.bodyBytes) && record.bodyBytes > 0 && record.descriptor?.state === 'ready' &&
  /^[a-f0-9]{32}$/.test(record.descriptor.dataset_epoch ?? '') && Number.isSafeInteger(record.descriptor.write_epoch) && record.descriptor.write_epoch >= 0 &&
  /^sha256-[a-f0-9]{64}$/.test(record.bodyRevision ?? '') && record.bodyRevision === record.descriptor.content_revision

// Pure acceptance of a real process restart. No refresh/tab replacement can
// satisfy the close-count, ownership, same-profile and persisted-body gates.
export function assessBrowserRestartEvidence(evidence) {
  const errors = [], {mode, restart, before, after, requests = [], fixtureKeys = []} = evidence
  const old = restart?.previous, next = restart?.current, closed = restart?.closed
  const positive = value => Number.isSafeInteger(value) && value > 0
  if (!['online','offline'].includes(mode)) errors.push('unknown-mode')
  if (!old || !next || !positive(old.pid) || !positive(next.pid) || old.pid === next.pid ||
      typeof old.targetId !== 'string' || !old.targetId || typeof next.targetId !== 'string' || !next.targetId || old.targetId === next.targetId ||
      typeof old.profile !== 'string' || !old.profile || old.profile !== next.profile || restart.sameProfile !== true) errors.push('not-new-browser-same-profile')
  if (!positive(old?.remainingProcesses) || closed?.startedByTest !== true || closed.targetClosed !== true || closed.browserClosed !== true ||
      closed.remainingProcesses !== 0 || closed.profilePreserved !== true || closed.profileRemoved !== false ||
      !Array.isArray(closed.errors) || closed.errors.length || !Array.isArray(closed.warnings) || closed.warnings.length) errors.push('old-browser-not-proven-closed')
  for (const state of [before, after]) if (state?.authenticated !== true || state.trusted !== true || state.enabledForPage !== true || state.phase !== 'ready' ||
      state.hasLease !== true || state.privateVisible !== true || state.blobImages !== true || state.imagesPassed !== true) { errors.push('invalid-visible-authorized-state'); break }
  if (after?.markerPreserved !== true || after.sameSession !== true || after.newDocument !== true) errors.push('profile-or-session-not-retained')
  if (fixtureKeys.length < 2 || new Set(fixtureKeys).size !== fixtureKeys.length || !fixtureKeys.every(key => /^(bookmark|category):[1-9]\d*$/.test(key)) ||
      !fixtureKeys.some(key=>key.startsWith('bookmark:')) || !fixtureKeys.some(key=>key.startsWith('category:'))) errors.push('missing-fixture-manifest')
  const descriptorKeys=['object_type','object_id','dataset_epoch','write_epoch','content_revision','state']
  for (const key of fixtureKeys) {
    const a=before?.copies?.find(copy=>copy.key===key)?.record, b=after?.copies?.find(copy=>copy.key===key)?.record
    if (!validCopy(a) || !validCopy(b) || a.bodyBytes!==b.bodyBytes || a.bodyRevision!==b.bodyRevision ||
        !descriptorKeys.every(field=>a.descriptor[field]===b.descriptor[field]) ||
        key!==b.descriptor.object_type+':'+b.descriptor.object_id) errors.push('copy-not-retained:'+key)
  }
  const logins=requests.filter(row=>row.path==='/api/login')
  if(logins.length)errors.push('relogin-would-mask-restart')
  const bodyRequests=requests.filter(row=>fixtureKeys.includes(row.object)&&['icon-body','icon-copy'].includes(row.kind))
  if(bodyRequests.length)errors.push('reacquired-fixture-body')
  const metadata=requests.filter(row=>['/api/data/version','/api/admin/data'].includes(row.path)&&row.status===200&&row.authSession!=null)
  if(mode==='online'&&!metadata.length)errors.push('no-real-authenticated-refresh')
  if(mode==='offline'&&(after?.offlineDuringNavigation!==true||metadata.length||!requests.some(row=>row.error==='net::ERR_INTERNET_DISCONNECTED'&&row.kind==='api')))errors.push('offline-not-exercised')
  return {passed:errors.length===0,errors,mode,loginRequests:logins.length,fixtureBodyRequests:bodyRequests.length,authenticatedMetadataRequests:metadata.length}
}
