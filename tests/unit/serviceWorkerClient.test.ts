import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  collectPrecacheAssetUrls,
  createPrecacheMessage,
  listenForShellUpdate,
  registerServiceWorker,
} from '../../src/lib/serviceWorkerClient'

// 前两组是真行为测试：collectPrecacheAssetUrls / createPrecacheMessage / registerServiceWorker /
// listenForShellUpdate 都作为 src/lib/serviceWorkerClient 的导出函数被直接调用与断言。
// 只有第三组 `service worker source contracts` 回落到 public/sw.js 的源码文本（导航 cache-first、
// precache 仅收同源 `/assets/`、`cf-navs-v<n>` 版本号 ≥15）——sw.js 不经打包、跑在 Service Worker
// 全局作用域，没有可 import/挂载的模块（PROB-18）：客户端 helper 只负责发消息，真正消费它的是另一个 runtime 里的 sw.js。

function timeline(names: string[]) {
  return { getEntriesByType: () => names.map((name) => ({ name })) } as unknown as Performance
}

describe('precache asset collection', () => {
  const origin = 'https://nav.example.com'

  it('picks up same-origin build output only', () => {
    const urls = collectPrecacheAssetUrls(
      timeline([
        `${origin}/assets/index-abc123.js`,
        `${origin}/assets/index-abc123.css`,
        `${origin}/api/public/data`,
        `${origin}/icon.png`,
        'https://api.iconify.design/mdi/home.svg',
      ]),
      origin,
    )

    expect(urls).toEqual(['/assets/index-abc123.js', '/assets/index-abc123.css'])
  })

  it('deduplicates and survives unparseable entries', () => {
    const urls = collectPrecacheAssetUrls(
      timeline([`${origin}/assets/a.js`, `${origin}/assets/a.js`, 'not a url at all']),
      origin,
    )

    expect(urls).toEqual(['/assets/a.js'])
  })

  it('caps the batch so a pathological page cannot flood the cache', () => {
    const names = Array.from({ length: 120 }, (_, index) => `${origin}/assets/chunk-${index}.js`)

    expect(collectPrecacheAssetUrls(timeline(names), origin)).toHaveLength(50)
  })

  it('returns nothing when the timeline is unavailable', () => {
    const broken = {
      getEntriesByType: () => {
        throw new Error('not supported')
      },
    } as unknown as Performance

    expect(collectPrecacheAssetUrls(broken, origin)).toEqual([])
  })

  it('does not send an empty message', () => {
    expect(createPrecacheMessage([])).toBeNull()
    expect(createPrecacheMessage(['/assets/a.js'])).toEqual({
      type: 'precache-assets',
      urls: ['/assets/a.js'],
    })
  })
})

describe('service worker registration', () => {
  it('sends the manifest to registration.active on the very first visit', async () => {
    // 首次访问时 controller 还是 null，而这正是最需要预热的一次：
    // SW 拦不到当次的 JS/CSS 请求，不主动送清单的话缓存里一个产物都没有。
    const postMessage = vi.fn()
    const container = {
      register: vi.fn(async () => ({ active: { postMessage } })),
      controller: null,
    }

    await registerServiceWorker(container, () => ['/assets/a.js'])

    expect(container.register).toHaveBeenCalledWith('/sw.js')
    expect(postMessage).toHaveBeenCalledWith({ type: 'precache-assets', urls: ['/assets/a.js'] })
  })

  it('prefers the controlling worker on later visits', async () => {
    const controllerPost = vi.fn()
    const activePost = vi.fn()
    const container = {
      register: vi.fn(async () => ({ active: { postMessage: activePost } })),
      controller: { postMessage: controllerPost },
    }

    await registerServiceWorker(container, () => ['/assets/a.js'])

    expect(controllerPost).toHaveBeenCalledTimes(1)
    expect(activePost).not.toHaveBeenCalled()
  })

  it('does not throw when registration fails', async () => {
    const container = { register: vi.fn(async () => { throw new Error('blocked') }), controller: null }

    await expect(registerServiceWorker(container, () => ['/assets/a.js'])).resolves.toBeUndefined()
  })

  it('forwards the shell-update notice to the caller', () => {
    // 监听独立注册，供页面在模块求值阶段同步挂上，赢下 shell-updated 早于 load 的竞态。
    const onShellUpdated = vi.fn()
    let listener: ((event: { data?: unknown }) => void) | null = null
    const container = {
      addEventListener: (_type: 'message', handler: (event: { data?: unknown }) => void) => {
        listener = handler
      },
    }

    listenForShellUpdate(container, onShellUpdated)
    listener?.({ data: { type: 'shell-updated' } })
    listener?.({ data: { type: 'something-else' } })

    expect(onShellUpdated).toHaveBeenCalledTimes(1)
  })
})

describe('service worker source contracts', () => {
  const source = readFileSync('public/sw.js', 'utf8')

  it('serves navigations from cache first and refreshes in the background', () => {
    // 之前是 network-first，每次打开页面都必须先等一个完整网络往返才能渲染
    expect(source).toContain("request.mode === 'navigate'")
    expect(source).toContain('event.waitUntil(network')
    expect(source).toContain('shell-updated')
  })

  it('accepts only same-origin build output in the precache message', () => {
    expect(source).toContain("data.type !== 'precache-assets'")
    expect(source).toContain("url.pathname.startsWith('/assets/')")
    expect(source).toContain('url.origin === self.location.origin')
  })

  it('bumps the cache version so stale entries are dropped on activate', () => {
    // 缓存策略变了却不换版本号，旧条目会带着旧语义留下来
    expect(source).toMatch(/const CACHE = 'cf-navs-v(\d+)'/)
    expect(Number(source.match(/const CACHE = 'cf-navs-v(\d+)'/)?.[1])).toBeGreaterThanOrEqual(15)
  })
})
