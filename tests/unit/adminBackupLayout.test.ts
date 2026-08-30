import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
  it('keeps the mobile export action fixed and within the viewport', () => {
    const source = readFileSync('src/components/BackupPanel.svelte', 'utf8')

    expect(source).toContain('.export-operation > .primary-button')
    expect(source).toContain('position: fixed;')
    expect(source).toContain('padding-bottom: calc(72px + env(safe-area-inset-bottom));')
  })
})
