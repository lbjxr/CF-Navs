// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import CategoryTreeSelect from '../../src/components/CategoryTreeSelect.svelte'
import type { CategoryTreeOption } from '../../src/lib/categorySelect'

// 组件层测试（PROB-18 方案 B）：源码文本断言只能证明模板里写了某个字符串，
// 证明不了 `aria-describedby` 指向的 id 真的存在、选项真的可点。这里挂载真实 DOM 断言行为。

const NOTICE = '移入后会从公开首页隐藏 2 个公开书签'

const items: CategoryTreeOption[] = [
  { id: 1, title: '公开分类', children: [] },
  {
    id: 2,
    title: '私密分类',
    notice: NOTICE,
    children: [{ id: 3, title: '私密子分类', notice: NOTICE, children: [] }],
  },
]

beforeAll(() => {
  // jsdom 不实现 scrollIntoView，组件打开菜单时会调用它。
  Element.prototype.scrollIntoView = () => { }
})

afterEach(cleanup)

/** 选中二级项打开菜单时，组件会自动展开其父分类，两条 notice 才都在 DOM 里。 */
async function openMenuWithChildSelected(): Promise<HTMLElement> {
  render(CategoryTreeSelect, { props: { items, value: 3, ariaLabel: '选择目标分类' } })
  screen.getByRole('button', { name: '选择目标分类' }).click()
  return await screen.findByRole('tree')
}

describe('CategoryTreeSelect 后果提示', () => {
  it('把每条 notice 渲染成 aria-describedby 真正指向的元素', async () => {
    const menu = await openMenuWithChildSelected()

    const described = [...menu.querySelectorAll('[role="treeitem"][aria-describedby]')]
    expect(described).toHaveLength(2)

    // 关键：id 必须真的解析到一个带该文案的元素。源码字符串断言无法证明这一点。
    for (const option of described) {
      const id = option.getAttribute('aria-describedby')
      expect(id).toBeTruthy()
      expect(menu.querySelector(`#${id}`)?.textContent).toBe(NOTICE)
    }
  })

  it('没有 notice 的选项不带 aria-describedby', async () => {
    render(CategoryTreeSelect, { props: { items, value: 1, ariaLabel: '选择目标分类' } })
    screen.getByRole('button', { name: '选择目标分类' }).click()
    const menu = await screen.findByRole('tree')

    const plain = menu.querySelector('[role="treeitem"][data-tree-root-id="1"]')
    expect(plain).not.toBeNull()
    expect(plain?.hasAttribute('aria-describedby')).toBe(false)
  })

  it('带后果提示的选项仍然可选，不引入禁用态', async () => {
    const menu = await openMenuWithChildSelected()

    // 服务端允许的目标不得被前端硬禁用（PROB-01 的既定策略）。
    expect(menu.querySelector('[aria-disabled]')).toBeNull()
    expect([...menu.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')].some((item) => item.disabled))
      .toBe(false)

    const annotatedRoot = menu.querySelector<HTMLButtonElement>('[role="treeitem"][data-tree-root-id="2"]')
    expect(annotatedRoot?.getAttribute('aria-describedby')).toBe('category-tree-notice-2')
    expect(annotatedRoot?.disabled).toBe(false)
    await fireEvent.click(annotatedRoot as HTMLButtonElement)

    // 选中后菜单关闭、触发器改显新选择：证明点击真的生效，而不只是渲染了文案。
    expect(screen.queryByRole('tree')).toBeNull()
    const triggerText = screen.getByRole('button', { name: '选择目标分类' }).textContent ?? ''
    expect(triggerText).toContain('私密分类')
    expect(triggerText).not.toContain('私密子分类')
  })
})

describe('CategoryTreeSelect 折叠与键盘导航', () => {
  // 从 categoryCollapseMarkup.test.ts 迁来（PROB-18b）：原断言是
  // toContain('toggleRootExpansion(item.id, event)') 与
  // toContain('expandedRootIds = getCategoryTreeExpandedRootIds(items, value)')，
  // 只能证明源码里写了这两个调用，证明不了「子项默认收起、选中子项时自动展开父级、
  // 箭头键能展开收起」这些实际行为。

  it('无子分类的根项不渲染展开箭头', async () => {
    render(CategoryTreeSelect, { props: { items, value: 1, ariaLabel: '选择目标分类' } })
    screen.getByRole('button', { name: '选择目标分类' }).click()
    const menu = await screen.findByRole('tree')

    const leafRow = menu.querySelector('[data-tree-root-id="1"]')?.parentElement
    expect(leafRow?.querySelector('.tree-expand-button')).toBeNull()
    // 用占位撑住缩进，否则叶子项会和有箭头的项左对齐不上
    expect(leafRow?.querySelector('.tree-expand-spacer')).not.toBeNull()
  })

  it('选中子项时自动展开其父级，子项因此可见', async () => {
    const menu = await openMenuWithChildSelected()

    // 这是「揭示当前选择」的实质：不展开父级，用户看不到自己选的是哪一项。
    expect(menu.querySelector('.tree-child-option[data-tree-parent-id="2"]')).not.toBeNull()
    expect(menu.querySelector('.tree-child-option[data-tree-parent-id="2"]')?.getAttribute('aria-selected')).toBe('true')
  })

  it('选中根项时子项默认收起', async () => {
    render(CategoryTreeSelect, { props: { items, value: 1, ariaLabel: '选择目标分类' } })
    screen.getByRole('button', { name: '选择目标分类' }).click()
    const menu = await screen.findByRole('tree')

    expect(menu.querySelector('.tree-child-option[data-tree-parent-id="2"]')).toBeNull()
  })

  it('展开箭头是选项的兄弟节点，不嵌在选项里', async () => {
    // 这才是「点箭头不会顺带选中该分类」成立的结构原因：嵌进去就会冒泡到选项的
    // on:click。组件另有 stopPropagation 作为第二道防线。
    render(CategoryTreeSelect, { props: { items, value: 1, ariaLabel: '选择目标分类' } })
    screen.getByRole('button', { name: '选择目标分类' }).click()
    const menu = await screen.findByRole('tree')

    const toggle = menu.querySelector('.tree-expand-button') as HTMLElement
    const option = menu.querySelector('[data-tree-root-id="2"]') as HTMLElement
    expect(option.contains(toggle)).toBe(false)
    expect(toggle.parentElement).toBe(option.parentElement)
    // 箭头不进 Tab 序列：它是选项的附属操作，不该抢焦点
    expect(toggle.getAttribute('tabindex')).toBe('-1')
  })

  it('点箭头独立展开、再点收起，不改变已选值', async () => {
    render(CategoryTreeSelect, { props: { items, value: 1, ariaLabel: '选择目标分类' } })
    screen.getByRole('button', { name: '选择目标分类' }).click()
    const menu = await screen.findByRole('tree')

    const toggle = menu.querySelector('.tree-expand-button') as HTMLButtonElement
    expect(toggle).toBeTruthy()
    // 可访问名与 aria-expanded 必须跟着状态翻转，否则读屏用户不知道是展开还是收起
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toContain('展开')

    await fireEvent.click(toggle)
    expect(menu.querySelector('.tree-child-option[data-tree-parent-id="2"]')).not.toBeNull()
    const expanded = menu.querySelector('.tree-expand-button') as HTMLButtonElement
    expect(expanded.getAttribute('aria-expanded')).toBe('true')
    expect(expanded.getAttribute('aria-label')).toContain('收起')
    // aria-controls 必须指向真实存在的子项容器
    expect(document.getElementById(expanded.getAttribute('aria-controls') as string)).not.toBeNull()
    // 展开是纯展示动作：菜单不能关，选择也不能被改
    expect(screen.queryByRole('tree')).not.toBeNull()
    expect(screen.getByRole('button', { name: '选择目标分类' }).textContent).toContain('公开分类')

    await fireEvent.click(menu.querySelector('.tree-expand-button') as HTMLButtonElement)
    expect(menu.querySelector('.tree-child-option[data-tree-parent-id="2"]')).toBeNull()
  })

  it('ArrowRight 展开、ArrowLeft 收起', async () => {
    render(CategoryTreeSelect, { props: { items, value: 1, ariaLabel: '选择目标分类' } })
    screen.getByRole('button', { name: '选择目标分类' }).click()
    const menu = await screen.findByRole('tree')
    const parentRow = menu.querySelector('[data-tree-root-id="2"]') as HTMLButtonElement

    await fireEvent.keyDown(parentRow, { key: 'ArrowRight' })
    expect(menu.querySelector('.tree-child-option[data-tree-parent-id="2"]')).not.toBeNull()

    await fireEvent.keyDown(menu.querySelector('[data-tree-root-id="2"]') as HTMLButtonElement, { key: 'ArrowLeft' })
    expect(menu.querySelector('.tree-child-option[data-tree-parent-id="2"]')).toBeNull()
  })

  it('Esc 关闭菜单并把焦点还给触发器', async () => {
    render(CategoryTreeSelect, { props: { items, value: 1, ariaLabel: '选择目标分类' } })
    const trigger = screen.getByRole('button', { name: '选择目标分类' })
    trigger.click()
    const menu = await screen.findByRole('tree')

    await fireEvent.keyDown(menu.querySelector('[role="treeitem"]') as HTMLElement, { key: 'Escape' })

    expect(screen.queryByRole('tree')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('当前分类已被删除时触发器显示可辨识文案而不是空白', () => {
    // 分类被删后旧值指不到任何选项；显示空白会让用户以为没选过。
    render(CategoryTreeSelect, { props: { items, value: 999, ariaLabel: '选择目标分类' } })

    expect(screen.getByRole('button', { name: '选择目标分类' }).textContent).toContain('当前分类不可用')
  })

  it('没有任何可选项时不打开菜单', async () => {
    render(CategoryTreeSelect, { props: { items: [], value: null, ariaLabel: '选择目标分类' } })

    screen.getByRole('button', { name: '选择目标分类' }).click()
    await Promise.resolve()

    expect(screen.queryByRole('tree')).toBeNull()
  })
})
