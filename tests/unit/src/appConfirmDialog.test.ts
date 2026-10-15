import { describe, expect, it } from 'vitest'
import {
  createConfirmDialogState,
  createDeleteBookmarkConfirmation,
  createDeleteCategoryConfirmation,
  createImportOverwriteConfirmation,
  describeExecutableImportContent,
  formatByteSize,
} from '../../../src/lib/appConfirmDialog'

describe('app confirmation dialog helpers', () => {
  it('applies default confirmation dialog fields', () => {
    expect(createConfirmDialogState({
      title: '确认操作',
      message: '是否继续？',
    })).toEqual({
      title: '确认操作',
      message: '是否继续？',
      itemTitle: '',
      confirmLabel: '确认',
      cancelLabel: '取消',
      variant: 'default',
      confirmDisabled: false,
    })
  })

  it('builds category deletion confirmations', () => {
    expect(createConfirmDialogState(createDeleteCategoryConfirmation('工具', 3, 0))).toEqual({
      title: '删除分类',
      message: '删除后该分类及其 3 个直属书签都会从首页和后台列表中移除，此操作不可撤销。',
      itemTitle: '工具',
      confirmLabel: '确认删除',
      cancelLabel: '取消',
      variant: 'danger',
      confirmDisabled: false,
    })

    expect(createConfirmDialogState(createDeleteCategoryConfirmation('工具', 3, 2))).toMatchObject({
      message: '该分类有 3 个直属书签和 2 个子分类。请先移动或删除子分类，当前不能删除。',
      confirmLabel: '存在子分类',
      confirmDisabled: true,
    })
  })

  it('builds bookmark deletion confirmations', () => {
    expect(createConfirmDialogState(createDeleteBookmarkConfirmation('GitHub'))).toEqual({
      title: '删除书签',
      message: '删除后该书签会从首页和后台列表中移除，此操作不可撤销。',
      itemTitle: 'GitHub',
      confirmLabel: '确认删除',
      cancelLabel: '取消',
      variant: 'danger',
      confirmDisabled: false,
    })
  })

  it('builds import overwrite confirmations', () => {
    expect(createConfirmDialogState(createImportOverwriteConfirmation({
      sourceLabel: 'SunPanel',
      categories: 2,
      bookmarks: 12,
    }))).toEqual({
      title: '导入并覆盖数据',
      message: '导入 SunPanel 将覆盖现有的全部分类与书签（2 个分类，12 个书签），此操作不可撤销。',
      itemTitle: '',
      confirmLabel: '确认导入',
      cancelLabel: '取消',
      variant: 'danger',
      confirmDisabled: false,
    })
  })
})

describe('import backups that carry executable content', () => {
  const base = { sourceLabel: 'CF-Navs backup', categories: 3, bookmarks: 12 }

  it('says nothing extra when the backup carries none', () => {
    expect(createImportOverwriteConfirmation(base).message).not.toContain('注意')
    expect(createImportOverwriteConfirmation({
      ...base,
      payload: { settings: { site_title: 'Nav', custom_js: '', footer_html: '   ' } },
    }).message).not.toContain('注意')
  })

  it('warns when the backup carries custom JS', () => {
    // POST /api/import 的覆盖模式会写 settings，而 custom_js 在可写 key 列表里，
    // 且 validateImportPayload 对 settings 只检查 isPlainObject。从别处拿到的备份
    // 完全可能夹带它，导入后立刻对所有访客生效。危险的是「静默」，所以要说出来。
    const result = createImportOverwriteConfirmation({
      ...base,
      payload: { settings: { custom_js: 'x'.repeat(2048) } },
    })

    expect(result.message).toContain('自定义 JS')
    expect(result.message).toContain('2.0 KB')
    expect(result.message).toContain('会在所有访客的浏览器中执行')
    expect(result.message).toContain('只在你信任来源时继续')
  })

  it('warns about footer HTML too', () => {
    const result = createImportOverwriteConfirmation({
      ...base,
      payload: { settings: { footer_html: '<b>hi</b>' } },
    })

    expect(result.message).toContain('页脚 HTML')
    expect(result.message).toContain('会原样插入首页')
  })

  it('lists both when both are present', () => {
    const message = createImportOverwriteConfirmation({
      ...base,
      payload: { settings: { custom_js: 'a()', footer_html: '<b>hi</b>' } },
    }).message

    expect(message).toContain('自定义 JS')
    expect(message).toContain('页脚 HTML')
  })

  it('keeps the overwrite scope in the message', () => {
    const message = createImportOverwriteConfirmation({
      ...base,
      payload: { settings: { custom_js: 'a()' } },
    }).message

    expect(message).toContain('3 个分类')
    expect(message).toContain('12 个书签')
  })
})

describe('executable import content detection', () => {
  it('measures bytes, not characters', () => {
    // 中文一个字 3 字节；按字符数报大小会严重低估
    expect(describeExecutableImportContent({ custom_js: '中'.repeat(10) })[0].bytes).toBe(30)
  })

  it('formats sizes readably', () => {
    expect(formatByteSize(512)).toBe('512 B')
    expect(formatByteSize(1024)).toBe('1.0 KB')
    expect(formatByteSize(2560)).toBe('2.5 KB')
  })

  it('ignores shapes that are not a settings object', () => {
    expect(describeExecutableImportContent(null)).toEqual([])
    expect(describeExecutableImportContent(undefined)).toEqual([])
    expect(describeExecutableImportContent('nope')).toEqual([])
    expect(describeExecutableImportContent([])).toEqual([])
    expect(describeExecutableImportContent({ custom_js: 123 })).toEqual([])
  })
})
