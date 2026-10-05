/** Demand-driven batching, not polling. Storage owns transaction/lease checks. */
export function createIconTouchFlush(flush: () => Promise<void>, onError: (error: unknown) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  const run = () => { void flush().catch(onError) }
  function cancel() { if (timer !== null) clearTimeout(timer); timer = null }
  return {
    request() {
      if (disposed || timer !== null) return
      timer = setTimeout(() => { timer = null; run() }, 1000)
    },
    dispose() {
      if (disposed) return
      disposed = true
      const pending = timer !== null
      cancel()
      if (pending) run()
    },
  }
}
