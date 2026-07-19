import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../../src/App.svelte', import.meta.url), 'utf8')
const confirmDialogSource = readFileSync(new URL('../../src/components/ConfirmDialog.svelte', import.meta.url), 'utf8')

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

  it('keeps cancel available while disabled confirmations block click and Enter paths', () => {
    expect(confirmDialogSource).toContain('function handleCancel() {\n    if (loading) return')
    expect(confirmDialogSource).toContain('function handleConfirm() {\n    if (loading || confirmDisabled) return')
    expect(confirmDialogSource).toContain('disabled={loading || confirmDisabled}')
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
