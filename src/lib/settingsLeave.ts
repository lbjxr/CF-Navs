import type { SettingsFormValue } from './appData'

export type SettingsSubmitHandler = (payload: SettingsFormValue) => boolean | void | Promise<boolean | void>
export type SettingsLeaveChoice = 'save' | 'discard' | 'stay'
export type SettingsLeaveAction = SettingsLeaveChoice | 'blocked'

export interface SettingsLeaveState {
  dirty: boolean
  saving: boolean
  canSave: boolean
}

export interface SettingsSaveOutcome {
  saved: boolean
  error: string
}

// 表单与 baseline 只由 SettingsPanel 修改；导航层只读取状态、请求保存。
export interface SettingsLeaveGuard {
  getState: () => SettingsLeaveState
  save: () => Promise<SettingsSaveOutcome>
  discard: () => void
}

export type RegisterSettingsLeaveGuard = (guard: SettingsLeaveGuard | null) => void

export function needsSettingsLeaveConfirmation(state: SettingsLeaveState): boolean {
  return state.dirty || state.saving
}

export function resolveSettingsLeaveAction(choice: SettingsLeaveChoice, state: SettingsLeaveState): SettingsLeaveAction {
  if (state.saving) return 'blocked'
  if (choice === 'save' && !state.canSave) return 'blocked'
  return choice
}

// boolean ack 来自持久化流程；旧 void 回调只有实际 value 已确认该快照时才视为成功。
export function isSettingsSaveAcknowledged(
  ack: boolean | void,
  error: string,
  submittedKey: string,
  currentValueKey: string,
): boolean {
  return !error && ack !== false && submittedKey === currentValueKey
}

export function canFinishSettingsLeave(outcome: SettingsSaveOutcome, state: SettingsLeaveState): boolean {
  return outcome.saved && !state.dirty && !state.saving
}
