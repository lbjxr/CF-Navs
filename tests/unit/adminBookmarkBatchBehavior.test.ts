// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import BookmarkListPanel from '../../src/components/admin/BookmarkListPanel.svelte'

// 批量选择工具条与批量移动弹层的可观察契约。此前只有源码文本断言
// （`{#if selectedIds.size > 0 && !sortMode}`、`pickMajorityCategoryId(...)` 等），
// 那些钉的是实现写法；这里改成挂载真实面板、真点复选框，断言管理员看到什么。

const categories = [
  { id: 1, title: '常用工具', parent_id: null, is_private: false },
  { id: 2, title: '私密分类', parent_id: null, is_private: true },
  { id: 3, title: '设计资源', parent_id: null, is_private: false },
]

interface TestBookmark {
  id: number
  category_id: number
  title: string
  url: string
  is_private: boolean
  sort: number
}

function bookmark(id: number, categoryId: number, title: string, isPrivate = false): TestBookmark {
  return {
    id,
    category_id: categoryId,
    title,
    url: `https://${title.toLowerCase()}.example.com`,
    is_private: isPrivate,
    sort: id,
  }
}

function renderPanel(bookmarks: TestBookmark[], overrides: Record<string, unknown> = {}) {
  const onBatchMoveBookmarks = vi.fn()
  const onBatchDeleteBookmarks = vi.fn()
  render(BookmarkListPanel, {
    props: {
      isAuthenticated: true,
      categories,
      bookmarks,
      onBatchMoveBookmarks,
      onBatchDeleteBookmarks,
      ...overrides,
    },
  })
  return { onBatchMoveBookmarks, onBatchDeleteBookmarks }
}

/** 勾选指定标题的书签行。 */
async function selectRows(...titles: string[]) {
  for (const title of titles) {
    const box = screen.getByRole('checkbox', { name: `选择书签 ${title}` })
    await fireEvent.click(box)
  }
}

beforeAll(() => {
  // jsdom 不实现 scrollIntoView，CategoryTreeSelect 打开菜单时会调用它。
  Element.prototype.scrollIntoView = () => { }
})

afterEach(cleanup)

describe('批量选择工具条', () => {
  it('未选中时不渲染工具条，勾一项后才出现并报出数量', async () => {
    renderPanel([bookmark(11, 1, 'Alpha'), bookmark(12, 1, 'Beta')])

    expect(screen.queryByRole('toolbar', { name: '批量书签操作' })).toBeNull()

    await selectRows('Alpha')

    const toolbar = screen.getByRole('toolbar', { name: '批量书签操作' })
    expect(toolbar.textContent).toContain('已选 1 项')
  })

  it('工具条不在滚动容器内——否则它会跟着列表滚走', async () => {
    renderPanel([bookmark(11, 1, 'Alpha')])
    await selectRows('Alpha')

    const toolbar = screen.getByRole('toolbar', { name: '批量书签操作' })
    const scrollBody = document.querySelector('.admin-panel-scroll-body')

    expect(scrollBody).toBeTruthy()
    expect(scrollBody?.contains(toolbar)).toBe(false)
  })

  it('清除选择让工具条消失', async () => {
    renderPanel([bookmark(11, 1, 'Alpha')])
    await selectRows('Alpha')

    await fireEvent.click(screen.getByRole('button', { name: '清除选择' }))

    expect(screen.queryByRole('toolbar', { name: '批量书签操作' })).toBeNull()
  })

  it('删除已选把选中的 id 交给回调', async () => {
    const { onBatchDeleteBookmarks } = renderPanel([bookmark(11, 1, 'Alpha'), bookmark(12, 1, 'Beta')])
    await selectRows('Alpha', 'Beta')

    await fireEvent.click(screen.getByRole('button', { name: /删除已选/ }))

    expect(onBatchDeleteBookmarks).toHaveBeenCalledWith([11, 12])
  })
})

describe('批量移动的默认目标与后果提示', () => {
  it('默认目标是多数书签所在分类，不是第一个选中项的分类', async () => {
    // Alpha 在「设计资源」，Beta/Gamma 在「常用工具」：多数是常用工具。
    renderPanel([bookmark(11, 3, 'Alpha'), bookmark(12, 1, 'Beta'), bookmark(13, 1, 'Gamma')])
    await selectRows('Alpha', 'Beta', 'Gamma')

    await fireEvent.click(screen.getByRole('button', { name: '移动到分类' }))

    const dialog = screen.getByRole('dialog', { name: '移动到分类' })
    expect(dialog.textContent).toContain('将移动 3 个书签到「常用工具」')
  })

  it('目标是私密分类时提示公开书签会被隐藏，并说明可回退', async () => {
    renderPanel([bookmark(11, 1, 'Alpha')])
    await selectRows('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: '移动到分类' }))

    const select = screen.getByRole('button', { name: '选择目标分类' })
    await fireEvent.click(select)
    await fireEvent.click(screen.getByRole('treeitem', { name: /私密分类/ }))

    const notice = screen.getByRole('status')
    expect(notice.textContent).toContain('私密书签不受影响，可随时把分类改回公开')
  })

  it('目标是公开分类时不出现隐藏后果提示', async () => {
    renderPanel([bookmark(11, 3, 'Alpha')])
    await selectRows('Alpha')
    await fireEvent.click(screen.getByRole('button', { name: '移动到分类' }))

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('确认后把目标分类与位置一起交给回调', async () => {
    const { onBatchMoveBookmarks } = renderPanel([bookmark(11, 1, 'Alpha'), bookmark(12, 1, 'Beta')])
    await selectRows('Alpha', 'Beta')
    await fireEvent.click(screen.getByRole('button', { name: '移动到分类' }))

    await fireEvent.click(screen.getByLabelText('插入到顶部'))
    await fireEvent.click(screen.getByRole('button', { name: '确认移动' }))

    expect(onBatchMoveBookmarks).toHaveBeenCalledTimes(1)
    const payload = onBatchMoveBookmarks.mock.calls[0][0]
    expect(payload.category_id).toBe(1)
    expect(payload.position).toBe('start')
    expect(payload.ids).toEqual([11, 12])
  })
})
