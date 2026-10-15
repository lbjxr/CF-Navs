// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import CategoryListPanel from '../../../src/components/admin/CategoryListPanel.svelte'
import BookmarkListPanel from '../../../src/components/admin/BookmarkListPanel.svelte'
import AnalyticsPanel from '../../../src/components/admin/AnalyticsPanel.svelte'
import { iconAccessKey } from '../../../src/lib/iconAccessKey'

// PROB-35 方案 (a)：后台三个面板只给「有效私密」对象的对象代理图标 URL 附加访问 key，
// 公开对象保持匿名 `/api/{icon,category-icon}/:id?v=...`（可命中共享缓存）。
// 有效私密 = 对象自身私密，或（书签）所属分类落在私密祖先链下。这两类都必须带 key，
// 否则 Worker 会以匿名口径返回兜底图标、后台预览退化。
const GRANT = 'GRANT123'

const categories = [
  { id: 1, parent_id: null, title: '公开根', icon: 'https://example.com/a.png', is_private: false, sort: 1 },
  { id: 2, parent_id: null, title: '私密根', icon: 'https://example.com/b.png', is_private: true, sort: 2 },
  { id: 3, parent_id: 2, title: '私密根下的公开子', icon: 'https://example.com/c.png', is_private: false, sort: 1 },
]

const bookmark = (over: Record<string, unknown>) => ({
  id: 0,
  category_id: 1,
  title: 't',
  url: 'https://t.example',
  icon: 'https://example.com/f.png',
  icon_cached: true,
  icon_source: null,
  icon_blob: '',
  open_method: 'new_tab' as const,
  sort: 1,
  click_count: 5,
  is_private: false,
  ...over,
})

const bookmarks = [
  bookmark({ id: 1, category_id: 1, is_private: false }), // 公开分类下的公开书签 → 无 key
  bookmark({ id: 2, category_id: 1, is_private: true }), // 私密书签 → 带 key
  bookmark({ id: 3, category_id: 3, is_private: false }), // 私密祖先链下的公开书签 → 带 key
]

const imgBySrc = (root: ParentNode, fragment: string): Element | undefined =>
  Array.from(root.querySelectorAll('img')).find((img) => (img.getAttribute('src') ?? '').includes(fragment))

beforeEach(() => {
  iconAccessKey.set(GRANT)
})

afterEach(() => {
  cleanup()
  iconAccessKey.set('')
})

describe('后台图标访问 key 的可见性分流', () => {
  it('分类面板：公开分类无 key，私密分类及私密祖先下的公开子分类带 key', async () => {
    const { container, getByTestId } = render(CategoryListPanel, {
      props: { isAuthenticated: true, categories, bookmarks: [] },
    })

    // 子分类默认折叠，需要展开私密根才能渲染其公开子分类的图标。
    await fireEvent.click(getByTestId('admin-category-expand-2'))
    await tick()

    expect(imgBySrc(container, '/api/category-icon/1')?.getAttribute('src')).not.toContain('key=')
    expect(imgBySrc(container, '/api/category-icon/2')?.getAttribute('src')).toContain(`key=${GRANT}`)
    expect(imgBySrc(container, '/api/category-icon/3')?.getAttribute('src')).toContain(`key=${GRANT}`)
  })

  it('书签列表：公开书签无 key，私密书签与私密分类树下的书签带 key', async () => {
    const { container } = render(BookmarkListPanel, {
      props: { isAuthenticated: true, categories, bookmarks },
    })

    await waitFor(() => {
      expect(imgBySrc(container, '/api/icon/1')).toBeTruthy()
      expect(imgBySrc(container, '/api/icon/2')).toBeTruthy()
      expect(imgBySrc(container, '/api/icon/3')).toBeTruthy()
    })

    expect(imgBySrc(container, '/api/icon/1')?.getAttribute('src')).not.toContain('key=')
    expect(imgBySrc(container, '/api/icon/2')?.getAttribute('src')).toContain(`key=${GRANT}`)
    expect(imgBySrc(container, '/api/icon/3')?.getAttribute('src')).toContain(`key=${GRANT}`)
  })

  it('访问分析：Top 列表沿用同一分流规则', async () => {
    const { container } = render(AnalyticsPanel, {
      props: { categories, bookmarks },
    })

    await waitFor(() => {
      expect(imgBySrc(container, '/api/icon/1')).toBeTruthy()
      expect(imgBySrc(container, '/api/icon/2')).toBeTruthy()
      expect(imgBySrc(container, '/api/icon/3')).toBeTruthy()
    })

    expect(imgBySrc(container, '/api/icon/1')?.getAttribute('src')).not.toContain('key=')
    expect(imgBySrc(container, '/api/icon/2')?.getAttribute('src')).toContain(`key=${GRANT}`)
    expect(imgBySrc(container, '/api/icon/3')?.getAttribute('src')).toContain(`key=${GRANT}`)
  })
})
