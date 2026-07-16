import { describe, expect, it } from 'vitest'
import {
  ICON_BROWSER_CACHE_SECONDS,
  ICON_EDGE_CACHE_SECONDS,
  ICON_SUCCESS_CACHE,
} from '../../worker/lib/iconResponses'

describe('icon response cache policy', () => {
  it('keeps the edge TTL one day shorter than the browser TTL', () => {
    expect(ICON_BROWSER_CACHE_SECONDS).toBe(7 * 24 * 60 * 60)
    expect(ICON_EDGE_CACHE_SECONDS).toBe(6 * 24 * 60 * 60)
    expect(ICON_EDGE_CACHE_SECONDS).toBeLessThan(ICON_BROWSER_CACHE_SECONDS)
    expect(ICON_SUCCESS_CACHE).toBe(
      'public, max-age=604800, s-maxage=518400, immutable',
    )
  })
})
