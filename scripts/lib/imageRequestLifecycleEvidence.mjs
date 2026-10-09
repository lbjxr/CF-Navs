// Pure, conservative evidence matching. Network time/wallTime/terminal times are
// CDP seconds; probe timeOrigin/event.time and all returned wall times are ms.
// This does not classify any other cancellation, mutate journals, or inspect URLs.
const positiveId = value => Number.isSafeInteger(value) && value > 0
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const iconObject = value => typeof value === 'string' && /^(bookmark|category):[1-9]\d*$/.test(value)
const originValid = value => Number.isFinite(value) && value >= 0

function nativeImage(row) {
  return row?.kind === 'icon-body' && row.type === 'Image' && nonempty(row.requestId) &&
    nonempty(row.stage) && nonempty(row.documentLoaderId) && iconObject(row.object) &&
    originValid(row.imageLifecycle?.timeOrigin) && positiveId(row.imageLifecycle?.sourceId)
}

function wallRange(row, terminal) {
  if (![row.time, row.wallTime, row[terminal]].every(Number.isFinite) || row[terminal] < row.time) return null
  const start = row.wallTime * 1000
  const end = start + (row[terminal] - row.time) * 1000
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null
}

function completeEvent(event) {
  if (!event || !Number.isFinite(event.time) || event.time < 0 || !positiveId(event.nodeId) ||
      !iconObject(event.object) || !(event.sourceId === null || positiveId(event.sourceId))) return false
  if (event.kind === 'src-changed') return (event.previousSourceId === null || positiveId(event.previousSourceId)) &&
    (event.previousObject === null || iconObject(event.previousObject)) &&
    Array.isArray(event.changedQueryKeys) && event.changedQueryKeys.every(key => typeof key === 'string')
  if (!positiveId(event.sourceId)) return false
  if (event.kind === 'loaded') return typeof event.complete === 'boolean' &&
    Number.isFinite(event.naturalWidth) && event.naturalWidth >= 0 &&
    Number.isFinite(event.naturalHeight) && event.naturalHeight >= 0
  return event.kind === 'observed' || event.kind === 'removed' || event.kind === 'error'
}

function documentSnapshot(row, snapshots) {
  const sameDocument = snapshots.filter(snapshot => snapshot?.loaderId === row.documentLoaderId &&
    snapshot.timeOrigin === row.imageLifecycle.timeOrigin)
  // A later zero cannot repair an earlier gap. Stage is capture metadata here:
  // snapshots are cumulative within a document, whereas request stages must match.
  if (sameDocument.some(snapshot => snapshot.dropped > 0)) return null
  let best = null
  for (const snapshot of sameDocument) {
    if (snapshot.dropped === 0 && Array.isArray(snapshot.events) &&
        (!best || snapshot.events.length > best.events.length)) best = snapshot
  }
  if (!best || !best.events.every((event, index) => completeEvent(event) &&
      (index === 0 || event.time >= best.events[index - 1].time))) return null
  return best
}

function realImageResponse(row) {
  if (row.status !== 200 || row.error || row.canceled) return false
  const headers = Object.entries(row.headers ?? {})
  const contentTypes = headers.filter(([name]) => name.toLowerCase() === 'content-type')
  if (!contentTypes.length || !contentTypes.every(([, value]) => typeof value === 'string' &&
      /^image\/[a-z0-9!#$&^_.+-]+(?:\s*;|$)/i.test(value.trim()))) return false
  return !headers.some(([name, value]) => name.toLowerCase() === 'x-icon-fallback' &&
    String(value).split(',').some(part => part.trim() === '1'))
}

function continuousOwner(events, transitionIndex, loadedIndex, old, startWallTime) {
  const transition = events[transitionIndex]
  const loadedWallTime = old.imageLifecycle.timeOrigin + events[loadedIndex].time
  return !events.some((event, index) => {
    const wallTime = old.imageLifecycle.timeOrigin + event.time
    if (event.nodeId !== transition.nodeId || wallTime < startWallTime || wallTime > loadedWallTime) return false
    if (event.kind === 'removed') return true
    if (event.kind !== 'src-changed' || index === transitionIndex) return false
    // Before the refresh the owner must still use the old source; afterwards it
    // must keep the replacement. A switch away and back is not continuous proof.
    return event.sourceId !== (index < transitionIndex ? old.imageLifecycle.sourceId : transition.sourceId)
  })
}

// The deadline includes MutationObserver's existing 100ms delivery allowance.
// Only states observed by that deadline count; later mounts are not consumers of
// this canceled request. A src change on an already removed node does not reattach it.
function oldConsumersRetired(events, old, canceledWallTime) {
  const states = new Map()
  for (const event of events) {
    if (old.imageLifecycle.timeOrigin + event.time > canceledWallTime + 100) break
    const previous = states.get(event.nodeId)
    const connected = event.kind === 'removed' ? false : event.kind === 'observed' ? true : previous?.connected ?? true
    states.set(event.nodeId, { connected, sourceId: event.sourceId })
  }
  return ![...states.values()].some(state => state.connected && state.sourceId === old.imageLifecycle.sourceId)
}

function verifiedOwnerPath(events, transitionIndex, loadedIndex, old, startWallTime) {
  const transition = events[transitionIndex]
  const loaded = events[loadedIndex]
  if (loaded.nodeId === transition.nodeId) return continuousOwner(events, transitionIndex, loadedIndex, old, startWallTime)
  if (!continuousOwner(events, transitionIndex, transitionIndex, old, startWallTime)) return false

  // Cross-node success needs an explicit handoff, never just matching pixels.
  // The departing node must be removed with the replacement source still current.
  let removedIndex = -1
  for (let index = transitionIndex + 1; index < loadedIndex; index++) {
    const event = events[index]
    if (event.nodeId !== transition.nodeId) continue
    if (event.kind === 'src-changed') return false
    if (event.kind === 'removed') {
      if (event.sourceId !== transition.sourceId || event.object !== old.object) return false
      removedIndex = index
      break
    }
  }
  if (removedIndex < 0) return false

  // An existing node (even if re-observed later) is not proof of a fresh mount.
  const observedIndex = events.findIndex(event => event.nodeId === loaded.nodeId)
  const observed = events[observedIndex]
  if (observedIndex <= removedIndex || observedIndex >= loadedIndex || observed.kind !== 'observed' ||
      observed.object !== old.object || observed.sourceId !== transition.sourceId) return false
  for (let index = observedIndex + 1; index < loadedIndex; index++) {
    const event = events[index]
    if (event.nodeId === loaded.nodeId && (event.kind === 'removed' || event.kind === 'src-changed' ||
        event.sourceId !== transition.sourceId || event.object !== old.object)) return false
  }
  return true
}

/**
 * rows: the runner's request journal (headers contain Content-Type/X-Icon-Fallback).
 * snapshots: flat {loaderId, timeOrigin, dropped, events, ...captureMetadata} entries.
 * Returns only request-specific, unambiguous completed key-refresh evidence.
 */
export function verifiedSignedImageReplacements(rows, snapshots) {
  if (!Array.isArray(rows) || !Array.isArray(snapshots)) return []
  const candidates = []
  for (const old of rows) {
    if (!nativeImage(old) || old.error !== 'net::ERR_ABORTED' || old.canceled !== true ||
        (old.status != null && (!Number.isInteger(old.status) || old.status < 100 || old.status >= 400))) continue
    const canceled = wallRange(old, 'failureTime')
    if (!canceled) continue
    const snapshot = documentSnapshot(old, snapshots)
    if (!snapshot || !oldConsumersRetired(snapshot.events, old, canceled.end)) continue
    const { events, timeOrigin } = snapshot
    for (let transitionIndex = 0; transitionIndex < events.length; transitionIndex++) {
      const transition = events[transitionIndex]
      const transitionWallTime = timeOrigin + transition.time
      if (transition.kind !== 'src-changed' || transition.previousSourceId !== old.imageLifecycle.sourceId ||
          transition.object !== old.object || transition.previousObject !== old.object ||
          !positiveId(transition.sourceId) || transition.sourceId === old.imageLifecycle.sourceId ||
          transition.changedQueryKeys.length !== 1 || transition.changedQueryKeys[0] !== 'key' ||
          !Number.isFinite(transitionWallTime) || transitionWallTime < canceled.start ||
          transitionWallTime > canceled.end + 100 || Math.abs(transitionWallTime - canceled.end) > 500) continue
      const ownedBefore = events.slice(0, transitionIndex).some(event =>
        (event.kind === 'observed' || event.kind === 'src-changed') && event.nodeId === transition.nodeId &&
        event.sourceId === old.imageLifecycle.sourceId && event.object === old.object)
      if (!ownedBefore) continue
      for (const replacement of rows) {
        if (!nativeImage(replacement) || replacement.requestId === old.requestId || replacement.stage !== old.stage ||
            replacement.documentLoaderId !== old.documentLoaderId || replacement.object !== old.object ||
            replacement.imageLifecycle.timeOrigin !== timeOrigin || replacement.imageLifecycle.sourceId !== transition.sourceId ||
            !realImageResponse(replacement)) continue
        const finished = wallRange(replacement, 'finishedTime')
        if (!finished || finished.start < transitionWallTime - 100 || finished.start > transitionWallTime + 500) continue
        for (let loadedIndex = transitionIndex + 1; loadedIndex < events.length; loadedIndex++) {
          const loaded = events[loadedIndex]
          const loadedWallTime = timeOrigin + loaded.time
          if (loaded.kind !== 'loaded' || loaded.sourceId !== transition.sourceId ||
              loaded.object !== old.object || loaded.complete !== true || !(loaded.naturalWidth > 0 && loaded.naturalHeight > 0) ||
              !Number.isFinite(loadedWallTime) || loadedWallTime < transitionWallTime || loadedWallTime < finished.end - 100 ||
              !verifiedOwnerPath(events, transitionIndex, loadedIndex, old, canceled.start)) continue
          candidates.push({
            evidence: { requestId: old.requestId, replacementRequestId: replacement.requestId, object: old.object,
              nodeId: transition.nodeId, replacementNodeId: loaded.nodeId, timeOrigin, transitionWallTime, canceledWallTime: canceled.end, loadedWallTime,
              reason: 'signed-icon-key-refresh' },
            transitionKey: JSON.stringify([old.documentLoaderId, timeOrigin, transition.nodeId,
              transition.previousSourceId, transition.sourceId, transitionIndex, transitionWallTime]),
          })
          break
        }
      }
    }
  }

  // Never select the first request arbitrarily if the same transition/completion
  // could explain multiple Network IDs. Multiple verified consumers of the same
  // old/new request pair are valid shared-request evidence: keep the first full
  // chain as the representative, without turning them into extra exemptions.
  const byRequest = new Map()
  const byTransition = new Map()
  const byReplacement = new Map()
  for (const candidate of candidates) {
    const { requestId, replacementRequestId } = candidate.evidence
    if (!byRequest.has(requestId)) byRequest.set(requestId, new Map())
    if (!byRequest.get(requestId).has(replacementRequestId)) byRequest.get(requestId).set(replacementRequestId, candidate)
    for (const [map, key] of [[byTransition, candidate.transitionKey], [byReplacement, replacementRequestId]]) {
      if (!map.has(key)) map.set(key, new Set())
      map.get(key).add(requestId)
    }
  }
  const evidence = []
  for (const matches of byRequest.values()) {
    if (matches.size !== 1) continue
    const match = matches.values().next().value
    if (byTransition.get(match.transitionKey).size === 1 &&
        byReplacement.get(match.evidence.replacementRequestId).size === 1) evidence.push(match.evidence)
  }
  return evidence
}

/**
 * Proves only completed native category retry handoffs, never inferred failures.
 * baseSourceId is assigned by the runner within the document after removing only
 * `retry`; this module neither reads URLs nor treats key/version changes as retries.
 */
export function verifiedNativeCategoryRetries(rows, snapshots) {
  if (!Array.isArray(rows) || !Array.isArray(snapshots)) return []
  const candidates = []
  for (const old of rows) {
    if (!nativeImage(old) || !old.object.startsWith('category:') ||
        old.error !== 'net::ERR_ABORTED' || old.canceled !== true ||
        (old.status != null && old.status !== 200) ||
        !positiveId(old.imageLifecycle.baseSourceId) ||
        !Number.isSafeInteger(old.nativeRetryAttempt) || old.nativeRetryAttempt < 0) continue
    const canceled = wallRange(old, 'failureTime')
    if (!canceled || old.failureTime - old.time < 9) continue
    const snapshot = documentSnapshot(old, snapshots)
    if (!snapshot || !oldConsumersRetired(snapshot.events, old, canceled.end)) continue
    const { events, timeOrigin } = snapshot

    for (let removedIndex = 0; removedIndex < events.length; removedIndex++) {
      const removed = events[removedIndex]
      const removedWall = timeOrigin + removed.time
      if (removed.kind !== 'removed' || removed.sourceId !== old.imageLifecycle.sourceId ||
          removed.object !== old.object || !Number.isFinite(removedWall) ||
          Math.abs(removedWall - canceled.end) > 100) continue
      // A matching removed record alone does not establish the departing owner.
      const observedIndex = events.findIndex(event => event.nodeId === removed.nodeId &&
        (event.kind === 'observed' || event.kind === 'src-changed') &&
        event.sourceId === old.imageLifecycle.sourceId && event.object === old.object)
      if (observedIndex < 0 || observedIndex >= removedIndex ||
          events.slice(observedIndex + 1, removedIndex).some(event => event.nodeId === removed.nodeId &&
            (event.kind === 'removed' || event.kind === 'src-changed' ||
             event.sourceId !== removed.sourceId || event.object !== old.object))) continue

      for (let mountedIndex = removedIndex + 1; mountedIndex < events.length; mountedIndex++) {
        const mounted = events[mountedIndex]
        if (mounted.kind !== 'observed' || mounted.nodeId === removed.nodeId || mounted.object !== old.object ||
            mounted.sourceId === old.imageLifecycle.sourceId ||
            events.findIndex(event => event.nodeId === mounted.nodeId) !== mountedIndex) continue
        for (const replacement of rows) {
          if (!nativeImage(replacement) || replacement.requestId === old.requestId ||
              replacement.stage !== old.stage || replacement.documentLoaderId !== old.documentLoaderId ||
              replacement.object !== old.object || replacement.imageLifecycle.timeOrigin !== timeOrigin ||
              replacement.imageLifecycle.sourceId !== mounted.sourceId ||
              replacement.imageLifecycle.baseSourceId !== old.imageLifecycle.baseSourceId ||
              !Number.isSafeInteger(replacement.nativeRetryAttempt) ||
              replacement.nativeRetryAttempt !== old.nativeRetryAttempt + 1 || !realImageResponse(replacement)) continue
          const finished = wallRange(replacement, 'finishedTime')
          if (!finished || finished.start < canceled.end - 100 || finished.start > canceled.end + 12000) continue
          for (let loadedIndex = mountedIndex + 1; loadedIndex < events.length; loadedIndex++) {
            const loaded = events[loadedIndex]
            if (loaded.nodeId !== mounted.nodeId) continue
            // Once broken, this fresh-node ownership chain cannot be repaired by
            // switching back or by a later load from a different request.
            if (loaded.kind === 'removed' || loaded.kind === 'src-changed' || loaded.kind === 'error' ||
                loaded.sourceId !== mounted.sourceId || loaded.object !== old.object) break
            const loadedWall = timeOrigin + loaded.time
            if (loaded.kind !== 'loaded' || loaded.complete !== true ||
                !(loaded.naturalWidth > 0 && loaded.naturalHeight > 0) ||
                !Number.isFinite(loadedWall) || loadedWall < finished.end - 100) continue
            candidates.push({ requestId: old.requestId, replacementRequestId: replacement.requestId,
              object: old.object, nodeId: removed.nodeId, replacementNodeId: mounted.nodeId,
              timeOrigin, retryAttempt: replacement.nativeRetryAttempt, reason: 'completed-native-category-retry' })
            break
          }
        }
      }
    }
  }

  // Shared consumers may yield several chains for one pair. They do not yield
  // extra exemptions, and neither end may ambiguously match multiple Network IDs.
  const byOld = new Map()
  const byReplacement = new Map()
  for (const candidate of candidates) {
    if (!byOld.has(candidate.requestId)) byOld.set(candidate.requestId, new Map())
    if (!byOld.get(candidate.requestId).has(candidate.replacementRequestId)) {
      byOld.get(candidate.requestId).set(candidate.replacementRequestId, candidate)
    }
    if (!byReplacement.has(candidate.replacementRequestId)) byReplacement.set(candidate.replacementRequestId, new Set())
    byReplacement.get(candidate.replacementRequestId).add(candidate.requestId)
  }
  const evidence = []
  for (const matches of byOld.values()) {
    if (matches.size !== 1) continue
    const match = matches.values().next().value
    if (byReplacement.get(match.replacementRequestId).size === 1) evidence.push(match)
  }
  return evidence
}

// An explicit runner navigation retires the old document. Only canceled native
// read-only icon requests inside that confirmed navigation interval qualify.
export function verifiedNavigationImageCancellations(rows, navigations) {
  const result=[]
  for(const row of rows) {
    if(row?.type!=='Image'||row.kind!=='icon-body'||row.method!=='GET'||row.error!=='net::ERR_ABORTED'||row.canceled!==true||row.status!=null&&row.status!==200||!nonempty(row.requestId)||!nonempty(row.documentLoaderId))continue
    const range=wallRange(row,'failureTime')
    if(!range)continue
    const matches=navigations.filter(nav=>nav?.completed===true&&nav.beforeLoaderId===row.documentLoaderId&&nonempty(nav.afterLoaderId)&&nav.afterLoaderId!==nav.beforeLoaderId&&Number.isFinite(nav.startedAt)&&Number.isFinite(nav.committedAt)&&nav.committedAt>=nav.startedAt&&range.start<=nav.committedAt&&range.end>=nav.startedAt-100&&range.end<=nav.committedAt+200)
    if(matches.length!==1)continue
    result.push({requestId:row.requestId,navigationId:matches[0].id,oldLoaderId:row.documentLoaderId,newLoaderId:matches[0].afterLoaderId,reason:'explicit-document-replacement'})
  }
  return result
}

// A real same-container Blob load plus matching native storage bytes proves the
// local copy took over. A source change alone or a successful API is insufficient.
export function verifiedLocalImageAdoptions(rows, snapshots) {
  const result=[]
  for(const row of rows){
    if(!nativeImage(row)||row.method!=='GET'||row.error!=='net::ERR_ABORTED'||row.canceled!==true||row.status!=null&&row.status!==200)continue
    const range=wallRange(row,'failureTime'),snapshot=documentSnapshot(row,snapshots)
    if(!range||!snapshot||!oldConsumersRetired(snapshot.events,row,range.end))continue
    const adoptions=snapshots.filter(s=>s.loaderId===row.documentLoaderId&&s.timeOrigin===row.imageLifecycle.timeOrigin&&s.dropped===0).flatMap(s=>s.adoptions??[])
    const adoption=adoptions.find(a=>{
      if(a.object!==row.object||!a.persisted||a.error||!/^sha256-[a-f0-9]{64}$/.test(a.revision)||!(a.byteLength>0&&a.naturalWidth>0&&a.naturalHeight>0)||!positiveId(a.previousNodeId))return false
      const at=snapshot.timeOrigin+a.loadedAt
      if(!Number.isFinite(at)||at<range.start||at>range.end+20000)return false
      const history=snapshot.events.filter(e=>e.nodeId===a.previousNodeId&&snapshot.timeOrigin+e.time<=at)
      let source=row.imageLifecycle.sourceId,seen=false
      for(const event of history){
        if(!seen){if(event.sourceId===source&&event.object===row.object&&['observed','src-changed'].includes(event.kind))seen=true;continue}
        if(event.kind==='error')return false
        if(event.kind==='src-changed'&&event.previousSourceId===source){
          if(event.object!==row.object||event.previousObject!==row.object||event.changedQueryKeys.some(key=>key!=='key'))return false
          source=event.sourceId
        }
      }
      return seen&&source===a.previousSourceId
    })
    if(adoption)result.push({requestId:row.requestId,object:row.object,revision:adoption.revision,reason:'rendered-persisted-local-copy'})
  }
  return result
}

export function verifiedLogoutCopyCancellations(rows) {
  return rows.filter(row=>{
    if(row.kind!=='icon-copy'||row.path!=='/api/icon-local-copy'||row.method!=='POST'||row.error!=='net::ERR_ABORTED'||row.canceled!==true||row.status!=null&&row.status!==200||!positiveId(row.authSession))return false
    const range=wallRange(row,'failureTime');if(!range)return false
    const matches=rows.filter(logout=>{
      if(logout.path!=='/api/logout'||logout.method!=='POST'||logout.status!==200||logout.logoutRevoked!==true||logout.authSession!==row.authSession)return false
      const end=wallRange(logout,'finishedTime');return end&&range.start<=end.start&&range.end>=end.start-100&&range.end<=end.end+200
    })
    return matches.length===1
  }).map(row=>row.requestId)
}

export function verifiedUiImageCancellations(rows, snapshots, transitions) {
  const result=[]
  for(const row of rows) {
    if(!nativeImage(row)||row.method!=='GET'||row.error!=='net::ERR_ABORTED'||row.canceled!==true||row.status!=null&&row.status!==200)continue
    const range=wallRange(row,'failureTime'),snapshot=documentSnapshot(row,snapshots)
    if(!range||!snapshot)continue
    const matches=transitions.filter(item=>item.kind==='admin'&&item.completed===true&&item.beforeLoaderId===row.documentLoaderId&&item.afterLoaderId===row.documentLoaderId&&
      Number.isFinite(item.startedAt)&&Number.isFinite(item.completedAt)&&item.completedAt>=item.startedAt&&range.end>=item.startedAt-20&&range.end<=item.completedAt+200)
    if(matches.length!==1)continue
    const owners=new Set(snapshot.events.filter(event=>event.sourceId===row.imageLifecycle.sourceId&&event.object===row.object&&snapshot.timeOrigin+event.time<=range.end).map(event=>event.nodeId))
    const observed=snapshot.events.some(event=>event.kind==='observed'&&event.sourceId===row.imageLifecycle.sourceId&&event.object===row.object&&snapshot.timeOrigin+event.time<=range.end)
    const retired=snapshot.events.some(event=>Math.abs(snapshot.timeOrigin+event.time-range.end)<=200&&
      (event.kind==='removed'&&owners.has(event.nodeId)&&event.object===row.object||event.kind==='src-changed'&&event.previousSourceId===row.imageLifecycle.sourceId&&event.previousObject===row.object&&event.sourceId!==row.imageLifecycle.sourceId))
    if(observed&&retired&&oldConsumersRetired(snapshot.events,row,range.end))result.push({requestId:row.requestId,transitionId:matches[0].id,reason:'verified-ui-consumer-removal'})
  }
  return result
}
