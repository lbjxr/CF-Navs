import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getJwtSecret, resetJwtSecretCache } from '../../worker/lib/jwt'
import { createIconAccessGrant, verifyIconAccessGrant, ICON_ACCESS_TTL_MS } from '../../worker/lib/iconSignature'
import { iconRoutes } from '../../worker/routes/icon'
import type { Env } from '../../worker/types'

// 只实现本用例真正走到的两条 SQL：settings 批量读（jwt_secret）、分类列表、单条书签图标。
function createDb(rows: {
  categories: Array<{ id: number; parent_id: number | null; title: string; icon: string | null; is_private?: number }>
  bookmarks: Array<{
    id: number
    category_id: number
    title: string
    url: string
    icon: string | null
    icon_blob: string | null
    is_private?: number
  }>
}) {
  const settings = new Map<string, string>()
  const categoriesById = new Map(rows.categories.map((category) => [category.id, category]))
  const categoryVisible = (categoryId: number): boolean => {
    const visited = new Set<number>()
    let current = categoriesById.get(categoryId)
    let reachedRoot = false
    while (current) {
      if (visited.has(current.id)) return false
      visited.add(current.id)
      if (current.is_private === 1) return false
      if (current.parent_id == null) {
        reachedRoot = true
        break
      }
      current = categoriesById.get(current.parent_id)
    }
    return reachedRoot
  }


  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes('FROM settings')) {
                const keys = args.map(String)
                return {
                  results: keys
                    .filter((key) => settings.has(key))
                    .map((key) => ({ key, value: settings.get(key) })),
                }
              }
              return { results: [] }
            },
            async first() {
              if (sql.includes('WITH RECURSIVE') && sql.includes('FROM bookmarks b')) {
                const id = Number(args[0])
                const bookmark = rows.bookmarks.find((item) => item.id === id)
                return {
                  visible: bookmark && bookmark.is_private !== 1 && categoryVisible(bookmark.category_id) ? 1 : 0,
                }
              }
              if (sql.includes('WITH RECURSIVE') && sql.includes('FROM categories')) {
                return { visible: categoryVisible(Number(args[0])) ? 1 : 0 }
              }
              if (sql.includes('FROM bookmarks WHERE id = ?')) {
                const bookmark = rows.bookmarks.find((item) => item.id === Number(args[0]))
                return bookmark ? { ...bookmark, icon_source: null, icon_revision: null, icon_write_epoch: 0, dataset_epoch: 'a'.repeat(32) } : null
              }
              if (sql.includes('FROM categories WHERE id = ?')) {
                return rows.categories.find((item) => item.id === Number(args[0])) ?? null
              }
              return null
            },
            async run() {
              if (sql.startsWith('INSERT INTO settings')) {
                settings.set(String(args[0]), String(args[1]))
              }
              return { success: true, meta: { changes: 1 } }
            },
          }
        },
        async all() {
          if (sql.includes('FROM categories')) return { results: rows.categories }
          if (sql.includes('FROM settings')) {
            return { results: [...settings].map(([key, value]) => ({ key, value })) }
          }
          return { results: [] }
        },
        async run() {
          return { success: true, meta: { changes: 1 } }
        },
      }
    },
    async batch(statements: Array<{ all(): Promise<unknown> }>) {
      return await Promise.all(statements.map((statement) => statement.all()))
    },
  } as unknown as D1Database
}

function createEnv(rows: Parameters<typeof createDb>[0]): Env {
  return { DB: createDb(rows) } as unknown as Env
}

// 缓存 fake 要能保留旧正文，才能回归 public→private 的同 URL stale-hit 漏洞。
const cachePuts: Request[] = []
const cacheEntries = new Map<string, Response>()
beforeEach(() => {
  resetJwtSecretCache()
  cachePuts.length = 0
  cacheEntries.clear()
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        async match(request: Request) {
          return cacheEntries.get(request.url)?.clone()
        },
        async put(request: Request, response: Response) {
          cachePuts.push(request)
          cacheEntries.set(request.url, response.clone())
        },
      },
    },
  })
})

// 上游抓取在本文件里用 stub 顶替；漏掉复位会让后面的用例拿到假 fetch。
afterEach(() => {
  vi.unstubAllGlobals()
})

const executionCtx = {
  waitUntil(promise: Promise<unknown>) {
    void promise.catch(() => undefined)
  },
  passThroughOnException() { },
} as unknown as ExecutionContext

async function iconRequest(env: Env, path: string) {
  return await iconRoutes.request(`https://nav.example.com${path}`, {}, env, executionCtx)
}

// 兜底 SVG 会把标题前 4 字或 hostname 画进图里，所以「被拒绝」必须看不到任何标识。
function leaksIdentity(svg: string): boolean {
  return !/>NAV</.test(svg)
}

const PRIVATE_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='

const fixture = {
  categories: [
    { id: 1, parent_id: null, title: '公开分类', icon: null },
    { id: 2, parent_id: null, title: '私密分类', icon: PRIVATE_ICON, is_private: 1 },
    { id: 3, parent_id: null, title: '外站图标分类', icon: 'https://icons.example.com/a.svg' },
  ],
  bookmarks: [
    { id: 10, category_id: 1, title: '公开书签', url: 'https://public.example.com', icon: PRIVATE_ICON, icon_blob: PRIVATE_ICON },
    { id: 11, category_id: 1, title: '私密书签', url: 'https://secret.example.com', icon: PRIVATE_ICON, icon_blob: PRIVATE_ICON, is_private: 1 },
  ],
}

describe('icon access grant', () => {
  it('accepts only its own signature', async () => {
    const { grant } = await createIconAccessGrant('secret-a')

    expect(await verifyIconAccessGrant('secret-a', grant)).toBe(true)
    // 密钥就是 settings.jwt_secret，所以改密码触发的 rotateJwtSecret 会作废全部授权。
    expect(await verifyIconAccessGrant('secret-b', grant)).toBe(false)
  })

  it('rejects an expired grant', async () => {
    const now = Date.now()
    const { grant, expires_at } = await createIconAccessGrant('secret', now)

    expect(await verifyIconAccessGrant('secret', grant, expires_at - 1)).toBe(true)
    expect(await verifyIconAccessGrant('secret', grant, expires_at)).toBe(false)
  })

  it('keeps the lifetime far shorter than a session', async () => {
    // 授权在 URL 里、不查撤销名单，登出后无法立即失效；短寿命是唯一的补偿。
    expect(ICON_ACCESS_TTL_MS).toBeLessThanOrEqual(30 * 60 * 1000)
  })

  it('rejects malformed input without computing an HMAC', async () => {
    for (const bad of ['', 'nope', '123', '.abc', `${Date.now() + 1000}.`, `${'9'.repeat(20)}.abc`]) {
      expect(await verifyIconAccessGrant('secret', bad)).toBe(false)
    }
  })

  it('cannot be confused with a session JWT', async () => {
    const { grant } = await createIconAccessGrant('secret')

    // JWT 是三段点分；授权只有两段，且第一段是纯数字时间戳。
    expect(grant.split('.')).toHaveLength(2)
  })
})

describe('GET /api/icon/:id', () => {
  it('serves the real icon for a publicly visible bookmark', async () => {
    const response = await iconRequest(createEnv(fixture), '/icon/10')

    expect(response.headers.get('X-Icon-Fallback')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('hides a private bookmark behind an identity-free fallback', async () => {
    const response = await iconRequest(createEnv(fixture), '/icon/11')

    expect(response.headers.get('X-Icon-Fallback')).toBe('1')
    expect(leaksIdentity(await response.text())).toBe(false)
  })

  it('makes a private bookmark indistinguishable from a missing id', async () => {
    const env = createEnv(fixture)
    const [privateIcon, missingIcon] = await Promise.all([
      iconRequest(env, '/icon/11').then((r) => r.text()),
      iconRequest(env, '/icon/999').then((r) => r.text()),
    ])

    expect(privateIcon).toBe(missingIcon)
  })

  it('serves the real icon for a private bookmark when a valid grant is present', async () => {
    const env = createEnv(fixture)
    // 先让 jwt_secret 落库，再用同一个密钥签授权
    const { grant } = await createIconAccessGrant(await getJwtSecret(env.DB))

    const response = await iconRequest(env, `/icon/11?key=${encodeURIComponent(grant)}`)

    expect(response.headers.get('X-Icon-Fallback')).toBeNull()
    // 私密响应绝不能进共享缓存：既不写 edge cache，也要让 Service Worker 拒收。
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(cachePuts).toHaveLength(0)
  })

  it('falls back to the anonymous rule when the grant is forged', async () => {
    const response = await iconRequest(createEnv(fixture), '/icon/11?key=1799999999999.forged')

    expect(response.headers.get('X-Icon-Fallback')).toBe('1')
    expect(leaksIdentity(await response.text())).toBe(false)
  })

  it('keeps the private cache invariant when an authorized request throws', async () => {
    // 异常分支此前无条件返回默认公开策略（`public, max-age=300`），合法 key 的私密请求
    // 会因此留下可被浏览器 HTTP 缓存复用的兜底图。授权已解析时必须是 `private, no-store`。
    const env = createEnv(fixture)
    const { grant } = await createIconAccessGrant(await getJwtSecret(env.DB))
    vi.spyOn(env.DB, 'prepare').mockImplementation(() => {
      throw new Error('D1 unavailable')
    })

    const response = await iconRequest(env, `/icon/11?key=${encodeURIComponent(grant)}`)

    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(cachePuts).toHaveLength(0)
  })

  it('does not cache an anonymous response when D1 throws', async () => {
    const env = createEnv(fixture)
    vi.spyOn(env.DB, 'prepare').mockImplementation(() => {
      throw new Error('D1 unavailable')
    })

    const response = await iconRequest(env, '/icon/11')

    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(cachePuts).toHaveLength(0)
  })
})

describe('GET /api/category-icon/:id', () => {
  it('hides a private category behind an identity-free fallback', async () => {
    const response = await iconRequest(createEnv(fixture), '/category-icon/2')

    expect(response.headers.get('X-Icon-Fallback')).toBe('1')
    expect(leaksIdentity(await response.text())).toBe(false)
  })

  it('serves the real icon for a private category when a valid grant is present', async () => {
    const env = createEnv(fixture)
    const { grant } = await createIconAccessGrant(await getJwtSecret(env.DB))

    const response = await iconRequest(env, `/category-icon/2?key=${encodeURIComponent(grant)}`)

    expect(response.headers.get('X-Icon-Fallback')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(cachePuts).toHaveLength(0)
  })

  it('keeps the private cache invariant when the upstream transiently fails', async () => {
    // 授权路径全程 `cacheKey` 为 null，瞬时失败也必须保持同一份 `private, no-store`，
    // 不能退化成匿名路径的兜底策略。
    const env = createEnv(fixture)
    const { grant } = await createIconAccessGrant(await getJwtSecret(env.DB))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    })))

    const response = await iconRequest(env, `/category-icon/3?key=${encodeURIComponent(grant)}`)

    expect(response.status).toBe(503)
    expect(response.headers.get('X-Icon-Fallback')).toBe('1')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(cachePuts).toHaveLength(0)
  })

  it('keeps a missing id and a private id indistinguishable', async () => {
    const env = createEnv(fixture)
    const [privateIcon, missingIcon] = await Promise.all([
      iconRequest(env, '/category-icon/2').then((r) => r.text()),
      iconRequest(env, '/category-icon/999').then((r) => r.text()),
    ])

    expect(privateIcon).toBe(missingIcon)
  })
})

it('blocks a stale public bookmark edge entry after it becomes private', async () => {
  const rows = {
    categories: fixture.categories.map((item) => ({ ...item })),
    bookmarks: fixture.bookmarks.map((item) => ({ ...item })),
  }
  const env = createEnv(rows)

  const publicResponse = await iconRequest(env, '/icon/10?v=privacy-flip')
  expect(publicResponse.headers.get('X-Icon-Fallback')).toBeNull()
  expect(cachePuts).toHaveLength(1)

  const bookmark = rows.bookmarks.find((item) => item.id === 10)
  if (!bookmark) throw new Error('test fixture missing bookmark 10')
  bookmark.is_private = 1

  const privateResponse = await iconRequest(env, '/icon/10?v=privacy-flip')
  expect(privateResponse.headers.get('X-Icon-Fallback')).toBe('1')
  expect(privateResponse.headers.get('Cache-Control')).toBe('no-store')
  expect(cachePuts).toHaveLength(1)
})

it('blocks a stale public category edge entry after the category becomes private', async () => {
  const rows = {
    categories: fixture.categories.map((item) => ({ ...item })),
    bookmarks: fixture.bookmarks.map((item) => ({ ...item })),
  }
  const publicCategory = rows.categories.find((item) => item.id === 1)
  if (!publicCategory) throw new Error('test fixture missing category 1')
  publicCategory.icon = PRIVATE_ICON
  const env = createEnv(rows)

  const publicResponse = await iconRequest(env, '/category-icon/1?v=privacy-flip')
  expect(publicResponse.headers.get('X-Icon-Fallback')).toBeNull()
  expect(cachePuts).toHaveLength(1)

  publicCategory.is_private = 1

  const privateResponse = await iconRequest(env, '/category-icon/1?v=privacy-flip')
  expect(privateResponse.headers.get('X-Icon-Fallback')).toBe('1')
  expect(privateResponse.headers.get('Cache-Control')).toBe('no-store')
  expect(cachePuts).toHaveLength(1)
})

it('blocks a stale public bookmark entry when an ancestor category becomes private', async () => {
  // 书签自身保持公开，只有祖先分类变私密；旧实现会继续命中公开 edge 条目。
  const rows = {
    categories: [
      ...fixture.categories.map((item) => ({ ...item })),
      { id: 4, parent_id: 1, title: '公开子分类', icon: null, is_private: 0 },
    ],
    bookmarks: [
      ...fixture.bookmarks.map((item) => ({ ...item })),
      {
        id: 20,
        category_id: 4,
        title: '深层公开书签',
        url: 'https://deep.example.com',
        icon: PRIVATE_ICON,
        icon_blob: PRIVATE_ICON,
        is_private: 0,
      },
    ],
  }
  const env = createEnv(rows)

  const publicResponse = await iconRequest(env, '/icon/20?v=ancestor-flip')
  expect(publicResponse.headers.get('X-Icon-Fallback')).toBeNull()
  expect(cachePuts).toHaveLength(1)

  const root = rows.categories.find((item) => item.id === 1)
  if (!root) throw new Error('test fixture missing category 1')
  root.is_private = 1

  const hiddenResponse = await iconRequest(env, '/icon/20?v=ancestor-flip')
  expect(hiddenResponse.headers.get('X-Icon-Fallback')).toBe('1')
  expect(hiddenResponse.headers.get('Cache-Control')).toBe('no-store')

  // 祖先改回公开后，同一 URL 必须重新可服务，而不是被之前的 no-store 结论钉住。
  root.is_private = 0
  const restored = await iconRequest(env, '/icon/20?v=ancestor-flip')
  expect(restored.headers.get('X-Icon-Fallback')).toBeNull()
})

it('serves a private-to-public bookmark without reusing the previous hidden verdict', async () => {
  const rows = {
    categories: fixture.categories.map((item) => ({ ...item })),
    bookmarks: fixture.bookmarks.map((item) => ({ ...item })),
  }
  const bookmark = rows.bookmarks.find((item) => item.id === 11)
  if (!bookmark) throw new Error('test fixture missing bookmark 11')
  const env = createEnv(rows)

  // 书签 11 初始私密：匿名请求应得到 no-store 兜底且不写共享缓存。
  const hidden = await iconRequest(env, '/icon/11?v=private-to-public')
  expect(hidden.headers.get('X-Icon-Fallback')).toBe('1')
  expect(hidden.headers.get('Cache-Control')).toBe('no-store')
  expect(cachePuts).toHaveLength(0)

  bookmark.is_private = 0

  const visible = await iconRequest(env, '/icon/11?v=private-to-public')
  expect(visible.headers.get('X-Icon-Fallback')).toBeNull()
  expect(cachePuts).toHaveLength(1)
})

it('fails closed for a bookmark whose category is missing', async () => {
  const rows = {
    categories: fixture.categories.map((item) => ({ ...item })),
    bookmarks: [
      ...fixture.bookmarks.map((item) => ({ ...item })),
      {
        id: 21,
        category_id: 999,
        title: '孤儿书签',
        url: 'https://orphan.example.com',
        icon: PRIVATE_ICON,
        icon_blob: PRIVATE_ICON,
        is_private: 0,
      },
    ],
  }
  const env = createEnv(rows)

  const response = await iconRequest(env, '/icon/21')

  expect(response.headers.get('X-Icon-Fallback')).toBe('1')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(cachePuts).toHaveLength(0)
})

describe('anonymous icon caching', () => {
  it('writes anonymous responses to the shared edge cache under the normalized key', async () => {
    // 归一化键是匿名路径的成本闸门：随机 `?v=` 不能各自建条目，否则每个请求都要读 D1
    // 并可能触发一次外站抓取。
    const env = createEnv(fixture)
    await iconRequest(env, '/icon/10?v=abc&junk=' + 'x'.repeat(120))

    expect(cachePuts).toHaveLength(1)
    const cached = new URL(cachePuts[0].url)
    expect(cached.searchParams.get('junk')).toBeNull()
    expect(cached.searchParams.get('v')).toBe('abc')
    expect(cached.searchParams.get('ns')).toBe('3')
  })

  it('never writes a granted private response to the shared cache', async () => {
    const env = createEnv(fixture)
    const { grant } = await createIconAccessGrant(await getJwtSecret(env.DB))
    cachePuts.length = 0

    await iconRequest(env, `/icon/11?key=${encodeURIComponent(grant)}`)
    await iconRequest(env, `/category-icon/2?key=${encodeURIComponent(grant)}`)

    expect(cachePuts).toHaveLength(0)
  })

  it('does not cache a private or unknown-object fallback', async () => {
    // 隐私闸门拒绝的兜底不能进入共享 cache：对象之后变公开时不能被旧 NAV 条目钉住，
    // 对象不存在时也不需要保留可猜测 ID 的共享条目。
    const response = await iconRequest(createEnv(fixture), '/icon/999')

    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(cachePuts).toHaveLength(0)
  })

  it('never caches a fallback produced by a transient upstream failure', async () => {
    // 瞬时失败返回的兜底图是 200 + image/svg+xml，与真实图标在 edge、浏览器和 Service Worker 面板里都可能看起来相同。
    // 只能用 no-store 阻止各级缓存污染，避免用户在错误缓存期内一直看到文字图标。
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    })))

    const response = await iconRequest(createEnv(fixture), '/category-icon/3')

    expect(response.status).toBe(503)
    expect(response.headers.get('X-Icon-Fallback')).toBe('1')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(cachePuts).toHaveLength(0)
  })

  it('keeps the transient rule on the Iconify preview proxy too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', {
      status: 429,
      headers: { 'content-type': 'text/plain' },
    })))

    const response = await iconRequest(createEnv(fixture), '/iconify/mdi/home.svg')

    expect(response.headers.get('X-Icon-Fallback')).toBe('1')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(cachePuts).toHaveLength(0)
  })

  it('still short-caches the fallback when the upstream says the icon does not exist', async () => {
    // 图标确实不存在时不缓存就等于每次访问都打一次上游，这里保持原有策略。
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', {
      status: 404,
      headers: { 'content-type': 'text/plain' },
    })))

    const response = await iconRequest(createEnv(fixture), '/category-icon/3')

    expect(response.headers.get('X-Icon-Fallback')).toBe('1')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect([...cacheEntries.values()][0].headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300, must-revalidate')
    expect(cachePuts).toHaveLength(1)
  })
})

describe('object icon edge/client cache separation', () => {
  it.each(['/icon/10', '/category-icon/1'])('keeps %s cold and edge-hit responses out of browser caches', async (path) => {
    const rows = {
      categories: fixture.categories.map((item) => ({ ...item, icon: PRIVATE_ICON })),
      bookmarks: fixture.bookmarks.map((item) => ({ ...item })),
    }
    const env = createEnv(rows)
    const url = `${path}?v=cache-split&cv=4`
    const cold = await iconRequest(env, url)
    const body = await cold.text()
    expect(cold.status).toBe(200)
    expect(cold.headers.get('Cache-Control')).toBe('no-store')
    expect(cold.headers.get('Content-Type')).toContain('image/svg+xml')
    expect(cold.headers.get('X-Icon-Fallback')).toBeNull()
    expect(body).toBe(atob(PRIVATE_ICON.split(',')[1]))
    expect(cachePuts).toHaveLength(1)
    const stored = cacheEntries.get(cachePuts[0].url)!
    expect(stored.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=518400, must-revalidate')
    expect(await stored.clone().text()).toBe(body)

    // Reproduce the production Zone Browser Cache TTL rewrite on an edge hit.
    stored.headers.set('Cache-Control', 'public, max-age=14400, s-maxage=518400, must-revalidate')
    stored.headers.set('Content-Length', String(new TextEncoder().encode(body).byteLength))
    const hit = await iconRequest(env, url)
    expect(hit.status).toBe(200)
    expect(hit.headers.get('Cache-Control')).toBe('no-store')
    expect(hit.headers.get('Content-Length')).toBe(stored.headers.get('Content-Length'))
    expect(hit.headers.get('Content-Type')).toBe(cold.headers.get('Content-Type'))
    expect(await hit.text()).toBe(body)
    expect(cachePuts).toHaveLength(1)
    expect(stored.headers.get('Cache-Control')).toContain('max-age=14400')
    expect(await stored.clone().text()).toBe(body)
  })

  it.each(['/icon/10', '/category-icon/1'])('retains a short edge-only fallback for %s', async (path) => {
    const env = createEnv({
      categories: fixture.categories.map((item) => ({ ...item, icon: null })),
      bookmarks: fixture.bookmarks.map((item) => ({ ...item, icon: null, icon_blob: null })),
    })
    const cold = await iconRequest(env, path)
    const body = await cold.text()
    const hit = await iconRequest(env, path)
    expect(cold.headers.get('Cache-Control')).toBe('no-store')
    expect(hit.headers.get('Cache-Control')).toBe('no-store')
    expect(hit.headers.get('X-Icon-Fallback')).toBe('1')
    expect(await hit.text()).toBe(body)
    expect(cachePuts).toHaveLength(1)
    expect([...cacheEntries.values()][0].headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300, must-revalidate')
  })

  it.each(['/icon/10', '/category-icon/1'])('caches fetched bytes for %s without exposing their edge policy', async (path) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h8v8H0z"/></svg>'
    const fetchMock = vi.fn(async () => new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } }))
    vi.stubGlobal('fetch', fetchMock)
    const env = createEnv({
      categories: fixture.categories.map((item) => ({ ...item, icon: 'https://icons.example.com/a.svg' })),
      bookmarks: fixture.bookmarks.map((item) => ({ ...item, icon: 'https://icons.example.com/a.svg', icon_blob: null })),
    })
    const cold = await iconRequest(env, path)
    const hit = await iconRequest(env, path)
    expect(cold.headers.get('Cache-Control')).toBe('no-store')
    expect(hit.headers.get('Cache-Control')).toBe('no-store')
    expect(await cold.text()).toBe(svg)
    expect(await hit.text()).toBe(svg)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect([...cacheEntries.values()][0].headers.get('Cache-Control')).toContain('s-maxage=518400')
  })

  it.each(['/icon/0', '/category-icon/0'])('preserves the non-cacheable invalid-id error for %s', async (path) => {
    const response = await iconRequest(createEnv(fixture), path)
    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).toBe('invalid id')
    expect(cachePuts).toHaveLength(0)
  })

  it('leaves public Iconify proxy caching unchanged on cold and hit responses', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>'
    const fetchMock = vi.fn(async () => new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } }))
    vi.stubGlobal('fetch', fetchMock)
    const env = createEnv(fixture)
    const cold = await iconRequest(env, '/iconify/mdi/home.svg')
    const hit = await iconRequest(env, '/iconify/mdi/home.svg')
    expect(cold.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=518400, must-revalidate')
    expect(hit.headers.get('Cache-Control')).toBe(cold.headers.get('Cache-Control'))
    expect(await cold.text()).toBe(svg)
    expect(await hit.text()).toBe(svg)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
