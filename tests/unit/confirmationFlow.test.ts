import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// 这里留下的是**编排顺序与去重护栏**，不迁移到组件层（PROB-18）：断言对象是 `App.svelte` 里
// `handleDeleteCategory` 的函数体是否走共享确认流、是否残留原生 `window.confirm`，以及
// `src/lib/appImportExport.ts` 里「先确认覆盖、再进入 importing、最后调导入接口」的语句先后顺序。
// 顺序与「不存在某种写法」这两类事实在挂载后的 DOM 上没有对应表现；要用真 DOM 证明前者还得先挂载
// 约 1100 行的 `App.svelte`（属 PROB-24 的编排拆分前置）。
// 弹层自身的禁用态与键盘行为已迁到 tests/unit/confirmDialogBehavior.test.ts。

const appSource = readFileSync(new URL('../../src/App.svelte', import.meta.url), 'utf8')

function extractFunctionBody(source: string, functionName: string): string {
  const marker = `async function ${functionName}`
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`function ${functionName} not found`)

  const signatureEnd = source.indexOf('):', start)
  const bodyStart = source.indexOf('{', signatureEnd)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(bodyStart + 1, index)
    }
  }

  throw new Error(`function ${functionName} body not closed`)
}

describe('destructive action confirmation flow', () => {
  it('does not use native blocking window.confirm in App.svelte', () => {
    expect(appSource).not.toContain('window.confirm')
  })

  it('uses the shared ConfirmDialog flow for category deletion', () => {
    const body = extractFunctionBody(appSource, 'handleDeleteCategory')

    expect(body).toContain('requestConfirmation(createDeleteCategoryConfirmation(')
    expect(body).toContain('childCategoryCount')
    expect(body).toContain('if (!confirmed) return')
    expect(body).toContain('await api.categories.remove(categoryId)')
  })

  it('confirms import overwrite before entering importing state', () => {
    // import/export controller was extracted to appImportExport.ts -- verify ordering there
    const importExportSource = readFileSync(new URL('../../src/lib/appImportExport.ts', import.meta.url), 'utf8')
    const body = extractFunctionBody(importExportSource, 'importDataFromFile')
    const confirmIndex = body.indexOf('createImportOverwriteConfirmation(prepared)')
    const importingIndex = body.indexOf('state.importing = true')
    const importApiIndex = body.indexOf('api.data.importAll')

    expect(confirmIndex).toBeGreaterThanOrEqual(0)
    expect(importingIndex).toBeGreaterThan(confirmIndex)
    expect(importApiIndex).toBeGreaterThan(importingIndex)
  })
})
