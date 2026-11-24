// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from '../../src/components/SettingsPanel.svelte'
import type { SettingsFormModel } from '../../src/lib/settingsForm'
import type { SettingsLeaveGuard } from '../../src/lib/settingsLeave'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'

vi.mock('../../src/lib/localIconView', () => import('../helpers/inactiveLocalIconView'))
const baseValue = { ...DEFAULT_SETTINGS, site_title: 'Original' }
let guard: SettingsLeaveGuard | null = null
beforeEach(() => {
  guard = null
  Element.prototype.scrollIntoView = () => {}
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const register = (next: SettingsLeaveGuard | null) => { guard = next }
const currentGuard = () => guard as SettingsLeaveGuard
const title = () => screen.getByPlaceholderText('请输入站点标题') as HTMLInputElement
const editTitle = (value = 'Edited') => fireEvent.input(title(), { target: { value } })
function unload(): Event {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('SettingsPanel draft ownership and leave guard', () => {
  it('preserves a dirty form across value/loading refreshes and synchronizes only after discard', async () => {
    const view = render(SettingsPanel, { value: baseValue, onSubmit: vi.fn(), onRegisterLeaveGuard: register })
    await editTitle()
    await view.rerender({ loading: true, value: null })
    expect(currentGuard().getState().dirty).toBe(true)
    await view.rerender({ loading: false, value: { ...baseValue, site_title: 'Refreshed' } })
    expect(title().value).toBe('Edited')
    expect(currentGuard().getState().dirty).toBe(true)
    currentGuard().discard()
    await tick()
    expect(title().value).toBe('Refreshed')
    expect(currentGuard().getState().dirty).toBe(false)
  })

  it('installs beforeunload only for an edited active draft and removes it on discard or unmount', async () => {
    const view = render(SettingsPanel, { value: baseValue, onSubmit: vi.fn(), onRegisterLeaveGuard: register })
    expect(unload().defaultPrevented).toBe(false)
    await editTitle()
    expect(unload().defaultPrevented).toBe(true)
    currentGuard().discard()
    await tick()
    expect(unload().defaultPrevented).toBe(false)
    await editTitle()
    view.unmount()
    expect(guard).toBeNull()
    expect(unload().defaultPrevented).toBe(false)
  })

  it('uses acknowledged snapshot as baseline and keeps subsequent edits dirty', async () => {
    let complete!: (ack: boolean) => void
    let submitted!: SettingsFormModel
    const onSubmit = vi.fn((payload: SettingsFormModel) => {
      submitted = payload
      return new Promise<boolean>(resolve => { complete = resolve })
    })
    const view = render(SettingsPanel, { value: baseValue, onSubmit, onRegisterLeaveGuard: register })
    await editTitle('Submitted')
    const save = currentGuard().save()
    await tick()
    await view.rerender({ value: submitted })
    expect(currentGuard().getState().dirty).toBe(true)
    expect(unload().defaultPrevented).toBe(true)
    await editTitle('Later edit')
    complete(true)
    expect(await save).toEqual({ saved: true, error: '' })
    await tick()
    expect(title().value).toBe('Later edit')
    expect(currentGuard().getState().dirty).toBe(true)
    expect(onSubmit.mock.calls[0][0].site_title).toBe('Submitted')
  })

  it('never clears a draft on false acknowledgement even when value was applied early without an error string', async () => {
    const onSubmit = vi.fn(async (payload: SettingsFormModel) => {
      await view.rerender({ value: payload })
      return false
    })
    const view = render(SettingsPanel, { value: baseValue, onSubmit, onRegisterLeaveGuard: register })
    await editTitle()
    expect((await currentGuard().save()).saved).toBe(false)
    expect(title().value).toBe('Edited')
    expect(currentGuard().getState().dirty).toBe(true)
    expect(unload().defaultPrevented).toBe(true)
  })

  it('keeps failure drafts and allows retry after a callback throws synchronously', async () => {
    const onSubmit = vi.fn(() => { throw new Error('Synchronous failure') })
    const view = render(SettingsPanel, { value: baseValue, onSubmit, onRegisterLeaveGuard: register })
    await editTitle()
    expect(await currentGuard().save()).toEqual({ saved: false, error: 'Synchronous failure' })
    expect(screen.getByRole('alert').textContent).toContain('Synchronous failure')
    expect(currentGuard().getState().saving).toBe(false)
    const successfulSubmit = vi.fn(async (payload: SettingsFormModel) => {
      await view.rerender({ value: payload })
      return true
    })
    await view.rerender({ onSubmit: successfulSubmit })
    expect(await currentGuard().save()).toEqual({ saved: true, error: '' })
    await tick()
    expect(successfulSubmit).toHaveBeenCalledTimes(1)
    expect(currentGuard().getState().dirty).toBe(false)
    expect(unload().defaultPrevented).toBe(false)
  })

  it('shares a pending save between repeated requests rather than double-posting', async () => {
    let complete!: (ack: boolean) => void
    let payload!: SettingsFormModel
    const onSubmit = vi.fn((submitted: SettingsFormModel) => {
      payload = submitted
      return new Promise<boolean>(resolve => { complete = resolve })
    })
    const view = render(SettingsPanel, { value: baseValue, onSubmit, onRegisterLeaveGuard: register })
    await editTitle()
    const first = currentGuard().save()
    const second = currentGuard().save()
    await tick()
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await view.rerender({ value: payload })
    complete(true)
    expect((await first).saved).toBe(true)
    expect((await second).saved).toBe(true)
  })

  it('clears draft, guard and unload protection on auth loss and ignores a late success', async () => {
    let complete!: (ack: boolean) => void
    const onSubmit = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve }))
    const view = render(SettingsPanel, { value: baseValue, onSubmit, onRegisterLeaveGuard: register })
    await editTitle()
    const save = currentGuard().save()
    await tick()
    await view.rerender({ sessionActive: false, value: null })
    expect(guard).toBeNull()
    expect(title().value).toBe('')
    expect(unload().defaultPrevented).toBe(false)
    complete(true)
    expect(await save).toEqual({ saved: false, error: '' })
    await view.rerender({ sessionActive: true, value: { ...baseValue, site_title: 'New session' } })
    expect(title().value).toBe('New session')
    expect(currentGuard().getState().dirty).toBe(false)
  })

  it('drops old drafts and pending completions when session identity changes while still authenticated', async () => {
    let complete!: (ack: boolean) => void
    const onSubmit = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve }))
    const view = render(SettingsPanel, { value: baseValue, sessionIdentity: {}, onSubmit, onRegisterLeaveGuard: register })
    await editTitle()
    const save = currentGuard().save()
    await tick()
    await view.rerender({ sessionIdentity: {}, value: { ...baseValue, site_title: 'Other identity' } })
    expect(title().value).toBe('Other identity')
    expect(currentGuard().getState().dirty).toBe(false)
    expect(unload().defaultPrevented).toBe(false)
    complete(true)
    expect((await save).saved).toBe(false)
    expect(title().value).toBe('Other identity')
  })
})
