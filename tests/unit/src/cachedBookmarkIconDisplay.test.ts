import { describe, expect, it } from 'vitest'
import { resolveCachedBookmarkIconDisplaySrc } from '../../../src/lib/cachedBookmarkIconDisplay'

const baseInput = {
  syncLocalUrl: '',
  localUrl: '',
  failed: false,
  iconBlob: '',
  shouldWaitForLocalCache: true,
  cachePending: false,
  src: '/api/icon/42?v=abc',
}

describe('cached bookmark icon display', () => {
  it('uses local cache before remote icon sources', () => {
    expect(resolveCachedBookmarkIconDisplaySrc({
      ...baseInput,
      syncLocalUrl: 'data:image/png;base64,sync',
      localUrl: 'blob:local',
    })).toBe('data:image/png;base64,sync')

    expect(resolveCachedBookmarkIconDisplaySrc({
      ...baseInput,
      localUrl: 'blob:local',
    })).toBe('blob:local')
  })

  it('waits only while local cache lookup is pending', () => {
    expect(resolveCachedBookmarkIconDisplaySrc({
      ...baseInput,
      cachePending: true,
    })).toBe('')

    expect(resolveCachedBookmarkIconDisplaySrc({
      ...baseInput,
      cachePending: false,
    })).toBe('/api/icon/42?v=abc')
  })

  it('uses embedded icon blobs and falls back only after image failure', () => {
    expect(resolveCachedBookmarkIconDisplaySrc({
      ...baseInput,
      iconBlob: 'data:image/png;base64,cached',
    })).toBe('data:image/png;base64,cached')

    expect(resolveCachedBookmarkIconDisplaySrc({
      ...baseInput,
      failed: true,
      iconBlob: 'data:image/png;base64,cached',
    })).toBe('')
  })
})
