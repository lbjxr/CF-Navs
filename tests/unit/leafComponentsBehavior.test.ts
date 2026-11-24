// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminSidebar from '../../src/components/AdminSidebar.svelte'
import BookmarkCustomIconField from '../../src/components/BookmarkCustomIconField.svelte'
import BookmarkIcon from '../../src/components/BookmarkIcon.svelte'
import BookmarkIconCandidateButton from '../../src/components/BookmarkIconCandidateButton.svelte'
import BookmarkLinkModal from '../../src/components/BookmarkLinkModal.svelte'
import BookmarkModalActions from '../../src/components/BookmarkModalActions.svelte'
import BookmarkModalHeader from '../../src/components/BookmarkModalHeader.svelte'
import HomeContentSummary from '../../src/components/HomeContentSummary.svelte'
import HomeEmptyPanel from '../../src/components/HomeEmptyPanel.svelte'
import LogoSchemeSelector from '../../src/components/LogoSchemeSelector.svelte'
import AdminPageHeader from '../../src/components/admin/AdminPageHeader.svelte'
import SettingsPanel from '../../src/components/SettingsPanel.svelte'
import { emptyBookmarkForm } from '../../src/lib/bookmarkFormIcons'
import { LOGO_SURF_COLOR_SCHEMES } from '../../src/lib/icons'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'

// 代码审查三轮第 20 项（APP_SPLIT_PLAN 第 8c 步）：14 个层级 0 纯展示组件迁移到 runes 之前的行为基线。
// 在 legacy 实现上写成并通过，迁移时不改一行。AppSplash（appSplash.test.ts）、DeviceIconCachePanel
// （deviceIconCachePanel.test.ts）与 BookmarkIcon 的对象图片超时（bookmarkIconTimeout.test.ts）已有覆盖。
// rerender 只更新传入的 props（省略的保持原值），所以每次都显式给出要变化的值。
// 每个组件都验证：渲染随 props 变化（rerender）、回调 prop 接线（含 rerender 后换成新回调）、禁用态与条件分支。

afterEach(cleanup)

const buttonByText = (text: string) =>
  screen.getAllByRole('button').find((b) => (b.textContent ?? '').trim() === text) as HTMLButtonElement | undefined

describe('AdminSidebar', () => {
  it('renders the five tabs, marks the active one and shows the two counters', async () => {
    const view = render(AdminSidebar, { activeTab: 'bookmarks', categoriesCount: 3, bookmarksCount: 12 })
    const tabs = ['categories', 'bookmarks', 'analytics', 'settings', 'backup']
    expect(screen.getAllByRole('button').map((b) => b.dataset.testid)).toEqual(tabs.map((t) => `admin-tab-${t}`))
    expect(screen.getAllByRole('button').map((b) => b.className.includes('active'))).toEqual([false, true, false, false, false])
    expect([...document.querySelectorAll('.nav-badge')].map((b) => b.textContent)).toEqual(['3', '12'])
    expect([...document.querySelectorAll('.nav-label')].map((b) => b.textContent)).toEqual(['分类管理', '书签管理', '访问分析', '站点设置', '数据备份与导入'])

    await view.rerender({ activeTab: 'settings', categoriesCount: 4, bookmarksCount: 0 })
    expect(screen.getByTestId('admin-tab-settings').classList.contains('active')).toBe(true)
    expect(screen.getByTestId('admin-tab-bookmarks').classList.contains('active')).toBe(false)
    expect([...document.querySelectorAll('.nav-badge')].map((b) => b.textContent)).toEqual(['4', '0'])
  })

  it('defaults to the categories tab and calls the current onSelect with the clicked tab', async () => {
    const view = render(AdminSidebar)
    expect(screen.getByTestId('admin-tab-categories').classList.contains('active')).toBe(true)
    // 没有回调时点击不抛错
    await fireEvent.click(screen.getByTestId('admin-tab-analytics'))

    const first = vi.fn()
    await view.rerender({ onSelect: first })
    await fireEvent.click(screen.getByTestId('admin-tab-backup'))
    expect(first).toHaveBeenCalledExactlyOnceWith('backup')

    const second = vi.fn()
    await view.rerender({ onSelect: second })
    await fireEvent.click(screen.getByTestId('admin-tab-analytics'))
    expect(second).toHaveBeenCalledExactlyOnceWith('analytics')
    expect(first).toHaveBeenCalledOnce()
  })
})

describe('BookmarkCustomIconField', () => {
  const form = { ...emptyBookmarkForm, icon: '⭐ star' }

  it('shows the icon value, a text preview and passes typed values to onIconInput', async () => {
    const onIconInput = vi.fn()
    render(BookmarkCustomIconField, { form, onIconInput })
    const input = screen.getByPlaceholderText('图标 URL / 表情，如 ⭐') as HTMLInputElement
    expect(input.value).toBe('⭐ star')
    expect(document.querySelector('.icon-preview-text')?.textContent).toBe('⭐ st')
    expect(document.querySelector('.icon-preview img')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('.field-error')).toBeNull()

    await fireEvent.input(input, { target: { value: 'https://x.test/a.png' } })
    expect(onIconInput).toHaveBeenCalledExactlyOnceWith('https://x.test/a.png')
  })

  it('previews image icons, follows form changes and hides the preview for blank icons', async () => {
    const view = render(BookmarkCustomIconField, { form: { ...form, icon: 'https://x.test/a.png' } })
    const img = document.querySelector('.icon-preview img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://x.test/a.png')
    expect(img.alt).toBe('图标预览')

    await view.rerender({ form: { ...form, icon: '   ' } })
    expect(document.querySelector('.icon-preview')).toBeNull()
    expect((screen.getByPlaceholderText('图标 URL / 表情，如 ⭐') as HTMLInputElement).value).toBe('   ')
  })

  it('shows the image-host button only with a URL, disables it while loading and renders favicon errors', async () => {
    const onOpenImageHost = vi.fn()
    const view = render(BookmarkCustomIconField, { form, imageHostUrl: 'https://img.test', onOpenImageHost, faviconError: '抓取失败' })
    const button = screen.getByRole('button', { name: '打开图床 ↗' }) as HTMLButtonElement
    expect(button.title).toBe('打开图床上传图标')
    expect(button.disabled).toBe(false)
    expect(document.querySelector('.field-error')?.textContent).toBe('抓取失败')
    await fireEvent.click(button)
    expect(onOpenImageHost).toHaveBeenCalledOnce()

    await view.rerender({ form, imageHostUrl: 'https://img.test', onOpenImageHost, loading: true, faviconError: '' })
    expect((screen.getByRole('button', { name: '打开图床 ↗' }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.querySelector('.field-error')).toBeNull()

    await view.rerender({ form, imageHostUrl: '', onOpenImageHost })
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('BookmarkIcon', () => {
  it('renders an image with its attributes, modifiers and inline style', async () => {
    const view = render(BookmarkIcon, {
      title: 'Site', iconUrl: 'https://x.test/i.png', size: 32, iconStyle: 'background: red;',
      hasCustomBackground: true, themeOverride: 'light',
    })
    const root = document.querySelector('.bookmark-icon') as HTMLElement
    expect([...root.classList].filter((c) => !c.startsWith('svelte-')).sort()).toEqual(['bookmark-icon', 'has-custom-background', 'is-info', 'preview-light'])
    expect(root.getAttribute('style')).toContain('background: red')
    const img = root.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://x.test/i.png')
    expect(img.alt).toBe('Site')
    expect(img.getAttribute('width')).toBe('32')
    expect(img.getAttribute('height')).toBe('32')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('decoding')).toBe('async')
    expect(img.getAttribute('fetchpriority')).toBe('low')

    await view.rerender({ title: 'Site', iconUrl: '', iconText: 'S', size: 0, iconStyle: '', hasCustomBackground: false, variant: 'compact', themeOverride: 'dark' })
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.icon-text')?.textContent).toBe('S')
    expect([...root.classList].filter((c) => !c.startsWith('svelte-'))).toEqual(['bookmark-icon'])
  })

  it('forwards image load and error events to the current callbacks', async () => {
    const onLoad = vi.fn()
    const onError = vi.fn()
    const view = render(BookmarkIcon, { iconUrl: 'https://x.test/i.png', onLoad, onError })
    const img = document.querySelector('img') as HTMLImageElement
    await fireEvent.load(img)
    await fireEvent.error(img)
    expect(onLoad).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()

    const nextError = vi.fn()
    await view.rerender({ iconUrl: 'https://x.test/i.png', onLoad, onError: nextError })
    await fireEvent.error(document.querySelector('img') as HTMLImageElement)
    expect(nextError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
  })
})

describe('BookmarkIconCandidateButton', () => {
  it('renders the candidate, toggles the selected modifier and calls onSelect', async () => {
    const onSelect = vi.fn()
    const view = render(BookmarkIconCandidateButton, { title: 'favicon', imageUrl: 'https://x.test/f.ico', label: 'Favicon', onSelect })
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.type).toBe('button')
    expect(button.title).toBe('favicon')
    expect(button.classList.contains('selected')).toBe(false)
    const img = button.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://x.test/f.ico')
    expect(img.alt).toBe('Favicon')
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(button.querySelector('.candidate-label')?.textContent).toBe('Favicon')
    await fireEvent.click(button)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith()

    await view.rerender({ title: 'favicon', imageUrl: 'https://x.test/f.ico', label: 'Favicon', imageAlt: 'alt', selected: true, onSelect })
    expect(button.classList.contains('selected')).toBe(true)
    expect(img.alt).toBe('alt')
  })
})

describe('BookmarkLinkModal', () => {
  it('mounts the dialog directly under body, closes through onClose and is removed on unmount', async () => {
    const onClose = vi.fn()
    const view = render(BookmarkLinkModal, { title: 'Docs', url: 'https://docs.test/', onClose })
    const dialog = screen.getByRole('dialog', { name: 'Docs' })
    expect(dialog.parentElement).toBe(document.body)
    expect(view.container.contains(dialog)).toBe(false)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.querySelector('strong')?.textContent).toBe('Docs')
    const link = screen.getByRole('link', { name: '新窗口打开' }) as HTMLAnchorElement
    expect(link.href).toBe('https://docs.test/')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    const frame = dialog.querySelector('iframe') as HTMLIFrameElement
    expect(frame.getAttribute('src')).toBe('https://docs.test/')
    expect(frame.title).toBe('Docs')

    // 弹窗挂在渲染容器之外，点击仍要到达处理函数
    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledExactlyOnceWith()

    await view.rerender({ title: 'Other', url: 'https://other.test/', onClose })
    expect(screen.getByRole('dialog', { name: 'Other' })).toBe(dialog)
    expect(frame.getAttribute('src')).toBe('https://other.test/')

    view.unmount()
    expect(document.body.contains(dialog)).toBe(false)
  })
})

describe('BookmarkModalActions', () => {
  it('shows delete only for an existing bookmark in edit mode that can be deleted', async () => {
    const view = render(BookmarkModalActions, { mode: 'create', bookmarkId: 1, canDelete: true })
    expect(buttonByText('删除')).toBeUndefined()
    await view.rerender({ mode: 'edit', bookmarkId: 1, canDelete: false })
    expect(buttonByText('删除')).toBeUndefined()
    await view.rerender({ mode: 'edit', bookmarkId: 0, canDelete: true })
    expect(buttonByText('删除')).toBeUndefined()
    await view.rerender({ mode: 'edit', bookmarkId: 'b1', canDelete: true })
    expect(buttonByText('删除')).toBeTruthy()
    expect(screen.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['删除', '取消', '保存'])
  })

  it('wires cancel / delete to the current callbacks with the click event and reflects busy states', async () => {
    const onCancel = vi.fn()
    const onDelete = vi.fn()
    const view = render(BookmarkModalActions, { mode: 'edit', bookmarkId: 7, canDelete: true, onCancel, onDelete })
    await fireEvent.click(buttonByText('删除')!)
    await fireEvent.click(buttonByText('取消')!)
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete.mock.calls[0][0]).toBeInstanceOf(MouseEvent)
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCancel.mock.calls[0][0]).toBeInstanceOf(MouseEvent)
    expect(buttonByText('保存')!.type).toBe('submit')
    expect(buttonByText('保存')!.disabled).toBe(false)

    const nextCancel = vi.fn()
    await view.rerender({ mode: 'edit', bookmarkId: 7, canDelete: true, onCancel: nextCancel, onDelete, deleting: true, saveDisabled: true })
    expect(buttonByText('删除中...')!.disabled).toBe(true)
    expect(buttonByText('取消')!.disabled).toBe(false)
    expect(buttonByText('保存')!.disabled).toBe(true)
    await fireEvent.click(buttonByText('取消')!)
    expect(nextCancel).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()

    await view.rerender({ mode: 'edit', bookmarkId: 7, canDelete: true, onCancel, onDelete, loading: true, deleting: false, saveDisabled: false })
    expect(buttonByText('删除')!.disabled).toBe(true)
    expect(buttonByText('取消')!.disabled).toBe(true)
    expect(buttonByText('保存中...')).toBeTruthy()
  })

  it('clicks without callbacks are harmless', async () => {
    render(BookmarkModalActions, { mode: 'edit', bookmarkId: 7, canDelete: true })
    await fireEvent.click(buttonByText('删除')!)
    await fireEvent.click(buttonByText('取消')!)
  })
})

describe('BookmarkModalHeader', () => {
  it('titles by mode, disables cancel while busy and calls the current onCancel', async () => {
    const onCancel = vi.fn()
    const view = render(BookmarkModalHeader, { onCancel })
    expect(screen.getByRole('heading').textContent).toBe('新增书签')
    expect(screen.getByRole('heading').id).toBe('bookmark-modal-title')
    expect(document.querySelector('.modal-eyebrow')?.textContent).toBe('书签管理')
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCancel.mock.calls[0][0]).toBeInstanceOf(MouseEvent)

    await view.rerender({ mode: 'edit', deleting: true, onCancel })
    expect(screen.getByRole('heading').textContent).toBe('编辑书签')
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true)
    await view.rerender({ mode: 'edit', loading: true, deleting: false, onCancel })
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true)
    const next = vi.fn()
    await view.rerender({ mode: 'edit', loading: false, deleting: false, onCancel: next })
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(next).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('HomeContentSummary / HomeEmptyPanel', () => {
  it('summarises totals, or matches while searching', async () => {
    const view = render(HomeContentSummary, { totalCategories: 5, totalBookmarks: 40, visibleCategoriesCount: 2, visibleBookmarkCount: 3 })
    expect(screen.getByRole('heading').textContent?.trim()).toBe('共 5 个分类，40 个站点')
    expect(document.querySelector('.summary-label')?.textContent).toBe('当前内容')
    await view.rerender({ hasSearchQuery: true, totalCategories: 5, totalBookmarks: 40, visibleCategoriesCount: 2, visibleBookmarkCount: 3 })
    expect(screen.getByRole('heading').textContent?.trim()).toBe('匹配 2 个分类，3 个站点')
  })

  it('defaults the summary counters to zero', () => {
    render(HomeContentSummary)
    expect(screen.getByRole('heading').textContent?.trim()).toBe('共 0 个分类，0 个站点')
  })

  it('explains an empty home, or an empty search', async () => {
    const view = render(HomeEmptyPanel)
    expect(screen.getByRole('heading').textContent).toBe('暂无公开内容')
    expect(document.querySelector('.empty-panel p')?.textContent).toBe('当前还没有可展示的分类或书签，请稍后再来查看。')
    await view.rerender({ hasSearchQuery: true })
    expect(screen.getByRole('heading').textContent).toBe('没有匹配的书签')
    expect(document.querySelector('.empty-panel p')?.textContent).toBe('换个关键词试试，或清空输入查看全部收藏。')
    await view.rerender({ hasSearchQuery: true, canSearchWeb: true })
    expect(screen.getByRole('heading').textContent).toBe('没有匹配的书签')
    expect(document.querySelector('.empty-panel p')?.textContent).toBe('在搜索框按 Enter 或点「网页搜索」查找网页，也可以换个关键词筛选收藏。')
  })
})

describe('LogoSchemeSelector', () => {
  const [first, second] = LOGO_SURF_COLOR_SCHEMES

  it('lists every scheme with its preview and selects only when the icon source is logo_surf', async () => {
    const onSelectScheme = vi.fn()
    const view = render(LogoSchemeSelector, { currentLogoScheme: first, selectedLogoSchemeName: second.name, iconSource: 'logo_surf', onSelectScheme })
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(buttons).toHaveLength(LOGO_SURF_COLOR_SCHEMES.length)
    expect(buttons.map((b) => b.querySelector('.scheme-name')?.textContent)).toEqual(LOGO_SURF_COLOR_SCHEMES.map((s) => s.name))
    expect(buttons[0].title).toBe(`${first.name}: ${first.bgColor} / ${first.textColor}`)
    const preview = buttons[0].querySelector('.scheme-preview') as HTMLElement
    expect(preview.textContent?.trim()).toBe('NAV')
    expect(preview.style.background).not.toBe('')
    expect(preview.style.color).not.toBe('')
    expect(document.querySelector('.scheme-current')?.textContent).toBe(`${first.bgColor} / ${first.textColor}`)
    expect(buttons.map((b) => b.classList.contains('selected'))).toEqual(LOGO_SURF_COLOR_SCHEMES.map((s) => s.name === second.name))

    await fireEvent.click(buttons[0])
    expect(onSelectScheme).toHaveBeenCalledExactlyOnceWith(first)

    await view.rerender({ currentLogoScheme: second, selectedLogoSchemeName: second.name, iconSource: 'custom', logoPreviewText: 'AB', onSelectScheme })
    expect(buttons.some((b) => b.classList.contains('selected'))).toBe(false)
    expect(document.querySelector('.scheme-current')?.textContent).toBe(`${second.bgColor} / ${second.textColor}`)
    expect(preview.textContent?.trim()).toBe('AB')
  })
})

describe('AdminPageHeader', () => {
  it('shows login when signed out, logout when signed in, home only when allowed', async () => {
    const onOpenLogin = vi.fn()
    const onLogout = vi.fn()
    const onSwitchToHome = vi.fn()
    const view = render(AdminPageHeader, { onOpenLogin, onLogout, onSwitchToHome })
    expect(screen.getByRole('heading').textContent).toBe('导航内容管理')
    expect(screen.queryByTestId('admin-home-button')).toBeNull()
    expect(screen.queryByTestId('admin-logout-button')).toBeNull()
    await fireEvent.click(screen.getByTestId('admin-login-button'))
    expect(onOpenLogin).toHaveBeenCalledExactlyOnceWith()

    await view.rerender({ isAuthenticated: true, canSeeHome: true, onOpenLogin, onLogout, onSwitchToHome })
    expect(screen.queryByTestId('admin-login-button')).toBeNull()
    expect(screen.getAllByRole('button').map((b) => b.dataset.testid)).toEqual(['admin-home-button', 'admin-logout-button'])
    expect(screen.getByRole('button', { name: '返回首页' }).title).toBe('返回首页')
    await fireEvent.click(screen.getByTestId('admin-home-button'))
    await fireEvent.click(screen.getByTestId('admin-logout-button'))
    expect(onSwitchToHome).toHaveBeenCalledExactlyOnceWith()
    expect(onLogout).toHaveBeenCalledExactlyOnceWith()
  })

  it('disables the auth buttons while auth is loading', async () => {
    const view = render(AdminPageHeader, { authLoading: true })
    expect((screen.getByTestId('admin-login-button') as HTMLButtonElement).disabled).toBe(true)
    await view.rerender({ authLoading: true, isAuthenticated: true, canSeeHome: true })
    expect((screen.getByTestId('admin-logout-button') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('admin-home-button') as HTMLButtonElement).disabled).toBe(false)
    await view.rerender({ authLoading: false, isAuthenticated: true, canSeeHome: false })
    expect((screen.getByTestId('admin-logout-button') as HTMLButtonElement).disabled).toBe(false)
    // 无回调时点击不抛错
    await fireEvent.click(screen.getByTestId('admin-logout-button'))
  })
})

describe('FooterSettingsSection (through SettingsPanel, which binds its form)', () => {
  const baseValue = { ...DEFAULT_SETTINGS, site_title: 'CF-Navs', footer_html: '<b>old</b>', custom_css: '', custom_js: '' }

  async function openFooter(props: Record<string, unknown> = {}) {
    const onSubmit = vi.fn()
    render(SettingsPanel, { props: { value: baseValue, onSubmit, ...props } })
    const menu = screen.getAllByRole('button').find((b) => b.querySelector('strong')?.textContent === '自定义样式/脚本') as HTMLButtonElement
    await fireEvent.click(menu)
    const fieldset = document.getElementById('settings-section-footer') as HTMLFieldSetElement
    const [footer, css, js] = [...fieldset.querySelectorAll('textarea')] as HTMLTextAreaElement[]
    return { onSubmit, fieldset, footer, css, js }
  }

  it('shows the current values and writes edits back to the parent form', async () => {
    const { onSubmit, footer, css, js } = await openFooter()
    expect(footer.value).toBe('<b>old</b>')
    expect(document.body.textContent).toContain('配置已同步')

    await fireEvent.input(footer, { target: { value: '<i>new</i>' } })
    await fireEvent.input(css, { target: { value: '.x{color:red}' } })
    await fireEvent.input(js, { target: { value: 'go()' } })
    await tick()
    await tick()
    expect(document.body.textContent).toContain('有未保存更改')
    // 同步回父组件后控件仍显示刚输入的内容
    expect(footer.value).toBe('<i>new</i>')
    expect(css.value).toBe('.x{color:red}')
    expect(js.value).toBe('go()')

    await fireEvent.submit(document.querySelector('#settings-form') as HTMLFormElement)
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ footer_html: '<i>new</i>', custom_css: '.x{color:red}', custom_js: 'go()', site_title: 'CF-Navs' })
  })

  it('reverting an edit makes the form clean again', async () => {
    const { footer } = await openFooter()
    await fireEvent.input(footer, { target: { value: 'changed' } })
    await tick()
    await tick()
    expect(document.body.textContent).toContain('有未保存更改')
    await fireEvent.input(footer, { target: { value: '<b>old</b>' } })
    await tick()
    await tick()
    expect(document.body.textContent).toContain('配置已同步')
  })

  it('disables the whole section while saving', async () => {
    const { fieldset } = await openFooter({ saving: true })
    expect(fieldset.disabled).toBe(true)
    expect(fieldset.querySelector('legend')?.textContent).toBe('自定义样式与脚本')
  })
})
