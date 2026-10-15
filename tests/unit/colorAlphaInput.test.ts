// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import ColorAlphaInput from '../../src/components/ColorAlphaInput.svelte'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function openPicker(value = '#ffffff', alpha: number | null = null) {
  const view = render(ColorAlphaInput, {
    props: { value, alpha, inputLabel: '颜色值' },
  })
  return {
    ...view,
    input: screen.getByLabelText('颜色值') as HTMLInputElement,
    swatch: screen.getByRole('button', { name: '打开颜色选择器' }),
  }
}

describe('ColorAlphaInput', () => {
  it('opens the HSV popover and closes it from outside or Escape', async () => {
    const { swatch } = openPicker()

    expect(screen.queryByRole('slider', { name: '色相' })).toBeNull()
    await fireEvent.click(swatch)
    expect(screen.getByRole('slider', { name: '色相' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: '透明度' })).toBeTruthy()

    await fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('slider', { name: '色相' })).toBeNull()

    await fireEvent.click(swatch)
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('slider', { name: '色相' })).toBeNull()
  })

  it.each([
    ['rgba(182, 164, 47, 0.65)', '0.65'],
    ['#ccc', '1'],
    ['#123456', '1'],
    ['#12345688', '0.53'],
  ])('reverse-syncs %s into the HSV and alpha controls', async (text, expectedAlpha) => {
    const { input, swatch } = openPicker()
    await fireEvent.click(swatch)
    await fireEvent.input(input, { target: { value: text } })

    expect(input.value).toBe(text)
    expect(screen.getByRole('slider', { name: '透明度' }).getAttribute('aria-valuenow')).toBe(expectedAlpha)
    expect(screen.getByRole('slider', { name: '饱和度与明度' }).getAttribute('aria-valuetext')).toMatch(/饱和度/)
  })

  it('updates the color from keyboard and pointer controls', async () => {
    const onChange = vi.fn()
    render(ColorAlphaInput, {
      props: { value: 'rgba(182, 164, 47, 0.65)', inputLabel: '颜色值', onchange: onChange },
    })
    await fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器' }))

    const alpha = screen.getByRole('slider', { name: '透明度' })
    await fireEvent.keyDown(alpha, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('rgba(182, 164, 47, 0.67)')
    expect(alpha.getAttribute('aria-valuenow')).toBe('0.67')

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const hue = screen.getByRole('slider', { name: '色相' })
    await fireEvent.pointerDown(hue, { clientX: 50, clientY: 5, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^rgba\(/))
  })

  it('keeps a separately bound alpha outside the color value', async () => {
    const onChange = vi.fn()
    render(ColorAlphaInput, {
      props: { value: '#123456', alpha: 0.5, inputLabel: '颜色值', onchange: onChange },
    })
    await fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器' }))

    const alpha = screen.getByRole('slider', { name: '透明度' })
    await fireEvent.keyDown(alpha, { key: 'ArrowRight' })

    expect(onChange).toHaveBeenLastCalledWith('#123456')
    expect(alpha.getAttribute('aria-valuenow')).toBe('0.52')
  })

  it.each([
    ['rgba(18, 52, 86, 0.25)', '#123456', '0.25'],
    ['#12345688', '#123456', '0.53'],
    ['#abcdef', '#abcdef', '0.5'],
  ])('normalizes %s to separate color and alpha bindings', async (text, expectedValue, expectedAlpha) => {
    const onChange = vi.fn()
    render(ColorAlphaInput, {
      props: { value: '#000000', alpha: 0.5, inputLabel: '颜色值', onchange: onChange },
    })
    await fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器' }))
    await fireEvent.input(screen.getByLabelText('颜色值'), { target: { value: text } })

    expect(onChange).toHaveBeenLastCalledWith(expectedValue)
    expect((screen.getByLabelText('颜色值') as HTMLInputElement).value).toBe(expectedValue)
    expect(screen.getByRole('slider', { name: '透明度' }).getAttribute('aria-valuenow')).toBe(expectedAlpha)
  })

  it.each([
    ['rgba(18, 52, 86, 0.25)', '#123456', '0.25'],
    ['#12345688', '#123456', '0.53'],
    ['#abcdef', '#abcdef', '0.5'],
  ])('normalizes incoming value %s in separate-alpha mode', async (source, expectedValue, expectedAlpha) => {
    render(ColorAlphaInput, {
      props: { value: source, alpha: 0.5, inputLabel: '颜色值' },
    })
    expect((screen.getByLabelText('颜色值') as HTMLInputElement).value).toBe(expectedValue)

    await fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器' }))
    expect(screen.getByRole('slider', { name: '透明度' }).getAttribute('aria-valuenow')).toBe(expectedAlpha)
  })

  it('normalizes parent value updates while preserving separate alpha for opaque hex', async () => {
    const view = render(ColorAlphaInput, {
      props: { value: '#111111', alpha: 0.5, inputLabel: '颜色值' },
    })

    await view.rerender({ value: 'rgba(18, 52, 86, 0.25)', alpha: 0.5, inputLabel: '颜色值' })
    expect((screen.getByLabelText('颜色值') as HTMLInputElement).value).toBe('#123456')
    await fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器' }))
    expect(screen.getByRole('slider', { name: '透明度' }).getAttribute('aria-valuenow')).toBe('0.25')

    await view.rerender({ value: '#abcdef', alpha: 0.25, inputLabel: '颜色值' })
    expect((screen.getByLabelText('颜色值') as HTMLInputElement).value).toBe('#abcdef')
    expect(screen.getByRole('slider', { name: '透明度' }).getAttribute('aria-valuenow')).toBe('0.25')
  })

  it('allows an outside click to close after a pointer drag is cancelled', async () => {
    const { swatch } = openPicker()
    await fireEvent.click(swatch)
    const hue = screen.getByRole('slider', { name: '色相' })
    await fireEvent.pointerDown(hue, { clientX: 5, clientY: 5, pointerId: 3 })
    await fireEvent.pointerCancel(hue, { pointerId: 3 })
    await fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('slider', { name: '色相' })).toBeNull()
  })

  it('clears an active drag when Escape closes the popover', async () => {
    const { swatch } = openPicker()
    await fireEvent.click(swatch)
    const hue = screen.getByRole('slider', { name: '色相' })
    await fireEvent.pointerDown(hue, { clientX: 5, clientY: 5, pointerId: 4 })
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('slider', { name: '色相' })).toBeNull()

    await fireEvent.click(swatch)
    await fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('slider', { name: '色相' })).toBeNull()
  })

  it('shows the checkerboard for an empty value until the picker selects a color', async () => {
    const { swatch } = openPicker('')
    expect(swatch.style.getPropertyValue('--swatch-color')).toBe('transparent')

    await fireEvent.click(swatch)
    const area = screen.getByRole('slider', { name: '饱和度与明度' })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    await fireEvent.pointerDown(area, { clientX: 100, clientY: 0, pointerId: 2 })
    expect(swatch.style.getPropertyValue('--swatch-color')).not.toBe('transparent')
  })

  it.each(['rgba(18, 52, 86, 0.25)', '#12345688'])('normalizes same-RGB input %s when value is unchanged', async (text) => {
    const onChange = vi.fn()
    render(ColorAlphaInput, {
      props: { value: '#123456', alpha: 0.5, inputLabel: '颜色值', onchange: onChange },
    })

    await fireEvent.input(screen.getByLabelText('颜色值'), { target: { value: text } })

    expect((screen.getByLabelText('颜色值') as HTMLInputElement).value).toBe('#123456')
    expect(onChange).toHaveBeenLastCalledWith('#123456')
  })

  it('normalizes unchanged value when the alpha binding mode changes', async () => {
    const view = render(ColorAlphaInput, {
      props: { value: '#12345688', alpha: null, inputLabel: '颜色值' },
    })

    await view.rerender({ value: '#12345688', alpha: 0.5, inputLabel: '颜色值' })
    expect((screen.getByLabelText('颜色值') as HTMLInputElement).value).toBe('#123456')
    await fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器' }))
    expect(screen.getByRole('slider', { name: '透明度' }).getAttribute('aria-valuenow')).toBe('0.53')
  })
})
