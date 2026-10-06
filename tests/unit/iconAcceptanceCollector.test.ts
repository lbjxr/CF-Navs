// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectIconFixtures } from '../../scripts/lib/iconAcceptance.mjs'
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers() })
describe('browser fixture collector', () => {
  it('retains every matched instance instead of using querySelector', async () => {
    document.body.innerHTML = '<span class="icon">文</span><span class="icon">文</span>'
    const rows = await collectIconFixtures([{ key: 'text', selector: '.icon' }])
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.kind === 'text' && row.text === '文')).toBe(true)
  })
  it('leaves a missing selector missing for the oracle to reject', async () => {
    expect(await collectIconFixtures([{ key: 'missing', selector: '.absent' }])).toEqual([])
  })
  it('records unreadable image evidence rather than falling back to loaded', async () => {
    document.body.innerHTML = '<span><img></span>'
    const image = document.querySelector('img')!
    image.decode = vi.fn().mockRejectedValue(new Error('decode'))
    const [row] = await collectIconFixtures([{ key: 'image', selector: 'span' }])
    expect(row.error).toBe('image-unreadable')
    expect(row.loaded).toBe(false)
  })
  it('reads pixels from the displayed image, without fetching its URL', async () => {
    document.body.innerHTML = '<span><img></span>'
    const image = document.querySelector('img')!
    image.decode = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(image, 'naturalWidth', { value: 32 })
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, getImageData: () => ({ data: new Uint8ClampedArray(256).fill(255) }) } as any)
    const [row] = await collectIconFixtures([{ key: 'image', selector: 'span' }])
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 8, 8)
    expect(row.pixels).toHaveLength(256)
    expect(row.loaded).toBe(true)
  })
  it('fails closed for canvas security errors', async () => {
    document.body.innerHTML = '<img>'
    document.querySelector('img')!.decode = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new Error('SecurityError') })
    const [row] = await collectIconFixtures([{ key: 'image', selector: 'img' }])
    expect(row.error).toBe('image-unreadable')
  })
  it('bounds a never-settling lazy image decode', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<img>'
    document.querySelector('img')!.decode = () => new Promise(() => {})
    const pending = collectIconFixtures([{key:'lazy',selector:'img'}])
    await vi.advanceTimersByTimeAsync(1500)
    expect((await pending)[0].error).toBe('image-unreadable')
  })

})
