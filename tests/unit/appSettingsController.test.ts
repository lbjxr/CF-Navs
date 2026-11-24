import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminData, ChangePasswordReq, LoginResp, Settings } from '../../shared/types'
import { getErrorMessage } from '../../src/lib/api'
import { runAdminMutation } from '../../src/lib/appAdminMutation'
import type { BackupSelection as BackupSelectionInput } from '../../src/lib/appBackup'
import type { ConfirmDialogInput } from '../../src/lib/appConfirmDialog'
import type { SettingsFormValue } from '../../src/lib/appData'
import {
  createImportExportState,
  exportDataToFile,
  importDataFromFile,
  type ImportDeps,
  type ImportExportState,
} from '../../src/lib/appImportExport'
import type { AppView } from '../../src/lib/appNavigation'
import {
  createSettingsController,
  type SettingsControllerDeps,
  type SettingsControllerState,
} from '../../src/lib/appSettingsController'
import type { ImportSource } from '../../src/lib/importData'
import { toastStore } from '../../src/lib/toast'
import { flush, track, UseCaseWorld, type Plan } from '../helpers/useCaseWorld'

// 代码审查三轮第 16 项：App.svelte 拆分第 7c 步（设置 / 改密 / 导入导出）。
// 每个用例在同一份脚本下分别驱动新控制器与逐字复刻的原 App 实现（见文件末尾 legacy），
// 断言两者的依赖调用序列（含每次调用时的完整状态快照；toast / console.warn 也记入日志）、
// 最终状态与 promise 结果完全一致，再对控制器的结果做语义断言。
//
// 导入导出的文件 / 下载细节由 appImportExport 自己的测试覆盖；这里把 exportDataToFile / importDataFromFile
// 换成走世界脚本的替身（保留「导出中再次导出直接返回」、就地改写传入的 state 再推送副本、经注入依赖确认 /
// 应用 / 持久化的契约），控制器与 legacy 共用同一份替身，比对的是两者传给它的 state 与依赖。

let activeWorld: World | null = null

vi.mock('../../src/lib/appImportExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/appImportExport')>()
  const notify = (state: ImportExportState, listener?: (next: ImportExportState) => void) => listener?.({ ...state })
  return {
    ...actual,
    async exportDataToFile(state: ImportExportState, selection?: BackupSelectionInput, onStateChange?: (next: ImportExportState) => void) {
      const w = activeWorld!
      w.record('exportDataToFile', selection, { ...state })
      if (state.exporting) return
      state.backupError = ''
      state.backupMessage = ''
      state.exporting = true
      notify(state, onStateChange)
      try {
        state.backupMessage = await w.call<string>('exportRun')
        notify(state, onStateChange)
      } catch (error) {
        state.backupError = getErrorMessage(error)
        notify(state, onStateChange)
      } finally {
        state.exporting = false
        notify(state, onStateChange)
      }
    },
    async importDataFromFile(state: ImportExportState, file: File, source: ImportSource, mode: 'replace' | 'merge', deps: ImportDeps) {
      const w = activeWorld!
      w.record('importDataFromFile', file.name, source, mode, deps.adminData, { ...state })
      state.backupError = ''
      state.backupMessage = ''
      notify(state, deps.onStateChange)
      try {
        const confirmed = await deps.requestConfirmation({ title: '导入', message: mode })
        if (!confirmed) return
        state.importing = true
        notify(state, deps.onStateChange)
        const data = await w.call<AdminData>('importRun')
        deps.applyLoggedInData(data)
        await deps.persistCurrentAdminData()
        state.backupMessage = `imported ${data.categories.length}`
        notify(state, deps.onStateChange)
        // 真实实现在写入成功文案之后才弹 toast；toast 抛错时 backupMessage 与 backupError 会同时存在。
        w.callSync('importToast')
      } catch (error) {
        state.backupError = getErrorMessage(error)
        notify(state, deps.onStateChange)
      } finally {
        state.importing = false
        notify(state, deps.onStateChange)
      }
    },
  }
})

interface Snap extends SettingsControllerState {
  rootError: string
  loginModalOpen: boolean
  currentView: AppView
}

interface Impl {
  submit(payload: SettingsFormValue): Promise<void | boolean>
  changePassword(payload: ChangePasswordReq): Promise<void>
  exportData(selection: BackupSelectionInput): Promise<void>
  importData(file: File, source: ImportSource, mode: 'replace' | 'merge'): Promise<void>
  /** 登出中的 resetSettingsState()。 */
  reset(): void
  read(): Snap
}

const adminData = (n = 1): AdminData => ({
  categories: Array.from({ length: n }, (_, i) => ({ id: i + 1, parent_id: null, title: `C${i + 1}`, icon: null, sort: i, created_at: 0 })),
  bookmarks: [],
  settings: null,
}) as unknown as AdminData
const savedSettings = { site_title: 'Saved', public_mode: true } as unknown as Settings

class World extends UseCaseWorld {
  impl!: Impl
  data: AdminData = adminData(2)
  constructor(plan: Plan) {
    super(plan, {
      confirm: true,
      'api.settings.update': savedSettings,
      exportRun: 'exported',
      importRun: adminData(3),
    })
    this.snapshot = () => this.impl.read()
  }
}

beforeEach(() => {
  vi.spyOn(toastStore, 'addToast').mockImplementation((message, type) => {
    activeWorld?.record('toast', message, type)
    return ''
  })
  vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
    activeWorld?.record('warn', message)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  activeWorld = null
})

interface AppVars { rootError: string; loginModalOpen: boolean; currentView: AppView }

function doubles(w: World, app: AppVars) {
  return {
    api: {
      settings: { update: (payload: SettingsFormValue) => w.call<Settings>('api.settings.update', payload) },
      auth: { changePassword: (payload: ChangePasswordReq) => w.call('api.auth.changePassword', payload) },
    },
    authViewIntent: { invalidate: () => { w.callSync('invalidateAuthView') } },
    getAdminData: () => {
      w.record('getAdminData')
      return w.data
    },
    requestConfirmation: (input: ConfirmDialogInput) => w.call<boolean>('confirm', input),
    applyLocalSettings: (settings: Settings) => w.call<void>('applyLocalSettings', settings),
    applyLoggedInData: (...args: unknown[]) => { w.callSync('applyLoggedInData', ...args) },
    persistCurrentAdminData: (...args: unknown[]) => w.call<void>('persist', ...args),
    refreshAdminDataAfterMutation: () => w.call<void>('refreshAfterMutation'),
    setSession: (session: LoginResp | null) => { w.callSync('setSession', session) },
    resetCategories: () => { w.callSync('resetCategories') },
    resetBookmarks: () => { w.callSync('resetBookmarks') },
    resetAdminData: () => { w.callSync('resetAdminData') },
    clearCachedAdminData: () => w.call<void>('clearCachedAdminData'),
    ensureLazyComponent: (name: string) => w.call('ensure', name),
    setRootError: (message: string) => { app.rootError = message },
    setLoginModalOpen: (open: boolean) => { app.loginModalOpen = open },
    setCurrentView: (view: AppView) => { app.currentView = view },
  }
}

const newAppVars = (): AppVars => ({ rootError: 'old', loginModalOpen: false, currentView: 'admin' })

// ---------------------------------------------------------------------------
// 新控制器接到世界上（接线方式与 App.svelte 相同）
// ---------------------------------------------------------------------------

function attachController(w: World): Impl {
  const app = newAppVars()
  let published: SettingsControllerState | null = null
  const deps: SettingsControllerDeps = {
    ...doubles(w, app),
    onChange: (next) => { published = next },
  }
  const controller = createSettingsController(deps)
  published = controller.getState()
  const impl: Impl = {
    submit: (p) => controller.submit(p),
    changePassword: (p) => controller.changePassword(p),
    exportData: (s) => controller.exportData(s),
    importData: (f, s, m) => controller.importData(f, s, m),
    reset: () => controller.reset(),
    // App 只通过 onChange 拿到状态；漏推送会让它与控制器内部状态不一致。
    read: () => {
      const state = published!
      expect(state).toEqual(controller.getState())
      return { ...state, importExport: { ...state.importExport }, ...app }
    },
  }
  w.impl = impl
  return impl
}

// ---------------------------------------------------------------------------
// 场景
// ---------------------------------------------------------------------------

interface Result { world: World; impl: Impl; settled: string[] }

interface Scenario {
  name: string
  legacyEquivalent?: boolean
  plan?: Plan
  drive: (impl: Impl, w: World, settled: string[]) => Promise<void>
  check?: (r: Result) => void
}

const calls = (w: World) => w.log.map(e => e.call)
const boom = new Error('boom')
const settingsForm = { site_title: 'New title' } as unknown as SettingsFormValue
const passwordReq = { old_password: 'a', new_password: 'b' } as unknown as ChangePasswordReq
const file = (name = 'backup.json') => ({ name }) as File
const selection = { categoryIds: [1] } as unknown as BackupSelectionInput

const scenarios: Scenario[] = [
  // --- 保存设置 ---
  {
    name: 'submit settings: saving while the request runs, applies locally, toasts, clears saving',
    drive: (impl, _w, s) => track(s, 'submit', impl.submit(settingsForm)),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual(['api.settings.update', 'applyLocalSettings', 'toast'])
      expect(world.log[0]).toMatchObject({ args: [settingsForm], state: { saving: true, error: '' } })
      expect(world.log[2].args).toEqual(['设置已保存', 'success'])
      expect(impl.read()).toMatchObject({ saving: false, error: '' })
    },
  },
  {
    name: 'submit settings failure: error shown, saving cleared, no toast',
    plan: { 'api.settings.update': [{ error: boom }] },
    drive: (impl, _w, s) => track(s, 'submit', impl.submit(settingsForm)),
    check: ({ impl, world, settled }) => {
      expect(settled).toEqual(['submit:ok'])
      expect(calls(world)).toEqual(['api.settings.update'])
      expect(impl.read()).toMatchObject({ saving: false, error: 'boom' })
    },
  },
  {
    name: 'submit settings when applying locally fails: error shown',
    plan: { applyLocalSettings: [{ error: new Error('local') }] },
    drive: (impl, _w, s) => track(s, 'submit', impl.submit(settingsForm)),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual(['api.settings.update', 'applyLocalSettings'])
      expect(impl.read()).toMatchObject({ saving: false, error: 'local' })
    },
  },
  {
    name: 'resubmit after a failure clears the previous error before the request',
    plan: { 'api.settings.update': [{ error: boom }] },
    drive: async (impl, _w, s) => {
      await track(s, 'first', impl.submit(settingsForm))
      await track(s, 'second', impl.submit(settingsForm))
    },
    check: ({ impl, world }) => {
      expect(world.log.filter(e => e.call === 'api.settings.update')[1].state).toMatchObject({ saving: true, error: '' })
      expect(impl.read().error).toBe('')
    },
  },
  {
    name: 'reset during a pending save: saving cleared and old errors cannot revive',
    // PROB-41 有意改变旧实现的迟到保存行为，其余用例仍与历史实现逐项对照。
    legacyEquivalent: false,
    plan: { 'api.settings.update': [{ defer: 'u' }] },
    drive: async (impl, w, s) => {
      const p = track(s, 'submit', impl.submit(settingsForm))
      await flush()
      impl.reset()
      expect(impl.read()).toMatchObject({ saving: false, error: '' })
      await w.release('u', { error: boom })
      await p
    },
    check: ({ impl }) => { expect(impl.read()).toMatchObject({ saving: false, error: '' }) },
  },
  {
    name: 'reset clears the settings error',
    plan: { 'api.settings.update': [{ error: boom }] },
    drive: async (impl, _w, s) => {
      await track(s, 'submit', impl.submit(settingsForm))
      impl.reset()
    },
    check: ({ impl }) => { expect(impl.read()).toMatchObject({ saving: false, error: '' }) },
  },

  // --- 修改密码 ---
  {
    name: 'change password: invalidates auth view, clears session and editors in order, then forces login',
    drive: (impl, _w, s) => track(s, 'pwd', impl.changePassword(passwordReq)),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual([
        'invalidateAuthView', 'api.auth.changePassword', 'setSession', 'resetCategories', 'resetBookmarks',
        'resetAdminData', 'clearCachedAdminData', 'ensure',
      ])
      expect(world.log[1].state).toMatchObject({ rootError: '' })
      expect(world.log.find(e => e.call === 'ensure')).toMatchObject({ args: ['LoginModal'], state: { rootError: '管理员密码已更新，请使用新密码重新登录。', loginModalOpen: false } })
      expect(impl.read()).toMatchObject({ loginModalOpen: true, currentView: 'login' })
    },
  },
  {
    name: 'change password resets the settings form between the category and bookmark resets',
    plan: { 'api.settings.update': [{ error: boom }] },
    drive: async (impl, _w, s) => {
      await track(s, 'submit', impl.submit(settingsForm))
      await track(s, 'pwd', impl.changePassword(passwordReq))
    },
    check: ({ world }) => {
      expect(world.log.find(e => e.call === 'resetCategories')!.state).toMatchObject({ error: 'boom' })
      expect(world.log.find(e => e.call === 'resetBookmarks')!.state).toMatchObject({ error: '' })
    },
  },
  {
    name: 'change password failure: rejects with the API error, nothing reset',
    plan: { 'api.auth.changePassword': [{ error: new Error('wrong password') }] },
    drive: (impl, _w, s) => track(s, 'pwd', impl.changePassword(passwordReq)),
    check: ({ impl, world, settled }) => {
      expect(settled).toEqual(['pwd:err:wrong password'])
      expect(calls(world)).toEqual(['invalidateAuthView', 'api.auth.changePassword'])
      expect(impl.read()).toMatchObject({ rootError: '', loginModalOpen: false, currentView: 'admin' })
    },
  },
  {
    name: 'change password when clearing the cache fails: rejects after the resets',
    plan: { clearCachedAdminData: [{ error: new Error('idb') }] },
    drive: (impl, _w, s) => track(s, 'pwd', impl.changePassword(passwordReq)),
    check: ({ impl, settled }) => {
      expect(settled).toEqual(['pwd:err:idb'])
      expect(impl.read()).toMatchObject({ rootError: '', loginModalOpen: false })
    },
  },
  {
    name: 'change password when the login chunk fails: rejects with the message shown',
    plan: { ensure: [{ error: new Error('chunk') }] },
    drive: (impl, _w, s) => track(s, 'pwd', impl.changePassword(passwordReq)),
    check: ({ impl, settled }) => {
      expect(settled).toEqual(['pwd:err:chunk'])
      expect(impl.read()).toMatchObject({ rootError: '管理员密码已更新，请使用新密码重新登录。', loginModalOpen: false, currentView: 'admin' })
    },
  },

  // --- 导出 ---
  {
    name: 'export: passes the current state and selection, publishes every state change',
    drive: (impl, _w, s) => track(s, 'export', impl.exportData(selection)),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual(['exportDataToFile', 'exportRun'])
      expect(world.log[1].state).toMatchObject({ importExport: { exporting: true } })
      expect(impl.read().importExport).toEqual({ importing: false, exporting: false, backupError: '', backupMessage: 'exported' })
    },
  },
  {
    name: 'export failure: backup error',
    plan: { exportRun: [{ error: boom }] },
    drive: (impl, _w, s) => track(s, 'export', impl.exportData(selection)),
    check: ({ impl }) => { expect(impl.read().importExport).toMatchObject({ exporting: false, backupError: 'boom', backupMessage: '' }) },
  },
  {
    name: 'second export while the first runs sees exporting=true and returns',
    plan: { exportRun: [{ defer: 'e' }] },
    drive: async (impl, w, s) => {
      const first = track(s, 'first', impl.exportData(selection))
      await flush()
      await track(s, 'second', impl.exportData(selection))
      await w.release('e', { value: 'done' })
      await first
    },
    check: ({ world, settled }) => {
      expect(settled).toEqual(['second:ok', 'first:ok'])
      expect(world.log.filter(e => e.call === 'exportDataToFile')[1].args[1]).toMatchObject({ exporting: true })
      expect(calls(world).filter(c => c === 'exportRun')).toHaveLength(1)
    },
  },
  {
    name: 'export after an import starts from the import result state',
    drive: async (impl, _w, s) => {
      await track(s, 'import', impl.importData(file(), 'cf-navs', 'merge'))
      await track(s, 'export', impl.exportData(selection))
    },
    check: ({ world }) => {
      expect(world.log.find(e => e.call === 'exportDataToFile')!.args[1]).toMatchObject({ backupMessage: 'imported 3' })
    },
  },

  // --- 导入 ---
  {
    name: 'import success: reads admin data, applies, persists, then refreshes',
    drive: (impl, _w, s) => track(s, 'import', impl.importData(file('a.json'), 'cf-navs', 'replace')),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual(['getAdminData', 'importDataFromFile', 'confirm', 'importRun', 'applyLoggedInData', 'persist', 'importToast', 'refreshAfterMutation'])
      expect(world.log[1].args.slice(0, 4)).toEqual(['a.json', 'cf-navs', 'replace', adminData(2)])
      expect(world.log.find(e => e.call === 'applyLoggedInData')!.args).toEqual([adminData(3)])
      expect(world.log.find(e => e.call === 'persist')!.args).toEqual([])
      expect(world.log.at(-1)!.state).toMatchObject({ importExport: { importing: false, backupMessage: 'imported 3' } })
      expect(impl.read().importExport).toMatchObject({ importing: false, backupError: '', backupMessage: 'imported 3' })
    },
  },
  {
    name: 'import cancelled: no refresh',
    plan: { confirm: [{ value: false }] },
    drive: (impl, _w, s) => track(s, 'import', impl.importData(file(), 'cf-navs', 'merge')),
    check: ({ world }) => { expect(calls(world)).toEqual(['getAdminData', 'importDataFromFile', 'confirm']) },
  },
  {
    name: 'import failure: backup error, no refresh',
    plan: { importRun: [{ error: boom }] },
    drive: (impl, _w, s) => track(s, 'import', impl.importData(file(), 'cf-navs', 'merge')),
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('refreshAfterMutation')
      expect(impl.read().importExport).toMatchObject({ importing: false, backupError: 'boom', backupMessage: '' })
    },
  },
  {
    name: 'import when persisting fails: backup error, no refresh',
    plan: { persist: [{ error: new Error('quota') }] },
    drive: (impl, _w, s) => track(s, 'import', impl.importData(file(), 'cf-navs', 'merge')),
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('refreshAfterMutation')
      expect(impl.read().importExport.backupError).toBe('quota')
    },
  },
  {
    name: 'import refresh failure propagates to the caller',
    plan: { refreshAfterMutation: [{ error: new Error('refresh') }] },
    drive: (impl, _w, s) => track(s, 'import', impl.importData(file(), 'cf-navs', 'merge')),
    check: ({ settled }) => { expect(settled).toEqual(['import:err:refresh']) },
  },
  {
    name: 'cancelled import after a successful export clears the old message and does not refresh',
    plan: { confirm: [{ value: false }] },
    drive: async (impl, _w, s) => {
      await track(s, 'export', impl.exportData(selection))
      await track(s, 'import', impl.importData(file(), 'cf-navs', 'merge'))
    },
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('refreshAfterMutation')
      expect(impl.read().importExport.backupMessage).toBe('')
    },
  },
  {
    name: 'import that fails after the success message (toast throws): both set, no refresh',
    plan: { importToast: [{ error: new Error('toast') }] },
    drive: (impl, _w, s) => track(s, 'import', impl.importData(file(), 'cf-navs', 'merge')),
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('refreshAfterMutation')
      expect(impl.read().importExport).toMatchObject({ backupError: 'toast', backupMessage: 'imported 3' })
    },
  },
  {
    name: 'import reads admin data at call time',
    plan: { importRun: [{ value: adminData(1), effect: (w) => { (w as World).data = adminData(5) } }] },
    drive: async (impl, _w, s) => {
      await track(s, 'first', impl.importData(file(), 'cf-navs', 'merge'))
      await track(s, 'second', impl.importData(file(), 'cf-navs', 'merge'))
    },
    check: ({ world }) => {
      const imports = world.log.filter(e => e.call === 'importDataFromFile')
      expect(imports[0].args[3]).toEqual(adminData(2))
      expect(imports[1].args[3]).toEqual(adminData(5))
    },
  },
]

function runScenario(sc: Scenario, attach: (w: World) => Impl): Promise<Result> {
  const world = new World(sc.plan ?? {})
  activeWorld = world
  const impl = attach(world)
  const settled: string[] = []
  return sc.drive(impl, world, settled).then(async () => {
    await flush()
    activeWorld = null
    return { world, impl, settled }
  })
}

describe('app settings controller', () => {
  for (const sc of scenarios) {
    it(sc.name, async () => {
      const ours = await runScenario(sc, attachController)
      if (sc.legacyEquivalent !== false) {
        const legacy = await runScenario(sc, attachLegacy)
        expect(ours.world.log).toEqual(legacy.world.log)
        expect(ours.impl.read()).toEqual(legacy.impl.read())
        expect(ours.settled).toEqual(legacy.settled)
      }
      expect(ours.world.gates.size).toBe(0)
      sc.check?.(ours)
    })
  }

  it('publishes a snapshot after every change and keeps the import/export state identity otherwise', async () => {
    const world = new World({})
    activeWorld = world
    attachController(world)
    const states: SettingsControllerState[] = []
    const controller = createSettingsController({ ...doubles(world, newAppVars()), onChange: (s) => states.push(s) })
    const initial = controller.getState()
    expect(initial).toEqual({ saving: false, error: '', importExport: createImportExportState() })
    await controller.submit(settingsForm)
    controller.reset()
    expect(states.map(s => s.saving)).toEqual([true, false, false])
    expect(states.every(s => s.importExport === initial.importExport)).toBe(true)
    await controller.exportData(selection)
    // 导出：开始 / 成功 / 收尾各推送一份新的副本。
    expect(states.slice(3).map(s => s.importExport.exporting)).toEqual([true, true, false])
    expect(new Set(states.slice(3).map(s => s.importExport)).size).toBe(3)
  })

  it('publishes the error before clearing saving when a save fails', async () => {
    const world = new World({ 'api.settings.update': [{ error: boom }] })
    activeWorld = world
    attachController(world)
    const states: SettingsControllerState[] = []
    const controller = createSettingsController({ ...doubles(world, newAppVars()), onChange: (s) => states.push(s) })
    await controller.submit(settingsForm)
    expect(states.map(s => [s.saving, s.error])).toEqual([[true, ''], [true, 'boom'], [false, 'boom']])
  })

  it('App wires the settings handlers through the controller', () => {
    const app = readFileSync('src/App.svelte', 'utf8')
    expect(app).toContain('createSettingsController(')
    expect(app).toContain('onSubmitSettings={settingsController.submit}')
    expect(app).toContain('onChangePassword={settingsController.changePassword}')
    expect(app).toContain('onExportData={settingsController.exportData}')
    expect(app).toContain('onImportData={settingsController.importData}')
    expect(app).not.toMatch(/function handle(SubmitSettings|ChangePassword|ExportData|ImportData)\b/)
  })
})

// ---------------------------------------------------------------------------
// legacy：逐字复刻拆分前 App.svelte（HEAD 5629c0e）的设置 / 改密 / 导入导出代码。
// 仅做机械替换：App 作用域变量 → `app.xxx`，模块级依赖 → 世界替身
// （api / lazyComponents / requestConfirmation / applyLocalSettings / applyLoggedInData / persistCurrentAdminData /
// refreshAdminDataAfterMutation / clearCachedAdminData → 同名替身；`authStore.setSession` → setSession，
// `categoryController.reset()` / `bookmarkController.reset()` / `adminStore.reset()` → resetCategories /
// resetBookmarks / resetAdminData，`adminData` → getAdminData()），控制流与语句顺序不变。
// ---------------------------------------------------------------------------

function attachLegacy(w: World): Impl {
  const vars = newAppVars()
  const d = doubles(w, vars)
  const app = {
    get rootError() { return vars.rootError },
    set rootError(v: string) { vars.rootError = v },
    get loginModalOpen() { return vars.loginModalOpen },
    set loginModalOpen(v: boolean) { vars.loginModalOpen = v },
    get currentView() { return vars.currentView },
    set currentView(v: AppView) { vars.currentView = v },
    savingSettings: false,
    settingsError: '',
    importExportState: createImportExportState(),
  }
  const api = d.api
  const lazyComponents = { ensure: d.ensureLazyComponent }
  const authViewIntent = d.authViewIntent
  const authStore = { setSession: d.setSession }
  const categoryController = { reset: d.resetCategories }
  const bookmarkController = { reset: d.resetBookmarks }
  const adminStore = { reset: d.resetAdminData }
  const {
    requestConfirmation,
    applyLocalSettings,
    applyLoggedInData,
    persistCurrentAdminData,
    refreshAdminDataAfterMutation,
    clearCachedAdminData,
  } = d
  type SettingsSubset = SettingsFormValue

  function resetSettingsState(): void {
    app.settingsError = ''
    app.savingSettings = false
  }

  async function handleSubmitSettings(payload: SettingsSubset): Promise<void> {
    app.savingSettings = true
    app.settingsError = ''

    await runAdminMutation({
      run: () => api.settings.update(payload),
      onSuccess: (settings) => applyLocalSettings(settings),
      successMessage: () => '设置已保存',
      onError: (message) => {
        app.settingsError = message
      },
      onSettled: () => {
        app.savingSettings = false
      },
    })
  }

  async function handleChangePassword(payload: ChangePasswordReq): Promise<void> {
    authViewIntent.invalidate()
    app.rootError = ''

    await api.auth.changePassword(payload)
    authStore.setSession(null)
    categoryController.reset()
    resetSettingsState()
    bookmarkController.reset()
    adminStore.reset()
    await clearCachedAdminData()
    app.rootError = '管理员密码已更新，请使用新密码重新登录。'
    await lazyComponents.ensure('LoginModal')
    app.loginModalOpen = true
    app.currentView = 'login'
  }

  async function handleExportData(selection: BackupSelectionInput): Promise<void> {
    await exportDataToFile(app.importExportState, selection, (next) => {
      app.importExportState = next
    })
  }

  async function handleImportData(file: File, source: ImportSource, mode: 'replace' | 'merge'): Promise<void> {
    await importDataFromFile(app.importExportState, file, source, mode, {
      adminData: d.getAdminData(),
      requestConfirmation,
      applyLoggedInData: (data) => applyLoggedInData(data),
      persistCurrentAdminData,
      onStateChange: (next) => {
        app.importExportState = next
      },
    })
    if (!app.importExportState.backupError && app.importExportState.backupMessage) {
      await refreshAdminDataAfterMutation()
    }
  }

  const impl: Impl = {
    submit: handleSubmitSettings,
    changePassword: handleChangePassword,
    exportData: handleExportData,
    importData: handleImportData,
    reset: resetSettingsState,
    read: () => ({
      saving: app.savingSettings,
      error: app.settingsError,
      importExport: { ...app.importExportState },
      rootError: app.rootError,
      loginModalOpen: app.loginModalOpen,
      currentView: app.currentView,
    }),
  }
  w.impl = impl
  return impl
}
