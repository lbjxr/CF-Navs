import { describe, expect, it } from 'vitest'
import {
  createBookmarkFaviconState,
  resolveBookmarkFavicon,
  scheduleBookmarkFaviconLookup,
} from '../../../src/lib/bookmarkFaviconController'

describe('bookmark favicon controller', () => {
  it('deduplicates URLs and invalidates stale responses', () => {
    const first = scheduleBookmarkFaviconLookup(createBookmarkFaviconState(), 'https://one.example/')
    expect(first.task?.requestId).toBeTruthy()

    const second = scheduleBookmarkFaviconLookup(first.state, 'https://two.example/')
    const stale = resolveBookmarkFavicon(second.state, { requestId: first.task!.requestId, icon: '/old.ico' })
    expect(stale.icon).toBe('')

    const current = resolveBookmarkFavicon(second.state, { requestId: second.task!.requestId, icon: '/new.ico' })
    expect(current.icon).toBe('/new.ico')

    const duplicate = scheduleBookmarkFaviconLookup(current, 'https://two.example/')
    expect(duplicate.task).toBeNull()
  })

  it('clears state when URL becomes invalid', () => {
    const state = scheduleBookmarkFaviconLookup(createBookmarkFaviconState(), 'https://example.com/').state
    const cleared = scheduleBookmarkFaviconLookup(state, 'not a url')
    expect(cleared.task).toBeNull()
    expect(cleared.state.icon).toBe('')
    expect(cleared.state.loading).toBe(false)
  })
})
