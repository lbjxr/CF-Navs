import { describe, expect, it } from 'vitest'
import { getNextThemePreference, resolveAppThemeState } from '../../../src/lib/appThemeState'

describe('app theme state helpers', () => {
  it('uses the configured theme when there is no preferred override', () => {
    expect(resolveAppThemeState({
      preferredThemeMode: null,
      configuredThemeMode: 'dark',
      systemPrefersDark: false,
    })).toEqual({
      configuredThemeMode: 'dark',
      themeMode: 'dark',
      activeTheme: 'dark',
    })
  })

  it('lets preferred theme override configured theme', () => {
    expect(resolveAppThemeState({
      preferredThemeMode: 'light',
      configuredThemeMode: 'dark',
      systemPrefersDark: true,
    })).toMatchObject({
      themeMode: 'light',
      activeTheme: 'light',
    })
  })

  it('resolves auto mode from the system preference', () => {
    expect(resolveAppThemeState({
      preferredThemeMode: null,
      configuredThemeMode: 'auto',
      systemPrefersDark: true,
    }).activeTheme).toBe('dark')

    expect(resolveAppThemeState({
      preferredThemeMode: null,
      configuredThemeMode: undefined,
      systemPrefersDark: false,
    })).toEqual({
      configuredThemeMode: 'auto',
      themeMode: 'auto',
      activeTheme: 'light',
    })
  })

  it('cycles through explicit light, explicit dark, and system theme preferences', () => {
    expect(getNextThemePreference('light')).toBe('dark')
    expect(getNextThemePreference('dark')).toBe('auto')
    expect(getNextThemePreference('auto')).toBe('light')
  })
})
