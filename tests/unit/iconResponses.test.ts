import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ICON_BROWSER_CACHE_SECONDS,
  ICON_EDGE_CACHE_SECONDS,
  ICON_SUCCESS_CACHE,
  iconCacheKey,
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

describe('icon proxy cache key', () => {
  function key(url: string) {
    return iconCacheKey(new Request(url)).url
  }

  it('collapses arbitrary query strings onto one entry', () => {
    // 图标代理匿名可访问。不归一化的话 `?v=<随机>` 每次都是新键、必然 miss，
    // 每个请求都要走一次 D1 读取，没有 icon_blob 时还会触发一次外站抓取。
    const base = key('https://nav.example.com/api/icon/1')

    expect(key('https://nav.example.com/api/icon/1?')).toBe(base)
    expect(key('https://nav.example.com/api/icon/1?foo=1')).toBe(base)
    expect(key('https://nav.example.com/api/icon/1?v=' + 'x'.repeat(200))).toBe(base)
    expect(key('https://nav.example.com/api/icon/1?v=has space')).toBe(base)
    expect(key('https://nav.example.com/api/icon/1?v=a/b')).toBe(base)
  })

  it('keeps a version-shaped v so icon updates still bust the cache', () => {
    // 前端用 `/api/category-icon/:id?v=...` 在图标改动后失效缓存，这条必须保留
    const a = key('https://nav.example.com/api/category-icon/3?v=abc123')
    const b = key('https://nav.example.com/api/category-icon/3?v=def456')

    expect(a).not.toBe(b)
    expect(a).toContain('v=abc123')
    expect(a).toBe(key('https://nav.example.com/api/category-icon/3?v=abc123&other=1'))
  })

  it('keeps different resources on different keys', () => {
    expect(key('https://nav.example.com/api/icon/1')).not.toBe(key('https://nav.example.com/api/icon/2'))
    expect(key('https://nav.example.com/api/icon/1')).not.toBe(key('https://nav.example.com/api/category-icon/1'))
  })

  it('namespaces the key so pre-PROB-20 cache entries become unreachable', () => {
    // 旧条目是在没有可见性判定的情况下写入的，而命中查询发生在判定之前；
    // 递增命名空间后旧键不可达，之后写入的条目一定过了可见性判定。
    expect(key('https://nav.example.com/api/icon/1')).toContain('ns=2')
    expect(key('https://nav.example.com/api/category-icon/1')).toContain('ns=2')
    expect(key('https://nav.example.com/api/iconify/mdi/home.svg')).toContain('ns=2')
  })

  it('is used by every icon proxy route', () => {
    // 读写必须用同一个键，漏掉任何一处都会让缓存永远 miss
    const source = readFileSync('worker/routes/icon.ts', 'utf8')

    expect(source.match(/iconCacheKey\(c\.req\.raw\)/g)).toHaveLength(3)
    expect(source).not.toContain('cacheResponse(c, c.req.raw')
    expect(source).not.toContain('getCachedResponse(c.req.raw)')
  })

  it('gates both id-addressable icon endpoints on anonymous visibility', () => {
    const source = readFileSync('worker/routes/icon.ts', 'utf8')

    // 书签图标按「书签自身私密 + 所在分类祖先链」判定，分类图标按祖先链判定，
    // 都不能退化成只看目标对象自身的 is_private。
    expect(source).toContain('isBookmarkIconAnonymouslyVisible(bookmark, visibleCategoryIds)')
    expect(source).toContain('getPublicCategoryIds(categories).has(id)')
    // 兜底 SVG 会渲染标题前 4 字或 URL 的 hostname，所以被拒绝的三条路径必须传空标题空 URL，
    // 让「私密」和「id 不存在」表现完全一致，不留存在性或内容线索。
    expect(source.match(/cachedFallbackIconResponse\(c, cacheKey, '', ''\)/g)).toHaveLength(3)
  })
})
