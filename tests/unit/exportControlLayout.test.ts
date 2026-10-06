// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pageExportControl } from '../../scripts/lib/backupExportProbe.mjs'

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('export control layout without animation-frame dependency', () => {
  it('returns real geometry even when the browser never schedules an animation frame', async () => {
    document.body.innerHTML = '<button>数据备份与导入</button>'
    const button = document.querySelector('button')!
    const scroll = vi.fn()
    Object.defineProperty(button, 'scrollIntoView', { value: scroll })
    Object.defineProperty(button, 'getBoundingClientRect', { value: () => ({ left: 10, top: 20, width: 100, height: 40 }) })
    const frame = vi.fn() // deliberately never invokes the callback
    vi.stubGlobal('requestAnimationFrame', frame)
    expect(await pageExportControl('backup', {})).toMatchObject({ x: 60, y: 40, disabled: false })
    expect(scroll).toHaveBeenCalledWith({ block: 'center', inline: 'center', behavior: 'instant' })
    expect(frame).not.toHaveBeenCalled()
  })
  it('does not accept a missing control', async () => { expect(await pageExportControl('backup', {})).toBeNull() })
  it('does not invent coordinates for a hidden control', async () => {
    document.body.innerHTML = '<button>数据备份与导入</button>'
    Object.defineProperty(document.querySelector('button'), 'scrollIntoView', { value: vi.fn() })
    expect(await pageExportControl('backup', {})).toBeNull()
  })
})
