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
