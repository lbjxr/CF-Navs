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

  it('keeps the mobile export action above the admin bottom navigation', () => {
    const source = readFileSync('src/components/BackupPanel.svelte', 'utf8')

    expect(source).toContain('.export-operation > .primary-button')
    expect(source).toContain('padding-bottom: calc(132px + env(safe-area-inset-bottom));')
    expect(source).toContain('bottom: calc(60px + max(12px, env(safe-area-inset-bottom)));')
    expect(source).toContain('z-index: 1001;')
  })
  it('only applies fixed export CTA rules where bottom navigation exists', () => {
    const source = readFileSync('src/components/BackupPanel.svelte', 'utf8')
    const tabletStylesStart = source.indexOf('@media (max-width: 760px)')
    const mobileCtaStylesStart = source.indexOf('@media (max-width: 700px)', tabletStylesStart)
    const tabletStyles = source.slice(tabletStylesStart, mobileCtaStylesStart)
    const ctaStyles = source.slice(mobileCtaStylesStart)

    expect(tabletStyles).not.toContain('.export-operation > .primary-button')
    expect(tabletStyles).not.toContain('position: fixed;')
    expect(ctaStyles).toContain('.export-operation > .primary-button')
    expect(ctaStyles).toContain('position: fixed;')
    expect(ctaStyles).toContain('bottom: calc(60px + max(12px, env(safe-area-inset-bottom)));')
    expect(source).toContain('@media (max-width: 760px)')
  })
})
