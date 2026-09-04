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
