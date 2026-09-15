// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/svelte'
import GradientPresetSelector from '../../src/components/settings/GradientPresetSelector.svelte'

afterEach(cleanup)

describe('GradientPresetSelector 的分组语义', () => {
  it('隐藏模块级说明，将内置分组提示放到标题 hover 语义', () => {
    render(GradientPresetSelector, { props: { activeGradientPresetId: 'custom' } })

    expect(screen.queryByText('内置配色方案')).toBeNull()
    expect(screen.queryByText('每套方案包含浅色/深色两种背景，选中后会一并套用遮罩和推荐的卡片透明度、文字颜色。')).toBeNull()

    const glassTitle = screen.getByText('毛玻璃')
    const flatTitle = screen.getByText('护眼纯色')
    expect(glassTitle.parentElement?.getAttribute('title')).toBe('渐变背景、半透明卡片与柔和光晕')
    expect(flatTitle.parentElement?.getAttribute('title')).toBe('低饱和纯色背景与不透明卡片')
    expect(screen.queryByText('渐变背景、半透明卡片与柔和光晕')).toBeNull()
    expect(screen.queryByText('低饱和纯色背景与不透明卡片')).toBeNull()
  })

  it('保留自定义分组的可见说明与状态反馈', () => {
    render(GradientPresetSelector, { props: { activeGradientPresetId: 'custom' } })

    expect(screen.getAllByText('自定义').length).toBe(2)
    expect(screen.getByText('手动维护浅色/深色背景与卡片参数')).toBeTruthy()
    expect(screen.getByText('自定义背景')).toBeTruthy()
  })
})
