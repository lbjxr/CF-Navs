import { describe, expect, it, vi } from 'vitest'
import { createLazyComponentLoader } from '../../../src/lib/appLazyComponent'

describe('app lazy component helper', () => {
  it('loads a component once for concurrent ensure calls', async () => {
    const component = { name: 'AdminComponent' }
    let current: typeof component | null = null
    let resolveLoad: ((module: { default: typeof component }) => void) | null = null
    const load = vi.fn(() => new Promise<{ default: typeof component }>((resolve) => {
      resolveLoad = resolve
    }))

    const ensure = createLazyComponentLoader({
      load,
      getCurrent: () => current,
      setCurrent: (next) => {
        current = next
      },
    })

    const first = ensure()
    const second = ensure()
    expect(load).toHaveBeenCalledTimes(1)

    resolveLoad?.({ default: component })
    await Promise.all([first, second])

    expect(current).toBe(component)
  })

  it('does not reload after a component is already available', async () => {
    const component = { name: 'LoginModal' }
    const load = vi.fn(async () => ({ default: component }))
    const ensure = createLazyComponentLoader({
      load,
      getCurrent: () => component,
      setCurrent: vi.fn(),
    })

    await ensure()

    expect(load).not.toHaveBeenCalled()
  })

  it('clears failed pending loads so the next ensure can retry', async () => {
    const component = { name: 'BookmarkEditModal' }
    let current: typeof component | null = null
    const load = vi
      .fn<[], Promise<{ default: typeof component }>>()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce({ default: component })

    const ensure = createLazyComponentLoader({
      load,
      getCurrent: () => current,
      setCurrent: (next) => {
        current = next
      },
    })

    await expect(ensure()).rejects.toThrow('load failed')
    await ensure()

    expect(load).toHaveBeenCalledTimes(2)
    expect(current).toBe(component)
  })
})
