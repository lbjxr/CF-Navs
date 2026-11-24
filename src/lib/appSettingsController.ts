import type { AdminData, ChangePasswordReq, LoginResp, Settings } from '../../shared/types'
import { runAdminMutation } from './appAdminMutation'
import type { AppView } from './appNavigation'
import type { BackupSelection } from './appBackup'
import type { ConfirmDialogInput } from './appConfirmDialog'
import type { SettingsFormValue } from './appData'
import {
  createImportExportState,
  exportDataToFile,
  importDataFromFile,
  type ImportExportState,
} from './appImportExport'
import type { ImportSource } from './importData'

// 设置保存 / 修改密码 / 导入导出（App.svelte 拆分第 7c 步，代码审查三轮第 16 项）。
//
// 与 appCategoryController / appBookmarkController 同一形态：普通闭包控制器，持有设置表单的保存中 / 错误
// 与导入导出状态，每次赋值后经 `onChange` 推送整份快照（不新增 store 订阅）。rootError / loginModalOpen /
// currentView 仍归 App 经回调写入；改密后的分类 / 书签编辑框重置经注入的函数调用。
// 语句顺序与 await 位置与原 App 实现逐条一致。

export interface SettingsControllerState {
  saving: boolean
  error: string
  importExport: ImportExportState
}

export interface SettingsControllerDeps {
  onChange: (state: SettingsControllerState) => void
  api: {
    settings: { update: (payload: SettingsFormValue) => Promise<Settings> }
    auth: { changePassword: (payload: ChangePasswordReq) => Promise<unknown> }
  }
  /** App 的认证视图意图（`createAuthViewIntent()`）：改密会作废仍在进行的登出视图切换。 */
  authViewIntent: { invalidate: () => void }
  /** 与书签控制器相同，按发起时登录会话的引用隔离迟到的保存结果。 */
  getSession?: () => LoginResp | null
  /** 当前 `adminData`（`$adminStore.data`），导入时作为合并 / 覆盖确认的依据。 */
  getAdminData: () => AdminData
  requestConfirmation: (input: ConfirmDialogInput) => Promise<boolean>
  applyLocalSettings: (settings: Settings) => Promise<void>
  applyLoggedInData: (data: AdminData) => void
  persistCurrentAdminData: () => Promise<void>
  refreshAdminDataAfterMutation: () => Promise<void>
  setSession: (session: LoginResp | null) => void
  /** 关闭并清空分类 / 书签编辑框（`categoryController.reset` / `bookmarkController.reset`）。 */
  resetCategories: () => void
  resetBookmarks: () => void
  resetAdminData: () => void
  clearCachedAdminData: () => Promise<void>
  ensureLazyComponent: (name: 'LoginModal') => Promise<unknown>
  setRootError: (message: string) => void
  setLoginModalOpen: (open: boolean) => void
  setCurrentView: (view: AppView) => void
}

export interface SettingsController {
  getState: () => SettingsControllerState
  /** 清掉设置错误与保存中标志；登出 / 改密时调用。 */
  reset: () => void
  /** 完成远端写入和本地应用才返回 true；失败或失效返回 false，业务错误仍发布到状态。 */
  submit: (payload: SettingsFormValue) => Promise<boolean>
  /** 失败原样抛给调用方（改密面板据此展示错误）。 */
  changePassword: (payload: ChangePasswordReq) => Promise<void>
  exportData: (selection: BackupSelection) => Promise<void>
  importData: (file: File, source: ImportSource, mode: 'replace' | 'merge') => Promise<void>
}

export function createSettingsController(deps: SettingsControllerDeps): SettingsController {
  const {
    onChange,
    api,
    authViewIntent,
    getAdminData,
    requestConfirmation,
    applyLocalSettings,
    applyLoggedInData,
    persistCurrentAdminData,
    refreshAdminDataAfterMutation,
    setSession,
    resetCategories,
    resetBookmarks,
    resetAdminData,
    clearCachedAdminData,
    ensureLazyComponent,
    setRootError,
    setLoginModalOpen,
    setCurrentView,
  } = deps
  let saving = false
  let error = ''
  let saveOperation = 0
  let importExport = createImportExportState()

  const getState = (): SettingsControllerState => ({ saving, error, importExport })
  const emit = (): void => onChange(getState())
  const onStateChange = (next: ImportExportState): void => {
    importExport = next
    emit()
  }

  function reset(): void {
    saveOperation += 1
    error = ''
    saving = false
    emit()
  }

  async function submit(payload: SettingsFormValue): Promise<boolean> {
    const operation = ++saveOperation
    const session = deps.getSession?.()
    const isCurrent = () => operation === saveOperation && session === deps.getSession?.()
    saving = true
    error = ''
    emit()

    const result = await runAdminMutation({
      isCurrent,
      run: () => api.settings.update(payload),
      onSuccess: (settings) => applyLocalSettings(settings),
      successMessage: () => '设置已保存',
      onError: (message) => {
        error = message
        emit()
      },
      onSettled: () => {
        saving = false
        emit()
      },
    })
    return isCurrent() && result !== undefined
  }

  async function changePassword(payload: ChangePasswordReq): Promise<void> {
    authViewIntent.invalidate()
    setRootError('')

    await api.auth.changePassword(payload)
    setSession(null)
    resetCategories()
    reset()
    resetBookmarks()
    resetAdminData()
    await clearCachedAdminData()
    setRootError('管理员密码已更新，请使用新密码重新登录。')
    await ensureLazyComponent('LoginModal')
    setLoginModalOpen(true)
    setCurrentView('login')
  }

  async function exportData(selection: BackupSelection): Promise<void> {
    await exportDataToFile(importExport, selection, onStateChange)
  }

  async function importData(file: File, source: ImportSource, mode: 'replace' | 'merge'): Promise<void> {
    await importDataFromFile(importExport, file, source, mode, {
      adminData: getAdminData(),
      requestConfirmation,
      applyLoggedInData: (data) => applyLoggedInData(data),
      persistCurrentAdminData,
      onStateChange,
    })
    if (!importExport.backupError && importExport.backupMessage) {
      await refreshAdminDataAfterMutation()
    }
  }

  return { getState, reset, submit, changePassword, exportData, importData }
}
