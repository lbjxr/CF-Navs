// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Admin from '../../src/views/Admin.svelte'
// 提前编译真实面板；本文件验证离开流程，不把 Vite 首次编译耗时算进 waitFor 的行为期限。
import '../../src/components/SettingsPanel.svelte'
import type { SettingsFormModel } from '../../src/lib/settingsForm'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'
import { installNativeDialogStub } from '../helpers/nativeDialog'

vi.mock('../../src/lib/localIconView', () => import('../helpers/inactiveLocalIconView'))
const baseValue = { ...DEFAULT_SETTINGS, site_title: 'Original' }
let nativeDialog: ReturnType<typeof installNativeDialogStub>
beforeEach(() => {
  nativeDialog = installNativeDialogStub()
  Element.prototype.scrollIntoView = () => {}
})
afterEach(() => { cleanup(); nativeDialog.restore(); vi.restoreAllMocks() })
const settingsTitle = () => screen.getByPlaceholderText('请输入站点标题') as HTMLInputElement
const prompt = () => screen.getByRole('dialog', { name: '离开设置前保存更改？' })
async function openAndEditSettings() {
  await fireEvent.click(screen.getByTestId('admin-tab-settings'))
  await waitFor(() => expect(settingsTitle().value).toBe('Original'))
  await fireEvent.input(settingsTitle(), { target: { value: 'Edited' } })
}

describe('Admin settings leave orchestration', () => {
  it('continues editing without unmounting and discards only after an explicit decision', async () => {
    const onSelectTab = vi.fn()
    render(Admin, { isAuthenticated: true, settingsValue: baseValue, onSubmitSettings: vi.fn(), onSelectTab })
    await openAndEditSettings()
    onSelectTab.mockClear()
    await fireEvent.click(screen.getByTestId('admin-tab-bookmarks'))
    expect(prompt()).toBeTruthy()
    expect(onSelectTab).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(settingsTitle().value).toBe('Edited')
    await fireEvent.click(screen.getByTestId('admin-tab-bookmarks'))
    await fireEvent.click(screen.getByRole('button', { name: '放弃更改' }))
    expect(onSelectTab).toHaveBeenCalledExactlyOnceWith('bookmarks')
    expect(screen.queryByPlaceholderText('请输入站点标题')).toBeNull()
  })

  it.each([
    { trigger: 'admin-home-button', callback: 'home' },
    { trigger: 'admin-logout-button', callback: 'logout' },
  ])('routes $callback through the same save/discard/stay decision', async ({ trigger, callback }) => {
    const onSwitchToHome = vi.fn()
    const onLogout = vi.fn()
    render(Admin, { isAuthenticated: true, canSeeHome: true, settingsValue: baseValue, onSubmitSettings: vi.fn(), onSwitchToHome, onLogout })
    await openAndEditSettings()
    await fireEvent.click(screen.getByTestId(trigger))
    expect(prompt()).toBeTruthy()
    expect(onSwitchToHome).not.toHaveBeenCalled()
    expect(onLogout).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    await fireEvent.click(screen.getByTestId(trigger))
    await fireEvent.click(screen.getByRole('button', { name: '放弃更改' }))
    expect(callback === 'home' ? onSwitchToHome : onLogout).toHaveBeenCalledTimes(1)
    expect(settingsTitle().value).toBe('Original')
  })

  it('keeps failed saves in settings even if the persistence callback applied value before returning false', async () => {
    const onSubmitSettings = vi.fn(async (payload: SettingsFormModel) => {
      await view.rerender({ settingsValue: payload, settingsError: 'Local persistence failed' })
      return false
    })
    const onSelectTab = vi.fn()
    const view = render(Admin, { isAuthenticated: true, settingsValue: baseValue, onSubmitSettings, onSelectTab })
    await openAndEditSettings()
    onSelectTab.mockClear()
    await fireEvent.click(screen.getByTestId('admin-tab-bookmarks'))
    await fireEvent.click(screen.getByRole('button', { name: '保存并离开' }))
    await waitFor(() => expect(prompt().textContent).toContain('Local persistence failed'))
    expect(onSelectTab).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(settingsTitle().value).toBe('Edited')
    expect(document.body.textContent).toContain('有未保存更改')
  })

  it('locks the first target during async save and navigates once after acknowledgement', async () => {
    let complete!: (ack: boolean) => void
    let payload!: SettingsFormModel
    const onSubmitSettings = vi.fn((submitted: SettingsFormModel) => {
      payload = submitted
      return new Promise<boolean>(resolve => { complete = resolve })
    })
    const onSelectTab = vi.fn()
    const onSwitchToHome = vi.fn()
    const view = render(Admin, { isAuthenticated: true, canSeeHome: true, settingsValue: baseValue, onSubmitSettings, onSelectTab, onSwitchToHome })
    await openAndEditSettings()
    onSelectTab.mockClear()
    await fireEvent.click(screen.getByTestId('admin-tab-bookmarks'))
    await fireEvent.click(screen.getByRole('button', { name: '保存并离开' }))
    await fireEvent.click(screen.getByTestId('admin-home-button'))
    await fireEvent.click(screen.getByTestId('admin-tab-analytics'))
    expect(onSubmitSettings).toHaveBeenCalledTimes(1)
    expect(onSelectTab).not.toHaveBeenCalled()
    expect(onSwitchToHome).not.toHaveBeenCalled()
    await view.rerender({ settingsValue: payload })
    complete(true)
    await waitFor(() => expect(onSelectTab).toHaveBeenCalledExactlyOnceWith('bookmarks'))
    expect(onSwitchToHome).not.toHaveBeenCalled()
  })

  it('invalidates pending leave and late save completion when authentication is lost', async () => {
    let complete!: (ack: boolean) => void
    const onSubmitSettings = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve }))
    const onSwitchToHome = vi.fn()
    const view = render(Admin, { isAuthenticated: true, canSeeHome: true, settingsValue: baseValue, onSubmitSettings, onSwitchToHome })
    await openAndEditSettings()
    await fireEvent.click(screen.getByTestId('admin-home-button'))
    await fireEvent.click(screen.getByRole('button', { name: '保存并离开' }))
    await view.rerender({ isAuthenticated: false, settingsValue: null })
    expect(screen.queryByRole('dialog', { name: '离开设置前保存更改？' })).toBeNull()
    expect(settingsTitle().value).toBe('')
    complete(true)
    await tick()
    await tick()
    expect(onSwitchToHome).not.toHaveBeenCalled()
    expect(settingsTitle().value).toBe('')
  })

  it('cancels pending navigation for a replacement session that remains authenticated', async () => {
    let complete!: (ack: boolean) => void
    const onSubmitSettings = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve }))
    const onSwitchToHome = vi.fn()
    const view = render(Admin, { isAuthenticated: true, sessionIdentity: {}, canSeeHome: true, settingsValue: baseValue, onSubmitSettings, onSwitchToHome })
    await openAndEditSettings()
    await fireEvent.click(screen.getByTestId('admin-home-button'))
    await fireEvent.click(screen.getByRole('button', { name: '保存并离开' }))
    await view.rerender({ sessionIdentity: {}, settingsValue: { ...baseValue, site_title: 'Other session' } })
    expect(screen.queryByRole('dialog', { name: '离开设置前保存更改？' })).toBeNull()
    expect(settingsTitle().value).toBe('Other session')
    complete(true)
    await tick()
    await tick()
    expect(onSwitchToHome).not.toHaveBeenCalled()
    expect(settingsTitle().value).toBe('Other session')
  })
})
