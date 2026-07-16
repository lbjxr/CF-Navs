import type { AdminData } from '../../shared/types'
import { api, getErrorMessage } from './api'
import { createBackupExportArtifact, createImportSuccessMessage } from './appBackup'
import { createImportOverwriteConfirmation, type ConfirmDialogInput } from './appConfirmDialog'
import type { ImportSource } from './importData'
import { toastStore } from './toast'

export interface ImportExportState {
  importing: boolean
  backupError: string
  backupMessage: string
}

export function createImportExportState(): ImportExportState {
  return {
    importing: false,
    backupError: '',
    backupMessage: '',
  }
}

/**
 * Synchronous export: builds the backup JSON artifact from current admin data,
 * triggers a file download, and sets the success/error state + toast.
 */
export function exportDataToFile(state: ImportExportState, adminData: AdminData): void {
  state.backupError = ''
  state.backupMessage = ''

  try {
    const artifact = createBackupExportArtifact(adminData)
    const blob = new Blob([artifact.json], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = artifact.fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(href)
    state.backupMessage = artifact.message
    toastStore.addToast(artifact.message, 'success')
  } catch (error) {
    state.backupError = getErrorMessage(error)
  }
}

/** Dependencies that the import handler needs from the host component. */
export interface ImportDeps {
  adminData: AdminData
  requestConfirmation: (input: ConfirmDialogInput) => Promise<boolean>
  applyLoggedInData: (data: AdminData) => void
  persistCurrentAdminData: () => Promise<void>
}

/**
 * Asynchronous import: reads the file, parses it, asks for overwrite confirmation,
 * sends to the API, then applies the result and re-persists admin data.
 */
export async function importDataFromFile(
  state: ImportExportState,
  file: File,
  source: ImportSource,
  mode: 'replace' | 'merge',
  deps: ImportDeps,
): Promise<void> {
  state.backupError = ''
  state.backupMessage = ''

  try {
    const text = await file.text()
    const { detectImportSource, prepareImportText } = await import('./importData')
    const detectedSource = detectImportSource(text, file.name)
    const prepared = prepareImportText(text, detectedSource || source)
    const effectiveMode = detectedSource === 'browser-html' && source !== 'browser-html' ? 'merge' : mode
    prepared.payload.mode = effectiveMode

    const confirmed = await deps.requestConfirmation(effectiveMode === 'replace'
      ? createImportOverwriteConfirmation(prepared)
      : { title: '追加导入数据', message: `将追加 ${prepared.categories} 个分类中的 ${prepared.bookmarks} 个书签，重复链接会保留。`, confirmLabel: '确认导入' })
    if (!confirmed) {
      return
    }

    state.importing = true
    const result = await api.data.importAll(prepared.payload)
    deps.applyLoggedInData(result.data)
    await deps.persistCurrentAdminData()
    state.backupMessage = createImportSuccessMessage(result)
    toastStore.addToast(state.backupMessage, 'success')
  } catch (error) {
    state.backupError = getErrorMessage(error)
  } finally {
    state.importing = false
  }
}
