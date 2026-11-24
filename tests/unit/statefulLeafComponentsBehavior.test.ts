// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import BackupPanel from '../../src/components/BackupPanel.svelte'
import CategoryIcon from '../../src/components/CategoryIcon.svelte'
import CategoryTreeSelect from '../../src/components/CategoryTreeSelect.svelte'
import ConfirmDialog from '../../src/components/ConfirmDialog.svelte'
import HomeFloatingActions from '../../src/components/HomeFloatingActions.svelte'
import LoginModal from '../../src/components/LoginModal.svelte'
import PasswordChangePanel from '../../src/components/PasswordChangePanel.svelte'
import SearchBox from '../../src/components/SearchBox.svelte'
import type { CategoryTreeOption } from '../../src/lib/categorySelect'
import type { SearchEngineSetting } from '../../shared/types'
import BackupPanelBindHarness from '../helpers/statefulLeaf/BackupPanelBindHarness.svelte'
import SearchBoxBindHarness from '../helpers/statefulLeaf/SearchBoxBindHarness.svelte'
import TreeSelectBindHarness from '../helpers/statefulLeaf/TreeSelectBindHarness.svelte'
import { installNativeDialogStub } from '../helpers/nativeDialog'
vi.mock('../../src/lib/localIconView', () => import('../helpers/inactiveLocalIconView'))

// 代码审查三轮第 21 项（APP_SPLIT_PLAN 第 8d 步）：9 个层级 0 有状态组件迁移到 runes 之前的行为基线。
// 在 legacy 实现上写成并通过，迁移时不改一行。CachedBookmarkIcon 见 cachedBookmarkIconBehavior.test.ts；
// 已有的 categoryIconBehavior / categoryNativeRecovery / categoryTreeSelect / confirmDialogBehavior /
// homeFloatingActions / searchBoxEngineSync 继续覆盖各自的部分，这里只补它们没钉住的响应式行为。
// rerender 只更新传入的 props（省略的保持原值）；被父组件 `bind:` 的 prop 用 tests/helpers/statefulLeaf 下的
// legacy 替身父组件验证双向绑定。

beforeAll(() => {
  // jsdom 不实现 scrollIntoView，CategoryTreeSelect 打开菜单时会调用它。
  Element.prototype.scrollIntoView = () => { }
})

let nativeDialog: ReturnType<typeof installNativeDialogStub>
beforeEach(() => { nativeDialog = installNativeDialogStub() })

afterEach(() => {
  cleanup()
  nativeDialog.restore()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const buttonByText = (text: string) =>
  screen.getAllByRole('button').find((b) => (b.textContent ?? '').trim() === text) as HTMLButtonElement | undefined

describe('LoginModal', () => {
  const inputs = () => ({
    username: screen.getByPlaceholderText('请输入用户名') as HTMLInputElement,
    password: screen.getByPlaceholderText('请输入密码') as HTMLInputElement,
  })
  const submit = () => screen.getByRole('button', { name: /^(登录|登录中\.\.\.)$/ }) as HTMLButtonElement

  it('renders nothing while closed and enables submit only with a trimmed username and a password', async () => {
    const view = render(LoginModal, { open: false })
    expect(screen.queryByRole('dialog')).toBeNull()

    await view.rerender({ open: true })
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('login-modal-title')
    expect(submit().disabled).toBe(true)
    await fireEvent.input(inputs().username, { target: { value: '   ' } })
    await fireEvent.input(inputs().password, { target: { value: 'pw' } })
    expect(submit().disabled).toBe(true)
    await fireEvent.input(inputs().username, { target: { value: ' admin ' } })
    expect(submit().disabled).toBe(false)
  })

  it('submits the trimmed username and raw password to the current onSubmit', async () => {
    const onSubmit = vi.fn()
    render(LoginModal, { open: true, onSubmit })
    await fireEvent.input(inputs().username, { target: { value: ' admin ' } })
    await fireEvent.input(inputs().password, { target: { value: ' secret ' } })
    const form = document.querySelector('form') as HTMLFormElement
    const event = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    await tick()
    expect(event.defaultPrevented).toBe(true)
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ username: 'admin', password: ' secret ' })
  })

  it('clears the fields each time it opens, but not on other prop changes while open', async () => {
    const view = render(LoginModal, { open: true })
    await fireEvent.input(inputs().username, { target: { value: 'admin' } })
    await fireEvent.input(inputs().password, { target: { value: 'pw' } })

    await view.rerender({ open: true, error: '用户名或密码错误', loading: false })
    expect(screen.getByText('用户名或密码错误').classList.contains('error-text')).toBe(true)
    expect(inputs().username.value).toBe('admin')
    expect(inputs().password.value).toBe('pw')

    await view.rerender({ open: false, error: '' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await view.rerender({ open: true })
    expect(inputs().username.value).toBe('')
    expect(inputs().password.value).toBe('')
    expect(submit().disabled).toBe(true)
  })

  it('loading disables both cancel buttons, the submit and the forgot link, and swaps the label', async () => {
    const onCancel = vi.fn()
    const onForgotPassword = vi.fn()
    const view = render(LoginModal, { open: true, onCancel, onForgotPassword })
    const cancels = screen.getAllByRole('button', { name: '取消' }) as HTMLButtonElement[]
    expect(cancels).toHaveLength(2)
    await fireEvent.click(cancels[0])
    await fireEvent.click(cancels[1])
    expect(onCancel).toHaveBeenCalledTimes(2)
    await fireEvent.click(screen.getByRole('button', { name: '忘记密码？' }))
    expect(onForgotPassword).toHaveBeenCalledTimes(1)

    await view.rerender({ open: true, loading: true, onCancel, onForgotPassword })
    expect((screen.getAllByRole('button', { name: '取消' }) as HTMLButtonElement[]).every((b) => b.disabled)).toBe(true)
    expect((screen.getByRole('button', { name: '忘记密码？' }) as HTMLButtonElement).disabled).toBe(true)
    expect(submit().textContent?.trim()).toBe('登录中...')
    expect(submit().disabled).toBe(true)
  })

  it('hides the forgot-password link without a callback', () => {
    render(LoginModal, { open: true })
    expect(screen.queryByRole('button', { name: '忘记密码？' })).toBeNull()
  })
})

describe('PasswordChangePanel', () => {
  const field = (placeholder: string) => screen.getByPlaceholderText(placeholder) as HTMLInputElement
  const saveButton = () => document.querySelector('.password-save-button') as HTMLButtonElement
  async function fill(current: string, next: string, confirm: string) {
    await fireEvent.input(field('输入当前管理员密码'), { target: { value: current } })
    await fireEvent.input(field('至少 8 个字符'), { target: { value: next } })
    await fireEvent.input(field('再次输入新密码'), { target: { value: confirm } })
  }

  it('warns on mismatch and only enables save for a valid, matching pair with a callback', async () => {
    const view = render(PasswordChangePanel)
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByText('修改成功后，现有登录会话会失效，需要重新登录。')).toBeTruthy()

    await fill('old', 'newpassword', 'newpasswor')
    expect(screen.getByText('两次输入的新密码不一致。').classList.contains('warn')).toBe(true)
    expect(saveButton().disabled).toBe(true)

    await fill('old', 'newpassword', 'newpassword')
    expect(screen.queryByText('两次输入的新密码不一致。')).toBeNull()
    // 没有回调仍不可保存
    expect(saveButton().disabled).toBe(true)

    const onChangePassword = vi.fn()
    await view.rerender({ onChangePassword })
    expect(saveButton().disabled).toBe(false)

    await fill('', 'newpassword', 'newpassword')
    expect(saveButton().disabled).toBe(true)
    await fill('old', 'short', 'short')
    expect(saveButton().disabled).toBe(true)
    await fill('old', 'x'.repeat(257), 'x'.repeat(257))
    expect(saveButton().disabled).toBe(true)
    await fill('old', 'x'.repeat(256), 'x'.repeat(256))
    expect(saveButton().disabled).toBe(false)

    await view.rerender({ onChangePassword, saving: true })
    expect(saveButton().disabled).toBe(true)
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true)
  })

  it('clears the fields and shows the success message after a successful change', async () => {
    let resolve!: () => void
    const onChangePassword = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    render(PasswordChangePanel, { onChangePassword })
    await fill('old-pass', 'newpassword', 'newpassword')
    await fireEvent.click(saveButton())
    expect(onChangePassword).toHaveBeenCalledExactlyOnceWith({ current_password: 'old-pass', new_password: 'newpassword' })
    expect(saveButton().textContent?.trim()).toBe('更新中...')
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true)

    resolve()
    await waitFor(() => expect(screen.getByText('密码已更新，请使用新密码重新登录。').classList.contains('ok')).toBe(true))
    expect([field('输入当前管理员密码').value, field('至少 8 个字符').value, field('再次输入新密码').value]).toEqual(['', '', ''])
    expect(saveButton().textContent?.trim()).toBe('更新密码')
    expect(saveButton().disabled).toBe(true)
  })

  it('shows the error, keeps the fields, and Enter in any field triggers the change', async () => {
    const onChangePassword = vi.fn(async () => { throw new Error('当前密码错误') })
    render(PasswordChangePanel, { onChangePassword })
    await fill('old-pass', 'newpassword', 'newpassword')
    await fireEvent.keyDown(field('至少 8 个字符'), { key: 'a' })
    expect(onChangePassword).not.toHaveBeenCalled()
    await fireEvent.keyDown(field('再次输入新密码'), { key: 'Enter' })
    expect(onChangePassword).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('当前密码错误'))
    expect(field('输入当前管理员密码').value).toBe('old-pass')
    expect(saveButton().disabled).toBe(false)
  })
})

describe('ConfirmDialog', () => {
  it('follows title / message / item / labels / variant across rerenders', async () => {
    const view = render(ConfirmDialog, { open: true, title: '删除分类', message: '不可恢复', itemTitle: '工具' })
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.classList.contains('is-danger')).toBe(false)
    expect(screen.getByText('工具').tagName).toBe('STRONG')
    expect(buttonByText('确认')).toBeTruthy()
    expect(buttonByText('取消')).toBeTruthy()

    await view.rerender({ open: true, variant: 'danger', title: '删除书签', message: '真的吗', itemTitle: '', confirmLabel: '删除', cancelLabel: '算了' })
    expect(screen.getByRole('alertdialog').classList.contains('is-danger')).toBe(true)
    expect(screen.getByText('删除书签').id).toBe('confirm-dialog-title')
    expect(screen.getByText('真的吗').id).toBe('confirm-dialog-description')
    expect(document.querySelector('.confirm-target')).toBeNull()
    expect(buttonByText('删除')).toBeTruthy()
    expect(buttonByText('算了')).toBeTruthy()

    await view.rerender({ open: true, variant: 'default' })
    expect(screen.getByRole('alertdialog').classList.contains('is-danger')).toBe(false)
  })

  it('uses the latest callbacks and stops listening to the window after unmount', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const view = render(ConfirmDialog, { open: true, onConfirm: first })
    await view.rerender({ open: true, onConfirm: second })
    await fireEvent.keyDown(window, { key: 'Enter' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    view.unmount()
    await fireEvent.keyDown(window, { key: 'Enter' })
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('HomeFloatingActions', () => {
  const themeButton = () => screen.getByTestId('home-theme-toggle')

  it('derives the theme label and icon from the mode and the active theme', async () => {
    const view = render(HomeFloatingActions, { activeThemeMode: 'auto', activeTheme: 'light' })
    expect(themeButton().getAttribute('aria-label')).toBe('当前跟随系统，当前浅色，点击切换到浅色模式')
    expect(themeButton().textContent?.trim()).toBe('A')
    expect(themeButton().classList.contains('is-auto')).toBe(true)

    await view.rerender({ activeThemeMode: 'auto', activeTheme: 'dark' })
    expect(themeButton().getAttribute('title')).toBe('当前跟随系统，当前暗色，点击切换到浅色模式')
    expect(themeButton().classList.contains('is-dark')).toBe(true)

    await view.rerender({ activeThemeMode: 'light', activeTheme: 'light' })
    expect(themeButton().getAttribute('aria-label')).toBe('当前浅色模式，点击切换到暗色模式')
    expect(themeButton().textContent?.trim()).toBe('☀')
    expect(themeButton().classList.contains('is-auto')).toBe(false)

    await view.rerender({ activeThemeMode: 'dark', activeTheme: 'dark' })
    expect(themeButton().getAttribute('aria-label')).toBe('当前暗色模式，点击切换到跟随系统')
    expect(themeButton().textContent?.trim()).toBe('☾')
  })

  it('shows the platform shortcut hint after mount', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    render(HomeFloatingActions)
    expect(screen.getByTestId('home-search-button').getAttribute('title')).toBe('搜索书签 (⌘K)')
    cleanup()
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    render(HomeFloatingActions)
    expect(screen.getByTestId('home-search-button').getAttribute('title')).toBe('搜索书签 (Ctrl+K)')
  })

  it('wires toggle / admin / logout / login callbacks, closing the menu each time', async () => {
    const onToggleTheme = vi.fn()
    const onSwitchToAdmin = vi.fn()
    const onLogout = vi.fn()
    const onOpenLogin = vi.fn()
    const view = render(HomeFloatingActions, { isAuthenticated: true, onToggleTheme, onSwitchToAdmin, onLogout, onOpenLogin })
    const trigger = screen.getByTestId('home-actions-menu-trigger')
    for (const [testId, callback] of [['home-theme-toggle', onToggleTheme], ['home-admin-button', onSwitchToAdmin], ['home-logout-button', onLogout]] as const) {
      await fireEvent.click(trigger)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      await fireEvent.click(screen.getByTestId(testId))
      expect(callback).toHaveBeenCalledTimes(1)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    }
    expect(screen.queryByTestId('home-login-button')).toBeNull()

    await view.rerender({ isAuthenticated: true, authLoading: true })
    expect((screen.getByTestId('home-logout-button') as HTMLButtonElement).disabled).toBe(true)

    await view.rerender({ isAuthenticated: false })
    expect(screen.queryByTestId('home-admin-button')).toBeNull()
    await fireEvent.click(screen.getByTestId('home-login-button'))
    expect(onOpenLogin).toHaveBeenCalledTimes(1)
  })

  it('a pointerdown inside the open menu keeps it open; topNavigation / sortActive toggle classes', async () => {
    const view = render(HomeFloatingActions)
    const trigger = screen.getByTestId('home-actions-menu-trigger')
    await fireEvent.click(trigger)
    await fireEvent.pointerDown(screen.getByTestId('home-theme-toggle'))
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.floating-actions')!.classList.contains('menu-open')).toBe(true)
    await fireEvent.keyDown(window, { key: 'a' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await view.rerender({ topNavigation: true })
    expect(document.querySelector('.floating-actions')!.classList.contains('below-top-navigation')).toBe(true)
  })
})

describe('SearchBox', () => {
  const engines = (over: Partial<SearchEngineSetting> = {}): SearchEngineSetting => ({
    current: 'Google',
    engines: [
      { name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' },
      { name: 'Bing', icon: 'https://bing.com/favicon.ico', url_template: 'https://www.bing.com/search?q={q}&x={q}' },
    ],
    ...over,
  })
  const engineButton = () => document.querySelector('.engine-icon-button') as HTMLButtonElement
  const searchButton = () => document.querySelector('.search-button') as HTMLButtonElement
  const input = () => document.querySelector('#search-query') as HTMLInputElement

  it('opens the current engine with the encoded keyword on submit', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(SearchBox, { searchEngine: engines(), query: '' })
    expect(searchButton().disabled).toBe(true)
    await fireEvent.input(input(), { target: { value: '  a b&c ' } })
    expect(searchButton().disabled).toBe(false)
    await fireEvent.click(engineButton())
    await fireEvent.click(screen.getByRole('option', { name: /Bing/ }))
    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Bing')
    expect(document.querySelector('.engine-current-icon img')?.getAttribute('src')).toBe('https://bing.com/favicon.ico')
    const form = document.querySelector('form') as HTMLFormElement
    const event = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledExactlyOnceWith('https://www.bing.com/search?q=a%20b%26c&x=a%20b%26c', '_blank', 'noopener,noreferrer')
  })

  it('shows 未配置 without engines and never submits', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const view = render(SearchBox, { searchEngine: engines(), query: 'x' })
    await view.rerender({ searchEngine: null, query: 'x' })
    expect(document.querySelector('.engine-current-name')?.textContent).toBe('未配置')
    expect(engineButton().disabled).toBe(true)
    expect(engineButton().getAttribute('aria-label')).toBe('选择搜索引擎')
    expect(searchButton().disabled).toBe(true)
    ;(document.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()
  })

  it('preview mode is read-only and never opens the menu or submits', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(SearchBox, { searchEngine: engines(), query: 'x', preview: true, themeOverride: 'light' })
    const form = document.querySelector('form') as HTMLFormElement
    expect(form.classList.contains('is-preview')).toBe(true)
    expect(form.classList.contains('preview-light')).toBe(true)
    expect(input().readOnly).toBe(true)
    expect(searchButton().disabled).toBe(true)
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()
  })

  it('closes the menu on Escape, on focus leaving the picker, and when the selector goes away', async () => {
    const view = render(SearchBox, { searchEngine: engines() })
    await fireEvent.click(engineButton())
    expect(engineButton().getAttribute('aria-expanded')).toBe('true')
    await fireEvent.keyDown(screen.getByRole('option', { name: /Google/ }), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    await fireEvent.click(engineButton())
    const picker = document.querySelector('.engine-picker') as HTMLElement
    await fireEvent.focusOut(engineButton(), { relatedTarget: screen.getByRole('option', { name: /Bing/ }) })
    expect(screen.getByRole('listbox')).toBeTruthy()
    await fireEvent.focusOut(picker, { relatedTarget: input() })
    expect(screen.queryByRole('listbox')).toBeNull()

    await fireEvent.click(engineButton())
    await view.rerender({ searchEngine: engines(), showEngineSelector: false })
    expect(document.querySelector('.engine-picker')).toBeNull()
    expect((document.querySelector('form') as HTMLFormElement).classList.contains('has-engine-selector')).toBe(false)
    await view.rerender({ searchEngine: engines(), showEngineSelector: true })
    expect(engineButton().getAttribute('aria-expanded')).toBe('false')

    await fireEvent.click(engineButton())
    await view.rerender({ searchEngine: engines({ engines: [engines().engines[0]] }), showEngineSelector: true })
    expect(screen.queryByRole('listbox')).toBeNull()
    // 只剩一个引擎时点了也不展开
    await fireEvent.click(engineButton())
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('keeps query two-way bound with a legacy parent', async () => {
    render(SearchBoxBindHarness, { searchEngine: engines(), query: 'init' })
    expect(input().value).toBe('init')
    await fireEvent.input(input(), { target: { value: 'typed' } })
    expect(screen.getByTestId('bound-query').textContent).toBe('typed')
    await fireEvent.click(screen.getByTestId('set-query'))
    expect(input().value).toBe('from parent')
  })
})

describe('CategoryTreeSelect', () => {
  const items: CategoryTreeOption[] = [
    { id: 1, title: '工具', children: [{ id: 11, title: '编辑器', children: [] }] },
    { id: 2, title: '阅读', children: [] },
  ]
  const trigger = () => screen.getByRole('button', { name: '选择分类' })

  it('writes the selection back through bind:value, closes and refocuses the trigger', async () => {
    render(TreeSelectBindHarness, { items, value: 2, rootOptionLabel: '作为主分类' })
    expect(trigger().textContent?.trim()).toBe('阅读')
    await fireEvent.click(trigger())
    await fireEvent.click(screen.getByRole('button', { name: /展开 工具 的子分类/ }))
    await fireEvent.click(screen.getByRole('treeitem', { name: '编辑器' }))
    expect(screen.getByTestId('bound-value').textContent).toBe('11')
    expect(screen.queryByRole('tree')).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(trigger().textContent?.trim()).toBe('工具 / 编辑器')

    await fireEvent.click(trigger())
    const rootChoice = screen.getByRole('treeitem', { name: '作为主分类' })
    expect(rootChoice.getAttribute('aria-selected')).toBe('false')
    await fireEvent.click(rootChoice)
    expect(screen.getByTestId('bound-value').textContent).toBe('null')
    expect(trigger().textContent?.trim()).toBe('作为主分类')
  })

  it('follows value / items / placeholder props from the parent', async () => {
    const view = render(CategoryTreeSelect, { items, value: null, placeholder: '挑一个', ariaLabel: '选择分类' })
    expect(trigger().textContent?.trim()).toBe('挑一个')
    await view.rerender({ items, value: 1, ariaLabel: '选择分类' })
    expect(trigger().textContent?.trim()).toBe('工具')
    await view.rerender({ items: [], value: null, ariaLabel: '选择分类', emptyLabel: '没有分类' })
    expect(trigger().textContent?.trim()).toBe('没有分类')
    expect(trigger().getAttribute('title')).toBe('没有分类')
    await view.rerender({ items, value: 1, ariaLabel: '选择分类', disabled: true })
    expect((trigger() as HTMLButtonElement).disabled).toBe(true)
  })

  it('closes on a document pointerdown outside, not inside, and stops listening after unmount', async () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const view = render(TreeSelectBindHarness, { items, value: 1 })
    await fireEvent.click(trigger())
    await fireEvent.pointerDown(screen.getByRole('treeitem', { name: '阅读' }))
    expect(screen.getByRole('tree')).toBeTruthy()
    await fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('tree')).toBeNull()
    view.unmount()
    expect(remove.mock.calls.some(([type]) => type === 'pointerdown')).toBe(true)
  })

  it('ArrowDown / ArrowUp on the trigger open the menu and focus the first / last item; tree keys move focus', async () => {
    render(CategoryTreeSelect, { items, value: 2, ariaLabel: '选择分类' })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    const tree = screen.getByRole('tree')
    await waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('工具'))
    await fireEvent.keyDown(tree, { key: 'End' })
    expect(document.activeElement?.textContent?.trim()).toBe('阅读')
    await fireEvent.keyDown(tree, { key: 'Home' })
    expect(document.activeElement?.textContent?.trim()).toBe('工具')
    await fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent?.trim()).toBe('阅读')
    await fireEvent.keyDown(tree, { key: 'ArrowUp' })
    expect(document.activeElement?.textContent?.trim()).toBe('工具')
    await fireEvent.keyDown(tree, { key: 'Escape' })
    expect(screen.queryByRole('tree')).toBeNull()
    expect(document.activeElement).toBe(trigger())

    await fireEvent.keyDown(trigger(), { key: 'ArrowUp' })
    await waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('阅读'))
  })

  it('reports layout changes after every update only in inline-menu mode', async () => {
    const onLayoutChange = vi.fn()
    const view = render(TreeSelectBindHarness, { items, value: 1, inlineMenu: true, onLayoutChange })
    await tick()
    expect(onLayoutChange).toHaveBeenCalled()
    expect(document.querySelector('.category-tree-select')!.classList.contains('inline-menu')).toBe(true)

    let count = onLayoutChange.mock.calls.length
    await fireEvent.click(trigger())
    await tick()
    expect(onLayoutChange.mock.calls.length).toBeGreaterThan(count)

    count = onLayoutChange.mock.calls.length
    await fireEvent.click(screen.getByRole('button', { name: /展开 工具 的子分类/ }))
    await tick()
    expect(onLayoutChange.mock.calls.length).toBeGreaterThan(count)

    count = onLayoutChange.mock.calls.length
    await view.rerender({ items, value: 2, inlineMenu: true, onLayoutChange })
    await tick()
    expect(onLayoutChange.mock.calls.length).toBeGreaterThan(count)

    count = onLayoutChange.mock.calls.length
    await view.rerender({ items: [...items, { id: 3, title: '新', children: [] }], value: 2, inlineMenu: true, onLayoutChange })
    await tick()
    expect(onLayoutChange.mock.calls.length).toBeGreaterThan(count)

    cleanup()
    const idle = vi.fn()
    render(TreeSelectBindHarness, { items, value: 1, inlineMenu: false, onLayoutChange: idle })
    await fireEvent.click(trigger())
    await tick()
    expect(idle).not.toHaveBeenCalled()
  })
})

describe('BackupPanel', () => {
  type Category = { id: number; parent_id: number | null; title: string; sort?: number }
  const categories: Category[] = [
    { id: 3, parent_id: null, title: 'B 根', sort: 2 },
    { id: 1, parent_id: null, title: 'A 根', sort: 1 },
    { id: 12, parent_id: 1, title: 'A 子 2', sort: 2 },
    { id: 11, parent_id: 1, title: 'A 子 1', sort: 1 },
    { id: 9, parent_id: 99, title: '孤儿', sort: 0 },
  ]
  const bookmarks = [
    { id: 1, category_id: 1, title: 'x' },
    { id: 2, category_id: 11, title: 'y' },
    { id: 3, category_id: 11, title: 'z' },
  ]
  const rootRows = () => [...document.querySelectorAll('.category-tree-row-root')] as HTMLElement[]
  const childRows = () => [...document.querySelectorAll('.category-tree-row-child')] as HTMLElement[]
  const rowCheckbox = (row: HTMLElement) => row.querySelector('input') as HTMLInputElement
  const exportButton = () => buttonByText('导出备份')!

  it('selects everything and expands every root once categories first arrive, sorted with counts', async () => {
    const view = render(BackupPanel, { isAuthenticated: true, categories: [], bookmarks: [] })
    expect(screen.getByText('暂无分类')).toBeTruthy()
    expect(exportButton().disabled).toBe(true)
    expect(buttonByText('全选')!.disabled).toBe(true)

    await view.rerender({ isAuthenticated: true, categories, bookmarks })
    expect(rootRows().map((row) => row.querySelector('.category-tree-title')?.textContent)).toEqual(['孤儿', 'A 根', 'B 根'])
    expect(rootRows().map((row) => row.querySelector('.category-tree-count')?.textContent)).toEqual(['0', '1', '0'])
    expect(childRows().map((row) => row.querySelector('.category-tree-title')?.textContent)).toEqual(['A 子 1', 'A 子 2'])
    expect(childRows().map((row) => row.querySelector('.category-tree-count')?.textContent)).toEqual(['2', '0'])
    expect([...rootRows(), ...childRows()].every((row) => rowCheckbox(row).checked)).toBe(true)
    expect(exportButton().disabled).toBe(false)

    // 后续分类变化不再重置用户选择
    await fireEvent.click(buttonByText('清空')!)
    expect(screen.getByRole('status').textContent).toBe('至少选择一个分类后才能导出。')
    await view.rerender({ isAuthenticated: true, categories: [...categories, { id: 4, parent_id: null, title: 'C 根', sort: 3 }], bookmarks })
    expect([...rootRows(), ...childRows()].some((row) => rowCheckbox(row).checked)).toBe(false)
    expect(rootRows()).toHaveLength(4)
  })

  it('toggles roots with their children, marks partial roots as mixed, and exports the selection', async () => {
    const onExportData = vi.fn()
    render(BackupPanel, { isAuthenticated: true, categories, bookmarks, onExportData })
    const aRoot = () => rootRows()[1]
    await fireEvent.click(rowCheckbox(childRows()[0]))
    expect(rowCheckbox(aRoot()).checked).toBe(false)
    expect(rowCheckbox(aRoot()).indeterminate).toBe(true)
    expect(rowCheckbox(aRoot()).getAttribute('aria-checked')).toBe('mixed')

    await fireEvent.click(rowCheckbox(aRoot()))
    expect(rowCheckbox(aRoot()).checked).toBe(true)
    expect(rowCheckbox(aRoot()).indeterminate).toBe(false)
    expect(childRows().every((row) => rowCheckbox(row).checked)).toBe(true)

    await fireEvent.click(rowCheckbox(aRoot()))
    expect(rowCheckbox(aRoot()).getAttribute('aria-checked')).toBe('false')
    expect(childRows().some((row) => rowCheckbox(row).checked)).toBe(false)

    await fireEvent.click(screen.getByRole('checkbox', { name: '导出站点设置' }))
    await fireEvent.click(exportButton())
    expect(onExportData).toHaveBeenCalledTimes(1)
    const selection = onExportData.mock.calls[0][0]
    expect([...selection.categoryIds].sort((a: number, b: number) => a - b)).toEqual([3, 9])
    expect(selection.includeSettings).toBe(false)

    await fireEvent.click(buttonByText('全选')!)
    expect([...rootRows(), ...childRows()].every((row) => rowCheckbox(row).checked)).toBe(true)
  })

  it('collapses and expands a root', async () => {
    render(BackupPanel, { isAuthenticated: true, categories, bookmarks })
    const toggle = screen.getByRole('button', { name: '收起 A 根 子分类' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.click(toggle)
    expect(childRows()).toHaveLength(0)
    expect(screen.getByRole('button', { name: '展开 A 根 子分类' }).textContent?.trim()).toBe('+')
    await fireEvent.click(screen.getByRole('button', { name: '展开 A 根 子分类' }))
    expect(childRows()).toHaveLength(2)
  })

  it('imports a picked or dropped file with the source / mode rules and resets the input', async () => {
    const onImportData = vi.fn()
    render(BackupPanel, { isAuthenticated: true, categories, bookmarks, onImportData })
    const fileInput = document.querySelector('.import-input') as HTMLInputElement
    const json = new File(['{}'], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [json], configurable: true })
    await fireEvent.change(fileInput)
    expect(onImportData).toHaveBeenLastCalledWith(json, 'cf-navs', 'replace')

    const html = new File(['<html>'], 'bookmarks.html', { type: 'text/html' })
    const section = document.querySelector('[aria-labelledby="import-backup-title"]') as HTMLElement
    const dragover = new Event('dragover', { bubbles: true, cancelable: true })
    section.dispatchEvent(dragover)
    expect(dragover.defaultPrevented).toBe(true)
    await fireEvent.drop(section, { dataTransfer: { files: [html] } })
    expect(onImportData).toHaveBeenLastCalledWith(html, 'browser-html', 'merge')

    const [, modeSelect] = [...document.querySelectorAll('select')] as HTMLSelectElement[]
    await fireEvent.change(modeSelect, { target: { value: 'merge' } })
    await fireEvent.change(fileInput)
    expect(onImportData).toHaveBeenLastCalledWith(json, 'cf-navs', 'merge')
  })

  it('switching the source to browser HTML forces merge and writes back through bind:importSource', async () => {
    const onImportData = vi.fn()
    render(BackupPanelBindHarness, { importSource: 'sunpanel', onImportData })
    const [sourceSelect, modeSelect] = [...document.querySelectorAll('select')] as HTMLSelectElement[]
    expect(sourceSelect.value).toBe('sunpanel')
    expect(modeSelect.value).toBe('replace')
    await fireEvent.change(sourceSelect, { target: { value: 'browser-html' } })
    expect(screen.getByTestId('bound-source').textContent).toBe('browser-html')
    expect(modeSelect.value).toBe('merge')

    const fileInput = document.querySelector('.import-input') as HTMLInputElement
    const json = new File(['{}'], 'export.json')
    Object.defineProperty(fileInput, 'files', { value: [json], configurable: true })
    await fireEvent.change(fileInput)
    expect(onImportData).toHaveBeenLastCalledWith(json, 'browser-html', 'merge')

    await fireEvent.change(sourceSelect, { target: { value: 'cf-navs' } })
    expect(screen.getByTestId('bound-source').textContent).toBe('cf-navs')
    expect(modeSelect.value).toBe('merge')
  })

  it('shows error over message and disables actions while importing / exporting / signed out', async () => {
    const view = render(BackupPanel, { isAuthenticated: true, categories, bookmarks, backupMessage: '已导出' })
    expect(screen.getByText('已导出').className).toContain('ok')
    await view.rerender({ isAuthenticated: true, categories, bookmarks, backupMessage: '已导出', backupError: '失败' })
    expect(screen.getByText('失败').className).toContain('error')
    expect(screen.queryByText('已导出')).toBeNull()

    await view.rerender({ isAuthenticated: true, categories, bookmarks, importing: true })
    expect(buttonByText('导入中...')!.disabled).toBe(true)
    expect(exportButton().disabled).toBe(true)
    await view.rerender({ isAuthenticated: true, categories, bookmarks, importing: false, exporting: true })
    expect(buttonByText('获取最新数据...')!.disabled).toBe(true)
    await view.rerender({ isAuthenticated: false, categories, bookmarks, exporting: false })
    expect(exportButton().disabled).toBe(true)
    expect(buttonByText('选择文件并导入')!.disabled).toBe(true)
  })
})

describe('CategoryIcon', () => {
  const root = () => document.querySelector('[data-category-icon]') as HTMLElement | null
  const img = () => root()?.querySelector('img') as HTMLImageElement | null
  const DATA = 'data:image/png;base64,AAAA'

  it('renders nothing without an icon unless it is an image display, and the title fallback otherwise', async () => {
    const view = render(CategoryIcon, { category: { id: 1, title: '学习', icon: '' } })
    expect(root()).toBeNull()
    await view.rerender({ category: { id: 1, title: '学习', icon: '   ' } })
    expect(root()).toBeNull()
    await view.rerender({ category: { id: 1, title: '学习', icon: '📚' } })
    expect(root()!.querySelector('.category-icon-text')?.textContent).toBe('📚')
    expect(img()).toBeNull()
  })

  it('follows size / className / label / loading props', async () => {
    const view = render(CategoryIcon, { category: { id: 1, title: '学习', icon: DATA }, size: 20, className: 'x', imageLoading: 'eager' })
    expect(root()!.getAttribute('style')).toMatch(/^--category-icon-size: 20px;?$/)
    expect(root()!.className).toContain('category-icon x')
    expect(root()!.getAttribute('aria-hidden')).toBe('true')
    expect(img()!.getAttribute('src')).toBe(DATA)
    expect(img()!.getAttribute('loading')).toBe('eager')

    await view.rerender({ category: { id: 1, title: '学习', icon: DATA }, size: '2rem', className: '', label: '学习图标', imageLoading: 'lazy' })
    expect(root()!.getAttribute('style')).toMatch(/^--category-icon-size: 2rem;?$/)
    expect(root()!.getAttribute('aria-label')).toBe('学习图标')
    expect(root()!.hasAttribute('aria-hidden')).toBe(false)
    expect(img()!.getAttribute('loading')).toBe('lazy')
  })

  it('preview shows data / http URLs directly and never the native proxy route', async () => {
    const view = render(CategoryIcon, { category: { id: 5, title: '远程', icon: 'https://example.com/a.png' }, preview: true })
    expect(img()!.getAttribute('src')).toBe('https://example.com/a.png')
    await view.rerender({ category: { id: 5, title: '远程', icon: 'https://example.com/a.png' }, preview: false })
    expect(img()!.getAttribute('src')).toMatch(/^\/api\/category-icon\/5\?v=/)
    await view.rerender({ category: { id: 5, title: '远程', icon: 'https://example.com/a.png' }, preview: false, iconAccessKey: 'k1' })
    expect(img()!.getAttribute('src')).toMatch(/&key=k1$/)
    await view.rerender({ category: { id: 5, title: '远程', icon: 'mdi:home' }, preview: true, iconAccessKey: '' })
    expect(img()).toBeNull()
    expect(root()!.querySelector('.category-icon-fallback')?.textContent).toBe('远')
  })

  it('a failed preview image falls back to the title and a new image retries', async () => {
    const view = render(CategoryIcon, { category: { id: 5, title: '远程', icon: DATA } })
    await fireEvent.error(img()!)
    expect(img()).toBeNull()
    expect(root()!.querySelector('.category-icon-fallback')?.textContent).toBe('远')
    await view.rerender({ category: { id: 5, title: '远程', icon: 'data:image/png;base64,BBBB' } })
    expect(img()!.getAttribute('src')).toBe('data:image/png;base64,BBBB')
    // 回到先前失败过的图标也要重新尝试：换源时失败标记已复位
    await view.rerender({ category: { id: 5, title: '远程', icon: DATA } })
    expect(img()!.getAttribute('src')).toBe(DATA)
  })
})
