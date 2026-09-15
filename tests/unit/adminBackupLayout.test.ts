import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 断言 `src/components/BackupPanel.svelte` 的结构与定位契约：导出/导入拆成两个 `backup-operation` 分区、
// `#export-backup-title`/`#import-backup-title`、`import-actions` 类且不留 `backup-actions`，`rootSelectionState(root, selectedIds)`
// 签名及被 `selectedCategoryIds` 复用两次，以及移动端 `@media (max-width: 760px)` 下导出按钮不用 `position: fixed`
// 而是 `width: 100%`。这些是源码文本、函数复用计数与 CSS 定位规则，不是可观测 DOM 行为；jsdom 不做布局也不跑
// 媒体查询，挂载拿不到定位/断点结果，函数被调用几次更非组件层可观测。（PROB-18）

describe('admin backup layout', () => {
  it('separates export and import into distinct operation sections', () => {
    const source = readFileSync('src/components/BackupPanel.svelte', 'utf8')

    expect(source).toContain('class="backup-operations"')
    expect(source.match(/class="backup-operation(?: [^"]*)?"/g)).toHaveLength(2)
    expect(source).toContain('id="export-backup-title"')
    expect(source).toContain('id="import-backup-title"')
    expect(source).toContain('class="import-actions"')
    expect(source).toContain('选择文件并导入')
    expect(source).not.toContain('class="backup-actions"')
  })

  it('passes the selected id set into every root selection calculation', () => {
    const source = readFileSync('src/components/BackupPanel.svelte', 'utf8')

    expect(source).toContain('function rootSelectionState(root: CategoryOption, selectedIds: Set<number>)')
    expect(source.match(/rootSelectionState\(root, selectedCategoryIds\)/g)).toHaveLength(2)
  })

  it('keeps the export button in normal flow without fixed positioning', () => {
    const source = readFileSync('src/components/BackupPanel.svelte', 'utf8')

    expect(source).not.toContain('position: fixed;')
    expect(source).not.toContain('padding-bottom: calc(132px + env(safe-area-inset-bottom));')
    expect(source).toContain('.export-operation > .primary-button')
    const mobileStyles = source.slice(source.indexOf('@media (max-width: 760px)'))
    expect(mobileStyles).toContain('.export-operation > .primary-button')
    expect(mobileStyles).toContain('width: 100%;')
  })
})
