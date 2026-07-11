import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('admin backup layout', () => {
  it('aligns the import source select with the backup action buttons', () => {
    const source = readFileSync('src/components/BackupPanel.svelte', 'utf8')
    const actionsRule = source.match(/\.backup-actions\s*\{([^}]+)\}/)?.[1] ?? ''
    const buttonsRule = source.match(/\.primary-button,\s*\.ghost-button\s*\{([^}]+)\}/)?.[1] ?? ''

    expect(actionsRule).toContain('align-items: flex-end')
    expect(buttonsRule).toContain('min-height: 39px')
  })
})
