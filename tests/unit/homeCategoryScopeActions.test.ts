// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import HomeCategoryScope from '../../src/components/HomeCategoryScope.svelte'

// PROB-11：移动端把「新建子分类」收进「更多操作」菜单（计划 T6）。
// DOM 行为用组件测试证明；断点可见性 jsdom 证明不了，只能断言接线并留给 L3 真机验证。

afterEach(cleanup)

function renderScope(overrides: Record<string, unknown> = {}) {
  const onCreateSubcategory = vi.fn()
  render(HomeCategoryScope, {
    props: { rootId: 7, title: '研发工具', reserveActions: true, onCreateSubcategory, ...overrides },
  })
  return { onCreateSubcategory }
}

const moreTrigger = () => screen.getByRole('button', { name: '研发工具 更多操作' })

describe('HomeCategoryScope 更多操作菜单', () => {
  it('默认收起，触发器带 disclosure 语义', () => {
    renderScope()

    expect(moreTrigger().getAttribute('aria-haspopup')).toBe('menu')
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('打开后菜单里有「新建子分类」，点击后执行回调并收起', async () => {
    const { onCreateSubcategory } = renderScope()

    await fireEvent.click(moreTrigger())
    const menu = screen.getByRole('menu', { name: '研发工具 更多操作' })
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('true')
    // aria-controls 必须指向真实存在的菜单节点
    expect(menu.id).toBe(moreTrigger().getAttribute('aria-controls'))

    const item = screen.getByRole('menuitem', { name: '新建子分类' })
    await fireEvent.click(item)

    expect(onCreateSubcategory).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('false')
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

  it('访客态两个入口都不渲染', () => {
    render(HomeCategoryScope, { props: { rootId: 7, title: '研发工具', reserveActions: false } })

    expect(screen.queryByRole('button', { name: '研发工具 更多操作' })).toBeNull()
    expect(screen.queryByRole('button', { name: '新建子分类' })).toBeNull()
  })

  it('把直显按钮与更多操作入口按 720px 断点互斥（接线断言，视觉由 L3 验证）', () => {
    const scope = readFileSync('src/components/HomeCategoryScope.svelte', 'utf8')
    const mobileBlock = scope.slice(scope.indexOf('@media (max-width: 720px)'))

    // 桌面直显、移动端收进菜单：两者在同一断点内一个隐藏一个显示
    expect(scope).toContain('class="scope-action scope-action-direct"')
    expect(scope).toContain('class="scope-action scope-more-trigger"')
    expect(mobileBlock).toContain('.scope-action-direct {\n      display: none;')
    expect(mobileBlock).toContain('.scope-more {\n      display: inline-flex;')
  })
})
