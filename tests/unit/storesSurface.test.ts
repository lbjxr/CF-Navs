import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { api } from '../../src/lib/api'
import * as stores from '../../src/lib/stores'

// dataService.ts 已经完全接管取数、版本确认和本地快照编排。stores.ts 里那套
// 并行的取数路径（configStore.refresh / adminStore.refreshAll / authStore.refreshMe …）
// 和 7 个 derived store 一个调用方都没有，却仍然打进 227 KB 的主包——
// api 是对象字面量导出，tree-shaking 拿不掉它的成员。

// 断言对象是 src/lib/stores.ts 与 src/lib/api.ts 的模块导出面，不是组件（PROB-18）：Object.keys(stores) 必须恰好是
// adminStore/authStore/configStore/isAuthenticated/publicStore 这 5 个，store 上不得再留 refresh/refreshAll/refreshMe
// 等取数方法，api 顶层键与各子命名空间不得回退出 config/me/list/get；再反向读 worker/routes/*.ts 确认 /me、/config 等
// 服务端路由（跑在 Workers runtime）仍在。这些是模块的导出形状与另一 runtime 文件的存在性，挂 Svelte 组件一个 key 都读不到。

describe('stores.ts stays a state container', () => {
  it('exposes only the stores that are actually imported', () => {
    expect(Object.keys(stores).sort()).toEqual([
      'adminStore',
      'authStore',
      'configStore',
      'isAuthenticated',
      'publicStore',
    ])
  })

  it('has no fetching methods left on the stores', () => {
    for (const name of ['refresh', 'refreshAll', 'refreshCategories', 'refreshBookmarks', 'refreshSettings']) {
      expect(stores.adminStore, name).not.toHaveProperty(name)
      expect(stores.configStore, name).not.toHaveProperty(name)
      expect(stores.publicStore, name).not.toHaveProperty(name)
    }
    expect(stores.authStore).not.toHaveProperty('refreshMe')
  })

  it('points future readers at dataService instead', () => {
    expect(readFileSync('src/lib/stores.ts', 'utf8')).toContain('src/lib/dataService.ts')
  })
})

describe('api client surface', () => {
  it('exposes only the endpoints the frontend calls', () => {
    expect(Object.keys(api).sort()).toEqual([
      'admin',
      'auth',
      'bookmarks',
      'categories',
      'data',
      'iconify',
      'install',
      'public',
      'settings',
    ])
  })

  it('drops the single-resource readers superseded by the aggregate endpoints', () => {
    // 服务端路由仍然保留（文档化契约 + scripts/smoke-test.mjs 在用），
    // 只是前端改由 /api/admin/data 和 /api/public/data 聚合获取。
    expect(api).not.toHaveProperty('config')
    expect(api.auth).not.toHaveProperty('me')
    expect(api.categories).not.toHaveProperty('list')
    expect(api.bookmarks).not.toHaveProperty('list')
    expect(api.settings).not.toHaveProperty('get')
  })

  it('exposes favicon lookup used by bookmark creation', () => {
    expect(api.bookmarks).toHaveProperty('fetchFavicon')
  })

  it('keeps the server routes that the smoke test exercises', () => {
    // 反向确认：删的是客户端封装，不是服务端契约
    const source = readFileSync('worker/routes/auth.ts', 'utf8')
    expect(source).toContain("authRoutes.get('/me'")
    expect(readFileSync('worker/routes/public.ts', 'utf8')).toContain("publicRoutes.get('/config'")
    expect(readFileSync('worker/routes/settings.ts', 'utf8')).toContain("settingsRoutes.get('/'")
    expect(readFileSync('worker/routes/bookmarks.ts', 'utf8')).toContain("bookmarksRoutes.get('/'")
    expect(readFileSync('worker/routes/categories.ts', 'utf8')).toContain("categoriesRoutes.get('/'")
  })
})
