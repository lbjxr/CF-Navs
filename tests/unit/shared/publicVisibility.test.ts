import { describe, expect, it } from 'vitest'
import type { PublicCategory } from '../../../shared/types'
import { getPublicCategoryIds, isBookmarkIconAnonymouslyVisible } from '../../../worker/lib/db/aggregates'
import {
  getHiddenCategoryIds,
  getPublicCategoryIds as getFrontendPublicCategoryIds,
  isBookmarkIconAccessRequired,
} from '../../../src/lib/adminListState'

const category = (id: number, parent_id: number | null, is_private?: boolean | number): PublicCategory => ({
  id,
  parent_id,
  title: `Category ${id}`,
  icon: null,
  ...(is_private === undefined ? {} : { is_private }),
  sort: id,
})

describe('public category visibility', () => {
  it('hides private categories and all descendants from public data', () => {
    const visible = getPublicCategoryIds([
      category(1, null),
      category(2, 1, true),
      category(3, 2),
      category(4, null),
    ])

    expect([...visible]).toEqual([1, 4])
  })

  it('treats cyclic category data as hidden instead of looping', () => {
    const visible = getPublicCategoryIds([
      category(1, 2),
      category(2, 1),
      category(3, null),
    ])

    expect([...visible]).toEqual([3])
  })

  it('fails closed when a category points to a missing parent', () => {
    const tree = [category(1, 999), category(2, null)]
    const visible = getPublicCategoryIds(tree)
    const frontendVisible = getFrontendPublicCategoryIds(tree)
    const hidden = getHiddenCategoryIds(tree)

    expect([...visible]).toEqual([2])
    expect([...frontendVisible]).toEqual([2])
    expect([...hidden]).toEqual([1])
  })

  it('keeps the admin-side hidden-category mirror in sync with the worker rule', () => {
    const tree = [
      category(1, null),
      category(2, 1, true),
      category(3, 2),
      category(4, null),
      category(5, 4, 0),
      category(6, null, 1),
    ]

    const visible = getPublicCategoryIds(tree)
    const hidden = getHiddenCategoryIds(tree.map((item) => ({
      id: item.id,
      parent_id: item.parent_id,
      title: item.title,
      is_private: item.is_private === true || item.is_private === 1,
    })))

    for (const item of tree) {
      expect(hidden.has(item.id)).toBe(!visible.has(item.id))
    }
  })

  it('denies anonymous icon access to private bookmarks and to public bookmarks under private categories', () => {
    const visible = getPublicCategoryIds([
      category(1, null),
      category(2, null, true),
      category(3, 2),
    ])

    // 公开分类下的公开书签：可见
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1 }, visible)).toBe(true)
    // D1 里 0 与 false 都表示公开
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1, is_private: 0 }, visible)).toBe(true)
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1, is_private: false }, visible)).toBe(true)
    // 私密书签本身：无论所在分类是否公开都不可见
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1, is_private: true }, visible)).toBe(false)
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 1, is_private: 1 }, visible)).toBe(false)
    // 公开书签挂在私密分类、或私密分类的后代下：同样不可见
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 2 }, visible)).toBe(false)
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 3 }, visible)).toBe(false)
    // 分类已被删除：不可见
    expect(isBookmarkIconAnonymouslyVisible({ category_id: 999 }, visible)).toBe(false)
  })

  it('keeps the frontend icon-key rule aligned with the worker anonymous-visibility rule', () => {
    // 两条规则必须互补：服务端认为「匿名不可见」的书签，前端就必须带 key 取图。
    const tree = [
      category(1, null),
      category(2, null, true),
      category(3, 2),
      category(4, null),
    ]
    const visible = getPublicCategoryIds(tree)
    const publicIds = getFrontendPublicCategoryIds(tree)
    const bookmarks = [
      { id: 10, category_id: 1, is_private: 0 },
      { id: 11, category_id: 1, is_private: 1 },
      { id: 12, category_id: 2, is_private: 0 },
      { id: 13, category_id: 3, is_private: 0 },
      { id: 14, category_id: 4, is_private: 0 },
      // D1 的 1 与前端投影的 true 必须等价
      { id: 15, category_id: 4, is_private: true },
      // 分类已被删除 / 书签指向不存在的分类：服务端不可见，前端必须同样要求授权
      { id: 16, category_id: 999, is_private: 0 },
    ]

    for (const item of bookmarks) {
      const needsKey = isBookmarkIconAccessRequired(item, publicIds.has(item.category_id))
      const anonymouslyVisible = isBookmarkIconAnonymouslyVisible(item, visible)
      expect(needsKey).toBe(!anonymouslyVisible)
    }
  })

  it('treats a bookmark under a deleted category as requiring icon authorization', () => {
    // 服务端 visibleCategoryIds 不含该 id → 返回兜底图标；前端若按「不在隐藏集合里就是公开」
    // 判断就会给匿名 URL，导致登录态首页永久显示 NAV。
    const tree = [category(1, null), category(2, null, true)]
    const publicIds = getFrontendPublicCategoryIds(tree)

    expect(isBookmarkIconAccessRequired({ is_private: 0 }, publicIds.has(999))).toBe(true)
    expect(isBookmarkIconAccessRequired({ is_private: 0 }, publicIds.has(1))).toBe(false)
  })
})
