// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import HomeCategoryScope from '../../src/components/HomeCategoryScope.svelte'

// PROB-11：移动端把「新增书签」「新建子分类」「排序」三个入口统一收进「更多操作」菜单（计划 T6）。
// DOM 行为用组件测试证明；断点可见性 jsdom 证明不了，只能断言接线并留给 L3 真机验证。

afterEach(cleanup)

function renderScope(overrides: Record<string, unknown> = {}) {
  const onAddBookmark = vi.fn()
  const onCreateSubcategory = vi.fn()
  const onRequestSort = vi.fn()
  render(HomeCategoryScope, {
    props: {
      rootId: 7,
      title: '研发工具',
      reserveActions: true,
      onAddBookmark,
      onCreateSubcategory,
      onRequestSort,
      ...overrides,
    },
  })
  return { onAddBookmark, onCreateSubcategory, onRequestSort }
}

const moreTrigger = () => screen.getByRole('button', { name: '研发工具 更多操作' })

describe('HomeCategoryScope 更多操作菜单', () => {
  it('默认收起，触发器带 disclosure 语义', () => {
    renderScope()

    expect(moreTrigger().getAttribute('aria-haspopup')).toBe('menu')
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('菜单按固定顺序收纳三个操作，aria-controls 指向真实菜单节点', async () => {
    renderScope()

    await fireEvent.click(moreTrigger())
    const menu = screen.getByRole('menu', { name: '研发工具 更多操作' })
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('true')
    expect(menu.id).toBe(moreTrigger().getAttribute('aria-controls'))

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim()))
      .toEqual(['新增书签', '新建子分类', '排序'])
  })

  it.each([
    ['新增书签', 'onAddBookmark'],
    ['新建子分类', 'onCreateSubcategory'],
    ['排序', 'onRequestSort'],
  ] as const)('点击「%s」执行对应回调并收起菜单', async (label, key) => {
    const spies = renderScope()

    await fireEvent.click(moreTrigger())
    await fireEvent.click(screen.getByRole('menuitem', { name: label }))

    expect(spies[key]).toHaveBeenCalledTimes(1)
    for (const [otherKey, spy] of Object.entries(spies)) {
      if (otherKey !== key) expect(spy).not.toHaveBeenCalled()
    }
    expect(screen.queryByRole('menu')).toBeNull()
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('只渲染当前可用的操作：排序会话中不给出新增书签与排序', async () => {
    renderScope({ onAddBookmark: undefined, onRequestSort: undefined })

    await fireEvent.click(moreTrigger())

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim()))
      .toEqual(['新建子分类'])
  })

  it('Esc 关闭菜单并把焦点还给触发器', async () => {
    renderScope()

    await fireEvent.click(moreTrigger())
    expect(screen.getByRole('menu')).toBeTruthy()

    await fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(moreTrigger())
  })

  it('点击菜单和触发器之外的位置会关闭菜单', async () => {
    renderScope()

    await fireEvent.click(moreTrigger())
    expect(screen.getByRole('menu')).toBeTruthy()

    await fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('访客态不渲染任何入口', () => {
    render(HomeCategoryScope, { props: { rootId: 7, title: '研发工具', reserveActions: false } })

    expect(screen.queryByRole('button', { name: '研发工具 更多操作' })).toBeNull()
    expect(screen.queryByRole('button', { name: '新建子分类' })).toBeNull()
  })

  it('按 720px 断点让桌面直显入口与移动端菜单互斥（接线断言，视觉由 L3 验证）', () => {
    const scope = readFileSync('src/components/HomeCategoryScope.svelte', 'utf8')
    const section = readFileSync('src/components/CategorySection.svelte', 'utf8')
    const scopeMobile = scope.slice(scope.indexOf('@media (max-width: 720px)'))
    const sectionMobile = section.slice(section.indexOf('@media (max-width: 720px)'))

    // 桌面：Scope 直显「新建子分类」，CategorySection 的操作行提供「新增书签」「排序」
    expect(scope).toContain('class="scope-action scope-action-direct"')
    expect(scope).toContain('class="scope-action scope-more-trigger"')
    // 移动端：Scope 只留菜单入口，CategorySection 的非排序操作行整体隐藏
    expect(scopeMobile).toContain('.scope-action-direct {\n      display: none;')
    expect(scopeMobile).toContain('.scope-more {\n      display: inline-flex;')
    expect(sectionMobile).toContain('.section-header.inline-actions .section-actions:not(.sorting) {\n      display: none;')
    // 排序会话中的提示文案不能被一起隐藏
    expect(section).toContain('class:sorting={activeSortMode}')
  })
})

describe('更多操作菜单的视口夹紧', () => {
  // 这个触发器紧跟标题、不靠右对齐：移动端标题短的分类里它离视口左边只有 100 px 出头。
  // 菜单固定 `right: 0` 时，160 px 的最小宽度会把左边缘推到负坐标——真机实测「AI服务」
  // 在 390 px 视口下 left = -12，菜单最左侧被切在屏幕外。
  const realRect = Element.prototype.getBoundingClientRect
  const realOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  const realInnerWidth = window.innerWidth

  /** jsdom 不做布局，rect 与 offsetWidth 全是 0；按真机量到的数值喂进去才能测定位算法。 */
  function stubGeometry(triggerLeft: number, triggerWidth: number, menuWidth: number, viewportWidth: number) {
    Object.defineProperty(window, 'innerWidth', { value: viewportWidth, configurable: true, writable: true })
    Element.prototype.getBoundingClientRect = function (this: Element) {
      // `.scope-more` 只包着触发器，两者左边界相同
      const isAnchor = this.classList.contains('scope-more-trigger') || this.classList.contains('scope-more')
      const left = isAnchor ? triggerLeft : 0
      const width = isAnchor ? triggerWidth : 0
      return {
        left, right: left + width, top: 200, bottom: 236, width, height: 36,
        x: left, y: 200, toJSON: () => ({}),
      } as DOMRect
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('scope-more-menu') ? menuWidth : 0
      },
    })
  }

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect
    if (realOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', realOffsetWidth)
    Object.defineProperty(window, 'innerWidth', { value: realInnerWidth, configurable: true, writable: true })
  })

  /** 菜单相对 `.scope-more` 定位，而容器左边界就是 triggerLeft，因此绝对左边界 = triggerLeft + style.left。 */
  function menuViewportLeft(triggerLeft: number): number {
    const style = screen.getByRole('menu').getAttribute('style') ?? ''
    const offset = Number(/left:\s*(-?\d+(?:\.\d+)?)px/.exec(style)?.[1])
    expect(Number.isFinite(offset)).toBe(true)
    return triggerLeft + offset
  }

  it('触发器靠左时菜单不越过视口左边——这是线上报的缺陷形态', async () => {
    stubGeometry(112, 36, 160, 390)
    renderScope()

    await fireEvent.click(moreTrigger())

    const left = menuViewportLeft(112)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left + 160).toBeLessThanOrEqual(390)
  })

  it('放不下时改成右对齐锚点，仍然整块留在视口内', async () => {
    // 280 px 视口 + 触发器右边缘 177：左对齐会溢出右侧，只能右对齐
    stubGeometry(141, 36, 160, 280)
    renderScope()

    await fireEvent.click(moreTrigger())

    const left = menuViewportLeft(141)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left + 160).toBeLessThanOrEqual(280)
    // 右对齐到触发器右边缘：177 - 160 = 17
    expect(left).toBe(17)
  })

  it('两侧都放不下时夹到视口边距，不留负坐标', async () => {
    // 菜单比视口还宽的极端情况：只能贴到左边距
    stubGeometry(20, 36, 300, 280)
    renderScope()

    await fireEvent.click(moreTrigger())

    expect(menuViewportLeft(20)).toBeGreaterThanOrEqual(0)
  })

  it('重新打开时按当前视口重算，不沿用上一次的偏移', async () => {
    stubGeometry(112, 36, 160, 390)
    renderScope()

    await fireEvent.click(moreTrigger())
    expect(menuViewportLeft(112)).toBe(112)

    await fireEvent.click(moreTrigger())
    expect(screen.queryByRole('menu')).toBeNull()

    // 转屏/缩窗后再打开：390 px 下的 left: 0 到 280 px 就会溢出右侧，必须重算成右对齐
    stubGeometry(141, 36, 160, 280)
    await fireEvent.click(moreTrigger())

    expect(menuViewportLeft(141)).toBe(17)
  })
})
