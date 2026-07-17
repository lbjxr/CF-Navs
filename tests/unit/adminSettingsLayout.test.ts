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

  it('groups settings sections behind a secondary settings menu', () => {
    const panel = readFileSync('src/components/SettingsPanel.svelte', 'utf8')

    const sectionOrder = [
      '<BasicSettingsSection',
      '<BackgroundSettingsSection',
      '<NavigationSettingsSection',
      '<HeroSettingsSection',
      '<CardSettingsSection',
      '<SearchEngineSettingsSection',
      '<FooterSettingsSection',
      '<PasswordChangePanel',
    ]
    const positions = sectionOrder.map((marker) => panel.indexOf(marker))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(new Set(positions).size).toBe(sectionOrder.length)

    expect(panel).toContain("{ id: 'appearance', label: '外观与卡片'")
    expect(panel).toContain('class="settings-submenu"')
    expect(panel).not.toContain('group::before')
  })

  it('keeps content layout fields in the layout section and search toggles in the hero section', () => {
    const layout = readFileSync('src/components/settings/NavigationSettingsSection.svelte', 'utf8')
    const hero = readFileSync('src/components/settings/HeroSettingsSection.svelte', 'utf8')
    const card = readFileSync('src/components/settings/CardSettingsSection.svelte', 'utf8')
    const search = readFileSync('src/components/settings/SearchEngineSettingsSection.svelte', 'utf8')
    const appearance = readFileSync('src/components/settings/BackgroundSettingsSection.svelte', 'utf8')

    expect(layout).toContain('bind:value={form.content_layout.max_width}')
    expect(card).not.toContain('form.content_layout')
    expect(hero).toContain('bind:checked={form.search_box_show}')
    expect(hero).toContain('bind:checked={form.search_engine_selector_show}')
    expect(search).not.toContain('form.search_box_show')
    expect(appearance).toContain('bind:group={form.theme}')
  })

  it('reuses favicon.im for search engine icons', () => {
    const search = readFileSync('src/components/settings/SearchEngineSettingsSection.svelte', 'utf8')

    expect(search).toContain("import { faviconImIcon } from '../../lib/icons'")
    expect(search).toContain('engine.icon = icon')
    expect(search).toContain('Favicon.im')
    expect(search).toContain('搜索引擎图标预览')
  })
})
