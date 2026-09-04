// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/svelte'
import HomeFloatingActions from '../../src/components/HomeFloatingActions.svelte'

// CSS 定位断言只能读源码（jsdom 不解析 @media / env()）；入口语义与可访问名走真实 DOM。
const source = readFileSync('src/components/HomeFloatingActions.svelte', 'utf8')

afterEach(cleanup)

describe('home floating actions', () => {
  it('provides an accessible back-to-top action after scrolling', () => {
    expect(source).toContain('data-testid="home-back-to-top"')
    expect(source).toContain('aria-label="回到顶部"')
    expect(source).toContain('window.scrollTo({ top: 0, behavior })')
  })

  it('owns and cleans up its scroll listener', () => {
    expect(source).toContain("window.addEventListener('scroll', updateBackToTopVisibility, { passive: true })")
    expect(source).toContain("window.removeEventListener('scroll', updateBackToTopVisibility)")
  })

  it('positions the action for desktop and mobile safe areas', () => {
    expect(source).toContain('right: max(1.25rem, env(safe-area-inset-right));')
    expect(source).toContain('bottom: max(1.25rem, env(safe-area-inset-bottom));')
    expect(source).toContain('right: max(1rem, env(safe-area-inset-right));')
    expect(source).toContain('bottom: max(1rem, env(safe-area-inset-bottom));')
  })

  it('只有登录态渲染新增主分类入口', () => {
    render(HomeFloatingActions, { props: { isAuthenticated: false } })
    expect(screen.queryByRole('button', { name: '新增主分类' })).toBeNull()

    cleanup()
    render(HomeFloatingActions, { props: { isAuthenticated: true } })
    const button = screen.getByRole('button', { name: '新增主分类' })
    expect(button.getAttribute('data-testid')).toBe('home-create-root-category')
    expect(button.getAttribute('title')).toBe('新增主分类')
  })

  it('新增主分类用「文件夹 + 加号」图标，不用语义不明的裸加号', () => {
    render(HomeFloatingActions, { props: { isAuthenticated: true } })
    const button = screen.getByRole('button', { name: '新增主分类' })

    // 图标必须是 svg，且对无障碍树隐藏——可访问名只由 aria-label 提供
    const icon = button.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    // 文件夹轮廓 + 加号两笔，缺一笔就退化成语义不明的形状
    expect(icon?.querySelectorAll('path').length).toBe(2)
    expect(icon?.querySelector('path')?.getAttribute('d')).toContain('M3 8a2 2 0 0 1 2-2')
    // 按钮不再靠字符承载语义：可见文本必须为空
    expect(button.textContent?.trim()).toBe('')
    expect(source).not.toContain('＋')
  })
})
