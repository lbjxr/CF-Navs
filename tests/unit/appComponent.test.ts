// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Bookmark, Category, LoginResp, PublicBookmark, PublicData, Settings, SiteConfig } from '../../shared/types'
import { toPublicSettings } from '../../shared/settings'
import { mounted, probeLog, probes, resetProbes } from '../helpers/appProbe/registry'

// 代码审查三轮第 18 项（APP_SPLIT_PLAN 第 8a 步）：在 runes 迁移（第 8b 步）之前，把 App.svelte 的
// 响应式部分在组件层钉住。真实挂载 App，替换的只有边界：
//   - 五个用例控制器（启动 / 分类 / 书签 / 设置 / 认证）换成可手动推送 onChange 的替身，方法是可识别的 vi.fn；
//   - dataService 换成记录回调的替身（不发请求），全局 fetch 一旦被调用即失败；
//   - 7 个懒加载组件与 Home / Toast / ConfirmDialog / BookmarkLinkModal 换成 AppProbe 替身，记录 App 传入的 props
//     及每个 prop 的（重新）传入次数；懒加载可编排为成功 / 失败 / 挂起；
//   - 媒体查询、图标设备、焦点刷新、自定义脚本控制器换成替身；rootStyleWriter 用真实实现，外包一层记录调用。
// stores（configStore / publicStore / adminStore / authStore）用真实模块驱动。
// 这些断言只经由模块边界与 DOM 观察 App，第 8b 步（runes）必须不改一行地通过。

type Fn = Mock<(...args: unknown[]) => unknown>

const h = vi.hoisted(() => ({
  lazy: {
    mode: {} as Record<string, 'ok' | 'fail' | 'hold'>,
    calls: [] as string[],
    held: {} as Record<string, Array<{ resolve: () => void; reject: (error: Error) => void }>>,
  },
  boot: { deps: null as any, ctrl: null as any, startResult: true, state: null as any },
  category: { deps: null as any, ctrl: null as any },
  bookmark: { deps: null as any, ctrl: null as any },
  settings: { deps: null as any, ctrl: null as any },
  auth: { deps: null as any, ctrl: null as any },
  data: { callbacks: null as any, fns: {} as Record<string, any> },
  media: { dark: false, reduced: false, darkCb: null as null | ((dark: boolean) => void), stopDark: null as any },
  focus: { installs: 0, cb: null as null | (() => unknown), stop: null as any },
  script: { hosts: [] as unknown[], apply: null as any, destroy: null as any },
  writer: { theme: [] as unknown[], css: [] as string[] },
}))

function fnMap(names: string[]): Record<string, Fn> {
  return Object.fromEntries(names.map((name) => [name, vi.fn().mockName(name) as Fn]))
}

vi.mock('../../src/lib/appLazyComponent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appLazyComponent')>()
  const { probeComponent } = await import('../helpers/appProbe/probeComponent')
  return {
    ...actual,
    createLazyComponentRegistry: (loaders: Record<string, unknown>) => {
      // 不调用真实的 import()：每个组件按编排返回替身、失败或挂起。
      const wrapped = Object.fromEntries(Object.keys(loaders).map((name) => [name, () => {
        h.lazy.calls.push(name)
        const mode = h.lazy.mode[name] ?? 'ok'
        if (mode === 'fail') return Promise.reject(new Error(`chunk ${name}`))
        if (mode === 'hold') {
          return new Promise((resolve, reject) => {
            ;(h.lazy.held[name] ??= []).push({ resolve: () => resolve({ default: probeComponent(name) }), reject })
          })
        }
        return Promise.resolve({ default: probeComponent(name) })
      }]))
      return actual.createLazyComponentRegistry(wrapped as never)
    },
  }
})

vi.mock('../../src/views/Home.svelte', async () => ({ default: (await import('../helpers/appProbe/probeComponent')).probeComponent('Home') }))
vi.mock('../../src/components/Toast.svelte', async () => ({ default: (await import('../helpers/appProbe/probeComponent')).probeComponent('Toast') }))
vi.mock('../../src/components/ConfirmDialog.svelte', async () => ({ default: (await import('../helpers/appProbe/probeComponent')).probeComponent('ConfirmDialog') }))
vi.mock('../../src/components/BookmarkLinkModal.svelte', async () => ({ default: (await import('../helpers/appProbe/probeComponent')).probeComponent('BookmarkLinkModal') }))

const DATA_SERVICE_FNS = [
  'applyConfigFromSettings', 'applyLocalBookmarkDelete', 'applyLocalBookmarkSort', 'applyLocalBookmarkUpsert',
  'applyLocalCategoryDelete', 'applyLocalCategorySort', 'applyLocalCategoryUpsert', 'applyLocalSettings',
  'applyLoggedInData', 'isLoggedIn', 'persistCurrentAdminData', 'refreshBookmarkIconCacheInBackground',
  'readAdminDataForEdit', 'readBookmarkForEdit', 'confirmLoggedInDataAfterLocalMutation', 'refreshLoggedInData', 'refreshPublicData', 'refreshVisibleData',
]
vi.mock('../../src/lib/dataService', () => {
  const module: Record<string, unknown> = {
    configureDataService: (callbacks: unknown) => {
      h.data.callbacks = callbacks
    },
  }
  for (const name of DATA_SERVICE_FNS) module[name] = (...args: unknown[]) => h.data.fns[name](...args)
  return module
})

const CHECKING = { type: 'checking' } as const
vi.mock('../../src/lib/appBootController', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appBootController')>()
  return {
    ...actual,
    createAppBootController: (deps: unknown) => {
      h.boot.deps = deps
      h.boot.state = { booting: true, installState: CHECKING, recoverActive: false }
      h.boot.ctrl = {
        getState: () => h.boot.state,
        ...fnMap(['initializeApp', 'retryInstallStatus', 'install', 'recordDataError', 'revealHomeFromCurrentData',
          'enterRecover', 'recovered', 'goInstall', 'cancelRecover']),
        start: vi.fn(() => h.boot.startResult),
      }
      return h.boot.ctrl
    },
  }
})
vi.mock('../../src/lib/appCategoryController', () => ({
  createCategoryController: (deps: unknown) => {
    h.category.deps = deps
    h.category.ctrl = {
      getState: () => ({ modalOpen: false, modalMode: 'create', active: null, saving: false, deletingId: null, error: '', createReturnToHome: false }),
      ...fnMap(['openCreate', 'openCreateRoot', 'openEdit', 'close', 'submit', 'remove', 'batchRemove', 'sort', 'reset']),
    }
    return h.category.ctrl
  },
}))
vi.mock('../../src/lib/appBookmarkController', () => ({
  createBookmarkController: (deps: unknown) => {
    h.bookmark.deps = deps
    h.bookmark.ctrl = {
      getState: () => ({ modalOpen: false, modalMode: 'create', active: null, saving: false, deletingId: null, error: '' }),
      ...fnMap(['openCreate', 'openEdit', 'retryEdit', 'destroy', 'close', 'submit', 'remove', 'batchRemove', 'batchMove', 'sort', 'reorganize', 'reset']),
    }
    return h.bookmark.ctrl
  },
}))
const INITIAL_IMPORT_EXPORT = { importing: false, exporting: false, backupError: '', backupMessage: '' }
vi.mock('../../src/lib/appSettingsController', () => ({
  createSettingsController: (deps: unknown) => {
    h.settings.deps = deps
    h.settings.ctrl = {
      getState: () => ({ saving: false, error: '', importExport: INITIAL_IMPORT_EXPORT }),
      ...fnMap(['submit', 'changePassword', 'exportData', 'importData', 'reset']),
    }
    return h.settings.ctrl
  },
}))
vi.mock('../../src/lib/appAuthController', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appAuthController')>()
  return {
    ...actual,
    createAuthController: (deps: unknown) => {
      h.auth.deps = deps
      h.auth.ctrl = fnMap(['openLogin', 'closeLogin', 'login', 'logout', 'switchToAdmin', 'forgotPassword',
        'selectAdminTab', 'ensureLoggedInDataLoaded', 'refreshAdminDataAfterMutation'])
      return h.auth.ctrl
    },
  }
})
vi.mock('../../src/lib/appMediaPreferences', () => ({
  readReducedMotion: () => h.media.reduced,
  subscribeSystemDark: (onChange: (dark: boolean) => void) => {
    h.media.darkCb = onChange
    onChange(h.media.dark)
    return h.media.stopDark
  },
}))
vi.mock('../../src/lib/publicDataFocusRefresh', () => ({
  installPublicDataFocusRefresh: (refresh: () => unknown) => {
    h.focus.installs += 1
    h.focus.cb = refresh
    return h.focus.stop
  },
}))
const SCRIPT_HOST = { kind: 'browser-host' }
vi.mock('../../src/lib/customScript', () => ({
  createBrowserCustomScriptHost: () => SCRIPT_HOST,
  createCustomScriptController: (host: unknown) => {
    h.script.hosts.push(host)
    return { apply: h.script.apply, destroy: h.script.destroy }
  },
}))
vi.mock('../../src/lib/rootStyleWriter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/rootStyleWriter')>()
  return {
    ...actual,
    createRootStyleWriter: (doc: Document) => {
      const writer = actual.createRootStyleWriter(doc)
      return {
        applyTheme: (input: Parameters<typeof writer.applyTheme>[0]) => {
          h.writer.theme.push({ ...input })
          return writer.applyTheme(input)
        },
        applyCustomCss: (css: string) => {
          h.writer.css.push(css)
          return writer.applyCustomCss(css)
        },
      }
    },
  }
})

const { default: App } = await import('../../src/App.svelte')
const { adminStore, authStore, configStore, publicStore } = await import('../../src/lib/stores')
const { toastStore } = await import('../../src/lib/toast')

// ---------------------------------------------------------------------------
// 固定数据

const baseSettings: Settings = {
  site_title: 'Public Title',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  browser_sync_enabled: false,
  theme: 'light',
  background_preset_id: 'custom',
  custom_accent_color: '#112233',
  custom_dark_accent_color: '#ddeeff',
  background: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  backgrounds: {
    light: { type: 'color', value: '#fafafa', blur: 0, mask: 0.25, maskColor: '#ffffff' },
    dark: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  },
  custom_css: 'body{color:red}',
  custom_js: 'console.log(1)',
  image_host_url: 'https://img.example.com',
  search_engine: { current: 'Google', engines: [{ name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' }] },
  card_size: { width: 80, height: 60 },
  card_style: 'info',
  card_icon_size: 60,
  category_display: { root_font_size: 16, root_icon_size: 20, child_font_size: 14, child_icon_size: 18, root_title_color: '', child_title_color: '' },
  card_show_description: true,
  card_description_mode: 'always',
  card_background_color: '#123456',
  card_background_opacity: 0.75,
  card_icon_show_title: true,
  card_text_color: '',
  search_box_show: true,
  search_engine_selector_show: true,
  content_layout: { max_width: 1200, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 },
  navigation: { position: 'top', always_expanded: true, top_layout: 'scroll' },
  footer_html: '',
  most_visited_count: 8,
  site_title_show: true,
}

const categoryA: Category = { id: 1, parent_id: null, title: 'Tools', icon: 'tool', sort: 0, created_at: 100 }
const bookmarkA: Bookmark = {
  id: 10, category_id: 1, title: 'GitHub', url: 'https://github.com', icon: null, icon_source: 'direct',
  icon_background_color: null, icon_blob: null, icon_cached: 1, description: null, open_method: 1, sort: 0,
  click_count: 17, created_at: 200,
}
const publicBookmark = { id: 10, category_id: 1, title: 'GitHub', url: 'https://github.com', click_count: 3 } as unknown as PublicBookmark

function makePublicData(overrides: Partial<Settings> = {}, bookmarks: PublicBookmark[] = [publicBookmark]): PublicData {
  return {
    categories: [{ id: 1, parent_id: null, title: 'Tools', icon: 'tool', sort: 0 }] as unknown as PublicData['categories'],
    bookmarks,
    settings: toPublicSettings({ ...baseSettings, ...overrides }),
  }
}
const SESSION: LoginResp = { token: 't', expires_at: Date.now() + 3_600_000, username: 'admin' }

// ---------------------------------------------------------------------------
// 驱动工具

function pushBoot(partial: Partial<{ booting: boolean; installState: unknown; recoverActive: boolean }>): void {
  h.boot.state = { ...h.boot.state, ...partial }
  h.boot.deps.onChange(h.boot.state)
  flushSync()
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
  await tick()
  flushSync()
}

function text(): string {
  return document.body.textContent ?? ''
}

function setConfig(config: SiteConfig | null): void {
  configStore.setData(config)
  flushSync()
}

/** 挂载 App，并按需揭开应用（booting=false）。 */
async function mountApp(options: { reveal?: boolean; config?: SiteConfig | null; publicData?: PublicData | null } = {}) {
  if (options.config !== undefined) configStore.setData(options.config)
  if (options.publicData !== undefined) publicStore.setData(options.publicData)
  const result = render(App)
  flushSync()
  if (options.reveal) pushBoot({ booting: false })
  await settle()
  return result
}

function keydown(init: KeyboardEventInit, target: EventTarget = window): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

const animations: Array<{ className: string; options: KeyframeAnimationOptions; anim: { onfinish: null | (() => void) } }> = []
const originalAnimate = Element.prototype.animate

beforeEach(() => {
  resetProbes()
  h.lazy.mode = {}
  h.lazy.calls = []
  h.lazy.held = {}
  h.boot.startResult = true
  h.data.fns = fnMap(DATA_SERVICE_FNS)
  h.data.fns.isLoggedIn.mockReturnValue(false)
  h.data.fns.refreshVisibleData.mockResolvedValue(undefined)
  h.data.fns.refreshLoggedInData.mockResolvedValue(undefined)
  h.media.dark = false
  h.media.reduced = false
  h.media.darkCb = null
  h.media.stopDark = vi.fn()
  h.focus.installs = 0
  h.focus.cb = null
  h.focus.stop = vi.fn()
  h.script.hosts = []
  h.script.apply = vi.fn()
  h.script.destroy = vi.fn()
  h.writer.theme = []
  h.writer.css = []
  configStore.reset()
  publicStore.reset()
  adminStore.reset()
  authStore.setSession(null)
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  const root = document.documentElement
  delete root.dataset.theme
  delete root.dataset.backgroundPreset
  root.removeAttribute('style')
  document.getElementById('custom-css-inject')?.remove()
  animations.length = 0
  Element.prototype.animate = function animate(this: Element, _keyframes: unknown, options?: number | KeyframeAnimationOptions) {
    const anim = { onfinish: null as null | (() => void), cancel() {}, play() {}, pause() {}, currentTime: 0, playState: 'running', finished: Promise.resolve() }
    animations.push({ className: (this as HTMLElement).className, options: (typeof options === 'number' ? { duration: options } : options ?? {}), anim })
    return anim as unknown as Animation
  } as typeof Element.prototype.animate
  vi.stubGlobal('fetch', vi.fn(() => {
    throw new Error('unexpected fetch from App component test')
  }))
})

afterEach(() => {
  cleanup()
  Element.prototype.animate = originalAnimate
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

describe('App boot splash and view switching', () => {
  it('shows the boot splash while booting and reveals the shell with Home afterwards', async () => {
    await mountApp({ config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    expect(text()).toContain('正在加载项目数据...')
    expect(text()).toContain('前端状态与后端接口正在初始化，请稍候。')
    expect(document.querySelector('.app-shell')).toBeNull()
    expect(mounted('Home')).toBeNull()

    pushBoot({ booting: false })
    expect(document.querySelector('.app-shell')).not.toBeNull()
    expect(text()).not.toContain('正在加载项目数据...')
    const home = mounted('Home')!
    expect(home).not.toBeNull()
    expect(mounted('Toast')).not.toBeNull()
    expect(mounted('ConfirmDialog')).not.toBeNull()
  })

  it('passes public data, title fallbacks, auth state and controller handlers to Home', async () => {
    const data = makePublicData()
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: data })
    const home = mounted('Home')!.props
    expect(home.categories).toBe(data.categories)
    expect(home.bookmarks).toBe(data.bookmarks)
    expect(home.settings).toBe(data.settings)
    expect(home.title).toBe('Public Title')
    expect(home.isAuthenticated).toBe(false)
    expect(home.authLoading).toBe(false)
    expect(home.focusCategoryId).toBeNull()
    expect(home.onOpenCreateCategory).toBe(h.category.ctrl.openCreate)
    expect(home.onOpenCreateBookmark).toBe(h.bookmark.ctrl.openCreate)
    expect(home.onEditBookmark).toBe(h.bookmark.ctrl.openEdit)
    expect(home.onReorganizeBookmarks).toBe(h.bookmark.ctrl.reorganize)
    expect(home.onSwitchToAdmin).toBe(h.auth.ctrl.switchToAdmin)
    expect(home.onLogout).toBe(h.auth.ctrl.logout)
    expect(home.onOpenLogin).toBe(h.auth.ctrl.openLogin)

    // homeTitle：publicData 标题 → config 标题 → 'CF-Navs'
    publicStore.setData(null)
    flushSync()
    expect(mounted('Home')!.props.title).toBe('Cfg')
    expect(mounted('Home')!.props.categories).toEqual([])
    expect(mounted('Home')!.props.bookmarks).toEqual([])
    expect(mounted('Home')!.props.settings).toBeNull()
    setConfig(null)
    // config 为空且未登录：canSeeHome 为 false，登录闸门接管；标题回落仍可从 Home 消失前的最后一次推送看出
    expect(mounted('Home')).toBeNull()

    configStore.setData({ site_title: 'Again', public_mode: true })
    authStore.setSession(SESSION)
    flushSync()
    // 闸门已把视图切到 login；改回 home 后标题取 config
    h.boot.deps.setCurrentView('home')
    flushSync()
    expect(mounted('Home')!.props.title).toBe('Again')
    expect(mounted('Home')!.props.isAuthenticated).toBe(true)
  })

  it('home wrapper carries the home background style and focus category id', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    const wrapper = document.querySelector('[data-probe="Home"]')!.parentElement as HTMLElement
    expect(wrapper.getAttribute('style')).toContain('--home-background')
    expect(wrapper.getAttribute('style')).toContain('#fafafa')
    h.category.deps.setHomeFocusCategoryId(42)
    flushSync()
    expect(mounted('Home')!.props.focusCategoryId).toBe(42)
  })

  it('switches between Home, login splash, admin splash and the Admin component', async () => {
    h.lazy.mode.Admin = 'hold'
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    h.boot.deps.setCurrentView('admin')
    flushSync()
    expect(mounted('Home')).toBeNull()
    expect(text()).toContain('正在加载后台...')
    expect(text()).toContain('管理界面分包正在按需载入。')

    void h.boot.deps.ensureLazyComponent('Admin')
    h.lazy.held.Admin[0].resolve()
    await settle()
    expect(text()).not.toContain('正在加载后台...')
    expect(mounted('Admin')).not.toBeNull()

    h.boot.deps.setCurrentView('login')
    flushSync()
    expect(mounted('Admin')).toBeNull()
    expect(text()).toContain('请先登录管理员账号')
    expect(text()).toContain('当前站点未公开，登录后再加载后台管理界面。')

    h.boot.deps.setCurrentView('home')
    flushSync()
    expect(mounted('Home')).not.toBeNull()
    expect(probes.Admin.destroyed).toBe(1)
  })

  it('Admin receives admin data adapters, store loading flags, controller state and handlers', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    adminStore.replaceData({ categories: [categoryA], bookmarks: [bookmarkA], settings: baseSettings })
    await h.boot.deps.ensureLazyComponent('Admin')
    h.boot.deps.setCurrentView('admin')
    await settle()
    const admin = mounted('Admin')!.props
    expect(admin.categories).toEqual([{ id: 1, parent_id: null, title: 'Tools', icon: 'tool', sort: 0, bookmarkCount: 1 }])
    expect(admin.bookmarks).toMatchObject([{ id: 10, title: 'GitHub', open_method: 'new_tab' }])
    expect((admin.settingsValue as { site_title: string }).site_title).toBe('Public Title')
    expect(admin.categoriesLoading).toBe(false)
    expect(admin.bookmarksLoading).toBe(false)
    expect(admin.settingsLoading).toBe(false)
    expect(admin.canSeeHome).toBe(true)
    expect(admin.sessionIdentity).toBe(h.settings.deps.getSession())
    expect(admin.isAuthenticated).toBe(false)
    for (const [prop, fn] of [
      ['onOpenLogin', h.auth.ctrl.openLogin], ['onLogout', h.auth.ctrl.logout], ['onSelectTab', h.auth.ctrl.selectAdminTab],
      ['onOpenCreateCategory', h.category.ctrl.openCreate], ['onEditCategory', h.category.ctrl.openEdit],
      ['onDeleteCategory', h.category.ctrl.remove], ['onBatchDeleteCategories', h.category.ctrl.batchRemove],
      ['onCloseCategoryModal', h.category.ctrl.close], ['onSubmitCategory', h.category.ctrl.submit],
      ['onSortCategories', h.category.ctrl.sort], ['onOpenCreateBookmark', h.bookmark.ctrl.openCreate],
      ['onEditBookmark', h.bookmark.ctrl.openEdit], ['onDeleteBookmark', h.bookmark.ctrl.remove],
      ['onBatchDeleteBookmarks', h.bookmark.ctrl.batchRemove], ['onBatchMoveBookmarks', h.bookmark.ctrl.batchMove],
      ['onSortBookmarks', h.bookmark.ctrl.sort], ['onSubmitSettings', h.settings.ctrl.submit],
      ['onChangePassword', h.settings.ctrl.changePassword], ['onExportData', h.settings.ctrl.exportData],
      ['onImportData', h.settings.ctrl.importData],
    ] as const) expect(admin[prop], prop).toBe(fn)

    // 控制器 onChange → Admin props
    const active = { title: 'Edit me' }
    h.category.deps.onChange({ modalOpen: true, modalMode: 'edit', active, saving: true, deletingId: 3, error: 'cat err', createReturnToHome: false })
    h.settings.deps.onChange({ saving: true, error: 'set err', importExport: { importing: true, exporting: false, backupError: 'b', backupMessage: 'm' } })
    h.bookmark.deps.onChange({ modalOpen: false, modalMode: 'create', active: null, saving: false, deletingId: 9, error: '' })
    flushSync()
    expect(admin.categoryModalOpen).toBe(true)
    expect(admin.categoryModalMode).toBe('edit')
    expect(admin.activeCategory).toBe(active)
    expect(admin.savingCategory).toBe(true)
    expect(admin.deletingCategoryId).toBe(3)
    expect(admin.categoryError).toBe('cat err')
    expect(admin.settingsSaving).toBe(true)
    expect(admin.settingsError).toBe('set err')
    expect(admin.importing).toBe(true)
    expect(admin.exporting).toBe(false)
    expect(admin.backupError).toBe('b')
    expect(admin.backupMessage).toBe('m')
    expect(admin.deletingBookmarkId).toBe(9)

    // adminStore 变化 → 重新计算适配结果
    adminStore.setSettings(null)
    flushSync()
    expect(admin.settingsValue).toBeNull()
    adminStore.setBookmarks([])
    flushSync()
    expect(admin.bookmarks).toEqual([])
    expect(admin.categories).toEqual([{ id: 1, parent_id: null, title: 'Tools', icon: 'tool', sort: 0, bookmarkCount: 0 }])

    // onSwitchToHome 改路径并回到首页
    window.history.replaceState(null, '', '/admin')
    ;(admin.onSwitchToHome as () => void)()
    flushSync()
    expect(window.location.pathname).toBe('/')
    expect(mounted('Home')).not.toBeNull()
  })

  it('renders lazily loaded modals with controller state and only mounts CategoryEditModal for home-created categories', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    adminStore.replaceData({ categories: [categoryA], bookmarks: [bookmarkA], settings: baseSettings })
    flushSync()
    await h.boot.deps.ensureLazyComponent('BookmarkEditModal')
    await h.boot.deps.ensureLazyComponent('CategoryEditModal')
    await h.boot.deps.ensureLazyComponent('LoginModal')
    await settle()

    const login = mounted('LoginModal')!.props
    expect(login.open).toBe(false)
    expect(login.loading).toBe(false)
    expect(login.error).toBe('')
    expect(login.canCancel).toBe(true)
    expect(login.onSubmit).toBe(h.auth.ctrl.login)
    expect(login.onCancel).toBe(h.auth.ctrl.closeLogin)
    expect(login.onForgotPassword).toBe(h.auth.ctrl.forgotPassword)
    h.boot.deps.setLoginModalOpen(true)
    flushSync()
    expect(login.open).toBe(true)

    const bookmarkEdit = mounted('BookmarkEditModal')!.props
    expect(bookmarkEdit.open).toBe(false)
    expect(bookmarkEdit.value).toBeNull()
    expect(bookmarkEdit.imageHostUrl).toBe('https://img.example.com')
    expect(bookmarkEdit.categories).toMatchObject([{ id: 1 }])
    expect(bookmarkEdit.onSubmit).toBe(h.bookmark.ctrl.submit)
    expect(bookmarkEdit.onCancel).toBe(h.bookmark.ctrl.close)
    expect(bookmarkEdit.onDelete).toBe(h.bookmark.ctrl.remove)
    expect(bookmarkEdit.deleting).toBe(false)
    const activeBookmark = { id: '10', title: 'GitHub' }
    h.bookmark.deps.onChange({ modalOpen: true, modalMode: 'edit', active: activeBookmark, saving: true, deletingId: 10, error: 'bm err' })
    flushSync()
    expect(bookmarkEdit.open).toBe(true)
    expect(bookmarkEdit.mode).toBe('edit')
    expect(bookmarkEdit.value).toBe(activeBookmark)
    expect(bookmarkEdit.loading).toBe(true)
    expect(bookmarkEdit.error).toBe('bm err')
    expect(bookmarkEdit.deleting).toBe(true)

    expect(mounted('CategoryEditModal')).toBeNull()
    const activeCategory = { title: 'New' }
    h.category.deps.onChange({ modalOpen: true, modalMode: 'create', active: activeCategory, saving: false, deletingId: null, error: '', createReturnToHome: true })
    flushSync()
    const categoryEdit = mounted('CategoryEditModal')!.props
    expect(categoryEdit.open).toBe(true)
    expect(categoryEdit.value).toBe(activeCategory)
    expect(categoryEdit.categories).toMatchObject([{ id: 1, bookmarkCount: 1 }])
    expect(categoryEdit.imageHostUrl).toBe('https://img.example.com')
    expect(categoryEdit.onSubmit).toBe(h.category.ctrl.submit)
    expect(categoryEdit.onCancel).toBe(h.category.ctrl.close)
    h.category.deps.onChange({ modalOpen: false, modalMode: 'create', active: activeCategory, saving: false, deletingId: null, error: '', createReturnToHome: false })
    flushSync()
    expect(mounted('CategoryEditModal')).toBeNull()
  })

  it('keeps controller object identity: same-reference pushes do not re-send object props, new objects do', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    await h.boot.deps.ensureLazyComponent('BookmarkEditModal')
    await h.boot.deps.ensureLazyComponent('Admin')
    h.boot.deps.setCurrentView('admin')
    await settle()
    const active = { id: '10', title: 'A' }
    const base = { modalOpen: true, modalMode: 'edit', active, saving: false, deletingId: null, error: '' }
    h.bookmark.deps.onChange(base)
    flushSync()
    const valueUpdates = probes.BookmarkEditModal.updates.value
    const before = valueUpdates.length
    expect(valueUpdates.at(-1)).toBe(active)
    // 同一个 active 对象、其它字段变化：value 不重新传入
    h.bookmark.deps.onChange({ ...base, saving: true })
    flushSync()
    h.bookmark.deps.onChange({ ...base, saving: false, error: 'x' })
    flushSync()
    expect(valueUpdates.length).toBe(before)
    expect(probes.BookmarkEditModal.updates.loading.at(-1)).toBe(false)
    // 新对象：重新传入且身份保持
    const next = { id: '10', title: 'B' }
    h.bookmark.deps.onChange({ ...base, active: next })
    flushSync()
    expect(valueUpdates.length).toBe(before + 1)
    expect(valueUpdates.at(-1)).toBe(next)

    // 分类与导入导出状态同理
    const cat = { title: 'C' }
    const catState = { modalOpen: true, modalMode: 'edit', active: cat, saving: false, deletingId: null, error: '', createReturnToHome: false }
    h.category.deps.onChange(catState)
    flushSync()
    const catUpdates = probes.Admin.updates.activeCategory
    const catBefore = catUpdates.length
    h.category.deps.onChange({ ...catState, saving: true })
    flushSync()
    expect(catUpdates.length).toBe(catBefore)
    expect(catUpdates.at(-1)).toBe(cat)

    const io = { importing: true, exporting: false, backupError: '', backupMessage: '' }
    h.settings.deps.onChange({ saving: false, error: '', importExport: io })
    flushSync()
    const importingUpdates = probes.Admin.updates.importing
    const ioBefore = importingUpdates.length
    h.settings.deps.onChange({ saving: true, error: '', importExport: io })
    flushSync()
    expect(importingUpdates.length).toBe(ioBefore)
  })

  it('shows the read shell before the lazy editor exists, routes retry/cancel and waits for authoritative fields', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    const state = { modalOpen: true, modalMode: 'edit', active: null, reading: true, readError: '', saving: false, deletingId: null, error: '' }
    h.bookmark.deps.onChange(state)
    flushSync()
    await settle()
    expect(document.querySelector('[data-testid="bookmark-modal"] [role="status"]')?.textContent).toContain('正在读取书签')
    expect(mounted('BookmarkEditModal')).toBeNull()
    expect(document.querySelector('[data-testid="bookmark-modal"] input')).toBeNull()
    h.bookmark.deps.onChange({ ...state, reading: false, readError: '读取失败，请重试。' })
    flushSync()
    const retry = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="bookmark-modal"] button')].find(button => button.textContent === '重试')!
    retry.click()
    expect(h.bookmark.ctrl.retryEdit).toHaveBeenCalledTimes(1)
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="bookmark-modal"] button')].find(button => button.textContent === '取消')!
    cancel.click()
    expect(h.bookmark.ctrl.close).toHaveBeenCalledTimes(1)
    await h.bookmark.deps.ensureLazyComponent('BookmarkEditModal')
    await settle()
    expect(mounted('BookmarkEditModal')!.props.open).toBe(false)
    const active = { id: 10, title: 'Ready', icon: 'data:image/svg+xml;base64,PHN2Zy8+' }
    h.bookmark.deps.onChange({ ...state, reading: false, active })
    flushSync()
    expect(document.querySelector('[data-testid="bookmark-edit-read-state"]')).toBeNull()
    expect(mounted('BookmarkEditModal')!.props.open).toBe(true)
    expect(mounted('BookmarkEditModal')!.props.value).toBe(active)
  })
})

describe('App login gate', () => {
  it('opens the login gate once booting ends on a private site, before rendering any other view', async () => {
    // 记录每一个被插入或移除的节点：中途渲染过又被替换掉的视图会出现在 removedNodes 里。
    const seen: string[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if ((node.textContent ?? '').includes('正在加载后台...')) seen.push('admin-splash')
          if (node instanceof Element && (node.matches('[data-probe="Home"]') || node.querySelector('[data-probe="Home"]'))) seen.push('home')
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    await mountApp({ config: { site_title: 'Cfg', public_mode: false }, publicData: null })
    // 启动中不触发
    expect(h.lazy.calls).not.toContain('LoginModal')
    pushBoot({ booting: false })
    await Promise.resolve()
    observer.disconnect()
    // 同一次刷新里先切到 login 视图：DOM 从未出现后台 splash 或首页
    expect(seen).toEqual([])
    expect(h.lazy.calls.filter((name) => name === 'LoginModal')).toHaveLength(1)
    expect(text()).toContain('请先登录管理员账号')
    await settle()
    expect(mounted('LoginModal')!.props.open).toBe(true)
    // 闸门写入的 currentView 也能被控制器读到
    expect(h.auth.deps.getCanSeeHome()).toBe(false)
    expect(mounted('LoginModal')!.props.canCancel).toBe(false)
  })

  it('does not open while booting or when the view is not home, and re-opens when access is lost on home', async () => {
    await mountApp({ config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    setConfig({ site_title: 'Cfg', public_mode: false })
    expect(h.lazy.calls).not.toContain('LoginModal')
    h.boot.deps.setCurrentView('admin')
    pushBoot({ booting: false })
    await settle()
    expect(h.lazy.calls).not.toContain('LoginModal')
    expect(text()).toContain('正在加载后台...')

    // 登录态在首页，站点私密；登出后 canSeeHome 变 false → 闸门打开
    authStore.setSession(SESSION)
    h.boot.deps.setCurrentView('home')
    flushSync()
    expect(mounted('Home')).not.toBeNull()
    expect(h.lazy.calls).not.toContain('LoginModal')
    authStore.setSession(null)
    flushSync()
    expect(mounted('Home')).toBeNull()
    expect(text()).toContain('请先登录管理员账号')
    expect(h.lazy.calls.filter((name) => name === 'LoginModal')).toHaveLength(1)
    await settle()
    expect(mounted('LoginModal')!.props.open).toBe(true)
    // 关掉登录框不会再次触发（视图已是 login）
    expect(mounted('LoginModal')!.props.canCancel).toBe(false)
    h.boot.deps.setLoginModalOpen(false)
    flushSync()
    expect(mounted('LoginModal')!.props.open).toBe(false)
  })
  it('also opens on a private site while an install state is pending (gate does not look at installState)', async () => {
    h.lazy.mode.Install = 'hold'
    await mountApp({ config: { site_title: 'Cfg', public_mode: false } })
    pushBoot({ booting: false, installState: { type: 'status_error', message: 'x' } })
    expect(h.lazy.calls).toEqual(['Install', 'LoginModal'])
    expect(text()).toContain('正在加载项目数据...')
  })
})

describe('App theme and root style writes', () => {
  it('writes the theme, preset and background variables to the root and injects custom CSS', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    const root = document.documentElement
    expect(root.dataset.theme).toBe('light')
    expect(root.dataset.backgroundPreset).toBe('custom')
    expect(root.style.getPropertyValue('--home-background')).toContain('#fafafa')
    expect(document.getElementById('custom-css-inject')!.textContent).toBe('body{color:red}')
    expect(mounted('Home')!.props.activeTheme).toBe('light')
    expect(mounted('Home')!.props.activeThemeMode).toBe('light')
  })

  it('writes defaults before public data arrives', async () => {
    await mountApp()
    const root = document.documentElement
    expect(root.dataset.theme).toBe('light')
    expect(root.dataset.backgroundPreset).toBe('custom')
    expect(document.getElementById('custom-css-inject')!.textContent).toBe('')
    expect(h.writer.theme[0]).toEqual({ theme: 'light', backgroundPresetId: 'custom', backgroundStyle: '' })
    expect(h.writer.css[0]).toBe('')
  })

  it('follows the system preference under auto, the stored preference at mount, and the toggle', async () => {
    h.media.dark = true
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData({ theme: 'auto' }) })
    const root = document.documentElement
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.getPropertyValue('--home-background')).toContain('#0f172a')
    expect(mounted('Home')!.props.activeThemeMode).toBe('auto')
    h.media.darkCb!(false)
    flushSync()
    expect(root.dataset.theme).toBe('light')

    // 切换：auto → light（写入本地偏好），light → dark，dark → auto
    const toggle = mounted('Home')!.props.onToggleTheme as () => void
    toggle()
    flushSync()
    expect(localStorage.getItem('cf-navs.theme-mode')).toBe('light')
    expect(mounted('Home')!.props.activeThemeMode).toBe('light')
    toggle()
    flushSync()
    expect(localStorage.getItem('cf-navs.theme-mode')).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    toggle()
    flushSync()
    expect(localStorage.getItem('cf-navs.theme-mode')).toBe('auto')
    expect(root.dataset.theme).toBe('light')
  })

  it('reads the stored preference on mount', async () => {
    localStorage.setItem('cf-navs.theme-mode', 'dark')
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData({ theme: 'light' }) })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(mounted('Home')!.props.activeThemeMode).toBe('dark')
  })

  it('re-runs the theme and CSS writers only when their own inputs change', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    const themeCalls = h.writer.theme.length
    const cssCalls = h.writer.css.length
    // 点击计数 / 书签变化：publicData 换了对象，但主题与 CSS 的输入都没变
    publicStore.incrementClick(10)
    flushSync()
    publicStore.setData(makePublicData({}, []))
    flushSync()
    expect(h.writer.theme.length).toBe(themeCalls)
    expect(h.writer.css.length).toBe(cssCalls)

    publicStore.setData(makePublicData({ custom_css: 'a{}' }))
    flushSync()
    expect(h.writer.theme.length).toBe(themeCalls)
    expect(h.writer.css.slice(cssCalls)).toEqual(['a{}'])
    expect(document.getElementById('custom-css-inject')!.textContent).toBe('a{}')

    publicStore.setData(makePublicData({ custom_css: 'a{}', background_preset_id: 'aurora' as Settings['background_preset_id'] }))
    flushSync()
    expect(h.writer.theme.length).toBe(themeCalls + 1)
    expect(document.documentElement.dataset.backgroundPreset).toBe('aurora')
    expect(h.writer.css.length).toBe(cssCalls + 1)

    ;(mounted('Home')!.props.onToggleTheme as () => void)()
    flushSync()
    expect(h.writer.theme.length).toBe(themeCalls + 2)
    expect(h.writer.css.length).toBe(cssCalls + 1)
  })

  it('animates the shell intro unless reduced motion is requested', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    await settle()
    const intro = animations.filter((a) => a.className.includes('app-shell'))
    expect(intro).toHaveLength(1)
    expect(intro[0].options.duration).toBe(60)
    intro[0].anim.onfinish?.()
    const main = animations.filter((a) => a.className.includes('app-shell'))
    expect(main).toHaveLength(2)
    expect(main[1].options.duration).toBe(260)
  })

  it('skips the shell intro animation with reduced motion', async () => {
    h.media.reduced = true
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    await settle()
    expect(animations.filter((a) => a.className.includes('app-shell'))).toHaveLength(0)
  })
})

describe('App custom script injection', () => {
  it('creates the controller on mount and applies custom_js, without re-applying on theme changes', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    expect(h.script.hosts).toEqual([SCRIPT_HOST])
    expect(h.script.apply).toHaveBeenCalledWith('console.log(1)')
    const calls = h.script.apply.mock.calls.length
    ;(mounted('Home')!.props.onToggleTheme as () => void)()
    flushSync()
    h.media.darkCb!(true)
    flushSync()
    expect(h.script.apply.mock.calls.length).toBe(calls)

    // publicData 每次换对象都会以当前 custom_js 调用 apply（控制器内部幂等）
    publicStore.incrementClick(10)
    flushSync()
    expect(h.script.apply.mock.calls.length).toBe(calls + 1)
    expect(h.script.apply.mock.calls.at(-1)).toEqual(['console.log(1)'])
    publicStore.setData(makePublicData({ custom_js: 'next()' }))
    flushSync()
    expect(h.script.apply.mock.calls.at(-1)).toEqual(['next()'])
    publicStore.setData(null)
    flushSync()
    expect(h.script.apply.mock.calls.at(-1)).toEqual([undefined])
  })

  it('applies nothing before mount creates the controller and destroys it on unmount', async () => {
    const result = await mountApp({ publicData: makePublicData() })
    expect(h.script.apply.mock.calls).toEqual([['console.log(1)']])
    result.unmount()
    expect(h.script.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('App Install / Recover lazy loading', () => {
  const NEEDS_INSTALL = { type: 'pending', status: { state: 'needs_install', schema_version: 3 }, error: 'bad token' }

  it('loads Install for a pending install state and passes the install view state and boot handlers', async () => {
    h.lazy.mode.Install = 'hold'
    await mountApp({ config: { site_title: 'Cfg', public_mode: true } })
    expect(h.lazy.calls).toEqual([])
    pushBoot({ booting: false, installState: NEEDS_INSTALL })
    expect(h.lazy.calls).toEqual(['Install'])
    expect(text()).toContain('正在加载项目数据...')
    h.lazy.held.Install[0].resolve()
    await settle()
    const install = mounted('Install')!.props
    expect(install.mode).toBe('needs_install')
    expect(install.schemaVersion).toBe(3)
    expect(install.installing).toBe(false)
    expect(install.error).toBe('bad token')
    expect(install.missingBindings).toEqual([])
    expect(install.onInstall).toBe(h.boot.ctrl.install)
    expect(install.onRetryStatus).toBe(h.boot.ctrl.retryInstallStatus)
    expect(document.querySelector('.app-shell')).toBeNull()

    pushBoot({ installState: { type: 'installing', status: NEEDS_INSTALL.status } })
    expect(install.installing).toBe(true)
    expect(install.error).toBe('')
    // 已加载：installState 再变化不再请求分包
    expect(h.lazy.calls).toEqual(['Install'])

    pushBoot({ installState: CHECKING })
    await settle()
    expect(mounted('Install')).toBeNull()
    expect(document.querySelector('.app-shell')).not.toBeNull()
  })

  it('shows a persistent load error that survives unrelated updates and clears on the next install state', async () => {
    h.lazy.mode.Install = 'fail'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountApp({ config: { site_title: 'Cfg', public_mode: true } })
    const state = { type: 'status_error', message: 'probe failed' }
    pushBoot({ booting: false, installState: state })
    await settle()
    expect(warn).toHaveBeenCalledWith('[CF-Navs] failed to load view chunk', expect.any(Error))
    expect(text()).toContain('页面加载失败')
    expect(text()).toContain('页面资源加载失败，请检查网络后刷新重试。')
    expect(h.lazy.calls).toEqual(['Install'])

    // 无关更新：booting 来回切换（同一个 installState 对象）、其它分包加载、store 变化、根错误
    pushBoot({ booting: true })
    pushBoot({ booting: false })
    await h.boot.deps.ensureLazyComponent('LoginModal')
    publicStore.setData(makePublicData())
    h.boot.deps.setRootError('x')
    h.boot.deps.setCurrentView('admin')
    await settle()
    expect(text()).toContain('页面资源加载失败，请检查网络后刷新重试。')
    expect(h.lazy.calls).toEqual(['Install', 'LoginModal'])

    // 新的安装状态对象：清掉错误并重试；仍失败则再次显示
    h.lazy.mode.Install = 'hold'
    pushBoot({ installState: { type: 'status_error', message: 'probe failed' } })
    expect(text()).toContain('正在加载项目数据...')
    expect(text()).not.toContain('页面加载失败')
    expect(h.lazy.calls).toEqual(['Install', 'LoginModal', 'Install'])
    h.lazy.held.Install[0].reject(new Error('again'))
    await settle()
    expect(text()).toContain('页面加载失败')
  })

  it('loads Recover while recovering, ahead of Install, and passes the recover handlers', async () => {
    h.lazy.mode.Recover = 'hold'
    await mountApp({ config: { site_title: 'Cfg', public_mode: true } })
    pushBoot({ booting: false, recoverActive: true, installState: NEEDS_INSTALL })
    // 找回优先：不加载 Install
    expect(h.lazy.calls).toEqual(['Recover'])
    expect(text()).toContain('正在加载项目数据...')
    h.lazy.held.Recover[0].resolve()
    await settle()
    const recover = mounted('Recover')!.props
    expect(recover.onRecovered).toBe(h.boot.ctrl.recovered)
    expect(recover.onGoInstall).toBe(h.boot.ctrl.goInstall)
    expect(recover.onCancel).toBe(h.boot.ctrl.cancelRecover)

    // 离开找回：转为 Install
    pushBoot({ recoverActive: false })
    await settle()
    expect(mounted('Recover')).toBeNull()
    expect(h.lazy.calls).toEqual(['Recover', 'Install'])
    expect(mounted('Install')).not.toBeNull()
  })

  it('keeps the Recover load error across booting changes and retries when recovery restarts', async () => {
    h.lazy.mode.Recover = 'fail'
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountApp({ config: { site_title: 'Cfg', public_mode: true } })
    pushBoot({ recoverActive: true })
    await settle()
    expect(text()).toContain('页面加载失败')
    pushBoot({ booting: false })
    await settle()
    expect(text()).toContain('页面资源加载失败，请检查网络后刷新重试。')
    expect(h.lazy.calls).toEqual(['Recover'])

    h.lazy.mode.Recover = 'ok'
    pushBoot({ recoverActive: false })
    pushBoot({ recoverActive: true })
    await settle()
    expect(h.lazy.calls).toEqual(['Recover', 'Recover'])
    expect(mounted('Recover')).not.toBeNull()
  })

  it('shows the boot splash for checking-free states only while booting, recovering or installing', async () => {
    await mountApp({ config: { site_title: 'Cfg', public_mode: true } })
    pushBoot({ booting: false })
    await settle()
    expect(text()).not.toContain('正在加载项目数据...')
    expect(document.querySelector('.app-shell')).not.toBeNull()
  })
})

describe('App global keydown, spotlight and bookmark view', () => {
  it('closes Spotlight before handing its URL to the shared bookmark editor', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    keydown({ key: 'k', ctrlKey: true })
    await settle()
    const spotlight = mounted('SearchSpotlight')!.props
    h.bookmark.ctrl.openCreate.mockImplementation(() => {
      expect(spotlight.open).toBe(false)
    })
    await (spotlight.onCreateBookmark as (url: string) => Promise<void>)('https://new.example/Case')
    expect(h.bookmark.ctrl.openCreate).toHaveBeenCalledExactlyOnceWith(undefined, 'https://new.example/Case')
  })

  it('opens Spotlight with Ctrl+K and "/" on a visible home, closes with Esc and Ctrl+K', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    const open = keydown({ key: 'k', ctrlKey: true })
    expect(open.defaultPrevented).toBe(true)
    await settle()
    const spotlight = mounted('SearchSpotlight')!.props
    expect(spotlight.open).toBe(true)
    expect(spotlight.bookmarks).toEqual([publicBookmark])
    expect(spotlight.categories).toMatchObject([{ id: 1 }])

    const esc = keydown({ key: 'Escape' })
    expect(esc.defaultPrevented).toBe(true)
    flushSync()
    expect(spotlight.open).toBe(false)

    keydown({ key: '/' })
    await settle()
    expect(spotlight.open).toBe(true)
    keydown({ key: 'k', metaKey: true })
    flushSync()
    expect(spotlight.open).toBe(false)

    // onClose 与 Home 的 onOpenSearch
    ;(mounted('Home')!.props.onOpenSearch as () => Promise<void>)()
    await settle()
    expect(spotlight.open).toBe(true)
    ;(spotlight.onClose as () => void)()
    flushSync()
    expect(spotlight.open).toBe(false)
  })

  it('ignores shortcuts away from home, while typing, and when a blocking modal is open', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(keydown({ key: 'k', ctrlKey: true }, input).defaultPrevented).toBe(false)
    input.remove()

    h.boot.deps.setCurrentView('admin')
    flushSync()
    expect(keydown({ key: 'k', ctrlKey: true }).defaultPrevented).toBe(false)
    h.boot.deps.setCurrentView('home')
    flushSync()

    // 模态打开时：快捷键仍 preventDefault，但不打开 Spotlight
    for (const openModal of [
      () => h.boot.deps.setLoginModalOpen(true),
      () => h.category.deps.onChange({ modalOpen: true, modalMode: 'create', active: null, saving: false, deletingId: null, error: '', createReturnToHome: false }),
      () => h.bookmark.deps.onChange({ modalOpen: true, modalMode: 'create', active: null, saving: false, deletingId: null, error: '' }),
      () => void h.boot.deps.requestConfirmation({ title: 'T', message: 'M' }),
    ]) {
      openModal()
      flushSync()
      expect(keydown({ key: 'k', ctrlKey: true }).defaultPrevented).toBe(true)
      await settle()
      expect(mounted('SearchSpotlight')?.props.open ?? false).toBe(false)
      h.boot.deps.setLoginModalOpen(false)
      h.category.deps.onChange({ modalOpen: false, modalMode: 'create', active: null, saving: false, deletingId: null, error: '', createReturnToHome: false })
      h.bookmark.deps.onChange({ modalOpen: false, modalMode: 'create', active: null, saving: false, deletingId: null, error: '' })
      ;(mounted('ConfirmDialog')!.props.onCancel as () => void)()
      flushSync()
    }
    keydown({ key: 'k', ctrlKey: true })
    await settle()
    expect(mounted('SearchSpotlight')!.props.open).toBe(true)
  })

  it('re-checks after the Spotlight chunk loads: a modal opened meanwhile wins', async () => {
    h.lazy.mode.SearchSpotlight = 'hold'
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    keydown({ key: 'k', ctrlKey: true })
    h.boot.deps.setLoginModalOpen(true)
    h.lazy.held.SearchSpotlight[0].resolve()
    await settle()
    expect(mounted('SearchSpotlight')!.props.open).toBe(false)
  })

  it('opens the bookmark link view from Spotlight and blocks Spotlight while it is open', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    keydown({ key: 'k', ctrlKey: true })
    await settle()
    const spotlight = mounted('SearchSpotlight')!.props
    ;(spotlight.onClose as () => void)()
    ;(spotlight.onViewBookmark as (b: PublicBookmark) => void)(publicBookmark)
    flushSync()
    const view = mounted('BookmarkLinkModal')!.props
    expect(view.title).toBe('GitHub')
    expect(view.url).toBe('https://github.com')
    keydown({ key: 'k', ctrlKey: true })
    await settle()
    expect(spotlight.open).toBe(false)
    ;(view.onClose as () => void)()
    flushSync()
    expect(mounted('BookmarkLinkModal')).toBeNull()
  })
})

describe('App confirm dialog, root error and data service callbacks', () => {
  it('renders the confirm dialog state and resolves through its handlers', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    const dialog = mounted('ConfirmDialog')!.props
    expect(dialog.open).toBe(false)
    expect(dialog.title).toBe('')
    expect(dialog.confirmLabel).toBe('确认')
    expect(dialog.cancelLabel).toBe('取消')
    expect(dialog.variant).toBe('default')
    expect(dialog.confirmDisabled).toBe(false)
    const pending = h.boot.deps.requestConfirmation({ title: 'Delete?', message: 'Sure', itemTitle: 'X', confirmLabel: 'Yes', variant: 'danger' }) as Promise<boolean>
    flushSync()
    expect(dialog.open).toBe(true)
    expect(dialog.title).toBe('Delete?')
    expect(dialog.message).toBe('Sure')
    expect(dialog.itemTitle).toBe('X')
    expect(dialog.confirmLabel).toBe('Yes')
    expect(dialog.variant).toBe('danger')
    ;(dialog.onConfirm as () => void)()
    flushSync()
    await expect(pending).resolves.toBe(true)
    expect(dialog.open).toBe(false)
    const second = h.boot.deps.requestConfirmation({ title: 'Again', message: '' }) as Promise<boolean>
    flushSync()
    ;(dialog.onCancel as () => void)()
    await expect(second).resolves.toBe(false)
  })

  it('routes data service callbacks to the root error, boot controller and toast', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    expect(document.querySelector('.app-alert')).toBeNull()
    const error = new Error('net')
    h.data.callbacks.onRootError('数据加载失败', error)
    flushSync()
    expect(document.querySelector('.app-alert')!.textContent).toBe('数据加载失败')
    expect(h.boot.ctrl.recordDataError).toHaveBeenCalledWith(error)
    expect(h.boot.deps.getRootError()).toBe('数据加载失败')
    h.boot.deps.setRootError('')
    flushSync()
    expect(document.querySelector('.app-alert')).toBeNull()

    h.data.callbacks.onLocalSnapshotRestored()
    expect(h.boot.ctrl.revealHomeFromCurrentData).toHaveBeenCalledTimes(1)
    const toast = vi.spyOn(toastStore, 'addToast')
    h.data.callbacks.onNetworkFallback('离线')
    expect(toast).toHaveBeenCalledWith('离线', 'info', { duration: 8000 })
  })

  it('exposes current App state to the controllers through the shared deps', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: false }, publicData: null })
    expect(h.boot.deps.getPublicMode()).toBe(false)
    expect(h.boot.deps.isAdminPath()).toBe(false)
    window.history.replaceState(null, '', '/admin/')
    expect(h.boot.deps.isAdminPath()).toBe(true)
    expect(h.auth.deps.getCanSeeHome()).toBe(false)
    authStore.setSession(SESSION)
    flushSync()
    expect(h.auth.deps.getCanSeeHome()).toBe(true)
    adminStore.replaceData({ categories: [categoryA], bookmarks: [], settings: null })
    flushSync()
    expect(h.category.deps.getAdminData().categories).toEqual([categoryA])
    expect(h.settings.deps.getAdminData().categories).toEqual([categoryA])
    expect(h.bookmark.deps.readAdminData().categories).toEqual([categoryA])
    expect(h.bookmark.deps.getSession()).toEqual(SESSION)
    expect(h.settings.deps.getSession()).toEqual(SESSION)
    expect(h.boot.deps.getPathname()).toBe('/admin/')
    // 各控制器共享同一组依赖实例
    expect(h.category.deps.editIntent).toBe(h.bookmark.deps.editIntent)
    expect(h.settings.deps.authViewIntent).toBe(h.auth.deps.authViewIntent)
    expect(h.auth.deps.enterRecover).toBe(h.boot.ctrl.enterRecover)
    expect(h.auth.deps.resetSettings).toBe(h.settings.ctrl.reset)
    h.boot.deps.resetCategories()
    h.boot.deps.resetBookmarks()
    expect(h.category.ctrl.reset).toHaveBeenCalledTimes(1)
    expect(h.bookmark.ctrl.reset).toHaveBeenCalledTimes(1)
    h.boot.deps.openLogin()
    h.boot.deps.ensureLoggedInDataLoaded()
    h.boot.deps.refreshAdminDataAfterMutation()
    expect(h.auth.ctrl.openLogin).toHaveBeenCalledTimes(1)
    expect(h.auth.ctrl.ensureLoggedInDataLoaded).toHaveBeenCalledTimes(1)
    expect(h.auth.ctrl.refreshAdminDataAfterMutation).toHaveBeenCalledTimes(1)
  })
})

describe('App mount / destroy lifecycle', () => {
  it('invalidates settings saves when the login session is replaced or cleared', async () => {
    await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    h.settings.ctrl.reset.mockClear()
    authStore.setSession(SESSION)
    flushSync()
    expect(h.settings.ctrl.reset).toHaveBeenCalledTimes(1)
    authStore.setSession({ ...SESSION, token: 'test-replacement-session' })
    flushSync()
    expect(h.settings.ctrl.reset).toHaveBeenCalledTimes(2)
    authStore.setSession(null)
    flushSync()
    expect(h.settings.ctrl.reset).toHaveBeenCalledTimes(3)
    expect(h.settings.deps.getSession()).toBeNull()
  })

  it('starts the media subscription, boot and focus refresh on mount and cleans up on destroy', async () => {
    const result = await mountApp({ publicData: makePublicData() })
    expect(h.boot.ctrl.start).toHaveBeenCalledTimes(1)
    expect(h.focus.installs).toBe(1)
    h.focus.cb!()
    expect(h.data.fns.refreshVisibleData).toHaveBeenCalledTimes(1)
    result.unmount()
    expect(h.media.stopDark).toHaveBeenCalledTimes(1)
    expect(h.script.destroy).toHaveBeenCalledTimes(1)
    expect(h.focus.stop).toHaveBeenCalledTimes(1)
  })

  it('does not install the focus refresh when boot.start() declines (direct /recover)', async () => {
    h.boot.startResult = false
    const result = await mountApp()
    expect(h.boot.ctrl.start).toHaveBeenCalledTimes(1)
    expect(h.focus.installs).toBe(0)
    result.unmount()
    expect(h.focus.stop).not.toHaveBeenCalled()
  })

  it('removes the global keydown listener on destroy', async () => {
    const result = await mountApp({ reveal: true, config: { site_title: 'Cfg', public_mode: true }, publicData: makePublicData() })
    result.unmount()
    const event = keydown({ key: 'k', ctrlKey: true })
    expect(event.defaultPrevented).toBe(false)
    await settle()
    expect(h.lazy.calls).not.toContain('SearchSpotlight')
    expect(probeLog.filter((entry) => entry === 'destroy:Home')).toHaveLength(1)
  })
})
