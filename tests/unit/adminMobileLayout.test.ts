import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 只保留必须靠源码文本才能锁住的**纯 CSS 布局**约定（grid 模板、padding、position、
// safe-area-inset）——它们要 computed style 才能真正证明，属 PROB-18c 的范围。
//
// 「移动端截断标题/URL 但保留完整值」两组已迁到 adminMobileTruncation.test.ts，在真实
// DOM 上断言 title / aria-label / href（PROB-18b 第 2 个文件）。
describe('admin mobile layout contracts', () => {
  it('keeps the page header actions in normal document flow', () => {
    const header = readFileSync('src/components/admin/AdminPageHeader.svelte', 'utf8')
    const mobileHeader = header.slice(header.indexOf('@media (max-width: 700px)'))

    expect(header.indexOf('<header class="page-header">')).toBeLessThan(header.indexOf('class="admin-header-actions"'))
    expect(header).toContain('grid-template-columns: minmax(0, 1fr) auto')
    expect(mobileHeader).toContain('grid-template-columns: minmax(0, 1fr) auto')
    expect(mobileHeader).toContain('padding: 10px 12px')
    expect(mobileHeader).toContain('width: 2rem')
    expect(header).not.toContain('position: fixed')

    const sidebar = readFileSync('src/components/AdminSidebar.svelte', 'utf8')
    expect(sidebar).toContain('top: auto')

    const admin = readFileSync('src/views/Admin.svelte', 'utf8')
    const narrowAdminPage = admin.slice(admin.indexOf('@media (max-width: 720px)'))
    expect(narrowAdminPage).toContain('padding-bottom: calc(76px + env(safe-area-inset-bottom))')
  })

  it('keeps mobile status metrics in one three-column row', () => {
    const styles = readFileSync('src/components/admin/adminListPanels.css', 'utf8')
    const mobileStyles = styles.slice(styles.indexOf('@media (max-width: 960px)'))

    expect(mobileStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(mobileStyles).toContain('min-width: 0')
  })

  it('removes the settings helper description and grids mobile import controls', () => {
    const settings = readFileSync('src/components/SettingsPanel.svelte', 'utf8')
    const backup = readFileSync('src/components/BackupPanel.svelte', 'utf8')

    expect(settings).not.toContain('class="panel-desc"')
    expect(backup).toContain('grid-template-areas:')
    expect(backup).toContain('"source source"')
    expect(backup).toContain('"mode button"')
    expect(backup).toContain('minmax(0, 1fr)')
  })
})
