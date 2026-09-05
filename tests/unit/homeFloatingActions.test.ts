// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import HomeFloatingActions from '../../src/components/HomeFloatingActions.svelte'

// CSS 定位断言只能读源码（jsdom 不解析 @media / env()）；入口语义、可访问名与滚动显隐走真实 DOM。
const source = readFileSync('src/components/HomeFloatingActions.svelte', 'utf8')

/** jsdom 没有 window.scrollTo，替换成 spy 才能观察滚动请求。 */
function stubScrollTo() {
  const scrollTo = vi.fn()
  Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true, configurable: true })
  return scrollTo
}

/** jsdom 也没有 matchMedia；组件按 prefers-reduced-motion 选择滚动行为。 */
function stubReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({ matches: reduce, media: query }),
    writable: true,
    configurable: true,
  })
}

/** 改写 scrollY 并派发 scroll，模拟用户把页面往下滚。 */
async function scrollToY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true })
  window.dispatchEvent(new Event('scroll'))
  await tick()
}

afterEach(cleanup)

describe('home floating actions', () => {
  it('页面在顶部时不显示回到顶部，滚下去之后才出现', async () => {
    render(HomeFloatingActions, { props: { isAuthenticated: false } })

    expect(screen.queryByRole('button', { name: '回到顶部' })).toBeNull()

    await scrollToY(900)

    expect(screen.getByRole('button', { name: '回到顶部' })).toBeTruthy()

    // 滚回顶部后按钮要收起，否则会一直压在内容上
    await scrollToY(0)

    expect(screen.queryByRole('button', { name: '回到顶部' })).toBeNull()
  })

  it('点回到顶部把窗口滚回原点，默认用平滑滚动', async () => {
    const scrollTo = stubScrollTo()
    stubReducedMotion(false)
    render(HomeFloatingActions, { props: { isAuthenticated: false } })
    await scrollToY(900)

    await fireEvent.click(screen.getByRole('button', { name: '回到顶部' }))

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.calls[0][0]).toEqual({ top: 0, behavior: 'smooth' })
  })

  it('用户要求减少动效时改成瞬时滚动', async () => {
    const scrollTo = stubScrollTo()
    stubReducedMotion(true)
    render(HomeFloatingActions, { props: { isAuthenticated: false } })
    await scrollToY(900)

    await fireEvent.click(screen.getByRole('button', { name: '回到顶部' }))

    expect(scrollTo.mock.calls[0][0]).toEqual({ top: 0, behavior: 'auto' })
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
