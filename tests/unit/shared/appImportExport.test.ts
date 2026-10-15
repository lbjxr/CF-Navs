import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminData } from '../../../shared/types'

const { getAdminData, addToast } = vi.hoisted(() => ({
  getAdminData: vi.fn(),
  addToast: vi.fn(),
}))

vi.mock('../../../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      admin: { ...actual.api.admin, getData: getAdminData },
    },
  }
})

vi.mock('../../../src/lib/toast', () => ({
  toastStore: {
    addToast,
    dismissToast: vi.fn(),
    subscribe: vi.fn(),
  },
}))

import { createImportExportState, exportDataToFile } from '../../../src/lib/appImportExport'

const remoteData: AdminData = {
  categories: [{ id: 1, parent_id: null, title: 'Fresh category', icon: null, sort: 0, created_at: 1 }],
  bookmarks: [{
    id: 2,
    category_id: 1,
    title: 'Fresh bookmark',
    url: 'https://example.com/fresh',
    icon: null,
    icon_source: null,
    icon_background_color: null,
    icon_blob: null,
    icon_cached: null,
    description: null,
    open_method: 1,
    sort: 0,
    created_at: 2,
  }],
  settings: null,
}

describe('fresh backup export', () => {
  let downloadedJson = ''
  let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    downloadedJson = ''
    anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    getAdminData.mockResolvedValue(remoteData)

    vi.stubGlobal('Blob', class {
      constructor(parts: unknown[]) {
        downloadedJson = parts.map(String).join('')
      }
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('waits for the latest admin API data before downloading', async () => {
    let resolveRemote: ((data: AdminData) => void) | undefined
    getAdminData.mockReturnValue(new Promise<AdminData>((resolve) => {
      resolveRemote = resolve
    }))

    const state = createImportExportState()
    const exportPromise = exportDataToFile(state, {
      categoryIds: new Set([1]),
      includeSettings: false,
    })

    await Promise.resolve()
    expect(anchor.click).not.toHaveBeenCalled()
    expect(getAdminData).toHaveBeenCalledOnce()

    resolveRemote?.(remoteData)
    await exportPromise

    const payload = JSON.parse(downloadedJson) as AdminData & { settings: null }
    expect(payload.categories[0].title).toBe('Fresh category')
    expect(payload.bookmarks[0].title).toBe('Fresh bookmark')
    expect(payload.settings).toBeNull()
    expect(state.exporting).toBe(false)
    expect(addToast).toHaveBeenCalledOnce()
  })

  it('surfaces a fresh-data request failure without downloading', async () => {
    getAdminData.mockRejectedValue(new Error('fresh request failed'))

    const state = createImportExportState()
    await exportDataToFile(state, { categoryIds: new Set([1]), includeSettings: true })

    expect(state.backupError).toBe('fresh request failed')
    expect(anchor.click).not.toHaveBeenCalled()
    expect(state.exporting).toBe(false)
  })
})
