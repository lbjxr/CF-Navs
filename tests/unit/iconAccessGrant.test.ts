import { beforeEach, describe, expect, it } from 'vitest'
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
              if (sql.includes('FROM bookmarks WHERE id = ?')) {
                return rows.bookmarks.find((item) => item.id === Number(args[0])) ?? null
              }
              return null
            },
            async run() {
              if (sql.startsWith('INSERT INTO settings')) {
                settings.set(String(args[0]), String(args[1]))
              }
              return { success: true }
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
          return { success: true }
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

// 图标路由在读取 edge cache 前会碰 `caches.default`，node 环境没有这个全局。
// 用一个永不命中的假实现：这样每次请求都会真的走判定与 D1 读取。
const cachePuts: Request[] = []
beforeEach(() => {
  resetJwtSecretCache()
  cachePuts.length = 0
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        async match() {
          return undefined
        },
        async put(request: Request) {
          cachePuts.push(request)
        },
      },
    },
  })
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
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=')
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

  it('keeps a missing id and a private id indistinguishable', async () => {
    const env = createEnv(fixture)
    const [privateIcon, missingIcon] = await Promise.all([
      iconRequest(env, '/category-icon/2').then((r) => r.text()),
      iconRequest(env, '/category-icon/999').then((r) => r.text()),
    ])

    expect(privateIcon).toBe(missingIcon)
  })
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
    expect(cached.searchParams.get('ns')).toBe('2')
  })

  it('never writes a granted private response to the shared cache', async () => {
    const env = createEnv(fixture)
    const { grant } = await createIconAccessGrant(await getJwtSecret(env.DB))
    cachePuts.length = 0

    await iconRequest(env, `/icon/11?key=${encodeURIComponent(grant)}`)
    await iconRequest(env, `/category-icon/2?key=${encodeURIComponent(grant)}`)

    expect(cachePuts).toHaveLength(0)
  })

  it('keeps the short fallback TTL so a later-added icon is not pinned for a week', async () => {
    // 兜底图标按成功策略缓存 7 天的话，后来补上的真实图标一周内都不会生效。
    const response = await iconRequest(createEnv(fixture), '/icon/999')

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300')
  })
})
