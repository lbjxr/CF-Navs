// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  createOrdinaryIconScheduler,
  OrdinaryIconCancelledError,
  type OrdinaryIconPriority,
  type OrdinaryIconSchedulerEvent,
} from '../../../src/lib/ordinaryIconScheduler'

interface Deferred {
  resolve: (value: string) => void
  reject: (reason: unknown) => void
  signal: AbortSignal
}

function makeHarness(concurrency: number) {
  const events: OrdinaryIconSchedulerEvent[] = []
  const deferreds = new Map<string, Deferred>()
  const runCalls: string[] = []
  let currentNow = 0
  const scheduler = createOrdinaryIconScheduler<string>({
    concurrency,
    now: () => currentNow,
    onEvent: event => events.push(event),
    run: (key, signal) => {
      runCalls.push(key)
      return new Promise<string>((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort)
        deferreds.set(key, {
          signal,
          resolve: value => {
            signal.removeEventListener('abort', onAbort)
            resolve(value)
          },
          reject: reason => {
            signal.removeEventListener('abort', onAbort)
            reject(reason)
          },
        })
      })
    },
  })
  // Wrap reserve so every shared promise has a silent handler attached up front;
  // released/cancelled reservations reject, and tests assert on the originals
  // via extra handlers without leaking unhandled rejections during teardown.
  // Awaiting a reservation promise is the deterministic settle signal: the
  // scheduler resolves it inside settle() and runs pump() synchronously before
  // the awaiting continuation, so the next task has already started.
  const reserve = (key: string, priority?: OrdinaryIconPriority) => {
    const reservation = scheduler.reserve(key, priority)
    reservation.promise.catch(() => {})
    return reservation
  }
  return {
    scheduler,
    reserve,
    events,
    deferreds,
    runCalls,
    setNow: (value: number) => { currentNow = value },
  }
}

describe('ordinary icon scheduler', () => {
  it('runs at most `concurrency` tasks at once and starts the next only after one settles', async () => {
    const h = makeHarness(2)
    const reservations = ['a', 'b', 'c', 'd', 'e'].map(key => h.reserve(key))
    expect(h.runCalls).toEqual(['a', 'b'])
    expect(h.scheduler.inFlight).toBe(2)
    expect(h.scheduler.queued).toBe(3)

    h.deferreds.get('a')!.resolve('A')
    await reservations[0].promise
    expect(h.runCalls).toEqual(['a', 'b', 'c'])
    expect(h.scheduler.inFlight).toBe(2)
    expect(h.scheduler.queued).toBe(2)

    reservations.forEach(reservation => reservation.release())
  })

  it('drains visible work before preload work when a slot frees', async () => {
    const h = makeHarness(1)
    const blocker = h.reserve('block', 'visible')
    const preload = h.reserve('p', 'preload')
    const visible = h.reserve('v', 'visible')
    expect(h.runCalls).toEqual(['block'])

    h.deferreds.get('block')!.resolve('B')
    await blocker.promise
    expect(h.runCalls).toEqual(['block', 'v'])

    h.deferreds.get('v')!.resolve('V')
    await visible.promise
    expect(h.runCalls).toEqual(['block', 'v', 'p'])

    h.deferreds.get('p')!.resolve('P')
    await preload.promise
    blocker.release()
    preload.release()
    visible.release()
  })

  it('dedupes concurrent reservations for one key into a single run sharing one promise', async () => {
    const h = makeHarness(2)
    const first = h.reserve('same')
    const second = h.reserve('same')
    expect(h.runCalls).toEqual(['same'])
    expect(first.promise).toBe(second.promise)

    h.deferreds.get('same')!.resolve('shared-value')
    await expect(first.promise).resolves.toBe('shared-value')
    await expect(second.promise).resolves.toBe('shared-value')

    first.release()
    second.release()
  })

  it('cancels a still-queued key when its last reservation releases, before any run', async () => {
    const h = makeHarness(1)
    const blocker = h.reserve('block')
    const queued = h.reserve('q')
    const rejection = expect(queued.promise).rejects.toBeInstanceOf(OrdinaryIconCancelledError)
    expect(h.scheduler.queued).toBe(1)

    queued.release()
    await rejection
    expect(h.runCalls).toEqual(['block'])
    expect(h.scheduler.queued).toBe(0)
    expect(h.events.some(event => event.type === 'cancelled' && event.key === 'q' && event.started === false)).toBe(true)

    h.deferreds.get('block')!.resolve('B')
    blocker.release()
  })

  it('keeps a queued key alive when one of its reservations releases but another remains', async () => {
    const h = makeHarness(1)
    const blocker = h.reserve('block')
    const firstQ = h.reserve('q')
    const secondQ = h.reserve('q')
    expect(h.scheduler.queued).toBe(1)

    firstQ.release()
    expect(h.scheduler.queued).toBe(1)
    expect(h.runCalls).toEqual(['block'])

    h.deferreds.get('block')!.resolve('B')
    await blocker.promise
    expect(h.runCalls).toEqual(['block', 'q'])

    h.deferreds.get('q')!.resolve('Q')
    await expect(secondQ.promise).resolves.toBe('Q')

    blocker.release()
    secondQ.release()
  })

  it('aborts the run signal and emits cancelled(started) when the last reservation of a running key releases', async () => {
    const h = makeHarness(1)
    const reservation = h.reserve('r')
    const signal = h.deferreds.get('r')!.signal
    expect(signal.aborted).toBe(false)
    const rejection = expect(reservation.promise).rejects.toMatchObject({ name: 'AbortError' })

    reservation.release()
    expect(signal.aborted).toBe(true)
    expect(h.events.some(event => event.type === 'cancelled' && event.key === 'r' && event.started === true)).toBe(true)

    await rejection
  })

  it('does not abort a shared run when only one of its reservations releases', async () => {
    const h = makeHarness(1)
    const first = h.reserve('shared')
    const second = h.reserve('shared')
    const signal = h.deferreds.get('shared')!.signal

    first.release()
    expect(signal.aborted).toBe(false)

    h.deferreds.get('shared')!.resolve('ok')
    await expect(second.promise).resolves.toBe('ok')
    second.release()
  })

  it('records waitedMs as the enqueue-to-start delay using the injected clock', async () => {
    const h = makeHarness(1)
    h.setNow(1000)
    const blocker = h.reserve('block')
    const waiter = h.reserve('wait')
    h.setNow(1250)

    h.deferreds.get('block')!.resolve('B')
    await blocker.promise
    const blockStarted = h.events.find(event => event.type === 'started' && event.key === 'block')
    const waitStarted = h.events.find(event => event.type === 'started' && event.key === 'wait')
    // The blocker ran immediately (no wait) even though the clock advanced
    // afterwards; the waiter's wait is purely its queued time.
    expect(blockStarted).toMatchObject({ type: 'started', key: 'block', waitedMs: 0 })
    expect(waitStarted).toMatchObject({ type: 'started', key: 'wait', waitedMs: 250 })

    h.deferreds.get('wait')!.resolve('W')
    await waiter.promise
    blocker.release()
    waiter.release()
  })

  it('reports settled with the run outcome and a runMs duration for both success and failure', async () => {
    const h = makeHarness(2)
    h.setNow(100)
    const ok = h.reserve('ok')
    const bad = h.reserve('bad')

    h.setNow(180)
    h.deferreds.get('ok')!.resolve('done')
    await expect(ok.promise).resolves.toBe('done')

    h.setNow(240)
    const boom = new Error('boom')
    h.deferreds.get('bad')!.reject(boom)
    await expect(bad.promise).rejects.toBe(boom)

    const okSettled = h.events.find(event => event.type === 'settled' && event.key === 'ok')
    const badSettled = h.events.find(event => event.type === 'settled' && event.key === 'bad')
    expect(okSettled).toEqual({ type: 'settled', key: 'ok', outcome: 'fulfilled', runMs: 80 })
    expect(badSettled).toEqual({ type: 'settled', key: 'bad', outcome: 'rejected', runMs: 140 })

    ok.release()
    bad.release()
  })

  it('starts queued work immediately when setConcurrency raises the limit', async () => {
    const h = makeHarness(1)
    const a = h.reserve('a')
    const b = h.reserve('b')
    const c = h.reserve('c')
    expect(h.runCalls).toEqual(['a'])
    expect(h.scheduler.inFlight).toBe(1)
    expect(h.scheduler.queued).toBe(2)

    h.scheduler.setConcurrency(3)
    expect(h.runCalls).toEqual(['a', 'b', 'c'])
    expect(h.scheduler.inFlight).toBe(3)
    expect(h.scheduler.queued).toBe(0)

    h.deferreds.get('a')!.resolve('A')
    h.deferreds.get('b')!.resolve('B')
    h.deferreds.get('c')!.resolve('C')
    await Promise.all([a.promise, b.promise, c.promise])
    a.release()
    b.release()
    c.release()
  })

  it('ignores a repeated release and never cancels a key another reservation still holds', async () => {
    const h = makeHarness(1)
    const blocker = h.reserve('block')
    const a = h.reserve('q')
    const b = h.reserve('q')

    a.release()
    a.release()
    expect(h.scheduler.queued).toBe(1)
    expect(h.events.some(event => event.type === 'cancelled' && event.key === 'q')).toBe(false)

    h.deferreds.get('block')!.resolve('B')
    await blocker.promise
    expect(h.runCalls).toEqual(['block', 'q'])

    h.deferreds.get('q')!.resolve('Q')
    await expect(b.promise).resolves.toBe('Q')

    blocker.release()
    b.release()
  })

  it('emits queued, then started, then settled in order with the documented fields', async () => {
    const h = makeHarness(1)
    h.setNow(500)
    const reservation = h.reserve('solo', 'preload')

    h.deferreds.get('solo')!.resolve('value')
    await expect(reservation.promise).resolves.toBe('value')

    const forKey = h.events.filter(event => event.key === 'solo')
    expect(forKey.map(event => event.type)).toEqual(['queued', 'started', 'settled'])
    expect(forKey[0]).toEqual({ type: 'queued', key: 'solo', priority: 'preload', queueDepth: 1 })
    expect(forKey[1]).toEqual({ type: 'started', key: 'solo', waitedMs: 0, inFlight: 1 })
    expect(forKey[2]).toEqual({ type: 'settled', key: 'solo', outcome: 'fulfilled', runMs: 0 })

    reservation.release()
  })
})
