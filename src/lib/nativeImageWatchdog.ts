/** Observes native image loading only; source selection and error recovery belong to the caller. */
export function createNativeImageWatchdog(
  image: HTMLImageElement,
  onTimeout: (url: string) => void,
  timeoutMs = 10000,
): { update(input: { url: string; enabled: boolean }): void; destroy(): void } {
  const document = image.ownerDocument
  const window = document.defaultView!
  const timedOutUrls = new Set<string>()
  let url = ''
  let enabled = false
  let destroyed = false
  let settled = false
  let visible = false
  let timer: number | undefined
  let generation = 0

  function cancel() {
    generation++
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  }

  function inViewport() {
    const rect = image.getBoundingClientRect()
    const width = window.innerWidth || document.documentElement.clientWidth
    const height = window.innerHeight || document.documentElement.clientHeight
    return rect.width > 0 && rect.height > 0 && width > 0 && height > 0
      && rect.bottom > 0 && rect.right > 0 && rect.top < height && rect.left < width
  }

  function matchesRequestedSource() {
    try { return image.src === new URL(url, document.baseURI).href } catch { return false }
  }

  function matchesSource() {
    try { return (image.currentSrc || image.src) === new URL(url, document.baseURI).href } catch { return false }
  }

  function canWait() {
    return !destroyed && enabled && !!url && !settled && !timedOutUrls.has(url)
      && visible && !document.hidden && window.navigator.onLine !== false
  }

  function reconcile() {
    if (destroyed) return
    if (!observer) visible = inViewport()
    if (matchesSource() && image.complete && image.naturalWidth > 0) settled = true
    if (!canWait()) {
      cancel()
      return
    }
    if (timer !== undefined) return
    const expectedGeneration = generation
    const expectedUrl = url
    timer = window.setTimeout(() => {
      // Clearing a timeout cannot revoke an already queued callback.
      if (destroyed || expectedGeneration !== generation || expectedUrl !== url) return
      timer = undefined
      if (!observer) visible = inViewport()
      if (matchesSource() && image.complete && image.naturalWidth > 0) settled = true
      if (!canWait() || !matchesRequestedSource()) return
      settled = true
      timedOutUrls.add(expectedUrl)
      onTimeout(expectedUrl)
    }, timeoutMs)
  }

  const observer = typeof window.IntersectionObserver === 'function'
    ? new window.IntersectionObserver((entries) => {
      if (destroyed) return
      for (const entry of entries) {
        if (entry.target !== image) continue
        visible = entry.isIntersecting && entry.intersectionRatio > 0
          && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0
        reconcile()
      }
    }, { root: null, rootMargin: '0px', threshold: 0 })
    : null

  function finish(event: Event) {
    if (destroyed || !enabled || !matchesSource()) return
    if (event.type === 'load' && (!image.complete || image.naturalWidth <= 0)) return
    settled = true
    cancel()
  }

  image.addEventListener('load', finish)
  image.addEventListener('error', finish)
  document.addEventListener('visibilitychange', reconcile)
  window.addEventListener('online', reconcile)
  window.addEventListener('offline', reconcile)
  if (observer) observer.observe(image)
  else {
    // Capture also wakes the fallback when a nested scrolling container moves.
    window.addEventListener('scroll', reconcile, true)
    window.addEventListener('resize', reconcile)
  }

  return {
    update(input) {
      if (destroyed || (url === input.url && enabled === input.enabled)) return
      cancel()
      url = input.url
      enabled = input.enabled
      settled = false
      reconcile()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      cancel()
      observer?.disconnect()
      image.removeEventListener('load', finish)
      image.removeEventListener('error', finish)
      document.removeEventListener('visibilitychange', reconcile)
      window.removeEventListener('online', reconcile)
      window.removeEventListener('offline', reconcile)
      window.removeEventListener('scroll', reconcile, true)
      window.removeEventListener('resize', reconcile)
      timedOutUrls.clear()
    },
  }
}
