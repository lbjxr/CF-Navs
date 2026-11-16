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

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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

describe('右上角显隐菜单', () => {
  it('渲染齿轮设置触发器，默认收起且带 disclosure 语义', () => {
    render(HomeFloatingActions, { props: { isAuthenticated: true } })
    const trigger = screen.getByTestId('home-actions-menu-trigger')

    expect(trigger.getAttribute('aria-haspopup')).toBe('true')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBe('home-actions-menu')
    // 图标是 svg，可访问名只由 aria-label 提供，不靠字符
    expect(trigger.querySelector('svg')).not.toBeNull()
    expect(trigger.querySelector('svg circle')).not.toBeNull()
    expect(trigger.getAttribute('aria-label')).toBe('设置菜单')
    expect(trigger.textContent?.trim()).toBe('')
  })

  it('鼠标悬停展开，移开满三秒才收起', async () => {
    vi.useFakeTimers()
    render(HomeFloatingActions)
    const trigger = screen.getByTestId('home-actions-menu-trigger')

    await fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.pointerLeave(trigger, { pointerType: 'mouse' })
    await vi.advanceTimersByTimeAsync(2999)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await vi.advanceTimersByTimeAsync(1)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('经过间隙进入菜单或重新悬停时取消收起，下一次移开重新计时', async () => {
    vi.useFakeTimers()
    render(HomeFloatingActions)
    const trigger = screen.getByTestId('home-actions-menu-trigger')
    const group = screen.getByRole('group', { name: '设置操作' })

    await fireEvent.pointerEnter(trigger)
    await fireEvent.pointerLeave(trigger)
    await vi.advanceTimersByTimeAsync(1000)
    await fireEvent.pointerEnter(group)
    await vi.advanceTimersByTimeAsync(3000)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await fireEvent.pointerLeave(group)
    await vi.advanceTimersByTimeAsync(2000)
    await fireEvent.pointerEnter(trigger)
    await vi.advanceTimersByTimeAsync(3000)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.pointerLeave(trigger)
    await vi.advanceTimersByTimeAsync(3000)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('键盘聚焦菜单操作时保持展开，焦点移出后延迟收起', async () => {
    vi.useFakeTimers()
    render(HomeFloatingActions)
    const trigger = screen.getByTestId('home-actions-menu-trigger')
    await fireEvent.pointerEnter(trigger)
    await fireEvent.pointerLeave(trigger)
    const guide = screen.getByRole('button', { name: '使用指南' })
    guide.focus()

    await vi.advanceTimersByTimeAsync(4000)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    guide.blur()
    await vi.advanceTimersByTimeAsync(2999)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await vi.advanceTimersByTimeAsync(1)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('卸载时清理待执行的收起计时器', async () => {
    vi.useFakeTimers()
    const { unmount } = render(HomeFloatingActions)
    const trigger = screen.getByTestId('home-actions-menu-trigger')
    await fireEvent.pointerEnter(trigger)
    await fireEvent.pointerLeave(trigger)
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('触屏轻触仍通过点击切换，不触发悬停展开', async () => {
    render(HomeFloatingActions)
    const trigger = screen.getByTestId('home-actions-menu-trigger')
    const touchEnter = Object.assign(new Event('pointerenter'), { pointerType: 'touch' })
    await fireEvent(trigger, touchEnter)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('点击触发器展开，再次点击收起', async () => {
    render(HomeFloatingActions, { props: { isAuthenticated: true } })
    const trigger = screen.getByTestId('home-actions-menu-trigger')

    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('点击组内操作后回调触发并收起菜单', async () => {
    const onToggleTheme = vi.fn()
    render(HomeFloatingActions, { props: { isAuthenticated: true, onToggleTheme } })
    const trigger = screen.getByTestId('home-actions-menu-trigger')

    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await fireEvent.click(screen.getByRole('button', { name: /切换到/ }))

    expect(onToggleTheme).toHaveBeenCalledTimes(1)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('使用指南入口调用页面导航回调', async () => {
    const onOpenGuide = vi.fn()
    render(HomeFloatingActions, { props: { isAuthenticated: false, onOpenGuide } })

    await fireEvent.click(screen.getByRole('button', { name: '使用指南' }))

    expect(onOpenGuide).toHaveBeenCalledTimes(1)
  })

  it('Escape 关闭已展开的菜单', async () => {
    render(HomeFloatingActions, { props: { isAuthenticated: true } })
    const trigger = screen.getByTestId('home-actions-menu-trigger')

    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('点击弹层外部关闭菜单', async () => {
    render(HomeFloatingActions, { props: { isAuthenticated: true } })
    const trigger = screen.getByTestId('home-actions-menu-trigger')

    await fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    await fireEvent.pointerDown(document.body)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('顶部导航模式移动端把触发器下移到导航栏下方，向下弹出且与其错开', () => {
    // jsdom 不解析 @media，位置只能读源码断言（与 safe-area 断言同一手法）
    expect(source).toContain('top: 4rem;')
    expect(source).toContain('top: calc(100% + 6px)')
  })

  it('桌面与移动端都由更多触发器控制，顶部导航中屏时菜单下移', () => {
    // jsdom 不解析 @media；DOM 状态另由上面的交互测试验证。
    expect(source).toContain('.floating-actions .actions-menu-trigger')
    expect(source).toContain('min-width: 800px) and (max-width: 1650px')
    expect(source).toContain('top: 4.5rem;')
    expect(source).toContain('.floating-actions.below-top-navigation.menu-open .actions-group')
  })
})

describe('离屏搜索按钮（REQ-01）', () => {
  it('搜索框离屏时可见，带无障碍名与快捷键', () => {
    render(HomeFloatingActions, { props: { searchBoxVisible: false, searchBoxShow: true } })
    const button = screen.getByTestId('home-search-button')
    expect(button.classList.contains('is-visible')).toBe(true)
    expect(button.getAttribute('aria-hidden')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('搜索书签')
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K')
    expect(button.closest('.actions-group')).toBeNull()
    expect(document.querySelector('.floating-actions')?.classList.contains('search-visible')).toBe(true)
    expect(source).toContain('.floating-actions.search-visible .actions-group')
  })

  it('搜索框在视口内时隐藏搜索按钮（在 DOM 但不可见、不可聚焦）', () => {
    render(HomeFloatingActions, { props: { searchBoxVisible: true, searchBoxShow: true } })
    const button = screen.getByTestId('home-search-button')
    expect(button.classList.contains('is-visible')).toBe(false)
    expect(button.getAttribute('aria-hidden')).toBe('true')
    expect(button.getAttribute('tabindex')).toBe('-1')
  })

  it('search_box_show=false 时恒显搜索按钮（否则没有搜索入口）', () => {
    render(HomeFloatingActions, { props: { searchBoxVisible: true, searchBoxShow: false } })
    expect(screen.getByTestId('home-search-button').classList.contains('is-visible')).toBe(true)
  })

  it('点击搜索按钮调用 onOpenSearch', async () => {
    const onOpenSearch = vi.fn()
    render(HomeFloatingActions, { props: { searchBoxVisible: false, onOpenSearch } })
    await fireEvent.click(screen.getByTestId('home-search-button'))
    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })
})
