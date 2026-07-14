import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('admin settings layout', () => {
  it('aligns the settings panel with category and bookmark content', () => {
    const source = readFileSync('src/components/admin/AdminTabContent.svelte', 'utf8')
    const settingsRule = source.match(/\.settings-panel-wrap\s*\{([^}]+)\}/)?.[1] ?? ''

    expect(settingsRule).toContain('width: 100%')
    expect(settingsRule).toContain('margin: 0 0 24px')
    expect(settingsRule).not.toContain('margin: 0 auto')
  })

  it('associates the public mode label with its checkbox', () => {
    const source = readFileSync('src/components/settings/BasicSettingsSection.svelte', 'utf8')

    expect(source).toContain('<label class="toggle-copy" for="settings-public-mode">')
    expect(source).toContain('id="settings-public-mode"')
    expect(source).toContain('on:change={() => void syncForm()}')
  })

  it('provides navigation position and persistent-left controls', () => {
    const source = readFileSync('src/components/settings/NavigationSettingsSection.svelte', 'utf8')
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')

    expect(panel).toContain('<NavigationSettingsSection bind:form {saving} />')
    expect(source).toContain('bind:group={form.navigation.position}')
    expect(source).toContain('bind:checked={form.navigation.always_expanded}')
    expect(source).toContain("disabled={saving || form.navigation.position !== 'left'}")
  })
})
