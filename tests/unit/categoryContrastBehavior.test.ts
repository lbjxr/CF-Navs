// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import SettingsPanel from '../../src/components/SettingsPanel.svelte'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'
import type { BackgroundSetting } from '../../shared/types'

vi.mock('../../src/lib/localIconView', () => import('../helpers/inactiveLocalIconView'))
beforeAll(() => { Element.prototype.scrollIntoView = () => {} })
afterEach(cleanup)
const solid: BackgroundSetting = { type: 'color', value: '#ffffff', blur: 0, mask: 0, maskColor: '#000000' }
const base = { ...DEFAULT_SETTINGS, site_title: 'Fixture', backgrounds: { light: solid, dark: solid },
  category_display: { ...DEFAULT_SETTINGS.category_display, root_title_color: '#ffffff', child_title_color: '' } }
const openColors = () => fireEvent.click(screen.getAllByRole('button').find(button => button.querySelector('strong')?.textContent === '高级与视觉') as HTMLButtonElement)

describe('custom category color contrast feedback', () => {
  it('shows and associates a low contrast hint without rewriting the configured color', async () => {
    const onSubmit = vi.fn()
    render(SettingsPanel, { value: base, onSubmit })
    await openColors()
    const input = screen.getByLabelText('一级分类标题颜色值') as HTMLInputElement
    const hint = screen.getByTestId('category-root-contrast')
    expect(input.value).toBe('#ffffff')
    expect(input.getAttribute('aria-describedby')).toBe(hint.id)
    expect(hint.textContent).toContain('对比度不足')
    expect(hint.textContent).toContain('1.00:1')
    expect(screen.queryByTestId('category-child-contrast')).toBeNull()
    await fireEvent.input(input, { target: { value: '#000000' } })
    expect(input.value).toBe('#000000')
    expect(screen.getByTestId('category-root-contrast').textContent).not.toContain('对比度不足')
    expect(screen.getByTestId('category-root-contrast').textContent).toContain('21.00:1')
    expect(screen.getByTestId('preview-category-contrast').textContent).toContain('达到普通文字')
    await fireEvent.submit(document.getElementById('settings-form') as HTMLFormElement)
    expect(onSubmit.mock.calls[0][0].category_display.root_title_color).toBe('#000000')
  })

  it('marks an image background as unknown instead of presenting a passing ratio', async () => {
    render(SettingsPanel, { value: { ...base, backgrounds: {
      light: { ...solid, type: 'image', value: 'https://example.test/image.png' },
      dark: { ...solid, type: 'image', value: 'https://example.test/image.png' },
    } }, onSubmit: vi.fn() })
    await openColors()
    const hint = screen.getByTestId('category-root-contrast')
    expect(hint.textContent).toContain('图片背景无法自动确认')
    expect(hint.textContent).not.toMatch(/\d\.\d\d:1/)
    expect(screen.getByTestId('preview-category-contrast').textContent).not.toContain('达到普通文字')
    expect((screen.getByLabelText('一级分类标题颜色值') as HTMLInputElement).value).toBe('#ffffff')
  })

  it('does not approve CSS-dependent rendering, and clearing a color restores follow-theme semantics', async () => {
    render(SettingsPanel, { value: { ...base, custom_css: '.home-shell { color: red; }' }, onSubmit: vi.fn() })
    await openColors()
    expect(screen.getByTestId('category-root-contrast').textContent).toContain('自定义 CSS')
    expect(screen.getByTestId('preview-category-contrast').textContent).not.toContain('达到普通文字')
    await fireEvent.input(screen.getByLabelText('一级分类标题颜色值'), { target: { value: '' } })
    expect(screen.queryByTestId('category-root-contrast')).toBeNull()
    expect(screen.queryByTestId('preview-category-contrast')).toBeNull()
  })
})
