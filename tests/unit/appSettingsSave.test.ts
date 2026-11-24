import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginResp, Settings } from '../../shared/types'
import { createSettingsController, type SettingsControllerState } from '../../src/lib/appSettingsController'
import type { SettingsFormValue } from '../../src/lib/appData'
import { toastStore } from '../../src/lib/toast'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'

const savedSettings: Settings = { ...DEFAULT_SETTINGS, site_title: 'Saved' }
const payload: SettingsFormValue = { ...DEFAULT_SETTINGS, site_title: 'Submitted' }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}

function controllerFixture() {
  // 仅测试用的会话引用，不依赖浏览器认证存储。
  let session: LoginResp | null = { token: 'test-session-a', expires_at: Number.MAX_SAFE_INTEGER, username: 'tester' }
  const states: SettingsControllerState[] = []
  const update = vi.fn(async () => savedSettings)
  const apply = vi.fn(async () => {})
  const controller = createSettingsController({
    onChange: state => states.push(state),
    api: { settings: { update }, auth: { changePassword: async () => {} } },
    authViewIntent: { invalidate: () => {} },
    getSession: () => session,
    getAdminData: () => ({ categories: [], bookmarks: [], settings: savedSettings }),
    requestConfirmation: async () => true,
    applyLocalSettings: apply,
    applyLoggedInData: () => {},
    persistCurrentAdminData: async () => {},
    refreshAdminDataAfterMutation: async () => {},
    setSession: () => {},
    resetCategories: () => {},
    resetBookmarks: () => {},
    resetAdminData: () => {},
    clearCachedAdminData: async () => {},
    ensureLazyComponent: async () => {},
    setRootError: () => {},
    setLoginModalOpen: () => {},
    setCurrentView: () => {},
  })
  return { controller, update, apply, states, replaceSession: (next: LoginResp | null) => { session = next } }
}

beforeEach(() => { vi.spyOn(toastStore, 'addToast').mockReturnValue('') })
afterEach(() => { vi.restoreAllMocks() })

describe('settings save acknowledgement and session ownership', () => {
  it('acknowledges only after local application finishes', async () => {
    const fixture = controllerFixture()
    const localApply = deferred<void>()
    fixture.apply.mockImplementation(() => localApply.promise)
    const request = fixture.controller.submit(payload)
    await vi.waitFor(() => expect(fixture.apply).toHaveBeenCalledWith(savedSettings))
    expect(fixture.controller.getState().saving).toBe(true)
    expect(toastStore.addToast).not.toHaveBeenCalled()
    localApply.resolve()
    expect(await request).toBe(true)
    expect(fixture.controller.getState()).toMatchObject({ saving: false, error: '' })
    expect(toastStore.addToast).toHaveBeenCalledExactlyOnceWith('设置已保存', 'success')
  })

  it('returns false for API failure while retaining the existing error channel', async () => {
    const fixture = controllerFixture()
    fixture.update.mockRejectedValue(new Error('API failed'))
    expect(await fixture.controller.submit(payload)).toBe(false)
    expect(fixture.apply).not.toHaveBeenCalled()
    expect(fixture.controller.getState()).toMatchObject({ saving: false, error: 'API failed' })
    expect(toastStore.addToast).not.toHaveBeenCalled()
  })

  it('returns false for local persistence failure even after the API succeeded', async () => {
    const fixture = controllerFixture()
    fixture.apply.mockRejectedValue(new Error('Local persistence failed'))
    expect(await fixture.controller.submit(payload)).toBe(false)
    expect(fixture.update).toHaveBeenCalledTimes(1)
    expect(fixture.controller.getState()).toMatchObject({ saving: false, error: 'Local persistence failed' })
    expect(toastStore.addToast).not.toHaveBeenCalled()
  })

  it('invalidates pending results on reset before applying them locally', async () => {
    const fixture = controllerFixture()
    const apiResult = deferred<Settings>()
    fixture.update.mockImplementation(() => apiResult.promise)
    const request = fixture.controller.submit(payload)
    fixture.controller.reset()
    apiResult.resolve(savedSettings)
    expect(await request).toBe(false)
    expect(fixture.apply).not.toHaveBeenCalled()
    expect(fixture.controller.getState()).toMatchObject({ saving: false, error: '' })
    expect(toastStore.addToast).not.toHaveBeenCalled()
  })

  it('rejects a result for another session even before the App reset callback runs', async () => {
    const fixture = controllerFixture()
    const apiResult = deferred<Settings>()
    fixture.update.mockImplementation(() => apiResult.promise)
    const request = fixture.controller.submit(payload)
    fixture.replaceSession({ token: 'test-session-b', expires_at: Number.MAX_SAFE_INTEGER, username: 'tester' })
    apiResult.resolve(savedSettings)
    expect(await request).toBe(false)
    expect(fixture.apply).not.toHaveBeenCalled()
    expect(toastStore.addToast).not.toHaveBeenCalled()
    // App 的会话变更接线负责立即清掉旧 busy；这里独立验证结果不能越过身份边界。
    fixture.controller.reset()
    expect(fixture.controller.getState().saving).toBe(false)
  })

  it('does not revive toast, error or busy when a local application finishes after session cleanup', async () => {
    const fixture = controllerFixture()
    const localApply = deferred<void>()
    fixture.apply.mockImplementation(() => localApply.promise)
    const request = fixture.controller.submit(payload)
    await vi.waitFor(() => expect(fixture.apply).toHaveBeenCalledTimes(1))
    fixture.replaceSession(null)
    fixture.controller.reset()
    const stateCount = fixture.states.length
    localApply.resolve()
    expect(await request).toBe(false)
    expect(fixture.states).toHaveLength(stateCount)
    expect(fixture.controller.getState()).toMatchObject({ saving: false, error: '' })
    expect(toastStore.addToast).not.toHaveBeenCalled()
  })
})
