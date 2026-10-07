/**
 * Serialize as '(' + pageInstallImageLifecycleProbe.toString() + ')()' for CDP.
 * Observes native img[src] only: no srcset selection, fetch/XHR hooks or cancellation
 * verdicts. Times are performance.now() at observation, not mutation/request times.
 * URL strings stay in this installation's closure; sourceId() joins Network URLs to
 * events without exporting URLs. Query-key names (never values) are diagnostic data.
 * Kinds: observed (initial/inserted), src-changed (including attribute removal),
 * removed (disconnected node), loaded, error. read() drains queued mutations;
 * stop() drains once, disconnects, and retains the final snapshot for correlation.
 */
export function pageInstallImageLifecycleProbe() {
  if (window.__issueImageLifecycle) return { installed: false }

  const limit = 2000
  const events = []
  const nodes = new WeakMap()
  const sources = new Map()
  const timeOrigin = performance.timeOrigin
  let nextNodeId = 1
  let nextSourceId = 1
  let start = 0
  let dropped = 0
  let stopped = false

  function parse(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null
    try { return new URL(raw, document.baseURI) } catch { return null }
  }

  function sourceId(raw) {
    const url = parse(raw)
    if (!url) return null
    if (!sources.has(url.href)) sources.set(url.href, nextSourceId++)
    return sources.get(url.href)
  }

  function object(url) {
    if (!url || url.origin !== location.origin) return null
    const match = /^\/api\/(icon|category-icon)\/([1-9]\d*)$/.exec(url.pathname)
    return match ? (match[1] === 'icon' ? 'bookmark:' : 'category:') + match[2] : null
  }

  function nodeId(image) {
    if (!nodes.has(image)) nodes.set(image, nextNodeId++)
    return nodes.get(image)
  }

  function record(kind, image, url, owner, extra = {}) {
    const event = {
      kind, time: performance.now(), nodeId: nodeId(image),
      sourceId: sourceId(url?.href), object: owner, ...extra,
    }
    if (events.length < limit) events.push(event)
    else {
      events[start] = event
      start = (start + 1) % limit
      dropped++
    }
  }

  function changedQueryKeys(previous, current) {
    const before = previous?.searchParams ?? new URLSearchParams()
    const after = current?.searchParams ?? new URLSearchParams()
    return [...new Set([...before.keys(), ...after.keys()])]
      .filter(key => JSON.stringify(before.getAll(key)) !== JSON.stringify(after.getAll(key)))
      .sort()
  }

  function imagesIn(node) {
    const images = node instanceof HTMLImageElement ? [node] : []
    if (node.querySelectorAll) images.push(...node.querySelectorAll('img'))
    return images
  }

  function observeImage(kind, image, raw) {
    const url = parse(raw)
    const owner = object(url)
    if (owner) record(kind, image, url, owner)
  }

  function mutations(records) {
    // MutationRecord has no newValue. Walking backwards recovers each intermediate
    // value from the *next record's oldValue*, not an invented last-seen URL.
    // The same reconstruction gives child-list events their source at that step.
    const nextValues = new Map()
    const removed = new WeakSet()
    const steps = new Array(records.length)
    for (let i = records.length - 1; i >= 0; i--) {
      const mutation = records[i]
      const valueAtStep = image => nextValues.has(image)
        ? nextValues.get(image) : image.getAttribute('src')
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
        steps[i] = [{ kind: 'src-changed', image: mutation.target,
          previous: mutation.oldValue, current: valueAtStep(mutation.target) }]
        nextValues.set(mutation.target, mutation.oldValue)
      } else if (mutation.type === 'childList') {
        steps[i] = []
        for (const node of mutation.removedNodes) {
          for (const image of imagesIn(node)) {
            // Only the final removal counts if reparenting precedes a detach in
            // this batch. A plain reparent has isConnected === true and is ignored.
            if (!image.isConnected && !removed.has(image)) {
              removed.add(image)
              steps[i].push({ kind: 'removed', image, current: valueAtStep(image) })
            }
          }
        }
        for (const node of mutation.addedNodes) {
          for (const image of imagesIn(node)) {
            steps[i].push({ kind: 'observed', image, current: valueAtStep(image) })
          }
        }
      }
    }
    const observed = new WeakSet()
    for (const batch of steps) {
      for (const step of batch ?? []) {
        if (step.kind !== 'src-changed') {
          // Live added subtrees can also appear in descendant child-list records.
          if (step.kind === 'observed') {
            if (observed.has(step.image)) continue
            observed.add(step.image)
          }
          observeImage(step.kind, step.image, step.current)
          continue
        }
        const previous = parse(step.previous)
        const current = parse(step.current)
        if (previous?.href === current?.href) continue
        const previousObject = object(previous)
        const currentObject = object(current)
        if (!previousObject && !currentObject) continue
        // On removal/replacement with an out-of-scope source, object still identifies
        // the departing icon. sourceId is null for absent/empty/invalid src, otherwise
        // the current opaque URL ID; previousObject disambiguates cross-owner changes.
        record('src-changed', step.image, current, currentObject ?? previousObject, {
          previousSourceId: sourceId(previous?.href), previousObject,
          changedQueryKeys: changedQueryKeys(previous, current),
        })
      }
    }
  }

  const observer = new MutationObserver(mutations)
  function flush() {
    if (!stopped) mutations(observer.takeRecords())
  }

  function imageEvent(event) {
    const image = event.target
    if (!(image instanceof HTMLImageElement)) return
    flush()
    // A native event exposes no Network requestId; this is the DOM source at
    // capture time, not proof that a particular request completed or was cancelled.
    const url = parse(image.getAttribute('src'))
    const owner = object(url)
    if (!owner) return
    record(event.type === 'load' ? 'loaded' : 'error', image, url, owner,
      event.type === 'load' ? {
        complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      } : {})
  }

  observer.observe(document, { subtree: true, childList: true,
    attributes: true, attributeFilter: ['src'], attributeOldValue: true })
  document.addEventListener('load', imageEvent, true)
  document.addEventListener('error', imageEvent, true)
  for (const image of document.querySelectorAll('img')) observeImage('observed', image, image.getAttribute('src'))

  window.__issueImageLifecycle = {
    sourceId,
    read() {
      flush()
      const ordered = events.slice(start).concat(events.slice(0, start))
      return { timeOrigin, dropped, events: ordered.map(event => ({ ...event,
        ...(event.changedQueryKeys ? { changedQueryKeys: [...event.changedQueryKeys] } : {}),
      })) }
    },
    stop() {
      flush()
      stopped = true
      observer.disconnect()
      document.removeEventListener('load', imageEvent, true)
      document.removeEventListener('error', imageEvent, true)
    },
  }
  return { installed: true }
}
