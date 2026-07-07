import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IconifyCandidate } from '../../shared/types'
import {
  ICONIFY_SEARCH_DEBOUNCE_MS,
  createBookmarkIconifySearchState,
  deriveBookmarkIconifyView,
  initializeBookmarkIconifySelection,
  resolveBookmarkIconifySearchError,
  resolveBookmarkIconifySearchSuccess,
  scheduleBookmarkIconifyCandidateSearch,
  selectBookmarkIconifyIcon,
  selectBookmarkIconifySearchCandidate,
  shouldResetBookmarkIconifyConfirmation,
} from '../../src/lib/bookmarkIconifyController'

const homeCandidate: IconifyCandidate = {
  name: 'mdi:home',
  prefix: 'mdi',
  icon: 'home',
  label: 'Home',
  collection: 'Material Design Icons',
  url: 'https://api.iconify.design/mdi/home.svg',
  preview_url: '/api/iconify/mdi/home.svg',
  colored: false,
}

describe('bookmark Iconify controller', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not search for empty or too-short queries', () => {
    const state = createBookmarkIconifySearchState()
    const result = scheduleBookmarkIconifyCandidateSearch(state, {
      enabled: true,
      value: 'x',
    })

    expect(result.changed).toBe(false)
    expect(result.task).toBeNull()
    expect(result.state.loading).toBe(false)
  })

  it('debounces a search task for a valid query', () => {
    vi.useFakeTimers()
    const search = vi.fn()
    const result = scheduleBookmarkIconifyCandidateSearch(createBookmarkIconifySearchState(), {
      enabled: true,
      value: 'mdi:home',
    })

    expect(result.changed).toBe(true)
    expect(result.state.loading).toBe(true)
    expect(result.task).toMatchObject({
      query: 'mdi:home',
      requestId: 1,
      delayMs: ICONIFY_SEARCH_DEBOUNCE_MS,
    })

    setTimeout(() => search(result.task?.query), result.task?.delayMs)
    vi.advanceTimersByTime(ICONIFY_SEARCH_DEBOUNCE_MS - 1)
    expect(search).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(search).toHaveBeenCalledWith('mdi:home')
  })

  it('keeps only the latest query after rapid input changes', () => {
    vi.useFakeTimers()
    const search = vi.fn()
    const first = scheduleBookmarkIconifyCandidateSearch(createBookmarkIconifySearchState(), {
      enabled: true,
      value: 'mdi:home',
    })
    const firstTimer = setTimeout(() => search(first.task?.query), first.task?.delayMs)
    clearTimeout(firstTimer)

    const second = scheduleBookmarkIconifyCandidateSearch(first.state, {
      enabled: true,
      value: 'logos:github-icon',
    })
    setTimeout(() => search(second.task?.query), second.task?.delayMs)

    vi.advanceTimersByTime(ICONIFY_SEARCH_DEBOUNCE_MS)
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('logos:github-icon')
    expect(second.state.requestId).toBe(2)
  })

  it('ignores stale search responses', () => {
    const first = scheduleBookmarkIconifyCandidateSearch(createBookmarkIconifySearchState(), {
      enabled: true,
      value: 'mdi:home',
    })
    const second = scheduleBookmarkIconifyCandidateSearch(first.state, {
      enabled: true,
      value: 'mdi:account',
    })

    const stale = resolveBookmarkIconifySearchSuccess(second.state, {
      requestId: first.task?.requestId ?? 0,
      candidates: [homeCandidate],
    })

    expect(stale).toEqual(second.state)
    expect(stale.candidates).toEqual([])
    expect(stale.loading).toBe(true)
  })

  it('clears candidates and stores an error when the latest search fails', () => {
    const scheduled = scheduleBookmarkIconifyCandidateSearch(createBookmarkIconifySearchState(), {
      enabled: true,
      value: 'mdi:home',
    })
    const loaded = resolveBookmarkIconifySearchSuccess(scheduled.state, {
      requestId: scheduled.task?.requestId ?? 0,
      candidates: [homeCandidate],
    })
    const failed = resolveBookmarkIconifySearchError(loaded, {
      requestId: scheduled.task?.requestId ?? 0,
      error: 'network failed',
    })

    expect(failed.candidates).toEqual([])
    expect(failed.error).toBe('network failed')
    expect(failed.loading).toBe(false)
  })

  it('invalidates a confirmed selection when input changes', () => {
    expect(shouldResetBookmarkIconifyConfirmation({
      iconifyUseConfirmed: true,
      normalizedIconifyName: 'mdi:account',
      confirmedIconifyName: 'mdi:home',
    })).toBe(true)

    expect(shouldResetBookmarkIconifyConfirmation({
      iconifyUseConfirmed: true,
      normalizedIconifyName: 'mdi:home',
      confirmedIconifyName: 'mdi:home',
    })).toBe(false)
  })

  it('initializes edit state from existing Iconify URLs', () => {
    expect(initializeBookmarkIconifySelection({
      mode: 'edit',
      iconSource: 'iconify',
      icon: 'https://api.iconify.design/mdi/home.svg',
    })).toEqual({
      iconifyName: 'mdi:home',
      iconifyUseConfirmed: true,
      confirmedIconifyName: 'mdi:home',
    })
  })

  it('derives preview and selected state from Iconify input', () => {
    expect(deriveBookmarkIconifyView({
      iconifyName: 'mdi/home',
      iconifyUseConfirmed: true,
      confirmedIconifyName: 'mdi:home',
    })).toEqual({
      normalizedIconifyName: 'mdi:home',
      iconifySourceUrl: 'https://api.iconify.design/mdi/home.svg',
      iconifyPreviewUrl: '/api/iconify/mdi/home.svg',
      iconifySelected: true,
    })
  })

  it('selects typed Iconify icons as form patches', () => {
    expect(selectBookmarkIconifyIcon('mdi/home')).toEqual({
      ok: true,
      icon: 'https://api.iconify.design/mdi/home.svg',
      iconSource: 'iconify',
      iconifyName: 'mdi:home',
      iconifyUseConfirmed: true,
      confirmedIconifyName: 'mdi:home',
    })

    expect(selectBookmarkIconifyIcon('invalid')).toMatchObject({
      ok: false,
    })
  })

  it('selects search candidates as form patches', () => {
    expect(selectBookmarkIconifySearchCandidate(homeCandidate)).toEqual({
      icon: 'https://api.iconify.design/mdi/home.svg',
      iconSource: 'iconify',
      iconifyName: 'mdi:home',
      iconifyUseConfirmed: true,
      confirmedIconifyName: 'mdi:home',
    })
  })
})
