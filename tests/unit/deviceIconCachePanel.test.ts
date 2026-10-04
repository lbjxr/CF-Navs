// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DeviceIconCachePanel from '../../src/components/DeviceIconCachePanel.svelte'
import { iconDevice } from '../../src/lib/iconDeviceState'

vi.mock('../../src/lib/iconDeviceState', async () => {
  const { writable } = await import('svelte/store')
  let state: any = { trusted: false, phase: 'disabled', epoch: 0, lease: null, dataset: null, leaseUntil: null, checkedAt: null, stats: { entries: 0, bodyBytes: 0, indexBytes: 0 }, error: null }
  const store = writable(state)
  return { ICON_LOCAL_COPY_ENABLED: true, iconDevice: {
    subscribe: store.subscribe, snapshot: () => state,
    setTrusted: vi.fn(async (trusted: boolean) => { state = { ...state, trusted, phase: trusted ? 'waiting-auth' : 'disabled' }; store.set(state) }),
    clearCopies: vi.fn(async () => undefined), resume: vi.fn(async () => undefined),
  } }
})
beforeEach(async () => { await iconDevice.setTrusted(false); vi.clearAllMocks() })
afterEach(cleanup)

describe('device-only icon controls', () => {
  it('defaults off and exposes the private-copy risk, joint budget and non-cloud scope', () => {
    render(DeviceIconCachePanel)
    const checkbox = screen.getByRole('checkbox', { name: '在此设备保留书签图标' }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(screen.getByText(/并非加密保险箱/)).toBeTruthy()
    expect(screen.getByText(/24 小时/)).toBeTruthy()
    expect(screen.getByText('0 / 1,000')).toBeTruthy()
    expect(screen.getByText(/10.00 MiB/)).toBeTruthy()
    expect(screen.getByText(/不随全站设置保存或备份/)).toBeTruthy()
  })
  it('requests verification through the page callback, without submitting the settings form', async () => {
    const verify = vi.fn(async () => undefined)
    render(DeviceIconCachePanel, { props: { onVerify: verify } })
    await fireEvent.change(screen.getByRole('checkbox'), { target: { checked: true } })
    await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce())
    expect(iconDevice.setTrusted).toHaveBeenCalledWith(true)
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('type')).toBe('button')
  })
  it('keeps cleanup errors observable through an accessible status region', async () => {
    vi.mocked(iconDevice.clearCopies).mockRejectedValueOnce(new Error('simulated disk failure'))
    render(DeviceIconCachePanel)
    await fireEvent.click(screen.getByRole('button', { name: '清理此设备图标副本' }))
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toContain('操作未完成'))
    expect(screen.getByRole('button', { name: '清理此设备图标副本' }).hasAttribute('disabled')).toBe(false)
  })
})
