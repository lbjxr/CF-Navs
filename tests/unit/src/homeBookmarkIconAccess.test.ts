// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/svelte'
import CategorySection from '../../../src/components/CategorySection.svelte'
import Home from '../../../src/views/Home.svelte'
import { iconAccessKey } from '../../../src/lib/iconAccessKey'
import type { PublicBookmark, PublicCategory } from '../../../shared/types'

// Issue #28：首页私密书签的图标必须经带 key 的代理 URL 才能拿到真实图标；公开书签保持匿名 URL，
// 对象代理客户端统一 no-store，公开正文复用由 Worker edge cache 承担，Service Worker 不接管对象代理。
// 「需要授权」= 书签自身私密，或所属分类落在私密分类树（自身/祖先私密）下。
const GRANT = 'GRANT123'

function bookmark(overrides: Partial<PublicBookmark> = {}): PublicBookmark {
  return {
    id: 42,
    category_id: 1,
    title: 'Example',
    url: 'https://example.com/',
    icon: 'https://cdn.example.com/icon.png',
    icon_source: 'custom',
    icon_background_color: null,
    icon_blob: null,
    // 让图标走 `/api/icon/:id` 代理，而不是原始外链。
    icon_cached: true,
    description: null,
    open_method: 1,
    sort: 0,
    ...overrides,
  }
}

function category(overrides: Partial<PublicCategory> = {}): PublicCategory {
  return { id: 1, parent_id: null, title: 'Tools', icon: null, sort: 0, ...overrides }
}

// 使用真实预取成功路径，并把 Blob 映射回其请求 URL；不依赖失败后的原始 img 回退。
const sourceByBlob = new Map<string, string>()
function stubIconEnvironment(): void {
  const entries = new Map<string, Response>()
  const cache = {
    match: async (request: Request) => entries.get(request.url)?.clone(),
    keys: async () => Array.from(entries.keys()).map((url) => new Request(url)),
    put: async (request: Request, response: Response) => {
      entries.set(request.url, response.clone())
    },
    delete: async (request: Request) => entries.delete(request.url),
  }
  const caches = { open: vi.fn(async () => cache) }
  vi.stubGlobal('caches', caches)
  Object.defineProperty(window, 'caches', { value: caches, configurable: true })
  vi.stubGlobal('IntersectionObserver', undefined)
  sourceByBlob.clear()
  const TestURL = class extends URL {}
  Object.assign(TestURL, {
    createObjectURL: vi.fn((blob: Blob & { sourceUrl: string }) => {
      const url = 'blob:test-' + sourceByBlob.size
      sourceByBlob.set(url, blob.sourceUrl)
      return url
    }),
    revokeObjectURL: vi.fn(),
  })
  vi.stubGlobal('URL', TestURL)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const response = new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })
    const readBlob = response.blob.bind(response)
    response.blob = async () => Object.assign(await readBlob(), { sourceUrl: url })
    return response
  }))
  window.localStorage.clear()
}

function iconSrcByAlt(root: ParentNode): Map<string, string> {
  return new Map(
    Array.from(root.querySelectorAll('img')).map((img) => [img.getAttribute('alt') ?? '', sourceByBlob.get(img.getAttribute('src') ?? '') ?? img.getAttribute('src') ?? '']),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  iconAccessKey.set('')
  vi.restoreAllMocks()
})

describe('首页书签图标授权分流', () => {
  it('adds the access key to a private bookmark icon', async () => {
    stubIconEnvironment()
    const { container } = render(CategorySection, {
      props: {
        category: category(),
        bookmarks: [bookmark({ is_private: 1 })],
        publicCategoryIds: new Set<number>([1]),
        iconAccessKey: GRANT,
      },
    })

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(iconSrcByAlt(container).get('Example')).toContain('key=GRANT123')
  })

  it('keeps a public bookmark in a public category anonymous', async () => {
    stubIconEnvironment()
    const { container } = render(CategorySection, {
      props: {
        category: category(),
        bookmarks: [bookmark({ is_private: 0 })],
        publicCategoryIds: new Set<number>([1]),
        iconAccessKey: GRANT,
      },
    })

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    const src = iconSrcByAlt(container).get('Example') ?? ''
    expect(src).toMatch(/^\/api\/icon\/42\?v=/)
    expect(src).not.toContain('key=')
  })

  it('adds the access key to a public bookmark that sits under a private category', async () => {
    stubIconEnvironment()
    const { container } = render(CategorySection, {
      props: {
        category: category({ id: 2, is_private: true }),
        bookmarks: [bookmark({ category_id: 2, is_private: 0 })],
        publicCategoryIds: new Set<number>([1]),
        iconAccessKey: GRANT,
      },
    })

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(iconSrcByAlt(container).get('Example')).toContain('key=GRANT123')
  })

  it('stays anonymous when the viewer is not logged in (no key available)', async () => {
    stubIconEnvironment()
    const { container } = render(CategorySection, {
      props: {
        category: category(),
        bookmarks: [bookmark({ is_private: 1 })],
        publicCategoryIds: new Set<number>([1]),
        iconAccessKey: '',
      },
    })

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(iconSrcByAlt(container).get('Example')).not.toContain('key=')
  })

  it('adds the access key to a public bookmark whose category no longer exists', async () => {
    // 陈旧数据：书签指向已被删除的分类。服务端可见集合不含该 id → 返回兜底图标，
    // 前端因此必须带 key，否则登录态首页会永久显示 NAV。
    stubIconEnvironment()
    const { container } = render(CategorySection, {
      props: {
        category: category({ id: 1 }),
        bookmarks: [bookmark({ category_id: 999, is_private: 0 })],
        publicCategoryIds: new Set<number>([1]),
        iconAccessKey: GRANT,
      },
    })

    await waitFor(() => expect(container.querySelector('img')).not.toBeNull())
    expect(iconSrcByAlt(container).get('Example')).toContain('key=GRANT123')
  })

  it('keeps public frequent icons anonymous while authorizing private and inherited icons', async () => {
    stubIconEnvironment()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => { })
    iconAccessKey.set(GRANT)
    const { container } = render(Home, {
      props: {
        isAuthenticated: true,
        categories: [category(), category({ id: 2, is_private: true })],
        bookmarks: [
          bookmark({ id: 42, title: 'Public', category_id: 1, is_private: 0, click_count: 4 }),
          bookmark({ id: 43, title: 'Private', category_id: 1, is_private: 1, click_count: 3 }),
          bookmark({ id: 44, title: 'Under private', category_id: 2, is_private: 0, click_count: 2 }),
          bookmark({ id: 45, title: 'Orphan', category_id: 999, is_private: 0, click_count: 1 }),
        ],
      },
    })

    const frequent = container.querySelector('[id="category--1"]')!
    await waitFor(() => expect(frequent.querySelectorAll('img')).toHaveLength(3))
    const byTitle = iconSrcByAlt(frequent)
    const ordinary = iconSrcByAlt(container.querySelector('[id="category-1"]')!)
    expect(byTitle.get('Public')).toBe(ordinary.get('Public'))
    expect(byTitle.get('Public')).not.toContain('key=')
    expect(byTitle.has('Private')).toBe(false)
    expect(ordinary.get('Private')).toContain('key=GRANT123')
    expect(byTitle.get('Under private')).toContain('key=GRANT123')
    expect(byTitle.get('Orphan')).toContain('key=GRANT123')
  })
})
