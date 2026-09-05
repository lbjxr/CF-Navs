// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import Sidebar from '../../src/components/Sidebar.svelte'

// 顶部导航子菜单的可观察契约。此前只有源码文本断言（`toContain("if (event?.detail === 0)")`、
// `toContain('getTopMenuItems()[0]?.focus()')`、`toContain('if (!item.children?.length) return')`）：
// 那些能证明模板里写了这些标识符，证明不了键盘打开后焦点真的进了菜单、无子项的项真的不弹菜单。
//
// 环境边界：Sidebar 在 `onMount` 里往 `document` 注册 `keydown`（Escape 关闭 + 焦点归还）和
// `pointerdown`（点外部关闭）。这两个监听在当前 jsdom + @testing-library/svelte 组合下**收不到事件**
// （已用 spy 与直接 dispatch 双向确认），所以那两条行为仍由 `navigationLayout.test.ts` 的源码断言看守。

const items = [
  {
    id: 'cat-1',
    categoryId: 1,
    title: '常用工具',
    icon: null,
    count: 2,
    children: [
      { id: 'cat-11', categoryId: 11, title: '编辑器', icon: null, count: 1, children: [] },
      { id: 'cat-12', categoryId: 12, title: '设计', icon: null, count: 1, children: [] },
    ],
  },
  { id: 'cat-2', categoryId: 2, title: '学习资料', icon: null, count: 1, children: [] },
]

const topNavigation = { position: 'top' as const, always_expanded: false, top_layout: 'scroll' as const }
const leftNavigation = { position: 'left' as const, always_expanded: true, top_layout: 'scroll' as const }

afterEach(cleanup)

/** 顶部父项的展开按钮：aria-label 随开合状态在「展开/收起」之间切换。 */
const expandButton = (title: string, expanded = false) =>
  screen.getByRole('button', { name: `${expanded ? '收起' : '展开'} ${title} 的子分类` })

const submenu = () => screen.queryByRole('menu', { name: '常用工具 子分类' })

const menuItems = () => screen.queryAllByRole('menuitem')

describe('顶部导航子菜单的打开与关闭', () => {
  it('默认不渲染子菜单', () => {
    render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })

    expect(submenu()).toBeNull()
    expect(expandButton('常用工具').getAttribute('aria-expanded')).toBe('false')
  })

  it('点展开按钮打开子菜单，再点一次关闭', async () => {
    render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })

    await fireEvent.click(expandButton('常用工具'), { detail: 1 })

    expect(submenu()).toBeTruthy()
    expect(menuItems().map((node) => node.querySelector('.top-submenu-title,span')?.textContent?.trim()))
      .toEqual(['编辑器', '设计'])
    expect(expandButton('常用工具', true).getAttribute('aria-expanded')).toBe('true')

    await fireEvent.click(expandButton('常用工具', true), { detail: 1 })

    expect(submenu()).toBeNull()
  })

  it('无子分类的顶部项不弹子菜单', async () => {
    render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })

    // 「学习资料」没有子项，因此连展开按钮都不该渲染
    expect(screen.queryByRole('button', { name: /学习资料 的子分类/ })).toBeNull()

    await fireEvent.click(screen.getByTitle('学习资料'), { detail: 1 })

    expect(submenu()).toBeNull()
  })

  it('选中子菜单项后关闭菜单并上报导航目标', async () => {
    const onNavigate = vi.fn()
    render(Sidebar, { props: { items, activeId: null, navigation: topNavigation, onNavigate } })
    await fireEvent.click(expandButton('常用工具'), { detail: 1 })

    await fireEvent.click(screen.getByRole('menuitem', { name: /编辑器/ }))

    expect(onNavigate).toHaveBeenCalledWith('cat-11')
    expect(submenu()).toBeNull()
  })

  it('打开的父分类从分类树里消失后，子菜单必须跟着关闭', async () => {
    const { component } = render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })
    await fireEvent.click(expandButton('常用工具'), { detail: 1 })
    expect(submenu()).toBeTruthy()

    // 后台删掉该分类后首页会重新下发 items；菜单不关就会留下指向已消失分类的悬空浮层
    await component.$set({ items: items.filter((item) => item.id !== 'cat-1') })

    expect(submenu()).toBeNull()
  })

  it('打开的父分类被改成没有子分类后，子菜单必须跟着关闭', async () => {
    const { component } = render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })
    await fireEvent.click(expandButton('常用工具'), { detail: 1 })
    expect(submenu()).toBeTruthy()

    await component.$set({
      items: items.map((item) => (item.id === 'cat-1' ? { ...item, children: [] } : item)),
    })

    expect(submenu()).toBeNull()
  })

  it('切到左侧导航后不再渲染顶部子菜单', async () => {
    const { component } = render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })
    await fireEvent.click(expandButton('常用工具'), { detail: 1 })

    await component.$set({ navigation: leftNavigation })

    expect(submenu()).toBeNull()
    expect(screen.queryByTestId('top-navigation')).toBeNull()
  })
})

describe('顶部导航子菜单的键盘可达性', () => {
  it('键盘触发（detail 为 0）把焦点送进菜单第一项', async () => {
    render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })

    // Enter/Space 触发的 click 事件 detail 为 0
    await fireEvent.click(expandButton('常用工具'), { detail: 0 })
    await tick()

    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /编辑器/ }))
  })

  it('鼠标点击打开时不抢焦点——指针用户不需要焦点跳走', async () => {
    render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })

    await fireEvent.click(expandButton('常用工具'), { detail: 1 })
    await tick()

    expect(document.activeElement).not.toBe(screen.getByRole('menuitem', { name: /编辑器/ }))
  })

  it('方向键在菜单内循环，Home 与 End 跳到两端', async () => {
    render(Sidebar, { props: { items, activeId: null, navigation: topNavigation } })
    await fireEvent.click(expandButton('常用工具'), { detail: 0 })
    await tick()

    const menu = submenu() as HTMLElement
    const [first, second] = menuItems()

    await fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(second)

    // 末项再按 ArrowDown 回到首项
    await fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(first)

    await fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(second)

    await fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(first)

    await fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(second)
  })
})
