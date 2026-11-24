import { describe, expect, it } from 'vitest'
import {
  canFinishSettingsLeave,
  isSettingsSaveAcknowledged,
  needsSettingsLeaveConfirmation,
  resolveSettingsLeaveAction,
  type SettingsLeaveState,
} from '../../src/lib/settingsLeave'

const clean: SettingsLeaveState = { dirty: false, saving: false, canSave: false }
const edited: SettingsLeaveState = { dirty: true, saving: false, canSave: true }

describe('settings leave decisions', () => {
  it('requires a decision for an edited or still-saving form, but not a clean form', () => {
    expect(needsSettingsLeaveConfirmation(clean)).toBe(false)
    expect(needsSettingsLeaveConfirmation(edited)).toBe(true)
    expect(needsSettingsLeaveConfirmation({ ...clean, saving: true })).toBe(true)
  })

  it('blocks all decisions while saving and only blocks save for an invalid form', () => {
    for (const choice of ['save', 'discard', 'stay'] as const) {
      expect(resolveSettingsLeaveAction(choice, { ...edited, saving: true })).toBe('blocked')
      expect(resolveSettingsLeaveAction(choice, edited)).toBe(choice)
    }
    expect(resolveSettingsLeaveAction('save', { ...edited, canSave: false })).toBe('blocked')
    expect(resolveSettingsLeaveAction('discard', { ...edited, canSave: false })).toBe('discard')
  })

  it('requires acknowledgement of the actual submitted value and never mistakes false or errors for success', () => {
    expect(isSettingsSaveAcknowledged(true, '', 'submitted', 'submitted')).toBe(true)
    expect(isSettingsSaveAcknowledged(undefined, '', 'submitted', 'submitted')).toBe(true)
    expect(isSettingsSaveAcknowledged(false, '', 'submitted', 'submitted')).toBe(false)
    expect(isSettingsSaveAcknowledged(true, 'persistence failed', 'submitted', 'submitted')).toBe(false)
    expect(isSettingsSaveAcknowledged(true, '', 'submitted', 'previous')).toBe(false)
    expect(isSettingsSaveAcknowledged(undefined, '', 'submitted', 'previous')).toBe(false)
  })

  it('allows navigation only after a successful save with no later edits or pending work', () => {
    expect(canFinishSettingsLeave({ saved: true, error: '' }, clean)).toBe(true)
    expect(canFinishSettingsLeave({ saved: false, error: 'failed' }, clean)).toBe(false)
    expect(canFinishSettingsLeave({ saved: true, error: '' }, edited)).toBe(false)
    expect(canFinishSettingsLeave({ saved: true, error: '' }, { ...clean, saving: true })).toBe(false)
  })
})
