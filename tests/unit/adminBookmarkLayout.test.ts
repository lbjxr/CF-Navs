import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('admin bookmark selection toolbar layout', () => {
  it('floats the selection toolbar and reserves mobile space above the fixed navigation', () => {
    const panel = readFileSync('src/components/admin/BookmarkListPanel.svelte', 'utf8')

    expect(panel).toContain('grid-template-rows: auto minmax(0, 1fr) auto;')
    expect(panel).toContain('.admin-bookmark-list-content.has-batch-selection ~ .admin-panel-footer')
    expect(panel).toContain('bottom: calc(60px + max(10px, env(safe-area-inset-bottom)));')
    expect(panel).toContain('z-index: 1001;')
  })

  // 工具条渲染时机、批量移动的默认目标、私密目标的后果提示与回调载荷，改由真 DOM 断言：
  // 见 tests/unit/adminBookmarkBatchBehavior.test.ts。计数语义在纯函数层：
  // tests/unit/adminListState.test.ts。
})
