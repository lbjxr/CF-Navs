// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import SearchBox from '../../../src/components/SearchBox.svelte'
import type { SearchEngineSetting } from '../../../shared/types'

afterEach(cleanup)

function engineSetting(over: Partial<SearchEngineSetting> = {}): SearchEngineSetting {
  return {
    current: 'Google',
    engines: [
      { name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' },
      { name: 'Bing', icon: '', url_template: 'https://www.bing.com/search?q={q}' },
    ],
    ...over,
  }
}

const engineButton = () => screen.getByRole('button', { name: /当前搜索引擎：/ })

describe('SearchBox 默认引擎同步（Issue #25）', () => {
  it('默认引擎从 Google 切到 Bing 后，常驻实例立即跟随新默认值', async () => {
    // 设置面板实时预览里的 SearchBox 常驻且菜单禁用，切换默认引擎必须直接生效
    const { rerender } = render(SearchBox, {
      props: { searchEngine: engineSetting(), preview: true },
    })
    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Google')

    await rerender({ searchEngine: engineSetting({ current: 'Bing' }), preview: true })

    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Bing')
  })

  it('手动点选引擎后，无关重渲染不覆盖该选择', async () => {
    const { rerender } = render(SearchBox, {
      props: { searchEngine: engineSetting(), preview: false },
    })
    await fireEvent.click(engineButton())
    await fireEvent.click(screen.getByRole('option', { name: /Bing/ }))
    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Bing')

    // 同一默认引擎下仅 engines 数组换新引用，用户选择应保持不变
    await rerender({ searchEngine: engineSetting(), preview: false })

    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Bing')
  })

  it('默认引擎变更后覆盖此前的用户手动选择', async () => {
    const { rerender } = render(SearchBox, {
      props: { searchEngine: engineSetting(), preview: false },
    })
    await fireEvent.click(engineButton())
    await fireEvent.click(screen.getByRole('option', { name: /Bing/ }))
    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Bing')

    // 管理员把默认引擎改成 Bing，再改回 Google：每次都应以新默认值为准
    await rerender({ searchEngine: engineSetting({ current: 'Bing' }), preview: false })
    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Bing')

    await rerender({ searchEngine: engineSetting({ current: 'Google' }), preview: false })
    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Google')
  })

  it('用户选中的引擎被移出列表后，回落到当前默认引擎', async () => {
    const { rerender } = render(SearchBox, {
      props: { searchEngine: engineSetting(), preview: false },
    })
    await fireEvent.click(engineButton())
    await fireEvent.click(screen.getByRole('option', { name: /Bing/ }))

    await rerender({
      searchEngine: engineSetting({ engines: [{ name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' }] }),
      preview: false,
    })

    expect(engineButton().getAttribute('aria-label')).toBe('当前搜索引擎：Google')
  })
})
